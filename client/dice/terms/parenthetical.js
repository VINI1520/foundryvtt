/**
 * A type of RollTerm used to enclose a parenthetical expression to be recursively evaluated.
 * @extends {RollTerm}
 */
class ParentheticalTerm extends RollTerm {
  constructor({term, roll, options}) {
    super({options});

    /**
     * The original provided string term used to construct the parenthetical
     * @type {string}
     */
    this.term = term;

    /**
     * Alternatively, an already-evaluated Roll instance may be passed directly
     * @type {Roll}
     */
    this.roll = roll;

    // If a roll was explicitly passed in, the parenthetical has already been evaluated
    if ( this.roll ) {
      this.term = roll.formula;
      this._evaluated = this.roll._evaluated;
    }
  }

  /** @inheritdoc */
  isIntermediate = true;

  /**
   * The regular expression pattern used to identify the opening of a parenthetical expression.
   * This could also identify the opening of a math function.
   * @type {RegExp}
   */
  static OPEN_REGEXP = /([A-z][A-z0-9]+)?\(/g;

  /**
   * A regular expression pattern used to identify the closing of a parenthetical expression.
   * @type {RegExp}
   */
  static CLOSE_REGEXP = new RegExp("\\)(?:\\$\\$F[0-9]+\\$\\$)?", "g");

  /** @inheritdoc */
  static SERIALIZE_ATTRIBUTES = ["term"];

  /* -------------------------------------------- */
  /*  Parenthetical Term Attributes               */
  /* -------------------------------------------- */

  /**
   * An array of evaluated DiceTerm instances that should be bubbled up to the parent Roll
   * @type {DiceTerm[]}
   */
  get dice() {
    return this.roll?.dice;
  }

  /** @inheritdoc */
  get total() {
    return this.roll.total;
  }

  /** @inheritdoc */
  get expression() {
    return `(${this.term})`;
  }

  /** @inheritdoc */
  get isDeterministic() {
    return Roll.create(this.term).isDeterministic;
  }

  /* -------------------------------------------- */
  /*  Parenthetical Term Methods                  */
  /* -------------------------------------------- */

  /** @inheritdoc */
  _evaluateSync({minimize=false, maximize=false}={}) {

    // Evaluate the inner Roll
    const roll = this.roll || Roll.create(this.term);
    this.roll = roll.evaluate({minimize, maximize, async: false});

    // Propagate flavor text to inner terms
    if ( this.flavor ) this.roll.terms.forEach(t => t.options.flavor = t.options.flavor ?? this.flavor);
    return this;
  }

  /** @inheritdoc */
  async _evaluate({minimize=false, maximize=false}={}) {

    // Evaluate the inner Roll
    const roll = this.roll || Roll.create(this.term);
    this.roll = await roll.evaluate({minimize, maximize, async: true});

    // Propagate flavor text to inner terms
    if ( this.flavor ) this.roll.terms.forEach(t => t.options.flavor = t.options.flavor ?? this.flavor);
    return this;
  }

  /* -------------------------------------------- */

  /**
   * Construct a ParentheticalTerm from an Array of component terms which should be wrapped inside the parentheses.
   * @param {RollTerm[]} terms      The array of terms to use as internal parts of the parenthetical
   * @param {object} [options={}]   Additional options passed to the ParentheticalTerm constructor
   * @returns {ParentheticalTerm}   The constructed ParentheticalTerm instance
   *
   * @example Create a Parenthetical Term from an array of component RollTerm instances
   * ```js
   * const d6 = new Die({number: 4, faces: 6});
   * const plus = new OperatorTerm({operator: "+"});
   * const bonus = new NumericTerm({number: 4});
   * t = ParentheticalTerm.fromTerms([d6, plus, bonus]);
   * t.formula; // (4d6 + 4)
   * ```
   */
  static fromTerms(terms, options) {
    const roll = Roll.defaultImplementation.fromTerms(terms);
    return new this({roll, options});
  }
}
