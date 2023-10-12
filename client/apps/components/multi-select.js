/**
 * An abstract base class designed to standardize the behavior for a multi-select UI component.
 * Multi-select components return an array of values as part of form submission.
 * Different implementations may provide different experiences around how inputs are presented to the user.
 * @abstract
 * @internal
 * @category - Custom HTML Elements
 * @fires change
 */
class AbstractMultiSelectElement extends HTMLElement {
  constructor() {
    super();
    this._initializeOptions();
  }

  /**
   * The "change" event is emitted when the values of the multi-select element are changed.
   * @param {Event} event     A "change" event passed to event listeners.
   * @event change
   */
  static onChange;

  /**
   * Predefined <option> and <optgroup> elements which were defined in the original HTML.
   * @type {(HTMLOptionElement|HTMLOptgroupElement)[]}
   * @protected
   */
  _options;

  /**
   * An object which maps option values to displayed labels.
   * @type {Object<string, string>}
   * @protected
   */
  _choices = {};

  /**
   * An array of identifiers which have been chosen.
   * @type {Set<string>}
   * @protected
   */
  _chosen = new Set();

  /**
   * The form this custom element belongs to, if any.
   * @type {HTMLFormElement|null}
   */
  form = null;

  /**
   * The bound form data handler method
   * @type {Function|null}
   */
  #formDataHandler = null;

  /* -------------------------------------------- */

  /**
   * Preserve existing <option> and <optgroup> elements which are defined in the original HTML.
   * @protected
   */
  _initializeOptions() {
    this._options = [...this.children];
    for ( const option of this.querySelectorAll("option") ) {
      if ( !option.value ) continue; // Skip predefined options which are already blank
      this._choices[option.value] = option.innerText;
      if ( option.selected ) {
        this._chosen.add(option.value);
        option.selected = false;
      }
    }
  }

  /* -------------------------------------------- */

  /**
   * The name of the multi-select input element.
   * @type {string}
   */
  get name() {
    return this.getAttribute("name");
  }

  set name(value) {
    if ( !value || (typeof value !== "string") ) {
      throw new Error("The name attribute of the multi-select element must be a non-empty string");
    }
    this.setAttribute("name", value);
  }

  /* -------------------------------------------- */

  /**
   * The values of the multi-select input are expressed as an array of strings.
   * @type {string[]}
   */
  get value() {
    return Array.from(this._chosen);
  }

  set value(values) {
    if ( !Array.isArray(values) ) {
      throw new Error("The value assigned to a multi-select element must be an array.");
    }
    if ( values.some(v => !(v in this._choices)) ) {
      throw new Error("The values assigned to a multi-select element must all be valid options.");
    }
    this._chosen.clear();
    for ( const v of values ) this._chosen.add(v);
    this.dispatchEvent(new Event("change"));
  }

  /* -------------------------------------------- */

  /**
   * Activate the custom element when it is attached to the DOM.
   * @inheritDoc
   */
  connectedCallback() {
    this.replaceChildren();
    const elements = this._buildElements();
    this._refresh();
    this.append(...elements);
    this._activateListeners();
  }

  /* -------------------------------------------- */

