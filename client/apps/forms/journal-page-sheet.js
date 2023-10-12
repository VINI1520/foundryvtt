/**
 * The Application responsible for displaying and editing a single JournalEntryPage document.
 * @extends {DocumentSheet}
 * @param {JournalEntryPage} object         The JournalEntryPage instance which is being edited.
 * @param {DocumentSheetOptions} [options]  Application options.
 */
class JournalPageSheet extends DocumentSheet {

  /** @inheritdoc */
  static get defaultOptions() {
    return foundry.utils.mergeObject(super.defaultOptions, {
      classes: ["sheet", "journal-sheet", "journal-entry-page"],
      viewClasses: [],
      width: 600,
      height: 680,
      resizable: true,
      closeOnSubmit: false,
      submitOnClose: true,
      viewPermission: CONST.DOCUMENT_OWNERSHIP_LEVELS.OBSERVER,
      includeTOC: true
    });
  }

  /* -------------------------------------------- */

  /** @inheritdoc */
  get template() {
    return `templates/journal/page-${this.document.type}-${this.isEditable ? "edit" : "view"}.html`;
  }

  /* -------------------------------------------- */

  /** @inheritdoc */
  get title() {
    return this.object.permission ? this.object.name : "";
  }

  /* -------------------------------------------- */

  /**
   * The table of contents for this JournalTextPageSheet.
   * @type {Object<JournalEntryPageHeading>}
   */
  toc = {};

  /* -------------------------------------------- */
  /*  Rendering                                   */
  /* -------------------------------------------- */

  /** @inheritdoc */
  getData(options={}) {
    return foundry.utils.mergeObject(super.getData(options), {
      headingLevels: Object.fromEntries(Array.fromRange(3, 1).map(level => {
        return [level, game.i18n.format("JOURNALENTRYPAGE.Level", {level})];
      }))
    });
  }

  /* -------------------------------------------- */

  /** @inheritdoc */
  async _renderInner(...args) {
    await loadTemplates({
      journalEntryPageHeader: "templates/journal/parts/page-header.html",
      journalEntryPageFooter: "templates/journal/parts/page-footer.html"
    });
    const html = await super._renderInner(...args);
    if ( this.options.includeTOC ) this.toc = JournalEntryPage.implementation.buildTOC(html.get());
    return html;
  }

  /* -------------------------------------------- */
  /*  Text Secrets Management                     */
  /* -------------------------------------------- */

  /** @inheritdoc */
  _getSecretContent(secret) {
    return this.object.text.content;
  }

  /* -------------------------------------------- */

  /** @inheritdoc */
  _updateSecret(secret, content) {
    return this.object.update({"text.content": content});
  }

  /* -------------------------------------------- */
  /*  Text Editor Integration                     */
  /* -------------------------------------------- */

  /** @inheritdoc */
  async activateEditor(name, options={}, initialContent="") {
    options.fitToSize = true;
    options.relativeLinks = true;
    const editor = await super.activateEditor(name, options, initialContent);
    this.form.querySelector('[role="application"]')?.style.removeProperty("height");
    return editor;
  }

  /* -------------------------------------------- */

  /**
   * Update the parent sheet if it is open when the server autosaves the contents of this editor.
   * @param {string} html  The updated editor contents.
   */
  onAutosave(html) {
    this.object.parent?.sheet?.render(false);
  }

  /* -------------------------------------------- */

  /**
   * Update the UI appropriately when receiving new steps from another client.
   */
  onNewSteps() {
    this.form.querySelectorAll('[data-action="save-html"]').forEach(el => el.disabled = true);
  }
}

/**
 * The Application responsible for displaying and editing a single JournalEntryPage text document.
 * @extends {JournalPageSheet}
 */
class JournalTextPageSheet extends JournalPageSheet {
  /**
   * Bi-directional HTML <-> Markdown converter.
   * @type {showdown.Converter}
   * @protected
   */
  static _converter = (() => {
    Object.entries(CONST.SHOWDOWN_OPTIONS).forEach(([k, v]) => showdown.setOption(k, v));
    return new showdown.Converter();
  })();

  /* -------------------------------------------- */

  /**
   * Declare the format that we edit text content in for this sheet so we can perform conversions as necessary.
   * @type {number}
   */
  static get format() {
    return CONST.JOURNAL_ENTRY_PAGE_FORMATS.HTML;
  }

  /* -------------------------------------------- */

