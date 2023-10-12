import {Schema} from "./prosemirror.mjs";
import {getType, mergeObject, randomID} from "../common/utils/helpers.mjs";
import {splitListItem} from "prosemirror-schema-list";
import ImageNode from "./schema/image-node.mjs";

/* -------------------------------------------- */
/*  Nodes                                       */
/* -------------------------------------------- */

const doc = {
  content: "block+"
};

const text = {
  group: "inline"
};

const paragraph = {
  attrs: {alignment: {default: "left", formatting: true}},
  managed: {styles: ["text-align"]},
  content: "inline*",
  group: "block",
  parseDOM: [{tag: "p", getAttrs: el => ({alignment: el.style.textAlign || "left"})}],
  toDOM: node => {
    const {alignment} = node.attrs;
    if ( alignment === "left" ) return ["p", 0];
    return ["p", {style: `text-align: ${alignment};`}, 0];
  }
};

const blockquote = {
  content: "block+",
  group: "block",
  defining: true,
  parseDOM: [{tag: "blockquote"}],
  toDOM: () => ["blockquote", 0]
};

const secret = {
  attrs: {
    revealed: {default: false},
    id: {}
  },
  content: "block+",
  group: "block",
  defining: true,
  parseDOM: [{tag: "section", getAttrs: el => {
    if ( !el.classList.contains("secret") ) return false;
    return {
      revealed: el.classList.contains("revealed"),
      id: el.id || `secret-${randomID()}`
    };
  }}],
  toDOM: node => {
    const attrs = {
      id: node.attrs.id,
      class: `secret${node.attrs.revealed ? " revealed" : ""}`
    };
    return ["section", attrs, 0];
  }
};

const hr = {
  group: "block",
  parseDOM: [{tag: "hr"}],
  toDOM: () => ["hr"]
};

const heading = {
  attrs: {level: {default: 1}},
  content: "inline*",
  group: "block",
  defining: true,
  parseDOM: [
    {tag: "h1", attrs: {level: 1}},
    {tag: "h2", attrs: {level: 2}},
    {tag: "h3", attrs: {level: 3}},
    {tag: "h4", attrs: {level: 4}},
    {tag: "h5", attrs: {level: 5}},
    {tag: "h6", attrs: {level: 6}}
  ],
  toDOM: node => [`h${node.attrs.level}`, 0]
};

const pre = {
  content: "text*",
  marks: "",
  group: "block",
  code: true,
  defining: true,
  parseDOM: [{tag: "pre", preserveWhitespace: "full"}],
  toDOM: () => ["pre", ["code", 0]]
};

const image = ImageNode.makeNode();

const imageLink = {
  group: "block",
  draggable: true,
  managed: {styles: ["float"], classes: ["centered"]},
  parseDOM: [{tag: "a", getAttrs: el => {
    if ( (el.children.length !== 1) || (el.children[0].tagName !== "IMG") ) return false;
    const attrs = ImageNode.getAttrs(el.children[0]);
    attrs.href = el.href;
    attrs.title = el.title;
    return attrs;
  }}],
  toDOM: node => {
    const {href, title} = node.attrs;
    const attrs = {};
    if ( href ) attrs.href = href;
    if ( title ) attrs.title = title;
    return ["a", attrs, ImageNode.toDOM(node)];
  }
};
imageLink.attrs = mergeObject(ImageNode.attrs, {
  href: {default: null},
  title: {default: null}
});

const br = {
  inline: true,
  group: "inline",
  selectable: false,
  parseDOM: [{tag: "br"}],
  toDOM: () => ["br"]
};

const ol = {
  content: "(list_item | list_item_text)+",
  managed: {attributes: ["start"]},
  group: "block",
  attrs: {order: {default: 1}},
  parseDOM: [{tag: "ol", getAttrs: el => ({order: el.hasAttribute("start") ? Number(el.start) : 1})}],
  toDOM: node => node.attrs.order === 1 ? ["ol", 0] : ["ol", {start: node.attrs.order}, 0]
};