  /**
   * Deactivate the custom element when it is detached from the DOM.
   * @inheritDoc
   */
  disconnectedCallback() {
    if ( this.form ) {
      delete this.form[this.name];
      delete this.form.elements[this.name];
      this.form.removeEventListener("formdata", this.#formDataHandler);
    }
    this.form = this.#formDataHandler = null;
  }

  /* -------------------------------------------- */

  /**
   * Mark a choice as selected.
   * @param {string} value      The value to add to the chosen set
   */
  select(value) {
    const exists = this._chosen.has(value);
    if ( !exists ) {
      if ( !(value in this._choices) ) {
        throw new Error(`"${value}" is not an option allowed by this multi-select element`);
      }
      this._chosen.add(value);
      this.dispatchEvent(new Event("change"));
      this._refresh();
    }
  }

  /* -------------------------------------------- */

  /**
   * Mark a choice as un-selected.
   * @param {string} value      The value to delete from the chosen set
   */
  unselect(value) {
    const exists = this._chosen.has(value);
    if ( exists ) {
      this._chosen.delete(value);
      this.dispatchEvent(new Event("change"));
      this._refresh();
    }
  }

  /* -------------------------------------------- */

  /**
   * Create the HTML elements that should be included in this custom element.
   * Elements are returned as an array of ordered children.
   * @returns {HTMLElement[]}
   * @protected
   */
  _buildElements() {
    return [];
  }

  /* -------------------------------------------- */

  /**
   * Refresh the active state of the custom element by reflecting changes to the _chosen set.
   * @protected
   */
  _refresh() {}

  /* -------------------------------------------- */

  /**
   * Activate event listeners which add dynamic behavior to the custom element.
   * @protected
   */
  _activateListeners() {
    this.form = this.closest("form");
    if ( this.form ) {
      this.form[this.name] = this.form.elements[this.name] = this;
      this.#formDataHandler = this.#onFormData.bind(this);
      this.form.addEventListener("formdata", this.#formDataHandler);
    }
  }

  /* -------------------------------------------- */

  /**
   * Add the value of the custom element to processed FormData.
   * @param {FormDataEvent} event
   */
  #onFormData(event) {
    for ( const value of this._chosen ) {
      event.formData.append(this.name, value);
    }
  }
}

/* -------------------------------------------- */

/**
 * Provide a multi-select workflow using a select element as the input mechanism.
 * @internal
 * @category - Custom HTML Elements
 *
 * @example Multi-Select HTML Markup
 * ```html
 * <multi-select name="select-many-things">
 *   <optgroup label="Basic Options">
 *     <option value="foo">Foo</option>
 *     <option value="bar">Bar</option>
 *     <option value="baz">Baz</option>
 *   </optgroup>
 *   <optgroup label="Advanced Options">
 *    <option value="fizz">Fizz</option>
 *     <option value="buzz">Buzz</option>
 *   </optgroup>
 * </multi-select>
 * ```
 */
class HTMLMultiSelectElement extends AbstractMultiSelectElement {

  /**
   * A select element used to choose options.
   * @type {HTMLSelectElement}
   */
  #select;

  /**
   * A display element which lists the chosen options.
   * @type {HTMLDivElement}
   */
  #tags;

  /* -------------------------------------------- */

  /** @override */
  _buildElements() {

    // Create select element
    this.#select = document.createElement("select");
    this.#select.insertAdjacentHTML("afterbegin", '<option value=""></option>');
    this.#select.append(...this._options);

    // Create a div element for display
    this.#tags = document.createElement("div");
    this.#tags.classList.add("tags", "chosen");
    return [this.#tags, this.#select];
  }

  /* -------------------------------------------- */

  /** @override */
  _refresh() {

    // Update the displayed tags
    this.#tags.innerHTML = Array.from(this._chosen).map(id => {
      return `<span class="tag" data-value="${id}">${this._choices[id]} <i class="fa-solid fa-times"></i></span>`;
    }).join("");

    // Disable selected options
    for ( const option of this.#select.querySelectorAll("option") ) {
      option.disabled = this._chosen.has(option.value);
    }
  }

  /* -------------------------------------------- */

  /** @override */
  _activateListeners() {
    super._activateListeners();
    this.#select.addEventListener("change", this.#onChangeSelect.bind(this));
    this.#tags.addEventListener("click", this.#onClickTag.bind(this));
  }

  /* -------------------------------------------- */

