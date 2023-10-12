/**
 * A module which provides documentation for the various hook events which are dispatched throughout the Foundry
 * Virtual Tabletop client-side software.
 * @module hookEvents
 */

/* -------------------------------------------- */
/*  Core lifecycle                              */
/* -------------------------------------------- */

/**
 * A hook event that fires as Foundry is initializing, right before any
 * initialization tasks have begun.
 * @event init
 * @category CoreLifecycle
 */
function init() {}

/* -------------------------------------------- */

/**
 * A hook event that fires once Localization translations have been loaded and are ready for use.
 * @event i18nInit
 * @category CoreLifecycle
 */
function i18nInit() {}

/* -------------------------------------------- */

/**
 * A hook event that fires when Foundry has finished initializing but
 * before the game state has been set up. Fires before any Documents, UI
 * applications, or the Canvas have been initialized.
 * @event setup
 * @category CoreLifecycle
 */
function setup() {}

/* -------------------------------------------- */

/**
 * A hook event that fires when the game is fully ready.
 * @event ready
 * @category CoreLifecycle
 */
function ready() {}

/* -------------------------------------------- */

/**
 * A hook event that fires whenever foundry experiences an error.
 * @event error
 * @category CoreLifecycle
 * @param {string} location      The method where the error was caught.
 * @param {Error} err            The error.
 * @param {object} [data={}]     Additional data that might be provided, based on the nature of the error.
 */
function error(location, error, data) {}

/* -------------------------------------------- */
/*  Game                                        */
/* -------------------------------------------- */

/**
 * A hook event that fires when the game is paused or un-paused.
 * @event pauseGame
 * @category Game
 * @param {boolean} paused    Is the game now paused (true) or un-paused (false)
 */
function pauseGame(paused) {}

/* -------------------------------------------- */

/**
 * A hook event that fires when the official World time is changed.
 * @event updateWorldTime
 * @category Game
 * @param {number} worldTime      The new canonical World time.
 * @param {number} dt             The delta.
 * @param {object} options        Options passed from the requesting client where the change was made
 * @param {string} userId         The ID of the User who advanced the time
 */
function updateWorldTime(worldTime, dt, options, userId) {}

/* -------------------------------------------- */
/*  CanvasLifecycle                             */
/* -------------------------------------------- */

/**
 * A hook event that fires immediately prior to PIXI Application construction with the configuration parameters.
 * @event canvasConfig
 * @category Canvas
 * @param {object} config  Canvas configuration parameters that will be used to initialize the PIXI.Application
 */
function canvasConfig(config) {}

/* -------------------------------------------- */

/**
 * A hook event that fires when the Canvas is initialized.
 * @event canvasInit
 * @category Canvas
 * @param {Canvas} canvas   The Canvas instance being initialized
 */
function canvasInit(canvas) {}

/* -------------------------------------------- */

/**
 * A hook event that fires when the Canvas is panned.
 * @event canvasPan
 * @category Canvas
 * @param {Canvas} canvas         The Canvas instance
 * @param {object} position       The applied camera position
 * @param {number} position.x         The constrained x-coordinate of the pan
 * @param {number} position.y         The constrained y-coordinate of the pan
 * @param {number} position.scale     The constrained zoom level of the pan
 */
function canvasPan(canvas, position) {}

/* -------------------------------------------- */

/**
 * A hook event that fires when the Canvas is ready.
 * @event canvasReady
 * @category Canvas
 * @param {Canvas} canvas The Canvas which is now ready for use
 */
function canvasReady(canvas) {}

/* -------------------------------------------- */

/**
 * A hook event that fires when the Canvas is deactivated.
 * @event canvasTearDown
 * @category Canvas
 * @param {Canvas} canvas   The Canvas instance being deactivated
 */
function canvasTearDown(canvas) {}

/* -------------------------------------------- */

/**
 * A hook event that fires when the Canvas is beginning to draw the canvas groups.
 * @event canvasDraw
 * @category Canvas
 * @param {Canvas} canvas   The Canvas instance being deactivated
 */
function canvasDraw(canvas) {}

/* -------------------------------------------- */

/**
 * A hook event that fires when some useful data is dropped onto the Canvas.
 * @event dropCanvasData
 * @category Canvas
 * @param {Canvas} canvas The Canvas
 * @param {object} data   The data that has been dropped onto the Canvas
 */
function dropCanvasData(canvas, data) {}

/* -------------------------------------------- */

