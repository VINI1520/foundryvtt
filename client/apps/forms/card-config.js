/**
 * A DocumentSheet application responsible for displaying and editing a single embedded Card document.
 * @extends {DocumentSheet}
 * @param {Card} object                     The {@link Card} object being configured.
 * @param {DocumentSheetOptions} [options]  Application configuration options.
 */
class CardConfig extends DocumentSheet {

  /** @inheritdoc */
  static get defaultOptions() {
    return foundry.utils.mergeObject(super.defaultOptions, {
      classes: ["sheet", "card-config"],
      template: "templates/cards/card-config.html",
      width: 480,
      height: "auto",
      tabs: [{navSelector: ".tabs", contentSelector: "form", initial: "details"}]
    });
  }

  /* -------------------------------------------- */

  /** @inheritdoc */
  getData(options={}) {
    return foundry.utils.mergeObject(super.getData(options), {
      data: this.document.toObject(),  // Source data, not derived
      types: CONFIG.Card.typeLabels
    });
  }

  /* -------------------------------------------- */
  /*  Event Listeners and Handlers                */
  /* -------------------------------------------- */

  /** @inheritdoc */
  activateListeners(html) {
    super.activateListeners(html);
    html.find(".face-control").click(this._onFaceControl.bind(this));
  }

  /* -------------------------------------------- */

  /**
   * Handle card face control actions which modify single cards on the sheet.
   * @param {PointerEvent} event          The originating click event
   * @returns {Promise}                   A Promise which resolves once the handler has completed
   * @protected
   */
  async _onFaceControl(event) {
    const button = event.currentTarget;
    const face = button.closest(".face");
    const faces = this.object.toObject().faces;

    // Save any pending change to the form
    await this._onSubmit(event, {preventClose: true, preventRender: true});

    // Handle the control action
    switch ( button.dataset.action ) {
      case "addFace":
        faces.push({});
        return this.object.update({faces});
      case "deleteFace":
        return Dialog.confirm({
          title: game.i18n.localize("CARD.FaceDelete"),
          content: `<h4>${game.i18n.localize("AreYouSure")}</h4><p>${game.i18n.localize("CARD.FaceDeleteWarning")}</p>`,
          yes: () => {
            const i = Number(face.dataset.face);
            faces.splice(i, 1);
            return this.object.update({faces});
          }
        });
    }
  }
}
