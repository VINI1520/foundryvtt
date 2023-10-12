/**
 * The client-side Actor document which extends the common BaseActor model.
 *
 * @extends foundry.documents.BaseActor
 * @mixes ClientDocumentMixin
 * @category - Documents
 *
 * @see {@link documents.Actors}            The world-level collection of Actor documents
 * @see {@link applications.ActorSheet}     The Actor configuration application
 *
 * @example Create a new Actor
 * ```js
 * let actor = await Actor.create({
 *   name: "New Test Actor",
 *   type: "character",
 *   img: "artwork/character-profile.jpg"
 * });
 * ```
 *
 * @example Retrieve an existing Actor
 * ```js
 * let actor = game.actors.get(actorId);
 * ```
 */
class Actor extends ClientDocumentMixin(foundry.documents.BaseActor) {

  /**
   * An object that tracks which tracks the changes to the data model which were applied by active effects
   * @type {object}
   */
  overrides = {};

  /**
   * A cached array of image paths which can be used for this Actor's token.
   * Null if the list has not yet been populated.
   * @type {string[]|null}
   * @private
   */
  _tokenImages = null;

  /**
   * Cache the last drawn wildcard token to avoid repeat draws
   * @type {string|null}
   */
  _lastWildcard = null;

  /* -------------------------------------------- */
  /*  Properties                                  */
  /* -------------------------------------------- */

  /**
   * Provide a thumbnail image path used to represent this document.
   * @type {string}
   */
  get thumbnail() {
    return this.img;
  }

  /* -------------------------------------------- */

  /**
   * Provide an object which organizes all embedded Item instances by their type
   * @type {Object<Item[]>}
   */
  get itemTypes() {
    const types = Object.fromEntries(game.documentTypes.Item.map(t => [t, []]));
    for ( const item of this.items.values() ) {
      types[item.type].push(item);
    }
    return types;
  }

  /* -------------------------------------------- */

  /**
   * Test whether an Actor document is a synthetic representation of a Token (if true) or a full Document (if false)
   * @type {boolean}
   */
  get isToken() {
    if ( !this.parent ) return false;
    return this.parent instanceof TokenDocument;
  }

  /* -------------------------------------------- */

  /**
   * An array of ActiveEffect instances which are present on the Actor which have a limited duration.
   * @type {ActiveEffect[]}
   */
  get temporaryEffects() {
    return this.effects.filter(e => e.isTemporary && !e.disabled);
  }

  /* -------------------------------------------- */

  /**
   * Return a reference to the TokenDocument which owns this Actor as a synthetic override
   * @type {TokenDocument|null}
   */
  get token() {
    return this.parent instanceof TokenDocument ? this.parent : null;
  }

  /* -------------------------------------------- */

  /** @inheritdoc */
  get uuid() {
    if ( this.isToken ) return this.token.uuid;
    return super.uuid;
  }

  /* -------------------------------------------- */

  /**
   * Request wildcard token images from the server and return them.
   * @param {string} actorId         The actor whose prototype token contains the wildcard image path.
   * @param {object} [options]
   * @param {string} [options.pack]  The name of the compendium the actor is in.
   * @returns {Promise<string[]>}    The list of filenames to token images that match the wildcard search.
   * @private
   */
  static _requestTokenImages(actorId, options={}) {
    return new Promise((resolve, reject) => {
      game.socket.emit("requestTokenImages", actorId, options, result => {
        if ( result.error ) return reject(new Error(result.error));
        resolve(result.files);
      });
    });
  }

  /* -------------------------------------------- */
  /*  Methods                                     */
  /* -------------------------------------------- */

  /**
   * Apply any transformations to the Actor data which are caused by ActiveEffects.
   */
  applyActiveEffects() {
    const overrides = {};

    // Organize non-disabled effects by their application priority
    const changes = this.effects.reduce((changes, e) => {
      if ( e.disabled || e.isSuppressed ) return changes;
      return changes.concat(e.changes.map(c => {
        c = foundry.utils.duplicate(c);
        c.effect = e;
        c.priority = c.priority ?? (c.mode * 10);
        return c;
      }));
    }, []);
    changes.sort((a, b) => a.priority - b.priority);

    // Apply all changes
    for ( let change of changes ) {
      if ( !change.key ) continue;
      const changes = change.effect.apply(this, change);
      Object.assign(overrides, changes);
    }

    // Expand the set of final overrides
    this.overrides = foundry.utils.expandObject(overrides);
  }

