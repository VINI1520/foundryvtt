/**
 * @typedef {object} DragDropConfiguration
 * @property {string} dragSelector     The CSS selector used to target draggable elements.
 * @property {string} dropSelector     The CSS selector used to target viable drop targets.
 * @property {Object<string,Function>} permissions    An object of permission test functions for each action
 * @property {Object<string,Function>} callbacks      An object of callback functions for each action
 */

/**
 * A controller class for managing drag and drop workflows within an Application instance.
 * The controller manages the following actions: dragstart, dragover, drop
 * @see {@link Application}
 *
 * @param {DragDropConfiguration}
 * @example Activate drag-and-drop handling for a certain set of elements
 * ```js
 * const dragDrop = new DragDrop({
 *   dragSelector: ".item",
 *   dropSelector: ".items",
 *   permissions: { dragstart: this._canDragStart.bind(this), drop: this._canDragDrop.bind(this) },
 *   callbacks: { dragstart: this._onDragStart.bind(this), drop: this._onDragDrop.bind(this) }
 * });
 * dragDrop.bind(html);
 * ```
 */
class DragDrop {
  constructor({dragSelector, dropSelector, permissions={}, callbacks={}} = {}) {

    /**
     * The HTML selector which identifies draggable elements
     * @type {string}
     */
    this.dragSelector = dragSelector;

    /**
     * The HTML selector which identifies drop targets
     * @type {string}
     */
    this.dropSelector = dropSelector;

    /**
     * A set of permission checking functions for each action of the Drag and Drop workflow
     * @type {Object}
     */
    this.permissions = permissions;

    /**
     * A set of callback functions for each action of the Drag and Drop workflow
     * @type {Object}
     */
    this.callbacks = callbacks;
  }

  /* -------------------------------------------- */

  /**
   * Bind the DragDrop controller to an HTML application
   * @param {HTMLElement} html    The HTML element to which the handler is bound
   */
  bind(html) {

    // Identify and activate draggable targets
    if ( this.can("dragstart", this.dragSelector) ) {
      const draggables = html.querySelectorAll(this.dragSelector);
      for (let el of draggables) {
        el.setAttribute("draggable", true);
        el.ondragstart = this._handleDragStart.bind(this);
      }
    }

    // Identify and activate drop targets
    if ( this.can("drop", this.dropSelector) ) {
      const droppables = !this.dropSelector || html.matches(this.dropSelector) ? [html] :
        html.querySelectorAll(this.dropSelector);
      for ( let el of droppables ) {
        el.ondragover = this._handleDragOver.bind(this);
        el.ondrop = this._handleDrop.bind(this);
      }
    }
    return this;
  }

  /* -------------------------------------------- */

  /**
   * Execute a callback function associated with a certain action in the workflow
   * @param {DragEvent} event   The drag event being handled
   * @param {string} action     The action being attempted
   */
  callback(event, action) {
    const fn = this.callbacks[action];
    if ( fn instanceof Function ) return fn(event);
  }

  /* -------------------------------------------- */

  /**
   * Test whether the current user has permission to perform a step of the workflow
   * @param {string} action     The action being attempted
   * @param {string} selector   The selector being targeted
   * @return {boolean}          Can the action be performed?
   */
  can(action, selector) {
    const fn = this.permissions[action];
    if ( fn instanceof Function ) return fn(selector);
    return true;
  }

  /* -------------------------------------------- */

  /**
   * Handle the start of a drag workflow
   * @param {DragEvent} event   The drag event being handled
   * @private
   */
  _handleDragStart(event) {
    this.callback(event, "dragstart");
    if ( event.dataTransfer.items.length ) event.stopPropagation();
  }

  /* -------------------------------------------- */

  /**
   * Handle a dragged element over a droppable target
   * @param {DragEvent} event   The drag event being handled
   * @private
   */
  _handleDragOver(event) {
    event.preventDefault();
    this.callback(event, "dragover");
    return false;
  }

  /* -------------------------------------------- */

  /**
   * Handle a dragged element dropped on a droppable target
   * @param {DragEvent} event   The drag event being handled
   * @private
   */
  _handleDrop(event) {
    event.preventDefault();
    return this.callback(event, "drop");
  }

  /* -------------------------------------------- */

  static createDragImage(img, width, height) {
    let div = document.getElementById("drag-preview");

    // Create the drag preview div
    if ( !div ) {
      div = document.createElement("div");
      div.setAttribute("id", "drag-preview");
      const img = document.createElement("img");
      img.classList.add("noborder");
      div.appendChild(img);
      document.body.appendChild(div);
    }

    // Add the preview image
    const i = div.children[0];
    i.src = img.src;
    i.width = width;
    i.height = height;
    return div;
  }
}
