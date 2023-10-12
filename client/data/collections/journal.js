/**
 * The singleton collection of JournalEntry documents which exist within the active World.
 * This Collection is accessible within the Game object as game.journal.
 * @extends {WorldCollection}
 *
 * @see {@link JournalEntry} The JournalEntry document
 * @see {@link JournalDirectory} The JournalDirectory sidebar directory
 */
class Journal extends WorldCollection {

  /** @override */
  static documentName = "JournalEntry";

  /* -------------------------------------------- */
  /*  Interaction Dialogs                         */
  /* -------------------------------------------- */

  /**
   * Display a dialog which prompts the user to show a JournalEntry or JournalEntryPage to other players.
   * @param {JournalEntry|JournalEntryPage} doc  The JournalEntry or JournalEntryPage to show.
   * @returns {Promise<JournalEntry|JournalEntryPage|void>}
   */
  static async showDialog(doc) {
    if ( !((doc instanceof JournalEntry) || (doc instanceof JournalEntryPage)) ) return;
    if ( !doc.isOwner ) return ui.notifications.error("JOURNAL.ShowBadPermissions", {localize: true});
    if ( game.users.size < 2 ) return ui.notifications.warn("JOURNAL.ShowNoPlayers", {localize: true});

    const users = game.users.filter(u => u.id !== game.userId);
    const ownership = Object.entries(CONST.DOCUMENT_OWNERSHIP_LEVELS);
    if ( !doc.isEmbedded ) ownership.shift();
    const levels = [
      {level: CONST.DOCUMENT_META_OWNERSHIP_LEVELS.NOCHANGE, label: "OWNERSHIP.NOCHANGE"},
      ...ownership.map(([name, level]) => ({level, label: `OWNERSHIP.${name}`}))
    ];
    const isImage = (doc instanceof JournalEntryPage) && (doc.type === "image");
    const html = await renderTemplate("templates/journal/dialog-show.html", {users, levels, isImage});

    return Dialog.prompt({
      title: game.i18n.format("JOURNAL.ShowEntry", {name: doc.name}),
      label: game.i18n.localize("JOURNAL.ActionShow"),
      content: html,
      render: html => {
        const form = html.querySelector("form");
        form.elements.allPlayers.addEventListener("change", event => {
          const checked = event.currentTarget.checked;
          form.querySelectorAll('[name="players"]').forEach(i => {
            i.checked = checked;
            i.disabled = checked;
          });
        });
      },
      callback: async html => {
        const form = html.querySelector("form");
        const fd = new FormDataExtended(form).object;
        const users = fd.allPlayers ? game.users.filter(u => !u.isSelf) : fd.players.reduce((arr, id) => {
          const u = game.users.get(id);
          if ( u && !u.isSelf ) arr.push(u);
          return arr;
        }, []);
        if ( !users.length ) return;
        const userIds = users.map(u => u.id);
        if ( fd.ownership > -2 ) {
          const ownership = doc.ownership;
          if ( fd.allPlayers ) ownership.default = fd.ownership;
          for ( const id of userIds ) {
            if ( fd.allPlayers ) {
              if ( (id in ownership) && (ownership[id] <= fd.ownership) ) delete ownership[id];
              continue;
            }
            if ( ownership[id] === CONST.DOCUMENT_OWNERSHIP_LEVELS.NONE ) ownership[id] = fd.ownership;
            ownership[id] = Math.max(ownership[id] ?? -Infinity, fd.ownership);
          }
          await doc.update({ownership}, {diff: false, recursive: false, noHook: true});
        }
        if ( fd.imageOnly ) return this.showImage(doc.src, {
          users: userIds,
          title: doc.name,
          caption: fd.showImageCaption ? doc.image.caption : undefined,
          showTitle: fd.showImageTitle,
          uuid: doc.uuid
        });
        return this.show(doc, {force: true, users: userIds});
      },
      rejectClose: false,
      options: {jQuery: false}
    });
  }

  /* -------------------------------------------- */

