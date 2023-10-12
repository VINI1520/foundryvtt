/**
 * A type of DiceTerm used to represent flipping a two-sided coin.
 * @implements {DiceTerm}
 */
class Coin extends DiceTerm {
  constructor(termData) {
    super(termData);
    this.faces = 2;
  }

  /** @inheritdoc */
  static DENOMINATION = "c";

  /** @inheritdoc */
  static MODIFIERS = {
    "c": "call"
  };

  /* -------------------------------------------- */

  /** @inheritdoc */
  roll({minimize=false, maximize=false}={}) {
    const roll = {result: undefined, active: true};
    if ( minimize ) roll.result = 0;
    else if ( maximize ) roll.result = 1;
    else roll.result = Math.round(CONFIG.Dice.randomUniform());
    this.results.push(roll);
    return roll;
  }

  /* -------------------------------------------- */

  /** @inheritdoc */
  getResultLabel(result) {
    return {
      "0": "T",
      "1": "H"
    }[result.result];
  }

  /* -------------------------------------------- */

  /** @inheritdoc */
  getResultCSS(result) {
    return [
      this.constructor.name.toLowerCase(),
      result.result === 1 ? "heads" : "tails",
      result.success ? "success" : null,
      result.failure ? "failure" : null
    ]
  }

  /* -------------------------------------------- */
  /*  Term Modifiers                              */
  /* -------------------------------------------- */

  /**
   * Call the result of the coin flip, marking any coins that matched the called target as a success
   * 3dcc1      Flip 3 coins and treat "heads" as successes
   * 2dcc0      Flip 2 coins and treat "tails" as successes
   * @param {string} modifier     The matched modifier query
   */
  call(modifier) {

    // Match the modifier
    const rgx = /c([01])/i;
    const match = modifier.match(rgx);
    if ( !match ) return false;
    let [target] = match.slice(1);
    target = parseInt(target);

    // Treat each result which matched the call as a success
    for ( let r of this.results ) {
      const match = r.result === target;
      r.count = match ? 1 : 0;
      r.success = match;
    }
  }
}
