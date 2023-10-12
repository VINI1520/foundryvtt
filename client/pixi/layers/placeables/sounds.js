/**
 * This Canvas Layer provides a container for AmbientSound objects.
 * @category - Canvas
 */
class SoundsLayer extends PlaceablesLayer {

  /**
   * Track whether to actively preview ambient sounds with mouse cursor movements
   * @type {boolean}
   */
  livePreview = false;

  /**
   * A mapping of ambient audio sources which are active within the rendered Scene
   * @type {Collection<string,SoundSource>}
   */
  sources = new foundry.utils.Collection();

  /* -------------------------------------------- */

  /** @inheritdoc */
  static get layerOptions() {
    return foundry.utils.mergeObject(super.layerOptions, {
      name: "sounds",
      zIndex: 300
    });
  }

  /** @inheritdoc */
  static documentName = "AmbientSound";

  /* -------------------------------------------- */

  /** @inheritdoc */
  get hookName() {
    return SoundsLayer.name;
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

  /** @inheritdoc */
  async _tearDown(options) {
    this.stopAll();
    return super._tearDown(options);
  }

  /* -------------------------------------------- */

  /**
   * Initialize all AmbientSound sources which are present on this layer
   */
  initializeSources() {
    for ( let sound of this.placeables ) {
      sound.updateSource({defer: true});
    }
    for ( let sound of this.preview.children ) {
      sound.updateSource({defer: true});
    }
  }

  /* -------------------------------------------- */

  /**
   * Update all AmbientSound effects in the layer by toggling their playback status.
   * Sync audio for the positions of tokens which are capable of hearing.
   * @param {object} [options={}]   Additional options forwarded to AmbientSound synchronization
   */
  refresh(options={}) {
    if ( !this.placeables.length ) return;
    for ( const sound of this.placeables ) sound.source.refresh();
    if ( game.audio.locked ) {
      return game.audio.pending.push(() => this.refresh(options));
    }
    let listeners = canvas.tokens.controlled.map(t => t.center);
    if ( !listeners.length && !game.user.isGM ) listeners = canvas.tokens.placeables.reduce((arr, t) => {
      if ( t.actor?.isOwner && t.isVisible ) arr.push(t.center);
      return arr;
    }, []);
    this._syncPositions(listeners, options);
  }

  /* -------------------------------------------- */

  /**
   * Preview ambient audio for a given mouse cursor position
   * @param {Point} position      The cursor position to preview
   */
  previewSound(position) {
    if ( !this.placeables.length || game.audio.locked ) return;
    return this._syncPositions([position], {fade: 50});
  }

  /* -------------------------------------------- */

  /**
   * Terminate playback of all ambient audio sources
   */
  stopAll() {
    this.placeables.forEach(s => s.sync(false));
  }

  /* -------------------------------------------- */

  /**
   * Sync the playing state and volume of all AmbientSound objects based on the position of listener points
   * @param {Point[]} listeners     Locations of listeners which have the capability to hear
   * @param {object} [options={}]   Additional options forwarded to AmbientSound synchronization
   * @private
   */
  _syncPositions(listeners, options) {
    if ( !this.placeables.length || game.audio.locked ) return;
    const sounds = {};
    for ( let sound of this.placeables ) {
      const p = sound.document.path;
      const r = sound.radius;
      if ( !p ) continue;

      // Track one audible object per unique sound path
      if ( !(p in sounds) ) sounds[p] = {path: p, audible: false, volume: 0, sound};
      const s = sounds[p];
      if ( !sound.isAudible ) continue; // The sound may not be currently audible

      // Determine whether the sound is audible, and its greatest audible volume
      for ( let l of listeners ) {
        if ( !sound.source.active || !sound.source.shape?.contains(l.x, l.y) ) continue;
        s.audible = true;
        const distance = Math.hypot(l.x - sound.x, l.y - sound.y);
        let volume = sound.document.volume;
        if ( sound.document.easing ) volume *= this._getEasingVolume(distance, r);
        if ( !s.volume || (volume > s.volume) ) s.volume = volume;
      }
    }

    // For each audible sound, sync at the target volume
    for ( let s of Object.values(sounds) ) {
      s.sound.sync(s.audible, s.volume, options);
    }
  }

  /* -------------------------------------------- */

  /**
   * Define the easing function used to map radial distance to volume.
   * Uses cosine easing which graduates from volume 1 at distance 0 to volume 0 at distance 1
   * @returns {number}            The target volume level
   * @private
   */
  _getEasingVolume(distance, radius) {
    const x = Math.clamped(distance, 0, radius) / radius;
    return (Math.cos(Math.PI * x) + 1) * 0.5;
  }

  /* -------------------------------------------- */

  /**
   * Actions to take when the darkness level of the Scene is changed
   * @param {number} darkness   The new darkness level
   * @param {number} prior      The prior darkness level
   * @internal
   */
  _onDarknessChange(darkness, prior) {
    for ( const sound of this.placeables ) {
      if ( sound.isAudible === sound.source.disabled ) sound.updateSource();
      if ( this.active ) sound.renderFlags.set({refreshState: true, refreshField: true});
    }
  }

  /* -------------------------------------------- */
  /*  Event Listeners and Handlers                */
  /* -------------------------------------------- */

  /**
   * Handle mouse cursor movements which may cause ambient audio previews to occur
   * @param {PIXI.FederatedEvent} event     The initiating mouse move interaction event
   */
  _onMouseMove(event) {
    if ( !this.livePreview ) return;
    if ( canvas.tokens.active && canvas.tokens.controlled.length ) return;
    const position = event.getLocalPosition(this);
    this.previewSound(position);
  }

  /* -------------------------------------------- */

  /** @inheritdoc */
  async _onDragLeftStart(event) {
    await super._onDragLeftStart(event);

    // Create a pending AmbientSoundDocument
    const cls = getDocumentClass("AmbientSound");
    const doc = new cls({type: "l", ...event.interactionData.origin}, {parent: canvas.scene});

    // Create the preview AmbientSound object
    const sound = new this.constructor.placeableClass(doc);
    event.interactionData.preview = this.preview.addChild(sound);
    event.interactionData.soundState = 1;
    this.preview._creating = false;
    return sound.draw();
  }

  /* -------------------------------------------- */

  /** @inheritdoc */
  _onDragLeftMove(event) {
    const {destination, soundState, preview, origin} = event.interactionData;
    if ( soundState === 0 ) return;
    const d = canvas.dimensions;
    const radius = Math.hypot(destination.x - origin.x, destination.y - origin.y);
    preview.document.radius = radius * (d.distance / d.size);
    preview.updateSource();
    event.interactionData.soundState = 2;
  }

  /* -------------------------------------------- */

  /** @inheritdoc */
  async _onDragLeftDrop(event) {
    const {soundState, destination, origin, preview} = event.interactionData;
    if ( soundState !== 2 ) return;

    // Render the preview sheet for confirmation
    const radius = Math.hypot(destination.x - origin.x, destination.y - origin.y);
    if ( radius < (canvas.dimensions.size / 2) ) return;

    // Clean the data and render the creation sheet
    preview.updateSource({
      x: Math.round(preview.document.x),
      y: Math.round(preview.document.y),
      radius: Math.floor(preview.document.radius * 100) / 100
    });
    preview.sheet.render(true);
    this.preview._creating = true;
  }

  /* -------------------------------------------- */

  /** @inheritdoc */
  _onDragLeftCancel(event) {
    if ( this.preview._creating ) return;
    return super._onDragLeftCancel(event);
  }

  /* -------------------------------------------- */

  /**
   * Handle PlaylistSound document drop data.
   * @param {DragEvent} event  The drag drop event
   * @param {object} data      The dropped transfer data.
   */
  async _onDropData(event, data) {
    const playlistSound = await PlaylistSound.implementation.fromDropData(data);
    if ( !playlistSound ) return false;
    let soundData;
    if ( (data.x === undefined) || (data.y === undefined) ) {
      const coords = this._canvasCoordinatesFromDrop(event, {center: false});
      if ( !coords ) return false;
      soundData = {x: coords[0], y: coords[1]};
    } else {
      soundData = {x: data.x, y: data.y};
    }
    if ( !event.shiftKey ) [soundData.x, soundData.y] = canvas.grid.getCenter(soundData.x, soundData.y);
    if ( !canvas.dimensions.rect.contains(soundData.x, soundData.y) ) return false;
    Object.assign(soundData, {
      path: playlistSound.path,
      volume: playlistSound.volume,
      radius: canvas.dimensions.distance * 2
    });
    return this._createPreview(soundData, {top: event.clientY - 20, left: event.clientX + 40});
  }
}
