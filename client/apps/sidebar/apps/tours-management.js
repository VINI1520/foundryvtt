/**
 * A management app for configuring which Tours are available or have been completed.
 */
class ToursManagement extends PackageConfiguration {

  /** @override */
  static get defaultOptions() {
    return foundry.utils.mergeObject(super.defaultOptions, {
      id: "tours-management",
      title: game.i18n.localize("SETTINGS.Tours"),
      categoryTemplate: "templates/sidebar/apps/tours-management-category.html"
    });
  }

  /* -------------------------------------------- */

  /** @override */
  _prepareCategoryData() {

    // Classify all Actions
    let categories = new Map();
    let total = 0;
    for ( let tour of game.tours.values() ) {
      if ( !tour.config.display || (tour.config.restricted && !game.user.isGM) ) continue;
      total++;

      // Determine what category the action belongs to
      let category = this._categorizeEntry(tour.namespace);

      // Convert Tour to render data
      const tourData = {};
      tourData.category = category.title;
      tourData.id = `${tour.namespace}.${tour.id}`;
      tourData.title = game.i18n.localize(tour.title);
      tourData.description = game.i18n.localize(tour.description);
      tourData.cssClass = tour.config.restricted ? "gm" : "";
      tourData.notes = [
        tour.config.restricted ? game.i18n.localize("KEYBINDINGS.Restricted") : "",
        tour.description
      ].filterJoin("<br>");

      switch ( tour.status ) {
        case Tour.STATUS.UNSTARTED: {
          tourData.status = game.i18n.localize("TOURS.NotStarted");
          tourData.canBePlayed = tour.canStart;
          tourData.canBeReset = false;
          tourData.startOrResume = game.i18n.localize("TOURS.Start");
          break;
        }
        case Tour.STATUS.IN_PROGRESS: {
          tourData.status = game.i18n.format("TOURS.InProgress", {
            current: tour.stepIndex + 1,
            total: tour.steps.length ?? 0
          });
          tourData.canBePlayed = tour.canStart;
          tourData.canBeReset = true;
          tourData.startOrResume = game.i18n.localize(`TOURS.${tour.config.canBeResumed ? "Resume" : "Restart"}`);
          break;
        }
        case Tour.STATUS.COMPLETED: {
          tourData.status = game.i18n.localize("TOURS.Completed");
          tourData.canBeReset = true;
          tourData.cssClass += " completed";
          break;
        }
      }

      // Register a category the first time it is seen, otherwise add to it
      if ( !categories.has(category.id) ) {
        categories.set(category.id, {
          id: category.id,
          title: category.title,
          tours: [tourData],
          count: 0
        });

      } else categories.get(category.id).tours.push(tourData);
    }

    // Sort Actions by priority and assign Counts
    for ( let category of categories.values() ) {
      category.count = category.tours.length;
    }
    categories = Array.from(categories.values()).sort(this._sortCategories.bind(this));
    return {categories, total};
  }

  /* -------------------------------------------- */
  /*  Event Listeners and Handlers                */
  /* -------------------------------------------- */

  /** @override */
  activateListeners(html) {
    super.activateListeners(html);
    html.find(".controls").on("click", ".control", this._onClickControl.bind(this));
  }

  /* -------------------------------------------- */

  /** @override */
  async _onResetDefaults(event) {
    return Dialog.confirm({
      title: game.i18n.localize("TOURS.ResetTitle"),
      content: `<p>${game.i18n.localize("TOURS.ResetWarning")}</p>`,
      yes: async () => {
        await Promise.all(game.tours.contents.map(tour => tour.reset()));
        ui.notifications.info("TOURS.ResetSuccess", {localize: true});
        this.render(true);
      },
      no: () => {},
      defaultYes: false
    });
  }

  /* -------------------------------------------- */

  /**
   * Handle Control clicks
   * @param {MouseEvent} event
   * @private
   */
  _onClickControl(event) {
    const button = event.currentTarget;
    const div = button.closest(".tour");
    const tour = game.tours.get(div.dataset.tour);
    switch ( button.dataset.action ) {
      case "play":
        this.close();
        return tour.start();
      case "reset": return tour.reset();
    }
  }
}