  /** @inheritdoc */
  static get defaultOptions() {
    const options = super.defaultOptions;
    options.classes.push("text");
    options.secrets.push({parentSelector: "section"});
    return options;
  }

  /* -------------------------------------------- */

  /** @inheritdoc */
  async getData(options={}) {
    const data = super.getData(options);
    this._convertFormats(data);
    data.editor = {
      engine: "prosemirror",
      collaborate: true,
      content: await TextEditor.enrichHTML(data.document.text.content, {
        relativeTo: this.object,
        secrets: this.object.isOwner,
        async: true
      })
    };
    return data;
  }

  /* -------------------------------------------- */

  /** @inheritdoc */
  async close(options={}) {
    Object.values(this.editors).forEach(ed => {
      if ( ed.instance ) ed.instance.destroy();
    });
    return super.close(options);
  }

  /* -------------------------------------------- */

  /** @inheritdoc */
  async _render(force, options) {
    if ( !this.#canRender(options.resync) ) return this.maximize().then(() => this.bringToTop());
    return super._render(force, options);
  }

  /* -------------------------------------------- */

  /**
   * Suppress re-rendering the sheet in cases where an active editor has unsaved work.
   * In such cases we rely upon collaborative editing to save changes and re-render.
   * @param {boolean} [resync]    Was the application instructed to re-sync?
   * @returns {boolean}           Should a render operation be allowed?
   */
  #canRender(resync) {
    if ( resync || (this._state !== Application.RENDER_STATES.RENDERED) || !this.isEditable ) return true;
    return !this.isEditorDirty();
  }

  /* -------------------------------------------- */

  /**
   * Determine if any editors are dirty.
   * @returns {boolean}
   */
  isEditorDirty() {
    for ( const editor of Object.values(this.editors) ) {
      if ( editor.active && editor.instance?.isDirty() ) return true;
    }
    return false;
  }

  /* -------------------------------------------- */

  /** @inheritdoc */
  async _updateObject(event, formData) {
    if ( (this.constructor.format === CONST.JOURNAL_ENTRY_PAGE_FORMATS.HTML) && this.isEditorDirty() ) {
      // Clear any stored markdown so it can be re-converted.
      formData["text.markdown"] = "";
      formData["text.format"] = CONST.JOURNAL_ENTRY_PAGE_FORMATS.HTML;
    }
    return super._updateObject(event, formData);
  }

  /* -------------------------------------------- */

  /**
   * Lazily convert text formats if we detect the document being saved in a different format.
   * @param {object} renderData  Render data.
   * @protected
   */
  _convertFormats(renderData) {
    const formats = CONST.JOURNAL_ENTRY_PAGE_FORMATS;
    const text = this.object.text;
    if ( (this.constructor.format === formats.MARKDOWN) && text.content?.length && !text.markdown?.length ) {
      // We've opened an HTML document in a markdown editor, so we need to convert the HTML to markdown for editing.
      renderData.data.text.markdown = this.constructor._converter.makeMarkdown(text.content.trim());
    }
  }
}

/* -------------------------------------------- */

/**
 * The Application responsible for displaying and editing a single JournalEntryPage image document.
 * @extends {JournalPageSheet}
 */
class JournalImagePageSheet extends JournalPageSheet {

  /** @inheritdoc */
  static get defaultOptions() {
    const options = super.defaultOptions;
    options.classes.push("image");
    options.height = "auto";
    return options;
  }
}

/* -------------------------------------------- */

/**
 * The Application responsible for displaying and editing a single JournalEntryPage video document.
 * @extends {JournalPageSheet}
 */
class JournalVideoPageSheet extends JournalPageSheet {

  /** @inheritdoc */
  static get defaultOptions() {
    const options = super.defaultOptions;
    options.classes.push("video");
    options.height = "auto";
    return options;
  }

  /* -------------------------------------------- */

  /** @inheritdoc */
  getData(options={}) {
    return foundry.utils.mergeObject(super.getData(options), {
      flexRatio: !this.object.video.width && !this.object.video.height,
      isYouTube: game.video.isYouTubeURL(this.object.src),
      timestamp: this._timestampToTimeComponents(this.object.video.timestamp),
      yt: {
        id: `youtube-${foundry.utils.randomID()}`,
        url: game.video.getYouTubeEmbedURL(this.object.src, this._getYouTubeVars())
      }
    });
  }

  /* -------------------------------------------- */

