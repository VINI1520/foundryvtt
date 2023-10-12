
class SocketInterface {

  /**
   * Standardize the way that socket messages are dispatched and their results are handled
   * @param {string} eventName          The socket event name being handled
   * @param {SocketRequest} request     Data provided to the Socket event
   * @returns {Promise<SocketResponse>} A Promise which resolves to the SocketResponse
   */
  static dispatch(eventName, request) {
    return new Promise((resolve, reject) => {
      game.socket.emit(eventName, request, response => {
        if ( response.error ) {
          const err = this._handleError(response.error);
          reject(err);
        }
        else resolve(response);
      });
    });
  }

  /* -------------------------------------------- */

  /**
   * Handle an error returned from the database, displaying it on screen and in the console
   * @param {Error} err   The provided Error message
   * @private
   */
  static _handleError(err) {
    let error = err instanceof Error ? err : new Error(err.message);
    if ( err.stack ) error.stack = err.stack;
    if ( ui.notifications ) ui.notifications.error(error.message);
    return error;
  }
}