  /**
   * Handle changes to the Select input, marking the selected option as a chosen value.
   * @param {Event} event         The change event on the select element
   */
  #onChangeSelect(event) {
    event.preventDefault();
    event.stopImmediatePropagation();
    const select = event.currentTarget;
    if ( !select.value ) return; // Ignore selection of the blank value
    this.select(select.value);
    select.value = "";
  }

  /* -------------------------------------------- */

  /**
   * Handle click events on a tagged value, removing it from the chosen set.
   * @param {PointerEvent} event    The originating click event on a chosen tag
   */
  #onClickTag(event) {
    event.preventDefault();
    const tag = event.target.closest(".tag");
    this.unselect(tag.dataset.value);
  }
}

/* -------------------------------------------- */

/**
 * Provide a multi-select workflow as a grid of input checkbox elements.
 * @internal
 * @category - Custom HTML Elements
 *
 * @example Multi-Checkbox HTML Markup
 * ```html
 * <multi-checkbox name="check-many-boxes">
 *   <optgroup label="Basic Options">
 *     <option value="foo">Foo</option>
 *     <option value="bar">Bar</option>
 *     <option value="baz">Baz</option>
 *   </optgroup>
 *   <optgroup label="Advanced Options">
 *    <option value="fizz">Fizz</option>
 *     <option value="buzz">Buzz</option>
 *   </optgroup>
 * </multi-checkbox>
 * ```
 */
class HTMLMultiCheckboxElement extends AbstractMultiSelectElement {

  /**
   * The checkbox elements used to select inputs
   * @type {HTMLInputElement[]}
   */
  #checkboxes;

  /* -------------------------------------------- */

  /** @override */
  _buildElements() {
    this.#checkboxes = [];
    const children = [];
    for ( const option of this._options ) {
      if ( option instanceof HTMLOptGroupElement ) children.push(this.#buildGroup(option));
      else children.push(this.#buildOption(option));
    }
    return children;
  }

  /* -------------------------------------------- */

  /**
   * Translate an input <optgroup> element into a <fieldset> of checkboxes.
   * @param {HTMLOptGroupElement} optgroup    The originally configured optgroup
   * @returns {HTMLFieldSetElement}           The created fieldset grouping
   */
  #buildGroup(optgroup) {

    // Create fieldset group
    const group = document.createElement("fieldset");
    group.classList.add("checkbox-group");
    const legend = document.createElement("legend");
    legend.innerText = optgroup.label;
    group.append(legend);

    // Add child options
    for ( const option of optgroup.children ) {
      if ( option instanceof HTMLOptionElement ) {
        group.append(this.#buildOption(option));
      }
    }
    return group;
  }

  /* -------------------------------------------- */

  /**
   * Build an input <option> element into a <label class="checkbox"> element.
   * @param {HTMLOptionElement} option      The originally configured option
   * @returns {HTMLLabelElement}            The created labeled checkbox element
   */
  #buildOption(option) {
    const label = document.createElement("label");
    label.classList.add("checkbox");
    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.value = option.value;
    checkbox.checked = this._chosen.has(option.value);
    label.append(checkbox, option.innerText);
    this.#checkboxes.push(checkbox);
    return label;
  }

  /* -------------------------------------------- */

  /** @override */
  _refresh() {
    for ( const checkbox of this.#checkboxes ) {
      checkbox.checked = this._chosen.has(checkbox.value);
    }
  }

  /* -------------------------------------------- */

  /** @override */
  _activateListeners() {
    super._activateListeners();
    for ( const checkbox of this.#checkboxes ) {
      checkbox.addEventListener("change", this.#onChangeCheckbox.bind(this));
    }
  }

  /* -------------------------------------------- */

  /**
   * Handle changes to a checkbox input, marking the selected option as a chosen value.
   * @param {Event} event         The change event on the checkbox input element
   */
  #onChangeCheckbox(event) {
    event.preventDefault();
    event.stopImmediatePropagation();
    const checkbox = event.currentTarget;
    if ( checkbox.checked ) this.select(checkbox.value);
    else this.unselect(checkbox.value);

  }
}

// Register Custom Elements
window.customElements.define("multi-select", HTMLMultiSelectElement);
window.customElements.define("multi-checkbox", HTMLMultiCheckboxElement);
