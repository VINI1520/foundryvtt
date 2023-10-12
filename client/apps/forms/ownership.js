/**
 * A generic application for configuring permissions for various Document types
 * @extends {DocumentSheet}
 */
class DocumentOwnershipConfig extends DocumentSheet {

  /** @override */
  static get defaultOptions() {
    return foundry.utils.mergeObject(super.defaultOptions, {
      id: "permission",
      template: "templates/apps/ownership.html",
      width: 400
    });
  }

  /* -------------------------------------------- */

  /** @override */
  get title() {
    return `${game.i18n.localize("OWNERSHIP.Title")}: ${this.document.name}`;
  }

  /* -------------------------------------------- */

  /** @override */
  getData(options={}) {
    const isFolder = this.document instanceof Folder;
    const isEmbedded = this.document.isEmbedded;
    const ownership = this.document.ownership;
    if ( !ownership && !isFolder ) {
      throw new Error(`The ${this.document.documentName} document does not contain ownership data`);
    }

    // User permission levels
    const playerLevels = Object.entries(CONST.DOCUMENT_META_OWNERSHIP_LEVELS).map(([name, level]) => {
      return {level, label: game.i18n.localize(`OWNERSHIP.${name}`)};
    });

    if ( !isFolder ) playerLevels.pop();
    for ( let [name, level] of Object.entries(CONST.DOCUMENT_OWNERSHIP_LEVELS) ) {
      if ( (level < 0) && !isEmbedded ) continue;
      playerLevels.push({level, label: game.i18n.localize(`OWNERSHIP.${name}`)});
    }

    // Default permission levels
    const defaultLevels = foundry.utils.deepClone(playerLevels);
    defaultLevels.shift();

    // Player users
    const users = game.users.map(user => {
      return {
        user,
        level: isFolder ? CONST.DOCUMENT_META_OWNERSHIP_LEVELS.NOCHANGE : ownership[user.id],
        isAuthor: this.document.author === user
      };
    });

    // Construct and return the data object
    return {
      currentDefault: ownership?.default ?? playerLevels[0],
      instructions: game.i18n.localize(isFolder ? "OWNERSHIP.HintFolder" : "OWNERSHIP.HintDocument"),
      defaultLevels,
      playerLevels,
      isFolder,
      users
    };
  }

  /* -------------------------------------------- */

  /** @override */
  async _updateObject(event, formData) {
    event.preventDefault();
    if ( !game.user.isGM ) throw new Error("You do not have the ability to configure permissions.");
    // Collect new ownership levels from the form data
    const metaLevels = CONST.DOCUMENT_META_OWNERSHIP_LEVELS;
    const isFolder = this.document instanceof Folder;
    const omit = isFolder ? metaLevels.NOCHANGE : metaLevels.DEFAULT;
    const ownershipLevels = {};
    for ( let [user, level] of Object.entries(formData) ) {
      if ( level === omit ) {
        delete ownershipLevels[user];
        continue;
      }
      ownershipLevels[user] = level;
    }

    // Update all documents in a Folder
    if ( this.document instanceof Folder ) {
      const cls = getDocumentClass(this.document.type);
      const updates = this.document.contents.map(d => {
        const ownership = foundry.utils.deepClone(d.ownership);
        for ( let [k, v] of Object.entries(ownershipLevels) ) {
          if ( v === metaLevels.DEFAULT ) delete ownership[k];
          else ownership[k] = v;
        }
        return {_id: d.id, ownership};
      });
      return cls.updateDocuments(updates, {diff: false, recursive: false, noHook: true});
    }

    // Update a single Document
    return this.document.update({ownership: ownershipLevels}, {diff: false, recursive: false, noHook: true});
  }
}

/**
 * @deprecated since v10
 * @ignore
 */
class PermissionControl extends DocumentOwnershipConfig {
  constructor(...args) {
    super(...args);
    foundry.utils.logCompatibilityWarning("You are constructing the PermissionControl class which has been renamed " +
      "to DocumentOwnershipConfig", {since: 10, until: 12});
  }
}
