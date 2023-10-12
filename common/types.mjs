/** @module types */

/* ----------------------------------------- */
/*  Data Model                               */
/* ----------------------------------------- */

/**
 * @typedef {Object} DocumentConstructionContext
 * @property {Document|null} [parent=null]    The parent Document of this one, if this one is embedded
 * @property {string|null} [pack=null]        The compendium collection ID which contains this Document, if any
 * @property {boolean} [strict=true]          Whether to validate initial data strictly?
 */

/**
 * @typedef {Object} DocumentModificationContext
 * @property {Document} [parent]              A parent Document within which these Documents should be embedded
 * @property {string} [pack]                  A Compendium pack identifier within which the Documents should be modified
 * @property {boolean} [noHook=false]         Block the dispatch of preCreate hooks for this operation
 * @property {boolean} [index=false]          Return an index of the Document collection, used only during a get operation.
 * @property {string[]} [indexFields]         An array of fields to retrieve when indexing the collection
 * @property {boolean} [keepId=false]         When performing a creation operation, keep the _id of the document being created instead of generating a new one.
 * @property {boolean} [keepEmbeddedIds=true] When performing a creation operation, keep existing _id values of documents embedded within the one being created instead of generating new ones.
 * @property {boolean} [temporary=false]      Create a temporary document which is not saved to the database. Only used during creation.
 * @property {boolean} [render=true]          Automatically re-render existing applications associated with the document.
 * @property {boolean} [renderSheet=false]    Automatically create and render the Document sheet when the Document is first created.
 * @property {boolean} [diff=true]            Difference each update object against current Document data to reduce the size of the transferred data. Only used during update.
 * @property {boolean} [recursive=true]       Merge objects recursively. If false, inner objects will be replaced explicitly. Use with caution!
 * @property {boolean} [isUndo]               Is the operation undoing a previous operation, only used by embedded Documents within a Scene
 * @property {boolean} [deleteAll]            Whether to delete all documents of a given type, regardless of the array of ids provided. Only used during a delete operation.
 */

/* ----------------------------------------- */
/*  Reusable Type Definitions                */
/* ----------------------------------------- */

/**
 * A single point, expressed as an object {x, y}
 * @typedef {PIXI.Point|{x: number, y: number}} Point
 */

/**
 * A single point, expressed as an array [x,y]
 * @typedef {number[]} PointArray
 */

/**
 * A standard rectangle interface.
 * @typedef {PIXI.Rectangle|{x: number, y: number, width: number, height: number}} Rectangle
 */

/* ----------------------------------------- */
/*  Settings Type Definitions                */
/* ----------------------------------------- */

/**
 * A Client Setting
 * @typedef {Object} SettingConfig
 * @property {string} key          A unique machine-readable id for the setting
 * @property {string} namespace    The namespace the setting belongs to
 * @property {string} name         The human readable name
 * @property {string} hint         An additional human readable hint
 * @property {string} scope        The scope the Setting is stored in, either World or Client
 * @property {boolean} config      Indicates if this Setting should render in the Config application
 * @property {builtins} type       The JS Type that the Setting is storing
 * @property {Object} choices      For string Types, defines the allowable values
 * @property {Object} range        For numeric Types, defines the allowable range
 * @property {builtins} default    The default value
 * @property {function} onChange   Executes when the value of this Setting changes
 */

/**
 * A Client Setting Submenu
 * @typedef {Object} SettingSubmenuConfig
 * @property {string} name             The human readable name
 * @property {string} label            The human readable label
 * @property {string} hint             An additional human readable hint
 * @property {string} icon             The classname of an Icon to render
 * @property {FormApplication} type    The FormApplication to render
 * @property {boolean} restricted      If true, only a GM can edit this Setting
 */

