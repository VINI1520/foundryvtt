/**
 * @typedef {ApplicationOptions} FormApplicationOptions
 * @property {boolean} [closeOnSubmit=true]     Whether to automatically close the application when it's contained
 *                                              form is submitted.
 * @property {boolean} [submitOnChange=false]   Whether to automatically submit the contained HTML form when an input
 *                                              or select element is changed.
 * @property {boolean} [submitOnClose=false]    Whether to automatically submit the contained HTML form when the
 *                                              application window is manually closed.
 * @property {boolean} [editable=true]          Whether the application form is editable - if true, it's fields will
 *                                              be unlocked and the form can be submitted. If false, all form fields
 *                                              will be disabled and the form cannot be submitted.
 * @property {boolean} [sheetConfig=false]      Support configuration of the sheet type used for this application.
 */

/**
 * An abstract pattern for defining an Application responsible for updating some object using an HTML form
 *
 * A few critical assumptions:
 * 1) This application is used to only edit one object at a time
 * 2) The template used contains one (and only one) HTML form as it's outer-most element
 * 3) This abstract layer has no knowledge of what is being updated, so the implementation must define _updateObject
 *
 * @extends {Application}
 * @abstract
 * @interface
 *
 * @param {object} object                     Some object which is the target data structure to be updated by the form.
 * @param {FormApplicationOptions} [options]  Additional options which modify the rendering of the sheet.
 */
class FormApplication extends Application {
  constructor(object={}, options={}) {
    super(options);

    /**
     * The object target which we are using this form to modify
     * @type {*}
     */
    this.object = object;

    /**
     * A convenience reference to the form HTMLElement
     * @type {HTMLElement}
     */
    this.form = null;

    /**
     * Keep track of any FilePicker instances which are associated with this form
     * The values of this Array are inner-objects with references to the FilePicker instances and other metadata
     * @type {FilePicker[]}
     */
    this.filepickers = [];

    /**
     * Keep track of any mce editors which may be active as part of this form
     * The values of this object are inner-objects with references to the MCE editor and other metadata
     * @type {Object<string, object>}
     */
    this.editors = {};
  }

  /* -------------------------------------------- */

  /**
   * Assign the default options which are supported by the document edit sheet.
   * In addition to the default options object supported by the parent Application class, the Form Application
   * supports the following additional keys and values:
   *
   * @returns {FormApplicationOptions}    The default options for this FormApplication class
   */
  static get defaultOptions() {
    return foundry.utils.mergeObject(super.defaultOptions, {
      classes: ["form"],
      closeOnSubmit: true,
      editable: true,
      sheetConfig: false,
      submitOnChange: false,
      submitOnClose: false
    });
  }

  /* -------------------------------------------- */

  /**
   * Is the Form Application currently editable?
   * @type {boolean}
   */
  get isEditable() {
    return this.options.editable;
  }

  /* -------------------------------------------- */
  /*  Rendering                                   */
  /* -------------------------------------------- */

  /**
   * @inheritdoc
   * @returns {object|Promise<object>}
   */
  getData(options={}) {
    return {
      object: this.object,
      options: this.options,
      title: this.title
    };
  }

  /* -------------------------------------------- */

  /** @inheritdoc */
  async _render(force, options) {

    // Identify the focused element
    let focus = this.element.find(":focus");
    focus = focus.length ? focus[0] : null;

    // Render the application and restore focus
    await super._render(force, options);
    if ( focus && focus.name ) {
      const input = this.form?.[focus.name];
      if ( input && (input.focus instanceof Function) ) input.focus();
    }
  }

  /* -------------------------------------------- */

  /** @inheritdoc */
  async _renderInner(...args) {
    const html = await super._renderInner(...args);
    this.form = html.filter((i, el) => el instanceof HTMLFormElement)[0];
    if ( !this.form ) this.form = html.find("form")[0];
    return html;
  }

  /* -------------------------------------------- */
  /*  Event Listeners and Handlers                */
  /* -------------------------------------------- */

  /** @inheritdoc */
  _activateCoreListeners(html) {
    super._activateCoreListeners(html);
    if ( !this.form ) return;
    if ( !this.isEditable ) {
      return this._disableFields(this.form);
    }
    this.form.onsubmit = this._onSubmit.bind(this);
  }

  /* -------------------------------------------- */