  /* -------------------------------------------- */

  /**
   * Retrieve an Array of active tokens which represent this Actor in the current canvas Scene.
   * If the canvas is not currently active, or there are no linked actors, the returned Array will be empty.
   * If the Actor is a synthetic token actor, only the exact Token which it represents will be returned.
   *
   * @param {boolean} [linked=false]    Limit results to Tokens which are linked to the Actor. Otherwise, return all
   *                                    Tokens even those which are not linked.
   * @param {boolean} [document=false]  Return the Document instance rather than the PlaceableObject
   * @returns {Token[]}                 An array of Token instances in the current Scene which reference this Actor.
   */
  getActiveTokens(linked=false, document=false) {
    if ( !canvas.ready ) return [];

    // Synthetic token actors are, themselves, active tokens
    if ( this.isToken ) {
      if ( this.token.parent !== canvas.scene ) return [];
      return document ? [this.token] : [this.token.object];
    }

    // Otherwise, find tokens within the current scene
    const tokens = [];
    for ( let t of canvas.scene.tokens ) {
      if ( t.actorId !== this.id ) continue;
      if ( !linked || t.actorLink ) tokens.push(document ? t : t.object);
    }
    return tokens;
  }

  /* -------------------------------------------- */

  /**
   * Prepare a data object which defines the data schema used by dice roll commands against this Actor
   * @returns {object}
   */
  getRollData() {
    return this.system;
  }

  /* -------------------------------------------- */

  /**
   * Create a new Token document, not yet saved to the database, which represents the Actor.
   * @param {object} [data={}]            Additional data, such as x, y, rotation, etc. for the created token data
   * @returns {Promise<TokenDocument>}    The created TokenDocument instance
   */
  async getTokenDocument(data={}) {
    const tokenData = this.prototypeToken.toObject();
    tokenData.actorId = this.id;

    if ( tokenData.randomImg && !data.texture?.src ) {
      let images = await this.getTokenImages();
      if ( (images.length > 1) && this._lastWildcard ) {
        images = images.filter(i => i !== this._lastWildcard);
      }
      const image = images[Math.floor(Math.random() * images.length)];
      tokenData.texture.src = this._lastWildcard = image;
    }
    foundry.utils.mergeObject(tokenData, data);
    const cls = getDocumentClass("Token");
    return new cls(tokenData, {actor: this});
  }

  /* -------------------------------------------- */

  /**
   * Get an Array of Token images which could represent this Actor
   * @returns {Promise<string[]>}
   */
  async getTokenImages() {
    if ( !this.prototypeToken.randomImg ) return [this.prototypeToken.texture.src];
    if ( this._tokenImages ) return this._tokenImages;
    try {
      this._tokenImages = await this.constructor._requestTokenImages(this.id, {pack: this.pack});
    } catch(err) {
      this._tokenImages = [];
      Hooks.onError("Actor#getTokenImages", err, {
        msg: "Error retrieving wildcard tokens",
        log: "error",
        notify: "error"
      });
    }
    return this._tokenImages;
  }

  /* -------------------------------------------- */

