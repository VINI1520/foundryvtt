/**
 * The directory, not displayed in the sidebar, which organizes and displays world-level Macro documents.
 * @extends {DocumentDirectory}
 *
 * @see {@link Macros}        The WorldCollection of Macro Documents
 * @see {@link Macro}         The Macro Document
 * @see {@link MacroConfig}   The Macro Configuration Sheet
 */
class MacroDirectory extends DocumentDirectory {
  constructor(options={}) {
    options.popOut = true;
    super(options);
    delete ui.sidebar.tabs["macros"];
    game.macros.apps.push(this);
  }

  /** @override */
  static documentName = "Macro";
}
