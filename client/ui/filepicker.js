/**
 * @typedef {ApplicationOptions} FilePickerOptions
 * @property {string} [type="any"]         A type of file to target, in "audio", "image", "video", "imagevideo",
 *                                         "folder", "font", "graphics", "text", or "any"
 * @property {string} [current]            The current file path being modified, if any
 * @property {string} [activeSource=data]  A current file source in "data", "public", or "s3"
 * @property {Function} [callback]         A callback function to trigger once a file has been selected
 * @property {boolean} [allowUpload=true]  A flag which permits explicitly disallowing upload, true by default
 * @property {HTMLElement} [field]         An HTML form field that the result of this selection is applied to
 * @property {HTMLButtonElement} [button]  An HTML button element which triggers the display of this picker
 * @property {Map<string, FavoriteFolder>} [favorites] The picker display mode in FilePicker.DISPLAY_MODES
 * @property {string} [displayMode]        The picker display mode in FilePicker.DISPLAY_MODES
 * @property {boolean} [tileSize=false]    Display the tile size configuration.
 * @property {string[]} [redirectToRoot]   Redirect to the root directory rather than starting in the source directory
 *                                         of one of these files.
 */

/**
 * The FilePicker application renders contents of the server-side public directory.
 * This app allows for navigating and uploading files to the public path.
 *
 * @param {FilePickerOptions} [options={}]  Options that configure the behavior of the FilePicker
 */
class FilePicker extends Application {
  constructor(options={}) {
    super(options);

    /**
     * The full requested path given by the user
     * @type {string}
     */
    this.request = options.current;

    /**
     * The file sources which are available for browsing
     * @type {object}
     */
    this.sources = Object.entries({
      data: {
        target: "",
        label: game.i18n.localize("FILES.SourceUser"),
        icon: "fas fa-database"
      },
      public: {
        target: "",
        label: game.i18n.localize("FILES.SourceCore"),
        icon: "fas fa-server"
      },
      s3: {
        buckets: [],
        bucket: "",
        target: "",
        label: game.i18n.localize("FILES.SourceS3"),
        icon: "fas fa-cloud"
      }
    }).reduce((obj, s) => {
      if ( game.data.files.storages.includes(s[0]) ) obj[s[0]] = s[1];
      return obj;
    }, {});

    /**
     * Track the active source tab which is being browsed
     * @type {string}
     */
    this.activeSource = options.activeSource || "data";

    /**
     * A callback function to trigger once a file has been selected
     * @type {Function}
     */
    this.callback = options.callback;

    /**
     * The latest set of results browsed from the server
     * @type {object}
     */
    this.results = {};

    /**
     * The general file type which controls the set of extensions which will be accepted
     * @type {string}
     */
    this.type = options.type ?? "any";

    /**
     * The target HTML element this file picker is bound to
     * @type {HTMLElement}
     */
    this.field = options.field;

    /**
     * A button which controls the display of the picker UI
     * @type {HTMLElement}
     */
    this.button = options.button;

    /**
     * The display mode of the FilePicker UI
     * @type {string}
     */
    this.displayMode = options.displayMode || FilePicker.LAST_DISPLAY_MODE;

    /**
     * The current set of file extensions which are being filtered upon
     * @type {string[]}
     */
    this.extensions = this._getExtensions(this.type);

    // Infer the source
    const [source, target] = this._inferCurrentDirectory(this.request);
    this.activeSource = source;
    this.sources[source].target = target;

    // Track whether we have loaded files
    this._loaded = false;
  }

  /**
   * Record the last-browsed directory path so that re-opening a different FilePicker instance uses the same target
   * @type {string}
   */
  static LAST_BROWSED_DIRECTORY = "";

  /**
   * Record the last-configured tile size which can automatically be applied to new FilePicker instances
   * @type {number|null}
   */
  static LAST_TILE_SIZE = null;

  /**
   * Record the last-configured display mode so that re-opening a different FilePicker instance uses the same mode.
   * @type {string}
   */
  static LAST_DISPLAY_MODE = "list";

  /**
   * Enumerate the allowed FilePicker display modes
   * @type {string[]}
   */
  static DISPLAY_MODES = ["list", "thumbs", "tiles", "images"];

  /**
   * Cache the names of S3 buckets which can be used
   * @type {Array|null}
   */
  static S3_BUCKETS = null;

