/**
 * @typedef {Object} CanvasAnimationAttribute
 * @property {string} attribute             The attribute name being animated
 * @property {Object} parent                The object within which the attribute is stored
 * @property {number} to                    The destination value of the attribute
 * @property {number} [from]                An initial value of the attribute, otherwise parent[attribute] is used
 * @property {number} [delta]               The computed delta between to and from
 * @property {number} [done]                The amount of the total delta which has been animated
 * @property {boolean} [color]              Is this a color animation that applies to RGB channels
 */

/**
 * @typedef {Object} CanvasAnimationOptions
 * @property {PIXI.DisplayObject} [context] A DisplayObject which defines context to the PIXI.Ticker function
 * @property {string} [name]                A unique name which can be used to reference the in-progress animation
 * @property {number} [duration]            A duration in milliseconds over which the animation should occur
 * @property {number} [priority]            A priority in PIXI.UPDATE_PRIORITY which defines when the animation
 *                                          should be evaluated related to others
 * @property {Function|string} [easing]     An easing function used to translate animation time or the string name
 *                                          of a static member of the CanvasAnimation class
 * @property {function(number, CanvasAnimationData)} [ontick] A callback function which fires after every frame
 */

/**
 * @typedef {CanvasAnimationOptions} CanvasAnimationData
 * @property {Function} fn                  The animation function being executed each frame
 * @property {number} time                  The current time of the animation, in milliseconds
 * @property {CanvasAnimationAttribute[]} attributes  The attributes being animated
 * @property {Promise} [promise]            A Promise which resolves once the animation is complete
 * @property {Function} [resolve]           The resolution function, allowing animation to be ended early
 * @property {Function} [reject]            The rejection function, allowing animation to be ended early
 */

/**
 * A helper class providing utility methods for PIXI Canvas animation
 */
class CanvasAnimation {
  static get ticker() {
    return canvas.app.ticker;
  }

  /**
   * Track an object of active animations by name, context, and function
   * This allows a currently playing animation to be referenced and terminated
   * @type {Object<string, CanvasAnimationData>}
   */
  static animations = {};

  /* -------------------------------------------- */

  /**
   * Apply an animation from the current value of some attribute to a new value
   * Resolve a Promise once the animation has concluded and the attributes have reached their new target
   *
   * @param {CanvasAnimationAttribute[]} attributes   An array of attributes to animate
   * @param {CanvasAnimationOptions} options          Additional options which customize the animation
   *
   * @returns {Promise}                               A Promise which resolves to true once the animation has concluded
   *                                                  or false if the animation was prematurely terminated
   *
   * @example Animate Token Position
   * ```js
   * let animation = [
   *   {
   *     parent: token,
   *     attribute: "x",
   *     to: 1000
   *   },
   *   {
   *     parent: token,
   *     attribute: "y",
   *     to: 2000
   *   }
   * ];
   * CanvasAnimation.animate(attributes, {duration:500});
   * ```
   */
  static async animate(attributes, {context=canvas.stage, name, duration=1000, easing, ontick, priority}={}) {
    priority ??= PIXI.UPDATE_PRIORITY.LOW + 1;
    if ( typeof easing === "string" ) easing = this[easing];

    // If an animation with this name already exists, terminate it
    if ( name ) this.terminateAnimation(name);

    // Define the animation and its animation function
    attributes = attributes.map(a => {
      a.from = a.from ?? a.parent[a.attribute];
      a.delta = a.to - a.from;
      a.done = 0;

      // Special handling for color transitions
      if ( a.to instanceof Color ) {
        a.color = true;
        a.from = Color.from(a.from);
      }
      return a;
    });
    if ( attributes.length && attributes.every(a => a.delta === 0) ) return;
    const animation = {attributes, context, duration, easing, name, ontick, time: 0};
    animation.fn = dt => CanvasAnimation.#animateFrame(dt, animation);

    // Create a promise which manages the animation lifecycle
    const promise = new Promise((resolve, reject) => {
      animation.resolve = resolve;
      animation.reject = reject;
      this.ticker.add(animation.fn, context, priority);
    })

    // Log any errors
      .catch(err => console.error(err))

    // Remove the animation once completed
      .finally(() => {
        this.ticker.remove(animation.fn, context);
        const wasCompleted = name && (this.animations[name]?.fn === animation.fn);
        if ( wasCompleted ) delete this.animations[name];
      });

    // Record the animation and return
    if ( name ) {
      animation.promise = promise;
      this.animations[name] = animation;
    }
    return promise;
  }

