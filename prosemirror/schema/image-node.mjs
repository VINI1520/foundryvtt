/**
 * A class responsible for encapsulating logic around image nodes in the ProseMirror schema.
 */
export default class ImageNode {
  /**
   * Image node schema attributes.
   * @returns {object}
   */
  static get attrs() {
    return {
      src: {},
      alt: {default: null},
      title: {default: null},
      width: {default: ""},
      height: {default: ""},
      alignment: {default: "", formatting: true}
    };
  }

  /* -------------------------------------------- */

  /**
   * Check if an HTML element is appropriate to represent as this node, and if so, extract its schema attributes.
   * @param {HTMLElement} el    The HTML element.
   * @returns {object|boolean}  Returns false if the HTML element is not appropriate for this schema node.
   */
  static getAttrs(el) {
    const attrs = {
      src: el.getAttribute("src"),
      title: el.title,
      alt: el.alt
    };
    if ( el.classList.contains("centered") ) attrs.alignment = "center";
    else if ( el.style.float ) attrs.alignment = el.style.float;
    if ( el.hasAttribute("width") ) attrs.width = el.width;
    if ( el.hasAttribute("height") ) attrs.height = el.height;
    return attrs;
  }

  /* -------------------------------------------- */

  /**
   * Convert a ProseMirror image node back into an HTML element.
   * @param {Node} node  The ProseMirror node.
   * @returns {[string, any]}
   */
  static toDOM(node) {
    const {src, alt, title, width, height, alignment} = node.attrs;
    const attrs = {src};
    if ( alignment === "center" ) attrs.class = "centered";
    else if ( alignment ) attrs.style = `float: ${alignment};`;
    if ( alt ) attrs.alt = alt;
    if ( title ) attrs.title = title;
    if ( width ) attrs.width = width;
    if ( height ) attrs.height = height;
    return ["img", attrs];
  }

  /* -------------------------------------------- */

  /**
   * Create a ProseMirror schema node that represents an image element.
   * @returns {NodeSpec}
   */
  static makeNode() {
    return {
      attrs: this.attrs,
      managed: {styles: ["float"], classes: ["centered"]},
      group: "block",
      draggable: true,
      parseDOM: [{tag: "img[src]", getAttrs: this.getAttrs.bind(this)}],
      toDOM: this.toDOM.bind(this)
    };
  }
}
