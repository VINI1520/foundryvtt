/**
 * A Tour subclass for the Sidebar Tour
 */
class SidebarTour extends Tour {

  /** @override */
  async start() {
    game.togglePause(false);
    await super.start();
  }

  /* -------------------------------------------- */

  /** @override */
  async _preStep() {
    await super._preStep();

    // Configure specific steps
    if ( (this.id === "sidebar") || (this.id === "welcome") ) {
      await this._updateSidebarTab();
    }
  }

  /* -------------------------------------------- */

  async _updateSidebarTab() {
    if ( this.currentStep.sidebarTab ) {
      ui.sidebar.activateTab(this.currentStep.sidebarTab);
    }
  }
}
