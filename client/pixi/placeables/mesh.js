/**
 * A mixin which decorates a DisplayObject with additional properties expected for rendering in the PrimaryCanvasGroup.
 * @category - Mixins
 * @param {typeof PIXI.DisplayObject} DisplayObject   The parent DisplayObject class being mixed
 * @returns {typeof PrimaryCanvasObject}              A DisplayObject subclass mixed with PrimaryCanvasObject features
 */
const PrimaryCanvasObjectMixin = DisplayObject => {
  class PrimaryCanvasObject extends DisplayObject {
    constructor(object, ...args) {
      super(...args);
      /**
       * The PlaceableObject which is rendered to the PrimaryCanvasGroup
       * @type {PlaceableObject}
       */
      this.object = object;
      this.document = object.document;
      this.cullable = true;
    }

    /* -------------------------------------------- */

    /** @override */
    get visible() {
      return this.object.visible;
    }

    /** @ignore */
    set visible(visible) {}

    /* -------------------------------------------- */

    /** @override */
    get renderable() {
      return this.object.renderable;
    }

    /** @ignore */
    set renderable(renderable) {}

    /* -------------------------------------------- */

    /**
     * An elevation in distance units which defines how this Object is sorted relative to its siblings.
     * @type {number}
     */
    get elevation() {
      return this.document.elevation || 0;
    }

    /* -------------------------------------------- */

    /**
     * A sort key which resolves ties amongst objects at the same elevation.
     * @type {number}
     */
    get sort() {
      return this.document.sort || 0;
    }

    /* -------------------------------------------- */
    /*  Methods                                     */
    /* -------------------------------------------- */

    /**
     * Synchronize the appearance of this ObjectMesh with the properties of its represented Document.
     * @abstract
     */
    refresh() {}

    /* -------------------------------------------- */

    /**
     * Synchronize the position of the ObjectMesh using the position of its represented Document.
     * @abstract
     */
    setPosition() {}
  }
  return PrimaryCanvasObject;
};

/* -------------------------------------------- */

/**
 * A SpriteMesh which visualizes a Token object in the PrimaryCanvasGroup.
 */
class TokenMesh extends PrimaryCanvasObjectMixin(SpriteMesh) {

  /** @inheritDoc */
  refresh(attributes=undefined) {
    if ( this._destroyed || (this.texture === PIXI.Texture.EMPTY) ) return;

    // Update display attributes
    const {x, y, width, height, alpha, rotation, texture} = attributes ||= this.object.getDisplayAttributes();
    let {scaleX, scaleY, tint} = texture;

    // Size the texture
    const rect = canvas.grid.grid.getRect(width, height);
    const aspectRatio = this.texture.width / this.texture.height;
    if ( aspectRatio >= 1 ) {
      scaleX *= (rect.width / this.texture.width);
      scaleY *= (rect.width / (this.texture.height * aspectRatio));
    } else {
      scaleY *= (rect.height / this.texture.height);
      scaleX *= ((rect.height * aspectRatio) / this.texture.width);
    }

    // Ensure that square tokens are scaled consistently on hex grids.
    if ( (aspectRatio === 1) && canvas.grid.isHex ) {
      const minSide = Math.min(rect.width, rect.height);
      scaleX = (texture.scaleX * minSide) / this.texture.width;
      scaleY = (texture.scaleY * minSide) / this.texture.height;
    }

    // Assign attributes
    this.scale.set(scaleX, scaleY);
    this.position.set(x + (rect.width / 2), y + (rect.height / 2));
    this.angle = rotation;
    this.alpha = alpha;
    this.tint = tint;

    // Handle special shader assignment
    const isInvisible = this.document.hasStatusEffect(CONFIG.specialStatusEffects.INVISIBLE);
    const shader = isInvisible ? TokenInvisibilitySamplerShader : BaseSamplerShader;
    this.setShaderClass(shader);
  }
}

/* -------------------------------------------- */

/**
 * A SpriteMesh which visualizes a Tile object in the PrimaryCanvasGroup.
 */
class TileMesh extends PrimaryCanvasObjectMixin(SpriteMesh) {

  /** @inheritDoc */
  refresh() {
    if ( this._destroyed || (this.texture === PIXI.Texture.EMPTY) ) return;
    const {width, height, alpha, occlusion, overhead, hidden} = this.document;
    const {scaleX, scaleY, tint} = this.document.texture;

    // Use the document width explicitly
    this.width = width;
    this.height = height;

    // Apply scale on each axis (a negative scaleX/scaleY is flipping the image on its axis)
    this.scale.x = (width / this.texture.width) * scaleX;
    this.scale.y = (height / this.texture.height) * scaleY;

    // Set opacity and tint
    const normalAlpha = hidden ? Math.min(0.5, alpha) : alpha;
    this.alpha = (overhead && this.object.occluded) ? Math.min(occlusion.alpha, normalAlpha) : normalAlpha;
    this.tint = Color.from(tint ?? 0xFFFFFF);

    // Set position, rotation, and elevation
    this.setPosition();
  }