/**
 * A hook event that fires when objects are highlighted on the canvas.
 * Callers may use this hook to apply their own modifications or enhancements to highlighted objects.
 * @event highlightObjects
 * @category Canvas
 * @param {boolean} active    Is the highlight state now active
 */
function highlightObjects(active) {}

/* -------------------------------------------- */
/*  Application                                 */
/* -------------------------------------------- */

/**
 * A hook event that fires whenever an Application is rendered. Substitute the
 * Application name in the hook event to target a specific Application type, for example "renderMyApplication".
 * Each Application class in the inheritance chain will also fire this hook, i.e. "renderApplication" will also fire.
 * The hook provides the pending application HTML which will be added to the DOM.
 * Hooked functions may modify that HTML or attach interactive listeners to it.
 *
 * @event renderApplication
 * @category Application
 * @param {Application} application     The Application instance being rendered
 * @param {jQuery} html                 The inner HTML of the document that will be displayed and may be modified
 * @param {object} data                 The object of data used when rendering the application
 */
function renderApplication(application, html, data) {}

/* -------------------------------------------- */

/**
 * A hook event that fires whenever this Application is first rendered to add buttons to its header.
 *
 * @event getApplicationHeaderButtons
 * @category Application
 * @typedef {{label: string, class: string, icon: string, [tooltip]: string, onclick: Function|null}} ApplicationHeaderButton
 * @param {Application} app                     The Application instance being rendered
 * @param {ApplicationHeaderButton[]} buttons   The array of header buttons which will be displayed
 */
function getApplicationHeaderButtons(application, buttons) {}

/* -------------------------------------------- */

/**
 * A hook event that fires whenever this Application is closed.
 *
 * @event closeApplication
 * @category Application
 * @param {Application} app                     The Application instance being closed
 * @param {jQuery[]} html                       The application HTML when it is closed
 */
function closeApplication(application, html) {}

/* -------------------------------------------- */

/**
 * A hook event that fires when the Scene controls are initialized.
 * @event getSceneControlButtons
 * @category Application
 * @param {SceneControl[]} controls The SceneControl configurations
 */
function getSceneControlButtons(controls) {}

/* -------------------------------------------- */

/**
 * A hook event that fires whenever data is dropped into a Hotbar slot.
 * The hook provides a reference to the Hotbar application, the dropped data, and the target slot.
 * Default handling of the drop event can be prevented by returning false within the hooked function.
 * @event hotbarDrop
 * @category Application
 * @param {Hotbar} hotbar       The Hotbar application instance
 * @param {object} data         The dropped data object
 * @param {number} slot         The target hotbar slot
 */
function hotbarDrop(hotbar, data, slot) {}

/* -------------------------------------------- */

/**
 * A hook event that fires whenever scene navigation is collapsed.
 * @event collapseSceneNavigation
 * @category Application
 * @param {SceneNavigation} sceneNavigation
 * @param {boolean} collapsed
 */
function collapseSceneNavigation(sceneNavigation, collapsed) {}

/* -------------------------------------------- */

/**
 * A hook event that fires when the context menu for entries in an Application is constructed. Substitute the
 * Application name in the hook event to target a specific Application, for example
 * "getActorDirectoryEntryContext".
 * @event getApplicationEntryContext
 * @category Application
 * @param {jQuery} html                       The HTML element to which the context options are attached
 * @param {ContextMenuEntry[]} entryOptions   The context menu entries
 */
function getApplicationEntryContext(html, entryOptions) {}

/* -------------------------------------------- */

/**
 * A hook event that fires when the Sidebar is collapsed or expanded.
 * @event collapseSidebar
 * @category Application
 * @param {Sidebar} sidebar   The Sidebar application
 * @param {boolean} collapsed Whether the Sidebar is now collapsed or not
 */
function collapseSidebar(sidebar, collapsed) {}

/* -------------------------------------------- */

/**
 * A hook event that fires when the Sidebar tab is changed.
 * @event changeSidebarTab
 * @category Application
 * @param {SidebarTab} app    The SidebarTab application which is now active
 */
function changeSidebarTab(app) {}

/* -------------------------------------------- */
/*  EffectsCanvasGroup                          */
/* -------------------------------------------- */

/**
 * A hook event that fires in the {@link EffectsCanvasGroup} #createLayers private method.
 * @event createEffectsCanvasGroup
 * @category EffectsCanvasGroup
 * @param {EffectsCanvasGroup} group  The EffectsCanvasGroup instance
 */
function createEffectsCanvasGroup(group) {}

/* -------------------------------------------- */

