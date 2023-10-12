/**
 * The client-side Combatant document which extends the common BaseCombatant model.
 *
 * @extends documents.BaseCombatant
 * @mixes ClientDocumentMixin
 *
 * @see {@link Combat}                  The Combat document which contains Combatant embedded documents
 * @see {@link CombatantConfig}         The application which configures a Combatant.
 */
class Combatant extends ClientDocumentMixin(foundry.documents.BaseCombatant) {

  /**
   * The token video source image (if any)
   * @type {string|null}
   * @internal
   */
  _videoSrc = null;

  /**
   * The current value of the special tracked resource which pertains to this Combatant
   * @type {object|null}
   */
  resource = null;

  /* -------------------------------------------- */
  /*  Properties                                  */
  /* -------------------------------------------- */

  /**
   * A convenience alias of Combatant#parent which is more semantically intuitive
   * @type {Combat|null}
   */
  get combat() {
    return this.parent;
  }

  /* -------------------------------------------- */

  /**
   * This is treated as a non-player combatant if it has no associated actor and no player users who can control it
   * @type {boolean}
   */
  get isNPC() {
    return !this.actor || !this.hasPlayerOwner;
  }

  /* -------------------------------------------- */

  /** @override */
  get visible() {
    return this.isOwner || !this.hidden;
  }

  /* -------------------------------------------- */

  /**
   * A reference to the Actor document which this Combatant represents, if any
   * @type {Actor|null}
   */
  get actor() {
    if ( this.token ) return this.token.actor;
    return game.actors.get(this.actorId) || null;
  }

  /* -------------------------------------------- */

  /**
   * A reference to the Token document which this Combatant represents, if any
   * @type {TokenDocument|null}
   */
  get token() {
    const scene = this.sceneId ? game.scenes.get(this.sceneId) : this.parent?.scene;
    return scene?.tokens.get(this.tokenId) || null;
  }

  /* -------------------------------------------- */

  /**
   * An array of non-Gamemaster Users who have ownership of this Combatant.
   * @type {User[]}
   */
  get players() {
    return game.users.filter(u => !u.isGM && this.testUserPermission(u, "OWNER"));
  }

  /* -------------------------------------------- */

  /**
   * Has this combatant been marked as defeated?
   * @type {boolean}
   */
  get isDefeated() {
    return this.defeated || !!this.actor?.statuses.has(CONFIG.specialStatusEffects.DEFEATED);
  }

  /* -------------------------------------------- */
  /*  Methods                                     */
  /* -------------------------------------------- */

  /** @inheritdoc */
  testUserPermission(user, permission, {exact=false}={}) {
    if ( user.isGM ) return true;
    return this.actor?.canUserModify(user, "update") || false;
  }

  /* -------------------------------------------- */

  /**
   * Get a Roll object which represents the initiative roll for this Combatant.
   * @param {string} formula        An explicit Roll formula to use for the combatant.
   * @returns {Roll}                The unevaluated Roll instance to use for the combatant.
   */
  getInitiativeRoll(formula) {
    formula = formula || this._getInitiativeFormula();
    const rollData = this.actor?.getRollData() || {};
    return Roll.create(formula, rollData);
  }

  /* -------------------------------------------- */

  /**
   * Roll initiative for this particular combatant.
   * @param {string} [formula]      A dice formula which overrides the default for this Combatant.
   * @returns {Promise<Combatant>}  The updated Combatant.
   */
  async rollInitiative(formula) {
    const roll = this.getInitiativeRoll(formula);
    await roll.evaluate({async: true});
    return this.update({initiative: roll.total});
  }

  /* -------------------------------------------- */

  /** @override */
  prepareDerivedData() {
    // Check for video source and save it if present
    this._videoSrc = VideoHelper.hasVideoExtension(this.token?.texture.src) ? this.token.texture.src : null;

    // Assign image for combatant (undefined if the token src image is a video)
    this.img ||= (this._videoSrc ? undefined : (this.token?.texture.src || this.actor?.img));
    this.name ||= this.token?.name || this.actor?.name || game.i18n.localize("COMBAT.UnknownCombatant");

    this.updateResource();
  }

  /* -------------------------------------------- */

  /**
   * Update the value of the tracked resource for this Combatant.
   * @returns {null|object}
   */
  updateResource() {
    if ( !this.actor || !this.combat ) return this.resource = null;
    return this.resource = foundry.utils.getProperty(this.actor.system, this.parent.settings.resource) || null;
  }

  /* -------------------------------------------- */

  /**
   * Acquire the default dice formula which should be used to roll initiative for this combatant.
   * Modules or systems could choose to override or extend this to accommodate special situations.
   * @returns {string}               The initiative formula to use for this combatant.
   * @protected
   */
  _getInitiativeFormula() {
    return String(CONFIG.Combat.initiative.formula || game.system.initiative);
  }
}
