/**
 * @typedef {Object}                      SoundSourceData
 * @property {number} x                   The x-coordinate of the source location
 * @property {number} y                   The y-coordinate of the source location
 * @property {number} radius              The radius of the sound effect
 * @property {boolean} walls              Whether or not the source is constrained by walls
 */

/**
 * A specialized subclass of the PointSource abstraction which is used to control the rendering of sound sources.
 * @extends {PointSource}
 * @param {AmbientSound} object            The AmbientSound object that generates this sound source
 */
class SoundSource extends PointSource {

  /** @inheritdoc */
  static sourceType = "sound";

  /* -------------------------------------------- */
  /*  Sound Source Attributes                     */
  /* -------------------------------------------- */

  /**
   * The object of data which configures how the source is rendered
   * @type {SoundSourceData}
   */
  data = {};

  /* -------------------------------------------- */
  /*  Sound Source Initialization                 */
  /* -------------------------------------------- */

  /**
   * Initialize the source with provided object data.
   * @param {object} data             Initial data provided to the point source
   * @returns {SoundSource}           A reference to the initialized source
   */
  initialize(data={}) {
    this._initializeData(data);
    this.los = this._createPolygon();
    return this;
  }

  /* -------------------------------------------- */

  /** @override */
  _getPolygonConfiguration() {
    return {
      type: this.data.walls ? "sound" : "universal",
      radius: this.data.radius,
      density: PIXI.Circle.approximateVertexDensity(this.data.radius),
      source: this
    };
  }

  /* -------------------------------------------- */

  /**
   * Process new input data provided to the SoundSource.
   * @param {object} data             Initial data provided to the sound source
   * @private
   */
  _initializeData(data) {
    data.x = data.x ?? 0;
    data.y = data.y ?? 0;
    data.radius = data.radius ?? 0;
    data.z = data.z ?? null;
    this.data = data;
    this.radius = data.radius;
  }
}
