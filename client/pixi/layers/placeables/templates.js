/**
 * This Canvas Layer provides a container for MeasuredTemplate objects.
 * @category - Canvas
 */
class TemplateLayer extends PlaceablesLayer {

  /** @inheritdoc */
  static get layerOptions() {
    return foundry.utils.mergeObject(super.layerOptions, {
      name: "templates",
      canDragCreate: true,
      rotatableObjects: true,
      sortActiveTop: true,  // TODO this needs to be removed
      zIndex: 50
    });
  }

  /** @inheritdoc */
  static documentName = "MeasuredTemplate";

  /* -------------------------------------------- */

  /** @inheritdoc */
  get hookName() {
    return TemplateLayer.name;
  }

  /* -------------------------------------------- */
  /*  Methods                                     */
  /* -------------------------------------------- */

  /** @inheritDoc */
  _activate() {
    super._activate();
    for ( const t of this.placeables ) t.controlIcon.visible = t.ruler.visible = t.isVisible;
  }

  /* -------------------------------------------- */

  /** @inheritDoc */
  _deactivate() {
    super._deactivate();
    this.objects.visible = true;
    for ( const t of this.placeables ) t.controlIcon.visible = t.ruler.visible = false;
  }

  /* -------------------------------------------- */

  /**
   * Register game settings used by the TemplatesLayer
   */
  static registerSettings() {
    game.settings.register("core", "coneTemplateType", {
      name: "TEMPLATE.ConeTypeSetting",
      hint: "TEMPLATE.ConeTypeSettingHint",
      scope: "world",
      config: true,
      default: "round",
      type: String,
      choices: {
        flat: "TEMPLATE.ConeTypeFlat",
        round: "TEMPLATE.ConeTypeRound"
      },
      onChange: () => canvas.templates?.placeables.filter(t => t.document.t === "cone").forEach(t => t.draw())
    });
  }

  /* -------------------------------------------- */
  /*  Event Listeners and Handlers                */
  /* -------------------------------------------- */

  /** @inheritdoc */
  async _onDragLeftStart(event) {
    await super._onDragLeftStart(event);
    const {origin, originalEvent} = event.data;

    // Create a pending MeasuredTemplateDocument
    const tool = game.activeTool;
    const previewData = {
      user: game.user.id,
      t: tool,
      x: origin.x,
      y: origin.y,
      distance: 1,
      direction: 0,
      fillColor: game.user.color || "#FF0000",
      hidden: originalEvent.altKey
    };
    const defaults = CONFIG.MeasuredTemplate.defaults;
    if ( tool === "cone") previewData.angle = defaults.angle;
    else if ( tool === "ray" ) previewData.width = (defaults.width * canvas.dimensions.distance);
    const cls = getDocumentClass("MeasuredTemplate");
    const doc = new cls(previewData, {parent: canvas.scene});

    // Create a preview MeasuredTemplate object
    const template = new this.constructor.placeableClass(doc);
    event.data.preview = this.preview.addChild(template);
    return template.draw();
  }

  /* -------------------------------------------- */

  /** @inheritdoc */
  _onDragLeftMove(event) {
    const { destination, createState, preview, origin } = event.data;
    if ( createState === 0 ) return;

    // Snap the destination to the grid
    event.data.destination = canvas.grid.getSnappedPosition(destination.x, destination.y, this.gridPrecision);

    // Compute the ray
    const ray = new Ray(origin, destination);
    const ratio = (canvas.dimensions.size / canvas.dimensions.distance);

    // Update the preview object
    preview.document.direction = Math.normalizeDegrees(Math.toDegrees(ray.angle));
    preview.document.distance = ray.distance / ratio;
    preview.refresh();

    // Confirm the creation state
    event.data.createState = 2;
  }

  /* -------------------------------------------- */

  /** @inheritdoc */
  _onMouseWheel(event) {

    // Determine whether we have a hovered template?
    const template = this.hover;
    if ( !template ) return;

    // Determine the incremental angle of rotation from event data
    let snap = event.shiftKey ? 15 : 5;
    let delta = snap * Math.sign(event.delta);
    return template.rotate(template.document.direction + delta, snap);
  }
}
