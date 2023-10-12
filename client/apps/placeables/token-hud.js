/**
 * An implementation of the PlaceableHUD base class which renders a heads-up-display interface for Token objects.
 * This interface provides controls for visibility, attribute bars, elevation, status effects, and more.
 * @type {BasePlaceableHUD}
 */
class TokenHUD extends BasePlaceableHUD {

  /**
   * Track whether the status effects control palette is currently expanded or hidden
   * @type {boolean}
   * @private
   */
  _statusEffects = false;

  /**
   * Track whether a control icon is hovered or not
   * @type {boolean}
   */
  #hoverControlIcon = false;

  /* -------------------------------------------- */

  /** @override */
  static get defaultOptions() {
    return foundry.utils.mergeObject(super.defaultOptions, {
      id: "token-hud",
      template: "templates/hud/token-hud.html"
    });
  }

  /* -------------------------------------------- */

  /** @override */
  bind(object) {
    this._statusEffects = false;
    return super.bind(object);
  }

  /* -------------------------------------------- */

  /**
   * Refresh the currently active state of all status effect icons in the Token HUD selector.
   */
  refreshStatusIcons() {
    const effects = this.element.find(".status-effects")[0];
    const statuses = this._getStatusEffectChoices();
    for ( let img of effects.children ) {
      const status = statuses[img.getAttribute("src")] || {};
      img.classList.toggle("overlay", !!status.isOverlay);
      img.classList.toggle("active", !!status.isActive);
    }
  }

  /* -------------------------------------------- */

  /** @override */
  setPosition(_position) {
    const td = this.object.document;
    const ratio = canvas.dimensions.size / 100;
    const position = {
      width: td.width * 100,
      height: td.height * 100,
      left: this.object.x,
      top: this.object.y
    };
    if ( ratio !== 1 ) position.transform = `scale(${ratio})`;
    this.element.css(position);
  }

  /* -------------------------------------------- */

  /** @override */
  getData(options={}) {
    let data = super.getData(options);
    const bar1 = this.object.document.getBarAttribute("bar1");
    const bar2 = this.object.document.getBarAttribute("bar2");
    data = foundry.utils.mergeObject(data, {
      canConfigure: game.user.can("TOKEN_CONFIGURE"),
      canToggleCombat: ui.combat !== null,
      displayBar1: bar1 && (bar1.type !== "none"),
      bar1Data: bar1,
      displayBar2: bar2 && (bar2.type !== "none"),
      bar2Data: bar2,
      visibilityClass: data.hidden ? "active" : "",
      effectsClass: this._statusEffects ? "active" : "",
      combatClass: this.object.inCombat ? "active" : "",
      targetClass: this.object.targeted.has(game.user) ? "active" : ""
    });
    data.statusEffects = this._getStatusEffectChoices(data);
    return data;
  }

  /* -------------------------------------------- */

  /**
   * Get an array of icon paths which represent valid status effect choices
   * @private
   */
  _getStatusEffectChoices() {
    const token = this.object;
    const doc = token.document;

    // Get statuses which are active for the token actor
    const actor = token.actor || null;
    const statuses = actor ? actor.effects.reduce((obj, effect) => {
      for ( const id of effect.statuses ) {
        obj[id] = {id, overlay: !!effect.getFlag("core", "overlay")};
      }
      return obj;
    }, {}) : {};

    // Prepare the list of effects from the configured defaults and any additional effects present on the Token
    const tokenEffects = foundry.utils.deepClone(doc.effects) || [];
    if ( doc.overlayEffect ) tokenEffects.push(doc.overlayEffect);
    return CONFIG.statusEffects.concat(tokenEffects).reduce((obj, e) => {
      const src = e.icon ?? e;
      if ( src in obj ) return obj;
      const status = statuses[e.id] || {};
      const isActive = !!status.id || doc.effects.includes(src);
      const isOverlay = !!status.overlay || doc.overlayEffect === src;
      /** @deprecated since v11 */
      const label = e.name ?? e.label;
      obj[src] = {
        id: e.id ?? "",
        title: label ? game.i18n.localize(label) : null,
        src,
        isActive,
        isOverlay,
        cssClass: [
          isActive ? "active" : null,
          isOverlay ? "overlay" : null
        ].filterJoin(" ")
      };
      return obj;
    }, {});
  }

  /* -------------------------------------------- */

