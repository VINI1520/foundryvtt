/**
 * The occlusion mask which contains radial occlusion and vision occlusion from tokens.
 * @category - Canvas
 */
class CanvasOcclusionMask extends CachedContainer {
  constructor(...args) {
    super(...args);
    this.#createOcclusion();
  }

  /**
   * Graphics in which token radial and vision occlusion shapes are drawn.
   * @type {PIXI.LegacyGraphics}
   */
  tokens;

  /** @override */
  clearColor = [1, 1, 1, 1];

  /* -------------------------------------------- */

  /**
   * Initialize the depth mask with the roofs container and token graphics.
   */
  #createOcclusion() {
    this.alphaMode = PIXI.ALPHA_MODES.NO_PREMULTIPLIED_ALPHA;
    this.tokens = this.addChild(new PIXI.LegacyGraphics());
    this.tokens.blendMode = PIXI.BLEND_MODES.MIN_ALL;
  }

  /* -------------------------------------------- */

  /**
   * Clear the occlusion mask.
   */
  clear() {
    this.tokens.clear();
  }

  /* -------------------------------------------- */
  /*  Occlusion Management                        */
  /* -------------------------------------------- */

  /**
   * Update the state of occlusion, rendering a new occlusion mask and updating the occluded flag on all Tiles.
   */
  updateOcclusion() {
    const tokens = canvas.tokens._getOccludableTokens();
    this.#drawTokenOcclusion(tokens);
    this.#updateTileOcclusion(tokens);
  }

  /* -------------------------------------------- */

  /**
   * Draw occlusion shapes to the Tile occlusion mask.
   * Radial occlusion draws to the green channel with varying intensity from [0.2, 1] based on elevation.
   * Vision occlusion draws to the blue channel with varying intensity from [0.2, 1] based on elevation.
   * @param {Token[]} tokens      An array of currently controlled or observed tokens
   */
  #drawTokenOcclusion(tokens) {
    tokens.sort((a, b) => b.document.elevation - a.document.elevation);
    const g = canvas.masks.occlusion.tokens;
    g.clear();
    for ( const token of tokens ) {
      const a = canvas.primary.mapElevationAlpha(token.document.elevation);
      const c = token.center;

      // The token has a flag with an occlusion radius?
      const o = Number(token.document.getFlag("core", "occlusionRadius")) || null;
      const m = Math.max(token.mesh.width, token.mesh.height);
      const r = Number.isFinite(o) ? Math.max(m, token.getLightRadius(o)) : m;

      // Token has vision and a fov?
      const hasVisionLOS = !!(token.hasSight && token.vision.los);
      g.beginFill(Color.fromRGB([1, a, !hasVisionLOS ? a : 1]).valueOf(), 1).drawCircle(c.x, c.y, r).endFill();
      if ( hasVisionLOS ) g.beginFill(Color.fromRGB([1, 1, a]).valueOf(), 1).drawShape(token.vision.los).endFill();
    }
  }

  /* -------------------------------------------- */

  /**
   * Update the current occlusion status of all Tile objects.
   * @param {Token[]} tokens     The set of currently controlled Token objects
   */
  #updateTileOcclusion(tokens) {
    const occluded = this._identifyOccludedTiles(tokens);
    for ( const tile of canvas.tiles.placeables ) {
      tile.debounceSetOcclusion(occluded.has(tile));
    }
  }

  /* -------------------------------------------- */

  /**
   * Determine the set of Tiles which should be currently occluded by a Token.
   * @param {Token[]} tokens      The set of currently controlled Token objects
   * @returns {Set<Tile>}         The Tile objects which should be currently occluded
   * @protected
   */
  _identifyOccludedTiles(tokens) {
    const occluded = new Set();
    for ( const token of tokens ) {
      const tiles = canvas.tiles.quadtree.getObjects(token.bounds);
      for ( const tile of tiles ) {
        if ( occluded.has(tile) ) continue;  // Don't bother re-testing a tile
        if ( tile.testOcclusion(token, {corners: tile.isRoof}) ) occluded.add(tile);
      }
    }
    return occluded;
  }
}
