/**
 * The client-side Combat document which extends the common BaseCombat model.
 *
 * @extends documents.BaseCombat
 * @mixes ClientDocumentMixin
 *
 * @see {@link documents.Combats}             The world-level collection of Combat documents
 * @see {@link Combatant}                     The Combatant embedded document which exists within a Combat document
 * @see {@link CombatConfig}                  The Combat configuration application
 */
class Combat extends ClientDocumentMixin(foundry.documents.BaseCombat) {
  constructor(data, context) {
    super(data, context);

    /**
     * Track the sorted turn order of this combat encounter
     * @type {Combatant[]}
     */
    this.turns = this.turns || [];

    /**
     * Record the current round, turn, and tokenId to understand changes in the encounter state
     * @type {{round: number|null, turn: number|null, tokenId: string|null, combatantId: string|null}}
     * @private
     */
    this.current = this.current || {
      round: null,
      turn: null,
      tokenId: null,
      combatantId: null
    };

    /**
     * Track the previous round, turn, and tokenId to understand changes in the encounter state
     * @type {{round: number|null, turn: number|null, tokenId: string|null, combatantId: string|null}}
     * @private
     */
    this.previous = this.previous || {
      round: null,
      turn: null,
      tokenId: null,
      combatantId: null
    };
  }

  /**
   * The configuration setting used to record Combat preferences
   * @type {string}
   */
  static CONFIG_SETTING = "combatTrackerConfig";

  /* -------------------------------------------- */
  /*  Properties                                  */
  /* -------------------------------------------- */

  /**
   * Get the Combatant who has the current turn.
   * @type {Combatant}
   */
  get combatant() {
    return this.turns[this.turn];
  }

  /* -------------------------------------------- */

  /**
   * Get the Combatant who has the next turn.
   * @type {Combatant}
   */
  get nextCombatant() {
    if ( this.turn === this.turns.length - 1 ) return this.turns[0];
    return this.turns[this.turn + 1];
  }

  /* -------------------------------------------- */

  /**
   * Return the object of settings which modify the Combat Tracker behavior
   * @type {object}
   */
  get settings() {
    return CombatEncounters.settings;
  }

  /* -------------------------------------------- */

  /**
   * Has this combat encounter been started?
   * @type {boolean}
   */
  get started() {
    return ( this.turns.length > 0 ) && ( this.round > 0 );
  }

  /* -------------------------------------------- */

  /** @inheritdoc */
  get visible() {
    return true;
  }

  /* -------------------------------------------- */

  /**
   * Is this combat active in the current scene?
   * @type {boolean}
   */
  get isActive() {
    if ( !this.scene ) return this.active;
    return this.scene.isView && this.active;
  }

  /* -------------------------------------------- */
  /*  Methods                                     */
  /* -------------------------------------------- */

  /**
   * Set the current Combat encounter as active within the Scene.
   * Deactivate all other Combat encounters within the viewed Scene and set this one as active
   * @param {object} [options] Additional context to customize the update workflow
   * @returns {Promise<Combat>}
   */
  async activate(options) {
    const updates = this.collection.reduce((arr, c) => {
      if ( c.isActive ) arr.push({_id: c.id, active: false});
      return arr;
    }, []);
    updates.push({_id: this.id, active: true});
    return this.constructor.updateDocuments(updates, options);
  }

  /* -------------------------------------------- */

  /** @override */
  prepareDerivedData() {
    if ( this.combatants.size && !this.turns?.length ) this.setupTurns();
  }

  /* -------------------------------------------- */

  /**
   * Get a Combatant using its Token id
   * @param {string} tokenId   The id of the Token for which to acquire the combatant
   * @returns {Combatant}
   */
  getCombatantByToken(tokenId) {
    return this.combatants.find(c => c.tokenId === tokenId);
  }

  /* -------------------------------------------- */

  /**
   * Get a Combatant using its Actor id
   * @param {string} actorId The id of the Actor for which to acquire the combatant
   * @returns {Combatant}
   */
  getCombatantByActor(actorId) {
    return this.combatants.find(c => c.actorId === actorId);
  }

