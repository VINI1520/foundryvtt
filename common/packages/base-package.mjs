import DataModel from "../abstract/data.mjs";
import * as fields from "../data/fields.mjs";
import {
  COMPENDIUM_DOCUMENT_TYPES,
  PACKAGE_AVAILABILITY_CODES,
  PACKAGE_TYPES,
  SYSTEM_SPECIFIC_COMPENDIUM_TYPES
} from "../constants.mjs";
import {logCompatibilityWarning} from "../utils/module.mjs";


/**
 * A custom SchemaField for defining package compatibility versions.
 * @property {string} minimum     The Package will not function before this version
 * @property {string} verified    Verified compatible up to this version
 * @property {string} maximum     The Package will not function after this version
 */
export class PackageCompatibility extends fields.SchemaField {
  constructor(options) {
    super({
      minimum: new fields.StringField({required: false, blank: false, initial: undefined}),
      verified: new fields.StringField({required: false, blank: false, initial: undefined}),
      maximum: new fields.StringField({required: false, blank: false, initial: undefined})
    }, options);
  }
}

/* -------------------------------------------- */

/**
 * A custom SchemaField for defining a related Package.
 * It may be required to be a specific type of package, by passing the packageType option to the constructor.
 */
export class RelatedPackage extends fields.SchemaField {
  constructor({packageType, ...options}={}) {
    let typeOptions = {choices: PACKAGE_TYPES, initial:"module"};
    if ( packageType ) typeOptions = {choices: [packageType], initial: packageType};
    super({
      id: new fields.StringField({required: true, blank: false}),
      type: new fields.StringField(typeOptions),
      manifest: new fields.StringField({required: false, blank: false, initial: undefined}),
      compatibility: new PackageCompatibility(),
      reason: new fields.StringField({required: false, blank: false, initial: undefined})
    }, options);
  }
}

/* -------------------------------------------- */

/**
 * The data schema used to define a Package manifest.
 * Specific types of packages extend this schema with additional fields.
 */
export default class BasePackage extends DataModel {
  /**
   * @param {PackageManifestData} data  Source data for the package
   * @param {object} [options={}]       Options which affect DataModel construction
   */
  constructor(data, options={}) {
    const {availability, unavailable, locked, exclusive, owned, tags} = data;
    super(data, options);

    /**
     * An availability code in PACKAGE_AVAILABILITY_CODES which defines whether this package can be used.
     * @type {number}
     */
    this.availability = availability ?? PACKAGE_AVAILABILITY_CODES.UNKNOWN;

    /**
     * A flag which defines whether this package is unavailable to be used.
     * @type {boolean}
     */
    this.unavailable = unavailable ?? this.availability > PACKAGE_AVAILABILITY_CODES.REQUIRES_UPDATE;

    /**
     * A flag which tracks whether this package is currently locked.
     * @type {boolean}
     */
    this.locked = locked ?? false;

    /**
     * A flag which tracks whether this package is a free Exclusive pack
     * @type {boolean}
     */
    this.exclusive = exclusive ?? false;

    /**
     * A flag which tracks whether this package is owned, if it is protected.
     * @type {boolean|null}
     */
    this.owned = owned ?? false;

    /**
     * A set of Tags that indicate what kind of Package this is, provided by the Website
     * @type {string[]}
     */
    this.tags = tags ?? [];
  }

  /**
   * Define the package type in CONST.PACKAGE_TYPES that this class represents.
   * Each BasePackage subclass must define this attribute.
   * @virtual
   * @type {string}
   */
  static type = "package";

  /**
   * The type of this package instance. A value in CONST.PACKAGE_TYPES.
   * @type {string}
   */
  get type() {
    return this.constructor.type;
  }

  /**
   * The canonical identifier for this package
   * @return {string}
   * @deprecated
   */
  get name() {
    logCompatibilityWarning("You are accessing BasePackage#name which is now deprecated in favor of id.",
      {since: 10, until: 13});
    return this.id;
  }

  /**
   * The named collection to which this package type belongs
   * @type {string}
   */
  static get collection() {
    return `${this.type}s`;
  }