  /* -------------------------------------------- */

  /** @inheritDoc */
  setPosition() {
    const {x, y, z, width, height, rotation} = this.document;
    this.position.set(x + (width/2), y + (height/2));
    this.angle = rotation;
    this.zIndex = z;
  }

  /* -------------------------------------------- */

  /**
   * Render the mesh for tile occlusion
   * @param {PIXI.Renderer} renderer
   */
  renderOcclusion(renderer) {
    if ( !this.object.isRoof || this.document.hidden ) return;
    const isModeNone = (this.object.document.occlusion.mode === CONST.TILE_OCCLUSION_MODES.NONE);
    const occluded = this.object.occluded;

    // Forcing the batch plugin to render roof mask
    this.pluginName = OcclusionSamplerShader.classPluginName;

    // Saving the value from the mesh
    const originalTint = this.tint;
    const originalBlendMode = this.blendMode;
    const originalAlpha = this.worldAlpha;

    // Rendering the roof sprite
    this.tint = 0xFFFF00 + ((!isModeNone && occluded) ? 0xFF : 0x0);
    this.blendMode = PIXI.BLEND_MODES.MAX_COLOR;
    this.worldAlpha = 1.0;
    this.render(renderer);

    // Restoring original values
    this.tint = originalTint;
    this.blendMode = originalBlendMode;
    this.worldAlpha = originalAlpha;

    // Stop forcing batched plugin
    this.pluginName = null;
  }
}

/* -------------------------------------------- */

/**
 * A special case subclass of PIXI.TilingSprite which is used in cases where the tile texture needs to repeat.
 * This should eventually be refactored in favor of a more generalized TilingMesh.
 */
class TileSprite extends PrimaryCanvasObjectMixin(PIXI.TilingSprite) {
  constructor(...args) {
    super(...args);
    // This is a workaround currently needed for TilingSprite textures due to a presumed upstream PIXI bug
    this.texture.baseTexture.mipmap = PIXI.MIPMAP_MODES.OFF;
    this.texture.baseTexture.update();
  }

  // TODO: Temporary, just to avoid error with TilingSprite
  setShaderClass() {}

  // TODO: Temporary, just to avoid error with TilingSprite
  renderOcclusion() {}

  // TODO: Temporary, just to avoid error with TilingSprite
  set shader(value) {}

  get shader() {
    return {};
  }
}
Object.defineProperty(TileSprite.prototype, "refresh", Object.getOwnPropertyDescriptor(TileMesh.prototype, "refresh"));
Object.defineProperty(TileSprite.prototype, "setPosition", Object.getOwnPropertyDescriptor(TileMesh.prototype, "setPosition"));

/* -------------------------------------------- */


/**
 * A special subclass of PIXI.Container used to represent a Drawing in the PrimaryCanvasGroup.
 */
class DrawingShape extends PrimaryCanvasObjectMixin(PIXI.Graphics) {

  /** @inheritDoc */
  refresh() {
    if ( this._destroyed ) return;
    const doc = this.document;
    this.clear();

    // Outer Stroke
    if ( doc.strokeWidth ) {
      let sc = Color.from(doc.strokeColor || "#FFFFFF");
      const sw = doc.strokeWidth ?? 8;
      this.lineStyle(sw, sc, doc.strokeAlpha ?? 1);
    }

    // Fill Color or Texture
    if ( doc.fillType ) {
      const fc = Color.from(doc.fillColor || "#FFFFFF");
      if ( (doc.fillType === CONST.DRAWING_FILL_TYPES.PATTERN) && this.object.texture ) {
        this.beginTextureFill({
          texture: this.object.texture,
          color: fc || 0xFFFFFF,
          alpha: fc ? doc.fillAlpha : 1
        });
      }
      else this.beginFill(fc, doc.fillAlpha);
    }

    // Draw the shape
    switch ( doc.shape.type ) {
      case Drawing.SHAPE_TYPES.RECTANGLE:
        this.#drawRectangle();
        break;
      case Drawing.SHAPE_TYPES.ELLIPSE:
        this.#drawEllipse();
        break;
      case Drawing.SHAPE_TYPES.POLYGON:
        if ( this.document.bezierFactor ) this.#drawFreehand();
        else this.#drawPolygon();
        break;
    }

    // Conclude fills
    this.lineStyle(0x000000, 0.0).closePath().endFill();

    // Set the drawing position
    this.setPosition();
  }

  /* -------------------------------------------- */

  /** @inheritDoc */
  setPosition() {
    const {x, y, z, hidden, shape, rotation} = this.document;
    this.pivot.set(shape.width / 2, shape.height / 2);
    this.position.set(x + this.pivot.x, y + this.pivot.y);
    this.zIndex = z; // This is a temporary solution to ensure the sort order updates
    this.angle = rotation;
    this.alpha = hidden ? 0.5 : 1.0;
    this.visible = !hidden || game.user.isGM;
  }

