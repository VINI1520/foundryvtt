/**
 * A type of DiceTerm used to represent a three-sided Fate/Fudge die.
 * Mathematically behaves like 1d3-2
 * @extends {DiceTerm}
 */
class FateDie extends DiceTerm {
  constructor(termData) {
    super(termData);
    this.faces = 3;
  }

  /** @inheritdoc */
  static DENOMINATION = "f";

  /** @inheritdoc */
  static MODIFIERS = {
    "r": Die.prototype.reroll,
    "rr": Die.prototype.rerollRecursive,
    "k": Die.prototype.keep,
    "kh": Die.prototype.keep,
    "kl": Die.prototype.keep,
    "d": Die.prototype.drop,
    "dh": Die.prototype.drop,
    "dl": Die.prototype.drop
  }

  /* -------------------------------------------- */

  /** @inheritdoc */
  roll({minimize=false, maximize=false}={}) {
    const roll = {result: undefined, active: true};
    if ( minimize ) roll.result = -1;
    else if ( maximize ) roll.result = 1;
    else roll.result = Math.ceil((CONFIG.Dice.randomUniform() * this.faces) - 2);
    if ( roll.result === -1 ) roll.failure = true;
    if ( roll.result === 1 ) roll.success = true;
    this.results.push(roll);
    return roll;
  }

  /* -------------------------------------------- */

  /** @inheritdoc */
  getResultLabel(result) {
    return {
      "-1": "-",
      "0": "&nbsp;",
      "1": "+"
    }[result.result];
  }
}
