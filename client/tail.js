
// Helper classes
globalThis.Hooks = Hooks;
globalThis.TextEditor = TextEditor;
globalThis.SortingHelpers = SortingHelpers;

// Default Document sheet registrations
DocumentSheetConfig._registerDefaultSheets();

console.groupCollapsed(`${vtt} | Before DOMContentLoaded`);

/**
 * Once the Window has loaded, created and initialize the Game object
 */
window.addEventListener("DOMContentLoaded", async function() {
  console.groupEnd();

  // Log ASCII welcome message
  console.log(CONST.ASCII);

  // Get the current URL
  const url = new URL(window.location.href);
  const view = url.pathname.split("/").pop();

  // Establish a session
  const cookies = Game.getCookies();
  const sessionId = cookies.session ?? null;
  if ( !sessionId ) return window.location.href = foundry.utils.getRoute("join");
  console.log(`${vtt} | Reestablishing existing session ${sessionId}`);

  // Initialize the asset loader
  const routePrefix = globalThis.ROUTE_PREFIX?.replace(/(^[/]+)|([/]+$)/g, "");
  const basePath = routePrefix ? `${window.location.origin}/${routePrefix}` : window.location.origin;
  await PIXI.Assets.init({basePath, preferences: {defaultAutoPlay: false}});

  // Create the master Game controller
  if ( CONST.SETUP_VIEWS.includes(view) ) game = globalThis.game = await Setup.create(view, sessionId);
  else if ( CONST.GAME_VIEWS.includes(view) ) game = globalThis.game = await Game.create(view, sessionId);
  return globalThis.game.initialize();
}, {once: true, passive: true});