const ul = {
  content: "(list_item | list_item_text)+",
  group: "block",
  parseDOM: [{tag: "ul"}],
  toDOM: () => ["ul", 0]
};

/**
 * ProseMirror enforces a stricter subset of HTML where block and inline content cannot be mixed. For example, the
 * following is valid HTML:
 * <ul>
 *   <li>
 *     The first list item.
 *     <ul>
 *       <li>An embedded list.</li>
 *     </ul>
 *   </li>
 * </ul>
 *
 * But, since the contents of the <li> would mix inline content (the text), with block content (the inner <ul>), the
 * schema is defined to only allow block content, and would transform the items to look like this:
 * <ul>
 *   <li>
 *     <p>The first list item.</p>
 *     <ul>
 *       <li><p>An embedded list.</p></li>
 *     </ul>
 *   </li>
 * </ul>
 *
 * We can address this by hooking into the DOM parsing and 'tagging' the extra paragraph elements inserted this way so
 * that when the contents are serialized again, they can be removed. This is left as a TODO for now.
 */

// In order to preserve existing HTML we define two types of list nodes. One that contains block content, and one that
// contains text content. We default to block content if the element is empty, in order to make integration with the
// wrapping and lifting helpers simpler.
const li = {
  content: "paragraph block*",
  defining: true,
  parseDOM: [{tag: "li", getAttrs: el => {
    // If this contains only inline content and no other elements, do not use this node type.
    if ( !isElementEmpty(el) && onlyInlineContent(el) ) return false;
  }}],
  toDOM: () => ["li", 0]
};

const liText = {
  content: "text*",
  defining: true,
  parseDOM: [{tag: "li", getAttrs: el => {
    // If this contains any non-inline elements, do not use this node type.
    if ( isElementEmpty(el) || !onlyInlineContent(el) ) return false;
  }}],
  toDOM: () => ["li", 0]
};

/**
 * Determine node attributes for a table cell when parsing the DOM.
 * @param {HTMLTableCellElement} cell  The table cell DOM node.
 * @returns {{colspan: number, rowspan: number, colwidth: number|null}}
 */
function getTableCellAttrs(cell) {
  // TODO: Not entirely sure what the colwidth is for, but it seems to be used by the prosemirror-tables package
  // internally, so we preserve it here.
  const colwidth = cell.dataset.colwidth;
  const widths = /^\d+(,\d+)*$/.test(colwidth) ? colwidth.split(",").map(w => Number(w)) : null;
  const colspan = cell.getAttribute("colspan") || 1;
  const rowspan = cell.getAttribute("rowspan") || 1;
  return {
    colspan: Number(colspan),
    rowspan: Number(rowspan),
    colwidth: widths?.length === colspan ? widths : null
  };
}

/**
 * Determine the HTML attributes to be set on the table cell DOM node based on its ProseMirror node attributes.
 * @param {Node} node  The table cell ProseMirror node.
 * @returns {object}   An object of attribute name -> attribute value.
 */
function setTableCellAttrs(node) {
  const attrs = {};
  const {colspan, rowspan, colwidth} = node.attrs;
  if ( colspan !== 1 ) attrs.colspan = colspan;
  if ( rowspan !== 1 ) attrs.rowspan = rowspan;
  if ( colwidth?.length ) attrs["data-colwidth"] = colwidth.join(",");
  return attrs;
}

const table = {
  content: "(caption | caption_block)? thead? tbody tfoot?",
  tableRole: "table",
  isolating: true,
  group: "block",
  parseDOM: [{tag: "table"}],
  toDOM: () => ["table", 0]
};

const thead = {
  content: "table_row+",
  tableRole: "table",
  isolating: true,
  group: "block",
  parseDOM: [{tag: "thead"}],
  toDOM: () => ["thead", 0]
};

const tbody = {
  content: "table_row+",
  tableRole: "table",
  isolating: true,
  group: "block",
  parseDOM: [{tag: "tbody"}],
  toDOM: () => ["tbody", 0]
};

