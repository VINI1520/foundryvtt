/**
 * The client-side Token document which extends the common BaseToken document model.
 * @extends documents.BaseToken
 * @mixes ClientDocumentMixin
 *
 * @see {@link Scene}                     The Scene document type which contains Token documents
 * @see {@link TokenConfig}               The Token configuration application
 */
class TokenDocument extends CanvasDocumentMixin(foundry.documents.BaseToken) {

  /* -------------------------------------------- */
  /*  Properties                                  */
  /* -------------------------------------------- */

  /**
   * A singleton collection which holds a reference to the synthetic token actor by its base actor's ID.
   * @type {Collection<Actor>}
   */
  actors = (function() {
    const collection = new foundry.utils.Collection();
    collection.documentClass = Actor.implementation;
    return collection;
  })();

  /* -------------------------------------------- */

  /**
   * A reference to the Actor this Token modifies.
   * If actorLink is true, then the document is the primary Actor document.
   * Otherwise, the Actor document is a synthetic (ephemeral) document constructed using the Token's ActorDelta.
   * @returns {Actor|null}
   */
  get actor() {
    return (this.isLinked ? this.baseActor : this.delta?.syntheticActor) ?? null;
  }

  /* -------------------------------------------- */

  /**
   * A reference to the base, World-level Actor this token represents.
   * @returns {Actor}
   */
  get baseActor() {
    return game.actors.get(this.actorId);
  }

  /* -------------------------------------------- */

  /**
   * An indicator for whether the current User has full control over this Token document.
   * @type {boolean}
   */
  get isOwner() {
    if ( game.user.isGM ) return true;
    return this.actor?.isOwner ?? false;
  }

  /* -------------------------------------------- */

  /**
   * A convenient reference for whether this TokenDocument is linked to the Actor it represents, or is a synthetic copy
   * @type {boolean}
   */
  get isLinked() {
    return this.actorLink;
  }

  /* -------------------------------------------- */

  /**
   * Return a reference to a Combatant that represents this Token, if one is present in the current encounter.
   * @type {Combatant|null}
   */
  get combatant() {
    return game.combat?.getCombatantByToken(this.id) || null;
  }

  /* -------------------------------------------- */

  /**
   * An indicator for whether this Token is currently involved in the active combat encounter.
   * @type {boolean}
   */
  get inCombat() {
    return !!this.combatant;
  }

  /* -------------------------------------------- */

  /**
   * Define a sort order for this TokenDocument.
   * This controls its rendering order in the PrimaryCanvasGroup relative to siblings at the same elevation.
   * In the future this will be replaced with a persisted database field for permanent adjustment of token stacking.
   * In case of ties, Tokens will be sorted above other types of objects.
   * @type {number}
   */
  get sort() {
    return this.#sort;
  }

  set sort(value) {
    if ( !Number.isFinite(value) ) throw new Error("TokenDocument sort must be a finite Number");
    this.#sort = value;
    if ( this.rendered ) {
      canvas.tokens.objects.sortDirty = true;
      canvas.primary.sortDirty = true;
      canvas.perception.update({refreshTiles: true});
    }
  }

  #sort = 0;

  /* -------------------------------------------- */
  /*  Methods                                     */
  /* -------------------------------------------- */

  /** @inheritdoc */
  _initialize(options = {}) {
    super._initialize(options);
    this.baseActor?._registerDependentToken(this);
  }

  /* -------------------------------------------- */

  /** @inheritdoc */
  prepareBaseData() {
    this.name ||= this.actor?.name || "Unknown";
    if ( this.hidden ) this.alpha = Math.min(this.alpha, game.user.isGM ? 0.5 : 0);
    this._prepareDetectionModes();
  }

  /* -------------------------------------------- */

  /** @inheritdoc */
  prepareEmbeddedDocuments() {
    if ( game.ready && !this.delta ) this.updateSource({ delta: { _id: this.id } });
  }

  /* -------------------------------------------- */

  /**
   * Prepare detection modes which are available to the Token.
   * Ensure that every Token has the basic sight detection mode configured.
   * @protected
   */
  _prepareDetectionModes() {
    if ( !this.sight.enabled ) return;
    const basicId = DetectionMode.BASIC_MODE_ID;
    const basicMode = this.detectionModes.find(m => m.id === basicId);
    if ( !basicMode ) this.detectionModes.push({id: basicId, enabled: true, range: this.sight.range});
  }

  /* -------------------------------------------- */

