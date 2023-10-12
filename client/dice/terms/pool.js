/**
 * A type of RollTerm which encloses a pool of multiple inner Rolls which are evaluated jointly.
 *
 * A dice pool represents a set of Roll expressions which are collectively modified to compute an effective total
 * across all Rolls in the pool. The final total for the pool is defined as the sum over kept rolls, relative to any
 * success count or margin.
 *
 * @example Keep the highest of the 3 roll expressions
 * ```js
 * let pool = new PoolTerm({
 *   terms: ["4d6", "3d8 - 1", "2d10 + 3"],
 *   modifiers: ["kh"]
 * });
 * pool.evaluate();
 * ```
 */
class PoolTerm extends RollTerm {
  constructor({terms=[], modifiers=[], rolls=[], results=[], options={}}={}) {
    super({options});

    /**
     * The original provided terms to the Dice Pool
     * @type {string[]}
     */
    this.terms = terms;

    /**
     * The string modifiers applied to resolve the pool
     * @type {string[]}
     */
    this.modifiers = modifiers;

    /**
     * Each component term of a dice pool is evaluated as a Roll instance
     * @type {Roll[]}
     */
    this.rolls = (rolls.length === terms.length) ? rolls : this.terms.map(t => Roll.create(t));

    /**
     * The array of dice pool results which have been rolled
     * @type {DiceTermResult[]}
     */
    this.results = results;

    // If rolls and results were explicitly passed, the term has already been evaluated
    if ( rolls.length && results.length ) this._evaluated = true;
  }

  /* -------------------------------------------- */

  /**
   * Define the modifiers that can be used for this particular DiceTerm type.
   * @type {Object<string, Function>}
   */
  static MODIFIERS = {
    "k": "keep",
    "kh": "keep",
    "kl": "keep",
    "d": "drop",
    "dh": "drop",
    "dl": "drop",
    "cs": "countSuccess",
    "cf": "countFailures"
  };

