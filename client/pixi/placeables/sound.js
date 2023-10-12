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
  sound = this._createSound();

  /**
   * A SoundSource object which manages the area of effect for this ambient sound
   * @type {SoundSource}
   */
  source = new SoundSource(this);

  /** @inheritdoc */
  static embeddedName ="AmbientSound";

  /* -------------------------------------------- */

  /**
   * Create a Sound used to play this AmbientSound object
   * @returns {Sound|null}
   * @private
   */
  _createSound() {
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
    if ( this.document.hidden ) return false;
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
   * Toggle playback of the sound depending on whether or not it is audible
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
    this.controlIcon = this.addChild(this._drawControlIcon());
    this.updateSource();
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
   * @private
   */
  _drawControlIcon() {
    const size = Math.max(Math.round((canvas.dimensions.size * 0.5) / 20) * 20, 40);
    let icon = new ControlIcon({texture: CONFIG.controlIcons.sound, size: size});
    icon.x -= (size * 0.5);
    icon.y -= (size * 0.5);
    return icon;
  }

  /* -------------------------------------------- */

  /** @inheritdoc */
  _refresh(options) {
    const {x, y} = this.document;
    this.position.set(x, y);
    this.field.position.set(-x, -y);

    // Draw the light field
    this.field.clear();
    if ( this.source.active ) {
      this.field.beginFill(0xAADDFF, 0.15).lineStyle(1, 0xFFFFFF, 0.5).drawShape(this.source.los).endFill();
    }

    // Update control icon appearance
    this.refreshControl();
  }

  /* -------------------------------------------- */

  /**
   * Refresh the display of the ControlIcon for this AmbientSound source
   */
  refreshControl() {
    const isHidden = this.id && (this.document.hidden || !this.document.path);
    this.controlIcon.tintColor = isHidden ? 0xFF3300 : 0xFFFFFF;
    this.controlIcon.borderColor = isHidden ? 0xFF3300 : 0xFF5500;
    this.controlIcon.texture = getTexture(this.isAudible ? CONFIG.controlIcons.sound : CONFIG.controlIcons.soundOff);
    this.controlIcon.draw();
    this.controlIcon.visible = this.layer.active;
    this.controlIcon.border.visible = this.hover;
  }

  /* -------------------------------------------- */

  /**
   * Compute the field-of-vision for an object, determining its effective line-of-sight and field-of-vision polygons
   * @param {object} [options={}]   Options which modify how the audio source is updated
   * @param {boolean} [options.defer]    Defer refreshing the SoundsLayer to manually call that refresh later.
   * @param {boolean} [options.deleted]  Indicate that this SoundSource has been deleted.
   */
  updateSource({defer=false, deleted=false}={}) {
    if ( !this.isAudible ) deleted = true;

    // Remove the audio source from the Scene
    if ( deleted ) {
      this.source.active = false;
      this.layer.sources.delete(this.sourceId);
    }

    // Update the source and add it to the Scene
    else {
      this.source.active = true;
      this.source.initialize({
        x: this.document.x,
        y: this.document.y,
        radius: Math.clamped(this.radius, 0, canvas.dimensions.maxR),
        walls: this.document.walls,
        z: this.document.getFlag("core", "priority") ?? null
      });
      this.layer.sources.set(this.sourceId, this.source);
    }

    // Schedule a perception refresh, unless that operation is deferred for some later workflow
    if ( !defer ) canvas.perception.update({refreshSounds: true}, true);
  }

  /* -------------------------------------------- */
  /*  Document Event Handlers                     */
  /* -------------------------------------------- */

  /** @inheritdoc */
  _onCreate(...args) {
    super._onCreate(...args);
    this.updateSource();
  }

  /* -------------------------------------------- */

  /** @inheritdoc */
  _onUpdate(data, ...args) {
    if ( "path" in data ) {
      if ( this.sound ) this.sound.stop();
      this.sound = this._createSound();
    }
    this.updateSource();
    return super._onUpdate(data, ...args);
  }

  /* -------------------------------------------- */

  /** @inheritdoc */
  _onDelete(...args) {
    super._onDelete(...args);
    if ( this.sound ) {
      if ( !this.sound.loaded && (this.sound.loading instanceof Promise) ) {
        this.sound.loading.then(() => this.sound.stop());
      }
      else this.sound.stop();
    }
    this.updateSource({deleted: true});
  }

  /* -------------------------------------------- */
  /*  Interaction Event Handlers                  */
  /* -------------------------------------------- */

  /** @inheritdoc */
  _canHUD(user, event) {
    return user.isGM; // Allow GMs to single right-click
  }

  /** @inheritdoc */
  _canConfigure(user, event) {
    return false; // Double-right does nothing
  }

  /** @inheritdoc */
  _onClickRight(event) {
    this.document.update({hidden: !this.document.hidden});
  }

  /** @override */
  _onDragLeftMove(event) {
    const {clones, destination, origin, originalEvent} = event.data;
    canvas._onDragCanvasPan(originalEvent);
    const dx = destination.x - origin.x;
    const dy = destination.y - origin.y;
    for ( let c of clones || [] ) {
      c.document.x = c._original.document.x + dx;
      c.document.y = c._original.document.y + dy;
      c.updateSource();
      c.refresh();
    }
  }
}
