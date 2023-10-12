/**
 * A representation of a color in hexadecimal format.
 * This class provides methods for transformations and manipulations of colors.
 */
export default class Color extends Number {

  /**
   * A CSS-compatible color string.
   * An alias for Color#toString.
   * @type {string}
   */
  get css() {
    return this.toString(16);
  }

  /* ------------------------------------------ */

  /**
   * The color represented as an RGB array.
   * @type {[number, number, number]}
   */
  get rgb() {
    return [...this];
  }

  /* ------------------------------------------ */

  /**
   * The numeric value of the red channel between [0, 1].
   * @type {number}
   */
  get r() {
    return ((this >> 16) & 0xFF) / 255;
  }

  /* ------------------------------------------ */

  /**
   * The numeric value of the green channel between [0, 1].
   * @type {number}
   */
  get g() {
    return ((this >> 8) & 0xFF) / 255;
  }

  /* ------------------------------------------ */

  /**
   * The numeric value of the blue channel between [0, 1].
   * @type {number}
   */
  get b() {
    return (this & 0xFF) / 255;
  }

  /* ------------------------------------------ */

  /**
   * The maximum value of all channels.
   * @type {number}
   */
  get maximum() {
    return Math.max(...this);
  }

  /* ------------------------------------------ */

  /**
   * The minimum value of all channels.
   * @type {number}
   */
  get minimum() {
    return Math.min(...this);
  }

  /* ------------------------------------------ */

  /**
   * Get the value of this color in little endian format.
   * @type {number}
   */
  get littleEndian() {
    return ((this >> 16) & 0xFF) + (this & 0x00FF00) + ((this & 0xFF) << 16);
  }

  /* ------------------------------------------ */

  /**
   * The color represented as an HSV array.
   * Conversion formula adapted from http://en.wikipedia.org/wiki/HSV_color_space.
   * Assumes r, g, and b are contained in the set [0, 1] and returns h, s, and v in the set [0, 1].
   * @type {[number, number, number]}
   */
  get hsv() {
    const [r, g, b] = this.rgb;
    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    const d = max - min;

    let h;
    const s = max === 0 ? 0 : d / max;
    const v = max;

    // Achromatic colors
    if (max === min) return [0, s, v];

    // Normal colors
    switch (max) {
      case r: h = (g - b) / d + (g < b ? 6 : 0); break;
      case g: h = (b - r) / d + 2; break;
      case b: h = (r - g) / d + 4; break;
    }
    h /= 6;
    return [h, s, v];
  }

  /* ------------------------------------------ */
  /*  Color Manipulation Methods                */
  /* ------------------------------------------ */

  /** @override */
  toString(radix) {
    return `#${super.toString(16).padStart(6, "0")}`;
  }

  /* ------------------------------------------ */

  /**
   * Test whether this color equals some other color
   * @param {Color|number} other  Some other color or hex number
   * @returns {boolean}           Are the colors equal?
   */
  equals(other) {
    return this.valueOf() === other.valueOf();
  }

  /* ------------------------------------------ */

  /**
   * Get a CSS-compatible RGBA color string.
   * @param {number} alpha      The desired alpha in the range [0, 1]
   * @returns {string}          A CSS-compatible RGBA string
   */
  toRGBA(alpha) {
    const rgba = [(this >> 16) & 0xFF, (this >> 8) & 0xFF, this & 0xFF, alpha]
    return `rgba(${rgba.join(", ")})`;
  }

  /* ------------------------------------------ */

  /**
   * Mix this Color with some other Color using a provided interpolation weight.
   * @param {Color} other       Some other Color to mix with
   * @param {number} weight     The mixing weight placed on this color where weight is placed on the other color
   * @returns {Color}           The resulting mixed Color
   */
  mix(other, weight) {
    const o = other.rgb;
    const mixed = this.rgb.map((c, i) => Math.clamped((weight * o[i]) + ((1 - weight) * c), 0, 1));
    return Color.fromRGB(mixed);
  }

  /* ------------------------------------------ */

  /**
   * Multiply this Color by another Color or a static scalar.
   * @param {Color|number} other  Some other Color or a static scalar.
   * @returns {Color}             The resulting Color.
   */
  multiply(other) {
    const o = other instanceof Color ? other.rgb : [other, other, other];
    const mixed = this.rgb.map((c, i) => Math.clamped(c * o[i], 0, 1));
    return Color.fromRGB(mixed);
  }

  /* ------------------------------------------ */