  /**
   * @typedef FavoriteFolder
   * @property {string} source        The source of the folder (e.g. "data", "public")
   * @property {string} path          The full path to the folder
   * @property {string} label         The label for the path
   */

  /**
   * Get favorite folders for quick access
   * @type {string[]}
   * @return {Map<string, FavoriteFolder>}
   */
  static get favorites() {
    if ( !this._favorites ) this._favorites = game.settings.get("core", "favoritePaths");
    return this._favorites;
  }

   /**
    * Set favorite folders for quick access
    * @param {Map<string, FavoriteFolder>} favorites  An object of Favorite Folders
   */
  static set favorites(favorites) {
    this._favorites = favorites;
  }

  /* -------------------------------------------- */

  /**
   * Add the given path for the source to the favorites
   * @param {string} source     The source of the folder (e.g. "data", "public")
   * @param {string} path       The path to a folder
   */
  static async setFavorite(source, path ) {
    const favorites = FilePicker.favorites;
    const lastCharacter = path[path.length - 1];

    // Standardize all paths to end with a "/". Has the side benefit of ensuring that the root path which is normally an empty string has content.
    path = path.endsWith("/") ? path : `${path}/`;

    const alreadyFavorited = Object.keys(favorites).includes(`${source}-${path}`);
    if ( alreadyFavorited ) return ui.notifications.info(game.i18n.format("FILES.AlreadyFavorited", {path}));

    let label;
    if ( path === "/" ) label = "root";
    else {
      const directories = path.split("/");
      label = directories[directories.length - 2]; // Get the final part of the path for the label
    }

    favorites[`${source}-${path}`] = {source, path, label};
    FilePicker.favorites = favorites;
    await game.settings.set("core", "favoritePaths", favorites);
  }

  /* -------------------------------------------- */

  /**
   * Remove the given path from the favorites
   * @param {string} source     The source of the folder (e.g. "data", "public")
   * @param {string} path       The path to a folder
   */
  static async removeFavorite(source, path) {
    const favorites = FilePicker.favorites;
    delete favorites[`${source}-${path}`];
    FilePicker.favorites = favorites;
    await game.settings.set("core", "favoritePaths",  favorites);
  }

  /* -------------------------------------------- */

  /**
   * @override
   * @returns {FilePickerOptions}
   */
  static get defaultOptions() {
    return foundry.utils.mergeObject(super.defaultOptions, {
      template: "templates/apps/filepicker.html",
      classes: ["filepicker"],
      width: 520,
      tabs: [{navSelector: ".tabs"}],
      dragDrop: [{dragSelector: ".file", dropSelector: ".filepicker-body"}],
      tileSize: false,
      filters: [{inputSelector: 'input[name="filter"]', contentSelector: ".filepicker-body"}]
    });
  }

  /* -------------------------------------------- */

  /**
   * Given a current file path, determine the directory it belongs to
   * @param {string} target   The currently requested target path
   * @returns {string[]}      An array of the inferred source and target directory path
   */
  _inferCurrentDirectory(target) {

    // Determine target
    const ignored = [CONST.DEFAULT_TOKEN].concat(this.options.redirectToRoot ?? []);
    if ( !target || ignored.includes(target) ) target = this.constructor.LAST_BROWSED_DIRECTORY;
    let source = "data";

    // Check for s3 matches
    const s3Match = this.constructor.matchS3URL(target);
    if ( s3Match ) {
      this.sources.s3.bucket = s3Match.groups.bucket;
      source = "s3";
      target = s3Match.groups.key;
    }

    // Non-s3 URL matches
    else if ( ["http://", "https://"].some(c => target.startsWith(c)) ) {
      target = "";
    }

    // Local file matches
    else {
      const p0 = target.split("/").shift();
      const publicDirs = ["cards", "css", "fonts", "icons", "lang", "scripts", "sounds", "ui"];
      if ( publicDirs.includes(p0) ) source = "public";
    }

    // If the preferred source is not available, use the next available source.
    if ( !this.sources[source] ) {
      source = game.data.files.storages[0];
      // If that happens to be S3, pick the first available bucket.
      if ( source === "s3" ) {
        this.sources.s3.bucket = game.data.files.s3.buckets?.[0] ?? null;
        target = "";
      }
    }

    // Split off the file name and retrieve just the directory path
    let parts = target.split("/");
    if ( parts[parts.length - 1].indexOf(".") !== -1 ) parts.pop();
    const dir = parts.join("/");
    return [source, dir];
  }

