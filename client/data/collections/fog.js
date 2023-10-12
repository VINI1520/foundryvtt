/**
 * The singleton collection of FogExploration documents which exist within the active World.
 * @extends {WorldCollection}
 * @see {@link FogExploration} The FogExploration document
 */
class FogExplorations extends WorldCollection {
  static documentName = "FogExploration";

  /** @inheritDoc */
  _onDeleteDocuments(documents, result, options, userId) {
    if ( result.includes(canvas.fog.exploration?.id) || (options.sceneId === canvas.id) ) {
      canvas.fog._handleReset();
    }
  }
}
