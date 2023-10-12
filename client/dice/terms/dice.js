/**
 * @typedef {Object} DiceTermResult
 * @property {number} result        The numeric result
 * @property {boolean} [active]     Is this result active, contributing to the total?
 * @property {number} [count]       A value that the result counts as, otherwise the result is not used directly as
 * @property {boolean} [success]    Does this result denote a success?
 * @property {boolean} [failure]    Does this result denote a failure?
 * @property {boolean} [discarded]  Was this result discarded?
 * @property {boolean} [rerolled]   Was this result rerolled?
 * @property {boolean} [exploded]   Was this result exploded?
 */

/**
 * An abstract base class for any type of RollTerm which involves randomized input from dice, coins, or other devices.
 * @extends RollTerm
 *
 * @param {object} termData                 Data used to create the Dice Term, including the following:
 * @param {number} [termData.number=1]      The number of dice of this term to roll, before modifiers are applied
 * @param {number} termData.faces           The number of faces on each die of this type
 * @param {string[]} [termData.modifiers]   An array of modifiers applied to the results
 * @param {object[]} [termData.results]     An optional array of pre-cast results for the term
 * @param {object} [termData.options]       Additional options that modify the term
 */
class DiceTerm extends RollTerm {
  constructor({number=1, faces=6, modifiers=[], results=[], options={}}) {
    super({options});

    /**
     * The number of dice of this term to roll, before modifiers are applied
     * @type {number}
     */
    this.number = number;

    /**
     * The number of faces on the die
     * @type {number}
     */
    this.faces = faces;

    /**
     * An Array of dice term modifiers which are applied
     * @type {string[]}
     */
    this.modifiers = modifiers;

    /**
     * The array of dice term results which have been rolled
     * @type {DiceTermResult[]}
     */
    this.results = results;

    // If results were explicitly passed, the term has already been evaluated
    if ( results.length ) this._evaluated = true;
  }

  /* -------------------------------------------- */

  /**
   * Define the denomination string used to register this DiceTerm type in CONFIG.Dice.terms
   * @type {string}
   */
  static DENOMINATION = "";

  /**
   * Define the named modifiers that can be applied for this particular DiceTerm type.
   * @type {{string: (string|Function)}}
   */
  static MODIFIERS = {};

  /**
   * A regular expression pattern which captures the full set of term modifiers
   * Anything until a space, group symbol, or arithmetic operator
   * @type {string}
   */
  static MODIFIERS_REGEXP_STRING = "([^ (){}[\\]+\\-*/]+)";

  /**
   * A regular expression used to separate individual modifiers
   * @type {RegExp}
   */
  static MODIFIER_REGEXP = /([A-z]+)([^A-z\s()+\-*\/]+)?/g


  /** @inheritdoc */
  static REGEXP = new RegExp(`^([0-9]+)?[dD]([A-z]|[0-9]+)${DiceTerm.MODIFIERS_REGEXP_STRING}?${DiceTerm.FLAVOR_REGEXP_STRING}?$`);

  /** @inheritdoc */
  static SERIALIZE_ATTRIBUTES = ["number", "faces", "modifiers", "results"];

  /* -------------------------------------------- */
  /*  Dice Term Attributes                        */
  /* -------------------------------------------- */

  /** @inheritdoc */
  get expression() {
    const x = this.constructor.DENOMINATION === "d" ? this.faces : this.constructor.DENOMINATION;
    return `${this.number}d${x}${this.modifiers.join("")}`;
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
   * Return an array of rolled values which are still active within this term
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
    return false;
  }

  /* -------------------------------------------- */
  /*  Dice Term Methods                           */
  /* -------------------------------------------- */

  /**
   * Alter the DiceTerm by adding or multiplying the number of dice which are rolled
   * @param {number} multiply   A factor to multiply. Dice are multiplied before any additions.
   * @param {number} add        A number of dice to add. Dice are added after multiplication.
   * @return {DiceTerm}         The altered term
   */
  alter(multiply, add) {
    if ( this._evaluated ) throw new Error(`You may not alter a DiceTerm after it has already been evaluated`);
    multiply = Number.isFinite(multiply) && (multiply >= 0) ? multiply : 1;
    add = Number.isInteger(add) ? add : 0;
    if ( multiply >= 0 ) this.number = Math.round(this.number * multiply);
    if ( add ) this.number += add;
    return this;
  }

  /* -------------------------------------------- */

  /** @inheritdoc */
  _evaluateSync({minimize=false, maximize=false}={}) {
    if ( (this.number > 999) ) {
      throw new Error(`You may not evaluate a DiceTerm with more than 999 requested results`);
    }
    for ( let n=1; n <= this.number; n++ ) {
      this.roll({minimize, maximize});
    }
    this._evaluateModifiers();
    return this;
  }

  /* -------------------------------------------- */