  /**
   * A helper method to retrieve the underlying data behind one of the Token's attribute bars
   * @param {string} barName                The named bar to retrieve the attribute for
   * @param {object} [options]
   * @param {string} [options.alternative]  An alternative attribute path to get instead of the default one
   * @returns {object|null}                 The attribute displayed on the Token bar, if any
   */
  getBarAttribute(barName, {alternative}={}) {
    const attribute = alternative || this[barName]?.attribute;
    if ( !attribute || !this.actor ) return null;
    const system = this.actor.system;
    const isSystemDataModel = system instanceof foundry.abstract.DataModel;
    const templateModel = game.model.Actor[this.actor.type];

    // Get the current attribute value
    const data = foundry.utils.getProperty(system, attribute);
    if ( (data === null) || (data === undefined) ) return null;

    // Single values
    if ( Number.isNumeric(data) ) {
      let editable = foundry.utils.hasProperty(templateModel, attribute);
      if ( isSystemDataModel ) {
        const field = system.schema.getField(attribute);
        if ( field ) editable = field instanceof foundry.data.fields.NumberField;
      }
      return {type: "value", attribute, value: Number(data), editable};
    }

    // Attribute objects
    else if ( ("value" in data) && ("max" in data) ) {
      let editable = foundry.utils.hasProperty(templateModel, `${attribute}.value`);
      if ( isSystemDataModel ) {
        const field = system.schema.getField(`${attribute}.value`);
        if ( field ) editable = field instanceof foundry.data.fields.NumberField;
      }
      return {type: "bar", attribute, value: parseInt(data.value || 0), max: parseInt(data.max || 0), editable};
    }

    // Otherwise null
    return null;
  }

  /* -------------------------------------------- */

  /**
   * A helper function to toggle a status effect which includes an Active Effect template
   * @param {{id: string, label: string, icon: string}} effectData The Active Effect data
   * @param {object} [options]                                     Options to configure application of the Active Effect
   * @param {boolean} [options.overlay=false]                      Should the Active Effect icon be displayed as an
   *                                                               overlay on the token?
   * @param {boolean} [options.active]                             Force a certain active state for the effect.
   * @returns {Promise<boolean>}                                   Whether the Active Effect is now on or off
   */
  async toggleActiveEffect(effectData, {overlay=false, active}={}) {
    if ( !this.actor || !effectData.id ) return false;

    // Remove existing single-status effects.
    const existing = this.actor.effects.reduce((arr, e) => {
      if ( (e.statuses.size === 1) && e.statuses.has(effectData.id) ) arr.push(e.id);
      return arr;
    }, []);
    const state = active ?? !existing.length;
    if ( !state && existing.length ) await this.actor.deleteEmbeddedDocuments("ActiveEffect", existing);

    // Add a new effect
    else if ( state ) {
      const cls = getDocumentClass("ActiveEffect");
      const createData = foundry.utils.deepClone(effectData);
      createData.statuses = [effectData.id];
      delete createData.id;
      cls.migrateDataSafe(createData);
      cls.cleanData(createData);
      createData.name = game.i18n.localize(createData.name);
      if ( overlay ) createData["flags.core.overlay"] = true;
      await cls.create(createData, {parent: this.actor});
    }
    return state;
  }

  /* -------------------------------------------- */

  /**
   * Test whether a Token has a specific status effect.
   * @param {string} statusId     The status effect ID as defined in CONFIG.statusEffects
   * @returns {boolean}           Does the Token have this status effect?
   */
  hasStatusEffect(statusId) {

    // Case 1 - No Actor
    if ( !this.actor ) {
      const icon = CONFIG.statusEffects.find(e => e.id === statusId)?.icon;
      return this.effects.includes(icon);
    }

    // Case 2 - Actor Active Effects
    return this.actor.statuses.has(statusId);
  }

  /* -------------------------------------------- */
  /*  Actor Data Operations                       */
  /* -------------------------------------------- */

  /**
   * Convenience method to change a token vision mode.
   * @param {string} visionMode       The vision mode to apply to this token.
   * @param {boolean} [defaults=true] If the vision mode should be updated with its defaults.
   * @returns {Promise<*>}
   */
  async updateVisionMode(visionMode, defaults=true) {
    if ( !(visionMode in CONFIG.Canvas.visionModes) ) {
      throw new Error("The provided vision mode does not exist in CONFIG.Canvas.visionModes");
    }
    let update = {sight: {visionMode: visionMode}};
    if ( defaults ) foundry.utils.mergeObject(update.sight, CONFIG.Canvas.visionModes[visionMode].vision.defaults);
    return this.update(update);
  }

  /* -------------------------------------------- */

