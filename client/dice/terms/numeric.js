/**
 * A type of RollTerm used to represent static numbers.
 * @extends {RollTerm}
 */
class NumericTerm extends RollTerm {
  constructor({number, options}={}) {
    super({options});
    this.number = Number(number);
  }

  /** @inheritdoc */
  static REGEXP = new RegExp(`^([0-9]+(?:\\.[0-9]+)?)${RollTerm.FLAVOR_REGEXP_STRING}?$`);

  /** @inheritdoc */
  static SERIALIZE_ATTRIBUTES = ["number"];

  /** @inheritdoc */
  get expression() {
    return String(this.number);
  }

  /** @inheritdoc */
  get total() {
    return this.number;
  }

  /* -------------------------------------------- */
  /*  Factory Methods                             */
  /* -------------------------------------------- */

  /**
   * Determine whether a string expression matches a NumericTerm
   * @param {string} expression               The expression to parse
   * @return {RegExpMatchArray|null}
   */
  static matchTerm(expression) {
    return expression.match(this.REGEXP) || null;
  }

  /* -------------------------------------------- */

  /**
   * Construct a term of this type given a matched regular expression array.
   * @param {RegExpMatchArray} match          The matched regular expression array
   * @return {NumericTerm}                    The constructed term
   */
  static fromMatch(match) {
    let [number, flavor] = match.slice(1);
    return new this({number, options: {flavor}});
  }
}