  /** @deprecated */
  get data() {
    logCompatibilityWarning("You are accessing BasePackage#data which is now deprecated in favor of referencing " +
      "schema fields directly on the BasePackage instance.", {since: 10, until: 12});
    return this;
  }

  /** @inheritDoc */
  static defineSchema() {
    const optionalString = {required: false, blank: false, initial: undefined};
    return {

      // Package metadata
      id: new fields.StringField({required: true, blank: false, validate: BasePackage.#validateId}),
      title: new fields.StringField({required: true, blank: false}),
      description: new fields.StringField({required: true}),
      authors: new fields.SetField(new fields.SchemaField({
        name: new fields.StringField({required: true, blank: false}),
        email: new fields.StringField(optionalString),
        url: new fields.StringField(optionalString),
        discord: new fields.StringField(optionalString),
        flags: new fields.ObjectField(),
      })),
      url: new fields.StringField(optionalString),
      license: new fields.StringField(optionalString),
      readme: new fields.StringField(optionalString),
      bugs: new fields.StringField(optionalString),
      changelog: new fields.StringField(optionalString),
      flags: new fields.ObjectField(),
      media: new fields.SetField(new fields.SchemaField({
        type: new fields.StringField(optionalString),
        url: new fields.StringField(optionalString),
        caption: new fields.StringField(optionalString),
        loop: new fields.BooleanField({required: false, blank: false, initial: false}),
        thumbnail: new fields.StringField(optionalString),
        flags: new fields.ObjectField(),
      })),

      // Package versioning
      version: new fields.StringField({required: true, blank: false, initial: "0"}),
      compatibility: new PackageCompatibility(),

      // Included content
      scripts: new fields.SetField(new fields.StringField({required: true, blank: false})),
      esmodules: new fields.SetField(new fields.StringField({required: true, blank: false})),
      styles: new fields.SetField(new fields.StringField({required: true, blank: false})),
      languages: new fields.SetField(new fields.SchemaField({
        lang: new fields.StringField({required: true, blank: false, validate: Intl.getCanonicalLocales,
          validationError: "must be supported by the Intl.getCanonicalLocales function"
        }),
        name: new fields.StringField(),
        path: new fields.StringField({required: true, blank: false}),
        system: new fields.StringField(optionalString),
        module: new fields.StringField(optionalString),
        flags: new fields.ObjectField(),
      })),
      packs: new fields.SetField(new fields.SchemaField({
        name: new fields.StringField({required: true, blank: false, validate: n => !n.includes("."),
          validationError: "may not contain periods"}),
        label: new fields.StringField({required: true, blank: false}),
        path: new fields.StringField({required: true, blank: false}),
        private: new fields.BooleanField(),
        type: new fields.StringField({required: true, blank: false, choices: COMPENDIUM_DOCUMENT_TYPES,
          validationError: "must be a value in CONST.COMPENDIUM_DOCUMENT_TYPES"}),
        system: new fields.StringField(optionalString),
        flags: new fields.ObjectField(),
      }, {
        validate: BasePackage.#validatePack
      })),

      // Package relationships
      relationships: new fields.SchemaField({
        systems: new fields.SetField(new RelatedPackage({packageType: "system"})),
        requires: new fields.SetField(new RelatedPackage()),
        conflicts: new fields.SetField(new RelatedPackage()),
        flags: new fields.ObjectField(),
      }),
      socket: new fields.BooleanField(),

      // Package downloading
      manifest: new fields.StringField(),
      download: new fields.StringField({required: false, blank: false, initial: undefined}),
      protected: new fields.BooleanField(),
      exclusive: new fields.BooleanField()
    }
  }

  /* -------------------------------------------- */

  /** @inheritdoc */
  _initializeSource(data, options) {
    super._initializeSource(data, options);

    // Auto-assign language name
    for ( let l of data.languages ) {
      l.name = l.name ?? l.lang;
    }

    // Auto-assign system compatibility to compendium packs
    let systemId = undefined;
    if ( this.type === "system" ) systemId = data.id;
    else if ( this.type === "world" ) systemId = data.system;
    else if ( data.relationships?.systems?.length === 1 ) systemId = data.relationships.systems[0].id;
    for ( const pack of data.packs ) {
      if ( !pack.system ) pack.system = systemId;
    }
    return data;
  }

  /* -------------------------------------------- */

  /**
   * Validate that a Package ID is allowed.
   * @param {string} id     The candidate ID
   * @throws                An error if the candidate ID is invalid
   */
  static #validateId(id) {
    const allowed = /^[A-Za-z0-9-_]+$/;
    if ( !allowed.test(id) ) throw new Error("Package IDs may only be alphanumeric with hyphens or underscores.");
    const prohibited = /^(con|prn|aux|nul|com[0-9]|lpt[0-9])(\..*)?$/i;
    if ( prohibited.test(id) ) throw new Error(`The Package ID "${id}" uses an operating system prohibited value.`);
  }

  /* -------------------------------------------- */

  /** @override */
  static #validatePack(packData) {
    if ( SYSTEM_SPECIFIC_COMPENDIUM_TYPES.includes(packData.type) && !packData.system ) {
      throw new Error(`The Compendium pack "${packData.name}" of the "${packData.type}" type must declare the "system"`
      + " upon which it depends.");
    }
  }

