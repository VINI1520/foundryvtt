/**
 * An abstract class which represents a single token that can be used as part of a Roll formula.
 * Every portion of a Roll formula is parsed into a subclass of RollTerm in order for the Roll to be fully evaluated.
 */
class RollTerm {
  constructor({options={}}={}) {

    /**
     * An object of additional options which describes and modifies the term.
     * @type {object}
     */
    this.options = options;

    /**
     * An internal flag for whether the term has been evaluated
     * @type {boolean}
     */
    this._evaluated = false;
  }

  /**
   * Is this term intermediate, and should be evaluated first as part of the simplification process?
   * @type {boolean}
   */
  isIntermediate = false;

  /**
   * A regular expression pattern which identifies optional term-level flavor text
   * @type {string}
   */
  static FLAVOR_REGEXP_STRING = "(?:\\[([^\\]]+)\\])";

  /**
   * A regular expression which identifies term-level flavor text
   * @type {RegExp}
   */
  static FLAVOR_REGEXP = new RegExp(RollTerm.FLAVOR_REGEXP_STRING, "g");

  /**
   * A regular expression used to match a term of this type
   * @type {RegExp}
   */
  static REGEXP = undefined;

  /**
   * An array of additional attributes which should be retained when the term is serialized
   * @type {string[]}
   */
  static SERIALIZE_ATTRIBUTES = [];

  /* -------------------------------------------- */
  /*  RollTerm Attributes                         */
  /* -------------------------------------------- */

  /**
   * A string representation of the formula expression for this RollTerm, prior to evaluation.
   * @type {string}
   */
  get expression() {
    throw new Error(`The ${this.constructor.name} class must implement the expression attribute`);
  }

  /**
   * A string representation of the formula, including optional flavor text.
   * @type {string}
   */
  get formula() {
    let f = this.expression;
    if ( this.flavor ) f += `[${this.flavor}]`;
    return f;
  }

  /**
   * A string or numeric representation of the final output for this term, after evaluation.
   * @type {number|string}
   */
  get total() {
    throw new Error(`The ${this.constructor.name} class must implement the total attribute`);
  }

  /**
   * Optional flavor text which modifies and describes this term.
   * @type {string}
   */
  get flavor() {
    return this.options.flavor || "";
  }

  /**
   * Whether this term is entirely deterministic or contains some randomness.
   * @type {boolean}
   */
  get isDeterministic() {
    return true;
  }

  /* -------------------------------------------- */
  /*  RollTerm Methods                            */
  /* -------------------------------------------- */

  /**
   * Evaluate the term, processing its inputs and finalizing its total.
   * @param {object} [options={}]           Options which modify how the RollTerm is evaluated
   * @param {boolean} [options.minimize=false]    Minimize the result, obtaining the smallest possible value.
   * @param {boolean} [options.maximize=false]    Maximize the result, obtaining the largest possible value.
   * @param {boolean} [options.async=false]       Evaluate the term asynchronously, receiving a Promise as the returned value.
   *                                              This will become the default behavior in version 10.x
   * @returns {RollTerm}                     The evaluated RollTerm
   */
  evaluate({minimize=false, maximize=false, async=false}={}) {
    if ( this._evaluated ) {
      throw new Error(`The ${this.constructor.name} has already been evaluated and is now immutable`);
    }
    this._evaluated = true;
    return async ? this._evaluate({minimize, maximize}) : this._evaluateSync({minimize, maximize});
  }

  /**
   * Evaluate the term.
   * @param {object} [options={}]           Options which modify how the RollTerm is evaluated, see RollTerm#evaluate
   * @returns {Promise<RollTerm>}
   * @private
   */
  async _evaluate({minimize=false, maximize=false}={}) {
    return this._evaluateSync({minimize, maximize});
  }

  /**
   * This method is temporarily factored out in order to provide different behaviors synchronous evaluation.
   * This will be removed in 0.10.x
   * @private
   */
  _evaluateSync({minimize=false, maximize=false}={}) {
    return this;
  }

  /* -------------------------------------------- */
  /*  Serialization and Loading                   */
  /* -------------------------------------------- */

  /**
   * Construct a RollTerm from a provided data object
   * @param {object} data         Provided data from an un-serialized term
   * @return {RollTerm}           The constructed RollTerm
   */
  static fromData(data) {
    let cls = CONFIG.Dice.termTypes[data.class];
    if ( !cls ) cls = Object.values(CONFIG.Dice.terms).find(c => c.name === data.class) || Die;
    return cls._fromData(data);
  }

  /* -------------------------------------------- */

  /**
   * Define term-specific logic for how a de-serialized data object is restored as a functional RollTerm
   * @param {object} data         The de-serialized term data
   * @returns {RollTerm}          The re-constructed RollTerm object
   * @protected
   */
  static _fromData(data) {
    const term = new this(data);
    term._evaluated = data.evaluated ?? true;
    return term;
  }

  /* -------------------------------------------- */

  /**
   * Reconstruct a RollTerm instance from a provided JSON string
   * @param {string} json   A serialized JSON representation of a DiceTerm
   * @return {RollTerm}     A reconstructed RollTerm from the provided JSON
   */
  static fromJSON(json) {
    let data;
    try {
      data = JSON.parse(json);
    } catch(err) {
      throw new Error("You must pass a valid JSON string");
    }
    return this.fromData(data);
  }

  /* -------------------------------------------- */

  /**
   * Serialize the RollTerm to a JSON string which allows it to be saved in the database or embedded in text.
   * This method should return an object suitable for passing to the JSON.stringify function.
   * @return {object}
   */
  toJSON() {
    const data = {
      class: this.constructor.name,
      options: this.options,
      evaluated: this._evaluated
    };
    for ( let attr of this.constructor.SERIALIZE_ATTRIBUTES ) {
      data[attr] = this[attr];
    }
    return data;
  }
}
