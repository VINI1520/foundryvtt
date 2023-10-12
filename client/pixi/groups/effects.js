/**
 * A container group which contains visual effects rendered above the primary group.
 *
 * ### Hook Events
 * - {@link hookEvents.drawEffectsCanvasGroup}
 * - {@link hookEvents.createEffectsCanvasGroup}
 * - {@link hookEvents.lightingRefresh}
 *
 * @category - Canvas
 */
class EffectsCanvasGroup extends PIXI.Container {
  constructor() {
    super();
    this.#createLayers();
  }

  /**
   * The current global light source.
   * @type {GlobalLightSource}
   */
  globalLightSource;

  /**
   * Whether to currently animate light sources.
   * @type {boolean}
   */
  animateLightSources = true;

  /**
   * Whether to currently animate vision sources.
   * @type {boolean}
   */
  animateVisionSources = true;

  /**
   * A mapping of light sources which are active within the rendered Scene.
   * @type {Collection<string, LightSource>}
   */
  lightSources = new foundry.utils.Collection();

  /**
   * A Collection of vision sources which are currently active within the rendered Scene.
   * @type {Collection<string, VisionSource>}
   */
  visionSources = new foundry.utils.Collection();

  /* -------------------------------------------- */

  /**
   * Create the child layers of the effects group.
   * @private
   */
  #createLayers() {

    /**
     * A set of vision mask filters used in visual effects group
     * @type {Set<VisualEffectsMaskingFilter>}
     */
    this.visualEffectsMaskingFilters = new Set();

    /**
     * A layer of background alteration effects which change the appearance of the primary group render texture.
     * @type {CanvasBackgroundAlterationEffects}
     */
    this.background = this.addChild(new CanvasBackgroundAlterationEffects());

    /**
     * A layer which adds illumination-based effects to the scene.
     * @type {CanvasIlluminationEffects}
     */
    this.illumination = this.addChild(new CanvasIlluminationEffects());

    /**
     * A layer which adds color-based effects to the scene.
     * @type {CanvasColorationEffects}
     */
    this.coloration = this.addChild(new CanvasColorationEffects());

    /**
     * A layer which controls the current visibility of the scene.
     * @type {CanvasVisibility}
     */
    this.visibility = this.addChild(new CanvasVisibility());

