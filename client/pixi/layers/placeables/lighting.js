/**
 * The Lighting Layer which ambient light sources as part of the CanvasEffectsGroup.
 * @category - Canvas
 */
class LightingLayer extends PlaceablesLayer {

  /** @inheritdoc */
  static documentName = "AmbientLight";

  /** @inheritdoc */
  static get layerOptions() {
    return foundry.utils.mergeObject(super.layerOptions, {
      name: "lighting",
      rotatableObjects: true,
      zIndex: 300
    });
  }

  /* -------------------------------------------- */

  /** @inheritdoc */
  get hookName() {
    return LightingLayer.name;
  }

  /* -------------------------------------------- */
  /*  Methods                                     */
  /* -------------------------------------------- */

  /** @override */
  _activate() {
    super._activate();
    for ( const p of this.placeables ) p.renderFlags.set({refreshField: true});
  }

  /* -------------------------------------------- */
  /*  Event Listeners and Handlers                */
  /* -------------------------------------------- */

  /** @override */
  async _onDragLeftStart(event) {
    await super._onDragLeftStart(event);

    // Create a pending AmbientLightDocument
    const interaction = event.interactionData;
    const cls = getDocumentClass("AmbientLight");
    const doc = new cls(interaction.origin, {parent: canvas.scene});

    // Create the preview AmbientLight object
    const preview = new this.constructor.placeableClass(doc);

    // Updating interaction data
    interaction.preview = this.preview.addChild(preview);
    interaction.lightsState = 1;

    // Prepare to draw the preview
    canvas.effects.lightSources.set(preview.sourceId, preview.source);
    return preview.draw();
  }

  /* -------------------------------------------- */

  /** @override */
  _onDragLeftMove(event) {
    const {destination, lightsState, preview, origin} = event.interactionData;
    if ( lightsState === 0 ) return;

    // Update the light radius
    const radius = Math.hypot(destination.x - origin.x, destination.y - origin.y);

    // Update the preview object data
    preview.document.config.dim = radius * (canvas.dimensions.distance / canvas.dimensions.size);
    preview.document.config.bright = preview.document.config.dim / 2;

    // Refresh the layer display
    preview.updateSource();

    // Confirm the creation state
    event.interactionData.lightsState = 2;
  }

  /* -------------------------------------------- */

  /** @override */
  _onDragLeftCancel(event) {
    super._onDragLeftCancel(event);
    canvas.effects.lightSources.delete(`${this.constructor.documentName}.preview`);
    canvas.effects.refreshLighting();
    event.interactionData.lightsState = 0;
  }

  /* -------------------------------------------- */

  /** @override */
  _onMouseWheel(event) {

    // Identify the hovered light source
    const light = this.hover;
    if ( !light || (light.document.config.angle === 360) ) return;

    // Determine the incremental angle of rotation from event data
    let snap = event.shiftKey ? 15 : 3;
    let delta = snap * Math.sign(event.delta);
    return light.rotate(light.document.rotation + delta, snap);
  }

  /* -------------------------------------------- */

  /**
   * Actions to take when the darkness level of the Scene is changed
   * @param {number} darkness   The new darkness level
   * @param {number} prior      The prior darkness level
   * @internal
   */
  _onDarknessChange(darkness, prior) {
    for ( const light of this.placeables ) {
      if ( light.emitsLight === light.source.disabled ) light.updateSource();
      if ( this.active ) light.renderFlags.set({refreshState: true, refreshField: true});
    }
  }

  /* -------------------------------------------- */
  /*  Deprecations and Compatibility              */
  /* -------------------------------------------- */

  /**
   * @deprecated since v10
   * @ignore
   */
  get background() {
    const msg = "LightingLayer#background has been refactored to EffectsCanvasGroup#background";
    foundry.utils.logCompatibilityWarning(msg, {since: 10, until: 12});
    return canvas.effects.background;
  }

