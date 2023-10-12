/**
 * Extension of a PIXI.Mesh, with the capabilities to provide a snapshot of the framebuffer.
 * @extends PIXI.Mesh
 */
class PointSourceMesh extends PIXI.Mesh {
  /**
   * To store the previous blend mode of the last renderer PointSourceMesh.
   * @type {PIXI.BLEND_MODES}
   * @protected
   */
  static _priorBlendMode;

  /**
   * The current texture used by the mesh.
   * @type {PIXI.Texture}
   * @protected
   */
  static _currentTexture;

  /* ---------------------------------------- */

  /** @override */
  _render(renderer) {
    if ( this.uniforms.framebufferTexture !== undefined ) {
      if ( canvas.blur.enabled ) {
        // We need to use the snapshot only if blend mode is changing
        const requireUpdate = (this.state.blendMode !== PointSourceMesh._priorBlendMode)
          && (PointSourceMesh._priorBlendMode !== undefined);
        if ( requireUpdate ) PointSourceMesh._currentTexture = canvas.snapshot.getFramebufferTexture(renderer);
        PointSourceMesh._priorBlendMode = this.state.blendMode;
      }
      this.uniforms.framebufferTexture = PointSourceMesh._currentTexture;
    }
    super._render(renderer);
  }
}