/**
 * A hook event that fires in the {@link EffectsCanvasGroup} draw method.
 * @event drawEffectsCanvasGroup
 * @category EffectsCanvasGroup
 * @param {EffectsCanvasGroup} group  The EffectsCanvasGroup instance
 */
function drawEffectsCanvasGroup(group) {}

/* -------------------------------------------- */

/**
 * A hook event that fires in the {@link EffectsCanvasGroup} tearDown method.
 * @event tearDownEffectsCanvasGroup
 * @category EffectsCanvasGroup
 * @param {EffectsCanvasGroup} group  The EffectsCanvasGroup instance
 */
function tearDownEffectsCanvasGroup(group) {}

/* -------------------------------------------- */
/*  CanvasLayer                                 */
/* -------------------------------------------- */

/**
 * A hook event that fires with a {@link CanvasLayer} is initially drawn.
 * The dispatched event name replaces "Layer" with the named CanvasLayer subclass, i.e. "drawTokensLayer".
 * @event drawLayer
 * @category CanvasLayer
 * @param {CanvasLayer} layer         The layer being drawn
 */
function drawLayer(layer) {}

/* -------------------------------------------- */

/**
 * A hook event that fires with a {@link CanvasLayer} is deconstructed.
 * The dispatched event name replaces "Layer" with the named CanvasLayer subclass, i.e. "tearDownTokensLayer".
 * @event tearDownLayer
 * @category CanvasLayer
 * @param {CanvasLayer} layer         The layer being deconstructed
 */
function tearDownLayer(layer) {}

/* -------------------------------------------- */

/**
 * A hook event that fires when any PlaceableObject is pasted onto the Scene.
 * Substitute the PlaceableObject name in the hook event to target a
 * specific PlaceableObject type, for example "pasteToken".
 * @event pastePlaceableObject
 * @category CanvasLayer
 * @param {PlaceableObject[]} copied The PlaceableObjects that were copied
 * @param {object[]} createData      The new objects that will be added to the Scene
 */
function pastePlaceableObject(copied, createData) {}

/* -------------------------------------------- */
/*  Active Effects                              */
/* -------------------------------------------- */

/**
 * A hook event that fires when a custom active effect is applied.
 * @event applyActiveEffect
 * @category Active Effects
 * @param {Actor} actor                   The actor the active effect is being applied to
 * @param {EffectChangeData} change       The change data being applied
 * @param {*} current                     The current value being modified
 * @param {*} delta                       The parsed value of the change object
 * @param {object} changes                An object which accumulates changes to be applied
 */
function applyActiveEffect(actor, change, current, delta, changes) {}

/* -------------------------------------------- */
/*  Compendium                                  */
/* -------------------------------------------- */

/**
 * A hook event that fires whenever the contents of a Compendium pack were modified.
 * This hook fires for all connected clients after the update has been processed.
 *
 * @event updateCompendium
 * @category Compendium
 * @param {CompendiumCollection} pack   The Compendium pack being modified
 * @param {Document[]} documents        The locally-cached Documents which were modified in the operation
 * @param {object} options              Additional options which modified the modification request
 * @param {string} userId               The ID of the User who triggered the modification workflow
 */
function updateCompendium(pack, documents, options, userId) {}

/* -------------------------------------------- */
/*  Document                                    */
/* -------------------------------------------- */

/**
 * A hook event that fires for every Document type before execution of a creation workflow. Substitute the
 * Document name in the hook event to target a specific Document type, for example "preCreateActor". This hook
 * only fires for the client who is initiating the creation request.
 *
 * The hook provides the pending document instance which will be used for the Document creation. Hooked functions
 * may modify the pending document with updateSource, or prevent the workflow entirely by returning false.
 *
 * @event preCreateDocument
 * @category Document
 * @param {Document} document                     The pending document which is requested for creation
 * @param {object} data                           The initial data object provided to the document creation request
 * @param {DocumentModificationContext} options   Additional options which modify the creation request
 * @param {string} userId                         The ID of the requesting user, always game.user.id
 * @returns {boolean|void}                        Explicitly return false to prevent creation of this Document
 */
function preCreateDocument(document, data, options, userId) {}

/* -------------------------------------------- */

/**
 * A hook event that fires for every Document type before execution of an update workflow. Substitute the Document
 * name in the hook event to target a specific Document type, for example "preUpdateActor". This hook only fires
 * for the client who is initiating the update request.
 *
 * The hook provides the differential data which will be used to update the Document. Hooked functions may modify
 * that data or prevent the workflow entirely by explicitly returning false.
 *
 * @event preUpdateDocument
 * @category Document
 * @param {Document} document                       The Document instance being updated
 * @param {object} changes                          Differential data that will be used to update the document
 * @param {DocumentModificationContext} options     Additional options which modify the update request
 * @param {string} userId                           The ID of the requesting user, always game.user.id
 * @returns {boolean|void}                          Explicitly return false to prevent update of this Document
 */