  /**
   * Add this Color by another Color or a static scalar.
   * @param {Color|number} other  Some other Color or a static scalar.
   * @returns {Color}             The resulting Color.
   */
  add(other) {
    const o = other instanceof Color ? other.rgb : [other, other, other];
    const mixed = this.rgb.map((c, i) => Math.clamped(c + o[i], 0, 1));
    return Color.fromRGB(mixed);
  }

  /* ------------------------------------------ */

  /**
   * Subtract this Color by another Color or a static scalar.
   * @param {Color|number} other  Some other Color or a static scalar.
   * @returns {Color}             The resulting Color.
   */
  subtract(other) {
    const o = other instanceof Color ? other.rgb : [other, other, other];
    const mixed = this.rgb.map((c, i) => Math.clamped(c - o[i], 0, 1));
    return Color.fromRGB(mixed);
  }

  /* ------------------------------------------ */

  /**
   * Max this color by another Color or a static scalar.
   * @param {Color|number} other  Some other Color or a static scalar.
   * @returns {Color}             The resulting Color.
   */
  maximize(other) {
    const o = other instanceof Color ? other.rgb : [other, other, other];
    const mixed = this.rgb.map((c, i) => Math.clamped(Math.max(c, o[i]), 0, 1));
    return Color.fromRGB(mixed);
  }

  /* ------------------------------------------ */

  /**
   * Min this color by another Color or a static scalar.
   * @param {Color|number} other  Some other Color or a static scalar.
   * @returns {Color}             The resulting Color.
   */
  minimize(other) {
    const o = other instanceof Color ? other.rgb : [other, other, other];
    const mixed = this.rgb.map((c, i) => Math.clamped(Math.min(c, o[i]), 0, 1));
    return Color.fromRGB(mixed);
  }

  /* ------------------------------------------ */
  /*  Iterator                                  */
  /* ------------------------------------------ */

  /**
   * Iterating over a Color is equivalent to iterating over its [r,g,b] color channels.
   * @returns {Generator<number>}
   */
  *[Symbol.iterator]() {
    yield this.r;
    yield this.g;
    yield this.b;
  }

  /* ------------------------------------------ */
  /*  Factory Methods                           */
  /* ------------------------------------------ */

  /**
   * Create a Color instance from an RGB array.
   * @param {null|string|number|number[]} color A color input
   * @returns {Color|NaN}                       The hex color instance or NaN
   */
  static from(color) {
    if ( (color === null) || (color === undefined) ) return NaN;
    if ( typeof color === "string" ) return this.fromString(color);
    if ( typeof color === "number" ) return new this(color);
    if ( (color instanceof Array) && (color.length === 3) ) return this.fromRGB(color);
    if ( color instanceof Color ) return color;
    // For all other cases, we keep the Number logic.
    return Number(color);
  }

  /* ------------------------------------------ */

  /**
   * Create a Color instance from a color string which either includes or does not include a leading #.
   * @param {string} color                      A color string
   * @returns {Color}                           The hex color instance
   */
  static fromString(color) {
    return new this(parseInt(color.startsWith("#") ? color.substring(1) : color, 16));
  }

  /* ------------------------------------------ */

  /**
   * Create a Color instance from an RGB array.
   * @param {[number, number, number]} rgb      An RGB tuple
   * @returns {Color}                           The hex color instance
   */
  static fromRGB(rgb) {
    return new this(((rgb[0] * 255) << 16) + ((rgb[1] * 255) << 8) + (rgb[2] * 255 | 0));
  }

  /* ------------------------------------------ */

  /**
   * Create a Color instance from an HSV array.
   * Conversion formula adapted from http://en.wikipedia.org/wiki/HSV_color_space.
   * Assumes h, s, and v are contained in the set [0, 1].
   * @param {[number, number, number]} hsv      An HSV tuple
   * @returns {Color}                           The hex color instance
   */
  static fromHSV(hsv) {
    const [h, s, v] = hsv;
    const i = Math.floor(h * 6);
    const f = (h * 6) - i;
    const p = v * (1 - s);
    const q = v * (1 - f * s);
    const t = v * (1 - (1 - f) * s);
    let rgb;
    switch (i % 6) {
      case 0: rgb = [v, t, p]; break;
      case 1: rgb = [q, v, p]; break;
      case 2: rgb = [p, v, t]; break;
      case 3: rgb = [p, q, v]; break;
      case 4: rgb = [t, p, v]; break;
      case 5: rgb = [v, p, q]; break;
    }
    return this.fromRGB(rgb);
  }
}