  /* -------------------------------------------- */

  /**
   * A wrapper around the default compatibility warning logger which handles some package-specific interactions.
   * @param {string} packageId    The package ID being logged
   * @param {string} message      The warning or error being logged
   * @param {object} options      Logging options passed to foundry.utils.logCompatibilityWarning
   */
  static #logWarning(packageId, message, options) {
    logCompatibilityWarning(message, options);
    globalThis.packages?.warnings?.add(packageId, "warning", message);
  }

  /* -------------------------------------------- */

  /** @inheritdoc */
  static migrateData(data) {
    this._migrateNameToId(data, {since: 10, until: 13});
    this._migrateCompendiumEntityToType(data, {since: 9, until: 11});
    this._migrateAuthorToAuthors(data, {since: 9, until: 11});
    this._migrateDependenciesNameToId(data, {since: 10, until: 13});
    this._migrateToRelationships(data, {since: 10, until: 13});
    this._migrateStringAuthors(data, {since: 9, until: 11});
    this._migrateCompatibility(data, {since: 10, until: 13});
    return super.migrateData(data);
  }

  /* -------------------------------------------- */

  /** @internal */
  static _migrateNameToId(data, {since, until}) {
    if ( data.name && !data.id ) {
      data.id = data.name;
      delete data.name;
      if ( this.type !== "world" ) {
        const warning = `The ${this.type} "${data.id}" is using "name" which is deprecated in favor of "id"`;
        BasePackage.#logWarning(data.id, warning, {since, until, stack: false});
      }
    }
  }

  /* -------------------------------------------- */

  /** @internal */
  static _migrateCompendiumEntityToType(data, {since, until}) {
    let hasEntity = false;
    for ( let p of data.packs || [] ) {
      if ( ("entity" in p) && !p.type ) {
        hasEntity = true;
        p.type = p.entity;
      }
    }
    if ( hasEntity ) {
      const msg = `The ${this.type} "${data.id}" contains compendium pack data which uses the deprecated "entity" field `
        + `which must be migrated to "type"`;
      BasePackage.#logWarning(data.id, msg, {mode: CONST.COMPATIBILITY_MODES.WARNING, since, until, stack: false});
    }
  }

  /* -------------------------------------------- */

  /** @internal */
  static _migrateAuthorToAuthors(data, {since, until}) {
    if ( data.author && !data.authors ) {
      if ( this.type !== "world" ) {
        const warning = `The ${this.type} "${data.id}" is using "author" which is deprecated in favor of "authors"`;
        BasePackage.#logWarning(data.id, warning, {since, until, stack: false});
      }
      data.authors = data.authors || [];
      data.authors.push({name: data.author});
      delete data.author;
    }
  }

  /* -------------------------------------------- */

  /** @internal */
  static _migrateDependenciesNameToId(data, {since, until}) {
    if ( data.relationships ) return;
    if ( data.dependencies ) {
      let hasDependencyName = false;
      for ( const dependency of data.dependencies ) {
        if ( dependency.name && !dependency.id ) {
          hasDependencyName = true;
          dependency.id = dependency.name;
          delete dependency.name;
        }
      }
      if ( hasDependencyName ) {
        const msg = `The ${this.type} "${data.id}" contains dependencies using "name" which is deprecated in favor of "id"`;
        BasePackage.#logWarning(data.id, msg, {since, until, stack: false});
      }
    }
  }

  /* -------------------------------------------- */

  /** @internal */
  static _migrateToRelationships(data, {since, until}) {
    if ( data.relationships ) return;
    data.relationships = {
      requires: [],
      systems: []
    };

    // Dependencies -> Relationships.Requires
    if ( data.dependencies ) {
      for ( const d of data.dependencies ) {
        const relationship = {
          "id": d.id,
          "type": d.type,
          "manifest": d.manifest,
          "compatibility": {
            "compatible": d.version
          }
        };
        d.type === "system" ? data.relationships.systems.push(relationship) : data.relationships.requires.push(relationship);
      }
      const msg = `The ${this.type} "${data.id}" contains "dependencies" which is deprecated in favor of "relationships.requires"`;
      BasePackage.#logWarning(data.id, msg, {since, until, stack: false});
      delete data.dependencies;
    }

    // Pre-V9: systems -> relationships.systems
    if ( data.systems ) {
      const newSystems = data.systems.map(id => ({id})).filter(s => !data.relationships.systems.find(x => x.id === s.id));
      data.relationships.systems = data.relationships.systems.concat(newSystems);
      const msg = `${this.type} "${data.id}" contains the "systems" field which is deprecated in favor of "relationships.systems"`;
      BasePackage.#logWarning(data.id, msg, {since: 9, until: 11, stack: false});
      delete data.systems;
    }

    // V9: system -> relationships.systems
    else if ( data.system && (this.type === "module") ) {
      data.system = data.system instanceof Array ? data.system : [data.system];
      const newSystems = data.system.map(id => ({id})).filter(s => !data.relationships.systems.find(x => x.id === s.id));
      data.relationships.systems = data.relationships.systems.concat(newSystems);
      const msg = `${this.type} "${data.id}" contains "system" which is deprecated in favor of "relationships.systems"`;
      BasePackage.#logWarning(data.id, msg, {since, until, stack: false});
      delete data.system;
    }
  }

  /* -------------------------------------------- */

  /** @internal */
  static _migrateStringAuthors(data, {since, until}) {
    let stringAuthors = false;
    if ( typeof data.authors === "string" ) data.authors = [data.authors];
    data.authors = (data.authors || []).map(a => {
      if ( typeof a === "string" ) {
        stringAuthors = true;
        return {name: a}
      }
      return a;
    });
    if ( stringAuthors ) {
      const msg = `The ${this.type} "${data.id}" provides an "authors" array containing string ` +
        "elements which is deprecated in favor of using PackageAuthorData objects";
      BasePackage.#logWarning(data.id, msg, {mode: CONST.COMPATIBILITY_MODES.WARNING, since, until, stack: false});
    }
  }

  /* -------------------------------------------- */

  /** @internal */
  static _migrateCompatibility(data, {since, until}) {
    if ( !data.compatibility && (data.minimumCoreVersion || data.compatibleCoreVersion) ) {
      BasePackage.#logWarning(data.id, `The ${this.type} "${data.id}" is using the old flat core compatibility fields which `
        + `are deprecated in favor of the new "compatibility" object`,
        {since, until, stack: false});

      data.compatibility = {
        minimum: data.minimumCoreVersion,
        verified: data.compatibleCoreVersion
      };
      delete data.minimumCoreVersion;
      delete data.compatibleCoreVersion;
    }
  }

  /* -------------------------------------------- */

  /**
   * Retrieve the latest Package manifest from a provided remote location.
   * @param {string} manifestUrl        A remote manifest URL to load
   * @param {object} options            Additional options which affect package construction
   * @param {boolean} [options.strict=true]   Whether to construct the remote package strictly
   * @return {Promise<ServerPackage>}   A Promise which resolves to a constructed ServerPackage instance
   * @throws                            An error if the retrieved manifest data is invalid
   */
  static async fromRemoteManifest(manifestUrl, {strict=true}={}) {
    throw new Error("Not implemented");
  }
}
