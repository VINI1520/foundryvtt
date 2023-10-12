/**
 * The client-side ActiveEffect document which extends the common BaseActiveEffect model.
 * Each ActiveEffect belongs to the effects collection of its parent Document.
 * Each ActiveEffect contains a ActiveEffectData object which provides its source data.
 *
 * @extends documents.BaseActiveEffect
 * @mixes ClientDocumentMixin
 *
 * @see {@link documents.Actor}                     The Actor document which contains ActiveEffect embedded documents
 * @see {@link documents.Item}                      The Item document which contains ActiveEffect embedded documents
 */
class ActiveEffect extends ClientDocumentMixin(foundry.documents.BaseActiveEffect) {

  /**
   * A cached reference to the source name to avoid recurring database lookups
   * @type {string|null}
   */
  _sourceName = null;

  /**
   * Does this ActiveEffect correspond to a significant status effect ID?
   * @type {string|null}
   * @private
   */
  _statusId = null;

  /* -------------------------------------------- */
  /*  Properties                                  */
  /* -------------------------------------------- */

  /**
   * Is there some system logic that makes this active effect ineligible for application?
   * @type {boolean}
   */
  get isSuppressed() {
    return false;
  }

  /* --------------------------------------------- */

  /**
   * Does this Active Effect currently modify an Actor?
   * @type {boolean}
   */
  get modifiesActor() {
    return (this.parent instanceof Actor) && !this.disabled && !this.isSuppressed;
  }

  /* --------------------------------------------- */

  /** @inheritdoc */
  prepareDerivedData() {
    const statusId = this.flags.core?.statusId;
    this._statusId = Object.values(CONFIG.specialStatusEffects).includes(statusId) ? statusId : null;
    this._prepareDuration();
  }

  /* --------------------------------------------- */

  /**
   * Prepare derived data related to active effect duration
   * @internal
   */
  _prepareDuration() {
    const d = this.duration;

    // Time-based duration
    if ( Number.isNumeric(d.seconds) ) {
      const start = (d.startTime || game.time.worldTime);
      const elapsed = game.time.worldTime - start;
      const remaining = d.seconds - elapsed;
      return foundry.utils.mergeObject(d, {
        type: "seconds",
        duration: d.seconds,
        remaining: remaining,
        label: `${remaining} Seconds`
      });
    }

    // Turn-based duration
    else if ( (d.rounds || d.turns) && game.combat ) {

      // Determine the current combat duration
      const cbt = game.combat;
      const c = {round: cbt.round ?? 0, turn: cbt.turn ?? 0, nTurns: cbt.turns.length || 1};
      const current = this._getCombatTime(c.round, c.turn);
      const duration = this._getCombatTime(d.rounds, d.turns);
      const start = this._getCombatTime(d.startRound, d.startTurn, c.nTurns);

      // If the effect has not started yet display the full duration
      if ( current <= start ) {
        return foundry.utils.mergeObject(d, {
          type: "turns",
          duration: duration,
          remaining: duration,
          label: this._getDurationLabel(d.rounds, d.turns)
        });
      }

      // Some number of remaining rounds and turns (possibly zero)
      const remaining = Math.max(((start + duration) - current).toNearest(0.01), 0);
      const remainingRounds = Math.floor(remaining);
      let nt = c.turn - d.startTurn;
      while ( nt < 0 ) nt += c.nTurns;
      const remainingTurns = nt > 0 ? c.nTurns - nt : 0;
      return foundry.utils.mergeObject(d, {
        type: "turns",
        duration: duration,
        remaining: remaining,
        label: this._getDurationLabel(remainingRounds, remainingTurns)
      });
    }

    // No duration
    return foundry.utils.mergeObject(d, {
      type: "none",
      duration: null,
      remaining: null,
      label: game.i18n.localize("None")
    });
  }

  /* -------------------------------------------- */

  /**
   * Format a round+turn combination as a decimal
   * @param {number} round    The round number
   * @param {number} turn     The turn number
   * @param {number} [nTurns] The maximum number of turns in the encounter
   * @returns {number}        The decimal representation
   * @private
   */
  _getCombatTime(round, turn, nTurns) {
    if ( nTurns !== undefined ) turn = Math.min(turn, nTurns);
    round = Math.max(round, 0);
    turn = Math.max(turn, 0);
    return (round || 0) + ((turn || 0) / 100);
  }

  /* -------------------------------------------- */

