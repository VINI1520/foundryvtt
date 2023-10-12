/**
 * The singleton collection of RollTable documents which exist within the active World.
 * This Collection is accessible within the Game object as game.tables.
 * @extends {WorldCollection}
 *
 * @see {@link RollTable} The RollTable document
 * @see {@link RollTableDirectory} The RollTableDirectory sidebar directory
 */
class RollTables extends WorldCollection {

  /* -------------------------------------------- */
  /*  Properties                                  */
  /* -------------------------------------------- */

  /** @override */
  static documentName = "RollTable";

	/* -------------------------------------------- */

  /** @override */
  get directory() {
    return ui.tables;
  }

	/* -------------------------------------------- */

  /**
   * Register world settings related to RollTable documents
   */
  static registerSettings() {

    // Show Player Cursors
    game.settings.register("core", "animateRollTable", {
      name: "TABLE.AnimateSetting",
      hint: "TABLE.AnimateSettingHint",
      scope: "world",
      config: true,
      default: true,
      type: Boolean
    });
  }
}
