/**
 * @typedef {object} SearchFilterConfiguration
 * @property {object} options          Options which customize the behavior of the filter
 * @property {string} options.inputSelector    The CSS selector used to target the text input element.
 * @property {string} options.contentSelector  The CSS selector used to target the content container for these tabs.
 * @property {Function} options.callback       A callback function which executes when the filter changes.
 * @property {string} [options.initial]        The initial value of the search query.
 * @property {number} [options.delay=200]      The number of milliseconds to wait for text input before processing.
 */

/**
 * A controller class for managing a text input widget that filters the contents of some other UI element
 * @see {@link Application}
 *
 * @param {SearchFilterConfiguration}
 */
class SearchFilter {
  // Average typing speed is 167 ms per character, per https://stackoverflow.com/a/4098779
  constructor({inputSelector, contentSelector, initial="", callback, delay=200}={}) {

    /**
     * The value of the current query string
     * @type {string}
     */
    this.query = initial;

    /**
     * A callback function to trigger when the tab is changed
     * @type {Function|null}
     */
    this.callback = callback;

    /**
     * The regular expression corresponding to the query that should be matched against
     * @type {RegExp}
     */
    this.rgx = undefined;

    /**
     * The CSS selector used to target the tab navigation element
     * @type {string}
     */
    this._inputSelector = inputSelector;

    /**
     * A reference to the HTML navigation element the tab controller is bound to
     * @type {HTMLElement|null}
     */
    this._input = null;

    /**
     * The CSS selector used to target the tab content element
     * @type {string}
     */
    this._contentSelector = contentSelector;

    /**
     * A reference to the HTML container element of the tab content
     * @type {HTMLElement|null}
     */
    this._content = null;

    /**
     * A debounced function which applies the search filtering
     * @type {Function}
     */
    this._filter = foundry.utils.debounce(this.callback, delay);
  }

  /* -------------------------------------------- */

  /**
   * Bind the SearchFilter controller to an HTML application
   * @param {HTMLElement} html
   */
  bind(html) {

    // Identify navigation element
    this._input = html.querySelector(this._inputSelector);
    if ( !this._input ) return;
    this._input.value = this.query;

    // Identify content container
    if ( !this._contentSelector ) this._content = null;
    else if ( html.matches(this._contentSelector) ) this._content = html;
    else this._content = html.querySelector(this._contentSelector);

    // Register the handler for input changes
    // Use the input event which also captures clearing the filter
    // https://developer.mozilla.org/en-US/docs/Web/API/HTMLElement/input_event
    this._input.addEventListener("input", event => {
      event.preventDefault();
      this.filter(event, event.currentTarget.value);
    });

    // Apply the initial filtering conditions
    const event = new KeyboardEvent("input", {key: "Enter", code: "Enter"});
    this.filter(event, this.query);
  }

  /* -------------------------------------------- */

  /**
   * Perform a filtering of the content by invoking the callback function
   * @param {KeyboardEvent} event   The triggering keyboard event
   * @param {string} query          The input search string
   */
  filter(event, query) {
    this.query = SearchFilter.cleanQuery(query);
    this.rgx = new RegExp(RegExp.escape(this.query), "i");
    this._filter(event, this.query, this.rgx, this._content);
  }

  /* -------------------------------------------- */

  /**
   * Clean a query term to standardize it for matching.
   * See https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/String/normalize
   * @param {string} query    An input string which may contain leading/trailing spaces or diacritics
   * @returns {string}        A cleaned string of ASCII characters for comparison
   */
  static cleanQuery(query) {
    return query.trim().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  }
}