  /**
   * Format a number of rounds and turns into a human-readable duration label
   * @param {number} rounds   The number of rounds
   * @param {number} turns    The number of turns
   * @returns {string}        The formatted label
   * @private
   */
  _getDurationLabel(rounds, turns) {
    const parts = [];
    if ( rounds > 0 ) parts.push(`${rounds} ${game.i18n.localize(rounds === 1 ? "COMBAT.Round": "COMBAT.Rounds")}`);
    if ( turns > 0 ) parts.push(`${turns} ${game.i18n.localize(turns === 1 ? "COMBAT.Turn": "COMBAT.Turns")}`);
    if (( rounds + turns ) === 0 ) parts.push(game.i18n.localize("None"));
    return parts.filterJoin(", ");
  }

  /* -------------------------------------------- */

  /**
   * Describe whether the ActiveEffect has a temporary duration based on combat turns or rounds.
   * @type {boolean}
   */
  get isTemporary() {
    const duration = this.duration.seconds ?? (this.duration.rounds || this.duration.turns) ?? 0;
    return (duration > 0) || this.getFlag("core", "statusId");
  }

  /* -------------------------------------------- */

  /**
   * A cached property for obtaining the source name
   * @type {string}
   */
  get sourceName() {
    if ( this._sourceName === null ) this._getSourceName();
    return this._sourceName ?? "Unknown";
  }

  /* -------------------------------------------- */
  /*  Methods                                     */
  /* -------------------------------------------- */

  /**
   * Apply this ActiveEffect to a provided Actor.
   * TODO: This method is poorly conceived. Its functionality is static, applying a provided change to an Actor
   * TODO: When we revisit this in Active Effects V2 this should become an Actor method, or a static method
   * @param {Actor} actor                   The Actor to whom this effect should be applied
   * @param {EffectChangeData} change       The change data being applied
   * @returns {*}                           The resulting applied value
   */

  apply(actor, change) {

    // Determine the data type of the target field
    const current = foundry.utils.getProperty(actor, change.key) ?? null;
    let target = current;
    if ( current === null ) {
      const model = game.model.Actor[actor.type] || {};
      target = foundry.utils.getProperty(model, change.key) ?? null;
    }
    let targetType = foundry.utils.getType(target);

    // Cast the effect change value to the correct type
    let delta;
    try {
      if ( targetType === "Array" ) {
        const innerType = target.length ? foundry.utils.getType(target[0]) : "string";
        delta = this._castArray(change.value, innerType);
      }
      else delta = this._castDelta(change.value, targetType);
    } catch(err) {
      console.warn(`Actor [${actor.id}] | Unable to parse active effect change for ${change.key}: "${change.value}"`);
      return;
    }

    // Apply the change depending on the application mode
    const modes = CONST.ACTIVE_EFFECT_MODES;
    const changes = {};
    switch ( change.mode ) {
      case modes.ADD:
        this._applyAdd(actor, change, current, delta, changes);
        break;
      case modes.MULTIPLY:
        this._applyMultiply(actor, change, current, delta, changes);
        break;
      case modes.OVERRIDE:
        this._applyOverride(actor, change, current, delta, changes);
        break;
      case modes.UPGRADE:
      case modes.DOWNGRADE:
        this._applyUpgrade(actor, change, current, delta, changes);
        break;
      default:
        this._applyCustom(actor, change, current, delta, changes);
        break;
    }

    // Apply all changes to the Actor data
    foundry.utils.mergeObject(actor, changes);
    return changes;
  }

  /* -------------------------------------------- */

  /**
   * Cast a raw EffectChangeData change string to the desired data type.
   * @param {string} raw      The raw string value
   * @param {string} type     The target data type that the raw value should be cast to match
   * @returns {*}             The parsed delta cast to the target data type
   * @private
   */
  _castDelta(raw, type) {
    let delta;
    switch ( type ) {
      case "boolean":
        delta = Boolean(this._parseOrString(raw));
        break;
      case "number":
        delta = Number.fromString(raw);
        if ( Number.isNaN(delta) ) delta = 0;
        break;
      case "string":
        delta = String(raw);
        break;
      default:
        delta = this._parseOrString(raw);
    }
    return delta;
  }

  /* -------------------------------------------- */

