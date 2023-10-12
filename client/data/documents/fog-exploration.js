/**
 * The client-side FogExploration document which extends the common BaseFogExploration model.
 * @extends documents.BaseFogExploration
 * @mixes ClientDocumentMixin
 */
class FogExploration extends ClientDocumentMixin(foundry.documents.BaseFogExploration) {
  /**
   * Obtain the fog of war exploration progress for a specific Scene and User.
   * @param {object} [query]        Parameters for which FogExploration document is retrieved
   * @param {string} [query.scene]    A certain Scene ID
   * @param {string} [query.user]     A certain User ID
   * @param {object} [options={}]   Additional options passed to DatabaseBackend#get
   * @returns {Promise<FogExploration|null>}
   */
  static async get({scene, user}={}, options={}) {
    const collection = game.collections.get("FogExploration");
    const sceneId = (scene || canvas.scene)?.id || null;
    const userId = (user || game.user)?.id;
    if ( !sceneId || !userId ) return null;
    if ( !(game.user.isGM || (userId === game.user.id)) ) {
      throw new Error("You do not have permission to access the FogExploration object of another user");
    }

    // Return cached exploration
    let exploration = collection.find(x => (x.user === userId) && (x.scene === sceneId));
    if ( exploration ) return exploration;

    // Return persisted exploration
    const response = await this.database.get(this, {
      query: {scene: sceneId, user: userId},
      options: options
    });
    exploration = response.length ? response.shift() : null;
    if ( exploration ) collection.set(exploration.id, exploration);
    return exploration;
  }

  /* -------------------------------------------- */

  /**
   * Transform the explored base64 data into a PIXI.Texture object
   * @returns {PIXI.Texture|null}
   */
  getTexture() {
    if ( !this.explored ) return null;
    const bt = new PIXI.BaseTexture(this.explored);
    return new PIXI.Texture(bt);
  }

  /* -------------------------------------------- */

  /** @override */
  _onCreate(data, options, userId) {
    super._onCreate(data, options, userId);
    if ( (options.loadFog !== false) && (this.user === game.user) && (this.scene === canvas.scene) ) canvas.fog.load();
  }

  /* -------------------------------------------- */

  /** @override */
  _onUpdate(data, options, userId) {
    super._onUpdate(data, options, userId);
    if ( (options.loadFog !== false) && (this.user === game.user) && (this.scene === canvas.scene) ) canvas.fog.load();
  }

  /* -------------------------------------------- */

  /** @override */
  _onDelete(options, userId) {
    super._onDelete(options, userId);
    if ( (options.loadFog !== false) && (this.user === game.user) && (this.scene === canvas.scene) ) canvas.fog.load();
  }

  /* -------------------------------------------- */

  /**
   * @deprecated since v11
   * @ignore
   */
  explore(source, force=false) {
    const msg = "explore is obsolete and always returns true. The fog exploration does not record position anymore.";
    foundry.utils.logCompatibilityWarning(msg, {since: 11, until: 13});
    return true;
  }
}
