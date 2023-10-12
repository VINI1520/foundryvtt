/**
 * A class or interface that provide support for WebGL async read pixel/texture data extraction.
 */
class TextureExtractor {
  constructor(renderer, {callerName, controlHash, format=PIXI.FORMATS.RED}={}) {
    this.#renderer = renderer;
    this.#callerName = callerName ?? "TextureExtractor";
    this.#compressor = new TextureCompressor("Compressor", {debug: false, controlHash});

    // Verify that the required format is supported by the texture extractor
    if ( !((format === PIXI.FORMATS.RED) || (format === PIXI.FORMATS.RGBA)) ) {
      throw new Error("TextureExtractor supports format RED and RGBA only.")
    }

    // Assign format, types, and read mode
    this.#format = format;
    this.#type = PIXI.TYPES.UNSIGNED_BYTE;
    this.#readFormat = (((format === PIXI.FORMATS.RED) && !canvas.supported.readPixelsRED)
      || format === PIXI.FORMATS.RGBA) ? PIXI.FORMATS.RGBA : PIXI.FORMATS.RED;

    // We need to intercept context change
    this.#renderer.runners.contextChange.add(this);
  }

  /**
   * List of compression that could be applied with extraction
   * @enum {number}
   */
  static COMPRESSION_MODES = {
    NONE: 0,
    BASE64: 1
  };

  /**
   * The WebGL2 renderer.
   * @type {Renderer}
   */
  #renderer;

  /**
   * The reference to a WebGL2 sync object.
   * @type {WebGLSync}
   */
  #glSync;

  /**
   * The texture format on which the Texture Extractor must work.
   * @type {PIXI.FORMATS}
   */
  #format

  /**
   * The texture type on which the Texture Extractor must work.
   * @type {PIXI.TYPES}
   */
  #type

  /**
   * The texture format on which the Texture Extractor should read.
   * @type {PIXI.FORMATS}
   */
  #readFormat

  /**
   * The reference to the GPU buffer.
   * @type {WebGLBuffer}
   */
  #gpuBuffer;

  /**
   * To know if we need to create a GPU buffer.
   * @type {boolean}
   */
  #createBuffer;

  /**
   * Debug flag.
   * @type {boolean}
   */
  debug;

  /**
   * The reference to the pixel buffer.
   * @type {Uint8ClampedArray}
   */
  pixelBuffer;

  /**
   * The caller name associated with this instance of texture extractor (optional, used for debug)
   * @type {string}
   */
  #callerName;

  /**
   * Generated RenderTexture for textures.
   * @type {PIXI.RenderTexture}
   */
  #generatedRenderTexture;

  /* -------------------------------------------- */
  /*  TextureExtractor Compression Worker         */
  /* -------------------------------------------- */

  /**
   * The compressor worker wrapper
   * @type {TextureCompressor}
   */
  #compressor;

  /* -------------------------------------------- */
  /*  TextureExtractor Properties                 */
  /* -------------------------------------------- */

  /**
   * Returns the read buffer width/height multiplier.
   * @returns {number}
   */
  get #readBufferMul() {
    return this.#readFormat === PIXI.FORMATS.RED ? 1 : 4;
  }

  /* -------------------------------------------- */
  /*  TextureExtractor Synchronization            */
  /* -------------------------------------------- */

  /**
   * Handling of the concurrency for the extraction (by default a queue of 1)
   * @type {Semaphore}
   */
  #queue = new foundry.utils.Semaphore();

  /* -------------------------------------------- */

  /**
   * @typedef {Object} TextureExtractionOptions
   * @property {PIXI.Texture|PIXI.RenderTexture|null} [texture]   The texture the pixels are extracted from.
   *                                                              Otherwise, extract from the renderer.
   * @property {PIXI.Rectangle} [frame]                           The rectangle which the pixels are extracted from.
   * @property {TextureExtractor.COMPRESSION_MODES} [compression] The compression mode to apply, or NONE
   * @property {string}         [type]                            The optional image mime type.
   * @property {string}         [quality]                         The optional image quality.
   * @property {boolean} [debug]                                  The optional debug flag to use.
   */

  /**
   * Extract a rectangular block of pixels from the texture (without un-pre-multiplying).
   * @param {TextureExtractionOptions} options                    Options which configure extraction behavior
   * @returns {Promise}
   */
  async extract(options={}) {
    return this.#queue.add(this.#extract.bind(this), options);
  }

  /* -------------------------------------------- */
  /*  TextureExtractor Methods/Interface          */
  /* -------------------------------------------- */

  /**
   * Extract a rectangular block of pixels from the texture (without un-pre-multiplying).
   * @param {TextureExtractionOptions} options                    Options which configure extraction behavior
   * @returns {Promise}
   */
  async #extract({texture, frame, compression, type, quality, debug}={}) {

    // Set the debug flag
    this.debug = debug;
    if ( this.debug ) this.#consoleDebug("Begin texture extraction.");

    // Checking texture validity
    const baseTexture = texture?.baseTexture;
    if ( texture && (!baseTexture || !baseTexture.valid || baseTexture.parentTextureArray) ) {
      throw new Error("Texture passed to extractor is invalid.");
    }

    // Checking if texture is in RGBA format and premultiplied
    if ( texture && (texture.baseTexture.alphaMode > 0) && (texture.baseTexture.format === PIXI.FORMATS.RGBA) ) {
      throw new Error("Texture Extractor is not supporting premultiplied textures yet.");
    }

    let resolution;

    // If the texture is a RT, use its frame and resolution
    if ( (texture instanceof PIXI.RenderTexture) && ((baseTexture.format === this.#format)
        || (this.#readFormat === PIXI.FORMATS.RGBA) )
      && (baseTexture.type === this.#type) ) {
      frame ??= texture.frame;
      resolution = baseTexture.resolution;
    }
    // Case when the texture is not a render texture
    // Generate a render texture and assign frame and resolution from it
    else {
      texture = this.#generatedRenderTexture = this.#renderer.generateTexture(new PIXI.Sprite(texture), {
        format: this.#format,
        type: this.#type,
        resolution: baseTexture.resolution,
        multisample: PIXI.MSAA_QUALITY.NONE
      });
      frame ??= this.#generatedRenderTexture.frame;
      resolution = texture.baseTexture.resolution;
    }

    // Bind the texture
    this.#renderer.renderTexture.bind(texture);

    // Get the buffer from the GPU
    const data = await this.#readPixels(frame, resolution);

    // Return the compressed image or the raw buffer
    if ( compression ) {
      return await this.#compressBuffer(data.buffer, data.width, data.height, {compression, type, quality});
    }
    else if ( (this.#format === PIXI.FORMATS.RED) && (this.#readFormat === PIXI.FORMATS.RGBA) ) {
      const result = await this.#compressor.reduceBufferRGBAToBufferRED(data.buffer, data.width, data.height, {compression, type, quality});
      // Returning control of the buffer to the extractor
      this.pixelBuffer = result.buffer;
      // Returning the result
      return result.redBuffer;
    }
    return data.buffer;
  }

  /* -------------------------------------------- */

  /**
   * Free all the bound objects.
   */
  reset() {
    if ( this.debug ) this.#consoleDebug("Data reset.");
    this.#clear({buffer: true, syncObject: true, rt: true});
  }

  /* -------------------------------------------- */

  /**
   * Called by the renderer contextChange runner.
   */
  contextChange() {
    if ( this.debug ) this.#consoleDebug("WebGL context has changed.");
    this.#glSync = undefined;
    this.#generatedRenderTexture = undefined;
    this.#gpuBuffer = undefined;
    this.pixelBuffer = undefined;
  }

  /* -------------------------------------------- */
  /*  TextureExtractor Management                 */
  /* -------------------------------------------- */


  /**
   * Compress the buffer and returns a base64 image.
   * @param {*} args
   * @returns {Promise<string>}
   */
  async #compressBuffer(...args) {
    if ( canvas.supported.offscreenCanvas ) return this.#compressBufferWorker(...args);
    else return this.#compressBufferLocal(...args);
  }

  /* -------------------------------------------- */

  /**
   * Compress the buffer into a worker and returns a base64 image
   * @param {Uint8ClampedArray} buffer          Buffer to convert into a compressed base64 image.
   * @param {number} width                      Width of the image.
   * @param {number} height                     Height of the image.
   * @param {object} options
   * @param {string} options.type               Format of the image.
   * @param {number} options.quality            Quality of the compression.
   * @returns {Promise<string>}
   */
  async #compressBufferWorker(buffer, width, height, {type, quality}={}) {
    let result;
    try {
      // Launch compression
      result = await this.#compressor.compressBufferBase64(buffer, width, height, {
        type: type ?? "image/png",
        quality: quality ?? 1,
        debug: this.debug,
        readFormat: this.#readFormat
      });
    }
    catch(e) {
      this.#consoleError("Buffer compression has failed!");
      throw e;
    }
    // Returning control of the buffer to the extractor
    this.pixelBuffer = result.buffer;
    // Returning the result
    return result.base64img;
  }

  /* -------------------------------------------- */

  /**
   * Compress the buffer locally (but expand the buffer into a worker) and returns a base64 image.
   * The image format is forced to jpeg.
   * @param {Uint8ClampedArray} buffer          Buffer to convert into a compressed base64 image.
   * @param {number} width                      Width of the image.
   * @param {number} height                     Height of the image.
   * @param {object} options
   * @param {number} options.quality            Quality of the compression.
   * @returns {Promise<string>}
   */
  async #compressBufferLocal(buffer, width, height, {quality}={}) {
    let rgbaBuffer;
    if ( this.#readFormat === PIXI.FORMATS.RED ) {
      let result;
      try {
        // Launch buffer expansion on the worker thread
        result = await this.#compressor.expandBufferRedToBufferRGBA(buffer, width, height, {
          debug: this.debug
        });
      } catch(e) {
        this.#consoleError("Buffer expansion has failed!");
        throw e;
      }
      // Returning control of the buffer to the extractor
      this.pixelBuffer = result.buffer;
      rgbaBuffer = result.rgbaBuffer;
    } else {
      rgbaBuffer = buffer;
    }
    if ( !rgbaBuffer ) return;

    // Proceed at the compression locally and return the base64 image
    const element = ImageHelper.pixelsToCanvas(rgbaBuffer, width, height);
    return await ImageHelper.canvasToBase64(element, "image/jpeg", quality); // Force jpeg compression
  }

  /* -------------------------------------------- */

  /**
   * Prepare data for the asynchronous readPixel.
   * @param {PIXI.Rectangle} frame
   * @param {number} resolution
   * @returns {object}
   */
  async #readPixels(frame, resolution) {
    const gl = this.#renderer.gl;

    // Set dimensions and buffer size
    const x = Math.round(frame.left * resolution);
    const y = Math.round(frame.top * resolution);
    const width = Math.round(frame.width * resolution);
    const height = Math.round(frame.height * resolution);
    const bufSize = width * height * this.#readBufferMul;

    // Set format and type needed for the readPixel command
    const format = this.#readFormat;
    const type = gl.UNSIGNED_BYTE;

    // Useful debug information
    if ( this.debug ) console.table({x, y, width, height, bufSize, format, type, extractorFormat: this.#format});

    // The buffer that will hold the pixel data
    const pixels = this.#getPixelCache(bufSize);

    // Start the non-blocking read
    // Create or reuse the GPU buffer and bind as buffer data
    if ( this.#createBuffer ) {
      if ( this.debug ) this.#consoleDebug("Creating buffer.");
      this.#createBuffer = false;
      if ( this.#gpuBuffer ) this.#clear({buffer: true});
      this.#gpuBuffer = gl.createBuffer();
      gl.bindBuffer(gl.PIXEL_PACK_BUFFER, this.#gpuBuffer);
      gl.bufferData(gl.PIXEL_PACK_BUFFER, bufSize, gl.DYNAMIC_READ);
    }
    else {
      if ( this.debug ) this.#consoleDebug("Reusing cached buffer.");
      gl.bindBuffer(gl.PIXEL_PACK_BUFFER, this.#gpuBuffer);
    }

    // Performs read pixels GPU Texture -> GPU Buffer
    gl.pixelStorei(gl.PACK_ALIGNMENT, 1);
    gl.readPixels(x, y, width, height, format, type, 0);
    gl.pixelStorei(gl.PACK_ALIGNMENT, 4);
    gl.bindBuffer(gl.PIXEL_PACK_BUFFER, null);

    // Declare the sync object
    this.#glSync = gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0);

    // Flush all pending gl commands, including the commands above (important: flush is non blocking)
    // The glSync will be complete when all commands will be executed
    gl.flush();

    // Waiting for the sync object to resolve
    await this.#wait();

    // Retrieve the GPU buffer data
    const data = this.#getGPUBufferData(pixels, width, height, bufSize);

    // Clear the sync object and possible generated render texture
    this.#clear({syncObject: true, rt: true});

    // Return the data
    if ( this.debug ) this.#consoleDebug("Buffer data sent to caller.");

    return data;
  }

  /* -------------------------------------------- */

  /**
   * Retrieve the content of the GPU buffer and put it pixels.
   * Returns an object with the pixel buffer and dimensions.
   * @param {Uint8ClampedArray} buffer                        The pixel buffer.
   * @param {number} width                                    The width of the texture.
   * @param {number} height                                   The height of the texture.
   * @param {number} bufSize                                  The size of the buffer.
   * @returns {object<Uint8ClampedArray, number, number>}
   */
  #getGPUBufferData(buffer, width, height, bufSize) {
    const gl = this.#renderer.gl;

    // Retrieve the GPU buffer data
    gl.bindBuffer(gl.PIXEL_PACK_BUFFER, this.#gpuBuffer);
    gl.getBufferSubData(gl.PIXEL_PACK_BUFFER, 0, buffer, 0, bufSize);
    gl.bindBuffer(gl.PIXEL_PACK_BUFFER, null);

    return {buffer, width, height};
  }

  /* -------------------------------------------- */

  /**
   * Retrieve a pixel buffer of the given length.
   * A cache is provided for the last length passed only (to avoid too much memory consumption)
   * @param {number} length           Length of the required buffer.
   * @returns {Uint8ClampedArray}     The cached or newly created buffer.
   */
  #getPixelCache(length) {
    if ( this.pixelBuffer?.length !== length ) {
      this.pixelBuffer = new Uint8ClampedArray(length);
      // If the pixel cache need to be (re)created, the same for the GPU buffer
      this.#createBuffer = true;
    }
    return this.pixelBuffer;
  }

  /* -------------------------------------------- */

  /**
   * Wait for the synchronization object to resolve.
   * @returns {Promise}
   */
  async #wait() {
    // Preparing data for testFence
    const gl = this.#renderer.gl;
    const sync = this.#glSync;

    // Prepare for fence testing
    const result = await new Promise((resolve, reject) => {
      /**
       * Test the fence sync object
       */
      function wait() {
        const res = gl.clientWaitSync(sync, 0, 0);
        if ( res === gl.WAIT_FAILED ) {
          reject(false);
          return;
        }
        if ( res === gl.TIMEOUT_EXPIRED ) {
          setTimeout(wait, 10);
          return;
        }
        resolve(true);
      }
      wait();
    });

    // The promise was rejected?
    if ( !result ) {
      this.#clear({buffer: true, syncObject: true, data: true, rt: true});
      throw new Error("The sync object has failed to wait.");
    }
  }

  /* -------------------------------------------- */

  /**
   * Clear some key properties.
   * @param {object} options
   * @param {boolean} [options.buffer=false]
   * @param {boolean} [options.syncObject=false]
   * @param {boolean} [options.rt=false]
   */
  #clear({buffer=false, syncObject=false, rt=false}={}) {
    if ( syncObject && this.#glSync ) {
      // Delete the sync object
      this.#renderer.gl.deleteSync(this.#glSync);
      this.#glSync = undefined;
      if ( this.debug ) this.#consoleDebug("Free the sync object.");
    }
    if ( buffer ) {
      // Delete the buffers
      if ( this.#gpuBuffer ) {
        this.#renderer.gl.deleteBuffer(this.#gpuBuffer);
        this.#gpuBuffer = undefined;
      }
      this.pixelBuffer = undefined;
      this.#createBuffer = true;
      if ( this.debug ) this.#consoleDebug("Free the cached buffers.");
    }
    if ( rt && this.#generatedRenderTexture ) {
      // Delete the generated render texture
      this.#generatedRenderTexture.destroy(true);
      this.#generatedRenderTexture = undefined;
      if ( this.debug ) this.#consoleDebug("Destroy the generated render texture.");
    }
  }

  /* -------------------------------------------- */

  /**
   * Convenience method to display the debug messages with the extractor.
   * @param {string} message      The debug message to display.
   */
  #consoleDebug(message) {
    console.debug(`${this.#callerName} | ${message}`);
  }

  /* -------------------------------------------- */

  /**
   * Convenience method to display the error messages with the extractor.
   * @param {string} message      The error message to display.
   */
  #consoleError(message) {
    console.error(`${this.#callerName} | ${message}`);
  }
}