  /**
   * Handle how changes to a Token attribute bar are applied to the Actor.
   * This allows for game systems to override this behavior and deploy special logic.
   * @param {string} attribute    The attribute path
   * @param {number} value        The target attribute value
   * @param {boolean} isDelta     Whether the number represents a relative change (true) or an absolute change (false)
   * @param {boolean} isBar       Whether the new value is part of an attribute bar, or just a direct value
   * @returns {Promise<documents.Actor>}  The updated Actor document
   */
  async modifyTokenAttribute(attribute, value, isDelta=false, isBar=true) {
    const current = foundry.utils.getProperty(this.system, attribute);

    // Determine the updates to make to the actor data
    let updates;
    if ( isBar ) {
      if (isDelta) value = Math.clamped(0, Number(current.value) + value, current.max);
      updates = {[`system.${attribute}.value`]: value};
    } else {
      if ( isDelta ) value = Number(current) + value;
      updates = {[`system.${attribute}`]: value};
    }

    /**
     * A hook event that fires when a token's resource bar attribute has been modified.
     * @function modifyTokenAttribute
     * @memberof hookEvents
     * @param {object} data           An object describing the modification
     * @param {string} data.attribute The attribute path
     * @param {number} data.value     The target attribute value
     * @param {boolean} data.isDelta  Does number represents a relative change (true) or an absolute change (false)
     * @param {boolean} data.isBar    Whether the new value is part of an attribute bar, or just a direct value
     * @param {objects} updates       The update delta that will be applied to the Token's actor
     */
    const allowed = Hooks.call("modifyTokenAttribute", {attribute, value, isDelta, isBar}, updates);
    return allowed !== false ? this.update(updates) : this;
  }

  /* -------------------------------------------- */

  /** @inheritdoc */
  prepareEmbeddedDocuments() {
    super.prepareEmbeddedDocuments();
    this.applyActiveEffects();
  }

  /* -------------------------------------------- */

  /**
   * Roll initiative for all Combatants in the currently active Combat encounter which are associated with this Actor.
   * If viewing a full Actor document, all Tokens which map to that actor will be targeted for initiative rolls.
   * If viewing a synthetic Token actor, only that particular Token will be targeted for an initiative roll.
   *
   * @param {object} options                          Configuration for how initiative for this Actor is rolled.
   * @param {boolean} [options.createCombatants=false]    Create new Combatant entries for Tokens associated with
   *                                                      this actor.
   * @param {boolean} [options.rerollInitiative=false]    Re-roll the initiative for this Actor if it has already
   *                                                      been rolled.
   * @param {object} [options.initiativeOptions={}]       Additional options passed to the Combat#rollInitiative method.
   * @returns {Promise<documents.Combat|null>}        A promise which resolves to the Combat document once rolls
   *                                                  are complete.
   */
  async rollInitiative({createCombatants=false, rerollInitiative=false, initiativeOptions={}}={}) {

    // Obtain (or create) a combat encounter
    let combat = game.combat;
    if ( !combat ) {
      if ( game.user.isGM && canvas.scene ) {
        const cls = getDocumentClass("Combat");
        combat = await cls.create({scene: canvas.scene.id, active: true});
      }
      else {
        ui.notifications.warn("COMBAT.NoneActive", {localize: true});
        return null;
      }
    }

    // Create new combatants
    if ( createCombatants ) {
      const tokens = this.getActiveTokens();
      const toCreate = [];
      if ( tokens.length ) {
        for ( let t of tokens ) {
          if ( t.inCombat ) continue;
          toCreate.push({tokenId: t.id, sceneId: t.scene.id, actorId: this.id, hidden: t.document.hidden});
        }
      } else toCreate.push({actorId: this.id, hidden: false});
      await combat.createEmbeddedDocuments("Combatant", toCreate);
    }

    // Roll initiative for combatants
    const combatants = combat.combatants.reduce((arr, c) => {
      if ( c.actor.id !== this.id ) return arr;
      if ( !rerollInitiative && (c.initiative !== null) ) return arr;
      arr.push(c.id);
      return arr;
    }, []);

    await combat.rollInitiative(combatants, initiativeOptions);
    return combat;
  }

  /* -------------------------------------------- */
  /*  Event Handlers                              */
  /* -------------------------------------------- */

  /** @inheritdoc */
  async _preCreate(data, options, userId) {
    await super._preCreate(data, options, userId);
    this._applyDefaultTokenSettings(data, options);
  }

  /* -------------------------------------------- */

