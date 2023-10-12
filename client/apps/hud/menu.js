/**
 * The main menu application which is toggled via the ESC key.
 * @extends {Application}
 */
class MainMenu extends Application {

  /** @inheritdoc */
  static get defaultOptions() {
    return foundry.utils.mergeObject(super.defaultOptions, {
      id: "menu",
      template: "templates/hud/menu.html",
      popOut: false
    });
  }

  /* ----------------------------------------- */

  /**
   * The structure of menu items
   * @returns {Object<{label: string, icon: string, enabled: boolean, onClick: Function}>}
   */
  get items() {
    return {
      reload: {
        label: "MENU.Reload",
        icon: '<i class="fas fa-redo"></i>',
        enabled: true,
        onClick: () => window.location.reload()
      },
      logout: {
        label: "MENU.Logout",
        icon: '<i class="fas fa-user"></i>',
        enabled: true,
        onClick: () => game.logOut()
      },
      players: {
        label: "MENU.Players",
        icon: '<i class="fas fa-users"></i>',
        enabled: game.user.isGM && !game.data.demoMode,
        onClick: () => window.location.href = "./players"
      },
      world: {
        label: "GAME.ReturnSetup",
        icon: '<i class="fas fa-globe"></i>',
        enabled: game.user.hasRole("GAMEMASTER") && !game.data.demoMode,
        onClick: () => {
          this.close();
          game.shutDown();
        }
      }
    };
  }

  /* -------------------------------------------- */

  /** @inheritdoc */
  getData(options={}) {
    return {
      items: this.items
    };
  }

  /* ----------------------------------------- */

  /** @inheritdoc */
  activateListeners(html) {
    for ( let [k, v] of Object.entries(this.items) ) {
      html.find(`.menu-${k}`).click(v.onClick);
    }
  }

  /* ----------------------------------------- */

  /**
   * Toggle display of the menu (or render it in the first place)
   */
  toggle() {
    let menu = this.element;
    if ( !this.rendered ) this.render(true);
    else menu.slideToggle(150);
  }
}
