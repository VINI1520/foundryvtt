// Temporary workaround until PIXI 7.3.0 (pixijs/pixijs#9441)
if ( !isNewerVersion("7.3.0", PIXI.VERSION) ) throw new Error("REMOVE THIS CODE");
PIXI.BaseImageResource.prototype.upload = function(renderer, baseTexture, glTexture, source) {
  const gl = renderer.gl;
  const width = baseTexture.realWidth;
  const height = baseTexture.realHeight;

  source = source || this.source;

  if ( typeof HTMLImageElement !== "undefined" && source instanceof HTMLImageElement ) {
    if ( !source.complete || source.naturalWidth === 0 ) return false;
  } else if ( typeof HTMLVideoElement !== "undefined" && source instanceof HTMLVideoElement ) {
    if ( source.readyState <= 1 ) return false;
  }

  gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, baseTexture.alphaMode === PIXI.ALPHA_MODES.UNPACK);

  if ( !this.noSubImage
      && baseTexture.target === gl.TEXTURE_2D
      && glTexture.width === width
      && glTexture.height === height ) {
    gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, baseTexture.format, glTexture.type, source);
  } else {
    glTexture.width = width;
    glTexture.height = height;

    gl.texImage2D(baseTexture.target, 0, glTexture.internalFormat, baseTexture.format, glTexture.type, source);
  }

  return true;
};

// Temporary workaround until PIXI 7.3.0
if ( !isNewerVersion("7.3.0", PIXI.VERSION) ) throw new Error("REMOVE THIS CODE");
PIXI.utils.detectVideoAlphaMode = (() => {
  let promise;
  return async function()
  {
    promise ??= (async () =>
    {
      const canvas = document.createElement("canvas");
      const gl = canvas.getContext("webgl");

      if ( !gl ) {
        return PIXI.ALPHA_MODES.UNPACK;
      }

      const video = await new Promise(resolve => {
        const video = document.createElement("video");

        video.onloadeddata = () => resolve(video);
        video.onerror = () => resolve(null);
        video.autoplay = false;
        video.crossOrigin = "anonymous";
        video.preload = "auto";
        // eslint-disable-next-line max-len
        video.src = "data:video/webm;base64,GkXfo59ChoEBQveBAULygQRC84EIQoKEd2VibUKHgQJChYECGFOAZwEAAAAAAAHTEU2bdLpNu4tTq4QVSalmU6yBoU27i1OrhBZUrmtTrIHGTbuMU6uEElTDZ1OsggEXTbuMU6uEHFO7a1OsggG97AEAAAAAAABZAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAVSalmoCrXsYMPQkBNgIRMYXZmV0GETGF2ZkSJiEBEAAAAAAAAFlSua8yuAQAAAAAAAEPXgQFzxYgAAAAAAAAAAZyBACK1nIN1bmSIgQCGhVZfVlA5g4EBI+ODhAJiWgDglLCBArqBApqBAlPAgQFVsIRVuYEBElTDZ9Vzc9JjwItjxYgAAAAAAAAAAWfInEWjh0VOQ09ERVJEh49MYXZjIGxpYnZweC12cDlnyKJFo4hEVVJBVElPTkSHlDAwOjAwOjAwLjA0MDAwMDAwMAAAH0O2dcfngQCgwqGggQAAAIJJg0IAABAAFgA4JBwYSgAAICAAEb///4r+AAB1oZ2mm+6BAaWWgkmDQgAAEAAWADgkHBhKAAAgIABIQBxTu2uRu4+zgQC3iveBAfGCAXHwgQM=";
        video.load();
      });

      if ( !video ) {
        return PIXI.ALPHA_MODES.UNPACK;
      }

      const texture = gl.createTexture();

      gl.bindTexture(gl.TEXTURE_2D, texture);

      const framebuffer = gl.createFramebuffer();

      gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer);
      gl.framebufferTexture2D(
        gl.FRAMEBUFFER,
        gl.COLOR_ATTACHMENT0,
        gl.TEXTURE_2D,
        texture,
        0
      );

      gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
      gl.pixelStorei(gl.UNPACK_COLORSPACE_CONVERSION_WEBGL, gl.NONE);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, video);

      const pixel = new Uint8Array(4);

      gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, pixel);

      gl.deleteFramebuffer(framebuffer);
      gl.deleteTexture(texture);
      gl.getExtension("WEBGL_lose_context")?.loseContext();

      return pixel[0] <= pixel[3] ? PIXI.ALPHA_MODES.PMA : PIXI.ALPHA_MODES.UNPACK;
    })();

    return promise;
  };
})();

