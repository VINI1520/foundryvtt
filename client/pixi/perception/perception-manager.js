/**
 * A helper class which manages the refresh workflow for perception layers on the canvas.
 * This controls the logic which batches multiple requested updates to minimize the amount of work required.
 * A singleton instance is available as canvas#perception.
 * @see {Canvas#perception}
 */
class PerceptionManager {

  /**
   * The set of state flags which are supported by the Perception Manager.
   * When a refresh occurs, operations associated with each true flag are executed and the state is reset.
   * @enum {{propagate: string[], reset: string[]}}
   */
  static FLAGS = {
    initializeLighting: {propagate: ["refreshLighting"], reset: []},
    refreshLighting: {propagate: ["refreshLightSources"], reset: []},
    refreshLightSources: {propagate: [], reset: []},
    refreshVisionSources: {propagate: [], reset: []},
    refreshPrimary: {propagate: [], reset: []},
    initializeVision: {propagate: ["refreshVision", "refreshTiles",
      "refreshLighting", "refreshLightSources", "refreshPrimary"], reset: []},
    refreshVision: {propagate: ["refreshVisionSources"], reset: []},
    initializeSounds: {propagate: ["refreshSounds"], reset: []},
    refreshSounds: {propagate: [], reset: []},
    refreshTiles: {propagate: ["refreshLightSources", "refreshVisionSources"], reset: []},
    soundFadeDuration: {propagate: [], reset: []},
    forceUpdateFog: {propagate: [], reset: []}
  };

  /**
   * A shim mapping which supports backwards compatibility for old-style (V9 and before) perception manager flags.
   * @enum {string}
   */
  static COMPATIBILITY_MAPPING = {
    "lighting.initialize": "initializeLighting",
    "lighting.refresh": "refreshLighting",
    "sight.initialize": "initializeVision",
    "sight.refresh": "refreshVision",
    "sight.forceUpdateFog": "forceUpdateFog",
    "sounds.initialize": "initializeSounds",
    "sounds.refresh": "refreshSounds",
    "sounds.fade": "soundFadeDuration",
    "foreground.refresh": "refreshTiles"
  };

  /**
   * A top-level boolean which records whether any flag has changed.
   * @type {boolean}
   */
  #changed = false;

  /**
   * Flags which are scheduled to be enacted with the next frame.
   * @enum {boolean}
   */
  #flags = this.#getFlags();

  /* -------------------------------------------- */
  /*  Perception Manager Methods                  */
  /* -------------------------------------------- */

  /**
   * Activate perception management by registering the update function to the Ticker.
   */
  activate() {
    this.deactivate();
    canvas.app.ticker.add(this.#update, this, PIXI.UPDATE_PRIORITY.HIGH);
  }

  /* -------------------------------------------- */

  /**
   * Deactivate perception management by un-registering the update function from the Ticker.
   */
  deactivate() {
    canvas.app.ticker.remove(this.#update, this);
    this.#reset();
  }

  /* -------------------------------------------- */

  /**
   * Update perception manager flags which configure which behaviors occur on the next frame render.
   * @param {object} flags        Flag values (true) to assign where the keys belong to PerceptionManager.FLAGS
   * @param {boolean} [v2=false]  Opt-in to passing v2 flags, otherwise a backwards compatibility shim will be applied
   */
  update(flags, v2=false) {

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

    // Assign flags
    for ( const [flag, value] of Object.entries(_flags) ) {
      if ( value !== true ) continue;
      const cfg = PerceptionManager.FLAGS[flag];
      this.#flags[flag] = this.#changed = true;
      for ( const p of cfg.propagate ) this.#flags[p] = true;
      for ( const r of cfg.reset ) this.#flags[r] = false;
    }
  }

  /* -------------------------------------------- */

  /**
   * A helper function to perform an immediate initialization plus incremental refresh.
   */
  initialize() {
    return this.update({
      initializeLighting: true,
      initializeVision: true,
      initializeSounds: true
    }, true);
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
    }, true);
  }

  /* -------------------------------------------- */
  /*  Internal Helpers                            */
  /* -------------------------------------------- */

  /**
   * Perform the perception update workflow.
   * @private
   */
  #update() {
    if ( !this.#changed ) return;

    // When an update occurs, immediately reset refresh parameters
    const flags = this.#flags;
    this.#reset();

    // Initialize perception sources for each layer
    if ( flags.initializeLighting ) canvas.effects.initializeLightSources();
    if ( flags.initializeVision ) canvas.effects.visibility.initializeSources();
    if ( flags.initializeSounds ) canvas.sounds.initializeSources();

    // Update roof occlusion states based on token positions and vision
    if ( flags.refreshTiles ) canvas.masks.occlusion.updateOcclusion();

    // Next refresh sources uniforms and states
    if ( flags.refreshLightSources ) canvas.effects.refreshLightSources();
    if ( flags.refreshVisionSources ) canvas.effects.refreshVisionSources();
    if ( flags.refreshPrimary ) canvas.primary.refreshPrimarySpriteMesh();

    // Next refresh lighting to establish the coloration channels for the Scene
    if ( flags.refreshLighting ) canvas.effects.refreshLighting();

    // Next refresh vision and fog of war
    if ( flags.refreshVision ) canvas.effects.visibility.refresh({forceUpdateFog: flags.forceUpdateFog});

    // Lastly update the playback of ambient sounds
    if ( flags.refreshSounds ) canvas.sounds.refresh({fade: flags.soundFadeDuration ? 250 : 0});
  }

  /* -------------------------------------------- */

  /**
   * Reset the values of a pending refresh back to their default states.
   * @private
   */
  #reset() {
    this.#changed = false;
    this.#flags = this.#getFlags();
  }

  /* -------------------------------------------- */

  /**
   * Construct the data structure of boolean flags which are supported by the Perception Manager.
   * @returns {Object<boolean>}
   */
  #getFlags() {
    const flags = {};
    for ( const flag of Object.keys(PerceptionManager.FLAGS) ) {
      flags[flag] = false;
    }
    return flags;
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
    this.update(options);
  }

  /* -------------------------------------------- */

  /**
   * @deprecated since v10
   * @ignore
   */
  static get DEFAULTS() {
    const msg = "PerceptionManager#DEFAULTS is deprecated in favor of PerceptionManager#FLAGS";
    foundry.utils.logCompatibilityWarning(msg, {since: 10, until: 12});
    return this.FLAGS;
  }
}
