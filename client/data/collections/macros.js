/**
 * The singleton collection of Macro documents which exist within the active World.
 * This Collection is accessible within the Game object as game.macros.
 * @extends {WorldCollection}
 *
 * @see {@link Macro} The Macro document
 * @see {@link MacroDirectory} The MacroDirectory sidebar directory
 */
class Macros extends WorldCollection {

  /** @override */
  static documentName = "Macro";

  /* -------------------------------------------- */

  /** @override */
  get directory() {
    return ui.macros;
  }

  /* -------------------------------------------- */

  /** @inheritdoc */
  fromCompendium(document, options={}) {
    const data = super.fromCompendium(document, options);
    if ( options.clearOwnership ) data.author = game.user.id;
    return data;
  }
}
