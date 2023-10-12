/**
 * A type of RollTerm used to denote and perform an arithmetic operation.
 * @extends {RollTerm}
 */
class OperatorTerm extends RollTerm {
  constructor({operator, options}={}) {
    super({options});
    this.operator = operator;
  }

  /**
   * An array of operators which represent arithmetic operations
   * @type {string[]}
   */
  static OPERATORS = ["+", "-", "*", "/", "%"];

  /** @inheritdoc */
  static REGEXP = new RegExp(OperatorTerm.OPERATORS.map(o => "\\"+o).join("|"), "g");

  /** @inheritdoc */
  static SERIALIZE_ATTRIBUTES = ["operator"];

  /** @inheritdoc */
  get flavor() {
    return ""; // Operator terms cannot have flavor text
  }

  /** @inheritdoc */
  get expression() {
    return ` ${this.operator} `;
  }

  /** @inheritdoc */
  get total() {
    return ` ${this.operator} `;
  }
}
