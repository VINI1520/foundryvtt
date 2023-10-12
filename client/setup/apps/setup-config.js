/**
 * The Setup screen configuration form application.
 * @alias ui.setup
 */
class SetupConfigurationForm extends Application {

  /** @override */
  static get defaultOptions() {
    return foundry.utils.mergeObject(super.defaultOptions, {
      id: "setup-configuration",
      classes: ["dark"],
      template: "templates/setup/setup-config.html",
      popOut: false,
      scrollY: ["#world-list", "#system-list", "#module-list"],
      tabs: [{navSelector: ".tabs", contentSelector: ".content", initial: "worlds"}],
      filters: [
        {inputSelector: "#world-filter", contentSelector: "#world-list"},
        {inputSelector: "#system-filter", contentSelector: "#system-list"},
        {inputSelector: "#module-filter", contentSelector: "#module-list"}
      ]
    });
  }

  /* -------------------------------------------- */

  /**
   * Track the button elements which represent updates for different named packages
   * @type {HTMLElement|null}
   * @private
   */
  _progressButton = null;

  /**
   * Keeps track of which packages were updated to enable displaying their state on redraw
   * @type {Set<string>}
   * @private
   */
  _updatedPackages = new Set();

  /**
   * The name of the currently active tab.
   * @type {string}
   */
  get activeTab() {
    return this._tabs[0].active;
  }

  /* -------------------------------------------- */

  /** @override */
  _onSearchFilter(event, query, rgx, html) {
    let anyMatch = !query;
    for ( let li of html.children ) {
      if ( !query ) {
        li.classList.remove("hidden");
        continue;
      }
      const id = li.dataset.packageId;
      const title = li.querySelector(".package-title")?.textContent;
      const match = rgx.test(id) || rgx.test(SearchFilter.cleanQuery(title));
      li.classList.toggle("hidden", !match);
      if ( match ) anyMatch = true;
    }
    const empty = !anyMatch || !html.children.length;
    html.classList.toggle("empty", empty);
    if ( !anyMatch ) {
      let type;
      switch ( html.id ) {
        case "world-list": type = "world"; break;
        case "system-list": type = "system"; break;
        case "module-list": type = "module"; break;
      }
      html.previousElementSibling.innerHTML =
        game.i18n.format("SETUP.PackagesNoResults", { type: type, name: query});
    }
    html.previousElementSibling.classList.toggle("hidden", anyMatch);
  }

  /* -------------------------------------------- */

  /** @inheritdoc */
  _onChangeTab(event, tabs, active) {
    super._onChangeTab(event, tabs, active);
    this._searchFilters.forEach(f => { // Clear the search filter.
      if ( f._input ) f._input.value = "";
      f.filter(null, "");
    });
    ui.setup.element.find(".tab.active .filter > input").trigger("focus"); // Trigger filter focus
  }

  /* -------------------------------------------- */