function preUpdateDocument(document, changes, options, userId) {}

/* -------------------------------------------- */

/**
 * A hook event that fires for every Document type before execution of a deletion workflow. Substitute the
 * Document name in the hook event to target a specific Document type, for example "preDeleteActor". This hook
 * only fires for the client who is initiating the update request.
 *
 * The hook provides the Document instance which is requested for deletion. Hooked functions may prevent the
 * workflow entirely by explicitly returning false.
 *
 * @event preDeleteDocument
 * @category Document
 * @param {Document} document                       The Document instance being deleted
 * @param {DocumentModificationContext} options     Additional options which modify the deletion request
 * @param {string} userId                           The ID of the requesting user, always game.user.id
 * @returns {boolean|void}                          Explicitly return false to prevent deletion of this Document
 */
function preDeleteDocument(document, options, userId) {}

/* -------------------------------------------- */

/**
 * A hook event that fires for every embedded Document type after conclusion of a creation workflow.
 * Substitute the Document name in the hook event to target a specific type, for example "createToken".
 * This hook fires for all connected clients after the creation has been processed.
 *
 * @event createDocument
 * @category Document
 * @param {Document} document                       The new Document instance which has been created
 * @param {DocumentModificationContext} options     Additional options which modified the creation request
 * @param {string} userId                           The ID of the User who triggered the creation workflow
 */
function createDocument(document, options, userId) {}

/* -------------------------------------------- */

/**
 * A hook event that fires for every Document type after conclusion of an update workflow.
 * Substitute the Document name in the hook event to target a specific Document type, for example "updateActor".
 * This hook fires for all connected clients after the update has been processed.
 *
 * @event updateDocument
 * @category Document
 * @param {Document} document                       The existing Document which was updated
 * @param {object} change                           Differential data that was used to update the document
 * @param {DocumentModificationContext} options     Additional options which modified the update request
 * @param {string} userId                           The ID of the User who triggered the update workflow
 */
function updateDocument(document, change, options, userId) {}

/* -------------------------------------------- */

/**
 * A hook event that fires for every Document type after conclusion of an deletion workflow.
 * Substitute the Document name in the hook event to target a specific Document type, for example "deleteActor".
 * This hook fires for all connected clients after the deletion has been processed.
 *
 * @event deleteDocument
 * @category Document
 * @param {Document} document                       The existing Document which was deleted
 * @param {DocumentModificationContext} options     Additional options which modified the deletion request
 * @param {string} userId                           The ID of the User who triggered the deletion workflow
 */
function deleteDocument(document, options, userId) {}

/* -------------------------------------------- */
/*  PlaceableObject                             */
/* -------------------------------------------- */

/**
 * A hook event that fires when a {@link PlaceableObject} is initially drawn.
 * The dispatched event name replaces "Object" with the named PlaceableObject subclass, i.e. "drawToken".
 * @event drawObject
 * @category PlaceableObject
 * @param {PlaceableObject} object    The object instance being drawn
 */
function drawObject(object) {}

/* -------------------------------------------- */

/**
 * A hook event that fires when a {@link PlaceableObject} is incrementally refreshed.
 * The dispatched event name replaces "Object" with the named PlaceableObject subclass, i.e. "refreshToken".
 * @event refreshObject
 * @category PlaceableObject
 * @param {PlaceableObject} object    The object instance being refreshed
 */
function refreshObject(object) {}

/* -------------------------------------------- */

/**
 * A hook event that fires when a {@link PlaceableObject} is destroyed.
 * The dispatched event name replaces "Object" with the named PlaceableObject subclass, i.e. "destroyToken".
 * @event destroyObject
 * @category PlaceableObject
 * @param {PlaceableObject} object    The object instance being refreshed
 */
function destroyObject(object) {}

/* -------------------------------------------- */

/**
 * A hook event that fires when a {@link PlaceableObject} is selected or
 * deselected. Substitute the PlaceableObject name in the hook event to
 * target a specific PlaceableObject type, for example "controlToken".
 * @event controlObject
 * @category PlaceableObject
 * @param {PlaceableObject} object The object instance which is selected/deselected.
 * @param {boolean} controlled     Whether the PlaceableObject is selected or not.
 */