  /**
   * Show the JournalEntry or JournalEntryPage to connected players.
   * By default, the document will only be shown to players who have permission to observe it.
   * If the force parameter is passed, the document will be shown to all players regardless of normal permission.
   * @param {JournalEntry|JournalEntryPage} doc  The JournalEntry or JournalEntryPage to show.
   * @param {object} [options]                   Additional options to configure behaviour.
   * @param {boolean} [options.force=false]      Display the entry to all players regardless of normal permissions.
   * @param {string[]} [options.users]           An optional list of user IDs to show the document to. Otherwise it will
   *                                             be shown to all connected clients.
   * @returns {Promise<JournalEntry|JournalEntryPage>}  A Promise that resolves back to the shown document once the
   *                                                    request is processed.
   * @throws If the user does not own the document they are trying to show.
   */
  static show(doc, {force=false, users=[]}={}) {
    if ( !((doc instanceof JournalEntry) || (doc instanceof JournalEntryPage)) ) return;
    if ( !doc.isOwner ) throw new Error(game.i18n.localize("JOURNAL.ShowBadPermissions"));
    const strings = Object.fromEntries(["all", "authorized", "selected"].map(k => [k, game.i18n.localize(k)]));
    return new Promise(resolve => {
      game.socket.emit("showEntry", doc.uuid, {force, users}, () => {
        Journal._showEntry(doc.uuid, force);
        ui.notifications.info(game.i18n.format("JOURNAL.ActionShowSuccess", {
          title: doc.name,
          which: users.length ? strings.selected : force ? strings.all : strings.authorized
        }));
        return resolve(doc);
      });
    });
  }

  /* -------------------------------------------- */

  /**
   * Share an image with connected players.
   * @param {string} src                 The image URL to share.
   * @param {ShareImageConfig} [config]  Image sharing configuration.
   */
  static showImage(src, {users=[], ...options}={}) {
    game.socket.emit("shareImage", {image: src, users, ...options});
    const strings = Object.fromEntries(["all", "selected"].map(k => [k, game.i18n.localize(k)]));
    ui.notifications.info(game.i18n.format("JOURNAL.ImageShowSuccess", {
      which: users.length ? strings.selected : strings.all
    }));
  }

  /* -------------------------------------------- */
  /*  Socket Listeners and Handlers               */
  /* -------------------------------------------- */

  /**
   * Open Socket listeners which transact JournalEntry data
   * @param {Socket} socket       The open websocket
   */
  static _activateSocketListeners(socket) {
    socket.on("showEntry", this._showEntry.bind(this));
    socket.on("shareImage", ImagePopout._handleShareImage);
  }

  /* -------------------------------------------- */

  /**
   * Handle a received request to show a JournalEntry or JournalEntryPage to the current client
   * @param {string} uuid            The UUID of the document to display for other players
   * @param {boolean} [force=false]  Display the document regardless of normal permissions
   * @internal
   */
  static async _showEntry(uuid, force=false) {
    let entry = await fromUuid(uuid);
    const options = {tempOwnership: force, mode: JournalSheet.VIEW_MODES.MULTIPLE, pageIndex: 0};
    if ( entry instanceof JournalEntryPage ) {
      options.mode = JournalSheet.VIEW_MODES.SINGLE;
      options.pageId = entry.id;
      // Set temporary observer permissions for this page.
      if ( entry.getUserLevel(game.user) < CONST.DOCUMENT_OWNERSHIP_LEVELS.OBSERVER ) {
        entry.ownership[game.userId] = CONST.DOCUMENT_OWNERSHIP_LEVELS.OBSERVER;
      }
      entry = entry.parent;
    }
    else if ( entry instanceof JournalEntry ) entry.ownership[game.userId] = CONST.DOCUMENT_OWNERSHIP_LEVELS.OBSERVER;
    else return;
    if ( !force && !entry.visible ) return;

    // Show the sheet with the appropriate mode
    entry.sheet.render(true, options);
  }
}