  /** @inheritdoc */
  activateListeners(html) {
    super.activateListeners(html);
    if ( !this.isEditable ) return;
    html.on("change", "input,select,textarea", this._onChangeInput.bind(this));
    html.find(".editor-content[data-edit]").each((i, div) => this._activateEditor(div));
    for ( let fp of html.find("button.file-picker") ) {
      fp.onclick = this._activateFilePicker.bind(this);
    }
    if ( this._priorState <= this.constructor.RENDER_STATES.NONE ) html.find("[autofocus]")[0]?.focus();
  }

  /* -------------------------------------------- */

  /**
   * If the form is not editable, disable its input fields
   * @param {HTMLElement} form    The form HTML
   * @protected
   */
  _disableFields(form) {
    const inputs = ["INPUT", "SELECT", "TEXTAREA", "BUTTON"];
    for ( let i of inputs ) {
      for ( let el of form.getElementsByTagName(i) ) {
        if ( i === "TEXTAREA" ) el.readOnly = true;
        else el.disabled = true;
      }
    }
  }

  /* -------------------------------------------- */

  /**
   * Handle standard form submission steps
   * @param {Event} event               The submit event which triggered this handler
   * @param {object | null} [updateData]  Additional specific data keys/values which override or extend the contents of
   *                                    the parsed form. This can be used to update other flags or data fields at the
   *                                    same time as processing a form submission to avoid multiple database operations.
   * @param {boolean} [preventClose]    Override the standard behavior of whether to close the form on submit
   * @param {boolean} [preventRender]   Prevent the application from re-rendering as a result of form submission
   * @returns {Promise}                 A promise which resolves to the validated update data
   * @protected
   */
  async _onSubmit(event, {updateData=null, preventClose=false, preventRender=false}={}) {
    event.preventDefault();

    // Prevent double submission
    const states = this.constructor.RENDER_STATES;
    if ( (this._state === states.NONE) || !this.isEditable || this._submitting ) return false;
    this._submitting = true;

    // Process the form data
    const formData = this._getSubmitData(updateData);

    // Handle the form state prior to submission
    let closeForm = this.options.closeOnSubmit && !preventClose;
    const priorState = this._state;
    if ( preventRender ) this._state = states.RENDERING;
    if ( closeForm ) this._state = states.CLOSING;

    // Trigger the object update
    try {
      await this._updateObject(event, formData);
    }
    catch(err) {
      console.error(err);
      closeForm = false;
      this._state = priorState;
    }

    // Restore flags and optionally close the form
    this._submitting = false;
    if ( preventRender ) this._state = priorState;
    if ( closeForm ) await this.close({submit: false, force: true});
    return formData;
  }

  /* -------------------------------------------- */

  /**
   * Get an object of update data used to update the form's target object
   * @param {object} updateData     Additional data that should be merged with the form data
   * @returns {object}               The prepared update data
   * @protected
   */
  _getSubmitData(updateData={}) {
    if ( !this.form ) throw new Error("The FormApplication subclass has no registered form element");
    const fd = new FormDataExtended(this.form, {editors: this.editors});
    let data = fd.object;
    if ( updateData ) data = foundry.utils.flattenObject(foundry.utils.mergeObject(data, updateData));
    return data;
  }

  /* -------------------------------------------- */

  /**
   * Handle changes to an input element, submitting the form if options.submitOnChange is true.
   * Do not preventDefault in this handler as other interactions on the form may also be occurring.
   * @param {Event} event  The initial change event
   * @protected
   */
  async _onChangeInput(event) {
    // Do not fire change listeners for form inputs inside text editors.
    if ( event.currentTarget.closest(".editor") ) return;

    // Handle changes to specific input types
    const el = event.target;
    if ( (el.type === "color") && el.dataset.edit ) this._onChangeColorPicker(event);
    else if ( el.type === "range" ) this._onChangeRange(event);

    // Maybe submit the form
    if ( this.options.submitOnChange ) {
      return this._onSubmit(event);
    }
  }

  /* -------------------------------------------- */

  /**
   * Handle the change of a color picker input which enters it's chosen value into a related input field
   * @param {Event} event   The color picker change event
   * @protected
   */
  _onChangeColorPicker(event) {
    const input = event.target;
    const form = input.form;
    form[input.dataset.edit].value = input.value;
  }

  /* -------------------------------------------- */

  /**
   * Handle changes to a range type input by propagating those changes to the sibling range-value element
   * @param {Event} event  The initial change event
   * @protected
   */
  _onChangeRange(event) {
    const field = event.target.parentElement.querySelector(".range-value");
    if ( field ) {
      if ( field.tagName === "INPUT" ) field.value = event.target.value;
      else field.innerHTML = event.target.value;
    }
  }

