

/* -------------------------------------------- */
/*  HTML Template Loading                       */
/* -------------------------------------------- */

// Global template cache
_templateCache = {};

/**
 * Get a template from the server by fetch request and caching the retrieved result
 * @param {string} path           The web-accessible HTML template URL
 * @param {string} [id]           An ID to register the partial with.
 * @returns {Promise<Function>}   A Promise which resolves to the compiled Handlebars template
 */
async function getTemplate(path, id) {
  if ( !_templateCache.hasOwnProperty(path) ) {
    await new Promise((resolve, reject) => {
      game.socket.emit("template", path, resp => {
        if ( resp.error ) return reject(new Error(resp.error));
        const compiled = Handlebars.compile(resp.html);
        Handlebars.registerPartial(id ?? path, compiled);
        _templateCache[path] = compiled;
        console.log(`Foundry VTT | Retrieved and compiled template ${path}`);
        resolve(compiled);
      });
    });
  }
  return _templateCache[path];
}

/* -------------------------------------------- */

/**
 * Load and cache a set of templates by providing an Array of paths
 * @param {string[]|Object<string>} paths  An array of template file paths to load, or an object of Handlebars partial
 *                                         IDs to paths.
 * @returns {Promise<Function[]>}
 *
 * @example Loading a list of templates.
 * ```js
 * await loadTemplates(["templates/apps/foo.html", "templates/apps/bar.html"]);
 * ```
 * ```hbs
 * <!-- Include a pre-loaded template as a partial -->
 * {{> "templates/apps/foo.html" }}
 * ```
 *
 * @example Loading an object of templates.
 * ```js
 * await loadTemplates({
 *   foo: "templates/apps/foo.html",
 *   bar: "templates/apps/bar.html"
 * });
 * ```
 * ```hbs
 * <!-- Include a pre-loaded template as a partial -->
 * {{> foo }}
 * ```
 */
async function loadTemplates(paths) {
  let promises;
  if ( foundry.utils.getType(paths) === "Object" ) promises = Object.entries(paths).map(([k, p]) => getTemplate(p, k));
  else promises = paths.map(p => getTemplate(p));
  return Promise.all(promises);
}

/* -------------------------------------------- */


/**
 * Get and render a template using provided data and handle the returned HTML
 * Support asynchronous file template file loading with a client-side caching layer
 *
 * Allow resolution of prototype methods and properties since this all occurs within the safety of the client.
 * @see {@link https://handlebarsjs.com/api-reference/runtime-options.html#options-to-control-prototype-access}
 *
 * @param {string} path             The file path to the target HTML template
 * @param {Object} data             A data object against which to compile the template
 *
 * @returns {Promise<string>}        Returns the compiled and rendered template as a string
 */
async function renderTemplate(path, data) {
  const template = await getTemplate(path);
  return template(data || {}, {
    allowProtoMethodsByDefault: true,
    allowProtoPropertiesByDefault: true
  });
}


/* -------------------------------------------- */
/*  Handlebars Template Helpers                 */
/* -------------------------------------------- */

// Register Handlebars Extensions
HandlebarsIntl.registerWith(Handlebars);

/**
 * A collection of Handlebars template helpers which can be used within HTML templates.
 */
class HandlebarsHelpers {

  /**
   * For checkboxes, if the value of the checkbox is true, add the "checked" property, otherwise add nothing.
   * @returns {string}
   *
   * @example
   * ```hbs
   * <label>My Checkbox</label>
   * <input type="checkbox" name="myCheckbox" {{checked myCheckbox}}>
   * ```
   */
  static checked(value) {
    return Boolean(value) ? "checked" : "";
  }

  /* -------------------------------------------- */

  /**
   * For use in form inputs. If the supplied value is truthy, add the "disabled" property, otherwise add nothing.
   * @returns {string}
   *
   * @example
   * ```hbs
   * <button type="submit" {{disabled myValue}}>Submit</button>
   * ```
   */
  static disabled(value) {
    return value ? "disabled" : "";
  }

  /* -------------------------------------------- */

  /**
   * Concatenate a number of string terms into a single string.
   * This is useful for passing arguments with variable names.
   * @param {string[]} values             The values to concatenate
   * @returns {Handlebars.SafeString}
   *
   * @example Concatenate several string parts to create a dynamic variable
   * ```hbs
   * {{filePicker target=(concat "faces." i ".img") type="image"}}
   * ```
   */
  static concat(...values) {
    const options = values.pop();
    const join = options.hash?.join || "";
    return new Handlebars.SafeString(values.join(join));
  }

