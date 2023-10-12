/**
 * The client-side FogExploration document which extends the common BaseFogExploration model.
 * @extends documents.BaseFogExploration
 * @mixes ClientDocumentMixin
 */
class FogExploration extends ClientDocumentMixin(foundry.documents.BaseFogExploration) {

  /**
   * Explore fog of war for a new point source position.
   * @param {PointSource} source    The candidate source of exploration
   * @param {boolean} [force=false] Force the position to be re-explored
   * @returns {boolean}             Is the source position newly explored?
   */
  explore(source, force=false) {
    const r = source.radius;
    const coords = canvas.grid.getCenter(source.x, source.y).map(Math.round).join("_");
    const position = this.positions[coords];

    // Check whether the position has already been explored
    let explored = position && (position.limit !== true) && (position.radius >= r);
    if ( explored && !force ) return false;

    // Update explored positions
    if ( CONFIG.debug.fog ) console.debug("SightLayer | Updating fog exploration for new explored position.");
    this.updateSource({positions: {
      [coords]: {radius: r, limit: source.los.isConstrained}
    }});
    return true;
  }

  /* -------------------------------------------- */

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
}