function controlObject(object, controlled) {}

/* -------------------------------------------- */

/**
 * A hook event that fires when a {@link PlaceableObject} is hovered over or out.
 * Substitute the PlaceableObject name in the hook event to target a specific
 * PlaceableObject type, for example "hoverToken".
 * @event hoverObject
 * @category PlaceableObject
 * @param {PlaceableObject} object The object instance.
 * @param {boolean} hovered        Whether the PlaceableObject is hovered over or not.
 */
function hoverObject(object, hovered) {}

/* -------------------------------------------- */
/*  Token                                       */
/* -------------------------------------------- */

/**
 * A hook event that fires when a token {@link Token} should apply a specific status effect.
 * @event applyTokenStatusEffect
 * @category Token
 * @param {Token} token       The token affected.
 * @param {string} statusId   The status effect ID being applied, from CONFIG.specialStatusEffects.
 * @param {boolean} active    Is the special status effect now active?
 */
function applyTokenStatusEffect(token, statusId, active) {}

/* -------------------------------------------- */

/**
 * A hook event that fires when some useful data is dropped onto a RollTableConfig.
 * @event chatBubble
 * @category Token
 * @param {Token} token                 The speaking token
 * @param {jQuery} html                 The HTML of the chat bubble
 * @param {string} message              The spoken message text
 * @param {ChatBubbleOptions} options   Provided options which affect bubble appearance
 */
function chatBubble(token, html, message, {cssClasses, pan}) {}

/* -------------------------------------------- */

/**
 * A hook event that fires when a token's resource bar attribute has been modified.
 * @event modifyTokenAttribute
 * @category Token
 * @param {object} data           An object describing the modification
 * @param {string} data.attribute The attribute path
 * @param {number} data.value     The target attribute value
 * @param {boolean} data.isDelta  Does number represents a relative change (true) or an absolute change (false)
 * @param {boolean} data.isBar    Whether the new value is part of an attribute bar, or just a direct value
 * @param {objects} updates       The update delta that will be applied to the Token's actor
 */
function modifyTokenAttribute({attribute, value, isDelta, isBar}, updates) {}

/* -------------------------------------------- */

/**
 * A hook event that fires when a token is targeted or un-targeted.
 * @event targetToken
 * @category Token
 * @param {User} user        The User doing the targeting
 * @param {Token} token      The targeted Token
 * @param {boolean} targeted Whether the Token has been targeted or untargeted
 */
function targetToken(user, token, targeted) {}

/* -------------------------------------------- */
/*  Note                                        */
/* -------------------------------------------- */

/**
 * A hook event that fires whenever a map note is double-clicked.
 * The hook provides the note placeable and the arguments passed to the associated {@link JournalSheet} render call.
 * Hooked functions may modify the render arguments or cancel the render by returning false.
 * @event activateNote
 * @category Note
 * @param {Note} note  The note that was activated.
 * @param {object} options  Options for rendering the associated {@link JournalSheet}.
 */
function activateNote(note, options) {}

/* -------------------------------------------- */
/*  PointSource                                 */
/* -------------------------------------------- */

/**
 * A hook event that fires after RenderedPointSource shaders have initialized.
 * @event initializeRenderedPointSourceShaders
 * @category PointSource
 * @param {RenderedPointSource} source   The RenderedPointSource being initialized.
 */
function initializeRenderedPointSourceShaders(source) {}

/* -------------------------------------------- */
/*  Cards                                       */
/* -------------------------------------------- */

/**
 * A hook event that fires when Cards are dealt from a deck to other hands.
 * @event dealCards
 * @category Cards
 * @param {Cards} origin                       The origin Cards document
 * @param {Cards[]} destinations               An array of destination Cards documents
 * @param {object} context                     Additional context which describes the operation
 * @param {string} context.action              The action name being performed, i.e. "deal", "pass"
 * @param {Array<object[]>} context.toCreate   An array of Card creation operations to be performed in each
 *                                             destination Cards document
 * @param {object[]} context.fromUpdate        Card update operations to be performed in the origin Cards document
 * @param {object[]} context.fromDelete        Card deletion operations to be performed in the origin Cards document
 */
function dealCards(origin, destinations, {action, toCreate, fromUpdate, fromDelete}) {}

/* -------------------------------------------- */

