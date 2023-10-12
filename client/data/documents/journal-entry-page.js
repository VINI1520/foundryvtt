/**
 * The client-side JournalEntryPage document which extends the common BaseJournalEntryPage document model.
 * @extends documents.BaseJournalEntryPage
 * @mixes ClientDocumentMixin
 *
 * @see {@link JournalEntry}  The JournalEntry document type which contains JournalEntryPage embedded documents.
 */
class JournalEntryPage extends ClientDocumentMixin(foundry.documents.BaseJournalEntryPage) {
  /**
   * @typedef {object} JournalEntryPageHeading
   * @property {number} level                  The heading level, 1-6.
   * @property {string} text                   The raw heading text with any internal tags omitted.
   * @property {string} slug                   The generated slug for this heading.
   * @property {HTMLHeadingElement} [element]  The currently rendered element for this heading, if it exists.
   * @property {string[]} children             Any child headings of this one.
   */

  /**
   * The cached table of contents for this JournalEntryPage.
   * @type {Object<JournalEntryPageHeading>}
   * @protected
   */
  _toc;

  /* -------------------------------------------- */

  /**
   * The table of contents for this JournalEntryPage.
   * @type {Object<JournalEntryPageHeading>}
   */
  get toc() {
    if ( this.type !== "text" ) return {};
    if ( this._toc ) return this._toc;
    const renderTarget = document.createElement("template");
    renderTarget.innerHTML = this.text.content;
    this._toc = this.constructor.buildTOC(Array.from(renderTarget.content.children), {includeElement: false});
    return this._toc;
  }

  /* -------------------------------------------- */

  /** @inheritdoc */
  get permission() {
    if ( game.user.isGM ) return CONST.DOCUMENT_OWNERSHIP_LEVELS.OWNER;
    return this.getUserLevel(game.user);
  }

  /* -------------------------------------------- */

  /**
   * Return a reference to the Note instance for this Journal Entry Page in the current Scene, if any.
   * If multiple notes are placed for this Journal Entry, only the first will be returned.
   * @type {Note|null}
   */
  get sceneNote() {
    if ( !canvas.ready ) return null;
    return canvas.notes.placeables.find(n => {
      return (n.document.entryId === this.parent.id) && (n.document.pageId === this.id);
    }) || null;
  }

  /* -------------------------------------------- */
  /*  Table of Contents                           */
  /* -------------------------------------------- */

  /**
   * Convert a heading into slug suitable for use as an identifier.
   * @param {HTMLHeadingElement|string} heading  The heading element or some text content.
   * @returns {string}
   */
  static slugifyHeading(heading) {
    if ( heading instanceof HTMLElement ) heading = heading.textContent;
    return heading.slugify().replace(/["']/g, "").substring(0, 64);
  }

  /* -------------------------------------------- */

  /**
   * Build a table of contents for the given HTML content.
   * @param {HTMLElement[]} html                     The HTML content to generate a ToC outline for.
   * @param {object} [options]                       Additional options to configure ToC generation.
   * @param {boolean} [options.includeElement=true]  Include references to the heading DOM elements in the returned ToC.
   * @returns {Object<JournalEntryPageHeading>}
   */
  static buildTOC(html, {includeElement=true}={}) {
    // A pseudo root heading element to start at.
    const root = {level: 0, children: []};
    // Perform a depth-first-search down the DOM to locate heading nodes.
    const stack = [root];
    const searchHeadings = element => {
      if ( element instanceof HTMLHeadingElement ) {
        const node = this._makeHeadingNode(element, {includeElement});
        let parent = stack.at(-1);
        if ( node.level <= parent.level ) {
          stack.pop();
          parent = stack.at(-1);
        }
        parent.children.push(node);
        stack.push(node);
      }
      for ( const child of (element.children || []) ) {
        searchHeadings(child);
      }
    };
    html.forEach(searchHeadings);
    return this._flattenTOC(root.children);
  }

  /* -------------------------------------------- */

  /**
   * Flatten the tree structure into a single object with each node's slug as the key.
   * @param {JournalEntryPageHeading[]} nodes  The root ToC nodes.
   * @returns {Object<JournalEntryPageHeading>}
   * @protected
   */
  static _flattenTOC(nodes) {
    const toc = {};
    const addNode = node => {
      if ( toc[node.slug] ) {
        let i = 1;
        while ( toc[`${node.slug}$${i}`] ) i++;
        node.slug = `${node.slug}$${i}`;
      }
      toc[node.slug] = node;
      return node.slug;
    };
    const flattenNode = node => {
      const slug = addNode(node);
      while ( node.children.length ) {
        if ( typeof node.children[0] === "string" ) break;
        const child = node.children.shift();
        node.children.push(flattenNode(child));
      }
      return slug;
    };
    nodes.forEach(flattenNode);
    return toc;
  }

  /* -------------------------------------------- */

  /**
   * Construct a table of contents node from a heading element.
   * @param {HTMLHeadingElement} heading             The heading element.
   * @param {object} [options]                       Additional options to configure the returned node.
   * @param {boolean} [options.includeElement=true]  Whether to include the DOM element in the returned ToC node.
   * @returns {JournalEntryPageHeading}
   * @protected
   */
  static _makeHeadingNode(heading, {includeElement=true}={}) {
    const node = {
      text: heading.innerText,
      level: Number(heading.tagName[1]),
      slug: heading.id || this.slugifyHeading(heading),
      children: []
    };
    if ( includeElement ) node.element = heading;
    return node;
  }

  /* -------------------------------------------- */
  /*  Methods                                     */
  /* -------------------------------------------- */

  /** @inheritdoc */
  _createDocumentLink(eventData, {relativeTo, label}={}) {
    const uuid = relativeTo ? this.getRelativeUUID(relativeTo) : this.uuid;
    if ( eventData.anchor?.slug ) {
      label ??= eventData.anchor.name;
      return `@UUID[${uuid}#${eventData.anchor.slug}]{${label}}`;
    }
    return super._createDocumentLink(eventData, {relativeTo, label});
  }

  /* -------------------------------------------- */

  /** @inheritdoc */
  _onClickDocumentLink(event) {
    const target = event.currentTarget;
    return this.parent.sheet.render(true, {pageId: this.id, anchor: target.dataset.hash});
  }

  /* -------------------------------------------- */

  /** @inheritdoc */
  _onUpdate(changed, options, userId) {
    super._onUpdate(changed, options, userId);
    if ( "text.content" in foundry.utils.flattenObject(changed) ) this._toc = null;
    if ( !canvas.ready ) return;
    if ( ["name", "ownership"].some(k => k in changed) ) {
      canvas.notes.placeables.filter(n => n.page === this).forEach(n => n.draw());
    }
  }
}
