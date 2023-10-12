
/**
 * Wrapper for a web worker meant to convert a pixel buffer to the specified image format
 * and quality and return a base64 image
 * @param {string} name                            The worker name to be initialized
 * @param {object} [config={}]                     Worker initialization options
 * @param {boolean} [config.debug=false]           Should the worker run in debug mode?
 */
class TextureCompressor extends AsyncWorker {
  constructor(name="Texture Compressor", config={}) {
    config.debug ??= false;
    config.scripts ??= ["./workers/image-compressor.js", "./spark-md5.min.js"];
    config.loadPrimitives ??= false;
    super(name, config);

    // Do we need to control the hash?
    this.#controlHash = config.controlHash ?? false;
  }

  /**
   * Boolean to know if the texture compressor should control the hash.
   * @type {boolean}
   */
  #controlHash;

  /**
   * Previous texture hash.
   * @type {string}
   */
  #textureHash = "";

  /* -------------------------------------------- */

  /**
   * Process the non-blocking image compression to a base64 string.
   * @param {Uint8ClampedArray} buffer                      Buffer used to create the image data.
   * @param {number} width                                  Buffered image width.
   * @param {number} height                                 Buffered image height.
   * @param {object} options
   * @param {string} [options.type="image/png"]             The required image type.
   * @param {number} [options.quality=1]                    The required image quality.
   * @param {boolean} [options.debug]                       The debug option.
   * @returns {Promise<*>}
   */
  async compressBufferBase64(buffer, width, height, options={}) {
    if ( this.#controlHash ) options.hash = this.#textureHash;
    const params = {buffer, width, height, ...options};
    const result = await this.executeFunction("processBufferToBase64", [params], [buffer.buffer]);
    if ( result.hash ) this.#textureHash = result.hash;
    return result;
  }

  /* -------------------------------------------- */

  /**
   * Expand a buffer in RED format to a buffer in RGBA format.
   * @param {Uint8ClampedArray} buffer                      Buffer used to create the image data.
   * @param {number} width                                  Buffered image width.
   * @param {number} height                                 Buffered image height.
   * @param {object} options
   * @param {boolean} [options.debug]                       The debug option.
   * @returns {Promise<*>}
   */
  async expandBufferRedToBufferRGBA(buffer, width, height, options={}) {
    if ( this.#controlHash ) options.hash = this.#textureHash;
    const params = {buffer, width, height, ...options};
    const result = await this.executeFunction("processBufferRedToBufferRGBA", [params], [buffer.buffer]);
    if ( result.hash ) this.#textureHash = result.hash;
    return result;
  }

  /* -------------------------------------------- */

  /**
   * Reduce a buffer in RGBA format to a buffer in RED format.
   * @param {Uint8ClampedArray} buffer                      Buffer used to create the image data.
   * @param {number} width                                  Buffered image width.
   * @param {number} height                                 Buffered image height.
   * @param {object} options
   * @param {boolean} [options.debug]                       The debug option.
   * @returns {Promise<*>}
   */
  async reduceBufferRGBAToBufferRED(buffer, width, height, options={}) {
    if ( this.#controlHash ) options.hash = this.#textureHash;
    const params = {buffer, width, height, ...options};
    const result = await this.executeFunction("processBufferRGBAToBufferRED", [params], [buffer.buffer]);
    if ( result.hash ) this.#textureHash = result.hash;
    return result;
  }
}