  /* -------------------------------------------- */

  /**
   * Additional handling which should trigger when a FilePicker contained within this FormApplication is submitted.
   * @param {string} selection          The target path which was selected
   * @param {FilePicker} filePicker     The FilePicker instance which was submitted
   * @protected
   */
  _onSelectFile(selection, filePicker) {}

  /* -------------------------------------------- */

  /**
   * This method is called upon form submission after form data is validated
   * @param {Event} event       The initial triggering submission event
   * @param {object} formData   The object of validated form data with which to update the object
   * @returns {Promise}         A Promise which resolves once the update operation has completed
   * @abstract
   */
  async _updateObject(event, formData) {
    throw new Error("A subclass of the FormApplication must implement the _updateObject method.");
  }

  /* -------------------------------------------- */
  /*  TinyMCE Editor                              */
  /* -------------------------------------------- */

  /**
   * Activate a named TinyMCE text editor
   * @param {string} name             The named data field which the editor modifies.
   * @param {object} options          Editor initialization options passed to {@link TextEditor.create}.
   * @param {string} initialContent   Initial text content for the editor area.
   * @returns {Promise<TinyMCE.Editor|ProseMirror.EditorView>}
   */
  async activateEditor(name, options={}, initialContent="") {
    const editor = this.editors[name];
    if ( !editor ) throw new Error(`${name} is not a registered editor name!`);
    options = foundry.utils.mergeObject(editor.options, options);
    if ( !options.fitToSize ) options.height = options.target.offsetHeight;
    if ( editor.hasButton ) editor.button.style.display = "none";
    const instance = editor.instance = editor.mce = await TextEditor.create(options, initialContent || editor.initial);
    options.target.closest(".editor")?.classList.add(options.engine ?? "tinymce");
    editor.changed = false;
    editor.active = true;
    /** @deprecated since v10 */
    if ( options.engine !== "prosemirror" ) {
      instance.focus();
      instance.on("change", () => editor.changed = true);
    }
    return instance;
  }

  /* -------------------------------------------- */

  /**
   * Handle saving the content of a specific editor by name
   * @param {string} name           The named editor to save
   * @param {boolean} [remove]      Remove the editor after saving its content
   * @returns {Promise<void>}
   */
  async saveEditor(name, {remove=true}={}) {
    const editor = this.editors[name];
    if ( !editor || !editor.instance ) throw new Error(`${name} is not an active editor name!`);
    editor.active = false;
    const instance = editor.instance;
    await this._onSubmit(new Event("submit"));

    // Remove the editor
    if ( remove ) {
      instance.destroy();
      editor.instance = editor.mce = null;
      if ( editor.hasButton ) editor.button.style.display = "block";
      this.render();
    }
    editor.changed = false;
  }

  /* -------------------------------------------- */

  /**
   * Activate an editor instance present within the form
   * @param {HTMLElement} div  The element which contains the editor
   * @protected
   */
  _activateEditor(div) {

    // Get the editor content div
    const name = div.dataset.edit;
    const engine = div.dataset.engine || "tinymce";
    const collaborate = div.dataset.collaborate === "true";
    const button = div.previousElementSibling;
    const hasButton = button && button.classList.contains("editor-edit");
    const wrap = div.parentElement.parentElement;
    const wc = div.closest(".window-content");

    // Determine the preferred editor height
    const heights = [wrap.offsetHeight, wc ? wc.offsetHeight : null];
    if ( div.offsetHeight > 0 ) heights.push(div.offsetHeight);
    const height = Math.min(...heights.filter(h => Number.isFinite(h)));

    // Get initial content
    const options = {
      target: div,
      fieldName: name,
      save_onsavecallback: () => this.saveEditor(name),
      height, engine, collaborate
    };

    if ( engine === "prosemirror" ) options.plugins = this._configureProseMirrorPlugins(name, {remove: hasButton});

    /**
     * Handle legacy data references.
     * @deprecated since v10
     */
    const isDocument = this.object instanceof foundry.abstract.Document;
    const data = (name?.startsWith("data.") && isDocument) ? this.object.data : this.object;

    // Define the editor configuration
    const editor = this.editors[name] = {
      options,
      target: name,
      button: button,
      hasButton: hasButton,
      mce: null,
      instance: null,
      active: !hasButton,
      changed: false,
      initial: foundry.utils.getProperty(data, name)
    };

    // Activate the editor immediately, or upon button click
    const activate = () => {
      editor.initial = foundry.utils.getProperty(data, name);
      this.activateEditor(name, {}, editor.initial);
    };
    if ( hasButton ) button.onclick = activate;
    else activate();
  }

