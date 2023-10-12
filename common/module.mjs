/** @module foundry */

import * as types from "./types.mjs";
import * as primitives from "./primitives/module.mjs";
import * as CONST from "./constants.mjs";
import * as abstract from "./abstract/module.mjs";
import * as data from "./data/module.mjs";
import * as documents from "./documents/module.mjs";
import * as packages from "./packages/module.mjs";
import * as utils from "./utils/module.mjs";
import * as config from "./config.mjs"

/**
 * Constant definitions used throughout the Foundry Virtual Tabletop framework.
 */
export * as CONST from "./constants.mjs";

/**
 * Abstract class definitions for fundamental concepts used throughout the Foundry Virtual Tabletop framework.
 */
export * as abstract from "./abstract/module.mjs";

/**
 * Application configuration options
 */
export * as config from "./config.mjs";

/**
 * Data schema definitions for data models.
 */
export * as data from "./data/module.mjs";

/**
 * Document definitions used throughout the Foundry Virtual Tabletop framework.
 */
export * as documents from "./documents/module.mjs";

/**
 * Package data definitions, validations, and schema.
 */
export * as packages from "./packages/module.mjs";

/**
 * Utility functions providing helpful functionality.
 */
export * as utils from "./utils/module.mjs";

// Window registration
globalThis.foundry = {
  CONST,
  abstract,
  data,
  utils,
  documents,
  packages,
  config
};
globalThis.CONST = CONST;
for ( let [k, v] of Object.entries(utils) ) {
  /** @deprecated */
  globalThis[k] = v;
}

// Immutable constants
for ( const c of Object.values(CONST) ) {
  Object.freeze(c);
}

// Client-side initialization
if ( globalThis.window ) {
  console.log(`${CONST.vtt} | Foundry Commons Framework Loaded`);
  const ready = new Event("FoundryFrameworkLoaded");
  globalThis.dispatchEvent(ready);
}
