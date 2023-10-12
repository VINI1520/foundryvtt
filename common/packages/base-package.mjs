import DataModel from "../abstract/data.mjs";
import * as fields from "../data/fields.mjs";
import {
  COMPENDIUM_DOCUMENT_TYPES, DOCUMENT_OWNERSHIP_LEVELS,
  PACKAGE_AVAILABILITY_CODES,
  PACKAGE_TYPES,
  SYSTEM_SPECIFIC_COMPENDIUM_TYPES,
  USER_ROLES
} from "../constants.mjs";
import {isNewerVersion, logCompatibilityWarning, mergeObject} from "../utils/module.mjs";
import BaseFolder from "../documents/folder.mjs";
import {ObjectField} from "../data/fields.mjs";
import {DataModelValidationFailure} from "../data/validation-failure.mjs";


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
 * A custom SchemaField for defining package relationships.
 * @property {RelatedPackage[]} systems     Systems that this Package supports
 * @property {RelatedPackage[]} requires    Packages that are required for base functionality
 * @property {RelatedPackage[]} recommends  Packages that are recommended for optimal functionality
 */
export class PackageRelationships extends fields.SchemaField {
  /** @inheritdoc */
  constructor(options) {
    super({
      systems: new fields.SetField(new RelatedPackage({packageType: "system"})),
      requires: new fields.SetField(new RelatedPackage()),
      recommends: new fields.SetField(new RelatedPackage()),
      conflicts: new fields.SetField(new RelatedPackage()),
      flags: new fields.ObjectField()
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
 * A custom SchemaField for defining the folder structure of the included compendium packs.
 */
export class PackageCompendiumFolder extends fields.SchemaField {
  constructor({depth=1, ...options}={}) {
    const schema = {
      name: new fields.StringField({required: true, blank: false}),
      sorting: new fields.StringField({required: false, blank: false, initial: undefined,
        choices: BaseFolder.SORTING_MODES}),
      color: new fields.ColorField(),
      packs: new fields.SetField(new fields.StringField({required: true, blank: false}))
    };
    if ( depth < 4 ) schema.folders = new fields.SetField(new PackageCompendiumFolder(
      {depth: depth+1, options}));
    super(schema, options);
  }
}

/* -------------------------------------------- */

/**
 * A special ObjectField which captures a mapping of USER_ROLES to DOCUMENT_OWNERSHIP_LEVELS.
 */
export class CompendiumOwnershipField extends ObjectField {

  /** @inheritdoc */
  static get _defaults() {
    return mergeObject(super._defaults, {
      initial: {PLAYER: "OBSERVER", ASSISTANT: "OWNER"},
      validationError: "is not a mapping of USER_ROLES to DOCUMENT_OWNERSHIP_LEVELS"
    });
  }

  /** @override */
  _validateType(value, options) {
    for ( let [k, v] of Object.entries(value) ) {
      if ( !(k in USER_ROLES) ) throw new Error(`Compendium ownership key "${k}" is not a valid choice in USER_ROLES`);
      if ( !(v in DOCUMENT_OWNERSHIP_LEVELS) ) throw new Error(`Compendium ownership value "${v}" is not a valid 
      choice in DOCUMENT_OWNERSHIP_LEVELS`);
    }
  }
}

/* -------------------------------------------- */

/**
 * A special SetField which provides additional validation and initialization behavior specific to compendium packs.
 */
export class PackageCompendiumPacks extends fields.SetField {

  /** @override */
  _cleanType(value, options) {
    return value.map(v => {
      v = this.element.clean(v, options);
      if ( v.path ) v.path = v.path.replace(/\.db$/, ""); // Strip old NEDB extensions
      else v.path = `packs/${v.name}`; // Auto-populate a default pack path
      return v;
    })
  }

  /* ---------------------------------------- */

  /** @override */
  initialize(value, model, options={}) {
    const packs = new Set();
    const packageName = model._source.id;
    for ( let v of value ) {
      try {
        const pack = this.element.initialize(v, model, options);
        pack.packageType = model.constructor.type;
        pack.packageName = packageName;
        pack.id = `${model.constructor.type === "world" ? "world" : packageName}.${pack.name}`;
        packs.add(pack);
      } catch(err) {
        logger.warn(err.message);
      }
    }
    return packs;
  }

  /* ---------------------------------------- */

  /**
   * Extend the logic for validating the complete set of packs to ensure uniqueness.
   * @inheritDoc
   */
  _validateElements(value, options) {
    const packNames = new Set();
    const duplicateNames = new Set();
    const packPaths = new Set();
    const duplicatePaths = new Set();
    for ( const pack of value ) {
      if ( packNames.has(pack.name) ) duplicateNames.add(pack.name);
      packNames.add(pack.name);
      if ( pack.path ) {
        if ( packPaths.has(pack.path) ) duplicatePaths.add(pack.path);
        packPaths.add(pack.path);
      }
    }
    return super._validateElements(value, {...options, duplicateNames, duplicatePaths});
  }

  /* ---------------------------------------- */

  /**
   * Validate each individual compendium pack, ensuring its name and path are unique.
   * @inheritDoc
   */
  _validateElement(value, {duplicateNames, duplicatePaths, ...options}={}) {
    if ( duplicateNames.has(value.name) ) {
      return new DataModelValidationFailure({
        invalidValue: value.name,
        message: `Duplicate Compendium name "${value.name}" already declared by some other pack`
      });
    }
    if ( duplicatePaths.has(value.path) ) {
      return new DataModelValidationFailure({
        invalidValue: value.path,
        message: `Duplicate Compendium path "${value.path}" already declared by some other pack`
      });
    }
    return this.element.validate(value, options);
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
    const {availability, locked, exclusive, owned, tags, hasStorage} = data;
    super(data, options);

    /**
     * An availability code in PACKAGE_AVAILABILITY_CODES which defines whether this package can be used.
     * @type {number}
     */
    this.availability = availability ?? this.constructor.testAvailability(this);

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

    /**
     * A flag which tracks if this package has files stored in the persistent storage folder
     * @type {boolean}
     */
    this.hasStorage = hasStorage ?? false;
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
   * A flag which defines whether this package is unavailable to be used.
   * @type {boolean}
   */
  get unavailable() {
    return this.availability > PACKAGE_AVAILABILITY_CODES.UNVERIFIED_GENERATION;
  }

  /**
   * Is this Package incompatible with the currently installed core Foundry VTT software version?
   * @type {boolean}
   */
  get incompatibleWithCoreVersion() {
    return this.constructor.isIncompatibleWithCoreVersion(this.availability);
  }

  /**
   * Test if a given availability is incompatible with the core version.
   * @param {number} availability  The availability value to test.
   * @returns {boolean}
   */
  static isIncompatibleWithCoreVersion(availability) {
    const codes = CONST.PACKAGE_AVAILABILITY_CODES;
    return (availability >= codes.REQUIRES_CORE_DOWNGRADE) && (availability <= codes.REQUIRES_CORE_UPGRADE_UNSTABLE);
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
      id: new fields.StringField({required: true, blank: false, validate: this.validateId}),
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
        name: new fields.StringField({required: false}),
        path: new fields.StringField({required: true, blank: false}),
        system: new fields.StringField(optionalString),
        module: new fields.StringField(optionalString),
        flags: new fields.ObjectField(),
      })),
      packs: new PackageCompendiumPacks(new fields.SchemaField({
        name: new fields.StringField({required: true, blank: false, validate: n => !n.includes("."),
          validationError: "may not contain periods"}),
        label: new fields.StringField({required: true, blank: false}),
        banner: new fields.StringField(optionalString),
        path: new fields.StringField({required: false}),
        type: new fields.StringField({required: true, blank: false, choices: COMPENDIUM_DOCUMENT_TYPES,
          validationError: "must be a value in CONST.COMPENDIUM_DOCUMENT_TYPES"}),
        system: new fields.StringField(optionalString),
        ownership: new CompendiumOwnershipField(),
        flags: new fields.ObjectField(),
      }, {validate: BasePackage.#validatePack})),
      packFolders: new fields.SetField(new PackageCompendiumFolder()),

      // Package relationships
      relationships: new PackageRelationships(),
      socket: new fields.BooleanField(),

      // Package downloading
      manifest: new fields.StringField(),
      download: new fields.StringField({required: false, blank: false, initial: undefined}),
      protected: new fields.BooleanField(),
      exclusive: new fields.BooleanField(),
      persistentStorage: new fields.BooleanField(),
    }
  }

  /* -------------------------------------------- */

  /**
   * Check the given compatibility data against the current installation state and determine its availability.
   * @param {Partial<PackageManifestData>} data  The compatibility data to test.
   * @param {ReleaseData} [release]              A specific software release for which to test availability.
   *                                             Tests against the current release by default.
   * @returns {number}
   */
  static testAvailability({ compatibility }, release) {
    release ??= globalThis.release ?? game.release;
    const codes = CONST.PACKAGE_AVAILABILITY_CODES;
    const {minimum, maximum, verified} = compatibility;
    const isGeneration = version => Number.isInteger(Number(version));

    // Require a certain minimum core version.
    if ( minimum && isNewerVersion(minimum, release.version) ) {
      const generation = Number(minimum.split(".").shift());
      const isStable = generation <= release.maxStableGeneration;
      const exists = generation <= release.maxGeneration;
      if ( isStable ) return codes.REQUIRES_CORE_UPGRADE_STABLE;
      return exists ? codes.REQUIRES_CORE_UPGRADE_UNSTABLE : codes.UNKNOWN;
    }

    // Require a certain maximum core version.
    if ( maximum ) {
      const compatible = isGeneration(maximum)
        ? release.generation <= Number(maximum)
        : !isNewerVersion(release.version, maximum);
      if ( !compatible ) return codes.REQUIRES_CORE_DOWNGRADE;
    }

    // Require a certain compatible core version.
    if ( verified ) {
      const compatible = isGeneration(verified)
        ? Number(verified) >= release.generation
        : !isNewerVersion(release.version, verified);
      const sameGeneration = release.generation === Number(verified.split(".").shift());
      if ( compatible ) return codes.VERIFIED;
      return sameGeneration ? codes.UNVERIFIED_BUILD : codes.UNVERIFIED_GENERATION;
    }

    // No compatible version is specified.
    return codes.UNKNOWN;
  }

  /* -------------------------------------------- */

  /**
   * Test that the dependencies of a package are satisfied as compatible.
   * This method assumes that all packages in modulesCollection have already had their own availability tested.
   * @param {Collection<string,Module>} modulesCollection   A collection which defines the set of available modules
   * @returns {Promise<boolean>}                            Are all required dependencies satisfied?
   * @internal
   */
  async _testRequiredDependencies(modulesCollection) {
    const requirements = this.relationships.requires;
    for ( const {id, type, manifest, compatibility} of requirements ) {
      if ( type !== "module" ) continue; // Only test modules
      let pkg;

      // If the requirement specifies an explicit remote manifest URL, we need to load it
      if ( manifest ) {
        try {
          pkg = await this.constructor.fromRemoteManifest(manifest, {strict: true});
        } catch(err) {
          return false;
        }
      }

      // Otherwise the dependency must belong to the known modulesCollection
      else pkg = modulesCollection.get(id);
      if ( !pkg ) return false;

      // Ensure that the package matches the required compatibility range
      if ( !this.constructor.testDependencyCompatibility(compatibility, pkg) ) return false;

      // Test compatibility of the dependency
      if ( pkg.availability > PACKAGE_AVAILABILITY_CODES.UNVERIFIED_GENERATION ) return false;
    }
    return true;
  }

  /* -------------------------------------------- */

  /**
   *
   * @param {PackageCompatibility} compatibility      The compatibility range declared for the dependency, if any
   * @param {BasePackage} dependency                  The known dependency package
   * @returns {boolean}                               Is the dependency compatible with the required range?
   */
  static testDependencyCompatibility(compatibility, dependency) {
    if ( !compatibility ) return true;
    const {minimum, maximum} = compatibility;
    if ( minimum && isNewerVersion(minimum, dependency.version) ) return false;
    if ( maximum && isNewerVersion(dependency.version, maximum) ) return false;
    return true;
  }

  /* -------------------------------------------- */

  /** @inheritDoc */
  static cleanData(source={}, { installed, ...options }={}) {

    // Auto-assign language name
    for ( let l of source.languages || [] ) {
      l.name = l.name ?? l.lang;
    }

    // Identify whether this package depends on a single game system
    let systemId = undefined;
    if ( this.type === "system" ) systemId = source.id;
    else if ( this.type === "world" ) systemId = source.system;
    else if ( source.relationships?.systems?.length === 1 ) systemId = source.relationships.systems[0].id;

    // Auto-configure some package data
    for ( const pack of source.packs || [] ) {
      if ( !pack.system && systemId ) pack.system = systemId; // System dependency
      if ( typeof pack.ownership === "string" ) pack.ownership = {PLAYER: pack.ownership};
    }

    /**
     * Clean unsupported non-module dependencies in requires or recommends.
     * @deprecated since v11
     */
    ["requires", "recommends"].forEach(rel => {
      const pkgs = source.relationships?.[rel];
      if ( !Array.isArray(pkgs) ) return;
      const clean = [];
      for ( const pkg of pkgs ) {
        if ( !pkg.type || (pkg.type === "module") ) clean.push(pkg);
      }
      const diff = pkgs.length - clean.length;
      if ( diff ) {
        source.relationships[rel] = clean;
        this._logWarning(
          source.id,
          `The ${this.type} "${source.id}" has a ${rel} relationship on a non-module, which is not supported.`,
          { since: 11, until: 12, stack: false, installed });
      }
    });
    return super.cleanData(source, options);
  }

  /* -------------------------------------------- */

  /**
   * Validate that a Package ID is allowed.
   * @param {string} id     The candidate ID
   * @throws                An error if the candidate ID is invalid
   */
  static validateId(id) {
    const allowed = /^[A-Za-z0-9-_]+$/;
    if ( !allowed.test(id) ) throw new Error("Package IDs may only be alphanumeric with hyphens or underscores.");
    const prohibited = /^(con|prn|aux|nul|com[0-9]|lpt[0-9])(\..*)?$/i;
    if ( prohibited.test(id) ) throw new Error(`The Package ID "${id}" uses an operating system prohibited value.`);
  }

  /* -------------------------------------------- */

  /**
   * Validate a single compendium pack object
   * @param {PackageCompendiumData} packData  Candidate compendium packs data
   * @throws                                  An error if the data is invalid
   */
  static #validatePack(packData) {
    if ( SYSTEM_SPECIFIC_COMPENDIUM_TYPES.includes(packData.type) && !packData.system ) {
      throw new Error(`The Compendium pack "${packData.name}" of the "${packData.type}" type must declare the "system"`
      + " upon which it depends.");
    }
  }

  /* -------------------------------------------- */

  /**
   * A wrapper around the default compatibility warning logger which handles some package-specific interactions.
   * @param {string} packageId            The package ID being logged
   * @param {string} message              The warning or error being logged
   * @param {object} options              Logging options passed to foundry.utils.logCompatibilityWarning
   * @param {object} [options.installed]  Is the package installed?
   * @internal
   */
  static _logWarning(packageId, message, { installed, ...options }={}) {
    logCompatibilityWarning(message, options);
    if ( installed ) globalThis.packages?.warnings?.add(packageId, {type: this.type, level: "warning", message});
  }

  /* -------------------------------------------- */

  /** @inheritdoc */
  static migrateData(data, { installed }={}) {
    this._migrateNameToId(data, {since: 10, until: 13, stack: false, installed});
    this._migrateDependenciesNameToId(data, {since: 10, until: 13, stack: false, installed});
    this._migrateToRelationships(data, {since: 10, until: 13, stack: false, installed});
    this._migrateCompatibility(data, {since: 10, until: 13, stack: false, installed});
    this._migrateMediaURL(data, {since: 11, until: 13, stack: false, installed});
    this._migrateOwnership(data, {since: 11, until: 13, stack: false, installed});
    return super.migrateData(data);
  }

  /* -------------------------------------------- */

  /** @internal */
  static _migrateNameToId(data, logOptions) {
    if ( data.name && !data.id ) {
      data.id = data.name;
      delete data.name;
      if ( this.type !== "world" ) {
        const warning = `The ${this.type} "${data.id}" is using "name" which is deprecated in favor of "id"`;
        this._logWarning(data.id, warning, logOptions);
      }
    }
  }

  /* -------------------------------------------- */

  /** @internal */
  static _migrateDependenciesNameToId(data, logOptions) {
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
        this._logWarning(data.id, msg, logOptions);
      }
    }
  }

  /* -------------------------------------------- */

  /** @internal */
  static _migrateToRelationships(data, logOptions) {
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
      this._logWarning(data.id, msg, logOptions);
      delete data.dependencies;
    }

    // V9: system -> relationships.systems
    else if ( data.system && (this.type === "module") ) {
      data.system = data.system instanceof Array ? data.system : [data.system];
      const newSystems = data.system.map(id => ({id})).filter(s => !data.relationships.systems.find(x => x.id === s.id));
      data.relationships.systems = data.relationships.systems.concat(newSystems);
      const msg = `${this.type} "${data.id}" contains "system" which is deprecated in favor of "relationships.systems"`;
      this._logWarning(data.id, msg, logOptions);
      delete data.system;
    }
  }

