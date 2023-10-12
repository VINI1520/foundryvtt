/**
 * A subclass of PointSource which is used when computing the polygonal area where movement is possible.
 * @param {Token} object                The Token object which is attempting to move.
 */
class MovementSource extends PointSource {

  /** @override */
  static sourceType = "move";

  /** @override */
  initialize(data={}) {
    this.data.x = data.x ?? 0;
    this.data.y = data.y ?? 0;
    this.data.elevation = data.elevation ?? 0;
  }
}
