/**
 * A Note is an implementation of PlaceableObject which represents an annotated location within the Scene.
 * Each Note links to a JournalEntry document and represents its location on the map.
 * @category - Canvas
 * @see {@link NoteDocument}
 * @see {@link NotesLayer}
 */
class Note extends PlaceableObject {

  /** @inheritdoc */
  static embeddedName = "Note";

  /** @override */
  static RENDER_FLAGS = {
    redraw: {propagate: ["refresh"]},
    refresh: {propagate: ["refreshState", "refreshPosition", "refreshText"], alias: true},
    refreshPosition: {propagate: ["refreshVisibility"]},
    refreshState: {propagate: ["refreshVisibility"]},
    refreshVisibility: {},
    refreshText: {}
  };

  /* -------------------------------------------- */

  /** @override */
  get bounds() {
    const {x, y, iconSize} = this.document;
    const r = iconSize / 2;
    return new PIXI.Rectangle(x - r, y - r, 2*r, 2*r);
  }

  /* -------------------------------------------- */

  /**
   * The associated JournalEntry which is referenced by this Note
   * @type {JournalEntry}
   */
  get entry() {
    return this.document.entry;
  }

  /* -------------------------------------------- */

  /**
   * The specific JournalEntryPage within the associated JournalEntry referenced by this Note.
   */
  get page() {
    return this.document.page;
  }

  /* -------------------------------------------- */

  /**
   * The text label used to annotate this Note
   * @type {string}
   */
  get text() {
    return this.document.label;
  }

  /* -------------------------------------------- */

  /**
   * The Map Note icon size
   * @type {number}
   */
  get size() {
    return this.document.iconSize || 40;
  }

  /* -------------------------------------------- */

  /**
   * Determine whether the Note is visible to the current user based on their perspective of the Scene.
   * Visibility depends on permission to the underlying journal entry, as well as the perspective of controlled Tokens.
   * If Token Vision is required, the user must have a token with vision over the note to see it.
   * @type {boolean}
   */
  get isVisible() {
    const accessTest = this.page ? this.page : this.entry;
    const access = accessTest?.testUserPermission(game.user, "LIMITED") ?? true;
    if ( (access === false) || !canvas.effects.visibility.tokenVision || this.document.global ) return access;
    const point = {x: this.document.x, y: this.document.y};
    const tolerance = this.document.iconSize / 4;
    return canvas.effects.visibility.testVisibility(point, {tolerance, object: this});
  }

  /* -------------------------------------------- */
  /* Rendering
  /* -------------------------------------------- */

  /** @override */
  async _draw(options) {
    this.controlIcon = this.addChild(this._drawControlIcon());
    this._drawTooltip();
  }

  /* -------------------------------------------- */

  /**
   * Draw the ControlIcon for the Map Note.
   * This method replaces any prior controlIcon with the new one.
   * @returns {ControlIcon}
   * @protected
   */
  _drawControlIcon() {
    let tint = Color.from(this.document.texture.tint || null);
    let icon = new ControlIcon({texture: this.document.texture.src, size: this.size, tint});
    icon.x -= (this.size / 2);
    icon.y -= (this.size / 2);
    return icon;
  }

  /* -------------------------------------------- */

  /**
   * Draw the map note Tooltip as a Text object.
   * This method replaces any prior text with the new one.
   * @returns {PIXI.Text}
   * @protected
   */
  _drawTooltip() {

    // Destroy any prior text
    if ( this.tooltip ) {
      this.removeChild(this.tooltip);
      this.tooltip = undefined;
    }

    // Create the Text object
    const textStyle = this._getTextStyle();
    const text = new PreciseText(this.text, textStyle);
    text.visible = false;
    text.eventMode = "none";
    const halfPad = (0.5 * this.size) + 12;

    // Configure Text position
    switch ( this.document.textAnchor ) {
      case CONST.TEXT_ANCHOR_POINTS.CENTER:
        text.anchor.set(0.5, 0.5);
        text.position.set(0, 0);
        break;
      case CONST.TEXT_ANCHOR_POINTS.BOTTOM:
        text.anchor.set(0.5, 0);
        text.position.set(0, halfPad);
        break;
      case CONST.TEXT_ANCHOR_POINTS.TOP:
        text.anchor.set(0.5, 1);
        text.position.set(0, -halfPad);
        break;
      case CONST.TEXT_ANCHOR_POINTS.LEFT:
        text.anchor.set(1, 0.5);
        text.position.set(-halfPad, 0);
        break;
      case CONST.TEXT_ANCHOR_POINTS.RIGHT:
        text.anchor.set(0, 0.5);
        text.position.set(halfPad, 0);
        break;
    }

    // Add child and return
    return this.tooltip = this.addChild(text);
  }

