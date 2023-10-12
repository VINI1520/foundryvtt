import ProseMirrorPlugin from "./plugin.mjs";
import {Plugin} from "prosemirror-state";

/**
 * A class responsible for handling the dropping of Documents onto the editor and creating content links for them.
 * @extends {ProseMirrorPlugin}
 */
export default class ProseMirrorContentLinkPlugin extends ProseMirrorPlugin {
  /**
   * @typedef {object} ProseMirrorContentLinkOptions
   * @property {ClientDocument} [document]      The parent document housing this editor.
   * @property {boolean} [relativeLinks=false]  Whether to generate links relative to the parent document.
   */

  /**
   * @param {Schema} schema                          The ProseMirror schema.
   * @param {ProseMirrorContentLinkOptions} options  Additional options to configure the plugin's behaviour.
   */
  constructor(schema, {document, relativeLinks=false}={}) {
    super(schema);

    if ( relativeLinks && !document ) {
      throw new Error("A document must be provided in order to generate relative links.");
    }

    /**
     * The parent document housing this editor.
     * @type {ClientDocument}
     */
    Object.defineProperty(this, "document", {value: document, writable: false});

    /**
     * Whether to generate links relative to the parent document.
     * @type {boolean}
     */
    Object.defineProperty(this, "relativeLinks", {value: relativeLinks, writable: false});
  }

  /* -------------------------------------------- */

  /** @inheritdoc */
  static build(schema, options={}) {
    const plugin = new ProseMirrorContentLinkPlugin(schema, options);
    return new Plugin({
      props: {
        handleDrop: plugin._onDrop.bind(plugin)
      }
    });
  }

  /* -------------------------------------------- */

  /**
   * Handle a drop onto the editor.
   * @param {EditorView} view  The ProseMirror editor view.
   * @param {DragEvent} event  The drop event.
   * @param {Slice} slice      A slice of editor content.
   * @param {boolean} moved    Whether the slice has been moved from a different part of the editor.
   * @protected
   */
  _onDrop(view, event, slice, moved) {
    if ( moved ) return;
    const pos = view.posAtCoords({left: event.clientX, top: event.clientY});
    const data = TextEditor.getDragEventData(event);
    if ( !data.type ) return;
    const options = {};
    if ( this.relativeLinks ) options.relativeTo = this.document;
    const selection = view.state.selection;
    if ( !selection.empty ) {
      const content = selection.content().content;
      options.label = content.textBetween(0, content.size);
    }
    TextEditor.getContentLink(data, options).then(link => {
      if ( !link ) return;
      const tr = view.state.tr;
      if ( selection.empty ) tr.insertText(link, pos.pos);
      else tr.replaceSelectionWith(this.schema.text(link));
      view.dispatch(tr);
      // Focusing immediately only seems to work in Chrome. In Firefox we must yield execution before attempting to
      // focus, otherwise the cursor becomes invisible until the user manually unfocuses and refocuses.
      setTimeout(view.focus.bind(view), 0);
    });
    event.stopPropagation();
    return true;
  }
}
