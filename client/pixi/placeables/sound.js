/**
 * An AmbientSound is an implementation of PlaceableObject which represents a dynamic audio source within the Scene.
 * @category - Canvas
 * @see {@link AmbientSoundDocument}
 * @see {@link SoundsLayer}
 */
class AmbientSound extends PlaceableObject {

  /**
   * The Sound which manages playback for this AmbientSound effect
   * @type {Sound|null}
   */
  sound = this.#createSound();

  /**
   * A SoundSource object which manages the area of effect for this ambient sound
   * @type {SoundSource}
   */
  source = new SoundSource({object: this});

  /** @inheritdoc */
  static embeddedName ="AmbientSound";

  /** @override */
  static RENDER_FLAGS = {
    redraw: {propagate: ["refresh"]},
    refresh: {propagate: ["refreshField"], alias: true},
    refreshField: {propagate: ["refreshPosition", "refreshState"]},
    refreshPosition: {},
    refreshState: {}
  };

  /* -------------------------------------------- */

  /**
   * Create a Sound used to play this AmbientSound object
   * @returns {Sound|null}
   */
  #createSound() {
    if ( !this.id || !this.document.path ) return null;
    return game.audio.create({
      src: this.document.path,
      preload: true,
      autoplay: false,
      singleton: true
    });
  }

  /* -------------------------------------------- */
  /* Properties
  /* -------------------------------------------- */

  /**
   * Is this ambient sound is currently audible based on its hidden state and the darkness level of the Scene?
   * @type {boolean}
   */
  get isAudible() {
    if ( this.document.hidden || !this.document.radius ) return false;
    return canvas.darknessLevel.between(this.document.darkness.min ?? 0, this.document.darkness.max ?? 1);
  }

  /* -------------------------------------------- */

  /** @inheritdoc */
  get bounds() {
    const {x, y} = this.document;
    const r = this.radius;
    return new PIXI.Rectangle(x-r, y-r, 2*r, 2*r);
  }

  /* -------------------------------------------- */

  /**
   * A convenience accessor for the sound radius in pixels
   * @type {number}
   */
  get radius() {
    let d = canvas.dimensions;
    return ((this.document.radius / d.distance) * d.size);
  }

  /* -------------------------------------------- */
  /* Methods
  /* -------------------------------------------- */

  /**
   * Toggle playback of the sound depending on whether it is audible.
   * @param {boolean} isAudible     Is the sound audible?
   * @param {number} volume         The target playback volume
   * @param {object} [options={}]   Additional options which affect sound synchronization
   * @param {number} [options.fade=250]  A duration in milliseconds to fade volume transition
   */
  sync(isAudible, volume, {fade=250}={}) {
    const sound = this.sound;
    if ( !sound ) return;
    if ( !sound.loaded ) {
      if ( sound.loading instanceof Promise ) {
        sound.loading.then(() => this.sync(isAudible, volume, {fade}));
      }
      return;
    }

    // Fade the sound out if not currently audible
    if ( !isAudible ) {
      if ( !sound.playing || (sound.volume === 0) ) return;
      if ( fade ) sound.fade(0, {duration: fade});
      else sound.volume = 0;
      return;
    }

    // Begin playback at the desired volume
    if ( !sound.playing ) sound.play({volume: 0, loop: true});

    // Adjust the target volume
    const targetVolume = (volume ?? this.document.volume) * game.settings.get("core", "globalAmbientVolume");
    if ( fade ) sound.fade(targetVolume, {duration: fade});
    else sound.volume = targetVolume;
  }

  /* -------------------------------------------- */
  /* Rendering
  /* -------------------------------------------- */

  /** @inheritdoc */
  clear() {
    if ( this.controlIcon ) {
      this.controlIcon.parent.removeChild(this.controlIcon).destroy();
      this.controlIcon = null;
    }
    return super.clear();
  }

  /* -------------------------------------------- */

  /** @override */
  async _draw() {
    this.field = this.addChild(new PIXI.Graphics());
    this.field.eventMode = "none";
    this.controlIcon = this.addChild(this.#drawControlIcon());
  }

  /* -------------------------------------------- */

  /** @override */
  _destroy(options) {
    this.source.destroy();
  }

  /* -------------------------------------------- */

  /**
   * Draw the ControlIcon for the AmbientLight
   * @returns {ControlIcon}
   */
  #drawControlIcon() {
    const size = Math.max(Math.round((canvas.dimensions.size * 0.5) / 20) * 20, 40);
    let icon = new ControlIcon({texture: CONFIG.controlIcons.sound, size: size});
    icon.x -= (size * 0.5);
    icon.y -= (size * 0.5);
    return icon;
  }

  /* -------------------------------------------- */
  /*  Incremental Refresh                         */
  /* -------------------------------------------- */

  /** @override */
  _applyRenderFlags(flags) {
    if ( flags.refreshField ) this.#refreshField();
    if ( flags.refreshPosition ) this.#refreshPosition();
    if ( flags.refreshState ) this.#refreshState();
  }

  /* -------------------------------------------- */

  /**
   * Refresh the shape of the sound field-of-effect. This is refreshed when the SoundSource fov polygon changes.
   */
  #refreshField() {
    this.field.clear();
    if ( !this.source.disabled ) {
      this.field.beginFill(0xAADDFF, 0.15).lineStyle(1, 0xFFFFFF, 0.5).drawShape(this.source.shape).endFill();
    }
  }

  /* -------------------------------------------- */

  /**
   * Refresh the position of the AmbientSound. Called with the coordinates change.
   */
  #refreshPosition() {
    const {x, y} = this.document;
    this.position.set(x, y);
    this.field.position.set(-x, -y);
  }

  /* -------------------------------------------- */

  /**
   * Refresh the state of the light. Called when the disabled state or darkness conditions change.
   */
  #refreshState() {
    this.alpha = this._getTargetAlpha();
    this.refreshControl();
  }

  /* -------------------------------------------- */

  /**
   * Refresh the display of the ControlIcon for this AmbientSound source.
   */
  refreshControl() {
    const isHidden = this.id && (this.document.hidden || !this.document.path);
    this.controlIcon.tintColor = isHidden ? 0xFF3300 : 0xFFFFFF;
    this.controlIcon.borderColor = isHidden ? 0xFF3300 : 0xFF5500;
    this.controlIcon.texture = getTexture(this.isAudible ? CONFIG.controlIcons.sound : CONFIG.controlIcons.soundOff);
    this.controlIcon.draw();
    this.controlIcon.visible = this.layer.active;
    this.controlIcon.border.visible = this.hover || this.layer.highlightObjects;
  }

  /* -------------------------------------------- */

  /**
   * Compute the field-of-vision for an object, determining its effective line-of-sight and field-of-vision polygons
   * @param {object} [options={}]   Options which modify how the audio source is updated
   * @param {boolean} [options.defer]    Defer updating perception to manually update it later
   * @param {boolean} [options.deleted]  Indicate that this SoundSource has been deleted.
   */
  updateSource({defer=false, deleted=false}={}) {

    // Remove the audio source from the Scene
    if ( deleted ) {
      this.layer.sources.delete(this.sourceId);
    }

    // Update the source and add it to the Scene
    else {
      this.source.initialize({
        x: this.document.x,
        y: this.document.y,
        radius: Math.clamped(this.radius, 0, canvas.dimensions.maxR),
        walls: this.document.walls,
        z: this.document.getFlag("core", "priority") ?? null,
        disabled: !this.isAudible,
        preview: this.isPreview
      });
      this.layer.sources.set(this.sourceId, this.source);
    }

    // Schedule a perception refresh, unless that operation is deferred for some later workflow
    if ( !defer ) canvas.perception.update({refreshSounds: true});
    if ( this.layer.active ) this.renderFlags.set({refreshField: true});
  }

  /* -------------------------------------------- */
  /*  Document Event Handlers                     */
  /* -------------------------------------------- */

  /** @inheritdoc */
  _onCreate(data, options, userId) {
    super._onCreate(data, options, userId);
    this.updateSource();
  }

  /* -------------------------------------------- */

  /** @override */
  _onUpdate(data, options, userId) {
    super._onUpdate(data, options, userId);

    // Change the Sound buffer
    if ( "path" in data ) {
      if ( this.sound ) this.sound.stop();
      this.sound = this.#createSound();
    }

    // Re-initialize SoundSource
    this.updateSource();

    // Incremental Refresh
    this.renderFlags.set({
      refreshField: ["x", "y", "radius", "darkness", "walls"].some(k => k in data),
      refreshState: ["path", "hidden", "darkness"].some(k => k in data)
    });
  }

  /* -------------------------------------------- */

  /** @inheritdoc */
  _onDelete(options, userId) {
    // Stop audio playback
    if ( this.sound ) {
      if ( !this.sound.loaded && (this.sound.loading instanceof Promise) ) {
        this.sound.loading.then(() => this.sound.stop());
      }
      else this.sound.stop();
    }

    // Decommission the SoundSource
    this.updateSource({deleted: true});

    super._onDelete(options, userId);
  }

  /* -------------------------------------------- */
  /*  Interactivity                               */
  /* -------------------------------------------- */

  /** @inheritdoc */
  _canHUD(user, event) {
    return user.isGM; // Allow GMs to single right-click
  }

  /* -------------------------------------------- */

  /** @inheritdoc */
  _canConfigure(user, event) {
    return false; // Double-right does nothing
  }

  /* -------------------------------------------- */

  /** @override */
  _onClickRight(event) {
    this.document.update({hidden: !this.document.hidden});
  }

  /* -------------------------------------------- */

  /** @override */
  _onDragLeftMove(event) {
    canvas._onDragCanvasPan(event);
    const {clones, destination, origin} = event.interactionData;
    const dx = destination.x - origin.x;
    const dy = destination.y - origin.y;
    for ( let c of clones || [] ) {
      c.document.x = c._original.document.x + dx;
      c.document.y = c._original.document.y + dy;
      c.updateSource();
    }
  }

  /* -------------------------------------------- */

  /** @inheritdoc */
  _onDragEnd() {
    this.updateSource({deleted: true});
    this._original?.updateSource();
    super._onDragEnd();
  }
}
