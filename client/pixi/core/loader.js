/**
 * A Loader class which helps with loading video and image textures.
 */
class TextureLoader {

  /**
   * The duration in milliseconds for which a texture will remain cached
   * @type {number}
   */
  static CACHE_TTL = 1000 * 60 * 15;

  /**
   * The cached mapping of textures
   * @type {Map<string,{tex: PIXI.BaseTexture, time: number}>}
   * @private
   */
  #cache = new Map();

  /* -------------------------------------------- */

  /**
   * Load all the textures which are required for a particular Scene
   * @param {Scene} scene           The Scene to load
   * @param {object} [options={}]   Additional options that configure texture loading
   * @param {boolean} [options.expireCache=true]  Destroy other expired textures
   * @returns {Promise<void[]>}
   */
  static loadSceneTextures(scene, {expireCache=true}={}) {
    let toLoad = [];

    // Scene background and foreground textures
    if ( scene.background.src ) toLoad.push(scene.background.src);
    if ( scene.foreground ) toLoad.push(scene.foreground);

    // Tiles
    toLoad = toLoad.concat(scene.tiles.reduce((arr, t) => {
      if ( t.texture.src ) arr.push(t.texture.src);
      return arr;
    }, []));

    // Tokens
    toLoad = toLoad.concat(scene.tokens.reduce((arr, t) => {
      if ( t.texture.src ) arr.push(t.texture.src);
      return arr;
    }, []));

    // Control Icons
    toLoad = toLoad.concat(Object.values(CONFIG.controlIcons)).concat(CONFIG.statusEffects.map(e => e.icon ?? e));

    // Load files
    const showName = scene.active || scene.visible;
    const loadName = showName ? (scene.navName || scene.name) : "...";
    return this.loader.load(toLoad, {
      message: game.i18n.format("SCENES.Loading", {name: loadName}),
      expireCache: expireCache
    });
  }

  /* -------------------------------------------- */

  /**
   * Load an Array of provided source URL paths
   * @param {string[]} sources      The source URLs to load
   * @param {object} [options={}]   Additional options which modify loading
   * @param {string} [options.message]              The status message to display in the load bar
   * @param {boolean} [options.expireCache=false]   Expire other cached textures?
   * @returns {Promise<void[]>}     A Promise which resolves once all textures are loaded
   */
  async load(sources, {message, expireCache=false}={}) {
    const seen = new Set();
    const promises = [];
    const progress = {message: message, loaded: 0, failed: 0, total: 0, pct: 0};
    for ( const src of sources ) {
      if ( seen.has(src) ) continue;
      seen.add(src);
      const promise = this.loadTexture(src)
        .then(() => TextureLoader.#onProgress(src, progress))
        .catch(err => TextureLoader.#onError(src, progress, err));
      promises.push(promise);
    }
    progress.total = promises.length;

    // Expire any cached textures
    if ( expireCache ) this.expireCache();

    // Load all media
    return Promise.all(promises);
  }

  /* -------------------------------------------- */

  /**
   * Load a single texture on-demand from a given source URL path
   * @param {string} src                    The source texture path to load
   * @returns {Promise<PIXI.BaseTexture>}   The loaded texture object
   */
  async loadTexture(src) {
    let bt = this.getCache(src);
    if ( bt?.valid ) return bt;
    return VideoHelper.hasVideoExtension(src) ? this.loadVideoTexture(src) : this.loadImageTexture(src);
  }

  /* -------------------------------------------- */

  /**
   * Load an image texture from a provided source url.
   * @param {string} src                    The source image URL
   * @returns {Promise<PIXI.BaseTexture>}   The loaded BaseTexture
   */
  async loadImageTexture(src) {
    const blob = await TextureLoader.fetchResource(src);

    // Create the Image element
    const img = new Image();
    img.decoding = "async";
    img.loading = "eager";

    // Wait for the image to load
    return new Promise((resolve, reject) => {

      // Create the texture on successful load
      img.onload = () => {
        URL.revokeObjectURL(img.src);
        img.height = img.naturalHeight;
        img.width = img.naturalWidth;
        const tex = PIXI.BaseTexture.from(img);
        this.setCache(src, tex);
        resolve(tex);
      };

      // Handle errors for valid URLs due to CORS
      img.onerror = err => {
        URL.revokeObjectURL(img.src);
        reject(err);
      };
      img.src = URL.createObjectURL(blob);
    });
  }

  /* -------------------------------------------- */

  /**
   * Load a video texture from a provided source url
   * @param {string} src                    The source video URL
   * @returns {Promise<PIXI.BaseTexture>}   The loaded BaseTexture
   */
  async loadVideoTexture(src) {
    if ( !VideoHelper.hasVideoExtension(src) ) {
      throw new Error(`${src} is not a valid video texture`);
    }
    const blob = await TextureLoader.fetchResource(src);

    // Create a Video element
    const video = document.createElement("VIDEO");
    video.preload = "auto";
    video.autoplay = false;
    video.crossOrigin = "anonymous";
    video.src = URL.createObjectURL(blob);

    // Begin loading and resolve or reject
    return new Promise((resolve, reject) => {
      video.oncanplay = () => {
        video.height = video.videoHeight;
        video.width = video.videoWidth;
        const tex = PIXI.BaseTexture.from(video, {resourceOptions: {autoPlay: false}});
        this.setCache(src, tex);
        video.oncanplay = null;
        resolve(tex);
      };
      video.onerror = err => {
        URL.revokeObjectURL(video.src);
        reject(err);
      };
      video.load();
    });
  }

  /* --------------------------------------------- */

  /**
   * Use the Fetch API to retrieve a resource and return a Blob instance for it.
   * @param {string} src
   * @param {object} [options]                   Options to configure the loading behaviour.
   * @param {boolean} [options.bustCache=false]  Append a cache-busting query parameter to the request.
   * @returns {Promise<Blob>}                    A Blob containing the loaded data
   */
  static async fetchResource(src, {bustCache=false}={}) {
    const fail = `Failed to load texture ${src}`;
    const req = bustCache ? TextureLoader.getCacheBustURL(src) : src;
    if ( !req ) throw new Error(`${fail}: Invalid URL`);
    let res;
    try {
      res = await fetch(req, {mode: "cors", credentials: "same-origin"});
    } catch(err) {
      // We may have encountered a common CORS limitation: https://bugs.chromium.org/p/chromium/issues/detail?id=409090
      if ( !bustCache ) return this.fetchResource(src, {bustCache: true});
      throw new Error(`${fail}: CORS failure`);
    }
    if ( !res.ok ) throw new Error(`${fail}: Server responded with ${res.status}`);
    return res.blob();
  }

  /* -------------------------------------------- */

  /**
   * Log texture loading progress in the console and in the Scene loading bar
   * @param {string} src          The source URL being loaded
   * @param {object} progress     Loading progress
   * @private
   */
  static #onProgress(src, progress) {
    progress.loaded++;
    progress.pct = Math.round((progress.loaded + progress.failed) * 100 / progress.total);
    SceneNavigation.displayProgressBar({label: progress.message, pct: progress.pct});
    console.log(`${vtt} | Loaded ${src} (${progress.pct}%)`);
  }

  /* -------------------------------------------- */

  /**
   * Log failed texture loading
   * @param {string} src          The source URL being loaded
   * @param {object} progress     Loading progress
   * @param {Error} error         The error which occurred
   * @private
   */
  static #onError(src, progress, error) {
    progress.failed++;
    progress.pct = Math.round((progress.loaded + progress.failed) * 100 / progress.total);
    SceneNavigation.displayProgressBar({label: progress.message, pct: progress.pct});
    console.warn(`${vtt} | Loading failed for ${src} (${progress.pct}%): ${error.message}`);
  }