  /** @override */
  getData(options={}) {
    options = game.data.options;
    options.upnp = options.upnp !== false;

    // Helper functions
    const authorLabel = authors => game.i18n.localize(`Author${authors.size > 1 ? "Pl" : ""}`);
    const formatAuthors = p => {
      if ( p.authors.length ) p.authors = p.authors.map(a => {
        if ( a.url ) return `<a href="${a.url}" target="_blank">${a.name}</a>`;
        return a.name;
      }).join(", ");
    };
    const codes = CONST.PACKAGE_AVAILABILITY_CODES;

    // Prepare Systems
    const systems = game.systems.map(system => {
      const s = system.toObject();
      s.locked = system.locked;
      s.labels = {authors: authorLabel(system), ...system.getAvailabilityLabels()};
      formatAuthors(s);
      s.updated = this._updatedPackages.has(s.id);
      s.path = `${game.data.options.dataPath}/Data/systems/${s.id}/`;
      return s;
    }).sort((a, b) => a.title.localeCompare(b.title));

    // Prepare Modules
    const modules = game.modules.map(module => {
      const m = module.toObject();
      m.locked = module.locked;
      m.labels = {authors: authorLabel(module), ...module.getAvailabilityLabels()};
      formatAuthors(m);
      const required = (m?.relationships?.requires ?? []).reduce((arr, d) => {
        if ( d?.id ) arr.push(d.id);
        return arr;
      }, []);
      m.relationships = {requires: required.length ? required : null};
      m.updated = this._updatedPackages.has(m.id);
      m.path = `${game.data.options.dataPath}/Data/modules/${m.id}/`;
      return m;
    }).sort((a, b) => a.title.localeCompare(b.title));

    // Prepare Worlds
    const worlds = game.worlds.map(world => {
      const w = world.toObject();
      w.shortDesc = TextEditor.previewHTML(w.description);
      w.system = game.systems.get(w.system);
      w.labels = {authors: authorLabel(world), ...world.getAvailabilityLabels()};
      formatAuthors(w);
      w.updated = this._updatedPackages.has(w.id);
      w.path = `${game.data.options.dataPath}/Data/worlds/${w.id}/`;

      // World availability takes into account System availability
      w.available = world.availability <= codes.REQUIRES_UPDATE;
      return w;
    }).sort((a, b) => a.title.localeCompare(b.title));

    // Return data for rendering
    const coreVersion = game.version;
    const versionDisplay = game.release.display;
    const canReachInternet = game.data.addresses.remote;
    const couldReachWebsite = game.data.coreUpdate.couldReachWebsite;
    return {
      coreVersion: coreVersion,
      release: game.release,
      coreVersionHint: game.i18n.format("SETUP.CoreVersionHint", {versionDisplay}),
      noSystems: !systems.length,
      systems: systems,
      modules: modules,
      worlds: worlds,
      languages: game.data.languages,
      options: options,
      adminPassword: game.data.passwordString,
      updateChannels: Object.entries(CONST.SOFTWARE_UPDATE_CHANNELS).reduce((obj, c) => {
        obj[c[0]] = game.i18n.localize(c[1]);
        return obj;
      }, {}),
      updateChannelHints: Object.entries(CONST.SOFTWARE_UPDATE_CHANNELS).reduce((obj, c) => {
        obj[c[0]] = game.i18n.localize(`${c[1]}Hint`);
        return obj;
      }, {}),
      coreUpdate: game.data.coreUpdate.hasUpdate ? game.i18n.format("SETUP.UpdateAvailable", game.data.coreUpdate) : false,
      canReachInternet: canReachInternet,
      couldReachWebsite: couldReachWebsite,
      slowResponse: game.data.coreUpdate.slowResponse,
      updateButtonEnabled: canReachInternet && couldReachWebsite
    };
  }

  /* -------------------------------------------- */

  /** @inheritdoc */
  async _render(force, options) {
    await loadTemplates(["templates/setup/parts/package-tags.html"]);
    await super._render(force, options);
    ui.config = (new ApplicationConfigurationForm(game.data.options)).render(true);
  }

  /* -------------------------------------------- */
  /*  Event Listeners and Handlers                */
  /* -------------------------------------------- */

