/**
 * @typedef {Object<string, *>} WorkerTask
 * @property {number} [taskId]          An incrementing task ID used to reference task progress
 * @property {WorkerManager.WORKER_TASK_ACTIONS} action  The task action being performed, from WorkerManager.WORKER_TASK_ACTIONS
 * @property {function} [resolve]       A Promise resolution handler
 * @property {function} [reject]        A Promise rejection handler
 */

/**
 * An asynchronous web Worker which can load user-defined functions and await execution using Promises.
 * @param {string} name                 The worker name to be initialized
 * @param {object} [options={}]         Worker initialization options
 * @param {boolean} [options.debug=false]           Should the worker run in debug mode?
 * @param {boolean} [options.loadPrimitives=false]  Should the worker automatically load the primitives library?
 */
class AsyncWorker extends Worker {
  constructor(name, {debug=false, loadPrimitives=false}={}) {
    super(AsyncWorker.WORKER_HARNESS_JS);
    this.name = name;
    this.addEventListener("message", this._onMessage.bind(this));
    this.addEventListener("error", this._onError.bind(this));

    /**
     * A Promise which resolves once the Worker is ready to accept tasks
     * @type {Promise}
     */
    this.ready = this._dispatchTask({
      action: WorkerManager.WORKER_TASK_ACTIONS.INIT,
      workerName: name,
      debug,
      loadPrimitives
    });
  }

  /**
   * A path reference to the JavaScript file which provides companion worker-side functionality.
   * @type {string}
   */
  static WORKER_HARNESS_JS = "scripts/worker.js";

  /**
   * A queue of active tasks that this Worker is executing.
   * @type {Map<number, WorkerTask>}
   */
  tasks = new Map();

  /**
   * An auto-incrementing task index.
   * @type {number}
   * @private
   */
  _taskIndex = 0;

  /* -------------------------------------------- */
  /*  Task Management                             */
  /* -------------------------------------------- */

  /**
   * Load a function onto a given Worker.
   * The function must be a pure function with no external dependencies or requirements on global scope.
   * @param {string} functionName   The name of the function to load
   * @param {function} functionRef  A reference to the function that should be loaded
   * @returns {Promise<unknown>}    A Promise which resolves once the Worker has loaded the function.
   */
  async loadFunction(functionName, functionRef) {
    return this._dispatchTask({
      action: WorkerManager.WORKER_TASK_ACTIONS.LOAD,
      functionName,
      functionBody: functionRef.toString()
    });
  }

  /* -------------------------------------------- */

  /**
   * Execute a task on a specific Worker.
   * @param {string} functionName   The named function to execute on the worker. This function must first have been
   *                                loaded.
   * @param {Array<*>} params       An array of parameters with which to call the requested function
   * @returns {Promise<unknown>}    A Promise which resolves with the returned result of the function once complete.
   */
  async executeFunction(functionName, ...params) {
    return this._dispatchTask({
      action: WorkerManager.WORKER_TASK_ACTIONS.EXECUTE,
      functionName,
      args: params
    });
  }

  /* -------------------------------------------- */

  /**
   * Dispatch a task to a named Worker, awaiting confirmation of the result.
   * @param {WorkerTask} taskData   Data to dispatch to the Worker as part of the task.
   * @returns {Promise}             A Promise which wraps the task transaction.
   * @private
   */
  async _dispatchTask(taskData={}) {
    const taskId = taskData.taskId = this._taskIndex++;
    return new Promise((resolve, reject) => {
      this.tasks.set(taskId, {resolve, reject, ...taskData});
      this.postMessage(taskData);
    });
  }

  /* -------------------------------------------- */

  /**
   * Handle messages emitted by the Worker thread.
   * @param {MessageEvent} event      The dispatched message event
   * @private
   */
  _onMessage(event) {
    const response = event.data;
    const task = this.tasks.get(response.taskId);
    if ( !task ) return;
    this.tasks.delete(response.taskId);
    if ( response.error ) return task.reject(response.error);
    return task.resolve(response.result);
  }

  /* -------------------------------------------- */

  /**
   * Handle errors emitted by the Worker thread.
   * @param {ErrorEvent} error        The dispatched error event
   * @private
   */
  _onError(error) {
    error.message = `An error occurred in Worker ${this.name}: ${error.message}`;
    console.error(error);
  }
}

/* -------------------------------------------- */

/**
 * A client-side class responsible for managing a set of web workers.
 * This interface is accessed as a singleton instance via game.workers.
 * @see Game#workers
 */
class WorkerManager {
  constructor() {
    if ( game.workers instanceof WorkerManager ) {
      throw new Error("The singleton WorkerManager instance has already been constructed as Game#workers");
    }
  }

  /**
   * The currently active workforce.
   * @type {Map<string,AsyncWorker>}
   * @private
   */
  workforce = new Map();

  /**
   * Supported worker task actions
   * @enum {string}
   */
  static WORKER_TASK_ACTIONS = {
    INIT: "init",
    LOAD: "load",
    EXECUTE: "execute"
  };

  /* -------------------------------------------- */
  /*  Worker Management                           */
  /* -------------------------------------------- */

  /**
   * Create a new named Worker.
   * @param {string} name                 The named Worker to create
   * @param {object} [config={}]          Worker configuration parameters passed to the AsyncWorker constructor
   * @returns {Promise<AsyncWorker>}      The created AsyncWorker which is ready to accept tasks
   */
  async createWorker(name, config={}) {
    if (this.workforce.has(name)) {
      throw new Error(`A Worker already exists with the name "${name}"`);
    }
    const worker = new AsyncWorker(name, config);
    this.workforce.set(name, worker);
    await worker.ready;
    return worker;
  }

  /* -------------------------------------------- */

  /**
   * Get a currently active Worker by name.
   * @param {string} name             The named Worker to retrieve
   * @returns {AsyncWorker}           The AsyncWorker instance
   */
  getWorker(name) {
    const w = this.workforce.get(name);
    if ( !w ) throw new Error(`No worker with name ${name} currently exists!`)
    return w;
  }

  /* -------------------------------------------- */

  /**
   * Retire a current Worker, terminating it immediately.
   * @see Worker#terminate
   * @param {string} name           The named worker to terminate
   */
  retireWorker(name) {
    const worker = this.getWorker(name);
    worker.terminate();
    this.workforce.delete(name);
  }
}

/* -------------------------------------------- */