  /** @override */
  activateListeners(html) {
    super.activateListeners(html);

    // Attribute Bars
    html.find(".attribute input")
      .click(this._onAttributeClick)
      .keydown(this._onAttributeKeydown.bind(this))
      .focusout(this._onAttributeUpdate.bind(this));

    // Control icons hover detection
    html.find(".control-icon")
      .mouseleave(() => this.#hoverControlIcon = false)
      .mouseenter(() => this.#hoverControlIcon = true);

    // Status Effects Controls
    this._toggleStatusEffects(this._statusEffects);
    html.find(".status-effects")
      .on("click", ".effect-control", this._onToggleEffect.bind(this))
      .on("contextmenu", ".effect-control", event => this._onToggleEffect(event, {overlay: true}));
  }

  /* -------------------------------------------- */

  /** @inheritdoc */
  _onClickControl(event) {
    super._onClickControl(event);
    if ( event.defaultPrevented ) return;
    const button = event.currentTarget;
    switch ( button.dataset.action ) {
      case "config":
        return this._onTokenConfig(event);
      case "combat":
        return this._onToggleCombat(event);
      case "target":
        return this._onToggleTarget(event);
      case "effects":
        return this._onToggleStatusEffects(event);
    }
  }

  /* -------------------------------------------- */

  /**
   * Handle initial click to focus an attribute update field
   * @private
   */
  _onAttributeClick(event) {
    event.currentTarget.select();
  }

  /* -------------------------------------------- */

  /**
   * Force field handling on an Enter keypress even if the value of the field did not change.
   * This is important to suppose use cases with negative number values.
   * @param {KeyboardEvent} event     The originating keydown event
   * @private
   */
  _onAttributeKeydown(event) {
    if ( (event.code === "Enter") || (event.code === "NumpadEnter") ) event.currentTarget.blur();
  }

  /* -------------------------------------------- */

  /**
   * Handle attribute bar update
   * @private
   */
  _onAttributeUpdate(event) {
    event.preventDefault();
    if ( !this.object ) return;

    // Acquire string input
    const input = event.currentTarget;
    let strVal = input.value.trim();
    let isDelta = strVal.startsWith("+") || strVal.startsWith("-");
    if (strVal.startsWith("=")) strVal = strVal.slice(1);
    let value = Number(strVal);

    // For attribute bar values, update the associated Actor
    const bar = input.dataset.bar;
    const actor = this.object?.actor;
    if ( bar && actor ) {
      const attr = this.object.document.getBarAttribute(bar);
      if ( isDelta || (attr.attribute !== value) ) {
        actor.modifyTokenAttribute(attr.attribute, value, isDelta, attr.type === "bar");
      }
    }

    // Otherwise update the Token directly
    else {
      const current = foundry.utils.getProperty(this.object.document, input.name);
      this.object.document.update({[input.name]: isDelta ? current + value : value});
    }

    // Clear the HUD
    if ( !this.#hoverControlIcon ) this.clear();
  }

  /* -------------------------------------------- */

  /**
   * Toggle Token combat state
   * @private
   */
  async _onToggleCombat(event) {
    event.preventDefault();
    return this.object.toggleCombat();
  }

  /* -------------------------------------------- */

  /**
   * Handle Token configuration button click
   * @private
   */
  _onTokenConfig(event) {
    event.preventDefault();
    this.object.sheet.render(true);
  }

  /* -------------------------------------------- */

  /**
   * Handle left-click events to toggle the displayed state of the status effect selection palette
   * @param {MouseEvent }event
   * @private
   */
  _onToggleStatusEffects(event) {
    event.preventDefault();
    this._toggleStatusEffects(!this._statusEffects);
  }

  /* -------------------------------------------- */

  /**
   * Assign css selectors for the active state of the status effects selection palette
   * @param {boolean} active      Should the effects menu be active?
   * @private
   */
  _toggleStatusEffects(active) {
    this._statusEffects = active;
    const button = this.element.find('.control-icon[data-action="effects"]')[0];
    button.classList.toggle("active", active);
    const palette = button.querySelector(".status-effects");
    palette.classList.toggle("active", active);
  }

  /* -------------------------------------------- */

  /**
   * Handle toggling a token status effect icon
   * @param {PointerEvent} event      The click event to toggle the effect
   * @param {object} [options]        Options which modify the toggle
   * @param {boolean} [options.overlay]   Toggle the overlay effect?
   * @private
   */
  _onToggleEffect(event, {overlay=false}={}) {
    event.preventDefault();
    event.stopPropagation();
    let img = event.currentTarget;
    const effect = ( img.dataset.statusId && this.object.actor ) ?
      CONFIG.statusEffects.find(e => e.id === img.dataset.statusId) :
      img.getAttribute("src");
    return this.object.toggleEffect(effect, {overlay});
  }

  /* -------------------------------------------- */

  /**
   * Handle toggling the target state for this Token
   * @param {PointerEvent} event      The click event to toggle the target
   * @private
   */
  _onToggleTarget(event) {
    event.preventDefault();
    const btn = event.currentTarget;
    const token = this.object;
    const targeted = !token.isTargeted;
    token.setTarget(targeted, {releaseOthers: false});
    btn.classList.toggle("active", targeted);
  }
}
