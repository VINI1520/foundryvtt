/**
 * The UI element which displays the Scene documents which are currently enabled for quick navigation.
 */
class SceneNavigation extends Application {
  constructor(options) {
    super(options);
    game.scenes.apps.push(this);

    /**
     * Navigation collapsed state
     * @type {boolean}
     */
    this._collapsed = false;
  }

  /* -------------------------------------------- */

  /** @inheritdoc */
  static get defaultOptions() {
    return foundry.utils.mergeObject(super.defaultOptions, {
      id: "navigation",
      template: "templates/hud/navigation.html",
      popOut: false,
      dragDrop: [{dragSelector: ".scene"}]
    });
  }

  /* -------------------------------------------- */

  /**
   * Return an Array of Scenes which are displayed in the Navigation bar
   * @returns {Scene[]}
   */
  get scenes() {
    const scenes = game.scenes.filter(s => {
      return (s.navigation && s.visible) || s.active || s.isView;
    });
    scenes.sort((a, b) => a.navOrder - b.navOrder);
    return scenes;
  }

  /* -------------------------------------------- */

  /*  Application Rendering
  /* -------------------------------------------- */

  /** @inheritdoc */
  render(force, context = {}) {
    let {renderContext, renderData} = context;
    if ( renderContext ) {
      const events = ["createScene", "updateScene", "deleteScene"];
      if ( !events.includes(renderContext) ) return this;
      const updateKeys = ["name", "ownership", "ownership.default", "active", "navigation", "navName", "navOrder"];
      if ( renderContext === "updateScene" && !updateKeys.some(k => renderData.hasOwnProperty(k)) ) return this;
    }
    return super.render(force, context);
  }

  /* -------------------------------------------- */

  /** @inheritdoc */
  async _render(force, options) {
    await super._render(force, options);
    const loading = document.getElementById("loading");
    const nav = this.element[0];
    loading.style.top = `${nav.offsetTop + nav.offsetHeight}px`;
  }

  /* -------------------------------------------- */

  /** @inheritdoc */
  getData(options={}) {
    const scenes = this.scenes.map(scene => {
      return {
        id: scene.id,
        active: scene.active,
        name: TextEditor.truncateText(scene.navName || scene.name, {maxLength: 32}),
        tooltip: scene.navName && game.user.isGM ? scene.name : null,
        users: game.users.reduce((arr, u) => {
          if ( u.active && ( u.viewedScene === scene.id) ) arr.push({letter: u.name[0], color: u.color});
          return arr;
        }, []),
        visible: game.user.isGM || scene.isOwner || scene.active,
        css: [
          scene.isView ? "view" : null,
          scene.active ? "active" : null,
          scene.ownership.default === 0 ? "gm" : null
        ].filterJoin(" ")
      };
    });
    return {collapsed: this._collapsed, scenes: scenes};
  }

  /* -------------------------------------------- */

  /**
   * A hook event that fires when the SceneNavigation menu is expanded or collapsed.
   * @function collapseSceneNavigation
   * @memberof hookEvents
   * @param {SceneNavigation} sceneNavigation The SceneNavigation application
   * @param {boolean} collapsed               Whether the SceneNavigation is now collapsed or not
   */

  /* -------------------------------------------- */

  /**
   * Expand the SceneNavigation menu, sliding it down if it is currently collapsed
   */
  expand() {
    if ( !this._collapsed ) return true;
    const nav = this.element;
    const icon = nav.find("#nav-toggle i.fas");
    const ul = nav.children("#scene-list");
    return new Promise(resolve => {
      ul.slideDown(200, () => {
        nav.removeClass("collapsed");
        icon.removeClass("fa-caret-down").addClass("fa-caret-up");
        this._collapsed = false;
        Hooks.callAll("collapseSceneNavigation", this, this._collapsed);
        return resolve(true);
      });
    });
  }

  /* -------------------------------------------- */

  /**
   * Collapse the SceneNavigation menu, sliding it up if it is currently expanded
   * @returns {Promise<boolean>}
   */
  async collapse() {
    if ( this._collapsed ) return true;
    const nav = this.element;
    const icon = nav.find("#nav-toggle i.fas");
    const ul = nav.children("#scene-list");
    return new Promise(resolve => {
      ul.slideUp(200, () => {
        nav.addClass("collapsed");
        icon.removeClass("fa-caret-up").addClass("fa-caret-down");
        this._collapsed = true;
        Hooks.callAll("collapseSceneNavigation", this, this._collapsed);
        return resolve(true);
      });
    });
  }

  /* -------------------------------------------- */
  /*  Event Listeners and Handlers
  /* -------------------------------------------- */

