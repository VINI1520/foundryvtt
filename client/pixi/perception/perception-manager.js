/**
 * A helper class which manages the refresh workflow for perception layers on the canvas.
 * This controls the logic which batches multiple requested updates to minimize the amount of work required.
 * A singleton instance is available as canvas#perception.
 * @see {Canvas#perception}
 */
class PerceptionManager extends RenderFlagsMixin(Object) {

  /**
   * @typedef {RenderFlags} PerceptionManagerFlags
   * @property {boolean} initializeLighting       Re-initialize the entire lighting configuration
   * @property {boolean} refreshLighting          Refresh the rendered appearance of lighting
   * @property {boolean} refreshLightSources      Update the configuration of light sources
   * @property {boolean} initializeVision         Re-initialize the entire vision configuration
   * @property {boolean} refreshVisionSources     Update the configuration of vision sources
   * @property {boolean} refreshVision            Refresh the rendered appearance of vision
   * @property {boolean} initializeSounds         Re-initialize the entire ambient sound configuration
   * @property {boolean} refreshSounds            Refresh the audio state of ambient sounds
   * @property {boolean} soundFadeDuration        Apply a fade duration to sound refresh workflow
   * @property {boolean} refreshTiles             Refresh the visual appearance of tiles
   * @property {boolean} refreshPrimary           Refresh the contents of the PrimaryCanvasGroup mesh
   */

  /** @override */
  static RENDER_FLAGS = {
    initializeLighting: {propagate: ["refreshLighting", "refreshVision"]},
    refreshLighting: {propagate: ["refreshLightSources"]},
    refreshLightSources: {},
    refreshVisionSources: {},
    refreshPrimary: {},
    initializeVision: {propagate: ["refreshVision", "refreshTiles", "refreshLighting", "refreshLightSources",
      "refreshPrimary"]},
    refreshVision: {propagate: ["refreshVisionSources"]},
    initializeSounds: {propagate: ["refreshSounds"]},
    refreshSounds: {},
    refreshTiles: {propagate: ["refreshLightSources", "refreshVisionSources"]},
    soundFadeDuration: {},
    identifyInteriorWalls: {propagate: ["initializeLighting", "initializeVision"]},
    forceUpdateFog: {propagate: ["refreshVision"]}
  };

  /** @override */
  static RENDER_FLAG_PRIORITY = "PERCEPTION";

  /* -------------------------------------------- */

  /** @override */
  applyRenderFlags() {
    if ( !this.renderFlags.size ) return;
    const flags = this.renderFlags.clear();

    // Sort the children of the primary canvas group
    if ( flags.refreshTiles && canvas.primary.sortDirty ) canvas.primary.sortChildren();

    // Identify interior walls
    if ( flags.identifyInteriorWalls ) canvas.walls.identifyInteriorWalls();

    // Initialize perception sources for each layer
    if ( flags.initializeLighting ) canvas.effects.initializeLightSources();
    if ( flags.initializeVision ) canvas.effects.visibility.initializeSources();
    if ( flags.initializeSounds ) canvas.sounds.initializeSources();

    // Next refresh sources uniforms and states
    if ( flags.refreshLightSources ) canvas.effects.refreshLightSources();
    if ( flags.refreshVisionSources ) canvas.effects.refreshVisionSources();
    if ( flags.refreshPrimary ) canvas.primary.refreshPrimarySpriteMesh();

    // Next refresh lighting to establish the coloration channels for the Scene
    if ( flags.refreshLighting ) canvas.effects.refreshLighting();

    // Next refresh vision and fog of war
    if ( flags.refreshVision ) canvas.effects.visibility.refresh();

    // Update the playback of ambient sounds
    if ( flags.refreshSounds ) canvas.sounds.refresh({fade: flags.soundFadeDuration ? 250 : 0});

    // Update roof occlusion states based on token positions and vision
    if ( flags.refreshTiles ) canvas.masks.occlusion.updateOcclusion();

    // Call deprecated flag
    if ( flags.forceUpdateFog ) PerceptionManager.forceUpdateFog();
  }

  /* -------------------------------------------- */

  /**
   * A shim mapping which supports backwards compatibility for old-style (V9 and before) perception manager flags.
   * @enum {string}
   */
  static COMPATIBILITY_MAPPING = {
    "lighting.initialize": "initializeLighting",
    "lighting.refresh": "refreshLighting",
    "sight.initialize": "initializeVision",
    "sight.refresh": "refreshVision",
    "sounds.initialize": "initializeSounds",
    "sounds.refresh": "refreshSounds",
    "sounds.fade": "soundFadeDuration",
    "foreground.refresh": "refreshTiles"
  };

  /**
   * Update perception manager flags which configure which behaviors occur on the next frame render.
   * @param {object} flags        Flag values (true) to assign where the keys belong to PerceptionManager.FLAGS
   * @param {boolean} [v2=true]   Opt-in to passing v2 flags, otherwise a backwards compatibility shim will be applied
   */
  update(flags, v2=true) {
    if ( !canvas.ready ) return;

    // Backwards compatibility for V1 flags
    let _flags = v2 ? flags : {};
    if ( !v2 ) {
      const msg = "The data structure of PerceptionManager flags have changed. You are assigning flags with the old "
        + "data structure and must migrate to assigning new flags.";
      foundry.utils.logCompatibilityWarning(msg, {since: 10, until: 12});
      flags = foundry.utils.flattenObject(flags);
      for ( const [flag, value] of Object.entries(flags) ) {
        _flags[PerceptionManager.COMPATIBILITY_MAPPING[flag]] = value;
      }
    }

    // Set flags
    this.renderFlags.set(_flags);
  }

  /* -------------------------------------------- */

  /**
   * A helper function to perform an immediate initialization plus incremental refresh.
   */
  initialize() {
    return this.update({
      initializeLighting: true,
      initializeVision: true,
      initializeSounds: true,
      identifyInteriorWalls: true
    });
  }

  /* -------------------------------------------- */

  /**
   * A helper function to perform an incremental refresh only.
   */
  refresh() {
    return this.update({
      refreshLighting: true,
      refreshVision: true,
      refreshSounds: true,
      refreshTiles: true
    });
  }

  /* -------------------------------------------- */
  /*  Deprecations and Compatibility              */
  /* -------------------------------------------- */

  /**
   * @deprecated since v10
   * @ignore
   */
  cancel() {
    foundry.utils.logCompatibilityWarning("PerceptionManager#cancel is renamed to PerceptionManager#deactivate", {
      since: 10,
      until: 12
    });
    return this.deactivate();
  }

  /* -------------------------------------------- */

  /**
   * @deprecated since v10
   * @ignore
   */
  schedule(options={}) {
    foundry.utils.logCompatibilityWarning("PerceptionManager#schedule is replaced by PerceptionManager#update", {
      since: 10,
      until: 12
    });
    this.update(options, false);
  }

  /* -------------------------------------------- */

  /**
   * @deprecated since v11
   * @ignore
   */
  static forceUpdateFog() {
    foundry.utils.logCompatibilityWarning("forceUpdateFog flag is now obsolete and has no replacement. The fog " +
      "is now always updated when the visibility is refreshed", {
      since: 11,
      until: 13
    });
  }

  /* -------------------------------------------- */

  /**
   * @deprecated since v10
   * @ignore
   */
  static get DEFAULTS() {
    throw new Error("PerceptionManager#DEFAULTS is deprecated without replacement");
  }
}
