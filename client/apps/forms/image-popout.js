/**
 * @typedef {FormApplicationOptions} ImagePopoutOptions
 * @property {string} [caption]           Caption text to display below the image.
 * @property {string|null} [uuid=null]    The UUID of some related {@link Document}.
 * @property {boolean} [showTitle]        Force showing or hiding the title.
 */

/**
 * An Image Popout Application which features a single image in a lightbox style frame.
 * Furthermore, this application allows for sharing the display of an image with other connected players.
 * @param {string} src                    The image URL.
 * @param {ImagePopoutOptions} [options]  Application configuration options.
 *
 * @example Creating an Image Popout
 * ```js
 * // Construct the Application instance
 * const ip = new ImagePopout("path/to/image.jpg", {
 *   title: "My Featured Image",
 *   uuid: game.actors.getName("My Hero").uuid
 * });
 *
 * // Display the image popout
 * ip.render(true);
 *
 * // Share the image with other connected players
 * ip.share();
 * ```
 */
class ImagePopout extends FormApplication {
  /**
   * A cached reference to the related Document.
   * @type {ClientDocument}
   */
  #related;

  /* -------------------------------------------- */

  /**
   * Whether the application should display video content.
   * @type {boolean}
   */
  get isVideo() {
    return VideoHelper.hasVideoExtension(this.object);
  }

  /* -------------------------------------------- */

  /**
   * @override
   * @returns {ImagePopoutOptions}
   */
  static get defaultOptions() {
    return foundry.utils.mergeObject(super.defaultOptions, {
      template: "templates/apps/image-popout.html",
      classes: ["image-popout", "dark"],
      resizable: true,
      caption: undefined,
      uuid: null
    });
  }

  /* -------------------------------------------- */

  /** @override */
  get title() {
    return this.isTitleVisible() ? super.title : "";
  }

  /* -------------------------------------------- */

  /** @override */
  async getData(options={}) {
    return {
      image: this.object,
      options: this.options,
      title: this.title,
      caption: this.options.caption,
      showTitle: this.isTitleVisible(),
      isVideo: this.isVideo
    };
  }

  /* -------------------------------------------- */

  /**
   * Test whether the title of the image popout should be visible to the user
   * @returns {boolean}
   */
  isTitleVisible() {
    return this.options.showTitle ?? this.#related?.testUserPermission(game.user, "LIMITED") ?? true;
  }

  /* -------------------------------------------- */

  /**
   * Provide a reference to the Document referenced by this popout, if one exists
   * @returns {Promise<ClientDocument>}
   */
  async getRelatedObject() {
    if ( this.options.uuid && !this.#related ) this.#related = await fromUuid(this.options.uuid);
    return this.#related;
  }

  /* -------------------------------------------- */

  /** @override */
  async _render(...args) {
    await this.getRelatedObject();
    this.position = await this.constructor.getPosition(this.object);
    return super._render(...args);
  }

  /* -------------------------------------------- */

  /** @inheritdoc */
  activateListeners(html) {
    super.activateListeners(html);
    // For some reason, unless we do this, videos will not autoplay the first time the popup is opened in a session,
    // even if the user has made a gesture.
    if ( this.isVideo ) html.find("video")[0]?.play();
  }

  /* -------------------------------------------- */

  /** @override */
  _getHeaderButtons() {
    const buttons = super._getHeaderButtons();
    if ( game.user.isGM ) {
      buttons.unshift({
        label: "JOURNAL.ActionShow",
        class: "share-image",
        icon: "fas fa-eye",
        onclick: () => this.shareImage()
      });
    }
    return buttons;
  }

  /* -------------------------------------------- */
  /*  Helper Methods
  /* -------------------------------------------- */

  /**
   * Determine the correct position and dimensions for the displayed image
   * @param {string} img  The image URL.
   * @returns {Object}    The positioning object which should be used for rendering
   */
  static async getPosition(img) {
    if ( !img ) return { width: 480, height: 480 };
    let w;
    let h;
    try {
      [w, h] = this.isVideo ? await this.getVideoSize(img) : await this.getImageSize(img);
    } catch(err) {
      return { width: 480, height: 480 };
    }
    const position = {};

    // Compare the image aspect ratio to the screen aspect ratio
    const sr = window.innerWidth / window.innerHeight;
    const ar = w / h;

    // The image is constrained by the screen width, display at max width
    if ( ar > sr ) {
      position.width = Math.min(w * 2, window.innerWidth - 80);
      position.height = position.width / ar;
    }

    // The image is constrained by the screen height, display at max height
    else {
      position.height = Math.min(h * 2, window.innerHeight - 120);
      position.width = position.height * ar;
    }
    return position;
  }

  /* -------------------------------------------- */

  /**
   * Determine the Image dimensions given a certain path
   * @param {string} path  The image source.
   * @returns {Promise<[number, number]>}
   */
  static getImageSize(path) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = function() {
        resolve([this.width, this.height]);
      };
      img.onerror = reject;
      img.src = path;
    });
  }

  /* -------------------------------------------- */

  /**
   * Determine the dimensions of the given video file.
   * @param {string} src  The URL to the video.
   * @returns {Promise<[number, number]>}
   */
  static getVideoSize(src) {
    return new Promise((resolve, reject) => {
      const video = document.createElement("video");
      video.onloadedmetadata = () => {
        video.onloadedmetadata = null;
        resolve([video.videoWidth, video.videoHeight]);
      };
      video.onerror = reject;
      video.src = src;
    });
  }

  /* -------------------------------------------- */

  /**
   * @typedef {object} ShareImageConfig
   * @property {string} image         The image URL to share.
   * @property {string} title         The image title.
   * @property {string} [uuid]        The UUID of a Document related to the image, used to determine permission to see
   *                                  the image title.
   * @property {boolean} [showTitle]  If this is provided, the permissions of the related Document will be ignored and
   *                                  the title will be shown based on this parameter.
   * @property {string[]} [users]     A list of user IDs to show the image to.
   */

  /**
   * Share the displayed image with other connected Users
   * @param {ShareImageConfig} [options]
   */
  shareImage(options={}) {
    options = foundry.utils.mergeObject(this.options, options, { inplace: false });
    game.socket.emit("shareImage", {
      image: this.object,
      title: options.title,
      caption: options.caption,
      uuid: options.uuid,
      showTitle: options.showTitle,
      users: Array.isArray(options.users) ? options.users : undefined
    });
    ui.notifications.info(game.i18n.format("JOURNAL.ActionShowSuccess", {
      mode: "image",
      title: options.title,
      which: "all"
    }));
  }

  /* -------------------------------------------- */

  /**
   * Handle a received request to display an image.
   * @param {ShareImageConfig} config  The image configuration data.
   * @returns {ImagePopout}
   * @internal
   */
  static _handleShareImage({image, title, caption, uuid, showTitle}={}) {
    const ip = new ImagePopout(image, {title, caption, uuid, showTitle});
    ip.render(true);
    return ip;
  }
}
