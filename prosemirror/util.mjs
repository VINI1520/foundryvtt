import {defaultSchema} from "./prosemirror.mjs";
import DOMParser from "./dom-parser.mjs";
import StringSerializer from "./string-serializer.mjs";

/**
 * Use the DOM and ProseMirror's DOMParser to construct a ProseMirror document state from an HTML string. This cannot be
 * used server-side.
 * @param {string} htmlString  A string of HTML.
 * @param {Schema} [schema]    The ProseMirror schema to use instead of the default one.
 * @returns {Node}             The document node.
 */
export function parseHTMLString(htmlString, schema) {
  const target = document.createElement("template");
  target.innerHTML = htmlString;
  return DOMParser.fromSchema(schema ?? defaultSchema).parse(target.content);
}

/**
 * Use the StringSerializer to convert a ProseMirror document into an HTML string. This can be used server-side.
 * @param {Node} doc                        The ProseMirror document.
 * @param {object} [options]                Additional options to configure serialization behavior.
 * @param {Schema} [options.schema]         The ProseMirror schema to use instead of the default one.
 * @param {string|number} [options.spaces]  The number of spaces to use for indentation. See {@link StringNode#toString}
 *                                          for details.
 * @returns {string}
 */
export function serializeHTMLString(doc, {schema, spaces}={}) {
  schema = schema ?? defaultSchema;
  // If the only content is an empty <p></p> tag, return an empty string.
  if ( (doc.size < 3) && (doc.content[0].type === schema.nodes.paragraph) ) return "";
  return StringSerializer.fromSchema(schema).serializeFragment(doc.content).toString(spaces);
}