const tfoot = {
  content: "table_row+",
  tableRole: "table",
  isolating: true,
  group: "block",
  parseDOM: [{tag: "tfoot"}],
  toDOM: () => ["tfoot", 0]
};

const caption = {
  content: "text*",
  tableRole: "caption",
  isolating: true,
  parseDOM: [{tag: "caption", getAttrs: el => {
    if ( !isElementEmpty(el) && !onlyInlineContent(el) ) return false;
  }}],
  toDOM: () => ["caption", 0]
};

const captionBlock = {
  content: "block*",
  tableRole: "caption",
  isolating: true,
  parseDOM: [{tag: "caption", getAttrs: el => {
    if ( isElementEmpty(el) || onlyInlineContent(el) ) return false;
  }}],
  toDOM: () => ["caption", 0]
};

const tableRow = {
  content: "(table_cell | table_header | table_cell_block | table_header_block)*",
  tableRole: "row",
  parseDOM: [{tag: "tr"}],
  toDOM: () => ["tr", 0]
};

const cellAttrs = {
  colspan: {default: 1},
  rowspan: {default: 1},
  colwidth: {default: null}
};

const managedCellAttrs = {
  attributes: ["colspan", "rowspan", "data-colwidth"]
};

const tableCell = {
  content: "text*",
  attrs: cellAttrs,
  managed: managedCellAttrs,
  tableRole: "cell",
  isolating: true,
  parseDOM: [{tag: "td", getAttrs: el => {
    if ( !isElementEmpty(el) && !onlyInlineContent(el) ) return false;
    return getTableCellAttrs(el);
  }}],
  toDOM: node => ["td", setTableCellAttrs(node), 0]
};

const tableCellBlock = {
  content: "block*",
  attrs: cellAttrs,
  managed: managedCellAttrs,
  tableRole: "cell",
  isolating: true,
  parseDOM: [{tag: "td", getAttrs: el => {
    if ( isElementEmpty(el) || onlyInlineContent(el) ) return false;
    return getTableCellAttrs(el);
  }}],
  toDOM: node => ["td", setTableCellAttrs(node), 0]
};

const tableHeader = {
  content: "text*",
  attrs: cellAttrs,
  managed: managedCellAttrs,
  tableRole: "cell",
  isolating: true,
  parseDOM: [{tag: "th", getAttrs: el => {
    if ( !isElementEmpty(el) && !onlyInlineContent(el) ) return false;
    return getTableCellAttrs(el);
  }}],
  toDOM: node => ["th", setTableCellAttrs(node), 0]
};

const tableHeaderBlock = {
  content: "block*",
  attrs: cellAttrs,
  managed: managedCellAttrs,
  tableRole: "cell",
  isolating: true,
  parseDOM: [{tag: "th", getAttrs: el => {
    if ( isElementEmpty(el) || onlyInlineContent(el) ) return false;
    return getTableCellAttrs(el);
  }}],
  toDOM: node => ["th", setTableCellAttrs(node), 0]
};

// Nodes beyond here are supported for HTML preservation purposes, but do not have robust editing support for now.

const details = {
  content: "(summary | summary_block) block*",
  group: "block",
  defining: true,
  parseDOM: [{tag: "details"}],
  toDOM: () => ["details", 0]
};

const summary = {
  content: "text*",
  defining: true,
  parseDOM: [{tag: "summary", getAttrs: el => {
    // If this contains any non-inline elements, do not use this node type.
    if ( !isElementEmpty(el) && !onlyInlineContent(el) ) return false;
  }}],
  toDOM: () => ["summary", 0]
};

const summaryBlock = {
  content: "block+",
  defining: true,
  parseDOM: [{tag: "summary", getAttrs: el => {
    // If this contains only text nodes and no elements, do not use this node type.
    if ( isElementEmpty(el) || onlyInlineContent(el) ) return false;
  }}],
  toDOM: () => ["summary", 0]
};

const dl = {
  content: "(block|dt|dd)*",
  group: "block",
  defining: true,
  parseDOM: [{tag: "dl"}],
  toDOM: () => ["dl", 0]
};

