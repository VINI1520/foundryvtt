/**
 * The singleton collection of Item documents which exist within the active World.
 * This Collection is accessible within the Game object as game.items.
 * @extends {WorldCollection}
 *
 * @see {@link Item} The Item document
 * @see {@link ItemDirectory} The ItemDirectory sidebar directory
 */
class Items extends WorldCollection {

  /** @override */
  static documentName = "Item";
}