    // Call hooks
    Hooks.callAll("createEffectsCanvasGroup", this);
  }

  /* -------------------------------------------- */

  /**
   * Clear all effects containers and animated sources.
   */
  clearEffects() {
    this.background.clear();
    this.illumination.clear();
    this.coloration.clear();
  }

  /* -------------------------------------------- */

  /**
   * Draw the component layers of the canvas group.
   * @returns {Promise<void>}
   */
  async draw() {
    this.globalLightSource = new GlobalLightSource();
    this.updateGlobalLightSource();

    // Draw each component layer
    await this.background.draw();
    await this.illumination.draw();
    await this.coloration.draw();
    await this.visibility.draw();

    // Call hooks
    Hooks.callAll("drawEffectsCanvasGroup", this);

    // Activate animation of drawn objects
    this.activateAnimation();
  }

  /* -------------------------------------------- */

  /**
   * Actions to take when the darkness level is changed
   * @param {number} darkness   The new darkness level
   * @param {number} prior      The prior darkness level
   * @internal
   */
  _onDarknessChange(darkness, prior) {
    this.updateGlobalLightSource();
  }

  /* -------------------------------------------- */

  /**
   * Initialize LightSource objects for all AmbientLightDocument instances which exist within the active Scene.
   */
  initializeLightSources() {
    this.lightSources.clear();

    // Global light source
    this.updateGlobalLightSource({defer: true});

    // Ambient Light sources
    for ( let light of canvas.lighting.placeables ) {
      light.updateSource({defer: true});
    }
    for ( let light of canvas.lighting.preview.children ) {
      light.updateSource({defer: true});
    }

    // Token light sources
    for ( let token of canvas.tokens.placeables ) {
      token.updateLightSource({defer: true});
    }
    for ( let token of canvas.tokens.preview.children ) {
      token.updateLightSource({defer: true});
    }

    Hooks.callAll("initializeLightSources", this);
  }

  /* -------------------------------------------- */

  /**
   * Update the global light source which provides global illumination to the Scene.
   * @param {object} [options={}]         Options which modify how the source is updated
   * @param {boolean} [options.defer]     Defer updating perception to manually update it later
   */
  updateGlobalLightSource({defer=false}={}) {
    if ( !this.globalLightSource ) return;

    const {sceneX, sceneY, maxR} = canvas.dimensions;
    const {globalLight, globalLightThreshold} = canvas.scene;
    const disabled = !(globalLight && ((globalLightThreshold === null)
      || (canvas.darknessLevel <= globalLightThreshold)));

    this.globalLightSource.initialize(foundry.utils.mergeObject({
      x: sceneX,
      y: sceneY,
      elevation: Infinity,
      dim: maxR,
      walls: false,
      vision: false,
      luminosity: 0,
      disabled
    }, CONFIG.Canvas.globalLightConfig));
    this.lightSources.set("globalLight", this.globalLightSource);

    if ( !defer ) canvas.perception.update({refreshLighting: true, refreshVision: true});
  }

  /* -------------------------------------------- */

  /**
   * Refresh the state and uniforms of all LightSource objects.
   */
  refreshLightSources() {
    for ( const lightSource of this.lightSources ) lightSource.refresh();
  }

  /* -------------------------------------------- */

  /**
   * Refresh the state and uniforms of all VisionSource objects.
   */
  refreshVisionSources() {
    for ( const visionSource of this.visionSources ) visionSource.refresh();
  }

  /* -------------------------------------------- */

  /**
   * Refresh the active display of lighting.
   */
  refreshLighting() {
    // Apply illumination and visibility background color change
    this.illumination.backgroundColor = canvas.colors.background;
    const v = this.visibility.filter;
    if ( v ) {
      v.uniforms.visionTexture = canvas.masks.vision.renderTexture;
      v.uniforms.primaryTexture = canvas.primary.renderTexture;
      canvas.colors.fogExplored.applyRGB(v.uniforms.exploredColor);
      canvas.colors.fogUnexplored.applyRGB(v.uniforms.unexploredColor);
      canvas.colors.background.applyRGB(v.uniforms.backgroundColor);
    }

    // Clear effects
    canvas.effects.clearEffects();

    // Add lighting effects
    for ( const lightSource of this.lightSources.values() ) {
      if ( !lightSource.active ) continue;
      // Draw the light update
      const meshes = lightSource.drawMeshes();
      if ( meshes.background ) this.background.lighting.addChild(meshes.background);
      if ( meshes.illumination ) this.illumination.lights.addChild(meshes.illumination);
      if ( meshes.coloration ) this.coloration.addChild(meshes.coloration);
    }

    // Add effect meshes for active vision sources
    this.#addVisionEffects();

    // Call hooks
    Hooks.callAll("lightingRefresh", this);
  }

  /* -------------------------------------------- */

  /**
   * Add effect meshes for active vision sources.
   * @private
   */
  #addVisionEffects() {
    for ( const visionSource of this.visionSources ) {
      if ( !visionSource.active || (visionSource.radius <= 0) ) continue;
      const meshes = visionSource.drawMeshes();
      if ( meshes.background ) {
        // Is this vision source background need to be rendered into the preferred vision container, over other VS?
        const parent = visionSource.preferred ? this.background.visionPreferred : this.background.vision;
        parent.addChild(meshes.background);
      }
      if ( meshes.illumination ) this.illumination.lights.addChild(meshes.illumination);
      if ( meshes.coloration ) this.coloration.addChild(meshes.coloration);
    }

    this.background.vision.filter.enabled = !!this.background.vision.children.length;
    this.background.visionPreferred.filter.enabled = !!this.background.visionPreferred.children.length;
  }

  /* -------------------------------------------- */

  /**
   * Perform a deconstruction workflow for this canvas group when the canvas is retired.
   * @returns {Promise<void>}
   */
  async tearDown() {
    this.deactivateAnimation();
    this.lightSources.clear();
    this.globalLightSource?.destroy();
    this.globalLightSource = undefined;
    for ( const c of this.children ) {
      if ( c.clear ) c.clear();
      else if ( c.tearDown ) await c.tearDown();
      else c.destroy();
    }
    this.visualEffectsMaskingFilters.clear();
    Hooks.callAll("tearDownEffectsCanvasGroup", this);
  }

  /* -------------------------------------------- */

  /**
   * Activate vision masking for visual effects
   * @param {boolean} [enabled=true]    Whether to enable or disable vision masking
   */
  toggleMaskingFilters(enabled=true) {
    for ( const f of this.visualEffectsMaskingFilters ) {
      f.uniforms.enableVisionMasking = enabled;
    }
  }

  /* -------------------------------------------- */

  /**
   * Activate post-processing effects for a certain effects channel.
   * @param {string} filterMode                     The filter mode to target.
   * @param {string[]} [postProcessingModes=[]]     The post-processing modes to apply to this filter.
   * @param {Object} [uniforms={}]                  The uniforms to update.
   */
  activatePostProcessingFilters(filterMode, postProcessingModes=[], uniforms={}) {
    for ( const f of this.visualEffectsMaskingFilters ) {
      if ( f.filterMode === filterMode ) {
        f.updatePostprocessModes(postProcessingModes, uniforms);
      }
    }
  }

  /* -------------------------------------------- */

  /**
   * Reset post-processing modes on all Visual Effects masking filters.
   */
  resetPostProcessingFilters() {
    for ( const f of this.visualEffectsMaskingFilters ) {
      f.reset();
    }
  }

  /* -------------------------------------------- */
  /*  Animation Management                        */
  /* -------------------------------------------- */

  /**
   * Activate light source animation for AmbientLight objects within this layer
   */
  activateAnimation() {
    this.deactivateAnimation();
    if ( game.settings.get("core", "lightAnimation") === false ) return;
    canvas.app.ticker.add(this.#animateSources, this);
  }

  /* -------------------------------------------- */

  /**
   * Deactivate light source animation for AmbientLight objects within this layer
   */
  deactivateAnimation() {
    canvas.app.ticker.remove(this.#animateSources, this);
  }

  /* -------------------------------------------- */

  /**
   * The ticker handler which manages animation delegation
   * @param {number} dt   Delta time
   * @private
   */
  #animateSources(dt) {

    // Animate Light Sources
    if ( this.animateLightSources ) {
      for ( const source of this.lightSources.values() ) {
        source.animate(dt);
      }
    }

    // Animate Vision Sources
    if ( this.animateVisionSources ) {
      for ( const source of this.visionSources.values() ) {
        source.animate(dt);
      }
    }
  }

  /* -------------------------------------------- */

  /**
   * Animate a smooth transition of the darkness overlay to a target value.
   * Only begin animating if another animation is not already in progress.
   * @param {number} target     The target darkness level between 0 and 1
   * @param {number} duration   The desired animation time in milliseconds. Default is 10 seconds
   * @returns {Promise}         A Promise which resolves once the animation is complete
   */
  async animateDarkness(target=1.0, {duration=10000}={}) {
    const animationName = "lighting.animateDarkness";
    CanvasAnimation.terminateAnimation(animationName);
    if ( target === canvas.darknessLevel ) return false;
    if ( duration <= 0 ) return canvas.colorManager.initialize({darknessLevel: target});

    // Update with an animation
    const animationData = [{
      parent: {darkness: canvas.darknessLevel},
      attribute: "darkness",
      to: Math.clamped(target, 0, 1)
    }];
    return CanvasAnimation.animate(animationData, {
      name: animationName,
      duration: duration,
      ontick: (dt, animation) =>
        canvas.colorManager.initialize({darknessLevel: animation.attributes[0].parent.darkness})
    });
  }
}
