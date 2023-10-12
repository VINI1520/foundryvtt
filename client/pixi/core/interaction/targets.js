/**
 * A subclass of Set which manages the Token ids which the User has targeted.
 * @extends {Set}
 * @see User#targets
 */
class UserTargets extends Set {
  constructor(user) {
    super();
    if ( user.targets ) throw new Error(`User ${user.id} already has a targets set defined`);
    this.user = user;
  }

  /**
   * Return the Token IDs which are user targets
   * @type {string[]}
   */
  get ids() {
    return Array.from(this).map(t => t.id);
  }

  /** @override */
  add(token) {
    super.add(token);
    this._hook(token, true);
  }

  /** @override */
  clear() {
    const tokens = Array.from(this);
    super.clear();
    tokens.forEach(t => this._hook(t, false));
  }

  /** @override */
  delete(token) {
    super.delete(token);
    this._hook(token, false);
  }

  /**
   * Dispatch the targetToken hook whenever the user's target set changes
   * @private
   */
  _hook(token, targeted) {
    /**
     * A hook event that fires when a token is targeted or un-targeted.
     * @function targetToken
     * @memberof hookEvents
     * @param {User} user        The User doing the targeting
     * @param {Token} token      The targeted Token
     * @param {boolean} targeted Whether the Token has been targeted or untargeted
     */
    Hooks.callAll("targetToken", this.user, token, targeted);
  }
}