/**
 * A hook event that fires when Cards are passed from one stack to another.
 * @event passCards
 * @category Cards
 * @param {Cards} origin                The origin Cards document
 * @param {Cards} destination           The destination Cards document
 * @param {object} context              Additional context which describes the operation
 * @param {string} context.action       The action name being performed, i.e. "pass", "play", "discard", "draw"
 * @param {object[]} context.toCreate     Card creation operations to be performed in the destination Cards document
 * @param {object[]} context.toUpdate     Card update operations to be performed in the destination Cards document
 * @param {object[]} context.fromUpdate   Card update operations to be performed in the origin Cards document
 * @param {object[]} context.fromDelete   Card deletion operations to be performed in the origin Cards document
 */
function passCards(origin, destinations, {action, toCreate, toUpdate, fromUpdate, fromDelete}) {}

/* -------------------------------------------- */

/**
 * A hook event that fires when Cards are dealt from a deck to other hands.
 * @event returnCards
 * @category Cards
 * @param {Cards} origin                               The origin Cards document.
 * @param {Card[]} returned                            The cards being returned.
 * @param {object} context                             Additional context which describes the operation.
 * @param {Object<string, object[]>} context.toUpdate  A mapping of Card deck IDs to the update operations that
 *                                                     will be performed on them.
 * @param {object[]} context.fromDelete                Card deletion operations to be performed on the origin Cards
 *                                                     document.
 */
function returnCards(origin, returned, {toUpdate, fromDelete}) {}

/* -------------------------------------------- */
/*  ActorSheet                                  */
/* -------------------------------------------- */

/**
 * A hook event that fires when some useful data is dropped onto an ActorSheet.
 * @event dropActorSheetData
 * @category ActorSheet
 * @param {Actor} actor      The Actor
 * @param {ActorSheet} sheet The ActorSheet application
 * @param {object} data      The data that has been dropped onto the sheet
 */
function dropActorSheetData(actor, sheet, data) {}

/* -------------------------------------------- */
/*  InteractionLayer                            */
/* -------------------------------------------- */

/**
 * A hook event that fires with a {@link InteractionLayer} becomes active.
 * The dispatched event name replaces "Layer" with the named InteractionLayer subclass, i.e. "activateTokensLayer".
 * @event activateLayer
 * @category InteractionLayer
 * @param {InteractionLayer} layer    The layer becoming active
 */
function activateLayer(layer) {}

/* -------------------------------------------- */

/**
 * A hook event that fires with a {@link InteractionLayer} becomes inactive.
 * The dispatched event name replaces "Layer" with the named InteractionLayer subclass, i.e. "deactivateTokensLayer".
 * @event deactivateLayer
 * @category InteractionLayer
 * @param {InteractionLayer} layer    The layer becoming inactive
 */
function deactivateLayer(layer) {}

/* -------------------------------------------- */
/*  CanvasVisibility                            */
/* -------------------------------------------- */

/**
 * A hook event that fires when the set of vision sources are initialized.
 * @event initializeVisionSources
 * @category CanvasVisibility
 * @param {Collection<string, VisionSource>} sources  The collection of current vision sources
 */
function initializeVisionSources(sources) {}

/* -------------------------------------------- */

/**
 * A hook event that fires when the LightingLayer is refreshed.
 * @event lightingRefresh
 * @category EffectsCanvasGroup
 * @param {EffectsCanvasGroup} group The EffectsCanvasGroup instance
 */
function lightingRefresh(group) {}

/* -------------------------------------------- */

/**
 * A hook event that fires during light source initialization.
 * This hook can be used to add programmatic light sources to the Scene.
 * @event initializeLightSources
 * @category CanvasVisibility
 * @param {EffectsCanvasGroup} group   The EffectsCanvasGroup where light sources are initialized
 */
function initializeLightSources(group) {}

/* -------------------------------------------- */

/**
 * A hook event that fires when the CanvasVisibility layer has been refreshed.
 * @event sightRefresh
 * @category CanvasVisibility
 * @param {CanvasVisibility} visibility     The CanvasVisibility layer
 */
function sightRefresh(visibility) {}

/* -------------------------------------------- */
/*  Weather                                     */
/* -------------------------------------------- */

/**
 * A hook event that fires when initializing a weather effect
 * @event initializeWeatherEffects
 * @category Weather
 * @param {WeatherEffects} weatherEffect  The weather effects canvas layer.
 * @param {object} weatherEffectsConfig   The weather effects config object.
 */
function initializeWeatherEffects(weatherEffect, weatherEffectsConfig) {}

/* -------------------------------------------- */
/*  Adventure                                   */
/* -------------------------------------------- */