  /* -------------------------------------------- */
  /*  Cache Controls                              */
  /* -------------------------------------------- */

  /**
   * Add an image url to the texture cache
   * @param {string} src              The source URL
   * @param {PIXI.BaseTexture} tex    The loaded base texture
   */
  setCache(src, tex) {
    this.#cache.set(src, {
      tex: tex,
      time: Date.now()
    });
  }

  /* -------------------------------------------- */

  /**
   * Retrieve a texture from the texture cache
   * @param {string} src          The source URL
   * @returns {PIXI.BaseTexture}  The cached texture, or undefined
   */
  getCache(src) {
    const val = this.#cache.get(src);
    if ( !val || val?.tex.destroyed ) return undefined;
    val.time = Date.now();
    return val?.tex;
  }

  /* -------------------------------------------- */

  /**
   * Expire (and destroy) textures from the cache which have not been used for more than CACHE_TTL milliseconds.
   */
  expireCache() {
    const t = Date.now();
    for ( let [key, obj] of this.#cache.entries() ) {
      if ( (t - obj.time) > TextureLoader.CACHE_TTL ) {
        console.log(`${vtt} | Expiring cached texture: ${key}`);
        const texture = obj.tex;
        const srcURL = texture.resource?.source?.src;
        if ( srcURL ) URL.revokeObjectURL(srcURL);
        if ( !texture._destroyed ) texture.destroy(true);
        this.#cache.delete(key);
      }
    }
  }

  /* -------------------------------------------- */

  /**
   * Return a URL with a cache-busting query parameter appended.
   * @param {string} src        The source URL being attempted
   * @returns {string|boolean}  The new URL, or false on a failure.
   */
  static getCacheBustURL(src) {
    const url = URL.parseSafe(src);
    if ( !url ) return false;
    if ( url.origin === window.location.origin ) return false;
    url.searchParams.append("cors-retry", Date.now().toString());
    return url.href;
  }
}

/**
 * A global reference to the singleton texture loader
 * @type {TextureLoader}
 */
TextureLoader.loader = new TextureLoader();


/* -------------------------------------------- */


/**
 * Test whether a file source exists by performing a HEAD request against it
 * @param {string} src          The source URL or path to test
 * @returns {Promise<boolean>}   Does the file exist at the provided url?
 */
async function srcExists(src) {
  return foundry.utils.fetchWithTimeout(src, { method: "HEAD" }).then(resp => {
    return resp.status < 400;
  }).catch(() => false);
}


/* -------------------------------------------- */


/**
 * Get a single texture from the cache
 * @param {string} src
 * @returns {PIXI.Texture}
 */
function getTexture(src) {
  let baseTexture = TextureLoader.loader.getCache(src);
  if ( !baseTexture?.valid ) return null;
  return new PIXI.Texture(baseTexture);
}


/* -------------------------------------------- */


/**
 * Load a single texture and return a Promise which resolves once the texture is ready to use
 * @param {string} src                The requested texture source
 * @param {object} [options]          Additional options which modify texture loading
 * @param {string} [options.fallback]     A fallback texture URL to use if the requested source is unavailable
 * @returns {PIXI.Texture|null}        The loaded Texture, or null if loading failed with no fallback
 */
async function loadTexture(src, {fallback}={}) {
  let bt;
  let error;
  try {
    bt = await TextureLoader.loader.loadTexture(src);
    if ( !bt?.valid ) error = new Error(`Invalid BaseTexture ${src}`);
  }
  catch(err) {
    err.message = `The requested texture ${src} could not be loaded: ${err.message}`;
    error = err;
  }
  if ( error ) {
    console.error(error);
    return fallback ? loadTexture(fallback) : null;
  }
  return new PIXI.Texture(bt);
}