  /**
   * Cast a raw EffectChangeData change string to an Array of an inner type.
   * @param {string} raw      The raw string value
   * @param {string} type     The target data type of inner array elements
   * @returns {Array<*>}      The parsed delta cast as a typed array
   * @private
   */
  _castArray(raw, type) {
    let delta;
    try {
      delta = this._parseOrString(raw);
      delta = delta instanceof Array ? delta : [delta];
    } catch(e) {
      delta = [raw];
    }
    return delta.map(d => this._castDelta(d, type));
  }

  /* -------------------------------------------- */

  /**
   * Parse serialized JSON, or retain the raw string.
   * @param {string} raw      A raw serialized string
   * @returns {*}             The parsed value, or the original value if parsing failed
   * @private
   */
  _parseOrString(raw) {
    try {
      return JSON.parse(raw);
    } catch(err) {
      return raw;
    }
  }

  /* -------------------------------------------- */

  /**
   * Apply an ActiveEffect that uses an ADD application mode.
   * The way that effects are added depends on the data type of the current value.
   *
   * If the current value is null, the change value is assigned directly.
   * If the current type is a string, the change value is concatenated.
   * If the current type is a number, the change value is cast to numeric and added.
   * If the current type is an array, the change value is appended to the existing array if it matches in type.
   *
   * @param {Actor} actor                   The Actor to whom this effect should be applied
   * @param {EffectChangeData} change       The change data being applied
   * @param {*} current                     The current value being modified
   * @param {*} delta                       The parsed value of the change object
   * @param {object} changes                An object which accumulates changes to be applied
   * @private
   */
  _applyAdd(actor, change, current, delta, changes) {
    let update;
    const ct = foundry.utils.getType(current);
    switch ( ct ) {
      case "boolean":
        update = current || delta;
        break;
      case "null":
        update = delta;
        break;
      case "Array":
        update = current.concat(delta);
        break;
      default:
        update = current + delta;
        break;
    }
    changes[change.key] = update;
  }

  /* -------------------------------------------- */

  /**
   * Apply an ActiveEffect that uses a MULTIPLY application mode.
   * Changes which MULTIPLY must be numeric to allow for multiplication.
   * @param {Actor} actor                   The Actor to whom this effect should be applied
   * @param {EffectChangeData} change       The change data being applied
   * @param {*} current                     The current value being modified
   * @param {*} delta                       The parsed value of the change object
   * @param {object} changes                An object which accumulates changes to be applied
   * @private
   */
  _applyMultiply(actor, change, current, delta, changes) {
    let update;
    const ct = foundry.utils.getType(current);
    switch ( ct ) {
      case "boolean":
        update = current && delta;
        break;
      case "number":
        update = current * delta;
        break;
    }
    changes[change.key] = update;
  }

  /* -------------------------------------------- */

  /**
   * Apply an ActiveEffect that uses an OVERRIDE application mode.
   * Numeric data is overridden by numbers, while other data types are overridden by any value
   * @param {Actor} actor                   The Actor to whom this effect should be applied
   * @param {EffectChangeData} change       The change data being applied
   * @param {*} current                     The current value being modified
   * @param {*} delta                       The parsed value of the change object
   * @param {object} changes                An object which accumulates changes to be applied
   * @private
   */
  _applyOverride(actor, change, current, delta, changes) {
    return changes[change.key] = delta;
  }

  /* -------------------------------------------- */

  /**
   * Apply an ActiveEffect that uses an UPGRADE, or DOWNGRADE application mode.
   * Changes which UPGRADE or DOWNGRADE must be numeric to allow for comparison.
   * @param {Actor} actor                   The Actor to whom this effect should be applied
   * @param {EffectChangeData} change       The change data being applied
   * @param {*} current                     The current value being modified
   * @param {*} delta                       The parsed value of the change object
   * @param {object} changes                An object which accumulates changes to be applied
   * @private
   */
  _applyUpgrade(actor, change, current, delta, changes) {
    let update;
    const ct = foundry.utils.getType(current);
    switch ( ct ) {
      case "boolean":
      case "number":
        if ( (change.mode === CONST.ACTIVE_EFFECT_MODES.UPGRADE) && (delta > current) ) update = delta;
        else if ( (change.mode === CONST.ACTIVE_EFFECT_MODES.DOWNGRADE) && (delta < current) ) update = delta;
        break;
    }
    changes[change.key] = update;
  }

  /* -------------------------------------------- */