  /** @inheritdoc */
  activateListeners(html) {
    super.activateListeners(html);
    if ( this.isEditable ) return;
    // The below listeners are only for when the video page is being viewed, not edited.
    const iframe = html.find("iframe")[0];
    if ( iframe ) game.video.getYouTubePlayer(iframe.id, {
      events: {
        onStateChange: event => {
          if ( event.data === YT.PlayerState.PLAYING ) event.target.setVolume(this.object.video.volume * 100);
        }
      }
    }).then(player => {
      if ( this.object.video.timestamp ) player.seekTo(this.object.video.timestamp, true);
    });
    const video = html.parent().find("video")[0];
    if ( video ) {
      video.addEventListener("loadedmetadata", () => {
        video.volume = this.object.video.volume;
        if ( this.object.video.timestamp ) video.currentTime = this.object.video.timestamp;
      });
    }
  }

  /* -------------------------------------------- */

  /**
   * Get the YouTube player parameters depending on whether the sheet is being viewed or edited.
   * @returns {object}
   * @protected
   */
  _getYouTubeVars() {
    const vars = {playsinline: 1, modestbranding: 1};
    if ( !this.isEditable ) {
      vars.controls = this.object.video.controls ? 1 : 0;
      vars.autoplay = this.object.video.autoplay ? 1 : 0;
      vars.loop = this.object.video.loop ? 1 : 0;
      if ( this.object.video.timestamp ) vars.start = this.object.video.timestamp;
    }
    return vars;
  }

  /* -------------------------------------------- */

  /** @inheritdoc */
  _getSubmitData(updateData={}) {
    const data = super._getSubmitData(updateData);
    data["video.timestamp"] = this._timeComponentsToTimestamp(foundry.utils.expandObject(data).timestamp);
    ["h", "m", "s"].forEach(c => delete data[`timestamp.${c}`]);
    return data;
  }

  /* -------------------------------------------- */

  /**
   * Convert time components to a timestamp in seconds.
   * @param {{[h]: number, [m]: number, [s]: number}} components  The time components.
   * @returns {number}                                            The timestamp, in seconds.
   * @protected
   */
  _timeComponentsToTimestamp({h=0, m=0, s=0}={}) {
    return (h * 3600) + (m * 60) + s;
  }

  /* -------------------------------------------- */

  /**
   * Convert a timestamp in seconds into separate time components.
   * @param {number} timestamp                           The timestamp, in seconds.
   * @returns {{[h]: number, [m]: number, [s]: number}}  The individual time components.
   * @protected
   */
  _timestampToTimeComponents(timestamp) {
    if ( !timestamp ) return {};
    const components = {};
    const h = Math.floor(timestamp / 3600);
    if ( h ) components.h = h;
    const m = Math.floor((timestamp % 3600) / 60);
    if ( m ) components.m = m;
    components.s = timestamp - (h * 3600) - (m * 60);
    return components;
  }
}

/* -------------------------------------------- */

/**
 * The Application responsible for displaying and editing a single JournalEntryPage PDF document.
 * @extends {JournalPageSheet}
 */
class JournalPDFPageSheet extends JournalPageSheet {

  /** @inheritdoc */
  static get defaultOptions() {
    const options = super.defaultOptions;
    options.classes.push("pdf");
    options.height = "auto";
    return options;
  }

  /**
   * Maintain a cache of PDF sizes to avoid making HEAD requests every render.
   * @type {Object<number>}
   * @protected
   */
  static _sizes = {};

  /* -------------------------------------------- */

  /** @inheritdoc */
  activateListeners(html) {
    super.activateListeners(html);
    html.find("> button").on("click", this._onLoadPDF.bind(this));
  }

  /* -------------------------------------------- */

  /** @inheritdoc */
  getData(options={}) {
    return foundry.utils.mergeObject(super.getData(options), {
      params: this._getViewerParams()
    });
  }

  /* -------------------------------------------- */

  /** @inheritdoc */
  async _renderInner(...args) {
    const html = await super._renderInner(...args);
    const pdfLoader = html.closest(".load-pdf")[0];
    if ( this.isEditable || !pdfLoader ) return html;
    let size = this.constructor._sizes[this.object.src];
    if ( size === undefined ) {
      const res = await fetch(this.object.src, {method: "HEAD"}).catch(() => {});
      this.constructor._sizes[this.object.src] = size = Number(res?.headers.get("content-length"));
    }
    if ( !isNaN(size) ) {
      const mb = (size / 1024 / 1024).toFixed(2);
      const span = document.createElement("span");
      span.classList.add("hint");
      span.textContent = ` (${mb} MB)`;
      pdfLoader.querySelector("button").appendChild(span);
    }
    return html;
  }