  /** @inheritdoc */
  getEmbeddedCollection(embeddedName) {
    if ( this.isLinked ) return super.getEmbeddedCollection(embeddedName);
    switch ( embeddedName ) {
      case "Actor":
        this.actors.set(this.actorId, this.actor);
        return this.actors;
      case "Item":
        return this.actor.items;
      case "ActiveEffect":
        return this.actor.effects;
    }
    return super.getEmbeddedCollection(embeddedName);
  }

  /* -------------------------------------------- */
  /*  Event Handlers                              */
  /* -------------------------------------------- */

  /** @inheritdoc */
  async _preUpdate(data, options, user) {
    await super._preUpdate(data, options, user);
    if ( "width" in data ) data.width = Math.max((data.width || 1).toNearest(0.5), 0.5);
    if ( "height" in data ) data.height = Math.max((data.height || 1).toNearest(0.5), 0.5);
    if ( "actorId" in data ) options.previousActorId = this.actorId;
    if ( ("actorData" in data) ) {
      foundry.utils.logCompatibilityWarning("This update operation includes an update to the Token's actorData "
        + "property, which is deprecated. Please perform updates via the synthetic Actor instead, accessible via the "
        + "'actor' getter.", {since: 11, until: 13});
    }
  }

  /* -------------------------------------------- */

  /** @inheritdoc */
  _onUpdate(data, options, userId) {
    const configs = Object.values(this.apps).filter(app => app instanceof TokenConfig);
    configs.forEach(app => {
      if ( app.preview ) options.animate = false;
      app._previewChanges(data);
    });

    // If the Actor association has changed, expire the cached Token actor
    if ( ("actorId" in data) || ("actorLink" in data) ) {
      const previousActor = game.actors.get(options.previousActorId);
      if ( previousActor ) {
        Object.values(previousActor.apps).forEach(app => app.close({submit: false}));
        previousActor._unregisterDependentToken(this);
      }
      this.delta._createSyntheticActor({ reinitializeCollections: true });
    }

    // Post-update the Token itself
    super._onUpdate(data, options, userId);
    configs.forEach(app => app._previewChanges());
  }

  /* -------------------------------------------- */

  /** @inheritdoc */
  _onDelete(options, userId) {
    super._onDelete(options, userId);
    this.baseActor?._unregisterDependentToken(this);
  }

  /* -------------------------------------------- */

  /**
   * Support the special case descendant document changes within an ActorDelta.
   * The descendant documents themselves are configured to have a synthetic Actor as their parent.
   * We need this to ensure that the ActorDelta receives these events which do not bubble up.
   * @inheritdoc
   */
  _preCreateDescendantDocuments(parent, collection, data, options, userId) {
    if ( parent !== this.delta ) this.delta?._handleDeltaCollectionUpdates(parent);
  }

  /* -------------------------------------------- */

  /** @inheritdoc */
  _preUpdateDescendantDocuments(parent, collection, changes, options, userId) {
    if ( parent !== this.delta ) this.delta?._handleDeltaCollectionUpdates(parent);
  }

  /* -------------------------------------------- */

  /** @inheritdoc */
  _preDeleteDescendantDocuments(parent, collection, ids, options, userId) {
    if ( parent !== this.delta ) this.delta?._handleDeltaCollectionUpdates(parent);
  }

  /* -------------------------------------------- */

  /** @inheritdoc */
  _onCreateDescendantDocuments(parent, collection, documents, data, options, userId) {
    super._onCreateDescendantDocuments(parent, collection, documents, data, options, userId);
    this._onRelatedUpdate(data, options);
  }

  /* -------------------------------------------- */

  /** @inheritdoc */
  _onUpdateDescendantDocuments(parent, collection, documents, changes, options, userId) {
    super._onUpdateDescendantDocuments(parent, collection, documents, changes, options, userId);
    this._onRelatedUpdate(changes, options);
  }

  /* -------------------------------------------- */

  /** @inheritdoc */
  _onDeleteDescendantDocuments(parent, collection, documents, ids, options, userId) {
    super._onDeleteDescendantDocuments(parent, collection, documents, ids, options, userId);
    this._onRelatedUpdate({}, options);
  }

  /* -------------------------------------------- */

  /**
   * When the base Actor for a TokenDocument changes, we may need to update its Actor instance
   * @param {object} update
   * @param {object} options
   * @internal
   */
  _onUpdateBaseActor(update={}, options={}) {

    // Update synthetic Actor data
    if ( !this.isLinked && this.delta ) {
      this.delta.updateSyntheticActor();
      for ( const collection of Object.values(this.delta.collections) ) collection.initialize({ full: true });
      this.actor.sheet.render(false, {renderContext: "updateActor"});
    }

    this._onRelatedUpdate(update, options);
  }