  /* -------------------------------------------- */

  /**
   * Render a pair of inputs for selecting a color.
   * @param {object} options              Helper options
   * @param {string} [options.name]       The name of the field to create
   * @param {string} [options.value]      The current color value
   * @param {string} [options.default]    A default color string if a value is not provided
   * @returns {Handlebars.SafeString}
   *
   * @example
   * ```hbs
   * {{colorPicker name="myColor" value=myColor default="#000000"}}
   * ```
   */
  static colorPicker(options) {
    let {name, value} = options.hash;
    name = name || "color";
    value = value || "";
    const safeValue = Color.from(value || options.hash.default || "#000000").css;
    const html =
    `<input class="color" type="text" name="${name}" value="${value}"/>
    <input type="color" value="${safeValue}" data-edit="${name}"/>`;
    return new Handlebars.SafeString(html);
  }

  /* -------------------------------------------- */
  /**
   * @typedef {object} TextEditorOptions
   * @property {string} [target]             The named target data element
   * @property {boolean} [button]            Include a button used to activate the editor later?
   * @property {string} [class]              A specific CSS class to add to the editor container
   * @property {boolean} [editable=true]     Is the text editor area currently editable?
   * @property {string} [engine=tinymce]     The editor engine to use, see {@link TextEditor.create}.
   * @property {boolean} [collaborate=false] Whether to turn on collaborative editing features for ProseMirror.
   *
   * The below options are deprecated since v10 and should be avoided.
   * @property {boolean} [owner]             Is the current user an owner of the data?
   * @property {boolean} [documents=true]    Replace dynamic document links?
   * @property {Object|Function} [rollData]  The data object providing context for inline rolls
   * @property {string} [content=""]         The original HTML content as a string
   */

  /**
   * Construct an editor element for rich text editing with TinyMCE or ProseMirror.
   * @param {[string, TextEditorOptions]} args  The content to display and edit, followed by handlebars options.
   * @returns {Handlebars.SafeString}
   *
   * @example
   * ```hbs
   * {{editor world.description target="description" button=false engine="prosemirror" collaborate=false}}
   * ```
   */
  static editor(...args) {
    const options = args.pop();
    let content = args.pop() ?? "";
    const target = options.hash.target;
    if ( !target ) throw new Error("You must define the name of a target field.");
    const button = Boolean(options.hash.button);
    const editable = "editable" in options.hash ? Boolean(options.hash.editable) : true;

    /**
     * @deprecated since v10
     */
    if ( "content" in options.hash ) {
      foundry.utils.logCompatibilityWarning("The content option for the editor handlebars helper has been deprecated. "
        + "Please pass the content in as the first option to the helper and ensure it has already been enriched by "
        + "TextEditor.enrichHTML if necessary", {since: 10, until: 12});
      // Enrich the content
      const documents = options.hash.documents !== false;
      const owner = Boolean(options.hash.owner);
      const rollData = options.hash.rollData;
      content = TextEditor.enrichHTML(options.hash.content, {secrets: owner, documents, rollData, async: false});
    }

    // Construct the HTML
    const editorClasses = ["editor-content", options.hash.class ?? null].filterJoin(" ");
    let editorHTML = '<div class="editor">';
    if ( button && editable ) editorHTML += '<a class="editor-edit"><i class="fas fa-edit"></i></a>';
    let dataset = {
      engine: options.hash.engine || "tinymce",
      collaborate: !!options.hash.collaborate
    };
    if ( editable ) dataset.edit = target;
    dataset = Object.entries(dataset).map(([k, v]) => `data-${k}="${v}"`).join(" ");
    editorHTML += `<div class="${editorClasses}" ${dataset}>${content}</div></div>`;
    return new Handlebars.SafeString(editorHTML);
  }

  /* -------------------------------------------- */