  /**
   * @deprecated since v10
   * @ignore
   */
  get illumination() {
    const msg = "LightingLayer#illumination has been refactored to EffectsCanvasGroup#illumination";
    foundry.utils.logCompatibilityWarning(msg, {since: 10, until: 12});
    return canvas.effects.illumination;
  }

  /**
   * @deprecated since v10
   * @ignore
   */
  get channels() {
    const msg = "LightingLayer#channels has been refactored to EffectsCanvasGroup#lightingChannelColors";
    foundry.utils.logCompatibilityWarning(msg, {since: 10, until: 12});
    return canvas.effects.lightingChannelColors;
  }

  /**
   * @deprecated since v10
   * @ignore
   */
  get coloration() {
    const msg = "LightingLayer#coloration has been refactored to EffectsCanvasGroup#coloration";
    foundry.utils.logCompatibilityWarning(msg, {since: 10, until: 12});
    return canvas.effects.coloration;
  }

  /**
   * @deprecated since v10
   * @ignore
   */
  get darknessLevel() {
    const msg = "LightingLayer#darknessLevel has been refactored to Canvas#darknessLevel";
    foundry.utils.logCompatibilityWarning(msg, {since: 10, until: 12});
    return canvas.darknessLevel;
  }

  /**
   * @deprecated since v10
   * @ignore
   */
  get globalLight() {
    const msg = "LightingLayer#globalLight has been refactored to CanvasIlluminationEffects#globalLight";
    foundry.utils.logCompatibilityWarning(msg, {since: 10, until: 12});
    return canvas.effects.illumination.globalLight;
  }

  /**
   * @deprecated since v10
   * @ignore
   */
  get sources() {
    const msg = "LightingLayer#sources has been refactored to EffectsCanvasGroup#lightSources";
    foundry.utils.logCompatibilityWarning(msg, {since: 10, until: 12});
    return canvas.effects.lightSources;
  }

  /**
   * @deprecated since v10
   * @ignore
   */
  get version() {
    const msg = "LightingLayer#version has been refactored to EffectsCanvasGroup#lightingVersion";
    foundry.utils.logCompatibilityWarning(msg, {since: 10, until: 12});
    return canvas.effects.lightingVersion;
  }

  /**
   * @deprecated since v10
   * @ignore
   */
  activateAnimation() {
    const msg = "LightingLayer#activateAnimation has been refactored to EffectsCanvasGroup#activateAnimation";
    foundry.utils.logCompatibilityWarning(msg, {since: 10, until: 12});
    return canvas.effects.activateAnimation();
  }

  /**
   * @deprecated since v10
   * @ignore
   */
  deactivateAnimation() {
    const msg = "LightingLayer#deactivateAnimation has been refactored to EffectsCanvasGroup#deactivateAnimation";
    foundry.utils.logCompatibilityWarning(msg, {since: 10, until: 12});
    return canvas.effects.deactivateAnimation();
  }

  /**
   * @deprecated since v10
   * @ignore
   */
  animateDarkness(...args) {
    const msg = "LightingLayer#animateDarkness has been refactored to EffectsCanvasGroup#animateDarkness";
    foundry.utils.logCompatibilityWarning(msg, {since: 10, until: 12});
    return canvas.effects.animateDarkness(...args);
  }

  /**
   * @deprecated since v10
   * @ignore
   */
  initializeSources() {
    const msg = "LightingLayer#initializeSources has been refactored to EffectsCanvasGroup#initializeLightSources";
    foundry.utils.logCompatibilityWarning(msg, {since: 10, until: 12});
    return canvas.effects.initializeLightSources();
  }

  /**
   * @deprecated since v10
   * @ignore
   */
  refresh(options) {
    const msg = "LightingLayer#refresh has been refactored to EffectsCanvasGroup#refreshLighting";
    foundry.utils.logCompatibilityWarning(msg, {since: 10, until: 12});
    return canvas.effects.refreshLighting(options);
  }
}