  /** @override */
  activateListeners(html) {
    super.activateListeners(html);

    // Create or Edit World
    html.find("button#create-world, button.edit-world").on("click", this._onWorldConfig.bind(this));

    // Generic Action Buttons
    html.on("click", "button[data-action]", this._onActionButton.bind(this));

    // Install Package
    html.find("button.install-package").on("click", this.#onInstallPackageDialog.bind(this));

    // Update Package
    html.find("button.update").on("click", this.#onUpdatePackage.bind(this));

    // Update All Packages
    html.find("button.update-packages").on("click", this.#onUpdatePackages.bind(this));

    // Uninstall Package
    html.find("button.uninstall").on("click", this._onUninstallPackage.bind(this));

    // Change Update Channel
    html.find("select[name='updateChannel']").on("change", this._onChangeChannel.bind(this));

    // Update Core
    html.find("button#update-core").on("click", this._onCoreUpdate.bind(this));

    // Tours
    html.find("a.launch-tour").on("click", this.#onStartTour.bind(this));

    // Lock
    html.find("button.lock-toggle").on("click", this.#onToggleLock.bind(this));

    html.find(".tab.active .filter > input").trigger("focus");

    html.on("click", "a.system-install", event => this.#onClickInstall(event, "system"));
    html.on("click", "a.module-install", event => this.#onClickInstall(event, "module"));
    html.on("click", "a.world-install", event => this.#onClickInstall(event, "world"));
  }

  /* -------------------------------------------- */

  /**
   * Post the setup configuration form
   * @param {object} requestData    An object of data which should be included with the POST request
   * @param {object} requestOptions An object of options passed to the fetchWithTimeout method
   * @returns {Promise<object>}     A Promise resolving to the returned response data
   * @throws                        An error if the request was not successful
   * @internal
   */
  async _post(requestData, requestOptions={}) {

    // Post the request and handle redirects
    let responseData;
    try {
      const response = await foundry.utils.fetchWithTimeout(Setup.setupURL, {
        method: "POST",
        headers: {"Content-Type": "application/json"},
        body: JSON.stringify(requestData)
      }, requestOptions);
      if ( response.redirected ) return window.location.href = response.url;
      responseData = await response.json();
    } catch(err) {
      ui.notifications.error(err, {permanent: true});
      throw err;
    }

    // Handle server-side errors
    if ( responseData.error ) {
      const message = game.i18n.localize(responseData.error);
      const err = new Error(message);
      err.stack = responseData.stack;
      ui.notifications.error(err, {permanent: true});
      throw err;
    }
    return responseData;
  }

  /* -------------------------------------------- */

  /**
   * Reload the setup view by re-acquiring setup data and re-rendering the form
   * @private
   */
  async reload() {
    this._progressButton = null;
    return Setup.getData(game.socket, game.view).then(setupData => {
      foundry.utils.mergeObject(game.data, setupData);
      game.setupPackages(setupData);
      this.refresh();
    });
  }

  /* -------------------------------------------- */

  /**
   * Refresh this application UI by re-rendering it and other related applications.
   */
  refresh() {
    this.render();
    Object.values(ui.windows).forEach(app => {
      if ( app instanceof InstallPackage ) app.render();
    });
  }

  /* -------------------------------------------- */

  /**
   * Generic button handler for the setup form which submits a POST request including any dataset on the button itself
   * @param {MouseEvent} event    The originating mouse click event
   * @returns {Promise}
   * @private
   */
  async _onActionButton(event) {
    event.preventDefault();

    // Construct data to post
    const button = event.currentTarget;
    button.disabled = true;
    const data = foundry.utils.deepClone(button.dataset);
    const requestOptions = {};

    // Warn about world migration
    switch ( data.action ) {
      case "launchWorld":
        const world = game.worlds.get(data.world);
        requestOptions.timeoutMs = null;
        const confirm = await this.#displayWorldMigrationInfo(world);
        if ( !confirm ) return button.disabled = false;
        break;
    }

    // Submit the post request
    const response = await this._post(data, requestOptions);
    button.disabled = false;
    return response;
  }

  /* -------------------------------------------- */

  async #displayWorldMigrationInfo(world) {
    if ( !world ) return false;
    if ( !foundry.utils.isNewerVersion(game.release.version, world.coreVersion) ) return true;

    // Prompt that world migration will be required
    const system = game.systems.get(world.system);
    const title = game.i18n.localize("SETUP.WorldMigrationRequiredTitle");
    const disableModules = game.release.isGenerationalChange(world.compatibility.verified);
    const content = [
      game.i18n.format("SETUP.WorldMigrationRequired", {
        world: world.title,
        oldVersion: world.coreVersion,
        newVersion: game.release
      }),
      system.availability !== 0 ? game.i18n.format("SETUP.WorldMigrationSystemUnavailable", {
        system: system.title,
        systemVersion: system.version
      }) : "",
      disableModules ? game.i18n.localize("SETUP.WorldMigrationDisableModules") : "",
      game.i18n.localize("SETUP.WorldMigrationBackupPrompt")
    ].filterJoin("");

    // Present the confirmation dialog
    const confirm = await Dialog.wait({
      title, content, default: "no",
      buttons: {
        yes: {
          icon: '<i class="fa-solid fa-laptop-arrow-down"></i>',
          label: game.i18n.localize("SETUP.WorldMigrationBegin"),
          callback: () => true
        },
        no: {
          icon: '<i class="fas fa-times"></i>',
          label: game.i18n.localize("Cancel"),
          callback: () => false
        }
      },
      close: () => false
    });

    // Notify migration in progress
    if ( confirm ) {
      const msg = game.i18n.format("SETUP.WorldMigrationInProcess", {version: game.release});
      ui.notifications.info(msg, {permanent: true});
    }
    return confirm;
  }

  /* -------------------------------------------- */

  /**
   * Begin creation of a new World using the config form
   * @param {MouseEvent} event    The originating mouse click event
   * @private
   */
  _onWorldConfig(event) {
    event.preventDefault();
    const button = event.currentTarget;
    let world;
    const options = {};

    // Edit an existing World
    if ( button.dataset.world ) {
      world = game.worlds.get(button.dataset.world);
    }

    // Create a new World
    else {
      if ( !game.systems.size ) return ui.notifications.warn(game.i18n.localize("SETUP.YouMustInstallASystem"));
      options.create = true;
      world = new World({name: "1", title: "1", system: "1", coreVersion: game.release.version});
      world.id = world.title = world.system = "";
    }

    // Render the World configuration application
    new WorldConfig(world, options).render(true);
  }

  /* -------------------------------------------- */

  /**
   * When changing the software update channel, reset the state of the update button and "Force Update" checkbox.
   * Clear results from a prior check to ensure that users don't accidentally perform an update for some other channel.
   * @param {Event} event     The select change event
   */
  async _onChangeChannel(event) {
    const button = document.getElementById("update-core");
    button.value = "updateCheck";
    button.children[1].textContent = game.i18n.localize("SETUP.UpdateCheckFor");
    const check = document.querySelector("input[name='forceUpdate']");
    check.checked = false;
  }

  /* -------------------------------------------- */
  /*  Package Management                          */
  /* -------------------------------------------- */

  /**
   * Handle install button clicks to add new packages
   * @param {Event} event
   * @private
   */
  async #onInstallPackageDialog(event) {
    event.preventDefault();
    let button = this._progressButton = event.currentTarget;
    const list = button.closest(".tab").querySelector(".package-list");
    const type = list.dataset.packageType;
    new InstallPackage({packageType: type, setup: this}).render(true);
  }

  /* -------------------------------------------- */

  /**
   * Handle update button press for a single Package
   * @param {Event} event
   * @private
   */
  async #onUpdatePackage(event) {
    event.preventDefault();
    const button = event.currentTarget;
    button.disabled = true;

    // Get the requested package
    let pkg = this.#getPackageFromButton(button);
    if ( !pkg?.manifest ) return;

    // Inquire with the server for updates
    if ( button.dataset.state === "check" ) {
      let data = await this.#updateCheckOne(pkg.type, pkg.id, button);
      let manifest = data.manifest;

      // Handle non-update states
      switch ( data.state ) {
        case "error":
          return ui.notifications.error(data.error, {permanent: true});
        case "warning":
          return ui.notifications.warn(data.warning);
        case "sidegrade":
          return ui.setup?.reload();
        case "trackChange":
          const accepted = await this.#promptTrackChange(pkg, data.trackChange);
          if ( accepted ) {
            manifest = data.trackChange.manifest;
            data.state = "update";
          }
          break;
      }

      // Perform the update
      if ( data.state === "update" ) return this.#updateDownloadOne(pkg.type, pkg.id, button, manifest);
    }
  }

  /* -------------------------------------------- */

  /**
   * Prompt the user to use a new Package track it if they haven't previously declined.
   * @param {BasePackage} pkg                                     The Package being updated
   * @param {{manifest: string, version: string}} trackChange     A recommended track change provided by the server
   * @returns {Promise<boolean>}                                  Whether the recommended track change was accepted
   * @private
   */
  async #promptTrackChange(pkg, trackChange) {
    let declinedManifestUpgrades = game.settings.get("core", "declinedManifestUpgrades");
    let declinedForVersion = declinedManifestUpgrades[pkg.id] === pkg.version;
    if ( declinedForVersion ) return false;

    // Display prompt
    let content = await renderTemplate("templates/setup/manifest-update.html", {
      localManifest: pkg.manifest,
      localTitle: game.i18n.format("SETUP.PriorManifestUrl", {version: pkg.version}),
      remoteManifest: trackChange.manifest,
      remoteTitle: game.i18n.format("SETUP.UpdatedManifestUrl", {version: trackChange.version}),
      package: pkg.title
    });
    let accepted = await Dialog.confirm({
      title: `${pkg.title} ${game.i18n.localize("SETUP.ManifestUpdate")}`,
      content: content,
      yes: () => {
        delete declinedManifestUpgrades[pkg.id];
        return true;
      },
      no: () => {
        declinedManifestUpgrades[pkg.id] = pkg.version;
        return false;
      },
      defaultYes: true
    });
    game.settings.set("core", "declinedManifestUpgrades", declinedManifestUpgrades);
    return accepted;
  }

  /* -------------------------------------------- */

  /**
   * Traverses the HTML structure to find the Package this button belongs to
   * @param {HTMLElement} button      The clicked button
   * @returns {Promise<BasePackage>}  A Package
   * @private
   */
  #getPackageFromButton(button) {
    let li = button.closest("li.package");
    let id = li.dataset.packageId;
    let type = li.closest("ul.package-list").dataset.packageType;
    return game[`${type}s`].get(id, {strict: true});
  }

  /* -------------------------------------------- */

  /**
   * @typedef {object} PackageCheckResult
   * @property {string} type                                         The Package Type
   * @property {string} id                                           The Package Id
   * @property {HTMLElement} button                                  The update button for the Package
   * @property {string} state                                        The State of the check, from [ "error", "sidegrade", "trackChange", "warning", "update", "current", "unknown" ]
   * @property {string} [error]                                      An error to display, if any
   * @property {string} [warning]                                    A warning to display, if any
   * @property {manifest: string, version: string} [trackChange]     The suggested track change, if any
   * @property {string} [manifest]                                   The manifest of the Update, if any
   */

  /**
   * Execute upon an update check for a single Package
   * @param {string} type         The package type to check
   * @param {string} id           The package id to check
   * @param {HTMLElement} button  The update button for the package
   * @returns {Promise<PackageCheckResult>}    The status of the update check
   * @private
   */
  async #updateCheckOne(type, id, button) {
    button.disabled = true;
    const checkData = {type: type, id: id, button: button, state: "unknown"};

    // Check whether an update is available
    let responseData;
    let manifestData;
    try {
      responseData = await Setup.checkPackage({type, id});
      manifestData = responseData.remote;
    } catch(err) {
      checkData.state = "error";
      checkData.error = game.i18n.localize("PACKAGE.UpdateCheckTimedOut");
      button.disabled = false;
      return checkData;
    }

    // Returned error data
    if ( responseData.error ) {
      checkData.state = "error";
      checkData.error = responseData.error;
      return checkData;
    }

    // Metadata sidegrade performed
    if ( responseData.hasSidegraded ) {
      button.dataset.state = checkData.state = "sidegrade";
      return checkData;
    }

    // Track change suggested
    if ( responseData.trackChange ) {
      button.dataset.state = checkData.state = "trackChange";
      checkData.trackChange = responseData.trackChange;
      checkData.manifest = responseData.trackChange.manifest;
      return checkData;
    }

    const availability = responseData.availability;
    const codes = CONST.PACKAGE_AVAILABILITY_CODES;

    // Unsupported updates
    const wrongCore = [codes.REQUIRES_CORE_UPGRADE_STABLE, codes.REQUIRES_CORE_UPGRADE_UNSTABLE];
    if ( responseData.isUpgrade && wrongCore.includes(availability) ) {
      button.innerHTML = `<i class="fas fa-ban"></i><label>${game.i18n.format("SETUP.PackageStatusBlocked")}</label>`;
      checkData.state = "warning";
      if ( availability === codes.REQUIRES_CORE_UPGRADE_UNSTABLE ) {
        checkData.warning = game.i18n.format("SETUP.PackageUpdateCoreUnstable", {
          id: manifestData.id,
          vmin: manifestData.compatibility.minimum
        });
      } else {
        checkData.warning = game.i18n.format("SETUP.PackageUpdateCoreUpdateNeeded", {
          id: manifestData.id,
          vmin: manifestData.compatibility.minimum,
          vcur: game.version
        });
      }
      return checkData;
    }

    // Available updates
    if ( responseData.isUpgrade && (availability === codes.AVAILABLE || availability === codes.REQUIRES_UPDATE) ) {
      const label = game.i18n.format("SETUP.PackageStatusUpdate");
      button.innerHTML = `<i class="fas fa-download"></i><label>${label}</label>`;
      button.dataset.state = checkData.state = "update";
      checkData.manifest = manifestData.manifest;
      return checkData;
    }

    // Packages which are already current
    const label = game.i18n.format("SETUP.PackageStatusCurrent");
    checkData.state = "current";
    button.innerHTML = `<i class="fas fa-check"></i><label>${label}</label>`;
    return checkData;
  }

  /* -------------------------------------------- */

  /**
   * Execute upon an update download for a single Package
   * Returns a Promise which resolves once the download has successfully started
   * @param {string} type         The package type to install
   * @param {string} id           The package id to install
   * @param {HTMLElement} button  The Download button
   * @param {string} manifestUrl  The URL of the source manifest
   * @returns {Promise<object>}   Installed package manifest data
   * @private
   */
  async #updateDownloadOne(type, id, button, manifestUrl) {
    this._progressButton = button;
    const label = game.i18n.format("SETUP.PackageStatusUpdating");
    this._progressButton.innerHTML = `<i class="fas fa-spinner fa-pulse"></i><label>${label}</label>`;
    const packageData = await Setup.installPackage({type, id: id, manifest: manifestUrl}, data => {
      this.updateProgressBar(data);
      this.updateProgressButton(data);
    });
    this._updatedPackages.add(packageData.id);
    this._progressButton = null;
    return packageData;
  }

  /* -------------------------------------------- */

  /**
   * Handle uninstall button clicks to remove existing packages
   * @param {Event} event
   * @private
   */
  _onUninstallPackage(event) {
    event.preventDefault();

    // Disable the button
    let button = event.currentTarget;
    button.disabled = true;

    // Obtain the package metadata
    const li = button.closest(".package");
    const id = li.dataset.packageId;
    const type = li.closest(".package-list").dataset.packageType;

    // Access the installed package and its index in the source data
    const cls = {world: World, system: System, module: Module}[type];
    const pkg = game[cls.collection].get(id);

    // Provide a deletion confirmation warning
    // For worlds, require the user to provide a deletion code
    // Based on https://stackoverflow.com/a/8084248
    const title = pkg.title;
    let warning = `<p>${game.i18n.format("SETUP.PackageDeleteConfirm", {type: type.titleCase(), title})}</p>`;
    const code = (Math.random() + 1).toString(36).substring(7, 11);
    if ( type === "world" ) {
      warning += `<p class="notification">${game.i18n.localize("SETUP.WorldDeleteConfirm1")}</p>`;
      warning += `<p>${game.i18n.format("SETUP.WorldDeleteConfirm2")}<b>${code}</b></p>`;
      warning += "<p><input id=\"delete-confirm\" type=\"text\" required autocomplete=\"off\"></p>";
    } else {
      warning += `<p class="notification">${game.i18n.localize("SETUP.PackageDeleteNoUndo")}</p>`;
    }

    // Confirm deletion request
    Dialog.confirm({
      title: game.i18n.format("SETUP.PackageDeleteTitle", {type: type.titleCase(), title}),
      content: warning,
      yes: async html => {

        // Confirm World deletion
        if ( type === "world" ) {
          const confirm = html.find("#delete-confirm").val();
          if ( confirm !== code ) {
            return ui.notifications.error("SETUP.PackageDeleteWorldConfirm", {localize: true});
          }
        }

        // Submit the server request
        const response = await Setup.uninstallPackage({type, id});
        if ( response.error ) {
          const err = new Error(response.error);
          err.stack = response.stack;
          ui.notifications.error(`${game.i18n.localize("SETUP.UninstallFailure")}: ${err.message}`);
          console.error(err);
        } else {
          ui.notifications.info(`${type.titleCase()} ${id} ${game.i18n.localize("SETUP.UninstallSuccess")}.`);
          pkg.uninstall();
        }

        // Reload setup data
        ui.setup.reload();
      }
    }).then(() => button.disabled = false);
  }

  /* -------------------------------------------- */

  /**
   * Execute upon an update-all workflow to update all packages of a certain type
   * @param {Event} event
   * @private
   */
  async #onUpdatePackages(event) {
    event.preventDefault();
    let button = event.currentTarget;
    button.disabled = true;
    const icon = button.querySelector("i");
    icon.className = "fas fa-spinner fa-pulse";
    let ol = $(".tab.active .package-list");
    let type = ol.data("packageType");

    // Get Packages
    let packages = [];
    ol.children(".package").each((i, li) => {
      const id = li.dataset.packageId;
      const pack = game[`${type}s`].get(id);
      if ( pack && pack.manifest && !pack.locked ) packages.push({
        id: id,
        status: "none",
        button: li.querySelector("button.update")
      });
    });

    // Ensure the package cache is warm
    await Setup.warmPackages({type});

    // Check for updates in parallel
    let shouldReload = false;
    const checks = [];
    for ( let [i, p] of packages.entries() ) {
      const check = this.#updateCheckOne(type, p.id, p.button);
      checks.push(check);
      if (((i+1) % 10) === 0) await check; // Batch in groups of 10
    }
    /** @type PackageCheckResult[] */
    const checkedPackages = await Promise.all(checks);

    // Execute updates one at a time
    let updateLog = [];
    for ( const p of checkedPackages ) {
      const pack = game[`${p.type}s`].get(p.id);
      if ( p.state === "error" ) updateLog.push({package: pack, action: game.i18n.localize("Error"), actionClass: "fa-exclamation-circle", description: p.error});
      else if ( p.state === "warning" ) updateLog.push({package: pack, action: game.i18n.localize("Warning"), actionClass: "fa-exclamation-triangle", description: p.warning});
      else if ( p.state === "sidegrade" ) shouldReload = true;
      if ( !(p.state === "update" || p.state === "trackChange") ) continue;
      let manifest = p.manifest;
      let shouldUpdate = true;
      if ( p.trackChange ) {
        shouldUpdate = await this.#promptTrackChange(pack, p.trackChange);
        manifest = p.trackChange.manifest;
      }
      if ( shouldUpdate ) {
        try {
          let updated = await this.#updateDownloadOne(type, p.id, p.button, manifest);
          if ( p.state !== "sidegrade" ) {
            updateLog.push({
              package: pack,
              action: game.i18n.localize("Update"),
              actionClass: "fa-check-circle",
              description: `${pack.version} ➞ ${updated.version}`
            });
            shouldReload = true;
          }
        }
        catch(exception) {
          updateLog.push({package: pack, action: game.i18n.localize("Error"), actionClass: "fa-exclamation-circle", description: exception.message});
        }
      }
      p.available = false;
    }

    // Display Updatelog
    if ( updateLog.length > 0 ) {
      let content = await renderTemplate("templates/setup/updated-packages.html", {
        changed: updateLog
      });
      await Dialog.prompt({
        title: game.i18n.localize("SETUP.UpdatedPackages"),
        content: content,
        callback: () => {},
        options: {width: 600},
        rejectClose: false
      });
    }
    if (shouldReload && ui.setup) {
      await ui.setup.reload();
    }
    icon.className = "fas fa-cloud-download-alt";
    button.disabled = false;
  }

