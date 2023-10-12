/**
 * The client-side Setting document which extends the common BaseSetting model.
 * @extends documents.BaseSetting
 * @mixes ClientDocumentMixin
 *
 * @see {@link WorldSettings}       The world-level collection of Setting documents
 */
class Setting extends ClientDocumentMixin(foundry.documents.BaseSetting) {

  /**
   * The types of settings which should be constructed as a function call rather than as a class constructor.
   */
  static #PRIMITIVE_TYPES = Object.freeze([String, Number, Boolean, Array, Symbol, BigInt]);

  /**
   * The setting configuration for this setting document.
   * @type {SettingsConfig|undefined}
   */
  get config() {
    return game.settings?.settings.get(this.key);
  }

  /* -------------------------------------------- */

  /** @inheritDoc */
  _initialize(options={}) {
    super._initialize(options);
    this.value = this._castType();
  }

  /* -------------------------------------------- */

  /** @override */
  _onCreate(data, options, userId) {
    super._onCreate(data, options, userId);
    const onChange = this.config?.onChange;
    if ( onChange instanceof Function ) onChange(this.value, options, userId);
  }

  /* -------------------------------------------- */

  /** @override */
  _onUpdate(changed, options, userId) {
    super._onUpdate(changed, options, userId);
    const onChange = this.config?.onChange;
    if ( ("value" in changed) && (onChange instanceof Function) ) onChange(this.value, options, userId);
  }

  /* -------------------------------------------- */

  /**
   * Cast the value of the Setting into its defined type.
   * @returns {*}     The initialized type of the Setting document.
   * @protected
   */
  _castType() {

    // Allow undefined and null directly
    if ( (this.value === null) || (this.value === undefined) ) return this.value;

    // Undefined type stays as a string
    const type = this.config?.type;
    if ( !(type instanceof Function) ) return this.value;

    // Primitive types
    if ( Setting.#PRIMITIVE_TYPES.includes(type) ) {
      if ( (type === String) && (typeof this.value !== "string") ) return JSON.stringify(this.value);
      if ( this.value instanceof type ) return this.value;
      return type(this.value);
    }

    // DataModel types
    if ( foundry.utils.isSubclass(type, foundry.abstract.DataModel) ) {
      return type.fromSource(this.value);
    }

    // Constructed types
    const isConstructed = type?.prototype?.constructor === type;
    return isConstructed ? new type(this.value) : type(this.value);
  }
}
