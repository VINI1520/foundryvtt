/**
 * A tour for demonstrating an aspect of Canvas functionality.
 * Automatically activates a certain canvas layer or tool depending on the needs of the step.
 */
class CanvasTour extends Tour {

  /** @override */
  async start() {
    game.togglePause(false);
    await super.start();
  }

  /* -------------------------------------------- */

  /** @override */
  get canStart() {
    return !!canvas.scene;
  }

  /* -------------------------------------------- */

  /** @override */
  async _preStep() {
    await super._preStep();
    this.#activateTool();
  }

  /* -------------------------------------------- */

  /**
   * Activate a canvas layer and control for each step
   */
  #activateTool() {
    if ( "layer" in this.currentStep && canvas.scene ) {
      const layer = canvas[this.currentStep.layer];
      if ( layer.active ) ui.controls.initialize({tool: this.currentStep.tool});
      else layer.activate({tool: this.currentStep.tool});
    }
  }
}
