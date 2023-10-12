/**
 * The occlusion mask which contains radial occlusion and vision occlusion from tokens.
 * @category - Canvas
 */
class CanvasOcclusionMask extends CachedContainer {
  constructor(...args) {
    super(...args);
    this.#createOcclusion();
  }

  /** @override */
  static textureConfiguration = {
    scaleMode: PIXI.SCALE_MODES.NEAREST,
    format: PIXI.FORMATS.RGB
  };

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
   * Radial occlusion draws to the green channel with varying intensity from [1/255, 1] based on elevation.
   * Vision occlusion draws to the blue channel with varying intensity from [1/255, 1] based on elevation.
   * @param {Token[]} tokens      An array of currently controlled or observed tokens
   */
  #drawTokenOcclusion(tokens) {
    tokens.sort((a, b) => b.document.elevation - a.document.elevation);
    const g = canvas.masks.occlusion.tokens;
    g.clear();
    for ( const token of tokens ) {
      const a = canvas.primary.mapElevationToDepth(token.document.elevation);
      const c = token.center;

      // The token has a flag with an occlusion radius?
      const o = Number(token.document.flags.core?.occlusionRadius) || 0;
      const r = Math.max(token.externalRadius, token.getLightRadius(o));

      // Token has vision and a fov?
      const hasVisionLOS = !!(token.hasSight && token.vision.los);
      g.beginFill([1, a, !hasVisionLOS ? a : 1]).drawCircle(c.x, c.y, r).endFill();
      if ( hasVisionLOS ) g.beginFill([1, 1, a]).drawShape(token.vision.los).endFill();
    }
  }

  /* -------------------------------------------- */

  /**
   * Update the current occlusion status of all Tile objects.
   * @param {Token[]} tokens     The set of currently controlled Token objects
   */
  #updateTileOcclusion(tokens) {
    const occluded = this._identifyOccludedObjects(tokens);
    for ( const pco of canvas.primary.children ) {
      const isOccludable = pco.isOccludable;
      if ( (isOccludable === undefined) || (!isOccludable && !pco.occluded) ) continue;
      pco.debounceSetOcclusion(occluded.has(pco));
    }
  }

  /* -------------------------------------------- */

  /**
   * Determine the set of objects which should be currently occluded by a Token.
   * @param {Token[]} tokens                   The set of currently controlled Token objects
   * @returns {Set<PrimaryCanvasObjectMixin>}  The PCO objects which should be currently occluded
   * @protected
   */
  _identifyOccludedObjects(tokens) {
    const occluded = new Set();
    for ( const token of tokens ) {
      // Get the occludable primary canvas objects (PCO) according to the token bounds
      const matchingPCO = canvas.primary.quadtree.getObjects(token.bounds);
      for ( const pco of matchingPCO ) {
        // Don't bother re-testing a PCO or an object which is not occludable
        if ( !pco.isOccludable || occluded.has(pco) ) continue;
        if ( pco.testOcclusion(token, {corners: pco.data.roof}) ) occluded.add(pco);
      }
    }
    return occluded;
  }

  /* -------------------------------------------- */
  /*  Deprecation and compatibility               */
  /* -------------------------------------------- */

  /**
   * @deprecated since v11
   * @ignore
   */
  _identifyOccludedTiles() {
    const msg = "CanvasOcclusionMask#_identifyOccludedTiles has been deprecated in " +
      "favor of CanvasOcclusionMask#_identifyOccludedObjects.";
    foundry.utils.logCompatibilityWarning(msg, {since: 11, until: 13});
    return this._identifyOccludedObjects();
  }
}
