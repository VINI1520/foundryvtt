/**
 * The Application responsible for configuring the CombatTracker and its contents.
 * @extends {FormApplication}
 */
class CombatTrackerConfig extends FormApplication {

  /** @inheritdoc */
  static get defaultOptions() {
    return foundry.utils.mergeObject(super.defaultOptions, {
      id: "combat-config",
      title: game.i18n.localize("COMBAT.Settings"),
      classes: ["sheet", "combat-sheet"],
      template: "templates/sheets/combat-config.html",
      width: 420
    });
  }

  /* -------------------------------------------- */

  /** @override */
  async getData(options={}) {
    const attributes = TokenDocument.implementation.getTrackedAttributes();
    attributes.bar.forEach(a => a.push("value"));
    return {
      settings: game.settings.get("core", Combat.CONFIG_SETTING),
      attributeChoices: TokenDocument.implementation.getTrackedAttributeChoices(attributes)
    };
  }

  /* -------------------------------------------- */

  /** @override */
  async _updateObject(event, formData) {
    return game.settings.set("core", Combat.CONFIG_SETTING, {
      resource: formData.resource,
      skipDefeated: formData.skipDefeated
    });
  }
}
