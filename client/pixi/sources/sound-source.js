
/**
 * A specialized subclass of the PointSource abstraction which is used to control the rendering of sound sources.
 */
class SoundSource extends PointSource {

  /** @inheritdoc */
  static sourceType = "sound";

  /* -------------------------------------------- */

  /** @inheritDoc */
  _getPolygonConfiguration() {
    return Object.assign(super._getPolygonConfiguration(), {useThreshold: true});
  }
}
