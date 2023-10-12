/**
 * Supported worker task actions
 * @enum {string}
 */
const WORKER_TASK_ACTIONS = {
  INIT: "init",
  LOAD: "load",
  EXECUTE: "execute"
}

/**
 * The name of this Worker thread
 * @type {string}
 */
let _workerName;

/**
 * Is this Worker operating in debug mode?
 * @type {boolean}
 */
let _debug = false;

/**
 * A registry of loaded functions
 * @type {Map<string, function>}
 */
const functions = new Map();

/**
 * Handle messages provided from the main thread via worker#postMessage
 * @param {MessageEvent} event        The message provided from the main thread
 */
onmessage = function(event) {
  const task = event.data;
  switch ( task.action ) {
    case WORKER_TASK_ACTIONS.INIT:
      return _handleInitializeWorker(task);
    case WORKER_TASK_ACTIONS.LOAD:
      return _handleLoadFunction(task);
    case WORKER_TASK_ACTIONS.EXECUTE:
      return _handleExecuteFunction(task);
  }
}

/* -------------------------------------------- */

/**
 * Handle the initialization workflow for a new Worker
 * @param {object} [options={}]     Options which configure worker initialization
 * @param {number} [options.taskId]           The task ID being performed
 * @param {string} [options.workerName]       The worker name
 * @param {boolean} [options.debug]           Should the worker run in debug mode?
 * @param {boolean} [options.loadPrimitives]  Should we automatically load primitives from /commons/utils/primitives.mjs?
 * @private
 */
async function _handleInitializeWorker({taskId, workerName, debug, loadPrimitives}={}) {
  _workerName = workerName;
  _debug = debug;
  if ( loadPrimitives ) await _loadLibrary("/common/utils/primitives.mjs");
  console.log(`Worker ${_workerName} | Initialized Worker`);
  postMessage({taskId});
}

/* -------------------------------------------- */

/**
 * Currently Chrome and Safari support web worker modules which can use ES Module imports directly.
 * Firefox lags behind and this feature is not yet implemented: https://bugzilla.mozilla.org/show_bug.cgi?id=1247687
 * FIXME: Once Firefox supports module workers, we can import commons libraries into workers directly.
 * Until then, this is a hacky workaround to parse the source script into the global namespace of the worker thread.
 * @param {string} path           The commons ES Module to load
 * @returns {Promise<void>}       A Promise that resolves once the module has been "loaded"
 * @private
 */
async function _loadLibrary(path) {
  let source = await fetch(path).then(r => r.text());
  eval(source);
}

/* -------------------------------------------- */

/**
 * Handle a request from the main thread to load a function into Worker memory.
 * @param {number} taskId         The task ID being performed
 * @param {string} functionName   The name that the function should assume in the Worker global scope
 * @param {string} functionBody   The content of the function to be parsed.
 * @private
 */
async function _handleLoadFunction({taskId, functionName, functionBody}={}) {

  // Strip existing function name and parse it
  functionBody = functionBody.replace(/^function [A-z0-9\s]+\(/, "function(");
  let fn = eval(`${functionName} = ${functionBody}`);
  if ( !fn ) throw new Error(`Failed to load function ${functionName}`);

  // Record the function to the global scope
  functions.set(functionName, fn);
  globalThis.functionName = fn;
  if ( _debug ) console.debug(`Worker ${_workerName} | Loaded function ${functionName}`);
  postMessage({taskId});
}

/* -------------------------------------------- */

/**
 * Handle a request from the main thread to execute a function with provided parameters.
 * @param {number} taskId         The task ID being performed
 * @param {string} functionName   The name that the function should assume in the Worker global scope
 * @param {Array<*>} args         An array of arguments passed to the function
 * @private
 */
async function _handleExecuteFunction({taskId, functionName, args}) {
  const fn = functions.get(functionName);
  if ( !fn ) {
    throw new Error(`Function ${functionName} has not been loaded onto Worker ${_workerName}`);
  }
  try {
    const result = await fn(...args);
    if ( _debug ) console.debug(`Worker ${_workerName} | Executed function ${functionName}`);
    postMessage({taskId, result});
  } catch(err) {
    if ( _debug ) console.debug(`Worker ${_workerName} | Failed to execute function ${functionName}`);
    console.error(err);
    postMessage({taskId, error: err});
  }
}
