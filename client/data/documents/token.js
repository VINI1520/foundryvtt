/**
 * The client-side Token document which extends the common BaseToken document model.
 * @extends documents.BaseToken
 * @mixes ClientDocumentMixin
 *
 * @see {@link Scene}                     The Scene document type which contains Token documents
 * @see {@link TokenConfig}               The Token configuration application
 */
class TokenDocument extends CanvasDocumentMixin(foundry.documents.BaseToken) {
  constructor(data, context={}) {
    super(data, context);

    /**
     * A cached reference to the Actor document that this Token modifies.
     * This may be a "synthetic" unlinked Token Actor which does not exist in the World.
     * @type {Actor|null}
     */
    this._actor = context.actor || null;
  }

  /* -------------------------------------------- */
  /*  Properties                                  */
  /* -------------------------------------------- */

  /**
   * A lazily evaluated reference to the Actor this Token modifies.
   * If actorLink is true, then the document is the primary Actor document.
   * Otherwise, the Actor document is a synthetic (ephemeral) document constructed using the Token's actorData.
   * @returns {Actor|null}
   */
  get actor() {
    if ( !this._actor ) this._actor = this.getActor();
    return this._actor;
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
      canvas.primary.sortChildren();
      canvas.tokens.objects.sortChildren();
    }
  }

  #sort = 0;

  /* -------------------------------------------- */
  /*  Methods                                     */
  /* -------------------------------------------- */

  /** @inheritdoc */
  prepareBaseData() {
    this.name ||= this.actor?.name || "Unknown";
    if ( this.hidden ) this.alpha = Math.min(this.alpha, 0.5);
    this._prepareDetectionModes();
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

  /** @inheritdoc */
  clone(data={}, options={}) {
    const cloned = super.clone(data, options);
    cloned._actor = this._actor;
    return cloned;
  }

  /* -------------------------------------------- */

  /**
   * Create a synthetic Actor using a provided Token instance
   * If the Token data is linked, return the true Actor document
   * If the Token data is not linked, create a synthetic Actor using the Token's actorData override
   * @returns {Actor}
   */
  getActor() {
    const baseActor = game.actors.get(this.actorId);
    if ( !baseActor ) return null;
    if ( !this.id || this.isLinked ) return baseActor;

    // Get base actor data
    const cls = getDocumentClass("Actor");
    const actorData = baseActor.toObject();

    // Clean and validate the override data
    const overrides = cls.schema.clean(this.actorData, {partial: true});
    const error = cls.schema.validate(this.actorData, {partial: true});
    if ( !error ) foundry.utils.mergeObject(actorData, overrides);

    // Create a synthetic token Actor
    const actor = new cls(actorData, {parent: this});
    actor.reset();  // FIXME why is this necessary?
    return actor;
  }

  /* -------------------------------------------- */

  /**
   * A helper method to retrieve the underlying data behind one of the Token's attribute bars
   * @param {string} barName        The named bar to retrieve the attribute for
   * @param {string} alternative    An alternative attribute path to get instead of the default one
   * @returns {object|null}         The attribute displayed on the Token bar, if any
   */
  getBarAttribute(barName, {alternative}={}) {
    const attr = alternative || this[barName]?.attribute;
    if ( !attr || !this.actor ) return null;
    let data = foundry.utils.getProperty(this.actor.system, attr);
    if ( (data === null) || (data === undefined) ) return null;
    const model = game.model.Actor[this.actor.type];

    // Single values
    if ( Number.isNumeric(data) ) {
      return {
        type: "value",
        attribute: attr,
        value: Number(data),
        editable: foundry.utils.hasProperty(model, attr)
      };
    }

    // Attribute objects
    else if ( ("value" in data) && ("max" in data) ) {
      return {
        type: "bar",
        attribute: attr,
        value: parseInt(data.value || 0),
        max: parseInt(data.max || 0),
        editable: foundry.utils.hasProperty(model, `${attr}.value`)
      };
    }

    // Otherwise null
    return null;
  }

  /* -------------------------------------------- */

  /**
   * A helper function to toggle a status effect which includes an Active Effect template
   * @param {{id: string, label: string, icon: string}} effectData The Active Effect data, including statusId
   * @param {object} [options]                                     Options to configure application of the Active Effect
   * @param {boolean} [options.overlay=false]                      Should the Active Effect icon be displayed as an
   *                                                               overlay on the token?
   * @param {boolean} [options.active]                             Force a certain active state for the effect.
   * @returns {Promise<boolean>}                                   Whether the Active Effect is now on or off
   */
  async toggleActiveEffect(effectData, {overlay=false, active}={}) {
    if ( !this.actor || !effectData.id ) return false;

    // Remove an existing effect
    const existing = this.actor.effects.find(e => e.getFlag("core", "statusId") === effectData.id);
    const state = active ?? !existing;
    if ( !state && existing ) await existing.delete();

    // Add a new effect
    else if ( state ) {
      const createData = foundry.utils.deepClone(effectData);
      createData.label = game.i18n.localize(effectData.label);
      createData["flags.core.statusId"] = effectData.id;
      if ( overlay ) createData["flags.core.overlay"] = true;
      delete createData.id;
      const cls = getDocumentClass("ActiveEffect");
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
      if ( this.effects.includes(icon) ) return true;
    }

    // Case 2 - Actor Active Effects
    else {
      const activeEffect = this.actor.effects.find(effect => effect.getFlag("core", "statusId") === statusId);
      if ( activeEffect && !activeEffect.disabled ) return true;
    }
    return false;
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

  /**
   * Redirect updates to a synthetic Token Actor to instead update the tokenData override object.
   * Once an attribute in the Token has been overridden, it must always remain overridden.
   *
   * @param {object} update       The provided differential update data which should update the Token Actor
   * @param {object} options      Provided options which modify the update request
   * @returns {Promise<Actor[]>}  The updated un-linked Actor instance
   */
  async modifyActorDocument(update, options) {
    delete update._id;
    update = this.actor.constructor.migrateData(foundry.utils.expandObject(update));
    const delta = foundry.utils.diffObject(this.actor.toObject(), update);
    await this.update({actorData: delta}, options);
    return [this.actor];
  }

  /* -------------------------------------------- */

  /** @inheritdoc */
  getEmbeddedCollection(embeddedName) {
    if ( this.isLinked ) return super.getEmbeddedCollection(embeddedName);
    switch ( embeddedName ) {
      case "Item":
        return this.actor.items;
      case "ActiveEffect":
        return this.actor.effects;
    }
  }

  /* -------------------------------------------- */

  /**
   * Redirect creation of Documents within a synthetic Token Actor to instead update the tokenData override object.
   * @param {string} embeddedName   The named embedded Document type being modified
   * @param {object[]} data         The provided initial data with which to create the embedded Documents
   * @param {object} options        Provided options which modify the creation request
   * @returns {Promise<Document[]>} The created Embedded Document instances
   */
  async createActorEmbeddedDocuments(embeddedName, data, options) {

    // Get the current embedded collection data
    const cls = getDocumentClass(embeddedName);
    const collection = this.actor.getEmbeddedCollection(embeddedName);
    const collectionData = collection.toObject();

    // Apply proposed creations to the collection data
    const hookData = []; // An array of created data
    for ( let d of data ) {
      if ( d instanceof foundry.abstract.DataModel ) d = d.toObject();
      d = foundry.utils.expandObject(d);
      if ( !d._id || !options.keepId ) d._id = foundry.utils.randomID(16);
      collectionData.push(d);
      hookData.push(d);
    }

    // Perform a TokenDocument update, replacing the entire embedded collection in actorData
    options.action = "create";
    options.embedded = {embeddedName, hookData};
    await this.update({
      actorData: {
        [cls.metadata.collection]: collectionData
      }
    }, options);
    return hookData.map(d => this.actor.getEmbeddedDocument(embeddedName, d._id));
  }

  /* -------------------------------------------- */

  /**
   * Redirect updating of Documents within a synthetic Token Actor to instead update the tokenData override object.
   * @param {string} embeddedName   The named embedded Document type being modified
   * @param {object[]} updates      The provided differential data with which to update the embedded Documents
   * @param {object} options        Provided options which modify the update request
   * @returns {Promise<Document[]>} The updated Embedded Document instances
   */
  async updateActorEmbeddedDocuments(embeddedName, updates, options) {

    // Get the current embedded collection data
    const cls = getDocumentClass(embeddedName);
    const collection = this.actor.getEmbeddedCollection(embeddedName);
    const collectionData = collection.toObject();

    // Apply proposed updates to the collection data
    const hookData = {}; // A mapping of changes
    for ( let update of updates ) {
      const current = collectionData.find(x => x._id === update._id);
      if ( !current ) continue;
      if ( options.diff ) {
        update = foundry.utils.diffObject(current, foundry.utils.expandObject(update), {deletionKeys: true});
        if ( foundry.utils.isEmpty(update) ) continue;
        update._id = current._id;
      }
      hookData[update._id] = update;
      foundry.utils.mergeObject(current, update, {performDeletions: true});
    }

    // Perform a TokenDocument update, replacing the entire embedded collection in actorData
    if ( !Object.values(hookData).length ) return [];
    options.action = "update";
    options.embedded = {embeddedName, hookData};
    await this.update({
      actorData: {
        [cls.metadata.collection]: collectionData
      }
    }, options);
    return Object.keys(hookData).map(id => this.actor.getEmbeddedDocument(embeddedName, id));
  }

  /* -------------------------------------------- */

  /**
   * Redirect deletion of Documents within a synthetic Token Actor to instead update the tokenData override object.
   * @param {string} embeddedName   The named embedded Document type being deleted
   * @param {string[]} ids          The IDs of Documents to delete
   * @param {object} options        Provided options which modify the deletion request
   * @returns {Promise<Document[]>} The deleted Embedded Document instances
   */
  async deleteActorEmbeddedDocuments(embeddedName, ids, options) {
    const cls = getDocumentClass(embeddedName);
    const collection = this.actor.getEmbeddedCollection(embeddedName);

    // Remove proposed deletions from the collection
    const collectionData = collection.toObject();
    const deleted = [];
    const hookData = []; // An array of deleted ids
    for ( let id of ids ) {
      const doc = collection.get(id);
      if ( !doc ) continue;
      deleted.push(doc);
      hookData.push(id);
      collectionData.findSplice(d => d._id === id);
    }

    // Perform a TokenDocument update, replacing the entire embedded collection in actorData
    options.action = "delete";
    options.embedded = {embeddedName, hookData};
    await this.update({
      actorData: {
        [cls.metadata.collection]: collectionData
      }
    }, options);
    return deleted;
  }

  /* -------------------------------------------- */
  /*  Event Handlers                              */
  /* -------------------------------------------- */

  /** @inheritdoc */
  async _preUpdate(data, options, user) {
    await super._preUpdate(data, options, user);
    if ( "width" in data ) data.width = Math.max((data.width || 1).toNearest(0.5), 0.5);
    if ( "height" in data ) data.height = Math.max((data.height || 1).toNearest(0.5), 0.5);
    if ( ("actorData" in data) && !this.isLinked ) {
      if ( !("type" in data.actorData) && this._actor?.type ) data.actorData.type = this._actor?.type;
      await this._preUpdateTokenActor(data.actorData, options, user);
    }
  }

  /* -------------------------------------------- */

  /**
   * When the Actor data overrides change for an un-linked Token Actor, simulate the pre-update process.
   * @param {object} data
   * @param {object} options
   * @param {User} user
   * @returns {Promise<void>}
   * @private
   */
  async _preUpdateTokenActor(data, options, user) {
    const embeddedKeys = new Set(["_id"]);

    // Simulate modification of embedded documents
    if ( options.embedded ) {
      const {embeddedName, hookData} = options.embedded;
      const cls = getDocumentClass(embeddedName);
      const documents = data[cls.metadata.collection];
      embeddedKeys.add(cls.metadata.collection);
      const result = [];

      // Handle different embedded operations
      switch (options.action) {
        case "create":
          for ( const createData of hookData ) {
            const original = foundry.utils.deepClone(createData);
            const doc = new cls(createData, {parent: this.actor});
            await doc._preCreate(original, options, user);
            const allowed = options.noHook || Hooks.call(`preCreate${embeddedName}`, doc, original, options, user.id);
            if ( allowed === false ) {
              documents.findSplice(toCreate => toCreate._id === createData._id);
              hookData.findSplice(toCreate => toCreate._id === createData._id);
              console.debug(`${vtt} | ${embeddedName} creation prevented by preCreate hook`);
            } else {
              const d = data[doc.collectionName].find(d => d._id === doc.id);
              foundry.utils.mergeObject(d, createData, {performDeletions: true});
              result.push(d);
            }
          }
          this.actor._preCreateEmbeddedDocuments(embeddedName, result, options, user.id);
          break;

        case "update":
          for ( const [i, d] of documents.entries() ) {
            const update = hookData[d._id];
            if ( !update ) continue;
            const doc = this.actor.getEmbeddedDocument(embeddedName, d._id);
            await doc._preUpdate(update, options, user);
            const allowed = options.noHook || Hooks.call(`preUpdate${embeddedName}`, doc, update, options, user.id);
            if ( allowed === false ) {
              documents[i] = doc.toObject();
              delete hookData[doc.id];
              console.debug(`${vtt} | ${embeddedName} update prevented by preUpdate hook`);
            }
            else {
              const d = data[doc.collectionName].find(d => d._id === doc.id);
              // Re-apply update data which may have changed in a preUpdate hook
              foundry.utils.mergeObject(d, update, {performDeletions: true});
              result.push(update);
            }
          }
          this.actor._preUpdateEmbeddedDocuments(embeddedName, result, options, user.id);
          break;

        case "delete":
          for ( const id of hookData ) {
            const doc = this.actor.getEmbeddedDocument(embeddedName, id);
            await doc._preDelete(options, user);
            const allowed = options.noHook || Hooks.call(`preDelete${embeddedName}`, doc, options, user.id);
            if ( allowed === false ) {
              documents.push(doc.toObject());
              hookData.findSplice(toDelete => toDelete === doc.id);
              console.debug(`${vtt} | ${embeddedName} deletion prevented by preDelete hook`);
            }
            else result.push(id);
          }
          this.actor._preDeleteEmbeddedDocuments(embeddedName, result, options, user.id);
          break;
      }
    }

    // Simulate updates to the Actor itself
    if ( Object.keys(data).some(k => !embeddedKeys.has(k)) ) {
      await this.actor._preUpdate(data, options, user);
      Hooks.callAll("preUpdateActor", this.actor, data, options, user.id);
    }
  }

  /* -------------------------------------------- */

  /** @inheritdoc */
  _onUpdate(data, options, userId) {
    // Update references to original state so that resetting the preview does not clobber these updates in-memory.
    if ( !options.preview ) Object.values(this.apps).forEach(app => app.original = this.toObject());

    // If the Actor association has changed, expire the cached Token actor
    if ( ("actorId" in data) || ("actorLink" in data) ) {
      if ( this._actor ) Object.values(this._actor.apps).forEach(app => app.close({submit: false}));
      this._actor = null;
    }

    // If the Actor data override changed, simulate updating the synthetic Actor
    if ( ("actorData" in data) && !this.isLinked ) {
      this._onUpdateTokenActor(data.actorData, options, userId);
    }

    // Post-update the Token itself
    return super._onUpdate(data, options, userId);
  }

  /* -------------------------------------------- */

  /**
   * When the base Actor for a TokenDocument changes, we may need to update its Actor instance
   * @param {object} update
   * @param {object} options
   * @private
   */
  _onUpdateBaseActor(update={}, options={}) {

    // Update synthetic Actor data
    if ( !this.isLinked ) {
      update = foundry.utils.mergeObject(update, this.actorData, {
        insertKeys: false,
        insertValues: false,
        inplace: false
      });
      this.actor.updateSource(update, options);
      this.actor.sheet.render(false);
    }

    // Update tracked Combat resource
    const c = this.combatant;
    if ( c && foundry.utils.hasProperty(update.system || {}, game.combat.settings.resource) ) {
      c.updateResource();
      ui.combat.render();
    }

    // Trigger redraws on the token
    if ( this.parent.isView ) {
      this.object.drawBars();
      if ( "effects" in update ) this.object.drawEffects();
    }
  }

  /* -------------------------------------------- */

  /**
   * When the Actor data overrides change for an un-linked Token Actor, simulate the post-update process.
   * @param {object} data
   * @param {object} options
   * @param {string} userId
   * @private
   */
  _onUpdateTokenActor(data, options, userId) {
    const embeddedKeys = new Set(["_id"]);
    if ( this.isLinked ) return;  // Don't do this for linked tokens

    // Obtain references to any embedded documents which will be deleted
    let deletedDocuments = [];
    if ( options.embedded && (options.action === "delete") ) {
      const {embeddedName, hookData} = options.embedded;
      const collection = this.actor.getEmbeddedCollection(embeddedName);
      deletedDocuments = hookData.map(id => collection.get(id));
    }

    // Embedded collections can be updated directly
    if ( options.embedded ) {
      this.actor.updateSource(data, {recursive: false});
    }

    // Otherwise, handle non-embedded updates
    else {
      const embeddedUpdates = {};
      for ( const k of Object.keys(data) ) {
        const field = this.actor.schema.get(k);
        if ( field instanceof foundry.data.fields.EmbeddedCollectionField ) {
          embeddedUpdates[k] = this.actorData[k];
          delete data[k];
        }
      }
      if ( !foundry.utils.isEmpty(embeddedUpdates ) ) this.actor.updateSource(embeddedUpdates, {recursive: false});
      if ( !foundry.utils.isEmpty(data) ) this.actor.updateSource(data, {recursive: true});
    }

    // Simulate modification of embedded documents
    if ( options.embedded ) {
      const {embeddedName, hookData} = options.embedded;
      const collectionName = Actor.metadata.embedded[embeddedName];
      const changes = data[collectionName];
      const collection = this.actor.getEmbeddedCollection(embeddedName);
      embeddedKeys.add(collectionName);
      const result = [];

      switch (options.action) {
        case "create":
          const created = [];
          for ( const d of hookData ) {
            result.push(d);
            const doc = collection.get(d._id);
            if ( !doc ) continue;
            created.push(doc);
            doc._onCreate(d, options, userId);
            Hooks.callAll(`create${embeddedName}`, doc, options, userId);
          }
          this.actor._onCreateEmbeddedDocuments(embeddedName, created, result, options, userId);
          break;

        case "update":
          const documents = [];
          for ( let d of changes ) {
            const update = hookData[d._id];
            if ( !update ) continue;
            result.push(update);
            const doc = collection.get(d._id);
            documents.push(doc);
            doc._onUpdate(update, options, userId);
            Hooks.callAll(`update${embeddedName}`, doc, update, options, userId);
          }
          this.actor._onUpdateEmbeddedDocuments(embeddedName, documents, result, options, userId);
          break;

        case "delete":
          for ( let doc of deletedDocuments ) {
            doc._onDelete(options, userId);
            Hooks.callAll(`delete${embeddedName}`, doc, options, userId);
          }
          this.actor._onDeleteEmbeddedDocuments(embeddedName, deletedDocuments, hookData, options, userId);
          break;
      }
    }

    // Update tracked Combat resource
    const c = this.combatant;
    if ( c && foundry.utils.hasProperty(data.system || {}, game.combat.settings.resource) ) {
      c.updateResource();
      ui.combat.render();
    }

    // Simulate updates to the Actor itself
    if ( Object.keys(data).some(k => !embeddedKeys.has(k)) ) {
      this.actor._onUpdate(data, options, userId);
      Hooks.callAll("updateActor", this.actor, data, options, userId);
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
   * @param {object|DataModel|typeof DataModel|SchemaField} [data]  The object to explore for attributes.
   * @param {string[]} [_path]
   * @returns {TrackedAttributesDescription}
   */
  static getTrackedAttributes(data, _path=[]) {
    if ( (data instanceof foundry.abstract.DataModel) || foundry.utils.isSubclass(data, foundry.abstract.DataModel) ) {
      return this._getTrackedAttributesFromSchema(data.schema, _path);
    }
    if ( data instanceof foundry.data.fields.SchemaField ) return this._getTrackedAttributesFromSchema(data, _path);
    if ( ["Object", "Array"].includes(foundry.utils.getType(data)) ) {
      return this._getTrackedAttributesFromObject(data, _path);
    }

    // Track the path and record found attributes
    const attributes = {bar: [], value: []};
    if ( data !== undefined ) return attributes;

    for ( let [type, model] of Object.entries(game.model.Actor) ) {
      const dataModel = CONFIG.Actor.systemDataModels?.[type];
      const inner = this.getTrackedAttributes(dataModel ?? model, _path);
      attributes.bar.push(...inner.bar);
      attributes.value.push(...inner.value);
    }
    return attributes;
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