  /* -------------------------------------------- */

  /**
   * Get the valid file extensions for a given named file picker type
   * @param {string} type
   * @returns {string[]}
   * @private
   */
  _getExtensions(type) {

    // Identify allowed extensions
    let types = [
      CONST.IMAGE_FILE_EXTENSIONS,
      CONST.AUDIO_FILE_EXTENSIONS,
      CONST.VIDEO_FILE_EXTENSIONS,
      CONST.TEXT_FILE_EXTENSIONS,
      CONST.FONT_FILE_EXTENSIONS,
      CONST.GRAPHICS_FILE_EXTENSIONS
    ].flatMap(extensions => Object.keys(extensions));
    if ( type === "folder" ) types = [];
    else if ( type === "font" ) types = Object.keys(CONST.FONT_FILE_EXTENSIONS);
    else if ( type === "text" ) types = Object.keys(CONST.TEXT_FILE_EXTENSIONS);
    else if ( type === "graphics" ) types = Object.keys(CONST.GRAPHICS_FILE_EXTENSIONS);
    else if ( type === "image" ) types = Object.keys(CONST.IMAGE_FILE_EXTENSIONS);
    else if ( type === "audio" ) types = Object.keys(CONST.AUDIO_FILE_EXTENSIONS);
    else if ( type === "video" ) types = Object.keys(CONST.VIDEO_FILE_EXTENSIONS);
    else if ( type === "imagevideo") {
      types = Object.keys(CONST.IMAGE_FILE_EXTENSIONS).concat(Object.keys(CONST.VIDEO_FILE_EXTENSIONS));
    }
    return types.map(t => `.${t.toLowerCase()}`);
  }

  /* -------------------------------------------- */

  /**
   * Test a URL to see if it matches a well known s3 key pattern
   * @param {string} url          An input URL to test
   * @returns {RegExpMatchArray|null}  A regular expression match
   */
  static matchS3URL(url) {
    const endpoint = game.data.files.s3?.endpoint;
    if ( !endpoint ) return null;

    // Match new style S3 urls
    const s3New = new RegExp(`^${endpoint.protocol}//(?<bucket>.*).${endpoint.host}/(?<key>.*)`);
    const matchNew = url.match(s3New);
    if ( matchNew ) return matchNew;

    // Match old style S3 urls
    const s3Old = new RegExp(`^${endpoint.protocol}//${endpoint.host}/(?<bucket>[^/]+)/(?<key>.*)`);
    return url.match(s3Old);
  }

  /* -------------------------------------------- */
  /*  FilePicker Properties                       */
  /* -------------------------------------------- */

  /** @override */
  get title() {
    let type = this.type || "file";
    return game.i18n.localize(type === "imagevideo" ? "FILES.TitleImageVideo" : `FILES.Title${type.capitalize()}`);
  }

  /* -------------------------------------------- */

  /**
   * Return the source object for the currently active source
   * @type {object}
   */
  get source() {
    return this.sources[this.activeSource];
  }

  /* -------------------------------------------- */

  /**
   * Return the target directory for the currently active source
   * @type {string}
   */
  get target() {
    return this.source.target;
  }

  /* -------------------------------------------- */

  /**
   * Return a flag for whether the current user is able to upload file content
   * @type {boolean}
   */
  get canUpload() {
    if ( this.type === "folder" ) return false;
    if ( this.options.allowUpload === false ) return false;
    if ( !["data", "s3"].includes(this.activeSource) ) return false;
    return !game.user || game.user.can("FILES_UPLOAD");
  }

  /* -------------------------------------------- */

  /**
   * Return the upload URL to which the FilePicker should post uploaded files
   * @type {string}
   */
  static get uploadURL() {
    return foundry.utils.getRoute("upload");
  }

  /* -------------------------------------------- */
  /*  Rendering                                   */
  /* -------------------------------------------- */