  /* -------------------------------------------- */

  /**
   * Define a PIXI TextStyle object which is used for the tooltip displayed for this Note
   * @returns {PIXI.TextStyle}
   * @protected
   */
  _getTextStyle() {
    const style = CONFIG.canvasTextStyle.clone();

    // Positioning
    if ( this.document.textAnchor === CONST.TEXT_ANCHOR_POINTS.LEFT ) style.align = "right";
    else if ( this.document.textAnchor === CONST.TEXT_ANCHOR_POINTS.RIGHT ) style.align = "left";

    // Font preferences
    style.fontFamily = this.document.fontFamily || CONFIG.defaultFontFamily;
    style.fontSize = this.document.fontSize;

    // Toggle stroke style depending on whether the text color is dark or light
    const color = Color.from(this.document.textColor ?? 0xFFFFFF);
    style.fill = color;
    style.strokeThickness = 4;
    style.stroke = color.hsv[2] > 0.6 ? 0x000000 : 0xFFFFFF;
    return style;
  }

  /* -------------------------------------------- */
  /*  Incremental Refresh                         */
  /* -------------------------------------------- */

  /** @override */
  _applyRenderFlags(flags) {
    if ( flags.refreshVisibility ) this._refreshVisibility();
    if ( flags.refreshPosition ) this.#refreshPosition();
    if ( flags.refreshText ) this._drawTooltip();
    if ( flags.refreshState ) this.#refreshState();
  }

  /* -------------------------------------------- */

  /**
   * Refresh the visibility.
   * @protected
   */
  _refreshVisibility() {
    const wasVisible = this.visible;
    this.visible = this.isVisible;
    if ( this.controlIcon ) this.controlIcon.refresh({
      visible: this.visible,
      borderVisible: this.hover || this.layer.highlightObjects
    });
    if ( wasVisible !== this.visible ) this.layer.hintMapNotes();
  }

  /* -------------------------------------------- */

  /**
   * Refresh the state of the Note. Called the Note enters a different interaction state.
   */
  #refreshState() {
    this.alpha = this._getTargetAlpha();
    this.tooltip.visible = this.hover || this.layer.highlightObjects;
  }

  /* -------------------------------------------- */

  /**
   * Refresh the position of the Note. Called with the coordinates change.
   */
  #refreshPosition() {
    this.position.set(this.document.x, this.document.y);
  }

  /* -------------------------------------------- */
  /*  Document Event Handlers                     */
  /* -------------------------------------------- */

  /** @override */
  _onUpdate(data, options, userId) {
    super._onUpdate(data, options, userId);

    // Full Re-Draw
    const changed = new Set(Object.keys(data));
    if ( ["texture", "iconSize"].some(k => changed.has(k)) ) {
      return this.renderFlags.set({redraw: true});
    }

    // Incremental Refresh
    this.renderFlags.set({
      refreshState: ["entryId", "pageId", "global"].some(k => changed.has(k)),
      refreshPosition: ["x", "y"].some(k => changed.has(k)),
      refreshText: ["text", "fontSize", "textAnchor", "textColor"].some(k => changed.has(k))
    });
  }

  /* -------------------------------------------- */
  /*  Interactivity                               */
  /* -------------------------------------------- */

  /** @override */
  _canHover(user) {
    return true;
  }

  /* -------------------------------------------- */

  /** @override */
  _canView(user) {
    if ( !this.entry ) return false;
    if ( game.user.isGM ) return true;
    if ( this.page?.testUserPermission(game.user, "LIMITED", {exact: true}) ) {
      // Special-case handling for image pages.
      return this.page?.type === "image";
    }
    const accessTest = this.page ? this.page : this.entry;
    return accessTest.testUserPermission(game.user, "OBSERVER");
  }

  /* -------------------------------------------- */

  /** @override */
  _canConfigure(user) {
    return canvas.notes.active && this.document.canUserModify(game.user, "update");
  }

  /* -------------------------------------------- */

  /** @inheritdoc */
  _onHoverIn(event, options) {
    this.zIndex = this.parent.children.at(-1).zIndex + 1;
    return super._onHoverIn(event, options);
  }

  /* -------------------------------------------- */

  /** @inheritdoc */
  _onClickLeft2(event) {
    const options = {};
    if ( this.page ) {
      options.mode = JournalSheet.VIEW_MODES.SINGLE;
      options.pageId = this.page.id;
    }
    const allowed = Hooks.call("activateNote", this, options);
    if ( !allowed || !this.entry ) return;
    if ( this.page?.type === "image" ) {
      return new ImagePopout(this.page.src, {
        uuid: this.page.uuid,
        title: this.page.name,
        caption: this.page.image.caption
      }).render(true);
    }
    this.entry.sheet.render(true, options);
  }
}