  /** @inheritdoc */
  activateListeners(html) {
    super.activateListeners(html);

    // Click event listener
    const scenes = html.find(".scene");
    scenes.click(this._onClickScene.bind(this));
    html.find("#nav-toggle").click(this._onToggleNav.bind(this));

    // Activate Context Menu
    const contextOptions = this._getContextMenuOptions();
    Hooks.call("getSceneNavigationContext", html, contextOptions);
    if ( contextOptions ) new ContextMenu(html, ".scene", contextOptions);
  }

  /* -------------------------------------------- */

  /**
   * Get the set of ContextMenu options which should be applied for Scenes in the menu
   * @returns {object[]}   The Array of context options passed to the ContextMenu instance
   * @private
   */
  _getContextMenuOptions() {
    return [
      {
        name: "SCENES.Activate",
        icon: '<i class="fas fa-bullseye"></i>',
        condition: li => game.user.isGM && !game.scenes.get(li.data("sceneId")).active,
        callback: li => {
          let scene = game.scenes.get(li.data("sceneId"));
          scene.activate();
        }
      },
      {
        name: "SCENES.Configure",
        icon: '<i class="fas fa-cogs"></i>',
        condition: game.user.isGM,
        callback: li => {
          let scene = game.scenes.get(li.data("sceneId"));
          scene.sheet.render(true);
        }
      },
      {
        name: "SCENES.Notes",
        icon: '<i class="fas fa-scroll"></i>',
        condition: li => {
          if ( !game.user.isGM ) return false;
          const scene = game.scenes.get(li.data("sceneId"));
          return !!scene.journal;
        },
        callback: li => {
          const scene = game.scenes.get(li.data("sceneId"));
          const entry = scene.journal;
          if ( entry ) {
            const sheet = entry.sheet;
            const options = {};
            if ( scene.journalEntryPage ) options.pageId = scene.journalEntryPage;
            sheet.render(true, options);
          }
        }
      },
      {
        name: "SCENES.Preload",
        icon: '<i class="fas fa-download"></i>',
        condition: game.user.isGM,
        callback: li => {
          let sceneId = li.attr("data-scene-id");
          game.scenes.preload(sceneId, true);
        }
      },
      {
        name: "SCENES.ToggleNav",
        icon: '<i class="fas fa-compass"></i>',
        condition: li => {
          const scene = game.scenes.get(li.data("sceneId"));
          return game.user.isGM && (!scene.active);
        },
        callback: li => {
          const scene = game.scenes.get(li.data("sceneId"));
          scene.update({navigation: !scene.navigation});
        }
      }
    ];
  }

  /* -------------------------------------------- */

  /**
   * Handle left-click events on the scenes in the navigation menu
   * @param {PointerEvent} event
   * @private
   */
  _onClickScene(event) {
    event.preventDefault();
    let sceneId = event.currentTarget.dataset.sceneId;
    game.scenes.get(sceneId).view();
  }

  /* -------------------------------------------- */

  /** @override */
  _onDragStart(event) {
    const sceneId = event.currentTarget.dataset.sceneId;
    const scene = game.scenes.get(sceneId);
    event.dataTransfer.setData("text/plain", JSON.stringify(scene.toDragData()));
  }

  /* -------------------------------------------- */

  /** @override */
  async _onDrop(event) {
    const data = TextEditor.getDragEventData(event);
    if ( data.type !== "Scene" ) return;

    // Identify the document, the drop target, and the set of siblings
    const scene = await Scene.implementation.fromDropData(data);
    const dropTarget = event.target.closest(".scene") || null;
    const sibling = dropTarget ? game.scenes.get(dropTarget.dataset.sceneId) : null;
    if ( sibling && (sibling.id === scene.id) ) return;
    const siblings = this.scenes.filter(s => s.id !== scene.id);

    // Update the navigation sorting for each Scene
    return scene.sortRelative({
      target: sibling,
      siblings: siblings,
      sortKey: "navOrder"
    });
  }

  /* -------------------------------------------- */

  /**
   * Handle navigation menu toggle click events
   * @param {Event} event
   * @private
   */
  _onToggleNav(event) {
    event.preventDefault();
    if ( this._collapsed ) return this.expand();
    else return this.collapse();
  }

  /* -------------------------------------------- */

  /**
   * Display progress of some major operation like loading Scene textures.
   * @param {object} options    Options for how the progress bar is displayed
   * @param {string} options.label  A text label to display
   * @param {number} options.pct    A percentage of progress between 0 and 100
   */
  static displayProgressBar({label, pct} = {}) {
    const loader = document.getElementById("loading");
    pct = Math.clamped(pct, 0, 100);
    loader.querySelector("#context").textContent = label;
    loader.querySelector("#loading-bar").style.width = `${pct}%`;
    loader.querySelector("#progress").textContent = `${pct}%`;
    loader.style.display = "block";
    if ( (pct === 100) && !loader.hidden ) $(loader).fadeOut(2000);
  }
}