  /** @override */
  async getData(options={}) {
    const result = this.result;
    const source = this.source;
    let target = decodeURIComponent(source.target);
    const isS3 = this.activeSource === "s3";

    // Sort directories alphabetically and store their paths
    let dirs = result.dirs.map(d => ({
      name: decodeURIComponent(d.split("/").pop()),
      path: d,
      private: result.private || result.privateDirs.includes(d)
    }));
    dirs = dirs.sort((a, b) => a.name.localeCompare(b.name));

    // Sort files alphabetically and store their client URLs
    let files = result.files.map(f => {
      let img = f;
      if ( VideoHelper.hasVideoExtension(f) ) img = "icons/svg/video.svg";
      else if ( AudioHelper.hasAudioExtension(f) ) img = "icons/svg/sound.svg";
      else if ( !ImageHelper.hasImageExtension(f) ) img = "icons/svg/book.svg";
      return {
        name: decodeURIComponent(f.split("/").pop()),
        url: f,
        img: img
      };
    });
    files = files.sort((a, b) => a.name.localeCompare(b.name));

    // Return rendering data
    return {
      bucket: isS3 ? source.bucket : null,
      canGoBack: this.activeSource !== "",
      canUpload: this.canUpload,
      canSelect: !this.options.tileSize,
      cssClass: [this.displayMode, result.private ? "private": "public"].join(" "),
      dirs: dirs,
      displayMode: this.displayMode,
      extensions: this.extensions,
      files: files,
      isS3: isS3,
      noResults: dirs.length + files.length === 0,
      selected: this.type === "folder" ? target : this.request,
      source: source,
      sources: this.sources,
      target: target,
      tileSize: this.options.tileSize ? (FilePicker.LAST_TILE_SIZE || canvas.dimensions.size) : null,
      user: game.user,
      submitText: this.type === "folder" ? "FILES.SelectFolder" : "FILES.SelectFile",
      favorites: FilePicker.favorites
    };
  }

  /* -------------------------------------------- */

  /** @inheritdoc */
  setPosition(pos={}) {
    const currentPosition = super.setPosition(pos);
    const element = this.element[0];
    const content = element.querySelector(".window-content");
    const lists = element.querySelectorAll(".filepicker-body > ol");
    const scroll = content.scrollHeight - content.offsetHeight;
    if ( (scroll > 0) && lists.length ) {
      let maxHeight = Number(getComputedStyle(lists[0]).maxHeight.slice(0, -2));
      maxHeight -= Math.ceil(scroll / lists.length);
      lists.forEach(list => list.style.maxHeight = `${maxHeight}px`);
    }
    return currentPosition;
  }

  /* -------------------------------------------- */

  /**
   * Browse to a specific location for this FilePicker instance
   * @param {string} [target]   The target within the currently active source location.
   * @param {object} [options]  Browsing options
   */
  async browse(target, options={}) {

    // If the user does not have permission to browse, do not proceed
    if ( game.world && !game.user.can("FILES_BROWSE") ) return;

    // Configure browsing parameters
    target = typeof target === "string" ? target : this.target;
    const source = this.activeSource;
    options = foundry.utils.mergeObject({
      type: this.type,
      extensions: this.extensions,
      wildcard: false
    }, options);

    // Determine the S3 buckets which may be used
    if ( source === "s3" ) {
      if ( this.constructor.S3_BUCKETS === null ) {
        const buckets = await this.constructor.browse("s3", "");
        this.constructor.S3_BUCKETS = buckets.dirs;
      }
      this.sources.s3.buckets = this.constructor.S3_BUCKETS;
      if ( !this.source.bucket ) this.source.bucket = this.constructor.S3_BUCKETS[0];
      options.bucket = this.source.bucket;
    }

    // Avoid browsing certain paths
    if ( target.startsWith("/") ) target = target.slice(1);
    if ( target === CONST.DEFAULT_TOKEN ) target = this.constructor.LAST_BROWSED_DIRECTORY;

    // Request files from the server
    const result = await this.constructor.browse(source, target, options).catch(error => {
      ui.notifications.warn(error);
      return this.constructor.browse(source, "", options);
    });

    // Populate browser content
    this.result = result;
    this.source.target = result.target;
    if ( source === "s3" ) this.source.bucket = result.bucket;
    this.constructor.LAST_BROWSED_DIRECTORY = result.target;
    this._loaded = true;

    // Render the application
    this.render(true);
    return result;
  }

  /* -------------------------------------------- */

  /**
   * Browse files for a certain directory location
   * @param {string} source     The source location in which to browse. See FilePicker#sources for details
   * @param {string} target     The target within the source location
   * @param {object} options                Optional arguments
   * @param {string} [options.bucket]       A bucket within which to search if using the S3 source
   * @param {string[]} [options.extensions] An Array of file extensions to filter on
   * @param {boolean} [options.wildcard]    The requested dir represents a wildcard path
   *
   * @returns {Promise}          A Promise which resolves to the directories and files contained in the location
   */
  static async browse(source, target, options={}) {
    const data = {action: "browseFiles", storage: source, target: target};
    return this._manageFiles(data, options);
  }

