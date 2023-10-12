/**
 * A type of RollTerm used to represent strings which have not yet been matched.
 * @extends {RollTerm}
 */
class StringTerm extends RollTerm {
  constructor({term, options}={}) {
    super({options});
    this.term = term;
  }

  /** @inheritdoc */
  static SERIALIZE_ATTRIBUTES = ["term"];

  /** @inheritdoc */
  get expression() {
    return this.term;
  }

  /** @inheritdoc */
  get total() {
    return this.term;
  }

  /** @inheritdoc */
  get isDeterministic() {
    const classified = Roll.defaultImplementation._classifyStringTerm(this.term, {intermediate: false});
    if ( classified instanceof StringTerm ) return true;
    return classified.isDeterministic;
  }

  /** @inheritdoc */
  evaluate(options={}) {
    throw new Error(`Unresolved StringTerm ${this.term} requested for evaluation`);
  }
}
