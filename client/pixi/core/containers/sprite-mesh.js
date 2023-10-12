/**
 * An extension of PIXI.Mesh which emulate a PIXI.Sprite with a specific shader.
 * @param [texture=PIXI.Texture.EMPTY]      Texture bound to this sprite mesh.
 * @param [shaderClass=BaseSamplerShader]   Shader class used by this sprite mesh.
 * @extends PIXI.Mesh
 */
class SpriteMesh extends PIXI.Mesh {
  constructor(texture, shaderCls = BaseSamplerShader) {
    // Create geometry
    const geometry = new PIXI.Geometry()
      .addAttribute("aVertexPosition", new PIXI.Buffer(new Float32Array(8), false), 2)
      .addAttribute("aTextureCoord", new PIXI.Buffer(new Float32Array(8), true), 2)
      .addIndex([0, 1, 2, 0, 2, 3]);

    // Create shader program
    if ( !AbstractBaseShader.isPrototypeOf(shaderCls) ) shaderCls = BaseSamplerShader;
    const shader = shaderCls.create({
      sampler: texture ?? PIXI.Texture.EMPTY
    });

    // Create state
    const state = new PIXI.State();

    // Init draw mode
    const drawMode = PIXI.DRAW_MODES.TRIANGLES;

    // Create the mesh
    super(geometry, shader, state, drawMode);

    /** @override */
    this._cachedTint = [1, 1, 1, 1];

    // Initialize other data to emulate sprite
    this.vertexData = this.verticesBuffer.data;
    this.uvs = this.uvBuffer.data;
    this.indices = geometry.indexBuffer.data;

    this._texture = null;
    this._anchor = new PIXI.ObservablePoint(
      this._onAnchorUpdate,
      this,
      (texture ? texture.defaultAnchor.x : 0),
      (texture ? texture.defaultAnchor.y : 0)
    );

    this.texture = texture || PIXI.Texture.EMPTY;
    this.alpha = 1;
    this.tint = 0xFFFFFF;
    this.blendMode = PIXI.BLEND_MODES.NORMAL;

    // Assigning some batch data that will not change during the life of this sprite mesh
    this._batchData.vertexData = this.vertexData;
    this._batchData.indices = this.indices;
    this._batchData.uvs = this.uvs;
    this._batchData.object = this;
  }

  /**
   * Snapshot of some parameters of this display object to render in batched mode.
   * TODO: temporary object until the upstream issue is fixed: https://github.com/pixijs/pixijs/issues/8511
   * @type {{_tintRGB: number, _texture: PIXI.Texture, indices: number[],
   * uvs: number[], blendMode: PIXI.BLEND_MODES, vertexData: number[], worldAlpha: number}}
   * @protected
   */
  _batchData = {
    _texture: undefined,
    vertexData: undefined,
    indices: undefined,
    uvs: undefined,
    worldAlpha: undefined,
    _tintRGB: undefined,
    blendMode: undefined,
    object: undefined
  };

  /** @override */
  _transformID = -1;

  /** @override */
  _textureID = -1;

  /** @override */
  _textureTrimmedID = -1;

  /** @override */
  _transformTrimmedID = -1;

  /** @override */
  _roundPixels = false; // Forced to false for SpriteMesh

  /** @override */
  vertexTrimmedData = null;

  /** @override */
  isSprite = true;

  /**
   * Used to track a tint or alpha change to execute a recomputation of _cachedTint.
   * @type {boolean}
   */
  #tintAlphaDirty = true;

  /**
   * Used to force an alpha mode on this sprite mesh.
   * If this property is non null, this value will replace the texture alphaMode when computing color channels.
   * Affects how tint, worldAlpha and alpha are computed each others.
   * @type {PIXI.ALPHA_MODES|undefined}
   */
  get alphaMode() {
    return this.#alphaMode ?? this._texture?.baseTexture.alphaMode;
  }