  /* -------------------------------------------- */

  /**
   * Handle lock button clicks to lock / unlock a Package
   * @param {Event} event
   * @private
   */
  async #onToggleLock(event) {
    event.preventDefault();

    // Submit a lock request and update package data
    const button = event.currentTarget;
    const pkg = await this.#getPackageFromButton(button);
    const shouldLock = !pkg.locked;
    await this._post({action: "lockPackage", type: pkg.type, id: pkg.id, shouldLock});
    pkg.locked = shouldLock;

    // Update the setup interface
    let icon = button.querySelector(".fas");
    if (shouldLock) {
      button.classList.replace("lock", "unlock");
      icon.classList.replace("fa-unlock", "fa-lock");
    }
    else {
      button.classList.replace("unlock", "lock");
      icon.classList.replace("fa-lock", "fa-unlock");
    }
    let li = button.closest("li.package");
    let uninstall = li.querySelector(".uninstall");
    uninstall.hidden = shouldLock;
    let update = li.querySelector(".update");
    if ( update ) {
      update.hidden = shouldLock;
    }
  }

  /* -------------------------------------------- */

  /**
   * Spawn the system install dialog with a given system name already filled in.
   * @param {TriggeredEvent} event  The triggering event.
   * @private
   */
  #onClickInstall(event, type) {
    event.preventDefault();
    const query = event.currentTarget.dataset.query;
    new InstallPackage({packageType: type, setup: this, filterValue: query}).render(true);
  }

  /* -------------------------------------------- */

  /**
   * Handle a click on a Tour button
   * @param {TriggeredEvent} event  The triggering event
   * @private
   */
  async #onStartTour(event) {
    event.preventDefault();
    const tourName = event.currentTarget.dataset.tour;
    let tour = game.tours.get(`core.${tourName}`);
    if ( !tour ) return console.error(`${event.currentTarget.dataset.tour} not recognized as a launchable Tour`);
    await tour.start();
  }

  /* -------------------------------------------- */
  /*  Core Software Update                        */
  /* -------------------------------------------- */

  /**
   * Handle button clicks to update the core VTT software
   * @param {Event} event
   * @private
   */
  async _onCoreUpdate(event) {
    const button = event.currentTarget;
    const form = button.form;
    const label = button.children[1];

    // Disable the form
    button.disabled = true;
    form.disabled = true;

    const progress = data => {
      if ( ["UpdateComplete", "Error"].includes(data.step) ) {
        // After the update has completed or was interrupted due to error, remove any listeners and update the UI
        // appropriately.
        Setup._removeProgressListener(progress);

        // Final form updates
        button.disabled = true;
        form.disabled = true;
        const icon = button.querySelector("i");
        icon.className = data.step === "UpdateComplete" ? "fas fa-check" : "fas fa-times";

        // Display a notification message
        const level = data.step === "UpdateComplete" ? "info" : "error";
        ui.notifications[level](data.message, {localize: true});
        return;
      }
      this.updateProgressBar(data);
      this.updateProgressButton(data);
      UpdateNotes.updateButton(data);
      ui.updateNotes.setPosition({height: "auto"});
    };

    // Condition next step based on action
    if ( button.value === "updateDownload" ) {
      this._progressButton = button;
      // Attach a listener to accept progress events from the server after the update process has begun.
      Setup._addProgressListener(progress);
    }

    // Post the update request
    const requestData = {
      action: button.value,
      updateChannel: form.querySelector("select[name='updateChannel']").value,
      forceUpdate: form.querySelector("input[name='forceUpdate']").checked
    };
    const response = await this._post(requestData).catch(err => {
      button.disabled = false;
      form.disabled = false;
      throw err;
    });
    if ( response.info || response.warn ) {
      button.disabled = false;
      form.disabled = false;
      return response.info
        ? ui.notifications.info(response.info, {localize: true})
        : ui.notifications.warn(response.warn, {localize: true});
    }

    // Proceed to download step
    if ( button.value === "updateCheck" ) {
      let releaseData = new foundry.config.ReleaseData(response);
      ui.notifications.info(game.i18n.format("SETUP.UpdateInfoAvailable", {display: releaseData.display}));
      label.textContent = game.i18n.format("SETUP.UpdateButtonDownload", {display: releaseData.display});
      button.value = "updateDownload";
      button.disabled = false;
      if ( response.notes ) new UpdateNotes(response).render(true);
      if ( response.willDisableModules ) {
        ui.notifications.warn(game.i18n.format("SETUP.UpdateWarningWillDisable", {
          nIncompatible: game.modules.filter(m => m.incompatible).length,
          nModules: game.modules.size
        }), {permanent: true});
      }
    }
  }

  /* -------------------------------------------- */
  /*  Socket Listeners and Handlers               */
  /* -------------------------------------------- */

  /**
   * Update the display of an installation progress bar for a particular progress packet
   * @param {object} data   The progress update data
   */
  updateProgressBar(data) {
    const tabName = data.type === "core" ? "update" : `${data.type}s`;
    const tab = this.element.find(`.tab[data-tab="${tabName}"]`);
    if ( !tab.hasClass("active") ) return;
    const progress = tab.find(".progress-bar");
    progress.css("visibility", "visible");

    // Update bar and label position
    let pl = `${data.pct}%`;
    let bar = progress.children(".bar");
    bar.css("width", pl);
    let barLabel = progress.children(".pct");
    barLabel.text(pl);
    barLabel.css("left", pl);
  }

  /* -------------------------------------------- */

  /**
   * Update installation progress for a particular button which triggered the action
   * @param {object} data   The progress update data
   */
  updateProgressButton(data) {
    const button = this._progressButton;
    if ( !button ) return;
    button.disabled = data.pct < 100;

    // Update Icon
    const icon = button.querySelector("i");
    if ( data.pct < 100 ) icon.className = "fas fa-spinner fa-pulse";

    // Update label
    const label = button.querySelector("label");
    const step = game.i18n.localize(data.step);
    if ( label ) label.textContent = step;
    else button.textContent = ` ${step}`;
  }
}
