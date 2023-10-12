/**
 * The client-side Wall document which extends the common BaseWall document model.
 * @extends documents.BaseWall
 * @mixes ClientDocumentMixin
 *
 * @see {@link Scene}                     The Scene document type which contains Wall documents
 * @see {@link WallConfig}                The Wall configuration application
 */
class WallDocument extends CanvasDocumentMixin(foundry.documents.BaseWall) {}
