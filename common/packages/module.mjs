/** @module packages */

import {logCompatibilityWarning} from "../utils/logging.mjs";
import BasePackage from "./base-package.mjs";
import BaseWorld from "./base-world.mjs";
import BaseSystem from "./base-system.mjs";
import BaseModule from "./base-module.mjs";

export {default as BasePackage} from "./base-package.mjs";
export {default as BaseWorld} from "./base-world.mjs";
export {default as BaseSystem} from "./base-system.mjs";
export {default as BaseModule} from "./base-module.mjs";
export {PackageCompatibility, RelatedPackage} from "./base-package.mjs";

/* ---------------------------------------- */
/*  Type Definitions                        */
/* ---------------------------------------- */

/**
 * @typedef {Object} PackageAuthorData
 * @property {string} name        The author name
 * @property {string} [email]     The author email address
 * @property {string} [url]       A website url for the author
 * @property {string} [discord]   A Discord username for the author
 */

/**
 * @typedef {Object} PackageCompendiumData
 * @property {string} name        The canonical compendium name. This should contain no spaces or special characters
 * @property {string} label       The human-readable compendium name
 * @property {string} path        The local relative path to the compendium source directory. The filename should match
 *                                the name attribute
 * @property {string} type        The specific document type that is contained within this compendium pack
 * @property {string} [system]    Denote that this compendium pack requires a specific game system to function properly
 */

/**
 * @typedef {Object} PackageLanguageData
 * @property {string} lang        A string language code which is validated by Intl.getCanonicalLocales
 * @property {string} name        The human-readable language name
 * @property {string} path        The relative path to included JSON translation strings
 * @property {string} [system]    Only apply this set of translations when a specific system is being used
 * @property {string} [module]    Only apply this set of translations when a specific module is active
 */

/**
 * @typedef {Object} RelatedPackage
 * @property {string} id                              The id of the related package
 * @property {string} type                            The type of the related package
 * @property {string} [manifest]                      An explicit manifest URL, otherwise learned from the Foundry web server
 * @property {PackageCompatibility} [compatibility]   The compatibility data with this related Package
 * @property {string} [reason]                        The reason for this relationship
 */

/**
 * @typedef {Object} PackageManifestData
 * The data structure of a package manifest. This data structure is extended by BasePackage subclasses to add additional
 * type-specific fields.
 * [[include:full-manifest.md]]
 *
 * @property {string} id              The machine-readable unique package id, should be lower-case with no spaces or special characters
 * @property {string} title           The human-readable package title, containing spaces and special characters
 * @property {string} [description]   An optional package description, may contain HTML
 * @property {PackageAuthorData[]} [authors]  An array of author objects who are co-authors of this package. Preferred to the singular author field.
 * @property {string} [url]           A web url where more details about the package may be found
 * @property {string} [license]       A web url or relative file path where license details may be found
 * @property {string} [readme]        A web url or relative file path where readme instructions may be found
 * @property {string} [bugs]          A web url where bug reports may be submitted and tracked
 * @property {string} [changelog]     A web url where notes detailing package updates are available
 * @property {string} version         The current package version
 * @property {PackageCompatibility} [compatibility]  The compatibility of this version with the core Foundry software
 * @property {string[]} [scripts]     An array of urls or relative file paths for JavaScript files which should be included
 * @property {string[]} [esmodules]   An array of urls or relative file paths for ESModule files which should be included
 * @property {string[]} [styles]      An array of urls or relative file paths for CSS stylesheet files which should be included
 * @property {PackageLanguageData[]} [languages]  An array of language data objects which are included by this package
 * @property {PackageCompendiumData[]} [packs] An array of compendium packs which are included by this package
 * @property {PackageRelationships} [relationships] An organized object of relationships to other Packages
 * @property {boolean} [socket]       Whether to require a package-specific socket namespace for this package
 * @property {string} [manifest]      A publicly accessible web URL which provides the latest available package manifest file. Required in order to support module updates.
 * @property {string} [download]      A publicly accessible web URL where the source files for this package may be downloaded. Required in order to support module installation.
 * @property {boolean} [protected=false] Whether this package uses the protected content access system.
 */

/* ---------------------------------------- */
/*  Deprecations and Compatibility          */
/* ---------------------------------------- */

/**
 * @deprecated since v10
 * @ignore
 */
export class PackageData extends BasePackage {
  constructor(...args) {
    logCompatibilityWarning("foundry.packages.PackageData is deprecated in favor of foundry.packages.BasePackage", {
      since: 10,
      until: 12
    })
    super(...args);
  }
}

/**
 * @deprecated since v10
 * @ignore
 */
export class WorldData extends BaseWorld {
  constructor(...args) {
    logCompatibilityWarning("foundry.packages.WorldData is deprecated in favor of foundry.packages.BaseWorld", {
      since: 10,
      until: 12
    })
    super(...args);
  }
}

/**
 * @deprecated since v10
 * @ignore
 */
export class SystemData extends BaseSystem {
  constructor(...args) {
    logCompatibilityWarning("foundry.packages.SystemData is deprecated in favor of foundry.packages.BaseSystem", {
      since: 10,
      until: 12
    })
    super(...args);
  }
}

/**
 * @deprecated since v10
 * @ignore
 */
export class ModuleData extends BaseModule {
  constructor(...args) {
    logCompatibilityWarning("foundry.packages.ModuleData is deprecated in favor of foundry.packages.BaseModule", {
      since: 10,
      until: 12
    })
    super(...args);
  }
}
