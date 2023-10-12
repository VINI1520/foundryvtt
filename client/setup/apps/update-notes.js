/**
 * The client side Updater application
 * This displays the progress of patching/update progress for the VTT
 * @type {Application}
 */
class UpdateNotes extends Application {
  constructor(target, options) {
    super(options);
    this.target = target;
    this.candidateReleaseData = new foundry.config.ReleaseData(this.target);
    ui.updateNotes = this;
  }

  /* ----------------------------------------- */

  /** @override */
	static get defaultOptions() {
	  return mergeObject(super.defaultOptions, {
	    id: "update-notes",
      template: "templates/setup/update-notes.html",
      width: 600
    });
  }

  /* ----------------------------------------- */

  /** @override */
  get title() {
    return `Update Notes - Foundry Virtual Tabletop ${this.candidateReleaseData.display}`;
  }

  /* ----------------------------------------- */

  /** @override */
  async getData(options={}) {
    return {
      notes: this.target.notes
    }
  }

  /* ----------------------------------------- */

  /** @override */
  activateListeners(html) {
    super.activateListeners(html);
    html.find("button").click(ev => {
      ev.preventDefault();
      ev.currentTarget.disabled = true;
      document.getElementById("update-core").click();
    });
  }

  /* ----------------------------------------- */

  /**
   * Update the button at the footer of the Update Notes application to reflect the current status of the workflow.
   * @param {object} progressData       Data supplied by SetupConfig#_onCoreUpdate
   */
  static updateButton(progressData) {
    const notes = ui.updateNotes;
    if ( !notes?.rendered ) return;
    const button = notes.element.find("button")[0];
    if ( !button ) return;
    const icon = button.querySelector("i");
    icon.className = progressData.pct < 100 ? "fas fa-spinner fa-pulse" : "fas fa-check";
    const label = button.querySelector("label");
    label.textContent = game.i18n.localize(progressData.step);
  }
}