  /* -------------------------------------------- */

  /**
   * Configure metadata settings regarding a certain file system path
   * @param {string} source     The source location in which to browse. See FilePicker#sources for details
   * @param {string} target     The target within the source location
   * @param {object} options    Optional arguments which modify the request
   * @returns {Promise<object>}
   */
  static async configurePath(source, target, options={}) {
    const data = {action: "configurePath", storage: source, target: target};
    return this._manageFiles(data, options);
  }

  /* -------------------------------------------- */

  /**
   * Create a subdirectory within a given source. The requested subdirectory path must not already exist.
   * @param {string} source     The source location in which to browse. See FilePicker#sources for details
   * @param {string} target     The target within the source location
   * @param {object} options    Optional arguments which modify the request
   * @returns {Promise<object>}
   */
  static async createDirectory(source, target, options={}) {
    const data = {action: "createDirectory", storage: source, target: target};
    return this._manageFiles(data, options);
  }

  /* -------------------------------------------- */

  /**
   * General dispatcher method to submit file management commands to the server
   * @param {object} data         Request data dispatched to the server
   * @param {object} options      Options dispatched to the server
   * @returns {Promise<object>}   The server response
   * @private
   */
  static async _manageFiles(data, options) {
    return new Promise((resolve, reject) => {
      game.socket.emit("manageFiles", data, options, result => {
        if ( result.error ) return reject(new Error(result.error));
        resolve(result);
      });
    });
  }

  /* -------------------------------------------- */

  /**
   * Dispatch a POST request to the server containing a directory path and a file to upload
   * @param {string} source   The data source to which the file should be uploaded
   * @param {string} path     The destination path
   * @param {File} file       The File object to upload
   * @param {object} [body={}]  Additional file upload options sent in the POST body
   * @param {object} [options]  Additional options to configure how the method behaves
   * @param {boolean} [options.notify=true] Display a UI notification when the upload is processed
   * @returns {Promise<object>}  The response object
   */
  static async upload(source, path, file, body={}, {notify=true}={}) {

    // Create the form data to post
    const fd = new FormData();
    fd.set("source", source);
    fd.set("target", path);
    fd.set("upload", file);
    Object.entries(body).forEach(o => fd.set(...o));

    const notifications = Object.fromEntries(["ErrorSomethingWrong", "WarnUploadModules", "ErrorTooLarge"].map(key => {
      const i18n = `FILES.${key}`;
      return [key, game.i18n.localize(i18n)];
    }));

    // Dispatch the request
    try {
      const request = await fetch(this.uploadURL, {method: "POST", body: fd});
      const response = await request.json();

      // Attempt to obtain the response
      if ( response.error ) {
        ui.notifications.error(response.error);
        return false;
      } else if ( !response.path ) {
        if ( notify ) ui.notifications.error(notifications.ErrorSomethingWrong);
        else console.error(notifications.ErrorSomethingWrong);
        return;
      }

      // Check for uploads to system or module directories.
      const [packageType, packageId, folder] = response.path.split("/");
      if ( ["modules", "systems"].includes(packageType) ) {
        let pkg;
        if ( packageType === "modules" ) pkg = game.modules.get(packageId);
        else if ( packageId === game.system.id ) pkg = game.system;
        if ( !pkg?.persistentStorage || (folder !== "storage") ) {
          if ( notify ) ui.notifications.warn(notifications.WarnUploadModules);
          else console.warn(notifications.WarnUploadModules);
        }
      }

      // Display additional response messages
      if ( response.message ) {
        if ( notify ) ui.notifications.info(response.message);
        else console.info(response.message);
      }
      return response;
    }
    catch(e) {
      if ( (e instanceof HttpError) && (e.code === 413) ) {
        if ( notify ) ui.notifications.error(notifications.ErrorTooLarge);
        else console.error(notifications.ErrorTooLarge);
        return;
      }
      return {};
    }
  }

  /* -------------------------------------------- */

