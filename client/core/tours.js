/**
 * A singleton Tour Collection class responsible for registering and activating Tours, accessible as game.tours
 * @see {Game#tours}
 * @extends Map
 */
class Tours extends foundry.utils.Collection {

  constructor() {
    super();
    if ( game.tours ) throw new Error("You can only have one TourManager instance");
  }

  /* -------------------------------------------- */

  /**
   * Register a new Tour
   * @param {string} namespace          The namespace of the Tour
   * @param {string} id                 The machine-readable id of the Tour
   * @param {Tour} tour                 The constructed Tour
   * @returns {void}
   */
  register(namespace, id, tour) {
    if ( !namespace || !id ) throw new Error("You must specify both the namespace and id portion of the Tour");
    if ( !(tour instanceof Tour) ) throw new Error("You must pass in a Tour instance");

    // Set the namespace and id of the tour if not already set.
    if ( id && !tour.id ) tour.id = id;
    if ( namespace && !tour.namespace ) tour.namespace = namespace;
    tour._reloadProgress();

    // Register the Tour if it is not already registered, ensuring the key matches the config
    if ( this.has(tour.key) ) throw new Error(`Tour "${key}" has already been registered`);
    this.set(`${namespace}.${id}`, tour);
  }

  /* -------------------------------------------- */

  /**
   * @inheritDoc
   * @override
   */
  set(key, tour) {
    if ( key !== tour.key ) throw new Error(`The key "${key}" does not match what has been configured for the Tour`);
    return super.set(key, tour);
  }
}