const dt = {
  content: "block+",
  defining: true,
  parseDOM: [{tag: "dt"}],
  toDOM: () => ["dt", 0]
};

const dd = {
  content: "block+",
  defining: true,
  parseDOM: [{tag: "dd"}],
  toDOM: () => ["dd", 0]
};

const fieldset = {
  content: "legend block*",
  group: "block",
  defining: true,
  parseDOM: [{tag: "fieldset"}],
  toDOM: () => ["fieldset", 0]
};

const legend = {
  content: "inline+",
  defining: true,
  parseDOM: [{tag: "legend"}],
  toDOM: () => ["legend", 0]
};

const picture = {
  content: "source* image",
  group: "block",
  defining: true,
  parseDOM: [{tag: "picture"}],
  toDOM: () => ["picture", 0]
};

const audio = {
  content: "source* track*",
  group: "block",
  parseDOM: [{tag: "audio"}],
  toDOM: () => ["audio", 0]
};

const video = {
  content: "source* track*",
  group: "block",
  parseDOM: [{tag: "video"}],
  toDOM: () => ["video", 0]
};

const track = {
  parseDOM: [{tag: "track"}],
  toDOM: () => ["track"]
};

const source = {
  parseDOM: [{tag: "source"}],
  toDOM: () => ["source"]
}

const object = {
  inline: true,
  group: "inline",
  parseDOM: [{tag: "object"}],
  toDOM: () => ["object"]
};

const figure = {
  content: "(figcaption|block)*",
  group: "block",
  defining: true,
  parseDOM: [{tag: "figure"}],
  toDOM: () => ["figure", 0]
};

const figcaption = {
  content: "inline+",
  defining: true,
  parseDOM: [{tag: "figcaption"}],
  toDOM: () => ["figcaption", 0]
};

const small = {
  content: "paragraph block*",
  group: "block",
  defining: true,
  parseDOM: [{tag: "small"}],
  toDOM: () => ["small", 0]
};

const ruby = {
  content: "(rp|rt|block)+",
  group: "block",
  defining: true,
  parseDOM: [{tag: "ruby"}],
  toDOM: () => ["ruby", 0]
};

const rp = {
  content: "inline+",
  parseDOM: [{tag: "rp"}],
  toDOM: () => ["rp", 0]
};

const rt = {
  content: "inline+",
  parseDOM: [{tag: "rt"}],
  toDOM: () => ["rt", 0]
};

const iframe = {
  group: "block",
  defining: true,
  parseDOM: [{tag: "iframe"}],
  toDOM: () => ["iframe"]
};

/* -------------------------------------------- */
/*  Marks                                       */
/* -------------------------------------------- */

const link = {
  attrs: {
    href: {default: null},
    title: {default: null}
  },
  inclusive: false,
  parseDOM: [{tag: "a", getAttrs: el => {
    if ( (el.children.length === 1) && (el.children[0]?.tagName === "IMG") ) return false;
    return {href: el.href, title: el.title};
  }}],
  toDOM: node => {
    const {href, title} = node.attrs;
    const attrs = {};
    if ( href ) attrs.href = href;
    if ( title ) attrs.title = title;
    return ["a", attrs];
  }
};

const em = {
  parseDOM: [{tag: "i"}, {tag: "em"}, {style: "font-style=italic"}],
  toDOM: () => ["em", 0]
};

const strong = {
  parseDOM: [
    {tag: "strong"},
    {tag: "b"},
    {style: "font-weight", getAttrs: weight => /^(bold(er)?|[5-9]\d{2})$/.test(weight) && null}
  ],
  toDOM: () => ["strong", 0]
};

const code = {
  parseDOM: [{tag: "code"}],
  toDOM: () => ["code", 0]
};

const underline = {
  parseDOM: [{tag: "u"}, {style: "text-decoration=underline"}],
  toDOM: () => ["span", {style: "text-decoration: underline;"}, 0]
};

const strikethrough = {
  parseDOM: [{tag: "s"}, {tag: "del"}, {style: "text-decoration=line-through"}],
  toDOM: () => ["s", 0]
};

