/**
 * Pause notification in the HUD
 * @extends {Application}
 */
class Pause extends Application {
  static get defaultOptions() {
    const options = super.defaultOptions;
    options.id = "pause";
    options.template = "templates/hud/pause.html";
    options.popOut = false;
    return options;
  }

  /** @override */
  getData(options={}) {
    return { paused: game.paused };
  }
}
