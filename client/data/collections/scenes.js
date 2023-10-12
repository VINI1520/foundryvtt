/**
 * The singleton collection of Scene documents which exist within the active World.
 * This Collection is accessible within the Game object as game.scenes.
 * @extends {WorldCollection}
 *
 * @see {@link Scene} The Scene document
 * @see {@link SceneDirectory} The SceneDirectory sidebar directory
 */
class Scenes extends WorldCollection {

  /* -------------------------------------------- */
  /*  Properties                                  */
  /* -------------------------------------------- */

  /** @override */
  static documentName = "Scene";

  /* -------------------------------------------- */

  /**
   * Return a reference to the Scene which is currently active
   * @type {Scene}
   */
  get active() {
    return this.find(s => s.active);
  }

  /* -------------------------------------------- */

  /**
   * Return the current Scene target.
   * This is the viewed scene if the canvas is active, otherwise it is the currently active scene.
   * @type {Scene}
   */
  get current() {
    const canvasInitialized = canvas.ready || game.settings.get("core", "noCanvas");
    return canvasInitialized ? this.viewed : this.active;
  }

  /* -------------------------------------------- */

  /**
   * Return a reference to the Scene which is currently viewed
   * @type {Scene}
   */
  get viewed() {
    return this.find(s => s.isView);
  }

  /* -------------------------------------------- */
  /*  Methods                                     */
  /* -------------------------------------------- */

  /**
   * Handle preloading the art assets for a Scene
   * @param {string} sceneId    The Scene id to begin loading
   * @param {boolean} push      Trigger other connected clients to also preload Scene resources
   */
  async preload(sceneId, push=false) {
    if ( push ) return game.socket.emit("preloadScene", sceneId, () => this.preload(sceneId));
    let scene = this.get(sceneId);
    const promises = [];

    // Preload sounds
    if ( scene.playlistSound?.path ) promises.push(AudioHelper.preloadSound(scene.playlistSound.path));
    else if ( scene.playlist?.playbackOrder.length ) {
      const first = scene.playlist.sounds.get(scene.playlist.playbackOrder[0]);
      if ( first ) promises.push(AudioHelper.preloadSound(first.path));
    }

    // Preload textures without expiring current ones
    promises.push(TextureLoader.loadSceneTextures(scene, {expireCache: false}));
    return Promise.all(promises);
  }

  /* -------------------------------------------- */
  /*  Event Handlers                              */
  /* -------------------------------------------- */

  /** @override */
  static _activateSocketListeners(socket) {
    socket.on("preloadScene", sceneId => this.instance.preload(sceneId));
    socket.on("pullToScene", this._pullToScene);
  }

  /* -------------------------------------------- */

  /**
   * Handle requests pulling the current User to a specific Scene
   * @param {string} sceneId
   * @private
   */
  static _pullToScene(sceneId) {
    const scene = game.scenes.get(sceneId);
    if ( scene ) scene.view();
  }

  /* -------------------------------------------- */
  /*  Importing and Exporting                     */
  /* -------------------------------------------- */

  /** @inheritdoc */
  fromCompendium(document, options={}) {
    const data = super.fromCompendium(document, options);
    if ( options.clearState ) delete data.active;
    if ( options.clearSort ) {
      delete data.navigation;
      delete data.navOrder;
    }
    return data;
  }
}
