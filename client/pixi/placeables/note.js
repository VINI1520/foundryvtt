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
  async _draw() {
    this.controlIcon = this.addChild(this._drawControlIcon());
    this.tooltip = this.addChild(this._drawTooltip());
  }

  /* -------------------------------------------- */

  /**
   * Draw the ControlIcon for the Map Note
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
   * Draw the map note Tooltip as a Text object
   * @returns {PIXI.Text}
   * @protected
   */
  _drawTooltip() {

    // Create the Text object
    const textStyle = this._getTextStyle();
    const text = new PreciseText(this.text, textStyle);
    text.visible = false;
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
    return text;
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

  /** @override */
  _refresh(options) {
    this.position.set(this.document.x, this.document.y);
    this.controlIcon.border.visible = this.tooltip.visible = this.hover;
    this.visible = this.isVisible;
  }

  /* -------------------------------------------- */
  /*  Event Handlers                              */
  /* -------------------------------------------- */

  /** @override */
  _onUpdate(data) {
    this.layer.quadtree.update({r: this.bounds, t: this});
    this.draw();
  }

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
    this.zIndex = Math.max(...this.layer.placeables.map(n => n.document.z || 0)) + 1;
    return super._onHoverIn(event, options);
  }

  /* -------------------------------------------- */

  /** @inheritdoc */
  _onHoverOut(event) {
    this.zIndex = this.document.z;
    return super._onHoverOut(event);
  }

  /* -------------------------------------------- */

  /** @inheritdoc */
  _onClickLeft2(event) {
    const options = {};
    if ( this.page ) {
      options.mode = JournalSheet.VIEW_MODES.SINGLE;
      options.pageId = this.page.id;
    }
    /**
     * A hook event that fires whenever a map note is double-clicked.
     * The hook provides the note placeable and the arguments passed to the associated {@link JournalSheet} render call.
     * Hooked functions may modify the render arguments or cancel the render by returning false.
     *
     * @function activateNote
     * @memberof hookEvents
     * @param {Note} note  The note that was activated.
     * @param {object} options  Options for rendering the associated {@link JournalSheet}.
     */
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