  /**
   * Roll the DiceTerm by mapping a random uniform draw against the faces of the dice term.
   * @param {object} [options={}]           Options which modify how a random result is produced
   * @param {boolean} [options.minimize=false]    Minimize the result, obtaining the smallest possible value.
   * @param {boolean} [options.maximize=false]    Maximize the result, obtaining the largest possible value.
   * @return {DiceTermResult}               The produced result
   */
  roll({minimize=false, maximize=false}={}) {
    const roll = {result: undefined, active: true};
    if ( minimize ) roll.result = Math.min(1, this.faces);
    else if ( maximize ) roll.result = this.faces;
    else roll.result = Math.ceil(CONFIG.Dice.randomUniform() * this.faces);
    this.results.push(roll);
    return roll;
  }

  /* -------------------------------------------- */

  /**
   * Return a string used as the label for each rolled result
   * @param {DiceTermResult} result     The rolled result
   * @return {string}                   The result label
   */
  getResultLabel(result) {
    return String(result.result);
  }

  /* -------------------------------------------- */

  /**
   * Get the CSS classes that should be used to display each rolled result
   * @param {DiceTermResult} result     The rolled result
   * @return {string[]}                 The desired classes
   */
  getResultCSS(result) {
    const hasSuccess = result.success !== undefined;
    const hasFailure = result.failure !== undefined;
    const isMax = result.result === this.faces;
    const isMin = result.result === 1;
    return [
      this.constructor.name.toLowerCase(),
      "d" + this.faces,
      result.success ? "success" : null,
      result.failure ? "failure" : null,
      result.rerolled ? "rerolled" : null,
      result.exploded ? "exploded" : null,
      result.discarded ? "discarded" : null,
      !(hasSuccess || hasFailure) && isMin ? "min" : null,
      !(hasSuccess || hasFailure) && isMax ? "max" : null
    ]
  }

  /* -------------------------------------------- */

  /**
   * Render the tooltip HTML for a Roll instance
   * @return {object}      The data object used to render the default tooltip template for this DiceTerm
   */
  getTooltipData() {
    return {
      formula: this.expression,
      total: this.total,
      faces: this.faces,
      flavor: this.flavor,
      rolls: this.results.map(r => {
        return {
          result: this.getResultLabel(r),
          classes: this.getResultCSS(r).filterJoin(" ")
        }
      })
    };
  }

  /* -------------------------------------------- */
  /*  Modifier Methods                            */
  /* -------------------------------------------- */

  /**
   * Sequentially evaluate each dice roll modifier by passing the term to its evaluation function
   * Augment or modify the results array.
   * @private
   */
  _evaluateModifiers() {
    const cls = this.constructor;
    const requested = foundry.utils.deepClone(this.modifiers);
    this.modifiers = [];

    // Iterate over requested modifiers
    for ( let m of requested ) {
      let command = m.match(/[A-z]+/)[0].toLowerCase();

      // Matched command
      if ( command in cls.MODIFIERS ) {
        this._evaluateModifier(command, m);
        continue;
      }

      // Unmatched compound command
      // Sort modifiers from longest to shortest to ensure that the matching algorithm greedily matches the longest
      // prefixes first.
      const modifiers = Object.keys(cls.MODIFIERS).sort((a, b) => b.length - a.length);
      while ( !!command ) {
        let matched = false;
        for ( let cmd of modifiers ) {
          if ( command.startsWith(cmd) ) {
            matched = true;
            this._evaluateModifier(cmd, cmd);
            command = command.replace(cmd, "");
            break;
          }
        }
        if ( !matched ) command = "";
      }
    }
  }

  /* -------------------------------------------- */

  /**
   * Evaluate a single modifier command, recording it in the array of evaluated modifiers
   * @param {string} command        The parsed modifier command
   * @param {string} modifier       The full modifier request
   * @private
   */
  _evaluateModifier(command, modifier) {
      let fn = this.constructor.MODIFIERS[command];
      if ( typeof fn === "string" ) fn = this[fn];
      if ( fn instanceof Function ) {
        const result = fn.call(this, modifier);
        const earlyReturn = (result === false) || (result === this); // handling this is backwards compatibility
        if ( !earlyReturn ) this.modifiers.push(modifier.toLowerCase());
      }
  }

  /* -------------------------------------------- */

  /**
   * A helper comparison function.
   * Returns a boolean depending on whether the result compares favorably against the target.
   * @param {number} result         The result being compared
   * @param {string} comparison     The comparison operator in [=,&lt;,&lt;=,>,>=]
   * @param {number} target         The target value
   * @return {boolean}              Is the comparison true?
   */
  static compareResult(result, comparison, target) {
    switch ( comparison ) {
      case "=":
        return result === target;
      case "<":
        return result < target;
      case "<=":
        return result <= target;
      case ">":
        return result > target;
      case ">=":
        return result >= target;
    }
  }