  /* -------------------------------------------- */

  /**
   * Draw rectangular shapes.
   * @private
   */
  #drawRectangle() {
    const {shape, strokeWidth} = this.document;
    const hs = strokeWidth / 2;
    this.drawRect(hs, hs, shape.width - (2*hs), shape.height - (2*hs));
  }

  /* -------------------------------------------- */

  /**
   * Draw ellipsoid shapes.
   * @private
   */
  #drawEllipse() {
    const {shape, strokeWidth} = this.document;
    const hw = shape.width / 2;
    const hh = shape.height / 2;
    const hs = strokeWidth / 2;
    const width = Math.max(Math.abs(hw) - hs, 0);
    const height = Math.max(Math.abs(hh) - hs, 0);
    this.drawEllipse(hw, hh, width, height);
  }

  /* -------------------------------------------- */

  /**
   * Draw polygonal shapes.
   * @private
   */
  #drawPolygon() {
    const {shape, fillType} = this.document;
    const points = shape.points;
    if ( points.length < 4 ) return;
    else if ( points.length === 4 ) this.endFill();

    // Get drawing points
    const first = points.slice(0, 2);
    const last = points.slice(-2);
    const isClosed = first.equals(last);

    // If the polygon is closed, or if we are filling it, we can shortcut using the drawPolygon helper
    if ( (points.length > 4) && (isClosed || fillType) ) return this.drawPolygon(points);

    // Otherwise, draw each line individually
    this.moveTo(...first);
    for ( let i=3; i<points.length; i+=2 ) {
      this.lineTo(points[i-1], points[i]);
    }
  }

  /* -------------------------------------------- */

  /**
   * Draw freehand shapes with bezier spline smoothing.
   * @private
   */
  #drawFreehand() {
    const {bezierFactor, fillType, shape} = this.document;

    // Get drawing points
    let points = shape.points;
    const first = points.slice(0, 2);
    const last = points.slice(-2);
    const isClosed = first.equals(last);

    // Draw simple polygons if only 2 points are present
    if ( points.length <= 4 ) return this.#drawPolygon();

    // Set initial conditions
    const factor = bezierFactor ?? 0.5;
    let previous = first;
    let point = points.slice(2, 4);
    points = points.concat(last);  // Repeat the final point so the bezier control points know how to finish
    let cp0 = this.#getBezierControlPoints(factor, last, previous, point).nextCP;
    let cp1;
    let nextCP;

    // Begin iteration
    this.moveTo(first[0], first[1]);
    for ( let i=4; i<points.length-1; i+=2 ) {
      const next = [points[i], points[i+1]];
      if ( next ) {
        let bp = this.#getBezierControlPoints(factor, previous, point, next);
        cp1 = bp.cp1;
        nextCP = bp.nextCP;
      }

      // First point
      if ( (i === 4) && !isClosed ) {
        this.quadraticCurveTo(cp1.x, cp1.y, point[0], point[1]);
      }

      // Last Point
      else if ( (i === points.length-2) && !isClosed ) {
        this.quadraticCurveTo(cp0.x, cp0.y, point[0], point[1]);
      }

      // Bezier points
      else {
        this.bezierCurveTo(cp0.x, cp0.y, cp1.x, cp1.y, point[0], point[1]);
      }

      // Increment
      previous = point;
      point = next;
      cp0 = nextCP;
    }

    // Close the figure if a fill is required
    if ( fillType && !isClosed ) this.lineTo(first[0], first[1]);
  }

  /* -------------------------------------------- */

  /**
   * Attribution: The equations for how to calculate the bezier control points are derived from Rob Spencer's article:
   * http://scaledinnovation.com/analytics/splines/aboutSplines.html
   * @param {number} factor       The smoothing factor
   * @param {number[]} previous   The prior point
   * @param {number[]} point      The current point
   * @param {number[]} next       The next point
   * @returns {{cp1: Point, nextCP: Point}} The bezier control points
   * @private
   */
  #getBezierControlPoints(factor, previous, point, next) {

    // Calculate distance vectors
    const vector = {x: next[0] - previous[0], y: next[1] - previous[1]};
    const preDistance = Math.hypot(point[0] - previous[0], point[1] - previous[1]);
    const postDistance = Math.hypot(next[0] - point[0], next[1] - point[1]);
    const distance = preDistance + postDistance;

    // Compute control point locations
    const cp0d = distance === 0 ? 0 : factor * (preDistance / distance);
    const cp1d = distance === 0 ? 0 : factor * (postDistance / distance);

    // Return points
    return {
      cp1: {
        x: point[0] - (vector.x * cp0d),
        y: point[1] - (vector.y * cp0d)
      },
      nextCP: {
        x: point[0] + (vector.x * cp1d),
        y: point[1] + (vector.y * cp1d)
      }
    };
  }
}