  /* -------------------------------------------- */

  /**
   * Begin the combat encounter, advancing to round 1 and turn 1
   * @returns {Promise<Combat>}
   */
  async startCombat() {
    this._playCombatSound("startEncounter");
    const updateData = {round: 1, turn: 0};
    Hooks.callAll("combatStart", this, updateData);
    return this.update(updateData);
  }

  /* -------------------------------------------- */

  /**
   * Advance the combat to the next round
   * @returns {Promise<Combat>}
   */
  async nextRound() {
    let turn = this.turn === null ? null : 0; // Preserve the fact that it's no-one's turn currently.
    if ( this.settings.skipDefeated && (turn !== null) ) {
      turn = this.turns.findIndex(t => !t.isDefeated);
      if (turn === -1) {
        ui.notifications.warn("COMBAT.NoneRemaining", {localize: true});
        turn = 0;
      }
    }
    let advanceTime = Math.max(this.turns.length - this.turn, 0) * CONFIG.time.turnTime;
    advanceTime += CONFIG.time.roundTime;
    let nextRound = this.round + 1;

    // Update the document, passing data through a hook first
    const updateData = {round: nextRound, turn};
    const updateOptions = {advanceTime, direction: 1};
    Hooks.callAll("combatRound", this, updateData, updateOptions);
    return this.update(updateData, updateOptions);
  }

  /* -------------------------------------------- */

  /**
   * Rewind the combat to the previous round
   * @returns {Promise<Combat>}
   */
  async previousRound() {
    let turn = ( this.round === 0 ) ? 0 : Math.max(this.turns.length - 1, 0);
    if ( this.turn === null ) turn = null;
    let round = Math.max(this.round - 1, 0);
    let advanceTime = -1 * (this.turn || 0) * CONFIG.time.turnTime;
    if ( round > 0 ) advanceTime -= CONFIG.time.roundTime;

    // Update the document, passing data through a hook first
    const updateData = {round, turn};
    const updateOptions = {advanceTime, direction: -1};
    Hooks.callAll("combatRound", this, updateData, updateOptions);
    return this.update(updateData, updateOptions);
  }

  /* -------------------------------------------- */

  /**
   * Advance the combat to the next turn
   * @returns {Promise<Combat>}
   */
  async nextTurn() {
    let turn = this.turn ?? -1;
    let skip = this.settings.skipDefeated;

    // Determine the next turn number
    let next = null;
    if ( skip ) {
      for ( let [i, t] of this.turns.entries() ) {
        if ( i <= turn ) continue;
        if ( t.isDefeated ) continue;
        next = i;
        break;
      }
    }
    else next = turn + 1;

    // Maybe advance to the next round
    let round = this.round;
    if ( (this.round === 0) || (next === null) || (next >= this.turns.length) ) {
      return this.nextRound();
    }

    // Update the document, passing data through a hook first
    const updateData = {round, turn: next};
    const updateOptions = {advanceTime: CONFIG.time.turnTime, direction: 1};
    Hooks.callAll("combatTurn", this, updateData, updateOptions);
    return this.update(updateData, updateOptions);
  }

  /* -------------------------------------------- */

  /**
   * Rewind the combat to the previous turn
   * @returns {Promise<Combat>}
   */
  async previousTurn() {
    if ( (this.turn === 0) && (this.round === 0) ) return this;
    else if ( (this.turn <= 0) && (this.turn !== null) ) return this.previousRound();
    let advanceTime = -1 * CONFIG.time.turnTime;
    let previousTurn = (this.turn ?? this.turns.length) - 1;

    // Update the document, passing data through a hook first
    const updateData = {round: this.round, turn: previousTurn};
    const updateOptions = {advanceTime, direction: -1};
    Hooks.callAll("combatTurn", this, updateData, updateOptions);
    return this.update(updateData, updateOptions);
  }

  /* -------------------------------------------- */

