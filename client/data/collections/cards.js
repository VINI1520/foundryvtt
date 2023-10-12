/**
 * The collection of Cards documents which exist within the active World.
 * This Collection is accessible within the Game object as game.cards.
 * @extends {WorldCollection}
 * @see {@link Cards} The Cards document
 */
class CardStacks extends WorldCollection {

  /** @override */
  static documentName = "Cards";
}