  /* -------------------------------------------- */

  /**
   * Configure ProseMirror plugins for this sheet.
   * @param {string} name                    The name of the editor.
   * @param {object} [options]               Additional options to configure the plugins.
   * @param {boolean} [options.remove=true]  Whether the editor should destroy itself on save.
   * @returns {object}
   * @protected
   */
  _configureProseMirrorPlugins(name, {remove=true}={}) {
    return {
      menu: ProseMirror.ProseMirrorMenu.build(ProseMirror.defaultSchema, {
        destroyOnSave: remove,
        onSave: () => this.saveEditor(name, {remove})
      }),
      keyMaps: ProseMirror.ProseMirrorKeyMaps.build(ProseMirror.defaultSchema, {
        onSave: () => this.saveEditor(name, {remove})
      })
    };
  }

  /* -------------------------------------------- */
  /*  FilePicker UI
  /* -------------------------------------------- */

  /**
   * Activate a FilePicker instance present within the form
   * @param {PointerEvent} event    The mouse click event on a file picker activation button
   * @protected
   */
  _activateFilePicker(event) {
    event.preventDefault();
    const options = this._getFilePickerOptions(event);
    const fp = new FilePicker(options);
    this.filepickers.push(fp);
    return fp.browse();
  }

  /* -------------------------------------------- */

  /**
   * Determine the configuration options used to initialize a FilePicker instance within this FormApplication.
   * Subclasses can extend this method to customize the behavior of pickers within their form.
   * @param {PointerEvent} event        The initiating mouse click event which opens the picker
   * @returns {object}                  Options passed to the FilePicker constructor
   * @protected
   */
  _getFilePickerOptions(event) {
    const button = event.currentTarget;
    const target = button.dataset.target;
    const field = button.form[target] || null;
    return {
      field: field,
      type: button.dataset.type,
      current: field?.value ?? "",
      button: button,
      callback: this._onSelectFile.bind(this)
    };
  }

  /* -------------------------------------------- */
  /*  Methods                                     */
  /* -------------------------------------------- */

  /** @inheritdoc */
  async close(options={}) {
    const states = Application.RENDER_STATES;
    if ( !options.force && ![states.RENDERED, states.ERROR].includes(this._state) ) return;

    // Trigger saving of the form
    const submit = options.submit ?? this.options.submitOnClose;
    if ( submit ) await this.submit({preventClose: true, preventRender: true});

    // Close any open FilePicker instances
    for ( let fp of this.filepickers ) {
      fp.close();
    }
    this.filepickers = [];

    // Close any open MCE editors
    for ( let ed of Object.values(this.editors) ) {
      if ( ed.mce ) ed.mce.destroy();
    }
    this.editors = {};

    // Close the application itself
    return super.close(options);
  }

  /* -------------------------------------------- */

  /**
   * Submit the contents of a Form Application, processing its content as defined by the Application
   * @param {object} [options]        Options passed to the _onSubmit event handler
   * @returns {FormApplication}       Return a self-reference for convenient method chaining
   */
  async submit(options={}) {
    if ( this._submitting ) return;
    const submitEvent = new Event("submit");
    await this._onSubmit(submitEvent, options);
    return this;
  }
}


/* -------------------------------------------- */

/**
 * @typedef {FormApplicationOptions} DocumentSheetOptions
 * @property {number} viewPermission                The default permissions required to view this Document sheet.
 * @property {HTMLSecretConfiguration[]} [secrets]  An array of {@link HTMLSecret} configuration objects.
 */

/**
 * Extend the FormApplication pattern to incorporate specific logic for viewing or editing Document instances.
 * See the FormApplication documentation for more complete description of this interface.
 *
 * @extends {FormApplication}
 * @abstract
 * @interface
 */
class DocumentSheet extends FormApplication {
  /**
   * @param {Document} object                    A Document instance which should be managed by this form.
   * @param {DocumentSheetOptions} [options={}]  Optional configuration parameters for how the form behaves.
   */
  constructor(object, options={}) {
    super(object, options);
    this._secrets = this._createSecretHandlers();
  }

  /* -------------------------------------------- */

  /**
   * The list of handlers for secret block functionality.
   * @type {HTMLSecret[]}
   * @protected
   */
  _secrets = [];

  /* -------------------------------------------- */