  /**
   * Display a dialog querying the GM whether they wish to end the combat encounter and empty the tracker
   * @returns {Promise<Combat>}
   */
  async endCombat() {
    return Dialog.confirm({
      title: game.i18n.localize("COMBAT.EndTitle"),
      content: `<p>${game.i18n.localize("COMBAT.EndConfirmation")}</p>`,
      yes: () => this.delete()
    });
  }

  /* -------------------------------------------- */

  /**
   * Toggle whether this combat is linked to the scene or globally available.
   * @returns {Promise<Combat>}
   */
  async toggleSceneLink() {
    const scene = this.scene ? null : (game.scenes.current?.id || null);
    return this.update({scene});
  }

  /* -------------------------------------------- */

  /**
   * Reset all combatant initiative scores, setting the turn back to zero
   * @returns {Promise<Combat>}
   */
  async resetAll() {
    for ( let c of this.combatants ) {
      c.updateSource({initiative: null});
    }
    return this.update({turn: 0, combatants: this.combatants.toObject()}, {diff: false});
  }

  /* -------------------------------------------- */

  /**
   * Roll initiative for one or multiple Combatants within the Combat document
   * @param {string|string[]} ids     A Combatant id or Array of ids for which to roll
   * @param {object} [options={}]     Additional options which modify how initiative rolls are created or presented.
   * @param {string|null} [options.formula]         A non-default initiative formula to roll. Otherwise, the system
   *                                                default is used.
   * @param {boolean} [options.updateTurn=true]     Update the Combat turn after adding new initiative scores to
   *                                                keep the turn on the same Combatant.
   * @param {object} [options.messageOptions={}]    Additional options with which to customize created Chat Messages
   * @returns {Promise<Combat>}       A promise which resolves to the updated Combat document once updates are complete.
   */
  async rollInitiative(ids, {formula=null, updateTurn=true, messageOptions={}}={}) {

    // Structure input data
    ids = typeof ids === "string" ? [ids] : ids;
    const currentId = this.combatant?.id;
    const chatRollMode = game.settings.get("core", "rollMode");

    // Iterate over Combatants, performing an initiative roll for each
    const updates = [];
    const messages = [];
    for ( let [i, id] of ids.entries() ) {

      // Get Combatant data (non-strictly)
      const combatant = this.combatants.get(id);
      if ( !combatant?.isOwner ) continue;

      // Produce an initiative roll for the Combatant
      const roll = combatant.getInitiativeRoll(formula);
      await roll.evaluate({async: true});
      updates.push({_id: id, initiative: roll.total});

      // Construct chat message data
      let messageData = foundry.utils.mergeObject({
        speaker: ChatMessage.getSpeaker({
          actor: combatant.actor,
          token: combatant.token,
          alias: combatant.name
        }),
        flavor: game.i18n.format("COMBAT.RollsInitiative", {name: combatant.name}),
        flags: {"core.initiativeRoll": true}
      }, messageOptions);
      const chatData = await roll.toMessage(messageData, {create: false});

      // If the combatant is hidden, use a private roll unless an alternative rollMode was explicitly requested
      chatData.rollMode = "rollMode" in messageOptions ? messageOptions.rollMode
        : (combatant.hidden ? CONST.DICE_ROLL_MODES.PRIVATE : chatRollMode );

      // Play 1 sound for the whole rolled set
      if ( i > 0 ) chatData.sound = null;
      messages.push(chatData);
    }
    if ( !updates.length ) return this;

    // Update multiple combatants
    await this.updateEmbeddedDocuments("Combatant", updates);

    // Ensure the turn order remains with the same combatant
    if ( updateTurn && currentId ) {
      await this.update({turn: this.turns.findIndex(t => t.id === currentId)});
    }

    // Create multiple chat messages
    await ChatMessage.implementation.create(messages);
    return this;
  }

  /* -------------------------------------------- */

  /**
   * Roll initiative for all combatants which have not already rolled
   * @param {object} [options={}]   Additional options forwarded to the Combat.rollInitiative method
   */
  async rollAll(options) {
    const ids = this.combatants.reduce((ids, c) => {
      if ( c.isOwner && (c.initiative === null) ) ids.push(c.id);
      return ids;
    }, []);
    return this.rollInitiative(ids, options);
  }

