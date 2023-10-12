/**
 * A basic rectangular mesh with a shader only. Does not natively handle textures (but a bound shader can).
 * Bounds calculations are simplified and the geometry does not need to handle texture coords.
 * @param {AbstractBaseShader} shaderCls     The shader class to use.
 */
class QuadMesh extends PIXI.Container {
  constructor(shaderCls) {
    super();

    // Create the basic quad geometry
    this.geometry = new PIXI.Geometry()
      .addAttribute("aVertexPosition", [0, 0, 1, 0, 1, 1, 0, 1], 2)
      .addIndex([0, 1, 2, 0, 2, 3]);

    // Assign shader, state and properties
    if ( !AbstractBaseShader.isPrototypeOf(shaderCls) ) {
      throw new Error("QuadMesh shader class must inherit from AbstractBaseShader.");
    }
    this.state = new PIXI.State();
    this.setShaderClass(shaderCls);

    this.cullable = true;
    this.blendMode = PIXI.BLEND_MODES.NORMAL;
  }

  /**
   * @type {PIXI.Geometry}
   * @protected
   */
  #geometry;

  /**
   * The shader.
   * @type {BaseSamplerShader}
   */
  shader;

  /**
   * The state.
   * @type {PIXI.State}
   */
  state;

  /* ---------------------------------------- */

  /**
   * Assigned geometry to this mesh.
   * We need to handle the refCount.
   * @type {PIXI.Geometry}
   */
  get geometry() {
    return this.#geometry;
  }

  set geometry(value) {
    // Same geometry?
    if ( this.#geometry === value ) return;

    // Unlink previous geometry and update refCount
    if ( this.#geometry ) {
      this.#geometry.refCount--;
      // Dispose geometry if necessary
      if ( this.#geometry.refCount === 0 ) this.#geometry.dispose();
    }

    // Link geometry and update refCount
    this.#geometry = value;
    if ( this.#geometry ) this.#geometry.refCount++;
  }

  /* ---------------------------------------- */

  /**
   * Assigned blend mode to this mesh.
   * @type {PIXI.BLEND_MODES}
   */
  get blendMode() {
    return this.state.blendMode;
  }

  set blendMode(value) {
    this.state.blendMode = value;
  }

  /* ---------------------------------------- */

  /**
   * Initialize shader based on the shader class type.
   * @param {class} shaderCls         Shader class used. Must inherit from AbstractBaseShader.
   */
  setShaderClass(shaderCls) {
    // Escape conditions
    if ( !AbstractBaseShader.isPrototypeOf(shaderCls) ) {
      throw new Error("QuadMesh shader class must inherit from AbstractBaseShader.");
    }
    if ( this.shader?.constructor === shaderCls ) return;

    // Create shader program
    this.shader = shaderCls.create();
  }

  /* ---------------------------------------- */

  /** @override */
  _render(renderer) {
    const {geometry, shader, state} = this;

    shader._preRender?.(this);
    shader.uniforms.translationMatrix = this.transform.worldTransform.toArray(true);

    // Flush batch renderer
    renderer.batch.flush();

    // Set state
    renderer.state.set(state);

    // Bind shader and geometry
    renderer.shader.bind(shader);
    renderer.geometry.bind(geometry, shader);

    // Draw the geometry
    renderer.geometry.draw(PIXI.DRAW_MODES.TRIANGLES);
  }

  /* ---------------------------------------- */

  /** @override */
  get width() {
    return Math.abs(this.scale.x);
  }

  set width(width) {
    const s = Math.sign(this.scale.x) || 1;
    this.scale.x = s * width;
    this._width = width;
  }

  _width;

  /* ---------------------------------------- */

  /** @override */
  get height() {
    return Math.abs(this.scale.y);
  }

  set height(height) {
    const s = Math.sign(this.scale.y) || 1;
    this.scale.y = s * height;
    this._height = height;
  }

  _height;

  /* ---------------------------------------- */

  /** @override */
  _calculateBounds() {
    this._bounds.addFrame(this.transform, 0, 0, 1, 1);
  }

  /* ---------------------------------------- */

  /**
   * Tests if a point is inside this QuadMesh.
   * @param {PIXI.IPointData} point
   * @returns {boolean}
   */
  containsPoint(point) {
    return this.getBounds().contains(point.x, point.y);
  }

  /* ---------------------------------------- */

  /** @override */
  destroy(...args) {
    super.destroy(...args);
    this.geometry = null;
    this.shader = null;
    this.state = null;
  }
}
