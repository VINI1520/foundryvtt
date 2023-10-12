/**
 * A type of RollTerm used to apply a function from the Math library.
 * @extends {RollTerm}
 */
class MathTerm extends RollTerm {
  constructor({fn, terms=[], options}={}) {
    super({options});

    /**
     * The named function in the Math environment which should be applied to the term
     * @type {string}
     */
    this.fn = fn;

    /**
     * An array of string argument terms for the function
     * @type {string[]}
     */
    this.terms = terms;
  }

  /**
   * The cached Roll instances for each function argument
   * @type {Roll[]}
   */
  rolls = [];

  /**
   * The cached result of evaluating the method arguments
   * @type {number}
   */
  result = undefined;

  /** @inheritdoc */
  isIntermediate = true;

  /** @inheritdoc */
  static SERIALIZE_ATTRIBUTES = ["fn", "terms"];

  /* -------------------------------------------- */
  /*  Math Term Attributes                        */
  /* -------------------------------------------- */

  /**
   * An array of evaluated DiceTerm instances that should be bubbled up to the parent Roll
   * @type {DiceTerm[]}
   */
  get dice() {
    return this._evaluated ? this.rolls.reduce((arr, r) => arr.concat(r.dice), []) : undefined;
  }

  /** @inheritdoc */
  get total() {
    return this.result;
  }

  /** @inheritdoc */
  get expression() {
    return `${this.fn}(${this.terms.join(",")})`;
  }

  /** @inheritdoc */
  get isDeterministic() {
    return this.terms.every(t => Roll.create(t).isDeterministic);
  }

  /* -------------------------------------------- */
  /*  Math Term Methods                           */
  /* -------------------------------------------- */

  /** @inheritdoc */
  _evaluateSync({minimize=false, maximize=false}={}) {
    this.rolls = this.terms.map(a => {
      const roll = Roll.create(a);
      roll.evaluate({minimize, maximize, async: false});
      if ( this.flavor ) roll.terms.forEach(t => t.options.flavor = t.options.flavor ?? this.flavor);
      return roll;
    });
    const args = this.rolls.map(r => r.total).join(", ");
    this.result = Roll.defaultImplementation.safeEval(`${this.fn}(${args})`);
    return this;
  }

  /** @inheritdoc */
  async _evaluate({minimize=false, maximize=false}={}) {
    for ( let term of this.terms ) {
      const roll = Roll.create(term);
      await roll.evaluate({minimize, maximize, async: true});
      if ( this.flavor ) roll.terms.forEach(t => t.options.flavor = t.options.flavor ?? this.flavor);
      this.rolls.push(roll);
    }
    const args = this.rolls.map(r => r.total).join(", ");
    this.result = Roll.defaultImplementation.safeEval(`${this.fn}(${args})`);
    return this;
  }
}