  /**
   * A convenience function that uploads a file to a given package's persistent /storage/ directory
   * @param {string} packageId                The id of the package to which the file should be uploaded. Only supports Systems and Modules.
   * @param {string} path                     The relative path in the package's storage directory the file should be uploaded to
   * @param {File} file                       The File object to upload
   * @param {object} [body={}]                Additional file upload options sent in the POST body
   * @param {object} [options]                Additional options to configure how the method behaves
   * @param {boolean} [options.notify=true]   Display a UI notification when the upload is processed
   * @returns {Promise<object>}               The response object
   */
  static async uploadPersistent(packageId, path, file, body={}, {notify=true}={}) {
    let pack = game.system.id === packageId ? game.system : game.modules.get(packageId);
    if ( !pack ) throw new Error(`Package ${packageId} not found`);
    if ( !pack.persistentStorage ) throw new Error(`Package ${packageId} does not have persistent storage enabled. Set the "persistentStorage" flag to true in the package manifest.`);
    const source = "data";
    const target = `${pack.type}s/${pack.id}/storage/${path}`;
    return this.upload(source, target, file, body, {notify});
  }

  /* -------------------------------------------- */

  /** @inheritDoc */
  render(force, options) {
    if ( game.world && !game.user.can("FILES_BROWSE") ) return this;
    this.position.height = null;
    this.element.css({height: ""});
    this._tabs[0].active = this.activeSource;
    if ( !this._loaded ) {
      this.browse();
      return this;
    }
    else return super.render(force, options);
  }

  /* -------------------------------------------- */
  /*  Event Listeners and Handlers                */
  /* -------------------------------------------- */

  /** @inheritdoc */
  activateListeners(html) {
    super.activateListeners(html);
    const header = html.find("header.filepicker-header");
    const form = html[0];

    // Change the directory
    const target = header.find('input[name="target"]');
    target.on("keydown", this._onRequestTarget.bind(this));
    target[0].focus();

    // Header Control Buttons
    html.find(".current-dir button").click(this._onClickDirectoryControl.bind(this));

    // Change the S3 bucket
    html.find('select[name="bucket"]').change(this._onChangeBucket.bind(this));

    // Change the tile size.
    form.elements.tileSize?.addEventListener("change", this._onChangeTileSize.bind(this));

    // Activate display mode controls
    const modes = html.find(".display-modes");
    modes.on("click", ".display-mode", this._onChangeDisplayMode.bind(this));
    for ( let li of modes[0].children ) {
      li.classList.toggle("active", li.dataset.mode === this.displayMode);
    }

    // Upload new file
    if ( this.canUpload ) form.upload.onchange = ev => this._onUpload(ev);

    // Directory-level actions
    html.find(".directory").on("click", "li", this._onPick.bind(this));

    // Directory-level actions
    html.find(".favorites").on("click", "a", this._onClickFavorite.bind(this));

    // Flag the current pick
    let li = form.querySelector(`.file[data-path="${this.request}"]`);
    if ( li ) li.classList.add("picked");

    // Form submission
    form.onsubmit = ev => this._onSubmit(ev);

    // Intersection Observer to lazy-load images
    const files = html.find(".files-list");
    const observer = new IntersectionObserver(this._onLazyLoadImages.bind(this), {root: files[0]});
    files.find("li.file").each((i, li) => observer.observe(li));
  }

  /* -------------------------------------------- */

  /**
   * Handle a click event to change the display mode of the File Picker
   * @param {MouseEvent} event    The triggering click event
   * @private
   */
  _onChangeDisplayMode(event) {
    event.preventDefault();
    const a = event.currentTarget;
    if ( !FilePicker.DISPLAY_MODES.includes(a.dataset.mode) ) {
      throw new Error("Invalid display mode requested");
    }
    if ( a.dataset.mode === this.displayMode ) return;
    FilePicker.LAST_DISPLAY_MODE = this.displayMode = a.dataset.mode;
    this.render();
  }

  /* -------------------------------------------- */

  /** @override */
  _onChangeTab(event, tabs, active) {
    this.activeSource = active;
    this.browse(this.source.target);
  }

  /* -------------------------------------------- */

  /** @override */
  _canDragStart(selector) {
    return game.user?.isGM && (canvas.activeLayer instanceof TilesLayer);
  }

  /* -------------------------------------------- */

  /** @override */
  _canDragDrop(selector) {
    return this.canUpload;
  }

  /* -------------------------------------------- */