  /* -------------------------------------------- */

  /**
   * Whenever the token's actor delta changes, or the base actor changes, perform associated refreshes.
   * @param {object} [update]                        The update delta.
   * @param {DocumentModificationContext} [options]  The options provided to the update.
   * @protected
   */
  _onRelatedUpdate(update={}, options={}) {
    // Update tracked Combat resource
    const c = this.combatant;
    if ( c && foundry.utils.hasProperty(update.system || {}, game.combat.settings.resource) ) {
      c.updateResource();
    }
    if ( this.inCombat ) ui.combat.render();

    // Trigger redraws on the token
    if ( this.parent.isView ) {
      if ( this.object?.hasActiveHUD ) canvas.tokens.hud.render();
      this.object?.renderFlags.set({refreshBars: true, redrawEffects: true});
    }
  }

  /* -------------------------------------------- */

  /**
   * @typedef {object} TrackedAttributesDescription
   * @property {string[][]} bar    A list of property path arrays to attributes with both a value and a max property.
   * @property {string[][]} value  A list of property path arrays to attributes that have only a value property.
   */

  /**
   * Get an Array of attribute choices which could be tracked for Actors in the Combat Tracker
   * @param {object|DataModel|typeof DataModel|SchemaField|string} [data]  The object to explore for attributes, or an
   *                                                                       Actor type.
   * @param {string[]} [_path]
   * @returns {TrackedAttributesDescription}
   */
  static getTrackedAttributes(data, _path=[]) {
    // Case 1 - Infer attributes from schema structure.
    if ( (data instanceof foundry.abstract.DataModel) || foundry.utils.isSubclass(data, foundry.abstract.DataModel) ) {
      return this._getTrackedAttributesFromSchema(data.schema, _path);
    }
    if ( data instanceof foundry.data.fields.SchemaField ) return this._getTrackedAttributesFromSchema(data, _path);

    // Case 2 - Infer attributes from object structure.
    if ( ["Object", "Array"].includes(foundry.utils.getType(data)) ) {
      return this._getTrackedAttributesFromObject(data, _path);
    }

    // Case 3 - Retrieve explicitly configured attributes.
    if ( !data || (typeof data === "string") ) {
      const config = this._getConfiguredTrackedAttributes(data);
      if ( config ) return config;
      data = undefined;
    }

    // Track the path and record found attributes
    if ( data !== undefined ) return {bar: [], value: []};

    // Case 4 - Infer attributes from system template.
    const bar = new Set();
    const value = new Set();
    for ( let [type, model] of Object.entries(game.model.Actor) ) {
      const dataModel = CONFIG.Actor.dataModels?.[type];
      const inner = this.getTrackedAttributes(dataModel ?? model, _path);
      inner.bar.forEach(attr => bar.add(attr.join(".")));
      inner.value.forEach(attr => value.add(attr.join(".")));
    }

    return {
      bar: Array.from(bar).map(attr => attr.split(".")),
      value: Array.from(value).map(attr => attr.split("."))
    };
  }

  /* -------------------------------------------- */

  /**
   * Retrieve an Array of attribute choices from a plain object.
   * @param {object} data  The object to explore for attributes.
   * @param {string[]} _path
   * @returns {TrackedAttributesDescription}
   * @protected
   */
  static _getTrackedAttributesFromObject(data, _path=[]) {
    const attributes = {bar: [], value: []};
    // Recursively explore the object
    for ( let [k, v] of Object.entries(data) ) {
      let p = _path.concat([k]);

      // Check objects for both a "value" and a "max"
      if ( v instanceof Object ) {
        if ( k === "_source" ) continue;
        const isBar = ("value" in v) && ("max" in v);
        if ( isBar ) attributes.bar.push(p);
        else {
          const inner = this.getTrackedAttributes(data[k], p);
          attributes.bar.push(...inner.bar);
          attributes.value.push(...inner.value);
        }
      }

      // Otherwise, identify values which are numeric or null
      else if ( Number.isNumeric(v) || (v === null) ) {
        attributes.value.push(p);
      }
    }
    return attributes;
  }

  /* -------------------------------------------- */