  /**
   * Render a file-picker button linked to an `<input>` field
   * @param {object} options              Helper options
   * @param {string} [options.type]       The type of FilePicker instance to display
   * @param {string} [options.target]     The field name in the target data
   * @returns {Handlebars.SafeString|string}
   *
   * @example
   * ```hbs
   * {{filePicker type="image" target="img"}}
   * ```
   */
  static filePicker(options) {
    const type = options.hash.type;
    const target = options.hash.target;
    if ( !target ) throw new Error("You must define the name of the target field.");

    // Do not display the button for users who do not have browse permission
    if ( game.world && !game.user.can("FILES_BROWSE" ) ) return "";

    // Construct the HTML
    const tooltip = game.i18n.localize("FILES.BrowseTooltip");
    return new Handlebars.SafeString(`
    <button type="button" class="file-picker" data-type="${type}" data-target="${target}" title="${tooltip}" tabindex="-1">
        <i class="fas fa-file-import fa-fw"></i>
    </button>`);
  }

  /* -------------------------------------------- */

  /**
   * A ternary expression that allows inserting A or B depending on the value of C.
   * @param {boolean} criteria    The test criteria
   * @param {string} ifTrue       The string to output if true
   * @param {string} ifFalse      The string to output if false
   * @returns {string}            The ternary result
   *
   * @example Ternary if-then template usage
   * ```hbs
   * {{ifThen true "It is true" "It is false"}}
   * ```
   */
  static ifThen(criteria, ifTrue, ifFalse) {
    return criteria ? ifTrue : ifFalse;
  }

  /* -------------------------------------------- */

  /**
   * Translate a provided string key by using the loaded dictionary of localization strings.
   * @returns {string}
   *
   * @example Translate a provided localization string, optionally including formatting parameters
   * ```hbs
   * <label>{{localize "ACTOR.Create"}}</label> <!-- "Create Actor" -->
   * <label>{{localize "CHAT.InvalidCommand" command=foo}}</label> <!-- "foo is not a valid chat message command." -->
   * ```
   */
  static localize(value, options) {
    if ( value instanceof Handlebars.SafeString ) value = value.toString();
    const data = options.hash;
    return foundry.utils.isEmpty(data) ? game.i18n.localize(value) : game.i18n.format(value, data);
  }

  /* -------------------------------------------- */

  /**
   * A string formatting helper to display a number with a certain fixed number of decimals and an explicit sign.
   * @param {number} value              A numeric value to format
   * @param {object} options            Additional options which customize the resulting format
   * @param {number} [options.decimals=0]   The number of decimal places to include in the resulting string
   * @param {boolean} [options.sign=false]  Whether to include an explicit "+" sign for positive numbers   *
   * @returns {Handlebars.SafeString}   The formatted string to be included in a template
   *
   * @example
   * ```hbs
   * {{formatNumber 5.5}} <!-- 5.5 -->
   * {{formatNumber 5.5 decimals=2}} <!-- 5.50 -->
   * {{formatNumber 5.5 decimals=2 sign=true}} <!-- +5.50 -->
  *  ```
   */
  static numberFormat(value, options) {
    const dec = options.hash['decimals'] ?? 0;
    const sign = options.hash['sign'] || false;
    value = parseFloat(value).toFixed(dec);
    if (sign ) return ( value >= 0 ) ? "+"+value : value;
    return value;
  }

  /* --------------------------------------------- */

  /**
   * Render a form input field of type number with value appropriately rounded to step size.
   * @returns {Handlebars.SafeString}
   *
   * @example
   * ```hbs
   * {{numberInput value name="numberField" step=1 min=0 max=10}}
   * ```
   */
  static numberInput(value, options) {
    const properties = [];
    for ( let k of ["class", "name", "placeholder", "min", "max"] ) {
      if ( k in options.hash ) properties.push(`${k}="${options.hash[k]}"`);
    }
    const step = options.hash.step ?? "any";
    properties.unshift(`step="${step}"`);
    if ( options.hash.disabled === true ) properties.push("disabled");
    if ( options.hash.readonly === true ) properties.push("readonly");
    let safe = Number.isNumeric(value) ? Number(value) : "";
    if ( Number.isNumeric(step) && (typeof safe === "number") ) safe = safe.toNearest(Number(step));
    return new Handlebars.SafeString(`<input type="number" value="${safe}" ${properties.join(" ")}>`);
  }

  /* -------------------------------------------- */