  /** @override */
  _onDragStart(event) {
    const li = event.currentTarget;

    // Get the tile size ratio
    const tileSize = parseInt(li.closest("form").tileSize.value) || canvas.dimensions.size;
    const ratio = canvas.dimensions.size / tileSize;

    // Set drag data
    const dragData = {
      type: "Tile",
      texture: {src: li.dataset.path},
      fromFilePicker: true,
      tileSize
    };
    event.dataTransfer.setData("text/plain", JSON.stringify(dragData));

    // Create the drag preview for the image
    const img = li.querySelector("img");
    const w = img.naturalWidth * ratio * canvas.stage.scale.x;
    const h = img.naturalHeight * ratio * canvas.stage.scale.y;
    const preview = DragDrop.createDragImage(img, w, h);
    event.dataTransfer.setDragImage(preview, w/2, h/2);
  }

  /* -------------------------------------------- */

  /** @override */
  async _onDrop(event) {
    if ( !this.canUpload ) return;
    const form = event.currentTarget.closest("form");
    form.disabled = true;
    const target = form.target.value;

    // Process the data transfer
    const data = TextEditor.getDragEventData(event);
    const files = event.dataTransfer.files;
    if ( !files || !files.length || data.fromFilePicker ) return;

    // Iterate over dropped files
    for ( let upload of files ) {
      const name = upload.name.toLowerCase();
      if ( !this.extensions.some(ext => name.endsWith(ext)) ) {
        ui.notifications.error(`Incorrect ${this.type} file extension. Supports ${this.extensions.join(" ")}.`);
        continue;
      }
      const response = await this.constructor.upload(this.activeSource, target, upload, {
        bucket: form.bucket ? form.bucket.value : null
      });
      if ( response ) this.request = response.path;
    }

    // Re-enable the form
    form.disabled = false;
    return this.browse(target);
  }

  /* -------------------------------------------- */

  /**
   * Handle user submission of the address bar to request an explicit target
   * @param {KeyboardEvent} event     The originating keydown event
   * @private
   */
  _onRequestTarget(event) {
    if ( event.key === "Enter" ) {
      event.preventDefault();
      return this.browse(event.target.value);
    }
  }

  /* -------------------------------------------- */

  /**
   * Handle user interaction with the favorites
   * @param {MouseEvent} event     The originating click event
   * @private
   */
  async _onClickFavorite(event) {
    const action = event.currentTarget.dataset.action;
    const source = event.currentTarget.dataset.source || this.activeSource;
    const path = event.currentTarget.dataset.path || this.target;

    switch (action) {
      case "goToFavorite":
        this.activeSource = source;
        await this.browse(path);
        break;
      case "setFavorite":
        await FilePicker.setFavorite(source, path);
        break;
      case "removeFavorite":
        await FilePicker.removeFavorite(source, path);
        break;
    }
    this.render(true);
  }

  /* -------------------------------------------- */

  /**
   * Handle requests from the IntersectionObserver to lazily load an image file
   * @param {...any} args
   * @private
   */
  _onLazyLoadImages(...args) {
    // Don't load images in list mode.
    if ( this.displayMode === "list" ) return;
    return SidebarTab.prototype._onLazyLoadImage.call(this, ...args);
  }

  /* -------------------------------------------- */

  /**
   * Handle file or folder selection within the file picker
   * @param {Event} event     The originating click event
   * @private
   */
  _onPick(event) {
    const li = event.currentTarget;
    const form = li.closest("form");
    if ( li.classList.contains("dir") ) return this.browse(li.dataset.path);
    for ( let l of li.parentElement.children ) {
      l.classList.toggle("picked", l === li);
    }
    if ( form.file ) form.file.value = li.dataset.path;
  }

  /* -------------------------------------------- */

  /**
   * Handle backwards navigation of the folder structure.
   * @param {PointerEvent} event    The triggering click event
   * @private
   */
  _onClickDirectoryControl(event) {
    event.preventDefault();
    const button = event.currentTarget;
    const action = button.dataset.action;
    switch (action) {
      case "back":
        let target = this.target.split("/");
        target.pop();
        return this.browse(target.join("/"));
      case "mkdir":
        return this._createDirectoryDialog(this.source);
      case "toggle-privacy":
        let isPrivate = !this.result.private;
        const data = {private: isPrivate, bucket: this.result.bucket};
        return this.constructor.configurePath(this.activeSource, this.target, data).then(r => {
          this.result.private = r.private;
          this.render();
        });
    }
  }

  /* -------------------------------------------- */