  /* -------------------------------------------- */

  /**
   * Handle a request to load a PDF.
   * @param {MouseEvent} event  The triggering event.
   * @protected
   */
  _onLoadPDF(event) {
    const target = event.currentTarget.parentElement;
    const frame = document.createElement("iframe");
    frame.src = `scripts/pdfjs/web/viewer.html?${this._getViewerParams()}`;
    target.replaceWith(frame);
  }

  /* -------------------------------------------- */

  /**
   * Retrieve parameters to pass to the PDF viewer.
   * @returns {URLSearchParams}
   * @protected
   */
  _getViewerParams() {
    const params = new URLSearchParams();
    if ( this.object.src ) {
      const src = URL.parseSafe(this.object.src) ? this.object.src : foundry.utils.getRoute(this.object.src);
      params.append("file", src);
    }
    return params;
  }
}

/**
 * A subclass of {@link JournalTextPageSheet} that implements a markdown editor for editing the text content.
 * @extends {JournalTextPageSheet}
 */
class MarkdownJournalPageSheet extends JournalTextPageSheet {
  /**
   * Store the dirty flag for this editor.
   * @type {boolean}
   * @protected
   */
  _isDirty = false;

  /* -------------------------------------------- */

  /** @inheritdoc */
  static get format() {
    return CONST.JOURNAL_ENTRY_PAGE_FORMATS.MARKDOWN;
  }

  /* -------------------------------------------- */

  /** @inheritdoc */
  static get defaultOptions() {
    const options = super.defaultOptions;
    options.dragDrop = [{dropSelector: "textarea"}];
    options.classes.push("markdown");
    return options;
  }

  /* -------------------------------------------- */

  /** @inheritdoc */
  get template() {
    if ( this.isEditable ) return "templates/journal/page-markdown-edit.html";
    return super.template;
  }

  /* -------------------------------------------- */

  /** @inheritdoc */
  async getData(options={}) {
    const data = await super.getData(options);
    data.markdownFormat = CONST.JOURNAL_ENTRY_PAGE_FORMATS.MARKDOWN;
    return data;
  }

  /* -------------------------------------------- */

  /** @inheritdoc */
  activateListeners(html) {
    super.activateListeners(html);
    html.find("textarea").on("keypress paste", () => this._isDirty = true);
  }

  /* -------------------------------------------- */

  /** @inheritdoc */
  isEditorDirty() {
    return this._isDirty;
  }

  /* -------------------------------------------- */

  /** @inheritdoc */
  async _updateObject(event, formData) {
    // Do not persist the markdown conversion if the contents have not been edited.
    if ( !this.isEditorDirty() ) {
      delete formData["text.markdown"];
      delete formData["text.format"];
    }
    return super._updateObject(event, formData);
  }

  /* -------------------------------------------- */

  /** @inheritdoc */
  _onDrop(event) {
    event.preventDefault();
    const eventData = TextEditor.getDragEventData(event);
    return this._onDropContentLink(eventData);
  }

  /* -------------------------------------------- */

  /**
   * Handle dropping a content link onto the editor.
   * @param {object} eventData  The parsed event data.
   * @protected
   */
  async _onDropContentLink(eventData) {
    const link = await TextEditor.getContentLink(eventData, {relativeTo: this.object});
    if ( !link ) return;
    const editor = this.form.elements["text.markdown"];
    const content = editor.value;
    editor.value = content.substring(0, editor.selectionStart) + link + content.substring(editor.selectionStart);
    this._isDirty = true;
  }
}

/**
 * A subclass of {@link JournalTextPageSheet} that implements a TinyMCE editor.
 * @extends {JournalTextPageSheet}
 */
class JournalTextTinyMCESheet extends JournalTextPageSheet {
  /** @inheritdoc */
  async getData(options={}) {
    const data = await super.getData(options);
    data.editor.engine = "tinymce";
    data.editor.collaborate = false;
    return data;
  }

  /* -------------------------------------------- */

  /** @inheritdoc */
  async close(options = {}) {
    return JournalPageSheet.prototype.close.call(this, options);
  }

  /* -------------------------------------------- */

  /** @inheritdoc */
  async _render(force, options) {
    return JournalPageSheet.prototype._render.call(this, force, options);
  }
}