  /**
   * The regular expression pattern used to identify the opening of a dice pool expression.
   * @type {RegExp}
   */
  static OPEN_REGEXP = /{/g;

  /**
   * A regular expression pattern used to identify the closing of a dice pool expression.
   * @type {RegExp}
   */
  static CLOSE_REGEXP = new RegExp(`}${DiceTerm.MODIFIERS_REGEXP_STRING}?(?:\\$\\$F[0-9]+\\$\\$)?`, "g");

  /**
   * A regular expression pattern used to match the entirety of a DicePool expression.
   * @type {RegExp}
   */
  static REGEXP = new RegExp(`{([^}]+)}${DiceTerm.MODIFIERS_REGEXP_STRING}?(?:\\$\\$F[0-9]+\\$\\$)?`);

  /** @inheritdoc */
  static SERIALIZE_ATTRIBUTES = ["terms", "modifiers", "rolls", "results"];

  /* -------------------------------------------- */
  /*  Dice Pool Attributes                        */
  /* -------------------------------------------- */

  /**
   * Return an Array of each individual DiceTerm instances contained within the PoolTerm.
   * @return {DiceTerm[]}
   */
  get dice() {
    return this.rolls.flatMap(r => r.dice);
  }

  /* -------------------------------------------- */

  /** @inheritdoc */
  get expression() {
    return `{${this.terms.join(",")}}${this.modifiers.join("")}`;
  }

  /* -------------------------------------------- */

  /** @inheritdoc */
  get total() {
    if ( !this._evaluated ) return undefined;
    return this.results.reduce((t, r) => {
      if ( !r.active ) return t;
      if ( r.count !== undefined ) return t + r.count;
      else return t + r.result;
    }, 0);
  }

  /* -------------------------------------------- */

  /**
   * Return an array of rolled values which are still active within the PoolTerm
   * @type {number[]}
   */
  get values() {
    return this.results.reduce((arr, r) => {
      if ( !r.active ) return arr;
      arr.push(r.result);
      return arr;
    }, []);
  }

  /* -------------------------------------------- */

  /** @inheritdoc */
  get isDeterministic() {
    return this.terms.every(t => Roll.create(t).isDeterministic);
  }

  /* -------------------------------------------- */

  /**
   * Alter the DiceTerm by adding or multiplying the number of dice which are rolled
   * @param {any[]} args        Arguments passed to each contained Roll#alter method.
   * @return {PoolTerm}         The altered pool
   */
  alter(...args) {
    this.rolls.forEach(r => r.alter(...args));
    return this;
  }

  /* -------------------------------------------- */

  /** @inheritdoc */
  _evaluateSync({minimize=false, maximize=false}={}) {
    for ( let roll of this.rolls ) {
      roll.evaluate({minimize, maximize, async: false});
      if ( this.flavor ) roll.terms.forEach(t => t.options.flavor = t.options.flavor ?? this.flavor);
      this.results.push({
        result: roll.total,
        active: true
      });
    }
    this._evaluateModifiers();
    return this;
  }

  /* -------------------------------------------- */

  /** @inheritdoc */
  async _evaluate({minimize=false, maximize=false}={}) {
    for ( let roll of this.rolls ) {
      await roll.evaluate({minimize, maximize, async: true});
      if ( this.flavor ) roll.terms.forEach(t => t.options.flavor = t.options.flavor ?? this.flavor);
      this.results.push({
        result: roll.total,
        active: true
      });
    }
    this._evaluateModifiers();
    return this;
  }

  /* -------------------------------------------- */

  /**
   * Use the same logic as for the DiceTerm to avoid duplication
   * @see DiceTerm#_evaluateModifiers
   */
  _evaluateModifiers() {
    return DiceTerm.prototype._evaluateModifiers.call(this);
  }

  /* -------------------------------------------- */

  /**
   * Use the same logic as for the DiceTerm to avoid duplication
   * @see DiceTerm#_evaluateModifier
   */
  _evaluateModifier(command, modifier) {
    return DiceTerm.prototype._evaluateModifier.call(this, command, modifier);
  }

  /* -------------------------------------------- */
  /*  Saving and Loading                          */
  /* -------------------------------------------- */

  /** @inheritdoc */
  static _fromData(data) {
    data.rolls = (data.rolls || []).map(r => {
      const cls = CONFIG.Dice.rolls.find(cls => cls.name === r.class) || Roll;
      return cls.fromData(r)
    });
    return super._fromData(data);
  }

  /* -------------------------------------------- */

  /** @inheritdoc */
  toJSON() {
    const data = super.toJSON();
    data.rolls = data.rolls.map(r => r.toJSON());
    return data;
  }

  /* -------------------------------------------- */

  /**
   * Given a string formula, create and return an evaluated PoolTerm object
   * @param {string} formula    The string formula to parse
   * @param {object} [options]  Additional options applied to the PoolTerm
   * @return {PoolTerm|null}    The evaluated PoolTerm object or null if the formula is invalid
   */
  static fromExpression(formula, options={}) {
    const rgx = formula.trim().match(this.REGEXP);
    if ( !rgx ) return null;
    let [terms, modifiers] = rgx.slice(1);
    terms = terms.split(",");
    modifiers = Array.from((modifiers || "").matchAll(DiceTerm.MODIFIER_REGEXP)).map(m => m[0]);
    return new this({terms, modifiers, options});
  }

  /* -------------------------------------------- */

  /**
   * Create a PoolTerm by providing an array of existing Roll objects
   * @param {Roll[]} rolls      An array of Roll objects from which to create the pool
   * @returns {RollTerm}        The constructed PoolTerm comprised of the provided rolls
   */
  static fromRolls(rolls=[]) {
    const allEvaluated = rolls.every(t => t._evaluated);
    const noneEvaluated = !rolls.some(t => t._evaluated);
    if ( !(allEvaluated || noneEvaluated) ) {
      throw new Error("You can only call PoolTerm.fromRolls with an array of Roll instances which are either all evaluated, or none evaluated");
    }
    const pool = new this({
      terms: rolls.map(r => r.formula),
      modifiers: [],
      rolls: rolls,
      results: allEvaluated ? rolls.map(r => ({result: r.total, active: true})) : []
    });
    pool._evaluated = allEvaluated;
    return pool;
  }

  /* -------------------------------------------- */
  /*  Modifiers                                   */
  /* -------------------------------------------- */

  /**
   * Keep a certain number of highest or lowest dice rolls from the result set.
   *
   * {1d6,1d8,1d10,1d12}kh2       Keep the 2 best rolls from the pool
   * {1d12,6}kl                   Keep the lowest result in the pool
   *
   * @param {string} modifier     The matched modifier query
   */
  keep(modifier) {
    return Die.prototype.keep.call(this, modifier);
  }

  /* -------------------------------------------- */

  /**
   * Keep a certain number of highest or lowest dice rolls from the result set.
   *
   * {1d6,1d8,1d10,1d12}dl3       Drop the 3 worst results in the pool
   * {1d12,6}dh                   Drop the highest result in the pool
   *
   * @param {string} modifier     The matched modifier query
   */
  drop(modifier) {
    return Die.prototype.drop.call(this, modifier);
  }

  /* -------------------------------------------- */

  /**
   * Count the number of successful results which occurred in the pool.
   * Successes are counted relative to some target, or relative to the maximum possible value if no target is given.
   * Applying a count-success modifier to the results re-casts all results to 1 (success) or 0 (failure)
   *
   * 20d20cs      Count the number of dice which rolled a 20
   * 20d20cs>10   Count the number of dice which rolled higher than 10
   * 20d20cs<10   Count the number of dice which rolled less than 10
   *
   * @param {string} modifier     The matched modifier query
   */
  countSuccess(modifier) {
    return Die.prototype.countSuccess.call(this, modifier);
  }

  /* -------------------------------------------- */

  /**
   * Count the number of failed results which occurred in a given result set.
   * Failures are counted relative to some target, or relative to the lowest possible value if no target is given.
   * Applying a count-failures modifier to the results re-casts all results to 1 (failure) or 0 (non-failure)
   *
   * 6d6cf      Count the number of dice which rolled a 1 as failures
   * 6d6cf<=3   Count the number of dice which rolled less than 3 as failures
   * 6d6cf>4    Count the number of dice which rolled greater than 4 as failures
   *
   * @param {string} modifier     The matched modifier query
   */
  countFailures(modifier) {
    return Die.prototype.countFailures.call(this, modifier);
  }
}