  /**
   * A helper to create a set of radio checkbox input elements in a named set.
   * The provided keys are the possible radio values while the provided values are human readable labels.
   *
   * @param {string} name         The radio checkbox field name
   * @param {object} choices      A mapping of radio checkbox values to human readable labels
   * @param {object} options      Options which customize the radio boxes creation
   * @param {string} options.checked    Which key is currently checked?
   * @param {boolean} options.localize  Pass each label through string localization?
   * @returns {Handlebars.SafeString}
   *
   * @example The provided input data
   * ```js
   * let groupName = "importantChoice";
   * let choices = {a: "Choice A", b: "Choice B"};
   * let chosen = "a";
   * ```
   *
   * @example The template HTML structure
   * ```hbs
   * <div class="form-group">
   *   <label>Radio Group Label</label>
   *   <div class="form-fields">
   *     {{radioBoxes groupName choices checked=chosen localize=true}}
   *   </div>
   * </div>
   * ```
   */
  static radioBoxes(name, choices, options) {
    const checked = options.hash['checked'] || null;
    const localize = options.hash['localize'] || false;
    let html = "";
    for ( let [key, label] of Object.entries(choices) ) {
      if ( localize ) label = game.i18n.localize(label);
      const isChecked = checked === key;
      html += `<label class="checkbox"><input type="radio" name="${name}" value="${key}" ${isChecked ? "checked" : ""}> ${label}</label>`;
    }
    return new Handlebars.SafeString(html);
  }

  /* -------------------------------------------- */

  /**
   * Render a pair of inputs for selecting a value in a range.
   * @param {object} options            Helper options
   * @param {string} [options.name]     The name of the field to create
   * @param {number} [options.value]    The current range value
   * @param {number} [options.min]      The minimum allowed value
   * @param {number} [options.max]      The maximum allowed value
   * @param {number} [options.step]     The allowed step size
   * @returns {Handlebars.SafeString}
   *
   * @example
   * ```hbs
   * {{rangePicker name="foo" value=bar min=0 max=10 step=1}}
   * ```
   */
  static rangePicker(options) {
    let {name, value, min, max, step} = options.hash;
    name = name || "range";
    value = value ?? "";
    if ( Number.isNaN(value) ) value = "";
    const html =
    `<input type="range" name="${name}" value="${value}" min="${min}" max="${max}" step="${step}"/>
     <span class="range-value">${value}</span>`;
    return new Handlebars.SafeString(html);
  }

  /* -------------------------------------------- */

  /**
  * A helper to assign an `<option>` within a `<select>` block as selected based on its value
  * Escape the string as handlebars would, then escape any regexp characters in it
  * @param {string} value    The value of the option
  * @returns {Handlebars.SafeString}
   *
   * @example
   * ```hbs
   * <select>
   * {{#select selected}}
   *   <option value="a">Choice A</option>
   *   <option value="b">Choice B</option>
   * {{/select}}
   * </select>
  */
  static select(selected, options) {
    const escapedValue = RegExp.escape(Handlebars.escapeExpression(selected));
    const rgx = new RegExp(' value=[\"\']' + escapedValue + '[\"\']');
    const html = options.fn(this);
    return html.replace(rgx, "$& selected");
  }

  /* -------------------------------------------- */