  /**
   * Retrieve an Array of attribute choices from a SchemaField.
   * @param {SchemaField} schema  The schema to explore for attributes.
   * @param {string[]} _path
   * @returns {TrackedAttributesDescription}
   * @protected
   */
  static _getTrackedAttributesFromSchema(schema, _path=[]) {
    const attributes = {bar: [], value: []};
    for ( const [name, field] of Object.entries(schema.fields) ) {
      const p = _path.concat([name]);
      if ( field instanceof foundry.data.fields.NumberField ) attributes.value.push(p);
      const isSchema = field instanceof foundry.data.fields.SchemaField;
      const isModel = field instanceof foundry.data.fields.EmbeddedDataField;
      if ( isSchema || isModel ) {
        const schema = isModel ? field.model.schema : field;
        const isBar = schema.has("value") && schema.has("max");
        if ( isBar ) attributes.bar.push(p);
        else {
          const inner = this.getTrackedAttributes(schema, p);
          attributes.bar.push(...inner.bar);
          attributes.value.push(...inner.value);
        }
      }
    }
    return attributes;
  }

  /* -------------------------------------------- */

  /**
   * Retrieve any configured attributes for a given Actor type.
   * @param {string} [type]  The Actor type.
   * @returns {TrackedAttributesDescription|void}
   * @protected
   */
  static _getConfiguredTrackedAttributes(type) {

    // If trackable attributes are not configured fallback to the system template
    if ( foundry.utils.isEmpty(CONFIG.Actor.trackableAttributes) ) return;

    // If the system defines trackableAttributes per type
    let config = foundry.utils.deepClone(CONFIG.Actor.trackableAttributes[type]);

    // Otherwise union all configured trackable attributes
    if ( foundry.utils.isEmpty(config) ) {
      const bar = new Set();
      const value = new Set();
      for ( const attrs of Object.values(CONFIG.Actor.trackableAttributes) ) {
        attrs.bar.forEach(bar.add, bar);
        attrs.value.forEach(value.add, value);
      }
      config = { bar: Array.from(bar), value: Array.from(value) };
    }

    // Split dot-separate attribute paths into arrays
    Object.keys(config).forEach(k => config[k] = config[k].map(attr => attr.split(".")));
    return config;
  }

  /* -------------------------------------------- */

  /**
   * Inspect the Actor data model and identify the set of attributes which could be used for a Token Bar
   * @param {object} attributes       The tracked attributes which can be chosen from
   * @returns {object}                A nested object of attribute choices to display
   */
  static getTrackedAttributeChoices(attributes) {
    attributes = attributes || this.getTrackedAttributes();
    attributes.bar = attributes.bar.map(v => v.join("."));
    attributes.bar.sort((a, b) => a.localeCompare(b));
    attributes.value = attributes.value.map(v => v.join("."));
    attributes.value.sort((a, b) => a.localeCompare(b));
    return {
      [game.i18n.localize("TOKEN.BarAttributes")]: attributes.bar,
      [game.i18n.localize("TOKEN.BarValues")]: attributes.value
    };
  }

  /* -------------------------------------------- */
  /*  Deprecations                                */
  /* -------------------------------------------- */

  /**
   * @deprecated since v11
   * @ignore
   */
  getActor() {
    foundry.utils.logCompatibilityWarning("TokenDocument#getActor has been deprecated. Please use the "
      + "TokenDocument#actor getter to retrieve the Actor instance that the TokenDocument represents, or use "
      + "TokenDocument#delta#apply to generate a new synthetic Actor instance.");
    return this.delta?.apply() ?? this.baseActor ?? null;
  }

  /* -------------------------------------------- */

  /**
   * @deprecated since v11
   * @ignore
   */
  get actorData() {
    foundry.utils.logCompatibilityWarning("You are accessing TokenDocument#actorData which is deprecated. Source data "
      + "may be retrieved via TokenDocument#delta but all modifications/access should be done via the synthetic Actor "
      + "at TokenDocument#actor if possible.", {since: 11, until: 13});
    return this.delta.toObject();
  }

  set actorData(actorData) {
    foundry.utils.logCompatibilityWarning("You are accessing TokenDocument#actorData which is deprecated. Source data "
      + "may be retrieved via TokenDocument#delta but all modifications/access should be done via the synthetic Actor "
      + "at TokenDocument#actor if possible.", {since: 11, until: 13});
    const id = this.delta.id;
    this.delta = new ActorDelta.implementation({...actorData, _id: id}, {parent: this});
  }
}

/* -------------------------------------------- */
/*  Proxy Prototype Token Methods               */
/* -------------------------------------------- */

foundry.data.PrototypeToken.prototype.getBarAttribute = TokenDocument.prototype.getBarAttribute;

/**
 * @deprecated since v10
 * @see data.PrototypeToken
 * @ignore
 */
class PrototypeTokenDocument extends foundry.data.PrototypeToken {
  constructor(...args) {
    foundry.utils.logCompatibilityWarning("You are using the PrototypeTokenDocument class which has been deprecated in"
      + " favor of using foundry.data.PrototypeToken directly.", {since: 10, until: 12});
    super(...args);
  }
}
