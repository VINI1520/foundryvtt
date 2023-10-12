/**
 * The Setup Authentication Form
 * @extends {Application}
 */
class SetupAuthenticationForm extends Application {
  /** @inheritdoc */
	static get defaultOptions() {
	  return foundry.utils.mergeObject(super.defaultOptions, {
	    id: "setup-authentication",
      template: "templates/setup/setup-authentication.html",
      popOut: false
    });
  }
}