  set alphaMode(mode) {
    if ( this.#alphaMode === mode ) return;
    this.#alphaMode = mode;
    this.#tintAlphaDirty = true;
  }

  #alphaMode = null;

  /* ---------------------------------------- */

  /**
   * Returns the SpriteMesh associated batch plugin. By default the returned plugin is that of the associated shader.
   * If a plugin is forced, it will returns the forced plugin.
   * @type {string}
   */
  get pluginName() {
    return this.#pluginName ?? this.shader.pluginName;
  }

  set pluginName(name) {
    this.#pluginName = name;
  }

  #pluginName = null;

  /* ---------------------------------------- */

  /** @override */
  get width() {
    return Math.abs(this.scale.x) * this._texture.orig.width;
  }

  set width(width) {
    const s = Math.sign(this.scale.x) || 1;
    this.scale.x = s * width / this._texture.orig.width;
    this._width = width;
  }

  _width;

  /* ---------------------------------------- */

  /** @override */
  get height() {
    return Math.abs(this.scale.y) * this._texture.orig.height;
  }

  set height(height) {
    const s = Math.sign(this.scale.y) || 1;
    this.scale.y = s * height / this._texture.orig.height;
    this._height = height;
  }

  _height;

  /* ---------------------------------------- */

  /** @override */
  get texture() {
    return this._texture;
  }

  set texture(texture) {
    texture = texture ?? null;
    if ( this._texture === texture ) return;
    if ( this._texture ) this._texture.off("update", this._onTextureUpdate, this);

    this._texture = texture || PIXI.Texture.EMPTY;
    this._textureID = this._textureTrimmedID = -1;
    this.#tintAlphaDirty = true;

    if ( texture ) {
      if ( this._texture.baseTexture.valid ) this._onTextureUpdate();
      else this._texture.once("update", this._onTextureUpdate, this);
      this.updateUvs();
    }
    this.shader.uniforms.sampler = this._texture;
  }

  _texture;

  /* ---------------------------------------- */

  /** @override */
  get anchor() {
    return this._anchor;
  }

  set anchor(anchor) {
    this._anchor.copyFrom(anchor);
  }

  _anchor;

  /* ---------------------------------------- */

  /** @override */
  get tint() {
    return this._tintColor.value;
  }

  set tint(tint) {
    tint ??= 0xFFFFFF;
    if ( tint === this.tint ) return;
    this._tintColor.setValue(tint);
    this._tintRGB = this._tintColor.toLittleEndianNumber();
    this.#tintAlphaDirty = true;
  }

  _tintColor = new PIXI.Color(0xFFFFFF);

  _tintRGB = 0xFFFFFF;

  /* ---------------------------------------- */

  /**
   * The HTML source element for this SpriteMesh texture.
   * @type {HTMLImageElement|HTMLVideoElement|null}
   */
  get sourceElement() {
    if ( !this.texture.valid ) return null;
    return this.texture?.baseTexture.resource?.source || null;
  }

  /* ---------------------------------------- */

  /**
   * Is this SpriteMesh rendering a video texture?
   * @type {boolean}
   */
  get isVideo() {
    const source = this.sourceElement;
    return source?.tagName === "VIDEO";
  }

  /* ---------------------------------------- */

  /** @override */
  _onTextureUpdate() {
    this._textureID = this._textureTrimmedID = this._transformID = this._transformTrimmedID = -1;
    if ( this._width ) this.scale.x = Math.sign(this.scale.x) * this._width / this._texture.orig.width;
    if ( this._height ) this.scale.y = Math.sign(this.scale.y) * this._height / this._texture.orig.height;
    // Alpha mode of the texture could have changed
    this.#tintAlphaDirty = true;
  }

  /* ---------------------------------------- */

  /** @override */
  _onAnchorUpdate() {
    this._textureID = this._textureTrimmedID = this._transformID = this._transformTrimmedID = -1;
  }

  /* ---------------------------------------- */

  /**
   * Update uvs and push vertices and uv buffers on GPU if necessary.
   */
  updateUvs() {
    if ( this._textureID !== this._texture._updateID ) {
      this.uvs.set(this._texture._uvs.uvsFloat32);
      this.uvBuffer.update();
    }
  }

  /* ---------------------------------------- */

  /**
   * Initialize shader based on the shader class type.
   * @param {class} shaderCls         Shader class used. Must inherit from AbstractBaseShader.
   */
  setShaderClass(shaderCls) {
    // Escape conditions
    if ( !AbstractBaseShader.isPrototypeOf(shaderCls) ) {
      throw new Error("SpriteMesh shader class must inherit from AbstractBaseShader.");
    }
    if ( this.shader.constructor === shaderCls ) return;

    // Create shader program
    this.shader = shaderCls.create({
      sampler: this.texture ?? PIXI.Texture.EMPTY
    });
  }

  /* ---------------------------------------- */

  /** @override */
  updateTransform(parentTransform) {
    super.updateTransform(parentTransform);

    // We set tintAlphaDirty to true if the worldAlpha has changed
    // It is needed to recompute the _cachedTint vec4 which is a combination of tint and alpha
    if ( this.#worldAlpha !== this.worldAlpha ) {
      this.#worldAlpha = this.worldAlpha;
      this.#tintAlphaDirty = true;
    }
  }

  #worldAlpha;

  /* ---------------------------------------- */

  /** @override */
  calculateVertices() {
    if ( this._transformID === this.transform._worldID && this._textureID === this._texture._updateID ) return;

    // Update uvs if necessary
    this.updateUvs();
    this._transformID = this.transform._worldID;
    this._textureID = this._texture._updateID;

    // Set the vertex data
    const {a, b, c, d, tx, ty} = this.transform.worldTransform;
    const orig = this._texture.orig;
    const trim = this._texture.trim;

    let w1; let w0; let h1; let h0;
    if ( trim ) {
      // If the sprite is trimmed and is not a tilingsprite then we need to add the extra
      // space before transforming the sprite coords
      w1 = trim.x - (this._anchor._x * orig.width);
      w0 = w1 + trim.width;
      h1 = trim.y - (this._anchor._y * orig.height);
      h0 = h1 + trim.height;
    }
    else {
      w1 = -this._anchor._x * orig.width;
      w0 = w1 + orig.width;
      h1 = -this._anchor._y * orig.height;
      h0 = h1 + orig.height;
    }

    this.vertexData[0] = (a * w1) + (c * h1) + tx;
    this.vertexData[1] = (d * h1) + (b * w1) + ty;
    this.vertexData[2] = (a * w0) + (c * h1) + tx;
    this.vertexData[3] = (d * h1) + (b * w0) + ty;
    this.vertexData[4] = (a * w0) + (c * h0) + tx;
    this.vertexData[5] = (d * h0) + (b * w0) + ty;
    this.vertexData[6] = (a * w1) + (c * h0) + tx;
    this.vertexData[7] = (d * h0) + (b * w1) + ty;

    this.verticesBuffer.update();
  }

  /* ---------------------------------------- */

  /** @override */
  calculateTrimmedVertices(...args) {
    return PIXI.Sprite.prototype.calculateTrimmedVertices.call(this, ...args);
  }

  /* ---------------------------------------- */

  /** @override */
  _render(renderer) {
    this.calculateVertices();

    // Update tint if necessary
    if ( this.#tintAlphaDirty ) {
      PIXI.Color.shared.setValue(this._tintColor)
        .premultiply(this.worldAlpha, this.alphaMode > 0)
        .toArray(this._cachedTint);
      this.#tintAlphaDirty = false;
    }

    // Render by batch if a batched plugin is defined (or do a standard rendering)
    if ( this.pluginName in renderer.plugins ) this._renderToBatch(renderer);
    else this._renderDefault(renderer);
  }

  /* ---------------------------------------- */

  /** @override */
  _renderToBatch(renderer) {
    this._updateBatchData();
    const batchRenderer = renderer.plugins[this.pluginName];
    renderer.batch.setObjectRenderer(batchRenderer);
    batchRenderer.render(this._batchData);
  }

  /* ---------------------------------------- */

  /** @override */
  _renderDefault(renderer) {
    // Update properties of the shader
    this.shader?._preRender(this);

    // Draw the SpriteMesh
    renderer.batch.flush();
    renderer.shader.bind(this.shader);
    renderer.state.set(this.state);
    renderer.geometry.bind(this.geometry, this.shader);
    renderer.geometry.draw(this.drawMode, this.size, this.start);
  }

  /* ---------------------------------------- */

  /**
   * Update the batch data object.
   * TODO: temporary method until the upstream issue is fixed: https://github.com/pixijs/pixijs/issues/8511
   * @protected
   */
  _updateBatchData() {
    this._batchData._texture = this._texture;
    this._batchData.worldAlpha = this.worldAlpha;
    this._batchData._tintRGB = this._tintRGB;
    this._batchData.blendMode = this.blendMode;
  }

  /* ---------------------------------------- */

  /** @override */
  _calculateBounds(...args) {
    return PIXI.Sprite.prototype._calculateBounds.call(this, ...args);
  }

  /* ---------------------------------------- */

  /** @override */
  getLocalBounds(...args) {
    return PIXI.Sprite.prototype.getLocalBounds.call(this, ...args);
  }

  /* ---------------------------------------- */

  /** @override */
  containsPoint(...args) {
    return PIXI.Sprite.prototype.containsPoint.call(this, ...args);
  }

  /* ---------------------------------------- */

  /** @override */
  destroy(...args) {
    this.geometry = null;
    return PIXI.Sprite.prototype.destroy.call(this, ...args);
  }

  /* ---------------------------------------- */

  /**
   * Create a SpriteMesh from another source.
   * You can specify texture options and a specific shader class derived from AbstractBaseShader.
   * @param {string|PIXI.Texture|HTMLCanvasElement|HTMLVideoElement} source  Source to create texture from.
   * @param {object} [textureOptions]               See {@link PIXI.BaseTexture}'s constructor for options.
   * @param {AbstractBaseShader} [shaderCls]        The shader class to use. BaseSamplerShader by default.
   * @returns {SpriteMesh}
   */
  static from(source, textureOptions, shaderCls) {
    const texture = source instanceof PIXI.Texture ? source : PIXI.Texture.from(source, textureOptions);
    return new SpriteMesh(texture, shaderCls);
  }
}