  /* -------------------------------------------- */

  /**
   * Retrieve an animation currently in progress by its name
   * @param {string} name             The animation name to retrieve
   * @returns {CanvasAnimationData}   The animation data, or undefined
   */
  static getAnimation(name) {
    return this.animations[name];
  }

  /* -------------------------------------------- */

  /**
   * If an animation using a certain name already exists, terminate it
   * @param {string} name       The animation name to terminate
   */
  static terminateAnimation(name) {
    let animation = this.animations[name];
    if (animation) animation.resolve(false);
  }

  /* -------------------------------------------- */

  /**
   * Cosine based easing with smooth in-out.
   * @param {number} pt     The proportional animation timing on [0,1]
   * @returns {number}      The eased animation progress on [0,1]
   */
  static easeInOutCosine(pt) {
    return (1 - Math.cos(Math.PI * pt)) * 0.5;
  }

  /* -------------------------------------------- */

  /**
   * Shallow ease out.
   * @param {number} pt     The proportional animation timing on [0,1]
   * @returns {number}      The eased animation progress on [0,1]
   */
  static easeOutCircle(pt) {
    return Math.sqrt(1 - Math.pow(pt - 1, 2));
  }

  /* -------------------------------------------- */

  /**
   * Shallow ease in.
   * @param {number} pt     The proportional animation timing on [0,1]
   * @returns {number}      The eased animation progress on [0,1]
   */
  static easeInCircle(pt) {
    return 1 - Math.sqrt(1 - Math.pow(pt, 2));
  }

  /* -------------------------------------------- */

  /**
   * Generic ticker function to implement the animation.
   * This animation wrapper executes once per frame for the duration of the animation event.
   * Once the animated attributes have converged to their targets, it resolves the original Promise.
   * The user-provided ontick function runs each frame update to apply additional behaviors.
   *
   * @param {number} deltaTime                The incremental time which has elapsed
   * @param {CanvasAnimationData} animation   The animation which is being performed
   */
  static #animateFrame(deltaTime, animation) {
    const {attributes, duration, ontick} = animation;

    // Compute animation timing and progress
    const dt = this.ticker.elapsedMS;     // Delta time in MS
    animation.time += dt;                 // Total time which has elapsed
    const pt = animation.time / duration; // Proportion of total duration
    const complete = animation.time >= duration;
    const pa = complete ? 1 : (animation.easing ? animation.easing(pt) : pt);

    // Update each attribute
    try {
      for ( let a of attributes ) CanvasAnimation.#updateAttribute(a, pa);
      if ( ontick ) ontick(dt, animation);
    }

    // Terminate the animation if any errors occur
    catch(err) {
      animation.reject(err);
    }

    // Resolve the original promise once the animation is complete
    if ( complete ) animation.resolve(true);
  }

  /* -------------------------------------------- */

  /**
   * Update a single attribute according to its animation completion percentage
   * @param {CanvasAnimationAttribute} attribute    The attribute being animated
   * @param {number} percentage                     The animation completion percentage
   */
  static #updateAttribute(attribute, percentage) {
    attribute.done = attribute.delta * percentage;

    // Complete animation
    if ( percentage === 1 ) {
      attribute.parent[attribute.attribute] = attribute.to;
      return;
    }

    // Color animation
    if ( attribute.color ) {
      attribute.parent[attribute.attribute] = attribute.from.mix(attribute.to, percentage);
      return;
    }

    // Numeric attribute
    attribute.parent[attribute.attribute] = attribute.from + attribute.done;
  }

  /* -------------------------------------------- */
  /*  DEPRECATIONS                                */
  /* -------------------------------------------- */

  /**
   * @alias CanvasAnimation.animate
   * @see {CanvasAnimation.animate}
   * @deprecated since v10
   * @ignore
   */
  static async animateLinear(attributes, options) {
    foundry.utils.logCompatibilityWarning("You are calling CanvasAnimation.animateLinear which is deprecated in favor "
      + "of CanvasAnimation.animate", {since: 10, until: 12});
    return this.animate(attributes, options);
  }
}