// Temporary workaround until PIXI 7.3.0
if ( !isNewerVersion("7.3.0", PIXI.VERSION) ) throw new Error("REMOVE THIS CODE");
PIXI.loadVideo = {
  name: "loadVideo",
  extension: {
    type: PIXI.ExtensionType.LoadParser,
    priority: PIXI.LoaderParserPriority.High
  },
  config: {
    defaultAutoPlay: true
  },
  test: url => PIXI.checkDataUrl(url, Object.values(CONST.VIDEO_FILE_EXTENSIONS))
    || PIXI.checkExtension(url, Object.keys(CONST.VIDEO_FILE_EXTENSIONS).map(ext => `.${ext}`)),
  load: async function(url, asset, loader) {
    let texture;
    const response = await fetch(url);
    const blob = await response.blob();
    const objectURL = URL.createObjectURL(blob);
    const video = document.createElement("video");
    try {
      await new Promise((resolve, reject) => {
        video.oncanplay = () => {
          video.oncanplay = null;
          video.onerror = null;
          resolve();
        };
        video.onerror = error => {
          video.oncanplay = null;
          video.onerror = null;
          reject(error);
        };
        video.autoplay = false;
        video.crossOrigin = "anonymous";
        video.preload = "auto";
        video.src = objectURL;
        video.load();
      });
      const src = new PIXI.VideoResource(video, {
        autoPlay: this.config.defaultAutoPlay,
        ...asset?.data?.resourceOptions
      });
      await src.load();
      const base = new PIXI.BaseTexture(src, {
        alphaMode: await PIXI.utils.detectVideoAlphaMode(),
        resolution: PIXI.utils.getResolutionOfUrl(url),
        ...asset?.data
      });
      base.resource.internal = true;
      base.resource.src = url;
      texture = new PIXI.Texture(base);
      texture.baseTexture.on("dispose", () => {
        delete loader.promiseCache[url];
        URL.revokeObjectURL(objectURL);
      });
    } catch(e) {
      URL.revokeObjectURL(objectURL);
      throw e;
    }
    return texture;
  },
  unload: async texture => texture.destroy(true)
};
PIXI.extensions.add({
  extension: PIXI.ExtensionType.Asset,
  detection: {
    test: async () => true,
    add: async formats => [...formats, ...Object.keys(CONST.VIDEO_FILE_EXTENSIONS)],
    remove: async formats => formats.filter(format => !(format in CONST.VIDEO_FILE_EXTENSIONS))
  },
  loader: PIXI.loadVideo
});

// Temporary workaround until PIXI 7.3.0
if ( !isNewerVersion("7.3.0", PIXI.VERSION) ) throw new Error("REMOVE THIS CODE");
PIXI.VideoResource.prototype.load = function() {
  if (this._load) {
    return this._load;
  }

  const source = this.source;

  if ((source.readyState === source.HAVE_ENOUGH_DATA || source.readyState === source.HAVE_FUTURE_DATA)
    && source.width && source.height) {
    source.complete = true;
  }

  source.addEventListener("play", this._onPlayStart.bind(this));
  source.addEventListener("pause", this._onPlayStop.bind(this));
  source.addEventListener("seeked", this._onSeeked.bind(this));

  if (!this._isSourceReady()) {
    source.addEventListener("canplay", this._onCanPlay);
    source.addEventListener("canplaythrough", this._onCanPlay);
    source.addEventListener("error", this._onError, true);
  } else {
    this._onCanPlay();
  }

  this._load = new Promise(resolve => {
    if (this.valid) {
      resolve(this);
    } else {
      this._resolve = resolve;

      source.load();
    }
  });

  return this._load;
};
PIXI.VideoResource.prototype._onSeeked = function() {
  if (this._autoUpdate && !this._isSourcePlaying()) {
    this._msToNextUpdate = 0;
    this.update();
    this._msToNextUpdate = 0;
  }
};
