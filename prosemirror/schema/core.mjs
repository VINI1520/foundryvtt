export const paragraph = {
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

/* -------------------------------------------- */

export const blockquote = {
  content: "block+",
  group: "block",
  defining: true,
  parseDOM: [{tag: "blockquote"}],
  toDOM: () => ["blockquote", 0]
};

/* -------------------------------------------- */

export const hr = {
  group: "block",
  parseDOM: [{tag: "hr"}],
  toDOM: () => ["hr"]
};

/* -------------------------------------------- */

export const heading = {
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

/* -------------------------------------------- */

export const pre = {
  content: "text*",
  marks: "",
  group: "block",
  code: true,
  defining: true,
  parseDOM: [{tag: "pre", preserveWhitespace: "full"}],
  toDOM: () => ["pre", ["code", 0]]
};

/* -------------------------------------------- */

export const br = {
  inline: true,
  group: "inline",
  selectable: false,
  parseDOM: [{tag: "br"}],
  toDOM: () => ["br"]
};