  /* -------------------------------------------- */

  /**
   * Roll initiative for all non-player actors who have not already rolled
   * @param {object} [options={}]   Additional options forwarded to the Combat.rollInitiative method
   */
  async rollNPC(options={}) {
    const ids = this.combatants.reduce((ids, c) => {
      if ( c.isOwner && c.isNPC && (c.initiative === null) ) ids.push(c.id);
      return ids;
    }, []);
    return this.rollInitiative(ids, options);
  }

  /* -------------------------------------------- */

  /**
   * Assign initiative for a single Combatant within the Combat encounter.
   * Update the Combat turn order to maintain the same combatant as the current turn.
   * @param {string} id         The combatant ID for which to set initiative
   * @param {number} value      A specific initiative value to set
   */
  async setInitiative(id, value) {
    const combatant = this.combatants.get(id, {strict: true});
    await combatant.update({initiative: value});
  }

  /* -------------------------------------------- */

  /**
   * Return the Array of combatants sorted into initiative order, breaking ties alphabetically by name.
   * @returns {Combatant[]}
   */
  setupTurns() {

    // Determine the turn order and the current turn
    const turns = this.combatants.contents.sort(this._sortCombatants);
    if ( this.turn !== null) this.turn = Math.clamped(this.turn, 0, turns.length-1);

    // Update state tracking
    let c = turns[this.turn];
    this.current = {
      round: this.round,
      turn: this.turn,
      combatantId: c ? c.id : null,
      tokenId: c ? c.tokenId : null
    };

    // Return the array of prepared turns
    return this.turns = turns;
  }

  /* -------------------------------------------- */

  /**
   * Update active effect durations for all actors present in this Combat encounter.
   */
  updateEffectDurations() {
    for ( const combatant of this.combatants ) {
      const actor = combatant.actor;
      if ( !actor?.effects.size ) continue;
      for ( const effect of actor.effects ) {
        effect._prepareDuration();
      }
      actor.render(false);
    }
  }

  /* -------------------------------------------- */

  /**
   * Loads the registered Combat Theme (if any) and plays the requested type of sound.
   * If multiple exist for that type, one is chosen at random.
   * @param {string} type     One of [ "startEncounter", "nextUp", "yourTurn" ]
   * @private
   */
  _playCombatSound(type) {
    const theme = CONFIG.Combat.sounds[game.settings.get("core", "combatTheme")];
    if ( !theme || theme === "none" ) return;
    const options = theme[type];
    if ( !options ) return;
    const src = options[Math.floor(Math.random() * options.length)];
    try {
      const volume = AudioHelper.volumeToInput(game.settings.get("core", "globalInterfaceVolume"));
      game.audio.create({
        src: src,
        preload: true,
        autoplay: true,
        singleton: false,
        autoplayOptions: {volume}
      });
    }
    catch(e) {
      console.error(e);
    }
  }

  /* -------------------------------------------- */

  /**
   * Define how the array of Combatants is sorted in the displayed list of the tracker.
   * This method can be overridden by a system or module which needs to display combatants in an alternative order.
   * The default sorting rules sort in descending order of initiative using combatant IDs for tiebreakers.
   * @param {Combatant} a     Some combatant
   * @param {Combatant} b     Some other combatant
   * @protected
   */
  _sortCombatants(a, b) {
    const ia = Number.isNumeric(a.initiative) ? a.initiative : -Infinity;
    const ib = Number.isNumeric(b.initiative) ? b.initiative : -Infinity;
    return (ib - ia) || (a.id > b.id ? 1 : -1);
  }

  /* -------------------------------------------- */
  /*  Event Handlers                              */
  /* -------------------------------------------- */

  /** @inheritdoc */
  _onCreate(data, options, userId) {
    super._onCreate(data, options, userId);
    if ( !this.collection.viewed ) ui.combat.initialize({combat: this, render: false});
  }

  /* -------------------------------------------- */