  /**
   * @override
   * @returns {DocumentSheetOptions}
   */
  static get defaultOptions() {
    return foundry.utils.mergeObject(super.defaultOptions, {
      classes: ["sheet"],
      template: `templates/sheets/${this.name.toLowerCase()}.html`,
      viewPermission: CONST.DOCUMENT_OWNERSHIP_LEVELS.LIMITED,
      sheetConfig: true,
      secrets: []
    });
  }

  /* -------------------------------------------- */

  /**
   * A semantic convenience reference to the Document instance which is the target object for this form.
   * @type {ClientDocument}
   */
  get document() {
    return this.object;
  }

  /* -------------------------------------------- */

  /** @inheritdoc */
  get id() {
    return `${this.constructor.name}-${this.document.uuid.replace(/\./g, "-")}`;
  }

  /* -------------------------------------------- */

  /** @inheritdoc */
  get isEditable() {
    let editable = this.options.editable && this.document.isOwner;
    if ( this.document.pack ) {
      const pack = game.packs.get(this.document.pack);
      if ( pack.locked ) editable = false;
    }
    return editable;
  }

  /* -------------------------------------------- */

  /** @inheritdoc */
  get title() {
    const reference = this.document.name ? ` ${this.document.name}` : "";
    return `${game.i18n.localize(this.document.constructor.metadata.label)}${reference}`;
  }

  /* -------------------------------------------- */
  /*  Methods                                     */
  /* -------------------------------------------- */

  /** @inheritdoc */
  async close(options={}) {
    await super.close(options);
    delete this.object.apps?.[this.appId];
  }

  /* -------------------------------------------- */

  /** @inheritdoc */
  getData(options={}) {
    const data = this.document.toObject(false);
    const isEditable = this.isEditable;
    return {
      cssClass: isEditable ? "editable" : "locked",
      editable: isEditable,
      document: this.document,
      data: data,
      limited: this.document.limited,
      options: this.options,
      owner: this.document.isOwner,
      title: this.title
    };
  }

  /* -------------------------------------------- */

  /** @inheritdoc */
  _activateCoreListeners(html) {
    super._activateCoreListeners(html);
    if ( this.isEditable ) html.find("img[data-edit]").on("click", this._onEditImage.bind(this));
    if ( !this.document.isOwner ) return;
    this._secrets.forEach(secret => secret.bind(html[0]));
  }

  /* -------------------------------------------- */

  /** @inheritdoc */
  async activateEditor(name, options={}, initialContent="") {
    const editor = this.editors[name];
    options.document = this.document;
    if ( editor?.options.engine === "prosemirror" ) {
      options.plugins = foundry.utils.mergeObject({
        highlightDocumentMatches: ProseMirror.ProseMirrorHighlightMatchesPlugin.build(ProseMirror.defaultSchema)
      }, options.plugins);
    }
    return super.activateEditor(name, options, initialContent);
  }

  /* -------------------------------------------- */

  /** @inheritdoc */
  render(force=false, options={}) {
    if ( !this._canUserView(game.user) ) {
      if ( !force ) return this; // If rendering is not being forced, fail silently
      const err = game.i18n.format("SHEETS.DocumentSheetPrivate", {
        type: game.i18n.localize(this.object.constructor.metadata.label)
      });
      ui.notifications.warn(err);
      return this;
    }

    // Update editable permission
    options.editable = options.editable ?? this.object.isOwner;

    // Register the active Application with the referenced Documents
    this.object.apps[this.appId] = this;
    return super.render(force, options);
  }

  /* -------------------------------------------- */

  /** @inheritDoc */
  async _renderOuter() {
    const html = await super._renderOuter();
    this._createDocumentIdLink(html);
    return html;
  }

  /* -------------------------------------------- */

  /**
   * Create an ID link button in the document sheet header which displays the document ID and copies to clipboard
   * @param {jQuery} html
   * @protected
   */
  _createDocumentIdLink(html) {
    if ( !(this.object instanceof foundry.abstract.Document) || !this.object.id ) return;
    const title = html.find(".window-title");
    const label = game.i18n.localize(this.object.constructor.metadata.label);
    const idLink = document.createElement("a");
    idLink.classList.add("document-id-link");
    idLink.setAttribute("alt", "Copy document id");
    idLink.dataset.tooltip = `${label}: ${this.object.id}`;
    idLink.dataset.tooltipDirection = "UP";
    idLink.innerHTML = '<i class="fa-solid fa-passport"></i>';
    idLink.addEventListener("click", event => {
      event.preventDefault();
      game.clipboard.copyPlainText(this.object.id);
      ui.notifications.info(game.i18n.format("DOCUMENT.IdCopiedClipboard", {label, type: "id", id: this.object.id}));
    });
    idLink.addEventListener("contextmenu", event => {
      event.preventDefault();
      game.clipboard.copyPlainText(this.object.uuid);
      ui.notifications.info(game.i18n.format("DOCUMENT.IdCopiedClipboard", {label, type: "uuid", id: this.object.uuid}));
    });
    title.append(idLink);
  }