/**
 * A hook event that fires when Adventure data is being prepared for import.
 * Modules may return false from this hook to take over handling of the import workflow.
 * @event preImportAdventure
 * @category Adventure
 * @param {Adventure} adventure         The Adventure document from which content is being imported
 * @param {object} formData             Processed data from the importer form
 * @param {Object<object[]>} toCreate   Adventure data which needs to be created in the World
 * @param {Object<object[]>} toUpdate   Adventure data which needs to be updated in the World
 * @returns {boolean|void}              False to prevent the core software from handling the import
 */
function preImportAdventure(adventure, formData, toCreate, toUpdate) {}

/**
 * A hook event that fires after an Adventure has been imported into the World.
 * @event importAdventure
 * @category Adventure
 * @param {Adventure} adventure         The Adventure document from which content is being imported
 * @param {object} formData             Processed data from the importer form
 * @param {Object<Document[]>} created  Documents which were created in the World
 * @param {Object<Document[]>} updated  Documents which were updated in the World
 */
function importAdventure(adventure, formData, created, updated) {}

/* -------------------------------------------- */
/*  Socket                                      */
/* -------------------------------------------- */

/**
 * A hook event that fires when the World time has been updated.
 * @event updateWorldTime
 * @category GameTime
 * @param {number} worldTime            The new canonical World time
 * @param {number} delta                The time delta
 * @param {object} options              Options passed from the requesting client which triggered the update
 * @param {string} userId               The ID of the User who changed the world time
 */
function updateWorldTime(worldTime, delta, options, userId) {}

/* -------------------------------------------- */

/**
 * A hook event that fires whenever some other User joins or leaves the game session.
 * @event userConnected
 * @category User
 * @param {User} user                     The User who has connected or disconnected
 * @param {boolean} connected             Is the user now connected (true) or disconnected (false)
 */
function userConnected(user, connected) {}

/* -------------------------------------------- */
/*  Combat                                      */
/* -------------------------------------------- */

/**
 * A hook event that fires when a Combat encounter is started.
 * @event combatStart
 * @category Combat
 * @param {Combat} combat           The Combat encounter which is starting
 * @param {object} updateData       An object which contains Combat properties that will be updated. Can be mutated.
 * @param {number} updateData.round      The initial round
 * @param {number} updateData.turn       The initial turn
 */
function combatStart(combat, updateData) {}

/* -------------------------------------------- */

/**
 * A hook event that fires when the turn of the Combat encounter changes.
 * @event combatTurn
 * @category Combat
 * @param {Combat} combat           The Combat encounter which is advancing or rewinding its turn
 * @param {object} updateData       An object which contains Combat properties that will be updated. Can be mutated.
 * @param {number} updateData.round      The current round of Combat
 * @param {number} updateData.turn       The new turn number
 * @param {object} updateOptions    An object which contains options provided to the update method. Can be mutated.
 * @param {number} updateOptions.advanceTime    The amount of time in seconds that time is being advanced
 * @param {number} updateOptions.direction      A signed integer for whether the turn order is advancing or rewinding
 */
function combatTurn(combat, updateData, updateOptions) {}

/* -------------------------------------------- */

/**
 * A hook event that fires when the round of the Combat encounter changes.
 * @event combatRound
 * @category Combat
 * @param {Combat} combat           The Combat encounter which is advancing or rewinding its round
 * @param {object} updateData       An object which contains Combat properties that will be updated. Can be mutated.
 * @param {number} updateData.round      The new round of Combat
 * @param {number} updateData.turn       The new turn number
 * @param {object} updateOptions    An object which contains options provided to the update method. Can be mutated.
 * @param {number} updateOptions.advanceTime    The amount of time in seconds that time is being advanced
 * @param {number} updateOptions.direction      A signed integer for whether the turn order is advancing or rewinding
 */
function combatRound(combat, updateData, updateOptions) {}

/* -------------------------------------------- */
/*  ProseMirror                                 */
/* -------------------------------------------- */

/**
 * A hook even that fires when a ProseMirrorMenu's drop-downs are initialized.
 * The hook provides the ProseMirrorMenu instance and an object of drop-down configuration data.
 * Hooked functions may append their own drop-downs or append entries to existing drop-downs.
 *
 * @event getProseMirrorMenuDropDowns
 * @category ProseMirrorMenu
 * @param {ProseMirrorMenu} menu  The ProseMirrorMenu instance.
 * @param {{format: ProseMirrorDropDownConfig, fonts: ProseMirrorDropDownConfig}} config  The drop-down config.
 */
function getProseMirrorMenuDropDowns(menu, config) {}

/* -------------------------------------------- */

