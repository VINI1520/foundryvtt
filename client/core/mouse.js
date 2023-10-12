/**
 * Management class for Mouse events
 */
class MouseManager {
  constructor() {
    this._wheelTime = 0;
  }

  /**
   * Specify a rate limit for mouse wheel to gate repeated scrolling.
   * This is especially important for continuous scrolling mice which emit hundreds of events per second.
   * This designates a minimum number of milliseconds which must pass before another wheel event is handled
   * @type {number}
   */
  static MOUSE_WHEEL_RATE_LIMIT = 50;

  /* -------------------------------------------- */

  /**
   * Begin listening to mouse events.
   * @internal
   */
  _activateListeners() {
    window.addEventListener("wheel", this._onWheel.bind(this), {passive: false});
  }

  /* -------------------------------------------- */

  /**
   * Master mouse-wheel event handler
   * @param {WheelEvent} event    The mouse wheel event
   * @private
   */
  _onWheel(event) {

    // Prevent zooming the entire browser window
    if ( event.ctrlKey ) event.preventDefault();

    // Interpret shift+scroll as vertical scroll
    let dy = event.delta = event.deltaY;
    if ( event.shiftKey && (dy === 0) ) {
      dy = event.delta = event.deltaX;
    }
    if ( dy === 0 ) return;

    // Take no actions if the canvas is not hovered
    if ( !canvas.ready ) return;
    const hover = document.elementFromPoint(event.clientX, event.clientY);
    if ( !hover || (hover.id !== "board") ) return;
    event.preventDefault();

    // Identify scroll modifiers
    const isCtrl = event.ctrlKey || event.metaKey;
    const isShift = event.shiftKey;
    const layer = canvas.activeLayer;

    // Case 1 - rotate placeable objects
    if ( layer?.options?.rotatableObjects && (isCtrl || isShift) ) {
      const hasTarget = layer.options?.controllableObjects ? layer.controlled.length : !!layer.hover;
      if ( hasTarget ) {
        const t = Date.now();
        if ( (t - this._wheelTime) < this.constructor.MOUSE_WHEEL_RATE_LIMIT ) return;
        this._wheelTime = t;
        return layer._onMouseWheel(event);
      }
    }

    // Case 2 - zoom the canvas
    canvas._onMouseWheel(event);
  }
}
