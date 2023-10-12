/**
 * An extension of the native FormData implementation.
 *
 * This class functions the same way that the default FormData does, but it is more opinionated about how
 * input fields of certain types should be evaluated and handled.
 *
 * It also adds support for certain Foundry VTT specific concepts including:
 *  Support for defined data types and type conversion
 *  Support for TinyMCE editors
 *  Support for editable HTML elements
 *
 * @extends {FormData}
 *
 * @param {HTMLFormElement} form          The form being processed
 * @param {Object<object>} [editors]      A record of TinyMCE editor metadata objects, indexed by their update key
 * @param {Object<string>} [dtypes]       A mapping of data types for form fields
 */
class FormDataExtended extends FormData {
  constructor(form, {editors={}, dtypes={}}={}) {
    super();

    /**
     * A mapping of data types requested for each form field.
     * @type {{string, string}}
     */
    this.dtypes = dtypes;

    /**
     * A record of TinyMCE editors which are linked to this form.
     * @type {Object<string, object>}
     */
    this.editors = editors;

    /**
     * The object representation of the form data, available once processed.
     * @type {object}
     */
    Object.defineProperty(this, "object", {value: {}, writable: false, enumerable: false});

    // Process the provided form
    this.process(form);
  }

  /* -------------------------------------------- */

  /**
   * Process the HTML form element to populate the FormData instance.
   * @param {HTMLFormElement} form    The HTML form being processed
   */
  process(form) {
    this.#processFormFields(form);
    this.#processEditableHTML(form);
    this.#processEditors();
  }

  /* -------------------------------------------- */

  /**
   * Assign a value to the FormData instance which always contains JSON strings.
   * Also assign the cast value in its preferred data type to the parsed object representation of the form data.
   * @param {string} name     The field name
   * @param {any} value       The raw extracted value from the field
   * @private
   */
  #set(name, value) {
    this.object[name] = value;
    if ( value instanceof Array ) value = JSON.stringify(value);
    this.set(name, value);
  }

  /* -------------------------------------------- */

  /**
   * Process all standard HTML form field elements from the form.
   * @param {HTMLFormElement} form    The form being processed
   * @private
   */
  #processFormFields(form) {
    if ( form.hasAttribute("disabled") ) return;
    const mceEditorIds = Object.values(this.editors).map(e => e.mce?.id);
    for ( const element of form.elements ) {
      const name = element.name;

      // Skip fields which are unnamed or already handled
      if ( !name || this.has(name) ) continue;

      // Skip buttons and editors
      if ( (element.tagName === "BUTTON") || mceEditorIds.includes(name) ) continue;

      // Skip disabled or read-only fields
      if ( element.disabled || element.readOnly || element.closest("fieldset")?.disabled ) continue;

      // Extract and process the value of the field
      const field = form.elements[name];
      const value = this.#getFieldValue(name, field);
      this.#set(name, value);
    }
  }

  /* -------------------------------------------- */

  /**
   * Process editable HTML elements (ones with a [data-edit] attribute).
   * @param {HTMLFormElement} form    The form being processed
   * @private
   */
  #processEditableHTML(form) {
    const editableElements = form.querySelectorAll("[data-edit]");
    for ( const element of editableElements ) {
      const name = element.dataset.edit;
      if ( this.has(name) || element.disabled || element.readOnly || (name in this.editors) ) continue;
      let value;
      if (element.tagName === "IMG") value = element.getAttribute("src");
      else value = element.innerHTML.trim();
      this.#set(name, value);
    }
  }

  /* -------------------------------------------- */

  /**
   * Process TinyMCE editor instances which are present in the form.
   * @private
   */
  #processEditors() {
    for ( const [name, editor] of Object.entries(this.editors) ) {
      if ( !editor.instance ) continue;
      if ( editor.options.engine === "tinymce" ) {
        const content = editor.instance.getContent();
        this.delete(editor.mce.id); // Delete hidden MCE inputs
        this.#set(name, content);
      } else if ( editor.options.engine === "prosemirror" ) {
        this.#set(name, ProseMirror.dom.serializeString(editor.instance.view.state.doc.content));
      }
    }
  }

  /* -------------------------------------------- */

  /**
   * Obtain the parsed value of a field conditional on its element type and requested data type.
   * @param {string} name                       The field name being processed
   * @param {HTMLElement|RadioNodeList} field   The HTML field or a RadioNodeList of multiple fields
   * @returns {*}                               The processed field value
   * @private
   */
  #getFieldValue(name, field) {

    // Multiple elements with the same name
    if ( field instanceof RadioNodeList ) {
      const fields = Array.from(field);
      if ( fields.every(f => f.type === "radio") ) {
        const chosen = fields.find(f => f.checked);
        return chosen ? this.#getFieldValue(name, chosen) : undefined;
      }
      return Array.from(field).map(f => this.#getFieldValue(name, f));
    }

    // Record requested data type
    const dataType = field.dataset.dtype || this.dtypes[name];

    // Disabled fields
    if ( field.disabled ) return null;

    // Checkbox
    if ( field.type === "checkbox" ) {

      // Non-boolean checkboxes with an explicit value attribute yield that value or null
      if ( field.hasAttribute("value") && (dataType !== "Boolean") ) {
        return this.#castType(field.checked ? field.value : null, dataType);
      }

      // Otherwise, true or false based on the checkbox checked state
      return this.#castType(field.checked, dataType);
    }

    // Number and Range
    if ( ["number", "range"].includes(field.type) ) {
      if ( field.value === "" ) return null;
      else return this.#castType(field.value, dataType || "Number");
    }

    // Multi-Select
    if ( field.type === "select-multiple" ) {
      return Array.from(field.options).reduce((chosen, opt) => {
        if ( opt.selected ) chosen.push(this.#castType(opt.value, dataType));
        return chosen;
      }, []);
    }

    // Radio Select
    if ( field.type === "radio" ) {
      return field.checked ? this.#castType(field.value, dataType) : null;
    }

    // Other field types
    return this.#castType(field.value, dataType);
  }

  /* -------------------------------------------- */

  /**
   * Cast a processed value to a desired data type.
   * @param {any} value         The raw field value
   * @param {string} dataType   The desired data type
   * @returns {any}             The resulting data type
   * @private
   */
  #castType(value, dataType) {
    if ( value instanceof Array ) return value.map(v => this.#castType(v, dataType));
    if ( [undefined, null].includes(value) || (dataType === "String") ) return value;

    // Boolean
    if ( dataType === "Boolean" ) {
      if ( value === "false" ) return false;
      return Boolean(value);
    }

    // Number
    else if ( dataType === "Number" ) {
      if ( (value === "") || (value === "null") ) return null;
      return Number(value);
    }

    // Serialized JSON
    else if ( dataType === "JSON" ) {
      return JSON.parse(value);
    }

    // Other data types
    if ( window[dataType] instanceof Function ) {
      try {
        return window[dataType](value);
      } catch(err) {
        console.warn(`The form field value "${value}" was not able to be cast to the requested data type ${dataType}`);
      }
    }
    return value;
  }

  /* -------------------------------------------- */
  /*  Deprecations and Compatibility              */
  /* -------------------------------------------- */

  /**
   * @deprecated since v10
   * @ignore
   */
  toObject() {
    foundry.utils.logCompatibilityWarning("You are using FormDataExtended#toObject which is deprecated in favor of"
      + " FormDataExtended#object", {since: 10, until: 12});
    return this.object;
  }
}
