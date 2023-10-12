/** @module client */

/**
 * The string prefix used to prepend console logging
 * @type {string}
 */
const vtt = globalThis.vtt = "Foundry VTT";

/**
 * The singleton Game instance
 * @type {Game}
 */
let game = globalThis.game = {};

// Utilize SmoothGraphics by default
PIXI.LegacyGraphics = PIXI.Graphics;
PIXI.Graphics = PIXI.smooth.SmoothGraphics;

/**
 * The global boolean for whether the EULA is signed
 */
globalThis.SIGNED_EULA = SIGNED_EULA;

/**
 * The global route prefix which is applied to this game
 * @type {string}
 */
globalThis.ROUTE_PREFIX = ROUTE_PREFIX;

/**
 * Critical server-side startup messages which need to be displayed to the client.
 * @type {Array<{type: string, message: string, options: object}>}
 */
globalThis.MESSAGES = MESSAGES || [];

/**
 * A collection of application instances
 * @type {Object<Application>}
 * @alias ui
 */
globalThis.ui = {
  windows: {}
};

/**
 * The client side console logger
 * @type {Console}
 * @alias logger
 */
logger = globalThis.logger = console;

/**
 * The Color management and manipulation class
 * @alias {foundry.utils.Color}
 */
globalThis.Color = foundry.utils.Color;
