/**
 * A Dialog subclass which allows the user to configure export options for a Folder
 * @extends {Dialog}
 */
class FolderExport extends Dialog {

  /** @override */
  activateListeners(html) {
    super.activateListeners(html);
    html.find('select[name="pack"]').change(this._onPackChange.bind(this));
  }

  /* -------------------------------------------- */

  /**
   * Handle changing the selected pack by updating the dropdown of folders available.
   * @param {Event} event   The input change event
   */
  _onPackChange(event) {
    const select = this.element.find('select[name="folder"]')[0];
    const pack = game.packs.get(event.target.value);
    if ( !pack ) {
      select.disabled = true;
      return;
    }
    const folders = pack._formatFolderSelectOptions();
    select.disabled = folders.length === 0;
    select.innerHTML = HandlebarsHelpers.selectOptions(folders, {hash: {
      blank: "",
      nameAttr: "id",
      labelAttr: "name"
    }});
  }
}