const superscript = {
  parseDOM: [{tag: "sup"}, {style: "vertical-align=super"}],
  toDOM: () => ["sup", 0]
};

const subscript = {
  parseDOM: [{tag: "sub"}, {style: "vertical-align=sub"}],
  toDOM: () => ["sub", 0]
};

const span = {
  parseDOM: [{tag: "span", getAttrs: el => {
    if ( el.style.fontFamily ) return false;
    return {};
  }}],
  toDOM: () => ["span", 0]
};

const font = {
  attrs: {
    family: {}
  },
  parseDOM: [{style: "font-family", getAttrs: family => ({family})}],
  toDOM: node => ["span", {style: `font-family: ${node.attrs.family.replaceAll('"', "'")}`}]
};

// A list of tag names employed by the mark specifications above. These tags are considered allowable inside a node that
// only supports inline content.
const inlineTags = new Set(["A", "EM", "I", "STRONG", "B", "CODE", "U", "S", "DEL", "SUP", "SUB", "SPAN"]);

/* -------------------------------------------- */
/*  Schema                                      */
/* -------------------------------------------- */

export const nodes = {
  doc, text, paragraph, blockquote, secret, horizontal_rule: hr, heading, code_block: pre, image_link: imageLink, image,
  hard_break: br, ordered_list: ol, bullet_list: ul, list_item: li, list_item_text: liText, details, summary,
  summary_block: summaryBlock, dl, dt, dd, fieldset, legend, picture, audio, video, track, source, object, figure,
  figcaption, small, ruby, rp, rt, table, tbody, thead, tfoot, caption, caption_block: captionBlock,
  table_row: tableRow, table_cell: tableCell, table_header: tableHeader, table_cell_block: tableCellBlock,
  table_header_block: tableHeaderBlock, iframe
};

export const marks = {superscript, subscript, span, font, link, em, strong, underline, strikethrough, code};

// Auto-generated specifications for HTML preservation.
["header", "main", "section", "article", "aside", "nav", "footer", "div", "address"].forEach(tag => {
  nodes[tag] = {
    content: "block+",
    group: "block",
    defining: true,
    parseDOM: [{tag}],
    toDOM: () => [tag, 0]
  };
});

["abbr", "cite", "mark", "q", "time", "ins"].forEach(tag => {
  marks[tag] = {
    parseDOM: [{tag}],
    toDOM: () => [tag, 0]
  };
});

/**
 * Augments the schema definitions to allow each node or mark to capture all the attributes on an element and preserve
 * them when re-serialized back into the DOM.
 * @param {NodeSpec|MarkSpec} spec  The schema specification.
 */
function attributeCapture(spec) {
  if ( !spec.parseDOM ) return;
  if ( !spec.attrs ) spec.attrs = {};
  spec.attrs._preserve = {default: {}, formatting: true};
  spec.parseDOM.forEach(rule => {
    if ( rule.style ) return; // This doesn't work for style rules. We need a different solution there.
    const getAttrs = rule.getAttrs;
    rule.getAttrs = el => {
      let attrs = getAttrs?.(el);
      if ( attrs === false ) return false;
      if ( typeof attrs !== "object" ) attrs = {};
      foundry.utils.mergeObject(attrs, rule.attrs);
      foundry.utils.mergeObject(attrs, {_preserve: captureAttributes(el, spec.managed)});
      return attrs;
    };
  });
  const toDOM = spec.toDOM;
  spec.toDOM = node => {
    const domSpec = toDOM(node);
    const attrs = domSpec[1];
    const preserved = node.attrs._preserve ?? {};
    if ( preserved.style ) preserved.style = preserved.style.replaceAll('"', "'");
    if ( getType(attrs) === "Object" ) {
      domSpec[1] = foundry.utils.mergeObject(preserved, attrs, {inplace: false});
      if ( ("style" in preserved) && ("style" in attrs) ) domSpec[1].style = mergeStyle(preserved.style, attrs.style);
      if ( ("class" in preserved) && ("class" in attrs) ) domSpec[1].class = mergeClass(preserved.class, attrs.class);
    } else domSpec.splice(1, 0, {...preserved});
    return domSpec;
  };
}