  /**
   * When an Actor is being created, apply default token configuration settings to its prototype token.
   * @param {object} data         Data explicitly provided to the creation workflow
   * @param {object} options      Options which configure creation
   * @param {boolean} [options.fromCompendium]  Does this creation workflow originate via compendium import?
   * @protected
   */
  _applyDefaultTokenSettings(data, {fromCompendium=false}={}) {
    const defaults = foundry.utils.deepClone(game.settings.get("core", DefaultTokenConfig.SETTING));

    // System bar attributes
    const {primaryTokenAttribute, secondaryTokenAttribute} = game.system;
    if ( primaryTokenAttribute && !("bar1" in defaults) ) defaults.bar1 = {attribute: primaryTokenAttribute};
    if ( secondaryTokenAttribute && !("bar2" in defaults) ) defaults.bar2 = {attribute: secondaryTokenAttribute};

    // If the creation originates from a compendium, prefer default token settings
    if ( fromCompendium ) return this.updateSource({prototypeToken: defaults});

    // Otherwise, prefer explicitly provided data
    const prototypeToken = foundry.utils.mergeObject(defaults, data.prototypeToken || {});
    return this.updateSource({prototypeToken});
  }

  /* -------------------------------------------- */

  /** @override */
  _onUpdate(data, options, userId) {
    super._onUpdate(data, options, userId);

    // Update references to original state so that resetting the preview does not clobber these updates in-memory.
    Object.values(ui.windows).forEach(app => {
      if ( !(app.object instanceof foundry.data.PrototypeToken) || (app.object.parent !== this) ) return;
      app.original = this.prototypeToken.toObject();
    });

    // Get the changed attributes
    const keys = Object.keys(data).filter(k => k !== "_id");
    const changed = new Set(keys);

    // Additional options only apply to Actors which are not synthetic Tokens
    if ( this.isToken ) return;

    // If the prototype token was changed, expire any cached token images
    if ( changed.has("prototypeToken") ) this._tokenImages = null;

    // Update the active TokenDocument instances which represent this Actor
    const tokens = this.getActiveTokens(false, true);
    for ( let t of tokens ) {
      t._onUpdateBaseActor(data, options);
    }

    // If ownership changed for the actor reset token control
    if ( changed.has("permission") && tokens.length ) {
      canvas.tokens.releaseAll();
      canvas.tokens.cycleTokens(true, true);
    }
  }

  /* -------------------------------------------- */

  /** @inheritdoc */
  _onCreateEmbeddedDocuments(embeddedName, ...args) {
    super._onCreateEmbeddedDocuments(embeddedName, ...args);
    this._onEmbeddedDocumentChange(embeddedName);
  }

  /* -------------------------------------------- */

  /** @inheritdoc */
  _onUpdateEmbeddedDocuments(embeddedName, ...args) {
    super._onUpdateEmbeddedDocuments(embeddedName, ...args);
    this._onEmbeddedDocumentChange(embeddedName);
  }

  /* -------------------------------------------- */

  /** @inheritdoc */
  _onDeleteEmbeddedDocuments(embeddedName, ...args) {
    super._onDeleteEmbeddedDocuments(embeddedName, ...args);
    this._onEmbeddedDocumentChange(embeddedName);
  }

  /* -------------------------------------------- */

  /**
   * Perform various actions on active tokens if embedded documents were changed.
   * @param {string} embeddedName  The type of embedded document that was modified.
   * @private
   */
  _onEmbeddedDocumentChange(embeddedName) {

    // Refresh the display of the CombatTracker UI
    let refreshCombat = false;
    if ( this.isToken ) refreshCombat = this.token.inCombat;
    else if ( game.combat?.getCombatantByActor(this.id) ) refreshCombat = true;
    if ( refreshCombat ) ui.combat.render();

    // Refresh the display of active Tokens
    const tokens = this.getActiveTokens();
    for ( let token of tokens ) {
      if ( token.hasActiveHUD ) canvas.tokens.hud.render();
      if ( token.document.parent.isView ) {
        token.drawEffects();
        token.drawBars();
      }
    }
  }

  /* -------------------------------------------- */
  /*  Deprecations and Compatibility              */
  /* -------------------------------------------- */

  /**
   * @deprecated since v10
   * @ignore
   */
  async getTokenData(data) {
    foundry.utils.logCompatibilityWarning("The Actor#getTokenData method has been renamed to Actor#getTokenDocument",
      {since: 10, until: 12});
    return this.getTokenDocument(data);
  }
}
