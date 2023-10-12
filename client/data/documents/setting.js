/**
 * The client-side Setting document which extends the common BaseSetting model.
 * @extends documents.BaseSetting
 * @mixes ClientDocumentMixin
 *
 * @see {@link WorldSettings}       The world-level collection of Setting documents
 */
class Setting extends ClientDocumentMixin(foundry.documents.BaseSetting) {

  /** @override */
  _onCreate(data, options, userId) {
    super._onCreate(data, options, userId);
    const config = game.settings.settings.get(this.key);
    if ( config.onChange instanceof Function ) config.onChange(this.value, options, userId);
  }

  /* -------------------------------------------- */

  /** @override */
  _onUpdate(changed, options, userId) {
    super._onUpdate(changed, options, userId);
    const config = game.settings.settings.get(this.key);
    if ( config.onChange instanceof Function ) config.onChange(this.value, options, userId);
  }
}