/**
 * Capture all attributes present on an HTML element and store them in an object for preservation in the schema.
 * @param {HTMLElement} el                                                       The element.
 * @param {{attributes: string[], styles: string[], classes: string[]}} managed  An object containing the attributes,
 *                                                                               styles, and classes that are managed by
 *                                                                               the ProseMirror node and should not be
 *                                                                               preserved.
 * @returns {object}
 */
function captureAttributes(el, managed={}) {
  return Array.from(el.attributes).reduce((obj, attr) => {
    if ( attr.name.startsWith("data-pm-") ) return obj;
    if ( managed.attributes?.includes(attr.name) ) return obj;
    if ( (attr.name === "class") && managed.classes?.length ) {
      obj.class = classesFromString(attr.value).filter(cls => !managed.classes.includes(cls)).join(" ");
      return obj;
    }
    if ( (attr.name === "style") && managed.styles?.length ) {
      const styles = stylesFromString(attr.value);
      managed.styles.forEach(style => delete styles[style]);
      obj.style = Object.entries(styles).map(([k, v]) => v ? `${k}: ${v}` : null).filterJoin("; ");
      return obj;
    }
    obj[attr.name] = attr.value;
    return obj;
  }, {});
}

/**
 * Convert an element's style attribute string into an object.
 * @param {string} str  The style string.
 * @returns {object}
 */
function stylesFromString(str) {
  return Object.fromEntries(str.split(/;\s*/g).map(prop => prop.split(/:\s*/)));
}

/**
 * Convert an element's class attribute string into an array of class names.
 * @param {string} str  The class string.
 * @returns {string[]}
 */
function classesFromString(str) {
  return str.split(/\s+/g);
}

/**
 * Merge two style attribute strings.
 * @param {string} a  The first style string.
 * @param {string} b  The second style string.
 * @returns {string}
 */
function mergeStyle(a, b) {
  return Object.entries(mergeObject(stylesFromString(a), stylesFromString(b)))
    .map(([k, v]) => v ? `${k}: ${v}` : null)
    .filterJoin("; ");
}

/**
 * Merge two class attribute strings.
 * @param {string} a  The first class string.
 * @param {string} b  The second class string.
 */
function mergeClass(a, b) {
  return Array.from(new Set(classesFromString(a).concat(classesFromString(b)))).join(" ");
}

/**
 * Determine if an HTML element contains purely inline content, i.e. only text nodes and 'mark' elements.
 * @param {HTMLElement} element  The element.
 * @returns {boolean}
 */
function onlyInlineContent(element) {
  for ( const child of element.children ) {
    if ( !inlineTags.has(child.tagName) ) return false;
  }
  return true;
}

/**
 * Determine if an HTML element is empty.
 * @param {HTMLElement} element  The element.
 * @returns {boolean}
 */
function isElementEmpty(element) {
  return !element.childNodes.length;
}

const all = Object.values(nodes).concat(Object.values(marks));
all.forEach(attributeCapture);

export const schema = new Schema({nodes, marks});

/* -------------------------------------------- */
/*  Node Manipulation                           */
/* -------------------------------------------- */

schema.nodes.list_item.split = splitListItem(schema.nodes.list_item);

schema.nodes.secret.split = (state, dispatch) => {
  const secret = state.schema.nodes.secret;
  const {$cursor} = state.selection;
  // Check we are actually on a blank line and not splitting text content.
  if ( !$cursor || $cursor.parent.content.size ) return false;
  // Check that we are actually in a secret block.
  if ( $cursor.node(-1).type !== secret ) return false;
  // Check that the block continues past the cursor.
  if ( $cursor.after() === $cursor.end(-1) ) return false;
  const before = $cursor.before(); // The previous line.
  // Ensure a new ID assigned to the new secret block.
  dispatch(state.tr.split(before, 1, [{type: secret, attrs: {id: `secret-${randomID()}`}}]));
  return true;
};