/**
 * A hook even that fires when a ProseMirrorMenu's buttons are initialized.
 * The hook provides the ProseMirrorMenu instance and an array of button configuration data.
 * Hooked functions may append their own buttons to the list.
 *
 * @event getProseMirrorMenuItems
 * @category ProseMirrorMenu
 * @param {ProseMirrorMenu} menu          The ProseMirrorMenu instance.
 * @param {ProseMirrorMenuItem[]} config  The button configuration objects.
 */
function getProseMirrorMenuItems(menu, config) {}

/* -------------------------------------------- */

/**
 * A hook event that fires whenever a ProseMirror editor is created.
 * The hook provides the ProseMirror instance UUID, a list of plugins, and an object containing the provisional
 * editor state, and a reference to the menu plugin.
 * Hooked functions may append their own plugins or replace the state or menu plugin by replacing their references
 * in the final argument.
 *
 * @event createProseMirrorEditor
 * @category ProseMirrorEditor
 * @param {string} uuid                   A UUID that uniquely identifies this ProseMirror instance.
 * @param {Object<Plugin>} plugins        A list of plugins that will be loaded.
 * @param {{state: EditorState}} options  The provisional EditorState and ProseMirrorMenuPlugin.
 */
function createProseMirrorEditor(uuid, plugins, options) {}

/* -------------------------------------------- */
/*  HotReload                                   */
/* -------------------------------------------- */

/**
 * A hook event that fires when a package that is being watched by the hot reload system has a file changed.
 * The hook provides the hot reload data related to the file change.
 * Hooked functions may intercept the hot reload and prevent the core software from handling it by returning false.
 *
 * @event hotReload
 * @category HotReload
 * @param {HotReloadData} data          The hot reload data
 */
function hotReload(data) {}

/* -------------------------------------------- */
/*  Chat                                        */
/* -------------------------------------------- */

/**
 * A hook event that fires when a user sends a message through the ChatLog.
 * @event chatMessage
 * @category Chat
 * @param {ChatLog} chatLog         The ChatLog instance
 * @param {string} message          The trimmed message content
 * @param {object} chatData         Some basic chat data
 * @param {User} chatData.user      The User sending the message
 * @param {object} chatData.speaker The identified speaker data, see {@link ChatMessage.getSpeaker}
 */
function chatMessage(chatLog, message, {user, speaker}) {}

/* -------------------------------------------- */

/**
 * A hook event that fires for each ChatMessage which is rendered for addition to the ChatLog.
 * This hook allows for final customization of the message HTML before it is added to the log.
 * @event renderChatMessage
 * @category Chat
 * @param {ChatMessage} message   The ChatMessage document being rendered
 * @param {jQuery} html           The pending HTML as a jQuery object
 * @param {object} data           The input data provided for template rendering
 */
function renderChatMessage(message, html, messageData) {}

/* -------------------------------------------- */
/*  Audio-Video                                 */
/* -------------------------------------------- */

/**
 * A hook event that fires when the user modifies a global volume slider.
 * The hook name needs to be customized to include the type of global volume being changed, one of:
 * `globalPlaylistVolumeChanged`, `globalAmbientVolumeChanged`, or `globalInterfaceVolumeChanged`.
 * @event globalVolumeChanged
 * @category Audio-Video
 * @param {number} volume     The new volume level
 */
function globalVolumeChanged(volume) {}

/* -------------------------------------------- */

/**
 * A hook event that fires when the AV settings are changed.
 * @event rtcSettingsChanged
 * @category Audio-Video
 * @param {AVSettings} settings The AVSettings manager
 * @param {object} changed      The delta of the settings that have been changed
 */
function rtcSettingsChanged(settings, changed) {}

/* -------------------------------------------- */
/*  RollTableConfig                             */
/* -------------------------------------------- */

/**
 * A hook event that fires when some useful data is dropped onto a RollTableConfig.
 * @event dropRollTableSheetData
 * @category RollTableConfig
 * @param {RollTable} table       The RollTable
 * @param {RollTableConfig} sheet The RollTableConfig application
 * @param {object} data           The data dropped onto the RollTableConfig
 */
function dropRollTableSheetData(table, sheet, data) {}

/* -------------------------------------------- */
/*  PrimaryCanvasObject                         */
/* -------------------------------------------- */

/**
 * A hook event that fires when the occlusion of an OccludableObject refreshed.
 * @event refreshOcclusion
 * @category PrimaryCanvasObject
 * @param {OccludableObject} object    The object whose occlusion is refreshed
 */
function refreshOcclusion(object) {}