  /**
   * A helper to create a set of &lt;option> elements in a &lt;select> block based on a provided dictionary.
   * The provided keys are the option values while the provided values are human readable labels.
   * This helper supports both single-select as well as multi-select input fields.
   *
   * @param {object|Array<object>>} choices      A mapping of radio checkbox values to human-readable labels
   * @param {object} options                     Helper options
   * @param {string|string[]} [options.selected] Which key or array of keys that are currently selected?
   * @param {boolean} [options.localize=false]   Pass each label through string localization?
   * @param {string} [options.blank]             Add a blank option as the first option with this label
   * @param {boolean} [options.sort]             Sort the options by their label after localization
   * @param {string} [options.nameAttr]          Look up a property in the choice object values to use as the option value
   * @param {string} [options.labelAttr]         Look up a property in the choice object values to use as the option label
   * @param {boolean} [options.inverted=false]   Use the choice object value as the option value, and the key as the label
   *                                             instead of vice-versa
   * @returns {Handlebars.SafeString}
   *
   * @example The provided input data
   * ```js
   * let choices = {a: "Choice A", b: "Choice B"};
   * let value = "a";
   * ```
   * The template HTML structure
   * ```hbs
   * <select name="importantChoice">
   *   {{selectOptions choices selected=value localize=true}}
   * </select>
   * ```
   * The resulting HTML
   * ```html
   * <select name="importantChoice">
   *   <option value="a" selected>Choice A</option>
   *   <option value="b">Choice B</option>
   * </select>
   * ```
   *
   * @example Using inverted choices
   * ```js
   * let choices = {"Choice A": "a", "Choice B": "b"};
   * let value = "a";
   * ```
   *  The template HTML structure
   *  ```hbs
   * <select name="importantChoice">
   *   {{selectOptions choices selected=value inverted=true}}
   * </select>
   * ```
   *
   * @example Using nameAttr and labelAttr with objects
   * ```js
   * let choices = {foo: {key: "a", label: "Choice A"}, bar: {key: "b", label: "Choice B"}};
   * let value = "b";
   * ```
   * The template HTML structure
   * ```hbs
   * <select name="importantChoice">
   *   {{selectOptions choices selected=value nameAttr="key" labelAttr="label"}}
   * </select>
   * ```
   *
   * @example Using nameAttr and labelAttr with arrays
   * ```js
   * let choices = [{key: "a", label: "Choice A"}, {key: "b", label: "Choice B"}];
   * let value = "b";
   * ```
   * The template HTML structure
   * ```hbs
   * <select name="importantChoice">
   *   {{selectOptions choices selected=value nameAttr="key" labelAttr="label"}}
   * </select>
   * ```
   */
  static selectOptions(choices, options) {
    let {localize=false, selected=null, blank=null, sort=false, nameAttr, labelAttr, inverted} = options.hash;
    selected = selected instanceof Array ? selected.map(String) : [String(selected)];

    // Prepare the choices as an array of objects
    const selectOptions = [];
    if ( choices instanceof Array ) {
      for ( const choice of choices ) {
        const name = String(choice[nameAttr]);
        let label = choice[labelAttr];
        if ( localize ) label = game.i18n.localize(label);
        selectOptions.push({name, label});
      }
    }
    else {
      for ( const choice of Object.entries(choices) ) {
        const [key, value] = inverted ? choice.reverse() : choice;
        const name = String(nameAttr ? value[nameAttr] : key);
        let label = labelAttr ? value[labelAttr] : value;
        if ( localize ) label = game.i18n.localize(label);
        selectOptions.push({name, label});
      }
    }

    // Sort the array of options
    if ( sort ) selectOptions.sort((a, b) => a.label.localeCompare(b.label));

    // Prepend a blank option
    if ( blank !== null ) {
      const label = localize ? game.i18n.localize(blank) : blank;
      selectOptions.unshift({name: "", label});
    }

    // Create the HTML
    let html = "";
    for ( const option of selectOptions ) {
      const label = Handlebars.escapeExpression(option.label);
      const isSelected = selected.includes(option.name);
      html += `<option value="${option.name}" ${isSelected ? "selected" : ""}>${label}</option>`;
    }
    return new Handlebars.SafeString(html);
  }
}

// Register all handlebars helpers
Handlebars.registerHelper({
  checked: HandlebarsHelpers.checked,
  disabled: HandlebarsHelpers.disabled,
  colorPicker: HandlebarsHelpers.colorPicker,
  concat: HandlebarsHelpers.concat,
  editor: HandlebarsHelpers.editor,
  filePicker: HandlebarsHelpers.filePicker,
  ifThen: HandlebarsHelpers.ifThen,
  numberFormat: HandlebarsHelpers.numberFormat,
  numberInput: HandlebarsHelpers.numberInput,
  localize: HandlebarsHelpers.localize,
  radioBoxes: HandlebarsHelpers.radioBoxes,
  rangePicker: HandlebarsHelpers.rangePicker,
  select: HandlebarsHelpers.select,
  selectOptions: HandlebarsHelpers.selectOptions,
  timeSince: foundry.utils.timeSince,
  eq: (v1, v2) => v1 === v2,
  ne: (v1, v2) => v1 !== v2,
  lt: (v1, v2) => v1 < v2,
  gt: (v1, v2) => v1 > v2,
  lte: (v1, v2) => v1 <= v2,
  gte: (v1, v2) => v1 >= v2,
  not: pred => !pred,
  and() {return Array.prototype.every.call(arguments, Boolean);},
  or() {return Array.prototype.slice.call(arguments, 0, -1).some(Boolean);}
});