  /* -------------------------------------------- */

  /** @internal */
  static _migrateCompatibility(data, logOptions) {
    if ( !data.compatibility && (data.minimumCoreVersion || data.compatibleCoreVersion) ) {
      this._logWarning(data.id, `The ${this.type} "${data.id}" is using the old flat core compatibility fields which `
        + `are deprecated in favor of the new "compatibility" object`,
        logOptions);
      data.compatibility = {
        minimum: data.minimumCoreVersion,
        verified: data.compatibleCoreVersion
      };
      delete data.minimumCoreVersion;
      delete data.compatibleCoreVersion;
    }
  }

  /* -------------------------------------------- */

  /** @internal */
  static _migrateMediaURL(data, logOptions) {
    if ( !data.media ) return;
    let hasMediaLink = false;
    for ( const media of data.media ) {
      if ( "link" in media ) {
        hasMediaLink = true;
        media.url = media.link;
        delete media.link;
      }
    }
    if ( hasMediaLink ) {
      const msg = `${this.type} "${data.id}" declares media.link which is unsupported, media.url should be used`;
      this._logWarning(data.id, msg, logOptions);
    }
  }

  /* -------------------------------------------- */

  /** @internal */
  static _migrateOwnership(data, logOptions) {
    if ( !data.packs ) return;
    let hasPrivatePack = false;
    for ( const pack of data.packs ) {
      if ( pack.private && !("ownership" in pack) ) {
        pack.ownership = {PLAYER: "LIMITED", ASSISTANT: "OWNER"};
        hasPrivatePack = true;
      }
      delete pack.private;
    }
    if ( hasPrivatePack ) {
      const msg = `${this.type} "${data.id}" uses pack.private which has been replaced with pack.ownership`;
      this._logWarning(data.id, msg, logOptions);
    }
    return data;
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