  /** @inheritdoc */
  _onUpdate(data, options, userId) {
    super._onUpdate(data, options, userId);

    // Set up turn data
    if ( ["combatants", "round", "turn"].some(k => data.hasOwnProperty(k)) ) {
      if ( data.combatants ) this.setupTurns();
      else {
        const c = this.combatant;
        this.previous = this.current;
        this.current = {
          round: this.round,
          turn: this.turn,
          combatantId: c ? c.id : null,
          tokenId: c ? c.tokenId : null
        };

        // Update effect durations
        this.updateEffectDurations();

        // Play sounds
        if ( game.user.character ) {
          if ( this.combatant?.actorId === game.user.character._id ) this._playCombatSound("yourTurn");
          else if ( this.nextCombatant?.actorId === game.user.character._id ) this._playCombatSound("nextUp");
        }
      }
      return ui.combat.scrollToTurn();
    }

    // Render the sidebar
    if ( (data.active === true) && this.isActive ) ui.combat.initialize({combat: this});
    else if ( "scene" in data ) ui.combat.initialize();
  }

  /* -------------------------------------------- */

  /** @inheritdoc */
  _onDelete(options, userId) {
    super._onDelete(options, userId);
    if ( this.collection.viewed === this ) ui.combat.initialize({render: false});
    if ( userId === game.userId ) this.collection.viewed?.activate();
  }

  /* -------------------------------------------- */

  /** @inheritdoc */
  _onCreateEmbeddedDocuments(type, documents, result, options, userId) {
    super._onCreateEmbeddedDocuments(type, documents, result, options, userId);

    // Update the turn order and adjust the combat to keep the combatant the same
    const current = this.combatant;
    this.setupTurns();

    // Keep the current Combatant the same after adding new Combatants to the Combat
    if ( current ) {
      let turn = Math.max(this.turns.findIndex(t => t.id === current.id), 0);
      if ( game.user.id === userId ) this.update({turn});
      else this.updateSource({turn});
    }

    // Render the collection
    if ( this.active && (options.render !== false) ) this.collection.render();
  }

  /* -------------------------------------------- */

  /** @inheritdoc */
  _onUpdateEmbeddedDocuments(embeddedName, documents, result, options, userId) {
    super._onUpdateEmbeddedDocuments(embeddedName, documents, result, options, userId);
    const current = this.combatant;
    this.setupTurns();
    const turn = current ? this.turns.findIndex(t => t.id === current.id) : this.turn;
    if ( turn !== this.turn ) {
      if ( game.user.id === userId ) this.update({turn});
      else this.updateSource({turn});
    }
    if ( this.active && (options.render !== false) ) this.collection.render();
  }

  /* -------------------------------------------- */

  /** @inheritdoc */
  _onDeleteEmbeddedDocuments(embeddedName, documents, result, options, userId) {
    super._onDeleteEmbeddedDocuments(embeddedName, documents, result, options, userId);

    // Update the turn order and adjust the combat to keep the combatant the same (unless they were deleted)
    const current = this.combatant;
    const {prevSurvivor, nextSurvivor} = this.turns.reduce((obj, t, i) => {
      let valid = !result.includes(t.id);
      if ( this.settings.skipDefeated ) valid &&= !t.isDefeated;
      if ( !valid ) return obj;
      if ( i < this.turn ) obj.prevSurvivor = t;
      if ( !obj.nextSurvivor && (i >= this.turn) ) obj.nextSurvivor = t;
      return obj;
    }, {});
    this.setupTurns();

    // If the current combatant was removed, update the turn order to the next survivor
    let turn = this.turn;
    if ( result.includes(current?.id) ) {
      const survivor = nextSurvivor || prevSurvivor;
      if ( survivor ) turn = this.turns.findIndex(t => t.id === survivor.id);
    }

    // Otherwise, keep the combatant the same
    else turn = this.turns.findIndex(t => t.id === current?.id);

    // Update database or perform a local override
    turn = Math.max(turn, 0);
    if ( current ) {
      if ( game.user.id === userId ) this.update({turn});
      else this.updateSource({turn});
    }

    // Render the collection
    if ( this.active && (options.render !== false) ) this.collection.render();
  }
}
