/**
 * A Tour subclass that handles controlling the UI state of the Setup screen
 */
class SetupTour extends Tour {

  /**
   * Stores a currently open Application for future steps
   * @type {Application}
   */
  focusedApp;

  /* -------------------------------------------- */

  /** @override */
  get canStart() {
    return game.view === "setup";
  }

  /* -------------------------------------------- */

  /** @override */
  get steps() {
    return this.config.steps; // A user is always "GM" for Setup Tours
  }

  /* -------------------------------------------- */

  /** @override */
  async _preStep() {
    await super._preStep();

    // Close currently open applications
    if ( this.stepIndex === 0 ) {
      for ( const app of Object.values(ui.windows) ) {
        app.close();
      }
    }

    // Configure specific steps
    switch ( this.id ) {
      case "installingASystem": return this._installingASystem();
      case "creatingAWorld": return this._creatingAWorld();
    }
  }

  /* -------------------------------------------- */

  /**
   * Handle Step setup for the Installing a System Tour
   * @returns {Promise<void>}
   * @private
   */
  async _installingASystem() {
    // Activate Systems tab and warm cache
    if ( this.currentStep.id === "systemsTab" ) {
      ui.setupPackages.activateTab("systems");

      // noinspection ES6MissingAwait
      Setup.warmPackages({type: "system"});
    }

    // Render the InstallPackage app with a filter
    else if ( this.currentStep.id === "searching" ) {
      await Setup.browsePackages("system", {search: "Simple Worldbuilding"});
    }
  }

  /* -------------------------------------------- */

  /**
   * Handle Step setup for the Creating a World Tour
   * @returns {Promise<void>}
   * @private
   */
  async _creatingAWorld() {

    // Activate the World tab
    if ( this.currentStep.id === "worldTab" ) {
      ui.setupPackages.activateTab("world");
    }
    else if ( this.currentStep.id === "worldTitle" ) {
      let world = new World({
        name: "my-first-world",
        title: "My First World",
        system: Array.from(game.systems)[0].id,
        coreVersion: game.release.version,
        description: game.i18n.localize("SETUP.NueWorldDescription")
      });
      const options = {
        create: true
      };

      // Render the World configuration application
      this.focusedApp = new WorldConfig(world, options);
      await this.focusedApp._render(true);
    }
    else if ( this.currentStep.id === "launching" ) {
      await this.focusedApp.submit();
    }
  }
}
