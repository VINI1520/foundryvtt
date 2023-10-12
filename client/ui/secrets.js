/**
 * @callback HTMLSecretContentCallback
 * @param {HTMLElement} secret  The secret element whose surrounding content we wish to retrieve.
 * @returns {string}            The content where the secret is housed.
 */

/**
 * @callback HTMLSecretUpdateCallback
 * @param {HTMLElement} secret         The secret element that is being manipulated.
 * @param {string} content             The content block containing the updated secret element.
 * @returns {Promise<ClientDocument>}  The updated Document.
 */

/**
 * @typedef {object} HTMLSecretConfiguration
 * @property {string} parentSelector      The CSS selector used to target content that contains secret blocks.
 * @property {{
 *   content: HTMLSecretContentCallback,
 *   update: HTMLSecretUpdateCallback
 * }} callbacks                           An object of callback functions for each operation.
 */

/**
 * A composable class for managing functionality for secret blocks within DocumentSheets.
 * {@see DocumentSheet}
 * @example Activate secret revealing functionality within a certain block of content.
 * ```js
 * const secrets = new HTMLSecret({
 *   selector: "section.secret[id]",
 *   callbacks: {
 *     content: this._getSecretContent.bind(this),
 *     update: this._updateSecret.bind(this)
 *   }
 * });
 * secrets.bind(html);
 * ```
 */
class HTMLSecret {
  /**
   * @param {HTMLSecretConfiguration} config  Configuration options.
   */
  constructor({parentSelector, callbacks={}}={}) {
    /**
     * The CSS selector used to target secret blocks.
     * @type {string}
     */
    Object.defineProperty(this, "parentSelector", {value: parentSelector, writable: false});

    /**
     * An object of callback functions for each operation.
     * @type {{content: HTMLSecretContentCallback, update: HTMLSecretUpdateCallback}}
     */
    Object.defineProperty(this, "callbacks", {value: Object.freeze(callbacks), writable: false});
  }

  /* -------------------------------------------- */

  /**
   * Add event listeners to the targeted secret blocks.
   * @param {HTMLElement} html  The HTML content to select secret blocks from.
   */
  bind(html) {
    if ( !this.callbacks.content || !this.callbacks.update ) return;
    const parents = html.querySelectorAll(this.parentSelector);
    for ( const parent of parents ) {
      parent.querySelectorAll("section.secret[id]").forEach(secret => {
        const revealed = secret.classList.contains("revealed");
        const reveal = document.createElement("button");
        reveal.type = "button";
        reveal.classList.add("reveal");
        reveal.textContent = game.i18n.localize(`EDITOR.${revealed ? "Hide" : "Reveal"}`);
        secret.insertBefore(reveal, secret.firstChild);
        reveal.addEventListener("click", this._onToggleSecret.bind(this));
      });
    }
  }

  /* -------------------------------------------- */

  /**
   * Handle toggling a secret's revealed state.
   * @param {MouseEvent} event           The triggering click event.
   * @returns {Promise<ClientDocument>}  The Document whose content was modified.
   * @protected
   */
  _onToggleSecret(event) {
    event.preventDefault();
    const secret = event.currentTarget.closest(".secret");
    const id = secret?.id;
    if ( !id ) return;
    const content = this.callbacks.content(secret);
    if ( !content ) return;
    const revealed = secret.classList.contains("revealed");
    const modified = content.replace(new RegExp(`<section[^i]+id="${id}"[^>]*>`), () => {
      return `<section class="secret${revealed ? "" : " revealed"}" id="${id}">`;
    });
    return this.callbacks.update(secret, modified);
  }
}