  /**
   * Present the user with a dialog to create a subdirectory within their currently browsed file storage location.
   * @param {object} source     The data source being browsed
   * @private
   */
  _createDirectoryDialog(source) {
    const form = `<form><div class="form-group">
    <label>Directory Name</label>
    <input type="text" name="dirname" placeholder="directory-name" required/>
    </div></form>`;
    return Dialog.confirm({
      title: game.i18n.localize("FILES.CreateSubfolder"),
      content: form,
      yes: async html => {
        const dirname = html.querySelector("input").value;
        const path = [source.target, dirname].filterJoin("/");
        try {
          await this.constructor.createDirectory(this.activeSource, path, {bucket: source.bucket});
        } catch ( err ) {
          ui.notifications.error(err.message);
        }
        return this.browse(this.target);
      },
      options: {jQuery: false}
    });
  }

  /* -------------------------------------------- */

  /**
   * Handle changes to the bucket selector
   * @param {Event} event     The S3 bucket select change event
   * @private
   */
  _onChangeBucket(event) {
    event.preventDefault();
    const select = event.currentTarget;
    this.sources.s3.bucket = select.value;
    return this.browse("/");
  }

  /* -------------------------------------------- */

  /**
   * Handle changes to the tile size.
   * @param {Event} event  The triggering event.
   * @protected
   */
  _onChangeTileSize(event) {
    this.constructor.LAST_TILE_SIZE = event.currentTarget.valueAsNumber;
  }

  /* -------------------------------------------- */

  /** @override */
  _onSearchFilter(event, query, rgx, html) {
    for ( let ol of html.querySelectorAll(".directory") ) {
      let matched = false;
      for ( let li of ol.children ) {
        let match = rgx.test(SearchFilter.cleanQuery(li.dataset.name));
        if ( match ) matched = true;
        li.style.display = !match ? "none" : "";
      }
      ol.style.display = matched ? "" : "none";
    }
    this.setPosition({height: "auto"});
  }

  /* -------------------------------------------- */

  /** @inheritdoc */
  _onSubmit(ev) {
    ev.preventDefault();
    let path = ev.target.file.value;
    if ( !path ) return ui.notifications.error("You must select a file to proceed.");

    // Update the target field
    if ( this.field ) {
      this.field.value = path;
      this.field.dispatchEvent(new Event("change", {bubbles: true}));
    }

    // Trigger a callback and close
    if ( this.callback ) this.callback(path, this);
    return this.close();
  }

  /* -------------------------------------------- */

  /**
   * Handle file upload
   * @param {Event} ev      The file upload event
   * @private
   */
  async _onUpload(ev) {
    const form = ev.target.form;
    const upload = form.upload.files[0];
    const name = upload.name.toLowerCase();

    // Validate file extension
    if ( !this.extensions.some(ext => name.endsWith(ext)) ) {
      ui.notifications.error(`Incorrect ${this.type} file extension. Supports ${this.extensions.join(" ")}.`);
      return false;
    }

    // Dispatch the request
    const target = form.target.value;
    const options = { bucket: form.bucket ? form.bucket.value : null };
    const response = await this.constructor.upload(this.activeSource, target, upload, options);

    // Handle errors
    if ( response.error ) {
      return ui.notifications.error(response.error);
    }

    // Flag the uploaded file as the new request
    this.request = response.path;
    return this.browse(target);
  }

  /* -------------------------------------------- */
  /*  Factory Methods
  /* -------------------------------------------- */

  /**
   * Bind the file picker to a new target field.
   * Assumes the user will provide a HTMLButtonElement which has the data-target and data-type attributes
   * The data-target attribute should provide the name of the input field which should receive the selected file
   * The data-type attribute is a string in ["image", "audio"] which sets the file extensions which will be accepted
   *
   * @param {HTMLButtonElement} button     The button element
   */
  static fromButton(button) {
    if ( !(button instanceof HTMLButtonElement ) ) throw new Error("You must pass an HTML button");
    let type = button.getAttribute("data-type");
    const form = button.form;
    const field = form[button.dataset.target] || null;
    const current = field?.value || "";
    return new FilePicker({field, type, current, button});
  }

  /* -------------------------------------------- */
  /*  Deprecations                                */
  /* -------------------------------------------- */

  /**
   * @deprecated since v10
   * @ignore
   */
  static parseS3URL(key) {
    foundry.utils.logCompatibilityWarning("You are using FilePicker.parseS3URL which has been deprecated and will be "
    + "removed in a later version.", {since: 10, until: 12});
    return foundry.utils.parseS3URL(key);
  }
}
