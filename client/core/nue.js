/**
 * Responsible for managing the New User Experience workflows.
 */
class NewUserExperience {
  constructor() {
    Hooks.on("renderChatMessage", this._activateListeners.bind(this));
  }

  /* -------------------------------------------- */

  /**
   * Initialize the new user experience.
   * Currently, this generates some chat messages with hints for getting started if we detect this is a new world.
   */
  initialize() {
    // If there are no documents, we can reasonably assume this is a new World.
    const isNewWorld = !(game.actors.size + game.scenes.size + game.items.size + game.journal.size);

    if ( !isNewWorld ) return;
    this._createInitialChatMessages();
    // noinspection JSIgnoredPromiseFromCall
    this._showNewWorldTour();
  }

  /* -------------------------------------------- */

  /**
   * Show chat tips for first launch.
   * @private
   */
  _createInitialChatMessages() {
    if ( game.settings.get("core", "nue.shownTips") ) return;

    // Get GM's
    const gms = ChatMessage.getWhisperRecipients("GM");

    // Build Chat Messages
    const content = [`
      <h3 class="nue">${game.i18n.localize("NUE.FirstLaunchHeader")}</h3>
      <p class="nue">${game.i18n.localize("NUE.FirstLaunchBody")}</p>
      <p class="nue">${game.i18n.localize("NUE.FirstLaunchKB")}</p>
      <footer class="nue">${game.i18n.localize("NUE.FirstLaunchHint")}</footer>
    `, `
      <h3 class="nue">${game.i18n.localize("NUE.FirstLaunchInvite")}</h3>
      <p class="nue">${game.i18n.localize("NUE.FirstLaunchInviteBody")}</p>
      <p class="nue">${game.i18n.localize("NUE.FirstLaunchTroubleshooting")}</p>
      <footer class="nue">${game.i18n.localize("NUE.FirstLaunchHint")}</footer>
    `];
    const chatData = content.map(c => {
      return {
        whisper: gms,
        speaker: {alias: game.i18n.localize("Foundry Virtual Tabletop")},
        flags: {core: {nue: true, canPopout: true}},
        content: c
      };
    });
    ChatMessage.implementation.createDocuments(chatData);

    // Store flag indicating this was shown
    game.settings.set("core", "nue.shownTips", true);
  }

  /* -------------------------------------------- */

  /**
   * Create a default scene for the new world.
   * @private
   */
  async _createDefaultScene() {
    if ( !game.user.isGM ) return;
    const filePath = foundry.utils.getRoute("/nue/defaultscene/scene.json");
    const response = await fetchWithTimeout(filePath, {
      method: "GET",
    });
    const json = await response.json();
    const scene = await Scene.create(json);
    await scene.activate();
    canvas.animatePan({scale: 0.7, duration: 100});
  }

  /* -------------------------------------------- */

  /**
   * Automatically show uncompleted Tours related to new worlds.
   * @private
   */
  async _showNewWorldTour() {
    const tour = game.tours.get("core.welcome");
    if ( tour?.status === Tour.STATUS.UNSTARTED ) {
      await this._createDefaultScene();
      tour.start();
    }
  }

  /* -------------------------------------------- */

  /**
   * Add event listeners to the chat card links.
   * @param {ChatMessage} msg  The ChatMessage being rendered.
   * @param {jQuery} html      The HTML content of the message.
   * @private
   */
  _activateListeners(msg, html) {
    if ( !msg.getFlag("core", "nue") ) return;
    html.find(".nue-tab").click(this._onTabLink.bind(this));
    html.find(".nue-action").click(this._onActionLink.bind(this));
  }

  /* -------------------------------------------- */

  /**
   * Perform some special action triggered by clicking on a link in a NUE chat card.
   * @param {TriggeredEvent} event  The click event.
   * @private
   */
  _onActionLink(event) {
    event.preventDefault();
    const action = event.currentTarget.dataset.action;
    switch ( action ) {
      case "invite": return new InvitationLinks().render(true);
    }
  }

  /* -------------------------------------------- */

  /**
   * Switch to the appropriate tab when a user clicks on a link in the chat message.
   * @param {TriggeredEvent} event  The click event.
   * @private
   */
  _onTabLink(event) {
    event.preventDefault();
    const tab = event.currentTarget.dataset.tab;
    ui.sidebar.activateTab(tab);
  }
}