  /* -------------------------------------------- */

  /**
   * Test whether a certain User has permission to view this Document Sheet.
   * @param {User} user     The user requesting to render the sheet
   * @returns {boolean}     Does the User have permission to view this sheet?
   * @protected
   */
  _canUserView(user) {
    return this.object.testUserPermission(user, this.options.viewPermission);
  }

  /* -------------------------------------------- */

  /**
   * Create objects for managing the functionality of secret blocks within this Document's content.
   * @returns {HTMLSecret[]}
   * @protected
   */
  _createSecretHandlers() {
    if ( !this.document.isOwner || this.document.compendium?.locked ) return [];
    return this.options.secrets.map(config => {
      config.callbacks = {
        content: this._getSecretContent.bind(this),
        update: this._updateSecret.bind(this)
      };
      return new HTMLSecret(config);
    });
  }

  /* -------------------------------------------- */
  /*  Event Handlers                              */
  /* -------------------------------------------- */

  /** @inheritdoc */
  _getHeaderButtons() {
    let buttons = super._getHeaderButtons();

    // Compendium Import
    if ( (this.document.constructor.name !== "Folder") && !this.document.isEmbedded &&
          this.document.compendium && this.document.constructor.canUserCreate(game.user) ) {
      buttons.unshift({
        label: "Import",
        class: "import",
        icon: "fas fa-download",
        onclick: async () => {
          await this.close();
          return this.document.collection.importFromCompendium(this.document.compendium, this.document.id);
        }
      });
    }

    // Sheet Configuration
    if ( this.options.sheetConfig && this.isEditable && (this.document.getFlag("core", "sheetLock") !== true) ) {
      buttons.unshift({
        label: "Sheet",
        class: "configure-sheet",
        icon: "fas fa-cog",
        onclick: ev => this._onConfigureSheet(ev)
      });
    }
    return buttons;
  }

  /* -------------------------------------------- */

  /**
   * Get the HTML content that a given secret block is embedded in.
   * @param {HTMLElement} secret  The secret block.
   * @returns {string}
   * @protected
   */
  _getSecretContent(secret) {
    const edit = secret.closest("[data-edit]")?.dataset.edit;
    if ( edit ) return foundry.utils.getProperty(this.document, edit);
  }

  /* -------------------------------------------- */

  /**
   * Update the HTML content that a given secret block is embedded in.
   * @param {HTMLElement} secret         The secret block.
   * @param {string} content             The new content.
   * @returns {Promise<ClientDocument>}  The updated Document.
   * @protected
   */
  _updateSecret(secret, content) {
    const edit = secret.closest("[data-edit]")?.dataset.edit;
    if ( edit ) return this.document.update({[edit]: content});
  }

  /* -------------------------------------------- */

  /**
   * Handle requests to configure the default sheet used by this Document
   * @param event
   * @private
   */
  _onConfigureSheet(event) {
    event.preventDefault();
    new DocumentSheetConfig(this.document, {
      top: this.position.top + 40,
      left: this.position.left + ((this.position.width - DocumentSheet.defaultOptions.width) / 2)
    }).render(true);
  }

  /* -------------------------------------------- */

  /**
   * Handle changing a Document's image.
   * @param {MouseEvent} event  The click event.
   * @returns {Promise}
   * @protected
   */
  _onEditImage(event) {
    const attr = event.currentTarget.dataset.edit;
    const current = foundry.utils.getProperty(this.object, attr);
    const { img } = this.document.constructor.getDefaultArtwork?.(this.document.toObject()) ?? {};
    const fp = new FilePicker({
      current,
      type: "image",
      redirectToRoot: img ? [img] : [],
      callback: path => {
        event.currentTarget.src = path;
        if ( this.options.submitOnChange ) return this._onSubmit(event);
      },
      top: this.position.top + 40,
      left: this.position.left + 10
    });
    return fp.browse();
  }

  /* -------------------------------------------- */

  /** @inheritdoc */
  async _updateObject(event, formData) {
    if ( !this.object.id ) return;
    return this.object.update(formData);
  }
}