  /* -------------------------------------------- */

  /**
   * A helper method to modify the results array of a dice term by flagging certain results are kept or dropped.
   * @param {object[]} results      The results array
   * @param {number} number         The number to keep or drop
   * @param {boolean} [keep]        Keep results?
   * @param {boolean} [highest]     Keep the highest?
   * @return {object[]}             The modified results array
   */
  static _keepOrDrop(results, number, {keep=true, highest=true}={}) {

    // Sort remaining active results in ascending (keep) or descending (drop) order
    const ascending = keep === highest;
    const values = results.reduce((arr, r) => {
      if ( r.active ) arr.push(r.result);
      return arr;
    }, []).sort((a, b) => ascending ? a - b : b - a);

    // Determine the cut point, beyond which to discard
    number = Math.clamped(keep ? values.length - number : number, 0, values.length);
    const cut = values[number];

    // Track progress
    let discarded = 0;
    const ties = [];
    let comp = ascending ? "<" : ">";

    // First mark results on the wrong side of the cut as discarded
    results.forEach(r => {
      if ( !r.active ) return;  // Skip results which have already been discarded
      let discard = this.compareResult(r.result, comp, cut);
      if ( discard ) {
        r.discarded = true;
        r.active = false;
        discarded++;
      }
      else if ( r.result === cut ) ties.push(r);
    });

    // Next discard ties until we have reached the target
    ties.forEach(r => {
      if ( discarded < number ) {
        r.discarded = true;
        r.active = false;
        discarded++;
      }
    });
    return results;
  }

  /* -------------------------------------------- */

  /**
   * A reusable helper function to handle the identification and deduction of failures
   */
  static _applyCount(results, comparison, target, {flagSuccess=false, flagFailure=false}={}) {
    for ( let r of results ) {
      let success = this.compareResult(r.result, comparison, target);
      if (flagSuccess) {
        r.success = success;
        if (success) delete r.failure;
      }
      else if (flagFailure ) {
        r.failure = success;
        if (success) delete r.success;
      }
      r.count = success ? 1 : 0;
    }
  }

  /* -------------------------------------------- */

  /**
   * A reusable helper function to handle the identification and deduction of failures
   */
  static _applyDeduct(results, comparison, target, {deductFailure=false, invertFailure=false}={}) {
    for ( let r of results ) {

      // Flag failures if a comparison was provided
      if (comparison) {
        const fail = this.compareResult(r.result, comparison, target);
        if ( fail ) {
          r.failure = true;
          delete r.success;
        }
      }

      // Otherwise treat successes as failures
      else {
        if ( r.success === false ) {
          r.failure = true;
          delete r.success;
        }
      }

      // Deduct failures
      if ( deductFailure ) {
        if ( r.failure ) r.count = -1;
      }
      else if ( invertFailure ) {
        if ( r.failure ) r.count = -1 * r.result;
      }
    }
  }

  /* -------------------------------------------- */
  /*  Factory Methods                             */
  /* -------------------------------------------- */

  /**
   * Determine whether a string expression matches this type of term
   * @param {string} expression               The expression to parse
   * @param {object} [options={}]             Additional options which customize the match
   * @param {boolean} [options.imputeNumber=true]  Allow the number of dice to be optional, i.e. "d6"
   * @return {RegExpMatchArray|null}
   */
  static matchTerm(expression, {imputeNumber=true}={}) {
    const match = expression.match(this.REGEXP);
    if ( !match ) return null;
    if ( (match[1] === undefined) && !imputeNumber ) return null;
    return match;
  }

  /* -------------------------------------------- */

  /**
   * Construct a term of this type given a matched regular expression array.
   * @param {RegExpMatchArray} match          The matched regular expression array
   * @return {DiceTerm}                      The constructed term
   */
  static fromMatch(match) {
    let [number, denomination, modifiers, flavor] = match.slice(1);

    // Get the denomination of DiceTerm
    denomination = denomination.toLowerCase();
    const cls = denomination in CONFIG.Dice.terms ? CONFIG.Dice.terms[denomination] : CONFIG.Dice.terms.d;
    if ( !foundry.utils.isSubclass(cls, DiceTerm) ) {
      throw new Error(`DiceTerm denomination ${denomination} not registered to CONFIG.Dice.terms as a valid DiceTerm class`);
    }

    // Get the term arguments
    number = Number.isNumeric(number) ? parseInt(number) : 1;
    const faces = Number.isNumeric(denomination) ? parseInt(denomination) : null;

    // Match modifiers
    modifiers = Array.from((modifiers || "").matchAll(DiceTerm.MODIFIER_REGEXP)).map(m => m[0]);

    // Construct a term of the appropriate denomination
    return new cls({number, faces, modifiers, options: {flavor}});
  }
}
