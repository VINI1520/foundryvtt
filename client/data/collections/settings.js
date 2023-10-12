/**
 * The Collection of Setting documents which exist within the active World.
 * This collection is accessible as game.settings.storage.get("world")
 * @extends {WorldCollection}
 *
 * @see {@link Setting} The Setting document
 */
class WorldSettings extends WorldCollection {

  /** @override */
  static documentName = "Setting";

  /* -------------------------------------------- */

  /** @override */
  get directory() {
    return null;
  }

  /* -------------------------------------------- */
  /* World Settings Methods                       */
  /* -------------------------------------------- */

  /**
   * Return the Setting document with the given key.
   * @param {string} key        The setting key
   * @returns {Setting}         The Setting
   */
  getSetting(key) {
    return this.find(s => s.key === key);
  }

  /**
   * Return the serialized value of the world setting as a string
   * @param {string} key    The setting key
   * @returns {string|null}  The serialized setting string
   */
  getItem(key) {
    return this.getSetting(key)?.value ?? null;
  }
}
