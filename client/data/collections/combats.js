/**
 * The singleton collection of Combat documents which exist within the active World.
 * This Collection is accessible within the Game object as game.combats.
 * @extends {WorldCollection}
 *
 * @see {@link Combat} The Combat document
 * @see {@link CombatTracker} The CombatTracker sidebar directory
 */
class CombatEncounters extends WorldCollection {

  /** @override */
  static documentName = "Combat";

  /* -------------------------------------------- */

  /**
   * Provide the settings object which configures the Combat document
   * @type {object}
   */
  static get settings() {
    return game.settings.get("core", Combat.CONFIG_SETTING);
  }

  /* -------------------------------------------- */

  /** @inheritdoc */
  get directory() {
    return ui.combat;
  }

  /* -------------------------------------------- */

  /**
   * Get an Array of Combat instances which apply to the current canvas scene
   * @type {Combat[]}
   */
  get combats() {
    return this.filter(c => (c.scene === null) || (c.scene === game.scenes.current));
  }

  /* -------------------------------------------- */

  /**
   * The currently active Combat instance
   * @type {Combat}
   */
  get active() {
    return this.combats.find(c => c.active);
  }

  /* -------------------------------------------- */

  /**
   * The currently viewed Combat encounter
   * @type {Combat|null}
   */
  get viewed() {
    return ui.combat?.viewed ?? null;
  }

  /* -------------------------------------------- */

  /**
   * When a Token is deleted, remove it as a combatant from any combat encounters which included the Token
   * @param {string} sceneId      The Scene id within which a Token is being deleted
   * @param {string} tokenId      The Token id being deleted
   * @protected
   */
  async _onDeleteToken(sceneId, tokenId) {
    for ( let combat of this ) {
      const toDelete = [];
      for ( let c of combat.combatants ) {
        if ( (c.sceneId === sceneId) && (c.tokenId === tokenId) ) toDelete.push(c.id);
      }
      if ( toDelete.length ) await combat.deleteEmbeddedDocuments("Combatant", toDelete);
    }
  }
}