  /**
   * Apply an ActiveEffect that uses a CUSTOM application mode.
   * @param {Actor} actor                   The Actor to whom this effect should be applied
   * @param {EffectChangeData} change       The change data being applied
   * @param {*} current                     The current value being modified
   * @param {*} delta                       The parsed value of the change object
   * @param {object} changes                An object which accumulates changes to be applied
   * @private
   */
  _applyCustom(actor, change, current, delta, changes) {
    const preHook = foundry.utils.getProperty(actor, change.key);
    /**
     * A hook event that fires when a custom active effect is applied.
     * @function applyActiveEffect
     * @memberof hookEvents
     * @param {Actor} actor                   The actor the active effect is being applied to
     * @param {EffectChangeData} change       The change data being applied
     * @param {*} current                     The current value being modified
     * @param {*} delta                       The parsed value of the change object
     * @param {object} changes                An object which accumulates changes to be applied
     */
    Hooks.call("applyActiveEffect", actor, change, current, delta, changes);
    const postHook = foundry.utils.getProperty(actor, change.key);
    if ( postHook !== preHook ) changes[change.key] = postHook;
  }

  /* -------------------------------------------- */

  /**
   * Get the name of the source of the Active Effect
   * @type {string}
   */
  async _getSourceName() {
    if ( this._sourceName ) return this._sourceName;
    if ( !this.origin ) return this._sourceName = game.i18n.localize("None");
    const source = await fromUuid(this.origin);
    return this._sourceName = source?.name ?? "Unknown";
  }

  /* -------------------------------------------- */
  /*  Event Handlers                              */
  /* -------------------------------------------- */

  /** @inheritdoc */
  async _preCreate(data, options, user) {
    await super._preCreate(data, options, user);

    // Set initial duration data for Actor-owned effects
    if ( this.parent instanceof Actor ) {
      const updates = {duration: {startTime: game.time.worldTime}, transfer: false};
      if ( game.combat ) {
        updates.duration.startRound = game.combat.round;
        updates.duration.startTurn = game.combat.turn ?? 0;
      }
      this.updateSource(updates);
    }
  }

  /* -------------------------------------------- */

  /** @inheritdoc */
  _onCreate(data, options, userId) {
    super._onCreate(data, options, userId);
    if ( this.modifiesActor ) {
      this._displayScrollingStatus(true);
      if ( this._statusId ) this.#dispatchTokenStatusChange(this._statusId, true);
    }
  }

  /* -------------------------------------------- */

  /** @inheritdoc */
  _onUpdate(data, options, userId) {
    super._onUpdate(data, options, userId);
    if ( ("disabled" in data) && this.modifiesActor ) {
      this._displayScrollingStatus(!data.disabled);
      if ( this._statusId ) this.#dispatchTokenStatusChange(this._statusId, !data.disabled);
    }
  }

  /* -------------------------------------------- */

  /** @inheritdoc */
  _onDelete(options, userId) {
    super._onDelete(options, userId);
    if ( this.modifiesActor ) {
      this._displayScrollingStatus(false);
      if ( this._statusId ) this.#dispatchTokenStatusChange(this._statusId, false);
    }
  }

  /* -------------------------------------------- */

  /**
   * Dispatch changes to a significant status effect to active Tokens on the Scene.
   * @param {string} statusId       The status effect ID being applied, from CONFIG.specialStatusEffects
   * @param {boolean} active        Is the special status effect now active?
   */
  #dispatchTokenStatusChange(statusId, active) {
    const tokens = this.parent.getActiveTokens();
    for ( const token of tokens ) token._onApplyStatusEffect(statusId, active);
  }

  /* -------------------------------------------- */

  /**
   * Display changes to active effects as scrolling Token status text.
   * @param {boolean} enabled     Is the active effect currently enabled?
   * @private
   */
  _displayScrollingStatus(enabled) {
    if ( !(this.flags.core?.statusId || this.changes.length) ) return;
    const actor = this.parent;
    const tokens = actor.isToken ? [actor.token?.object] : actor.getActiveTokens(true);
    const label = `${enabled ? "+" : "-"}(${this.label})`;
    for ( let t of tokens ) {
      if ( !t.visible || !t.renderable ) continue;
      canvas.interface.createScrollingText(t.center, label, {
        anchor: CONST.TEXT_ANCHOR_POINTS.CENTER,
        direction: enabled ? CONST.TEXT_ANCHOR_POINTS.TOP : CONST.TEXT_ANCHOR_POINTS.BOTTOM,
        distance: (2 * t.h),
        fontSize: 28,
        stroke: 0x000000,
        strokeThickness: 4,
        jitter: 0.25
      });
    }
  }
}
