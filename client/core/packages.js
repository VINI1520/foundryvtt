/**
 * A client-side mixin used for all Package types.
 * @param {typeof BasePackage} BasePackage    The parent BasePackage class being mixed
 * @returns {typeof ClientPackage}            A BasePackage subclass mixed with ClientPackage features
 * @category - Mixins
 */
function ClientPackageMixin(BasePackage) {
  class ClientPackage extends BasePackage {
    /**
     * Associate package availability with certain labels for client-side display.
     * @returns {{[unavailable]: string, [incompatible]: string}}
     */
    getAvailabilityLabels() {
      const ac = CONST.PACKAGE_AVAILABILITY_CODES;
      switch (this.availability) {
        case ac.REQUIRES_SYSTEM:
          return {unavailable: game.i18n.localize("SETUP.RequireSystem")};
        case ac.REQUIRES_DEPENDENCY:
          return {unavailable: game.i18n.localize("SETUP.RequireDep")};
        case ac.REQUIRES_CORE_DOWNGRADE:
          return {unavailable: game.i18n.localize("SETUP.RequireCoreDowngrade")};
        case ac.REQUIRES_CORE_UPGRADE_STABLE:
          return {unavailable: game.i18n.localize("SETUP.RequireCoreUpgrade")};
        case ac.REQUIRES_CORE_UPGRADE_UNSTABLE:
          return {incompatible: game.i18n.localize("SETUP.RequireCoreUnstable")};
        case ac.REQUIRES_UPDATE:
          let v = this.compatibility.verified;
          if ( this.type === "world" ) v ??= game.systems.get(this.system)?.compatibility?.verified;
          if ( !v ) return {incompatible: game.i18n.format("SETUP.CompatibilityRiskUnknown")};
          if ( (this.type === "world") && !foundry.utils.isNewerVersion(game.release.generation, v) ) return {};
          return {incompatible: game.i18n.format("SETUP.CompatibilityRiskWithVersion", {version: v})};
        case ac.UNKNOWN:
          return {incompatible: game.i18n.localize("SETUP.CompatibilityUnknown")};
        default:
          return {};
      }
    }

    /* ----------------------------------------- */

    /**
     * When a package has been installed, add it to the local game data.
     */
    install() {
      const collection = this.constructor.collection;
      game.data[collection].push(this.toObject());
      game[collection].set(this.id, this);
    }

    /* ----------------------------------------- */

    /**
     * When a package has been uninstalled, remove it from the local game data.
     */
    uninstall() {
      const collection = this.constructor.collection;
      game.data[collection].findSplice(p => p.id === this.id);
      game[collection].delete(this.id);
    }

    /* -------------------------------------------- */

    /**
     * Writes the Package migration back to disk. Meant for developers to be able to commit an updated manifest.
     * @param {boolean} v9Compatible  If true, v9 required fields such as name will be retained
     * @returns {Promise<void>}
     *
     * @example Use a multi-track release workflow that has a v10-only track and want to commit to /v10/manifest.json
     * ```js
     * game.modules.get("1000-fish").migrateManifest()
     * ```
     * @example You use a single-track release workflow and want to commit to /latest/manifest.json
     * ```js
     * game.modules.get("1000-fish").migrateManifest({v9Compatible: true})
     * ```
     */
    async migrateManifest({v9Compatible = false}={}) {
      if ( game.view !== "setup" ) {
        throw new Error("You may only migrate package manifests from the /setup view");
      }
      const response = await ui.setup._post({
        action: "migratePackageManifest",
        type: this.type,
        id: this.id,
        v9Compatible
      });
      if ( v9Compatible ) {
        ui.notifications.info(`Wrote migrated package manifest to "${response.path}" with minimum-viable V9
         compatibility. You may now commit the changes to your main branch, such as /latest/manifest.json.`);
      }
      else {
        ui.notifications.info(`Wrote migrated package manifest to "${response.path}" in a V10-only format. You may 
        now commit the changes to a branch that does not get read for updates by V9, such as /v10/manifest.json.`);
      }
      ui.notifications.warn("If your Package code is both V9 and V10 compatible, you should leave your existing V9"
        + " fields intact instead of overwriting entirely with this new file.");
    }

    /* -------------------------------------------- */

    /**
     * Retrieve the latest Package manifest from a provided remote location.
     * @param {string} manifest                 A remote manifest URL to load
     * @param {object} options                  Additional options which affect package construction
     * @param {boolean} [options.strict=true]   Whether to construct the remote package strictly
     * @returns {Promise<ClientPackage|null>}   A Promise which resolves to a constructed ServerPackage instance
     * @throws                                  An error if the retrieved manifest data is invalid
     */
    static async fromRemoteManifest(manifest, {strict=false}={}) {
      try {
        const data = await ui.setup._post({action: "getPackageFromRemoteManifest", type: this.type, manifest});
        return new this(data, {installed: false, strict: strict});
      }
      catch(e) {
        return null;
      }
    }
  }
  return ClientPackage;
}

/**
 * @extends foundry.packages.BaseModule
 * @mixes ClientPackageMixin
 * @category - Packages
 */
class Module extends ClientPackageMixin(foundry.packages.BaseModule) {
  constructor(data, options = {}) {
    const {active} = data;
    super(data, options);

    /**
     * Is this package currently active?
     * @type {boolean}
     */
    Object.defineProperty(this, "active", {value: active, writable: false});
  }
}

/**
 * @extends foundry.packages.BaseSystem
 * @mixes ClientPackageMixin
 * @category - Packages
 */
class System extends ClientPackageMixin(foundry.packages.BaseSystem) {}

/**
 * @extends foundry.packages.BaseWorld
 * @mixes ClientPackageMixin
 * @category - Packages
 */
class World extends ClientPackageMixin(foundry.packages.BaseWorld) {}

const PACKAGE_TYPES = {
  world: World,
  system: System,
  module: Module
};
