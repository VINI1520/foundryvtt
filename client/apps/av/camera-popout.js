/**
 * Abstraction of the Application interface to be used with the Draggable class as a substitute for the app
 * This class will represent one popout feed window and handle its positioning and draggability
 * @param {CameraViews} view      The CameraViews application that this popout belongs to
 * @param {string} userId         ID of the user this popout belongs to
 * @param {jQuery} element        The div element of this specific popout window
 */
class CameraPopoutAppWrapper {
  constructor(view, userId, element) {
    this.view = view;
    this.element = element;
    this.userId = userId;

    // "Fake" some application attributes
    this.popOut = true;
    this.options = {};

    // Get the saved position
    let setting = game.webrtc.settings.getUser(userId);
    this.setPosition(setting);
    new Draggable(this, element.find(".camera-view"), element.find(".video-container")[0], true);
  }

  /* -------------------------------------------- */

  /**
   * Get the current position of this popout window
   */
  get position() {
    return foundry.utils.mergeObject(this.element.position(), {
      width: this.element.outerWidth(),
      height: this.element.outerHeight(),
      scale: 1
    });
  }

  /* -------------------------------------------- */

  /** @override */
  setPosition(options={}) {
    const position = Application.prototype.setPosition.call(this, options);
    // Let the HTML renderer figure out the height based on width.
    this.element[0].style.height = "";
    if ( !foundry.utils.isEmpty(position) ) {
      const current = game.webrtc.settings.client.users[this.userId] || {};
      const update = foundry.utils.mergeObject(current, position);
      game.webrtc.settings.set("client", `users.${this.userId}`, update);
    }
    return position;
  }

  /* -------------------------------------------- */

  _onResize(event) {}

  /* -------------------------------------------- */

  /** @override */
  bringToTop() {
    let parent = this.element.parent();
    let children = parent.children();
    let lastElement = children[children.length - 1];
    if (lastElement !== this.element[0]) {
      game.webrtc.settings.set("client", `users.${this.userId}.z`, ++this.view.maxZ);
      parent.append(this.element);
    }
  }
}