/**
 * A Client Keybinding Action Configuration
 * @typedef {Object} KeybindingActionConfig
 * @property {string} [namespace]                       The namespace within which the action was registered
 * @property {string} name                              The human readable name
 * @property {string} [hint]                            An additional human readable hint
 * @property {KeybindingActionBinding[]} [uneditable]   The default bindings that can never be changed nor removed.
 * @property {KeybindingActionBinding[]} [editable]     The default bindings that can be changed by the user.
 * @property {Function} [onDown]                        A function to execute when a key down event occurs. If True is returned, the event is consumed and no further keybinds execute.
 * @property {Function} [onUp]                          A function to execute when a key up event occurs. If True is returned, the event is consumed and no further keybinds execute.
 * @property {boolean} [repeat=false]                   If True, allows Repeat events to execute the Action's onDown. Defaults to false.
 * @property {boolean} [restricted=false]               If true, only a GM can edit and execute this Action
 * @property {string[]} [reservedModifiers]             Modifiers such as [ "CONTROL" ] that can be also pressed when executing this Action. Prevents using one of these modifiers as a Binding.
 * @property {number} [precedence=0]                    The preferred precedence of running this Keybinding Action
 * @property {number} [order]                           The recorded registration order of the action
 */

/**
 * A Client Keybinding Action Binding
 * @typedef {Object} KeybindingActionBinding
 * @property {number} [index]           A numeric index which tracks this bindings position during form rendering
 * @property {string} key               The KeyboardEvent#code value from https://developer.mozilla.org/en-US/docs/Web/API/KeyboardEvent/code/code_values
 * @property {string[]} [modifiers]     An array of modifiers keys from KeyboardManager.MODIFIER_KEYS which are required for this binding to be activated
 */

/**
* @typedef {Object} KeybindingAction      An action that can occur when a key is pressed
* @property {string} action               The namespaced machine identifier of the Action
* @property {string} key                  The Keyboard key
* @property {string} name                 The human readable name
* @property {string[]} requiredModifiers  Required modifiers
* @property {string[]} optionalModifiers  Optional (reserved) modifiers
* @property {Function} onDown             The handler that executes onDown
* @property {Function} onUp               The handler that executes onUp
* @property {boolean} repeat              If True, allows Repeat events to execute this Action's onDown
* @property {boolean} restricted          If true, only a GM can execute this Action
* @property {number} precedence           The registration precedence
* @property {number} order                The registration order
*/

/**
 * Keyboard event context
 * @typedef {Object} KeyboardEventContext
 * @property {string} key                  The normalized string key, such as "A"
 * @property {KeyboardEvent} event         The originating keypress event
 * @property {boolean} isShift             Is the Shift modifier being pressed
 * @property {boolean} isControl           Is the Control or Meta modifier being processed
 * @property {boolean} isAlt               Is the Alt modifier being pressed
 * @property {boolean} hasModifier         Are any of the modifiers being pressed
 * @property {string[]} modifiers          A list of string modifiers applied to this context, such as [ "CONTROL" ]
 * @property {boolean} up                  True if the Key is Up, else False if down
 * @property {boolean} repeat              True if the given key is being held down such that it is automatically repeating.
 * @property {string} [action]             The executing Keybinding Action. May be undefined until the action is known.
 */

/**
 * Connected Gamepad info
 * @typedef {Object} ConnectedGamepad
 * @property {Map<string, Number>} axes         A map of axes values
 * @property {Set.<string>} activeButtons       The Set of pressed Buttons
 */

/* ----------------------------------------- */
/*  Socket Requests and Responses            */
/* ----------------------------------------- */

/**
 * @typedef {object|object[]|string|string[]} RequestData
 */

/**
 * @typedef {Object} SocketRequest
 * @property {string} [action]        The server-side action being requested
 * @property {string} [type]          The type of object being modified
 * @property {RequestData} [data]     Data applied to the operation
 * @property {string} [pack]          A Compendium pack name
 * @property {string} [parentUuid]    The UUID of a parent document
 * @property {object} [options]       Additional options applied to the request
 */

/**
 * @typedef {Object} SocketResponse
 * @property {SocketRequest} request  The initial request
 * @property {Error} [error]          An error, if one occurred
 * @property {string} [status]        The status of the request
 * @property {string} [userId]        The ID of the requesting User
 * @property {RequestData} [data]     Data returned as a result of the request
 */

export {};
