var ProseMirror = (function (exports) {
  'use strict';

  // ::- Persistent data structure representing an ordered mapping from
  // strings to values, with some convenient update methods.
  function OrderedMap(content) {
    this.content = content;
  }

  OrderedMap.prototype = {
    constructor: OrderedMap,

    find: function(key) {
      for (var i = 0; i < this.content.length; i += 2)
        if (this.content[i] === key) return i
      return -1
    },

    // :: (string) → ?any
    // Retrieve the value stored under `key`, or return undefined when
    // no such key exists.
    get: function(key) {
      var found = this.find(key);
      return found == -1 ? undefined : this.content[found + 1]
    },

    // :: (string, any, ?string) → OrderedMap
    // Create a new map by replacing the value of `key` with a new
    // value, or adding a binding to the end of the map. If `newKey` is
    // given, the key of the binding will be replaced with that key.
    update: function(key, value, newKey) {
      var self = newKey && newKey != key ? this.remove(newKey) : this;
      var found = self.find(key), content = self.content.slice();
      if (found == -1) {
        content.push(newKey || key, value);
      } else {
        content[found + 1] = value;
        if (newKey) content[found] = newKey;
      }
      return new OrderedMap(content)
    },

    // :: (string) → OrderedMap
    // Return a map with the given key removed, if it existed.
    remove: function(key) {
      var found = this.find(key);
      if (found == -1) return this
      var content = this.content.slice();
      content.splice(found, 2);
      return new OrderedMap(content)
    },

    // :: (string, any) → OrderedMap
    // Add a new key to the start of the map.
    addToStart: function(key, value) {
      return new OrderedMap([key, value].concat(this.remove(key).content))
    },

    // :: (string, any) → OrderedMap
    // Add a new key to the end of the map.
    addToEnd: function(key, value) {
      var content = this.remove(key).content.slice();
      content.push(key, value);
      return new OrderedMap(content)
    },

    // :: (string, string, any) → OrderedMap
    // Add a key after the given key. If `place` is not found, the new
    // key is added to the end.
    addBefore: function(place, key, value) {
      var without = this.remove(key), content = without.content.slice();
      var found = without.find(place);
      content.splice(found == -1 ? content.length : found, 0, key, value);
      return new OrderedMap(content)
    },

    // :: ((key: string, value: any))
    // Call the given function for each key/value pair in the map, in
    // order.
    forEach: function(f) {
      for (var i = 0; i < this.content.length; i += 2)
        f(this.content[i], this.content[i + 1]);
    },

    // :: (union<Object, OrderedMap>) → OrderedMap
    // Create a new map by prepending the keys in this map that don't
    // appear in `map` before the keys in `map`.
    prepend: function(map) {
      map = OrderedMap.from(map);
      if (!map.size) return this
      return new OrderedMap(map.content.concat(this.subtract(map).content))
    },

    // :: (union<Object, OrderedMap>) → OrderedMap
    // Create a new map by appending the keys in this map that don't
    // appear in `map` after the keys in `map`.
    append: function(map) {
      map = OrderedMap.from(map);
      if (!map.size) return this
      return new OrderedMap(this.subtract(map).content.concat(map.content))
    },

    // :: (union<Object, OrderedMap>) → OrderedMap
    // Create a map containing all the keys in this map that don't
    // appear in `map`.
    subtract: function(map) {
      var result = this;
      map = OrderedMap.from(map);
      for (var i = 0; i < map.content.length; i += 2)
        result = result.remove(map.content[i]);
      return result
    },

    // :: () → Object
    // Turn ordered map into a plain object.
    toObject: function() {
      var result = {};
      this.forEach(function(key, value) { result[key] = value; });
      return result
    },

    // :: number
    // The amount of keys in this map.
    get size() {
      return this.content.length >> 1
    }
  };

  // :: (?union<Object, OrderedMap>) → OrderedMap
  // Return a map with the given content. If null, create an empty
  // map. If given an ordered map, return that map itself. If given an
  // object, create a map from the object's properties.
  OrderedMap.from = function(value) {
    if (value instanceof OrderedMap) return value
    var content = [];
    if (value) for (var prop in value) content.push(prop, value[prop]);
    return new OrderedMap(content)
  };

  function findDiffStart(a, b, pos) {
      for (let i = 0;; i++) {
          if (i == a.childCount || i == b.childCount)
              return a.childCount == b.childCount ? null : pos;
          let childA = a.child(i), childB = b.child(i);
          if (childA == childB) {
              pos += childA.nodeSize;
              continue;
          }
          if (!childA.sameMarkup(childB))
              return pos;
          if (childA.isText && childA.text != childB.text) {
              for (let j = 0; childA.text[j] == childB.text[j]; j++)
                  pos++;
              return pos;
          }
          if (childA.content.size || childB.content.size) {
              let inner = findDiffStart(childA.content, childB.content, pos + 1);
              if (inner != null)
                  return inner;
          }
          pos += childA.nodeSize;
      }
  }
  function findDiffEnd(a, b, posA, posB) {
      for (let iA = a.childCount, iB = b.childCount;;) {
          if (iA == 0 || iB == 0)
              return iA == iB ? null : { a: posA, b: posB };
          let childA = a.child(--iA), childB = b.child(--iB), size = childA.nodeSize;
          if (childA == childB) {
              posA -= size;
              posB -= size;
              continue;
          }
          if (!childA.sameMarkup(childB))
              return { a: posA, b: posB };
          if (childA.isText && childA.text != childB.text) {
              let same = 0, minSize = Math.min(childA.text.length, childB.text.length);
              while (same < minSize && childA.text[childA.text.length - same - 1] == childB.text[childB.text.length - same - 1]) {
                  same++;
                  posA--;
                  posB--;
              }
              return { a: posA, b: posB };
          }
          if (childA.content.size || childB.content.size) {
              let inner = findDiffEnd(childA.content, childB.content, posA - 1, posB - 1);
              if (inner)
                  return inner;
          }
          posA -= size;
          posB -= size;
      }
  }

  /**
  A fragment represents a node's collection of child nodes.

  Like nodes, fragments are persistent data structures, and you
  should not mutate them or their content. Rather, you create new
  instances whenever needed. The API tries to make this easy.
  */
  class Fragment {
      /**
      @internal
      */
      constructor(
      /**
      @internal
      */
      content, size) {
          this.content = content;
          this.size = size || 0;
          if (size == null)
              for (let i = 0; i < content.length; i++)
                  this.size += content[i].nodeSize;
      }
      /**
      Invoke a callback for all descendant nodes between the given two
      positions (relative to start of this fragment). Doesn't descend
      into a node when the callback returns `false`.
      */
      nodesBetween(from, to, f, nodeStart = 0, parent) {
          for (let i = 0, pos = 0; pos < to; i++) {
              let child = this.content[i], end = pos + child.nodeSize;
              if (end > from && f(child, nodeStart + pos, parent || null, i) !== false && child.content.size) {
                  let start = pos + 1;
                  child.nodesBetween(Math.max(0, from - start), Math.min(child.content.size, to - start), f, nodeStart + start);
              }
              pos = end;
          }
      }
      /**
      Call the given callback for every descendant node. `pos` will be
      relative to the start of the fragment. The callback may return
      `false` to prevent traversal of a given node's children.
      */
      descendants(f) {
          this.nodesBetween(0, this.size, f);
      }
      /**
      Extract the text between `from` and `to`. See the same method on
      [`Node`](https://prosemirror.net/docs/ref/#model.Node.textBetween).
      */
      textBetween(from, to, blockSeparator, leafText) {
          let text = "", separated = true;
          this.nodesBetween(from, to, (node, pos) => {
              if (node.isText) {
                  text += node.text.slice(Math.max(from, pos) - pos, to - pos);
                  separated = !blockSeparator;
              }
              else if (node.isLeaf) {
                  if (leafText) {
                      text += typeof leafText === "function" ? leafText(node) : leafText;
                  }
                  else if (node.type.spec.leafText) {
                      text += node.type.spec.leafText(node);
                  }
                  separated = !blockSeparator;
              }
              else if (!separated && node.isBlock) {
                  text += blockSeparator;
                  separated = true;
              }
          }, 0);
          return text;
      }
      /**
      Create a new fragment containing the combined content of this
      fragment and the other.
      */
      append(other) {
          if (!other.size)
              return this;
          if (!this.size)
              return other;
          let last = this.lastChild, first = other.firstChild, content = this.content.slice(), i = 0;
          if (last.isText && last.sameMarkup(first)) {
              content[content.length - 1] = last.withText(last.text + first.text);
              i = 1;
          }
          for (; i < other.content.length; i++)
              content.push(other.content[i]);
          return new Fragment(content, this.size + other.size);
      }
      /**
      Cut out the sub-fragment between the two given positions.
      */
      cut(from, to = this.size) {
          if (from == 0 && to == this.size)
              return this;
          let result = [], size = 0;
          if (to > from)
              for (let i = 0, pos = 0; pos < to; i++) {
                  let child = this.content[i], end = pos + child.nodeSize;
                  if (end > from) {
                      if (pos < from || end > to) {
                          if (child.isText)
                              child = child.cut(Math.max(0, from - pos), Math.min(child.text.length, to - pos));
                          else
                              child = child.cut(Math.max(0, from - pos - 1), Math.min(child.content.size, to - pos - 1));
                      }
                      result.push(child);
                      size += child.nodeSize;
                  }
                  pos = end;
              }
          return new Fragment(result, size);
      }
      /**
      @internal
      */
      cutByIndex(from, to) {
          if (from == to)
              return Fragment.empty;
          if (from == 0 && to == this.content.length)
              return this;
          return new Fragment(this.content.slice(from, to));
      }
      /**
      Create a new fragment in which the node at the given index is
      replaced by the given node.
      */
      replaceChild(index, node) {
          let current = this.content[index];
          if (current == node)
              return this;
          let copy = this.content.slice();
          let size = this.size + node.nodeSize - current.nodeSize;
          copy[index] = node;
          return new Fragment(copy, size);
      }
      /**
      Create a new fragment by prepending the given node to this
      fragment.
      */
      addToStart(node) {
          return new Fragment([node].concat(this.content), this.size + node.nodeSize);
      }
      /**
      Create a new fragment by appending the given node to this
      fragment.
      */
      addToEnd(node) {
          return new Fragment(this.content.concat(node), this.size + node.nodeSize);
      }
      /**
      Compare this fragment to another one.
      */
      eq(other) {
          if (this.content.length != other.content.length)
              return false;
          for (let i = 0; i < this.content.length; i++)
              if (!this.content[i].eq(other.content[i]))
                  return false;
          return true;
      }
      /**
      The first child of the fragment, or `null` if it is empty.
      */
      get firstChild() { return this.content.length ? this.content[0] : null; }
      /**
      The last child of the fragment, or `null` if it is empty.
      */
      get lastChild() { return this.content.length ? this.content[this.content.length - 1] : null; }
      /**
      The number of child nodes in this fragment.
      */
      get childCount() { return this.content.length; }
      /**
      Get the child node at the given index. Raise an error when the
      index is out of range.
      */
      child(index) {
          let found = this.content[index];
          if (!found)
              throw new RangeError("Index " + index + " out of range for " + this);
          return found;
      }
      /**
      Get the child node at the given index, if it exists.
      */
      maybeChild(index) {
          return this.content[index] || null;
      }
      /**
      Call `f` for every child node, passing the node, its offset
      into this parent node, and its index.
      */
      forEach(f) {
          for (let i = 0, p = 0; i < this.content.length; i++) {
              let child = this.content[i];
              f(child, p, i);
              p += child.nodeSize;
          }
      }
      /**
      Find the first position at which this fragment and another
      fragment differ, or `null` if they are the same.
      */
      findDiffStart(other, pos = 0) {
          return findDiffStart(this, other, pos);
      }
      /**
      Find the first position, searching from the end, at which this
      fragment and the given fragment differ, or `null` if they are
      the same. Since this position will not be the same in both
      nodes, an object with two separate positions is returned.
      */
      findDiffEnd(other, pos = this.size, otherPos = other.size) {
          return findDiffEnd(this, other, pos, otherPos);
      }
      /**
      Find the index and inner offset corresponding to a given relative
      position in this fragment. The result object will be reused
      (overwritten) the next time the function is called. (Not public.)
      */
      findIndex(pos, round = -1) {
          if (pos == 0)
              return retIndex(0, pos);
          if (pos == this.size)
              return retIndex(this.content.length, pos);
          if (pos > this.size || pos < 0)
              throw new RangeError(`Position ${pos} outside of fragment (${this})`);
          for (let i = 0, curPos = 0;; i++) {
              let cur = this.child(i), end = curPos + cur.nodeSize;
              if (end >= pos) {
                  if (end == pos || round > 0)
                      return retIndex(i + 1, end);
                  return retIndex(i, curPos);
              }
              curPos = end;
          }
      }
      /**
      Return a debugging string that describes this fragment.
      */
      toString() { return "<" + this.toStringInner() + ">"; }
      /**
      @internal
      */
      toStringInner() { return this.content.join(", "); }
      /**
      Create a JSON-serializeable representation of this fragment.
      */
      toJSON() {
          return this.content.length ? this.content.map(n => n.toJSON()) : null;
      }
      /**
      Deserialize a fragment from its JSON representation.
      */
      static fromJSON(schema, value) {
          if (!value)
              return Fragment.empty;
          if (!Array.isArray(value))
              throw new RangeError("Invalid input for Fragment.fromJSON");
          return new Fragment(value.map(schema.nodeFromJSON));
      }
      /**
      Build a fragment from an array of nodes. Ensures that adjacent
      text nodes with the same marks are joined together.
      */
      static fromArray(array) {
          if (!array.length)
              return Fragment.empty;
          let joined, size = 0;
          for (let i = 0; i < array.length; i++) {
              let node = array[i];
              size += node.nodeSize;
              if (i && node.isText && array[i - 1].sameMarkup(node)) {
                  if (!joined)
                      joined = array.slice(0, i);
                  joined[joined.length - 1] = node
                      .withText(joined[joined.length - 1].text + node.text);
              }
              else if (joined) {
                  joined.push(node);
              }
          }
          return new Fragment(joined || array, size);
      }
      /**
      Create a fragment from something that can be interpreted as a
      set of nodes. For `null`, it returns the empty fragment. For a
      fragment, the fragment itself. For a node or array of nodes, a
      fragment containing those nodes.
      */
      static from(nodes) {
          if (!nodes)
              return Fragment.empty;
          if (nodes instanceof Fragment)
              return nodes;
          if (Array.isArray(nodes))
              return this.fromArray(nodes);
          if (nodes.attrs)
              return new Fragment([nodes], nodes.nodeSize);
          throw new RangeError("Can not convert " + nodes + " to a Fragment" +
              (nodes.nodesBetween ? " (looks like multiple versions of prosemirror-model were loaded)" : ""));
      }
  }
  /**
  An empty fragment. Intended to be reused whenever a node doesn't
  contain anything (rather than allocating a new empty fragment for
  each leaf node).
  */
  Fragment.empty = new Fragment([], 0);
  const found = { index: 0, offset: 0 };
  function retIndex(index, offset) {
      found.index = index;
      found.offset = offset;
      return found;
  }

  function compareDeep(a, b) {
      if (a === b)
          return true;
      if (!(a && typeof a == "object") ||
          !(b && typeof b == "object"))
          return false;
      let array = Array.isArray(a);
      if (Array.isArray(b) != array)
          return false;
      if (array) {
          if (a.length != b.length)
              return false;
          for (let i = 0; i < a.length; i++)
              if (!compareDeep(a[i], b[i]))
                  return false;
      }
      else {
          for (let p in a)
              if (!(p in b) || !compareDeep(a[p], b[p]))
                  return false;
          for (let p in b)
              if (!(p in a))
                  return false;
      }
      return true;
  }

  /**
  A mark is a piece of information that can be attached to a node,
  such as it being emphasized, in code font, or a link. It has a
  type and optionally a set of attributes that provide further
  information (such as the target of the link). Marks are created
  through a `Schema`, which controls which types exist and which
  attributes they have.
  */
  class Mark {
      /**
      @internal
      */
      constructor(
      /**
      The type of this mark.
      */
      type, 
      /**
      The attributes associated with this mark.
      */
      attrs) {
          this.type = type;
          this.attrs = attrs;
      }
      /**
      Given a set of marks, create a new set which contains this one as
      well, in the right position. If this mark is already in the set,
      the set itself is returned. If any marks that are set to be
      [exclusive](https://prosemirror.net/docs/ref/#model.MarkSpec.excludes) with this mark are present,
      those are replaced by this one.
      */
      addToSet(set) {
          let copy, placed = false;
          for (let i = 0; i < set.length; i++) {
              let other = set[i];
              if (this.eq(other))
                  return set;
              if (this.type.excludes(other.type)) {
                  if (!copy)
                      copy = set.slice(0, i);
              }
              else if (other.type.excludes(this.type)) {
                  return set;
              }
              else {
                  if (!placed && other.type.rank > this.type.rank) {
                      if (!copy)
                          copy = set.slice(0, i);
                      copy.push(this);
                      placed = true;
                  }
                  if (copy)
                      copy.push(other);
              }
          }
          if (!copy)
              copy = set.slice();
          if (!placed)
              copy.push(this);
          return copy;
      }
      /**
      Remove this mark from the given set, returning a new set. If this
      mark is not in the set, the set itself is returned.
      */
      removeFromSet(set) {
          for (let i = 0; i < set.length; i++)
              if (this.eq(set[i]))
                  return set.slice(0, i).concat(set.slice(i + 1));
          return set;
      }
      /**
      Test whether this mark is in the given set of marks.
      */
      isInSet(set) {
          for (let i = 0; i < set.length; i++)
              if (this.eq(set[i]))
                  return true;
          return false;
      }
      /**
      Test whether this mark has the same type and attributes as
      another mark.
      */
      eq(other) {
          return this == other ||
              (this.type == other.type && compareDeep(this.attrs, other.attrs));
      }
      /**
      Convert this mark to a JSON-serializeable representation.
      */
      toJSON() {
          let obj = { type: this.type.name };
          for (let _ in this.attrs) {
              obj.attrs = this.attrs;
              break;
          }
          return obj;
      }
      /**
      Deserialize a mark from JSON.
      */
      static fromJSON(schema, json) {
          if (!json)
              throw new RangeError("Invalid input for Mark.fromJSON");
          let type = schema.marks[json.type];
          if (!type)
              throw new RangeError(`There is no mark type ${json.type} in this schema`);
          return type.create(json.attrs);
      }
      /**
      Test whether two sets of marks are identical.
      */
      static sameSet(a, b) {
          if (a == b)
              return true;
          if (a.length != b.length)
              return false;
          for (let i = 0; i < a.length; i++)
              if (!a[i].eq(b[i]))
                  return false;
          return true;
      }
      /**
      Create a properly sorted mark set from null, a single mark, or an
      unsorted array of marks.
      */
      static setFrom(marks) {
          if (!marks || Array.isArray(marks) && marks.length == 0)
              return Mark.none;
          if (marks instanceof Mark)
              return [marks];
          let copy = marks.slice();
          copy.sort((a, b) => a.type.rank - b.type.rank);
          return copy;
      }
  }
  /**
  The empty set of marks.
  */
  Mark.none = [];

  /**
  Error type raised by [`Node.replace`](https://prosemirror.net/docs/ref/#model.Node.replace) when
  given an invalid replacement.
  */
  class ReplaceError extends Error {
  }
  /*
  ReplaceError = function(this: any, message: string) {
    let err = Error.call(this, message)
    ;(err as any).__proto__ = ReplaceError.prototype
    return err
  } as any

  ReplaceError.prototype = Object.create(Error.prototype)
  ReplaceError.prototype.constructor = ReplaceError
  ReplaceError.prototype.name = "ReplaceError"
  */
  /**
  A slice represents a piece cut out of a larger document. It
  stores not only a fragment, but also the depth up to which nodes on
  both side are ‘open’ (cut through).
  */
  class Slice {
      /**
      Create a slice. When specifying a non-zero open depth, you must
      make sure that there are nodes of at least that depth at the
      appropriate side of the fragment—i.e. if the fragment is an
      empty paragraph node, `openStart` and `openEnd` can't be greater
      than 1.
      
      It is not necessary for the content of open nodes to conform to
      the schema's content constraints, though it should be a valid
      start/end/middle for such a node, depending on which sides are
      open.
      */
      constructor(
      /**
      The slice's content.
      */
      content, 
      /**
      The open depth at the start of the fragment.
      */
      openStart, 
      /**
      The open depth at the end.
      */
      openEnd) {
          this.content = content;
          this.openStart = openStart;
          this.openEnd = openEnd;
      }
      /**
      The size this slice would add when inserted into a document.
      */
      get size() {
          return this.content.size - this.openStart - this.openEnd;
      }
      /**
      @internal
      */
      insertAt(pos, fragment) {
          let content = insertInto(this.content, pos + this.openStart, fragment);
          return content && new Slice(content, this.openStart, this.openEnd);
      }
      /**
      @internal
      */
      removeBetween(from, to) {
          return new Slice(removeRange(this.content, from + this.openStart, to + this.openStart), this.openStart, this.openEnd);
      }
      /**
      Tests whether this slice is equal to another slice.
      */
      eq(other) {
          return this.content.eq(other.content) && this.openStart == other.openStart && this.openEnd == other.openEnd;
      }
      /**
      @internal
      */
      toString() {
          return this.content + "(" + this.openStart + "," + this.openEnd + ")";
      }
      /**
      Convert a slice to a JSON-serializable representation.
      */
      toJSON() {
          if (!this.content.size)
              return null;
          let json = { content: this.content.toJSON() };
          if (this.openStart > 0)
              json.openStart = this.openStart;
          if (this.openEnd > 0)
              json.openEnd = this.openEnd;
          return json;
      }
      /**
      Deserialize a slice from its JSON representation.
      */
      static fromJSON(schema, json) {
          if (!json)
              return Slice.empty;
          let openStart = json.openStart || 0, openEnd = json.openEnd || 0;
          if (typeof openStart != "number" || typeof openEnd != "number")
              throw new RangeError("Invalid input for Slice.fromJSON");
          return new Slice(Fragment.fromJSON(schema, json.content), openStart, openEnd);
      }
      /**
      Create a slice from a fragment by taking the maximum possible
      open value on both side of the fragment.
      */
      static maxOpen(fragment, openIsolating = true) {
          let openStart = 0, openEnd = 0;
          for (let n = fragment.firstChild; n && !n.isLeaf && (openIsolating || !n.type.spec.isolating); n = n.firstChild)
              openStart++;
          for (let n = fragment.lastChild; n && !n.isLeaf && (openIsolating || !n.type.spec.isolating); n = n.lastChild)
              openEnd++;
          return new Slice(fragment, openStart, openEnd);
      }
  }
  /**
  The empty slice.
  */
  Slice.empty = new Slice(Fragment.empty, 0, 0);
  function removeRange(content, from, to) {
      let { index, offset } = content.findIndex(from), child = content.maybeChild(index);
      let { index: indexTo, offset: offsetTo } = content.findIndex(to);
      if (offset == from || child.isText) {
          if (offsetTo != to && !content.child(indexTo).isText)
              throw new RangeError("Removing non-flat range");
          return content.cut(0, from).append(content.cut(to));
      }
      if (index != indexTo)
          throw new RangeError("Removing non-flat range");
      return content.replaceChild(index, child.copy(removeRange(child.content, from - offset - 1, to - offset - 1)));
  }
  function insertInto(content, dist, insert, parent) {
      let { index, offset } = content.findIndex(dist), child = content.maybeChild(index);
      if (offset == dist || child.isText) {
          if (parent && !parent.canReplace(index, index, insert))
              return null;
          return content.cut(0, dist).append(insert).append(content.cut(dist));
      }
      let inner = insertInto(child.content, dist - offset - 1, insert);
      return inner && content.replaceChild(index, child.copy(inner));
  }
  function replace($from, $to, slice) {
      if (slice.openStart > $from.depth)
          throw new ReplaceError("Inserted content deeper than insertion position");
      if ($from.depth - slice.openStart != $to.depth - slice.openEnd)
          throw new ReplaceError("Inconsistent open depths");
      return replaceOuter($from, $to, slice, 0);
  }
  function replaceOuter($from, $to, slice, depth) {
      let index = $from.index(depth), node = $from.node(depth);
      if (index == $to.index(depth) && depth < $from.depth - slice.openStart) {
          let inner = replaceOuter($from, $to, slice, depth + 1);
          return node.copy(node.content.replaceChild(index, inner));
      }
      else if (!slice.content.size) {
          return close(node, replaceTwoWay($from, $to, depth));
      }
      else if (!slice.openStart && !slice.openEnd && $from.depth == depth && $to.depth == depth) { // Simple, flat case
          let parent = $from.parent, content = parent.content;
          return close(parent, content.cut(0, $from.parentOffset).append(slice.content).append(content.cut($to.parentOffset)));
      }
      else {
          let { start, end } = prepareSliceForReplace(slice, $from);
          return close(node, replaceThreeWay($from, start, end, $to, depth));
      }
  }
  function checkJoin(main, sub) {
      if (!sub.type.compatibleContent(main.type))
          throw new ReplaceError("Cannot join " + sub.type.name + " onto " + main.type.name);
  }
  function joinable$1($before, $after, depth) {
      let node = $before.node(depth);
      checkJoin(node, $after.node(depth));
      return node;
  }
  function addNode(child, target) {
      let last = target.length - 1;
      if (last >= 0 && child.isText && child.sameMarkup(target[last]))
          target[last] = child.withText(target[last].text + child.text);
      else
          target.push(child);
  }
  function addRange($start, $end, depth, target) {
      let node = ($end || $start).node(depth);
      let startIndex = 0, endIndex = $end ? $end.index(depth) : node.childCount;
      if ($start) {
          startIndex = $start.index(depth);
          if ($start.depth > depth) {
              startIndex++;
          }
          else if ($start.textOffset) {
              addNode($start.nodeAfter, target);
              startIndex++;
          }
      }
      for (let i = startIndex; i < endIndex; i++)
          addNode(node.child(i), target);
      if ($end && $end.depth == depth && $end.textOffset)
          addNode($end.nodeBefore, target);
  }
  function close(node, content) {
      node.type.checkContent(content);
      return node.copy(content);
  }
  function replaceThreeWay($from, $start, $end, $to, depth) {
      let openStart = $from.depth > depth && joinable$1($from, $start, depth + 1);
      let openEnd = $to.depth > depth && joinable$1($end, $to, depth + 1);
      let content = [];
      addRange(null, $from, depth, content);
      if (openStart && openEnd && $start.index(depth) == $end.index(depth)) {
          checkJoin(openStart, openEnd);
          addNode(close(openStart, replaceThreeWay($from, $start, $end, $to, depth + 1)), content);
      }
      else {
          if (openStart)
              addNode(close(openStart, replaceTwoWay($from, $start, depth + 1)), content);
          addRange($start, $end, depth, content);
          if (openEnd)
              addNode(close(openEnd, replaceTwoWay($end, $to, depth + 1)), content);
      }
      addRange($to, null, depth, content);
      return new Fragment(content);
  }
  function replaceTwoWay($from, $to, depth) {
      let content = [];
      addRange(null, $from, depth, content);
      if ($from.depth > depth) {
          let type = joinable$1($from, $to, depth + 1);
          addNode(close(type, replaceTwoWay($from, $to, depth + 1)), content);
      }
      addRange($to, null, depth, content);
      return new Fragment(content);
  }
  function prepareSliceForReplace(slice, $along) {
      let extra = $along.depth - slice.openStart, parent = $along.node(extra);
      let node = parent.copy(slice.content);
      for (let i = extra - 1; i >= 0; i--)
          node = $along.node(i).copy(Fragment.from(node));
      return { start: node.resolveNoCache(slice.openStart + extra),
          end: node.resolveNoCache(node.content.size - slice.openEnd - extra) };
  }

  /**
  You can [_resolve_](https://prosemirror.net/docs/ref/#model.Node.resolve) a position to get more
  information about it. Objects of this class represent such a
  resolved position, providing various pieces of context
  information, and some helper methods.

  Throughout this interface, methods that take an optional `depth`
  parameter will interpret undefined as `this.depth` and negative
  numbers as `this.depth + value`.
  */
  class ResolvedPos {
      /**
      @internal
      */
      constructor(
      /**
      The position that was resolved.
      */
      pos, 
      /**
      @internal
      */
      path, 
      /**
      The offset this position has into its parent node.
      */
      parentOffset) {
          this.pos = pos;
          this.path = path;
          this.parentOffset = parentOffset;
          this.depth = path.length / 3 - 1;
      }
      /**
      @internal
      */
      resolveDepth(val) {
          if (val == null)
              return this.depth;
          if (val < 0)
              return this.depth + val;
          return val;
      }
      /**
      The parent node that the position points into. Note that even if
      a position points into a text node, that node is not considered
      the parent—text nodes are ‘flat’ in this model, and have no content.
      */
      get parent() { return this.node(this.depth); }
      /**
      The root node in which the position was resolved.
      */
      get doc() { return this.node(0); }
      /**
      The ancestor node at the given level. `p.node(p.depth)` is the
      same as `p.parent`.
      */
      node(depth) { return this.path[this.resolveDepth(depth) * 3]; }
      /**
      The index into the ancestor at the given level. If this points
      at the 3rd node in the 2nd paragraph on the top level, for
      example, `p.index(0)` is 1 and `p.index(1)` is 2.
      */
      index(depth) { return this.path[this.resolveDepth(depth) * 3 + 1]; }
      /**
      The index pointing after this position into the ancestor at the
      given level.
      */
      indexAfter(depth) {
          depth = this.resolveDepth(depth);
          return this.index(depth) + (depth == this.depth && !this.textOffset ? 0 : 1);
      }
      /**
      The (absolute) position at the start of the node at the given
      level.
      */
      start(depth) {
          depth = this.resolveDepth(depth);
          return depth == 0 ? 0 : this.path[depth * 3 - 1] + 1;
      }
      /**
      The (absolute) position at the end of the node at the given
      level.
      */
      end(depth) {
          depth = this.resolveDepth(depth);
          return this.start(depth) + this.node(depth).content.size;
      }
      /**
      The (absolute) position directly before the wrapping node at the
      given level, or, when `depth` is `this.depth + 1`, the original
      position.
      */
      before(depth) {
          depth = this.resolveDepth(depth);
          if (!depth)
              throw new RangeError("There is no position before the top-level node");
          return depth == this.depth + 1 ? this.pos : this.path[depth * 3 - 1];
      }
      /**
      The (absolute) position directly after the wrapping node at the
      given level, or the original position when `depth` is `this.depth + 1`.
      */
      after(depth) {
          depth = this.resolveDepth(depth);
          if (!depth)
              throw new RangeError("There is no position after the top-level node");
          return depth == this.depth + 1 ? this.pos : this.path[depth * 3 - 1] + this.path[depth * 3].nodeSize;
      }
      /**
      When this position points into a text node, this returns the
      distance between the position and the start of the text node.
      Will be zero for positions that point between nodes.
      */
      get textOffset() { return this.pos - this.path[this.path.length - 1]; }
      /**
      Get the node directly after the position, if any. If the position
      points into a text node, only the part of that node after the
      position is returned.
      */
      get nodeAfter() {
          let parent = this.parent, index = this.index(this.depth);
          if (index == parent.childCount)
              return null;
          let dOff = this.pos - this.path[this.path.length - 1], child = parent.child(index);
          return dOff ? parent.child(index).cut(dOff) : child;
      }
      /**
      Get the node directly before the position, if any. If the
      position points into a text node, only the part of that node
      before the position is returned.
      */
      get nodeBefore() {
          let index = this.index(this.depth);
          let dOff = this.pos - this.path[this.path.length - 1];
          if (dOff)
              return this.parent.child(index).cut(0, dOff);
          return index == 0 ? null : this.parent.child(index - 1);
      }
      /**
      Get the position at the given index in the parent node at the
      given depth (which defaults to `this.depth`).
      */
      posAtIndex(index, depth) {
          depth = this.resolveDepth(depth);
          let node = this.path[depth * 3], pos = depth == 0 ? 0 : this.path[depth * 3 - 1] + 1;
          for (let i = 0; i < index; i++)
              pos += node.child(i).nodeSize;
          return pos;
      }
      /**
      Get the marks at this position, factoring in the surrounding
      marks' [`inclusive`](https://prosemirror.net/docs/ref/#model.MarkSpec.inclusive) property. If the
      position is at the start of a non-empty node, the marks of the
      node after it (if any) are returned.
      */
      marks() {
          let parent = this.parent, index = this.index();
          // In an empty parent, return the empty array
          if (parent.content.size == 0)
              return Mark.none;
          // When inside a text node, just return the text node's marks
          if (this.textOffset)
              return parent.child(index).marks;
          let main = parent.maybeChild(index - 1), other = parent.maybeChild(index);
          // If the `after` flag is true of there is no node before, make
          // the node after this position the main reference.
          if (!main) {
              let tmp = main;
              main = other;
              other = tmp;
          }
          // Use all marks in the main node, except those that have
          // `inclusive` set to false and are not present in the other node.
          let marks = main.marks;
          for (var i = 0; i < marks.length; i++)
              if (marks[i].type.spec.inclusive === false && (!other || !marks[i].isInSet(other.marks)))
                  marks = marks[i--].removeFromSet(marks);
          return marks;
      }
      /**
      Get the marks after the current position, if any, except those
      that are non-inclusive and not present at position `$end`. This
      is mostly useful for getting the set of marks to preserve after a
      deletion. Will return `null` if this position is at the end of
      its parent node or its parent node isn't a textblock (in which
      case no marks should be preserved).
      */
      marksAcross($end) {
          let after = this.parent.maybeChild(this.index());
          if (!after || !after.isInline)
              return null;
          let marks = after.marks, next = $end.parent.maybeChild($end.index());
          for (var i = 0; i < marks.length; i++)
              if (marks[i].type.spec.inclusive === false && (!next || !marks[i].isInSet(next.marks)))
                  marks = marks[i--].removeFromSet(marks);
          return marks;
      }
      /**
      The depth up to which this position and the given (non-resolved)
      position share the same parent nodes.
      */
      sharedDepth(pos) {
          for (let depth = this.depth; depth > 0; depth--)
              if (this.start(depth) <= pos && this.end(depth) >= pos)
                  return depth;
          return 0;
      }
      /**
      Returns a range based on the place where this position and the
      given position diverge around block content. If both point into
      the same textblock, for example, a range around that textblock
      will be returned. If they point into different blocks, the range
      around those blocks in their shared ancestor is returned. You can
      pass in an optional predicate that will be called with a parent
      node to see if a range into that parent is acceptable.
      */
      blockRange(other = this, pred) {
          if (other.pos < this.pos)
              return other.blockRange(this);
          for (let d = this.depth - (this.parent.inlineContent || this.pos == other.pos ? 1 : 0); d >= 0; d--)
              if (other.pos <= this.end(d) && (!pred || pred(this.node(d))))
                  return new NodeRange(this, other, d);
          return null;
      }
      /**
      Query whether the given position shares the same parent node.
      */
      sameParent(other) {
          return this.pos - this.parentOffset == other.pos - other.parentOffset;
      }
      /**
      Return the greater of this and the given position.
      */
      max(other) {
          return other.pos > this.pos ? other : this;
      }
      /**
      Return the smaller of this and the given position.
      */
      min(other) {
          return other.pos < this.pos ? other : this;
      }
      /**
      @internal
      */
      toString() {
          let str = "";
          for (let i = 1; i <= this.depth; i++)
              str += (str ? "/" : "") + this.node(i).type.name + "_" + this.index(i - 1);
          return str + ":" + this.parentOffset;
      }
      /**
      @internal
      */
      static resolve(doc, pos) {
          if (!(pos >= 0 && pos <= doc.content.size))
              throw new RangeError("Position " + pos + " out of range");
          let path = [];
          let start = 0, parentOffset = pos;
          for (let node = doc;;) {
              let { index, offset } = node.content.findIndex(parentOffset);
              let rem = parentOffset - offset;
              path.push(node, index, start + offset);
              if (!rem)
                  break;
              node = node.child(index);
              if (node.isText)
                  break;
              parentOffset = rem - 1;
              start += offset + 1;
          }
          return new ResolvedPos(pos, path, parentOffset);
      }
      /**
      @internal
      */
      static resolveCached(doc, pos) {
          for (let i = 0; i < resolveCache.length; i++) {
              let cached = resolveCache[i];
              if (cached.pos == pos && cached.doc == doc)
                  return cached;
          }
          let result = resolveCache[resolveCachePos] = ResolvedPos.resolve(doc, pos);
          resolveCachePos = (resolveCachePos + 1) % resolveCacheSize;
          return result;
      }
  }
  let resolveCache = [], resolveCachePos = 0, resolveCacheSize = 12;
  /**
  Represents a flat range of content, i.e. one that starts and
  ends in the same node.
  */
  class NodeRange {
      /**
      Construct a node range. `$from` and `$to` should point into the
      same node until at least the given `depth`, since a node range
      denotes an adjacent set of nodes in a single parent node.
      */
      constructor(
      /**
      A resolved position along the start of the content. May have a
      `depth` greater than this object's `depth` property, since
      these are the positions that were used to compute the range,
      not re-resolved positions directly at its boundaries.
      */
      $from, 
      /**
      A position along the end of the content. See
      caveat for [`$from`](https://prosemirror.net/docs/ref/#model.NodeRange.$from).
      */
      $to, 
      /**
      The depth of the node that this range points into.
      */
      depth) {
          this.$from = $from;
          this.$to = $to;
          this.depth = depth;
      }
      /**
      The position at the start of the range.
      */
      get start() { return this.$from.before(this.depth + 1); }
      /**
      The position at the end of the range.
      */
      get end() { return this.$to.after(this.depth + 1); }
      /**
      The parent node that the range points into.
      */
      get parent() { return this.$from.node(this.depth); }
      /**
      The start index of the range in the parent node.
      */
      get startIndex() { return this.$from.index(this.depth); }
      /**
      The end index of the range in the parent node.
      */
      get endIndex() { return this.$to.indexAfter(this.depth); }
  }

  const emptyAttrs = Object.create(null);
  /**
  This class represents a node in the tree that makes up a
  ProseMirror document. So a document is an instance of `Node`, with
  children that are also instances of `Node`.

  Nodes are persistent data structures. Instead of changing them, you
  create new ones with the content you want. Old ones keep pointing
  at the old document shape. This is made cheaper by sharing
  structure between the old and new data as much as possible, which a
  tree shape like this (without back pointers) makes easy.

  **Do not** directly mutate the properties of a `Node` object. See
  [the guide](/docs/guide/#doc) for more information.
  */
  class Node {
      /**
      @internal
      */
      constructor(
      /**
      The type of node that this is.
      */
      type, 
      /**
      An object mapping attribute names to values. The kind of
      attributes allowed and required are
      [determined](https://prosemirror.net/docs/ref/#model.NodeSpec.attrs) by the node type.
      */
      attrs, 
      // A fragment holding the node's children.
      content, 
      /**
      The marks (things like whether it is emphasized or part of a
      link) applied to this node.
      */
      marks = Mark.none) {
          this.type = type;
          this.attrs = attrs;
          this.marks = marks;
          this.content = content || Fragment.empty;
      }
      /**
      The size of this node, as defined by the integer-based [indexing
      scheme](/docs/guide/#doc.indexing). For text nodes, this is the
      amount of characters. For other leaf nodes, it is one. For
      non-leaf nodes, it is the size of the content plus two (the
      start and end token).
      */
      get nodeSize() { return this.isLeaf ? 1 : 2 + this.content.size; }
      /**
      The number of children that the node has.
      */
      get childCount() { return this.content.childCount; }
      /**
      Get the child node at the given index. Raises an error when the
      index is out of range.
      */
      child(index) { return this.content.child(index); }
      /**
      Get the child node at the given index, if it exists.
      */
      maybeChild(index) { return this.content.maybeChild(index); }
      /**
      Call `f` for every child node, passing the node, its offset
      into this parent node, and its index.
      */
      forEach(f) { this.content.forEach(f); }
      /**
      Invoke a callback for all descendant nodes recursively between
      the given two positions that are relative to start of this
      node's content. The callback is invoked with the node, its
      parent-relative position, its parent node, and its child index.
      When the callback returns false for a given node, that node's
      children will not be recursed over. The last parameter can be
      used to specify a starting position to count from.
      */
      nodesBetween(from, to, f, startPos = 0) {
          this.content.nodesBetween(from, to, f, startPos, this);
      }
      /**
      Call the given callback for every descendant node. Doesn't
      descend into a node when the callback returns `false`.
      */
      descendants(f) {
          this.nodesBetween(0, this.content.size, f);
      }
      /**
      Concatenates all the text nodes found in this fragment and its
      children.
      */
      get textContent() {
          return (this.isLeaf && this.type.spec.leafText)
              ? this.type.spec.leafText(this)
              : this.textBetween(0, this.content.size, "");
      }
      /**
      Get all text between positions `from` and `to`. When
      `blockSeparator` is given, it will be inserted to separate text
      from different block nodes. If `leafText` is given, it'll be
      inserted for every non-text leaf node encountered, otherwise
      [`leafText`](https://prosemirror.net/docs/ref/#model.NodeSpec^leafText) will be used.
      */
      textBetween(from, to, blockSeparator, leafText) {
          return this.content.textBetween(from, to, blockSeparator, leafText);
      }
      /**
      Returns this node's first child, or `null` if there are no
      children.
      */
      get firstChild() { return this.content.firstChild; }
      /**
      Returns this node's last child, or `null` if there are no
      children.
      */
      get lastChild() { return this.content.lastChild; }
      /**
      Test whether two nodes represent the same piece of document.
      */
      eq(other) {
          return this == other || (this.sameMarkup(other) && this.content.eq(other.content));
      }
      /**
      Compare the markup (type, attributes, and marks) of this node to
      those of another. Returns `true` if both have the same markup.
      */
      sameMarkup(other) {
          return this.hasMarkup(other.type, other.attrs, other.marks);
      }
      /**
      Check whether this node's markup correspond to the given type,
      attributes, and marks.
      */
      hasMarkup(type, attrs, marks) {
          return this.type == type &&
              compareDeep(this.attrs, attrs || type.defaultAttrs || emptyAttrs) &&
              Mark.sameSet(this.marks, marks || Mark.none);
      }
      /**
      Create a new node with the same markup as this node, containing
      the given content (or empty, if no content is given).
      */
      copy(content = null) {
          if (content == this.content)
              return this;
          return new Node(this.type, this.attrs, content, this.marks);
      }
      /**
      Create a copy of this node, with the given set of marks instead
      of the node's own marks.
      */
      mark(marks) {
          return marks == this.marks ? this : new Node(this.type, this.attrs, this.content, marks);
      }
      /**
      Create a copy of this node with only the content between the
      given positions. If `to` is not given, it defaults to the end of
      the node.
      */
      cut(from, to = this.content.size) {
          if (from == 0 && to == this.content.size)
              return this;
          return this.copy(this.content.cut(from, to));
      }
      /**
      Cut out the part of the document between the given positions, and
      return it as a `Slice` object.
      */
      slice(from, to = this.content.size, includeParents = false) {
          if (from == to)
              return Slice.empty;
          let $from = this.resolve(from), $to = this.resolve(to);
          let depth = includeParents ? 0 : $from.sharedDepth(to);
          let start = $from.start(depth), node = $from.node(depth);
          let content = node.content.cut($from.pos - start, $to.pos - start);
          return new Slice(content, $from.depth - depth, $to.depth - depth);
      }
      /**
      Replace the part of the document between the given positions with
      the given slice. The slice must 'fit', meaning its open sides
      must be able to connect to the surrounding content, and its
      content nodes must be valid children for the node they are placed
      into. If any of this is violated, an error of type
      [`ReplaceError`](https://prosemirror.net/docs/ref/#model.ReplaceError) is thrown.
      */
      replace(from, to, slice) {
          return replace(this.resolve(from), this.resolve(to), slice);
      }
      /**
      Find the node directly after the given position.
      */
      nodeAt(pos) {
          for (let node = this;;) {
              let { index, offset } = node.content.findIndex(pos);
              node = node.maybeChild(index);
              if (!node)
                  return null;
              if (offset == pos || node.isText)
                  return node;
              pos -= offset + 1;
          }
      }
      /**
      Find the (direct) child node after the given offset, if any,
      and return it along with its index and offset relative to this
      node.
      */
      childAfter(pos) {
          let { index, offset } = this.content.findIndex(pos);
          return { node: this.content.maybeChild(index), index, offset };
      }
      /**
      Find the (direct) child node before the given offset, if any,
      and return it along with its index and offset relative to this
      node.
      */
      childBefore(pos) {
          if (pos == 0)
              return { node: null, index: 0, offset: 0 };
          let { index, offset } = this.content.findIndex(pos);
          if (offset < pos)
              return { node: this.content.child(index), index, offset };
          let node = this.content.child(index - 1);
          return { node, index: index - 1, offset: offset - node.nodeSize };
      }
      /**
      Resolve the given position in the document, returning an
      [object](https://prosemirror.net/docs/ref/#model.ResolvedPos) with information about its context.
      */
      resolve(pos) { return ResolvedPos.resolveCached(this, pos); }
      /**
      @internal
      */
      resolveNoCache(pos) { return ResolvedPos.resolve(this, pos); }
      /**
      Test whether a given mark or mark type occurs in this document
      between the two given positions.
      */
      rangeHasMark(from, to, type) {
          let found = false;
          if (to > from)
              this.nodesBetween(from, to, node => {
                  if (type.isInSet(node.marks))
                      found = true;
                  return !found;
              });
          return found;
      }
      /**
      True when this is a block (non-inline node)
      */
      get isBlock() { return this.type.isBlock; }
      /**
      True when this is a textblock node, a block node with inline
      content.
      */
      get isTextblock() { return this.type.isTextblock; }
      /**
      True when this node allows inline content.
      */
      get inlineContent() { return this.type.inlineContent; }
      /**
      True when this is an inline node (a text node or a node that can
      appear among text).
      */
      get isInline() { return this.type.isInline; }
      /**
      True when this is a text node.
      */
      get isText() { return this.type.isText; }
      /**
      True when this is a leaf node.
      */
      get isLeaf() { return this.type.isLeaf; }
      /**
      True when this is an atom, i.e. when it does not have directly
      editable content. This is usually the same as `isLeaf`, but can
      be configured with the [`atom` property](https://prosemirror.net/docs/ref/#model.NodeSpec.atom)
      on a node's spec (typically used when the node is displayed as
      an uneditable [node view](https://prosemirror.net/docs/ref/#view.NodeView)).
      */
      get isAtom() { return this.type.isAtom; }
      /**
      Return a string representation of this node for debugging
      purposes.
      */
      toString() {
          if (this.type.spec.toDebugString)
              return this.type.spec.toDebugString(this);
          let name = this.type.name;
          if (this.content.size)
              name += "(" + this.content.toStringInner() + ")";
          return wrapMarks(this.marks, name);
      }
      /**
      Get the content match in this node at the given index.
      */
      contentMatchAt(index) {
          let match = this.type.contentMatch.matchFragment(this.content, 0, index);
          if (!match)
              throw new Error("Called contentMatchAt on a node with invalid content");
          return match;
      }
      /**
      Test whether replacing the range between `from` and `to` (by
      child index) with the given replacement fragment (which defaults
      to the empty fragment) would leave the node's content valid. You
      can optionally pass `start` and `end` indices into the
      replacement fragment.
      */
      canReplace(from, to, replacement = Fragment.empty, start = 0, end = replacement.childCount) {
          let one = this.contentMatchAt(from).matchFragment(replacement, start, end);
          let two = one && one.matchFragment(this.content, to);
          if (!two || !two.validEnd)
              return false;
          for (let i = start; i < end; i++)
              if (!this.type.allowsMarks(replacement.child(i).marks))
                  return false;
          return true;
      }
      /**
      Test whether replacing the range `from` to `to` (by index) with
      a node of the given type would leave the node's content valid.
      */
      canReplaceWith(from, to, type, marks) {
          if (marks && !this.type.allowsMarks(marks))
              return false;
          let start = this.contentMatchAt(from).matchType(type);
          let end = start && start.matchFragment(this.content, to);
          return end ? end.validEnd : false;
      }
      /**
      Test whether the given node's content could be appended to this
      node. If that node is empty, this will only return true if there
      is at least one node type that can appear in both nodes (to avoid
      merging completely incompatible nodes).
      */
      canAppend(other) {
          if (other.content.size)
              return this.canReplace(this.childCount, this.childCount, other.content);
          else
              return this.type.compatibleContent(other.type);
      }
      /**
      Check whether this node and its descendants conform to the
      schema, and raise error when they do not.
      */
      check() {
          this.type.checkContent(this.content);
          let copy = Mark.none;
          for (let i = 0; i < this.marks.length; i++)
              copy = this.marks[i].addToSet(copy);
          if (!Mark.sameSet(copy, this.marks))
              throw new RangeError(`Invalid collection of marks for node ${this.type.name}: ${this.marks.map(m => m.type.name)}`);
          this.content.forEach(node => node.check());
      }
      /**
      Return a JSON-serializeable representation of this node.
      */
      toJSON() {
          let obj = { type: this.type.name };
          for (let _ in this.attrs) {
              obj.attrs = this.attrs;
              break;
          }
          if (this.content.size)
              obj.content = this.content.toJSON();
          if (this.marks.length)
              obj.marks = this.marks.map(n => n.toJSON());
          return obj;
      }
      /**
      Deserialize a node from its JSON representation.
      */
      static fromJSON(schema, json) {
          if (!json)
              throw new RangeError("Invalid input for Node.fromJSON");
          let marks = null;
          if (json.marks) {
              if (!Array.isArray(json.marks))
                  throw new RangeError("Invalid mark data for Node.fromJSON");
              marks = json.marks.map(schema.markFromJSON);
          }
          if (json.type == "text") {
              if (typeof json.text != "string")
                  throw new RangeError("Invalid text node in JSON");
              return schema.text(json.text, marks);
          }
          let content = Fragment.fromJSON(schema, json.content);
          return schema.nodeType(json.type).create(json.attrs, content, marks);
      }
  }
  Node.prototype.text = undefined;
  class TextNode extends Node {
      /**
      @internal
      */
      constructor(type, attrs, content, marks) {
          super(type, attrs, null, marks);
          if (!content)
              throw new RangeError("Empty text nodes are not allowed");
          this.text = content;
      }
      toString() {
          if (this.type.spec.toDebugString)
              return this.type.spec.toDebugString(this);
          return wrapMarks(this.marks, JSON.stringify(this.text));
      }
      get textContent() { return this.text; }
      textBetween(from, to) { return this.text.slice(from, to); }
      get nodeSize() { return this.text.length; }
      mark(marks) {
          return marks == this.marks ? this : new TextNode(this.type, this.attrs, this.text, marks);
      }
      withText(text) {
          if (text == this.text)
              return this;
          return new TextNode(this.type, this.attrs, text, this.marks);
      }
      cut(from = 0, to = this.text.length) {
          if (from == 0 && to == this.text.length)
              return this;
          return this.withText(this.text.slice(from, to));
      }
      eq(other) {
          return this.sameMarkup(other) && this.text == other.text;
      }
      toJSON() {
          let base = super.toJSON();
          base.text = this.text;
          return base;
      }
  }
  function wrapMarks(marks, str) {
      for (let i = marks.length - 1; i >= 0; i--)
          str = marks[i].type.name + "(" + str + ")";
      return str;
  }

  /**
  Instances of this class represent a match state of a node type's
  [content expression](https://prosemirror.net/docs/ref/#model.NodeSpec.content), and can be used to
  find out whether further content matches here, and whether a given
  position is a valid end of the node.
  */
  class ContentMatch {
      /**
      @internal
      */
      constructor(
      /**
      True when this match state represents a valid end of the node.
      */
      validEnd) {
          this.validEnd = validEnd;
          /**
          @internal
          */
          this.next = [];
          /**
          @internal
          */
          this.wrapCache = [];
      }
      /**
      @internal
      */
      static parse(string, nodeTypes) {
          let stream = new TokenStream(string, nodeTypes);
          if (stream.next == null)
              return ContentMatch.empty;
          let expr = parseExpr(stream);
          if (stream.next)
              stream.err("Unexpected trailing text");
          let match = dfa(nfa(expr));
          checkForDeadEnds(match, stream);
          return match;
      }
      /**
      Match a node type, returning a match after that node if
      successful.
      */
      matchType(type) {
          for (let i = 0; i < this.next.length; i++)
              if (this.next[i].type == type)
                  return this.next[i].next;
          return null;
      }
      /**
      Try to match a fragment. Returns the resulting match when
      successful.
      */
      matchFragment(frag, start = 0, end = frag.childCount) {
          let cur = this;
          for (let i = start; cur && i < end; i++)
              cur = cur.matchType(frag.child(i).type);
          return cur;
      }
      /**
      @internal
      */
      get inlineContent() {
          return this.next.length != 0 && this.next[0].type.isInline;
      }
      /**
      Get the first matching node type at this match position that can
      be generated.
      */
      get defaultType() {
          for (let i = 0; i < this.next.length; i++) {
              let { type } = this.next[i];
              if (!(type.isText || type.hasRequiredAttrs()))
                  return type;
          }
          return null;
      }
      /**
      @internal
      */
      compatible(other) {
          for (let i = 0; i < this.next.length; i++)
              for (let j = 0; j < other.next.length; j++)
                  if (this.next[i].type == other.next[j].type)
                      return true;
          return false;
      }
      /**
      Try to match the given fragment, and if that fails, see if it can
      be made to match by inserting nodes in front of it. When
      successful, return a fragment of inserted nodes (which may be
      empty if nothing had to be inserted). When `toEnd` is true, only
      return a fragment if the resulting match goes to the end of the
      content expression.
      */
      fillBefore(after, toEnd = false, startIndex = 0) {
          let seen = [this];
          function search(match, types) {
              let finished = match.matchFragment(after, startIndex);
              if (finished && (!toEnd || finished.validEnd))
                  return Fragment.from(types.map(tp => tp.createAndFill()));
              for (let i = 0; i < match.next.length; i++) {
                  let { type, next } = match.next[i];
                  if (!(type.isText || type.hasRequiredAttrs()) && seen.indexOf(next) == -1) {
                      seen.push(next);
                      let found = search(next, types.concat(type));
                      if (found)
                          return found;
                  }
              }
              return null;
          }
          return search(this, []);
      }
      /**
      Find a set of wrapping node types that would allow a node of the
      given type to appear at this position. The result may be empty
      (when it fits directly) and will be null when no such wrapping
      exists.
      */
      findWrapping(target) {
          for (let i = 0; i < this.wrapCache.length; i += 2)
              if (this.wrapCache[i] == target)
                  return this.wrapCache[i + 1];
          let computed = this.computeWrapping(target);
          this.wrapCache.push(target, computed);
          return computed;
      }
      /**
      @internal
      */
      computeWrapping(target) {
          let seen = Object.create(null), active = [{ match: this, type: null, via: null }];
          while (active.length) {
              let current = active.shift(), match = current.match;
              if (match.matchType(target)) {
                  let result = [];
                  for (let obj = current; obj.type; obj = obj.via)
                      result.push(obj.type);
                  return result.reverse();
              }
              for (let i = 0; i < match.next.length; i++) {
                  let { type, next } = match.next[i];
                  if (!type.isLeaf && !type.hasRequiredAttrs() && !(type.name in seen) && (!current.type || next.validEnd)) {
                      active.push({ match: type.contentMatch, type, via: current });
                      seen[type.name] = true;
                  }
              }
          }
          return null;
      }
      /**
      The number of outgoing edges this node has in the finite
      automaton that describes the content expression.
      */
      get edgeCount() {
          return this.next.length;
      }
      /**
      Get the _n_​th outgoing edge from this node in the finite
      automaton that describes the content expression.
      */
      edge(n) {
          if (n >= this.next.length)
              throw new RangeError(`There's no ${n}th edge in this content match`);
          return this.next[n];
      }
      /**
      @internal
      */
      toString() {
          let seen = [];
          function scan(m) {
              seen.push(m);
              for (let i = 0; i < m.next.length; i++)
                  if (seen.indexOf(m.next[i].next) == -1)
                      scan(m.next[i].next);
          }
          scan(this);
          return seen.map((m, i) => {
              let out = i + (m.validEnd ? "*" : " ") + " ";
              for (let i = 0; i < m.next.length; i++)
                  out += (i ? ", " : "") + m.next[i].type.name + "->" + seen.indexOf(m.next[i].next);
              return out;
          }).join("\n");
      }
  }
  /**
  @internal
  */
  ContentMatch.empty = new ContentMatch(true);
  class TokenStream {
      constructor(string, nodeTypes) {
          this.string = string;
          this.nodeTypes = nodeTypes;
          this.inline = null;
          this.pos = 0;
          this.tokens = string.split(/\s*(?=\b|\W|$)/);
          if (this.tokens[this.tokens.length - 1] == "")
              this.tokens.pop();
          if (this.tokens[0] == "")
              this.tokens.shift();
      }
      get next() { return this.tokens[this.pos]; }
      eat(tok) { return this.next == tok && (this.pos++ || true); }
      err(str) { throw new SyntaxError(str + " (in content expression '" + this.string + "')"); }
  }
  function parseExpr(stream) {
      let exprs = [];
      do {
          exprs.push(parseExprSeq(stream));
      } while (stream.eat("|"));
      return exprs.length == 1 ? exprs[0] : { type: "choice", exprs };
  }
  function parseExprSeq(stream) {
      let exprs = [];
      do {
          exprs.push(parseExprSubscript(stream));
      } while (stream.next && stream.next != ")" && stream.next != "|");
      return exprs.length == 1 ? exprs[0] : { type: "seq", exprs };
  }
  function parseExprSubscript(stream) {
      let expr = parseExprAtom(stream);
      for (;;) {
          if (stream.eat("+"))
              expr = { type: "plus", expr };
          else if (stream.eat("*"))
              expr = { type: "star", expr };
          else if (stream.eat("?"))
              expr = { type: "opt", expr };
          else if (stream.eat("{"))
              expr = parseExprRange(stream, expr);
          else
              break;
      }
      return expr;
  }
  function parseNum(stream) {
      if (/\D/.test(stream.next))
          stream.err("Expected number, got '" + stream.next + "'");
      let result = Number(stream.next);
      stream.pos++;
      return result;
  }
  function parseExprRange(stream, expr) {
      let min = parseNum(stream), max = min;
      if (stream.eat(",")) {
          if (stream.next != "}")
              max = parseNum(stream);
          else
              max = -1;
      }
      if (!stream.eat("}"))
          stream.err("Unclosed braced range");
      return { type: "range", min, max, expr };
  }
  function resolveName(stream, name) {
      let types = stream.nodeTypes, type = types[name];
      if (type)
          return [type];
      let result = [];
      for (let typeName in types) {
          let type = types[typeName];
          if (type.groups.indexOf(name) > -1)
              result.push(type);
      }
      if (result.length == 0)
          stream.err("No node type or group '" + name + "' found");
      return result;
  }
  function parseExprAtom(stream) {
      if (stream.eat("(")) {
          let expr = parseExpr(stream);
          if (!stream.eat(")"))
              stream.err("Missing closing paren");
          return expr;
      }
      else if (!/\W/.test(stream.next)) {
          let exprs = resolveName(stream, stream.next).map(type => {
              if (stream.inline == null)
                  stream.inline = type.isInline;
              else if (stream.inline != type.isInline)
                  stream.err("Mixing inline and block content");
              return { type: "name", value: type };
          });
          stream.pos++;
          return exprs.length == 1 ? exprs[0] : { type: "choice", exprs };
      }
      else {
          stream.err("Unexpected token '" + stream.next + "'");
      }
  }
  /**
  Construct an NFA from an expression as returned by the parser. The
  NFA is represented as an array of states, which are themselves
  arrays of edges, which are `{term, to}` objects. The first state is
  the entry state and the last node is the success state.

  Note that unlike typical NFAs, the edge ordering in this one is
  significant, in that it is used to contruct filler content when
  necessary.
  */
  function nfa(expr) {
      let nfa = [[]];
      connect(compile(expr, 0), node());
      return nfa;
      function node() { return nfa.push([]) - 1; }
      function edge(from, to, term) {
          let edge = { term, to };
          nfa[from].push(edge);
          return edge;
      }
      function connect(edges, to) {
          edges.forEach(edge => edge.to = to);
      }
      function compile(expr, from) {
          if (expr.type == "choice") {
              return expr.exprs.reduce((out, expr) => out.concat(compile(expr, from)), []);
          }
          else if (expr.type == "seq") {
              for (let i = 0;; i++) {
                  let next = compile(expr.exprs[i], from);
                  if (i == expr.exprs.length - 1)
                      return next;
                  connect(next, from = node());
              }
          }
          else if (expr.type == "star") {
              let loop = node();
              edge(from, loop);
              connect(compile(expr.expr, loop), loop);
              return [edge(loop)];
          }
          else if (expr.type == "plus") {
              let loop = node();
              connect(compile(expr.expr, from), loop);
              connect(compile(expr.expr, loop), loop);
              return [edge(loop)];
          }
          else if (expr.type == "opt") {
              return [edge(from)].concat(compile(expr.expr, from));
          }
          else if (expr.type == "range") {
              let cur = from;
              for (let i = 0; i < expr.min; i++) {
                  let next = node();
                  connect(compile(expr.expr, cur), next);
                  cur = next;
              }
              if (expr.max == -1) {
                  connect(compile(expr.expr, cur), cur);
              }
              else {
                  for (let i = expr.min; i < expr.max; i++) {
                      let next = node();
                      edge(cur, next);
                      connect(compile(expr.expr, cur), next);
                      cur = next;
                  }
              }
              return [edge(cur)];
          }
          else if (expr.type == "name") {
              return [edge(from, undefined, expr.value)];
          }
          else {
              throw new Error("Unknown expr type");
          }
      }
  }
  function cmp(a, b) { return b - a; }
  // Get the set of nodes reachable by null edges from `node`. Omit
  // nodes with only a single null-out-edge, since they may lead to
  // needless duplicated nodes.
  function nullFrom(nfa, node) {
      let result = [];
      scan(node);
      return result.sort(cmp);
      function scan(node) {
          let edges = nfa[node];
          if (edges.length == 1 && !edges[0].term)
              return scan(edges[0].to);
          result.push(node);
          for (let i = 0; i < edges.length; i++) {
              let { term, to } = edges[i];
              if (!term && result.indexOf(to) == -1)
                  scan(to);
          }
      }
  }
  // Compiles an NFA as produced by `nfa` into a DFA, modeled as a set
  // of state objects (`ContentMatch` instances) with transitions
  // between them.
  function dfa(nfa) {
      let labeled = Object.create(null);
      return explore(nullFrom(nfa, 0));
      function explore(states) {
          let out = [];
          states.forEach(node => {
              nfa[node].forEach(({ term, to }) => {
                  if (!term)
                      return;
                  let set;
                  for (let i = 0; i < out.length; i++)
                      if (out[i][0] == term)
                          set = out[i][1];
                  nullFrom(nfa, to).forEach(node => {
                      if (!set)
                          out.push([term, set = []]);
                      if (set.indexOf(node) == -1)
                          set.push(node);
                  });
              });
          });
          let state = labeled[states.join(",")] = new ContentMatch(states.indexOf(nfa.length - 1) > -1);
          for (let i = 0; i < out.length; i++) {
              let states = out[i][1].sort(cmp);
              state.next.push({ type: out[i][0], next: labeled[states.join(",")] || explore(states) });
          }
          return state;
      }
  }
  function checkForDeadEnds(match, stream) {
      for (let i = 0, work = [match]; i < work.length; i++) {
          let state = work[i], dead = !state.validEnd, nodes = [];
          for (let j = 0; j < state.next.length; j++) {
              let { type, next } = state.next[j];
              nodes.push(type.name);
              if (dead && !(type.isText || type.hasRequiredAttrs()))
                  dead = false;
              if (work.indexOf(next) == -1)
                  work.push(next);
          }
          if (dead)
              stream.err("Only non-generatable nodes (" + nodes.join(", ") + ") in a required position (see https://prosemirror.net/docs/guide/#generatable)");
      }
  }

  // For node types where all attrs have a default value (or which don't
  // have any attributes), build up a single reusable default attribute
  // object, and use it for all nodes that don't specify specific
  // attributes.
  function defaultAttrs(attrs) {
      let defaults = Object.create(null);
      for (let attrName in attrs) {
          let attr = attrs[attrName];
          if (!attr.hasDefault)
              return null;
          defaults[attrName] = attr.default;
      }
      return defaults;
  }
  function computeAttrs(attrs, value) {
      let built = Object.create(null);
      for (let name in attrs) {
          let given = value && value[name];
          if (given === undefined) {
              let attr = attrs[name];
              if (attr.hasDefault)
                  given = attr.default;
              else
                  throw new RangeError("No value supplied for attribute " + name);
          }
          built[name] = given;
      }
      return built;
  }
  function initAttrs(attrs) {
      let result = Object.create(null);
      if (attrs)
          for (let name in attrs)
              result[name] = new Attribute(attrs[name]);
      return result;
  }
  /**
  Node types are objects allocated once per `Schema` and used to
  [tag](https://prosemirror.net/docs/ref/#model.Node.type) `Node` instances. They contain information
  about the node type, such as its name and what kind of node it
  represents.
  */
  let NodeType$1 = class NodeType {
      /**
      @internal
      */
      constructor(
      /**
      The name the node type has in this schema.
      */
      name, 
      /**
      A link back to the `Schema` the node type belongs to.
      */
      schema, 
      /**
      The spec that this type is based on
      */
      spec) {
          this.name = name;
          this.schema = schema;
          this.spec = spec;
          /**
          The set of marks allowed in this node. `null` means all marks
          are allowed.
          */
          this.markSet = null;
          this.groups = spec.group ? spec.group.split(" ") : [];
          this.attrs = initAttrs(spec.attrs);
          this.defaultAttrs = defaultAttrs(this.attrs);
          this.contentMatch = null;
          this.inlineContent = null;
          this.isBlock = !(spec.inline || name == "text");
          this.isText = name == "text";
      }
      /**
      True if this is an inline type.
      */
      get isInline() { return !this.isBlock; }
      /**
      True if this is a textblock type, a block that contains inline
      content.
      */
      get isTextblock() { return this.isBlock && this.inlineContent; }
      /**
      True for node types that allow no content.
      */
      get isLeaf() { return this.contentMatch == ContentMatch.empty; }
      /**
      True when this node is an atom, i.e. when it does not have
      directly editable content.
      */
      get isAtom() { return this.isLeaf || !!this.spec.atom; }
      /**
      The node type's [whitespace](https://prosemirror.net/docs/ref/#model.NodeSpec.whitespace) option.
      */
      get whitespace() {
          return this.spec.whitespace || (this.spec.code ? "pre" : "normal");
      }
      /**
      Tells you whether this node type has any required attributes.
      */
      hasRequiredAttrs() {
          for (let n in this.attrs)
              if (this.attrs[n].isRequired)
                  return true;
          return false;
      }
      /**
      Indicates whether this node allows some of the same content as
      the given node type.
      */
      compatibleContent(other) {
          return this == other || this.contentMatch.compatible(other.contentMatch);
      }
      /**
      @internal
      */
      computeAttrs(attrs) {
          if (!attrs && this.defaultAttrs)
              return this.defaultAttrs;
          else
              return computeAttrs(this.attrs, attrs);
      }
      /**
      Create a `Node` of this type. The given attributes are
      checked and defaulted (you can pass `null` to use the type's
      defaults entirely, if no required attributes exist). `content`
      may be a `Fragment`, a node, an array of nodes, or
      `null`. Similarly `marks` may be `null` to default to the empty
      set of marks.
      */
      create(attrs = null, content, marks) {
          if (this.isText)
              throw new Error("NodeType.create can't construct text nodes");
          return new Node(this, this.computeAttrs(attrs), Fragment.from(content), Mark.setFrom(marks));
      }
      /**
      Like [`create`](https://prosemirror.net/docs/ref/#model.NodeType.create), but check the given content
      against the node type's content restrictions, and throw an error
      if it doesn't match.
      */
      createChecked(attrs = null, content, marks) {
          content = Fragment.from(content);
          this.checkContent(content);
          return new Node(this, this.computeAttrs(attrs), content, Mark.setFrom(marks));
      }
      /**
      Like [`create`](https://prosemirror.net/docs/ref/#model.NodeType.create), but see if it is
      necessary to add nodes to the start or end of the given fragment
      to make it fit the node. If no fitting wrapping can be found,
      return null. Note that, due to the fact that required nodes can
      always be created, this will always succeed if you pass null or
      `Fragment.empty` as content.
      */
      createAndFill(attrs = null, content, marks) {
          attrs = this.computeAttrs(attrs);
          content = Fragment.from(content);
          if (content.size) {
              let before = this.contentMatch.fillBefore(content);
              if (!before)
                  return null;
              content = before.append(content);
          }
          let matched = this.contentMatch.matchFragment(content);
          let after = matched && matched.fillBefore(Fragment.empty, true);
          if (!after)
              return null;
          return new Node(this, attrs, content.append(after), Mark.setFrom(marks));
      }
      /**
      Returns true if the given fragment is valid content for this node
      type with the given attributes.
      */
      validContent(content) {
          let result = this.contentMatch.matchFragment(content);
          if (!result || !result.validEnd)
              return false;
          for (let i = 0; i < content.childCount; i++)
              if (!this.allowsMarks(content.child(i).marks))
                  return false;
          return true;
      }
      /**
      Throws a RangeError if the given fragment is not valid content for this
      node type.
      @internal
      */
      checkContent(content) {
          if (!this.validContent(content))
              throw new RangeError(`Invalid content for node ${this.name}: ${content.toString().slice(0, 50)}`);
      }
      /**
      Check whether the given mark type is allowed in this node.
      */
      allowsMarkType(markType) {
          return this.markSet == null || this.markSet.indexOf(markType) > -1;
      }
      /**
      Test whether the given set of marks are allowed in this node.
      */
      allowsMarks(marks) {
          if (this.markSet == null)
              return true;
          for (let i = 0; i < marks.length; i++)
              if (!this.allowsMarkType(marks[i].type))
                  return false;
          return true;
      }
      /**
      Removes the marks that are not allowed in this node from the given set.
      */
      allowedMarks(marks) {
          if (this.markSet == null)
              return marks;
          let copy;
          for (let i = 0; i < marks.length; i++) {
              if (!this.allowsMarkType(marks[i].type)) {
                  if (!copy)
                      copy = marks.slice(0, i);
              }
              else if (copy) {
                  copy.push(marks[i]);
              }
          }
          return !copy ? marks : copy.length ? copy : Mark.none;
      }
      /**
      @internal
      */
      static compile(nodes, schema) {
          let result = Object.create(null);
          nodes.forEach((name, spec) => result[name] = new NodeType(name, schema, spec));
          let topType = schema.spec.topNode || "doc";
          if (!result[topType])
              throw new RangeError("Schema is missing its top node type ('" + topType + "')");
          if (!result.text)
              throw new RangeError("Every schema needs a 'text' type");
          for (let _ in result.text.attrs)
              throw new RangeError("The text node type should not have attributes");
          return result;
      }
  };
  // Attribute descriptors
  class Attribute {
      constructor(options) {
          this.hasDefault = Object.prototype.hasOwnProperty.call(options, "default");
          this.default = options.default;
      }
      get isRequired() {
          return !this.hasDefault;
      }
  }
  // Marks
  /**
  Like nodes, marks (which are associated with nodes to signify
  things like emphasis or being part of a link) are
  [tagged](https://prosemirror.net/docs/ref/#model.Mark.type) with type objects, which are
  instantiated once per `Schema`.
  */
  class MarkType {
      /**
      @internal
      */
      constructor(
      /**
      The name of the mark type.
      */
      name, 
      /**
      @internal
      */
      rank, 
      /**
      The schema that this mark type instance is part of.
      */
      schema, 
      /**
      The spec on which the type is based.
      */
      spec) {
          this.name = name;
          this.rank = rank;
          this.schema = schema;
          this.spec = spec;
          this.attrs = initAttrs(spec.attrs);
          this.excluded = null;
          let defaults = defaultAttrs(this.attrs);
          this.instance = defaults ? new Mark(this, defaults) : null;
      }
      /**
      Create a mark of this type. `attrs` may be `null` or an object
      containing only some of the mark's attributes. The others, if
      they have defaults, will be added.
      */
      create(attrs = null) {
          if (!attrs && this.instance)
              return this.instance;
          return new Mark(this, computeAttrs(this.attrs, attrs));
      }
      /**
      @internal
      */
      static compile(marks, schema) {
          let result = Object.create(null), rank = 0;
          marks.forEach((name, spec) => result[name] = new MarkType(name, rank++, schema, spec));
          return result;
      }
      /**
      When there is a mark of this type in the given set, a new set
      without it is returned. Otherwise, the input set is returned.
      */
      removeFromSet(set) {
          for (var i = 0; i < set.length; i++)
              if (set[i].type == this) {
                  set = set.slice(0, i).concat(set.slice(i + 1));
                  i--;
              }
          return set;
      }
      /**
      Tests whether there is a mark of this type in the given set.
      */
      isInSet(set) {
          for (let i = 0; i < set.length; i++)
              if (set[i].type == this)
                  return set[i];
      }
      /**
      Queries whether a given mark type is
      [excluded](https://prosemirror.net/docs/ref/#model.MarkSpec.excludes) by this one.
      */
      excludes(other) {
          return this.excluded.indexOf(other) > -1;
      }
  }
  /**
  A document schema. Holds [node](https://prosemirror.net/docs/ref/#model.NodeType) and [mark
  type](https://prosemirror.net/docs/ref/#model.MarkType) objects for the nodes and marks that may
  occur in conforming documents, and provides functionality for
  creating and deserializing such documents.

  When given, the type parameters provide the names of the nodes and
  marks in this schema.
  */
  class Schema {
      /**
      Construct a schema from a schema [specification](https://prosemirror.net/docs/ref/#model.SchemaSpec).
      */
      constructor(spec) {
          /**
          An object for storing whatever values modules may want to
          compute and cache per schema. (If you want to store something
          in it, try to use property names unlikely to clash.)
          */
          this.cached = Object.create(null);
          let instanceSpec = this.spec = {};
          for (let prop in spec)
              instanceSpec[prop] = spec[prop];
          instanceSpec.nodes = OrderedMap.from(spec.nodes),
              instanceSpec.marks = OrderedMap.from(spec.marks || {}),
              this.nodes = NodeType$1.compile(this.spec.nodes, this);
          this.marks = MarkType.compile(this.spec.marks, this);
          let contentExprCache = Object.create(null);
          for (let prop in this.nodes) {
              if (prop in this.marks)
                  throw new RangeError(prop + " can not be both a node and a mark");
              let type = this.nodes[prop], contentExpr = type.spec.content || "", markExpr = type.spec.marks;
              type.contentMatch = contentExprCache[contentExpr] ||
                  (contentExprCache[contentExpr] = ContentMatch.parse(contentExpr, this.nodes));
              type.inlineContent = type.contentMatch.inlineContent;
              type.markSet = markExpr == "_" ? null :
                  markExpr ? gatherMarks(this, markExpr.split(" ")) :
                      markExpr == "" || !type.inlineContent ? [] : null;
          }
          for (let prop in this.marks) {
              let type = this.marks[prop], excl = type.spec.excludes;
              type.excluded = excl == null ? [type] : excl == "" ? [] : gatherMarks(this, excl.split(" "));
          }
          this.nodeFromJSON = this.nodeFromJSON.bind(this);
          this.markFromJSON = this.markFromJSON.bind(this);
          this.topNodeType = this.nodes[this.spec.topNode || "doc"];
          this.cached.wrappings = Object.create(null);
      }
      /**
      Create a node in this schema. The `type` may be a string or a
      `NodeType` instance. Attributes will be extended with defaults,
      `content` may be a `Fragment`, `null`, a `Node`, or an array of
      nodes.
      */
      node(type, attrs = null, content, marks) {
          if (typeof type == "string")
              type = this.nodeType(type);
          else if (!(type instanceof NodeType$1))
              throw new RangeError("Invalid node type: " + type);
          else if (type.schema != this)
              throw new RangeError("Node type from different schema used (" + type.name + ")");
          return type.createChecked(attrs, content, marks);
      }
      /**
      Create a text node in the schema. Empty text nodes are not
      allowed.
      */
      text(text, marks) {
          let type = this.nodes.text;
          return new TextNode(type, type.defaultAttrs, text, Mark.setFrom(marks));
      }
      /**
      Create a mark with the given type and attributes.
      */
      mark(type, attrs) {
          if (typeof type == "string")
              type = this.marks[type];
          return type.create(attrs);
      }
      /**
      Deserialize a node from its JSON representation. This method is
      bound.
      */
      nodeFromJSON(json) {
          return Node.fromJSON(this, json);
      }
      /**
      Deserialize a mark from its JSON representation. This method is
      bound.
      */
      markFromJSON(json) {
          return Mark.fromJSON(this, json);
      }
      /**
      @internal
      */
      nodeType(name) {
          let found = this.nodes[name];
          if (!found)
              throw new RangeError("Unknown node type: " + name);
          return found;
      }
  }
  function gatherMarks(schema, marks) {
      let found = [];
      for (let i = 0; i < marks.length; i++) {
          let name = marks[i], mark = schema.marks[name], ok = mark;
          if (mark) {
              found.push(mark);
          }
          else {
              for (let prop in schema.marks) {
                  let mark = schema.marks[prop];
                  if (name == "_" || (mark.spec.group && mark.spec.group.split(" ").indexOf(name) > -1))
                      found.push(ok = mark);
              }
          }
          if (!ok)
              throw new SyntaxError("Unknown mark type: '" + marks[i] + "'");
      }
      return found;
  }

  /**
  A DOM parser represents a strategy for parsing DOM content into a
  ProseMirror document conforming to a given schema. Its behavior is
  defined by an array of [rules](https://prosemirror.net/docs/ref/#model.ParseRule).
  */
  let DOMParser$1 = class DOMParser {
      /**
      Create a parser that targets the given schema, using the given
      parsing rules.
      */
      constructor(
      /**
      The schema into which the parser parses.
      */
      schema, 
      /**
      The set of [parse rules](https://prosemirror.net/docs/ref/#model.ParseRule) that the parser
      uses, in order of precedence.
      */
      rules) {
          this.schema = schema;
          this.rules = rules;
          /**
          @internal
          */
          this.tags = [];
          /**
          @internal
          */
          this.styles = [];
          rules.forEach(rule => {
              if (rule.tag)
                  this.tags.push(rule);
              else if (rule.style)
                  this.styles.push(rule);
          });
          // Only normalize list elements when lists in the schema can't directly contain themselves
          this.normalizeLists = !this.tags.some(r => {
              if (!/^(ul|ol)\b/.test(r.tag) || !r.node)
                  return false;
              let node = schema.nodes[r.node];
              return node.contentMatch.matchType(node);
          });
      }
      /**
      Parse a document from the content of a DOM node.
      */
      parse(dom, options = {}) {
          let context = new ParseContext(this, options, false);
          context.addAll(dom, options.from, options.to);
          return context.finish();
      }
      /**
      Parses the content of the given DOM node, like
      [`parse`](https://prosemirror.net/docs/ref/#model.DOMParser.parse), and takes the same set of
      options. But unlike that method, which produces a whole node,
      this one returns a slice that is open at the sides, meaning that
      the schema constraints aren't applied to the start of nodes to
      the left of the input and the end of nodes at the end.
      */
      parseSlice(dom, options = {}) {
          let context = new ParseContext(this, options, true);
          context.addAll(dom, options.from, options.to);
          return Slice.maxOpen(context.finish());
      }
      /**
      @internal
      */
      matchTag(dom, context, after) {
          for (let i = after ? this.tags.indexOf(after) + 1 : 0; i < this.tags.length; i++) {
              let rule = this.tags[i];
              if (matches(dom, rule.tag) &&
                  (rule.namespace === undefined || dom.namespaceURI == rule.namespace) &&
                  (!rule.context || context.matchesContext(rule.context))) {
                  if (rule.getAttrs) {
                      let result = rule.getAttrs(dom);
                      if (result === false)
                          continue;
                      rule.attrs = result || undefined;
                  }
                  return rule;
              }
          }
      }
      /**
      @internal
      */
      matchStyle(prop, value, context, after) {
          for (let i = after ? this.styles.indexOf(after) + 1 : 0; i < this.styles.length; i++) {
              let rule = this.styles[i], style = rule.style;
              if (style.indexOf(prop) != 0 ||
                  rule.context && !context.matchesContext(rule.context) ||
                  // Test that the style string either precisely matches the prop,
                  // or has an '=' sign after the prop, followed by the given
                  // value.
                  style.length > prop.length &&
                      (style.charCodeAt(prop.length) != 61 || style.slice(prop.length + 1) != value))
                  continue;
              if (rule.getAttrs) {
                  let result = rule.getAttrs(value);
                  if (result === false)
                      continue;
                  rule.attrs = result || undefined;
              }
              return rule;
          }
      }
      /**
      @internal
      */
      static schemaRules(schema) {
          let result = [];
          function insert(rule) {
              let priority = rule.priority == null ? 50 : rule.priority, i = 0;
              for (; i < result.length; i++) {
                  let next = result[i], nextPriority = next.priority == null ? 50 : next.priority;
                  if (nextPriority < priority)
                      break;
              }
              result.splice(i, 0, rule);
          }
          for (let name in schema.marks) {
              let rules = schema.marks[name].spec.parseDOM;
              if (rules)
                  rules.forEach(rule => {
                      insert(rule = copy(rule));
                      if (!(rule.mark || rule.ignore || rule.clearMark))
                          rule.mark = name;
                  });
          }
          for (let name in schema.nodes) {
              let rules = schema.nodes[name].spec.parseDOM;
              if (rules)
                  rules.forEach(rule => {
                      insert(rule = copy(rule));
                      if (!(rule.node || rule.ignore || rule.mark))
                          rule.node = name;
                  });
          }
          return result;
      }
      /**
      Construct a DOM parser using the parsing rules listed in a
      schema's [node specs](https://prosemirror.net/docs/ref/#model.NodeSpec.parseDOM), reordered by
      [priority](https://prosemirror.net/docs/ref/#model.ParseRule.priority).
      */
      static fromSchema(schema) {
          return schema.cached.domParser ||
              (schema.cached.domParser = new DOMParser(schema, DOMParser.schemaRules(schema)));
      }
  };
  const blockTags = {
      address: true, article: true, aside: true, blockquote: true, canvas: true,
      dd: true, div: true, dl: true, fieldset: true, figcaption: true, figure: true,
      footer: true, form: true, h1: true, h2: true, h3: true, h4: true, h5: true,
      h6: true, header: true, hgroup: true, hr: true, li: true, noscript: true, ol: true,
      output: true, p: true, pre: true, section: true, table: true, tfoot: true, ul: true
  };
  const ignoreTags = {
      head: true, noscript: true, object: true, script: true, style: true, title: true
  };
  const listTags = { ol: true, ul: true };
  // Using a bitfield for node context options
  const OPT_PRESERVE_WS = 1, OPT_PRESERVE_WS_FULL = 2, OPT_OPEN_LEFT = 4;
  function wsOptionsFor(type, preserveWhitespace, base) {
      if (preserveWhitespace != null)
          return (preserveWhitespace ? OPT_PRESERVE_WS : 0) |
              (preserveWhitespace === "full" ? OPT_PRESERVE_WS_FULL : 0);
      return type && type.whitespace == "pre" ? OPT_PRESERVE_WS | OPT_PRESERVE_WS_FULL : base & ~OPT_OPEN_LEFT;
  }
  class NodeContext {
      constructor(type, attrs, 
      // Marks applied to this node itself
      marks, 
      // Marks that can't apply here, but will be used in children if possible
      pendingMarks, solid, match, options) {
          this.type = type;
          this.attrs = attrs;
          this.marks = marks;
          this.pendingMarks = pendingMarks;
          this.solid = solid;
          this.options = options;
          this.content = [];
          // Marks applied to the node's children
          this.activeMarks = Mark.none;
          // Nested Marks with same type
          this.stashMarks = [];
          this.match = match || (options & OPT_OPEN_LEFT ? null : type.contentMatch);
      }
      findWrapping(node) {
          if (!this.match) {
              if (!this.type)
                  return [];
              let fill = this.type.contentMatch.fillBefore(Fragment.from(node));
              if (fill) {
                  this.match = this.type.contentMatch.matchFragment(fill);
              }
              else {
                  let start = this.type.contentMatch, wrap;
                  if (wrap = start.findWrapping(node.type)) {
                      this.match = start;
                      return wrap;
                  }
                  else {
                      return null;
                  }
              }
          }
          return this.match.findWrapping(node.type);
      }
      finish(openEnd) {
          if (!(this.options & OPT_PRESERVE_WS)) { // Strip trailing whitespace
              let last = this.content[this.content.length - 1], m;
              if (last && last.isText && (m = /[ \t\r\n\u000c]+$/.exec(last.text))) {
                  let text = last;
                  if (last.text.length == m[0].length)
                      this.content.pop();
                  else
                      this.content[this.content.length - 1] = text.withText(text.text.slice(0, text.text.length - m[0].length));
              }
          }
          let content = Fragment.from(this.content);
          if (!openEnd && this.match)
              content = content.append(this.match.fillBefore(Fragment.empty, true));
          return this.type ? this.type.create(this.attrs, content, this.marks) : content;
      }
      popFromStashMark(mark) {
          for (let i = this.stashMarks.length - 1; i >= 0; i--)
              if (mark.eq(this.stashMarks[i]))
                  return this.stashMarks.splice(i, 1)[0];
      }
      applyPending(nextType) {
          for (let i = 0, pending = this.pendingMarks; i < pending.length; i++) {
              let mark = pending[i];
              if ((this.type ? this.type.allowsMarkType(mark.type) : markMayApply(mark.type, nextType)) &&
                  !mark.isInSet(this.activeMarks)) {
                  this.activeMarks = mark.addToSet(this.activeMarks);
                  this.pendingMarks = mark.removeFromSet(this.pendingMarks);
              }
          }
      }
      inlineContext(node) {
          if (this.type)
              return this.type.inlineContent;
          if (this.content.length)
              return this.content[0].isInline;
          return node.parentNode && !blockTags.hasOwnProperty(node.parentNode.nodeName.toLowerCase());
      }
  }
  class ParseContext {
      constructor(
      // The parser we are using.
      parser, 
      // The options passed to this parse.
      options, isOpen) {
          this.parser = parser;
          this.options = options;
          this.isOpen = isOpen;
          this.open = 0;
          let topNode = options.topNode, topContext;
          let topOptions = wsOptionsFor(null, options.preserveWhitespace, 0) | (isOpen ? OPT_OPEN_LEFT : 0);
          if (topNode)
              topContext = new NodeContext(topNode.type, topNode.attrs, Mark.none, Mark.none, true, options.topMatch || topNode.type.contentMatch, topOptions);
          else if (isOpen)
              topContext = new NodeContext(null, null, Mark.none, Mark.none, true, null, topOptions);
          else
              topContext = new NodeContext(parser.schema.topNodeType, null, Mark.none, Mark.none, true, null, topOptions);
          this.nodes = [topContext];
          this.find = options.findPositions;
          this.needsBlock = false;
      }
      get top() {
          return this.nodes[this.open];
      }
      // Add a DOM node to the content. Text is inserted as text node,
      // otherwise, the node is passed to `addElement` or, if it has a
      // `style` attribute, `addElementWithStyles`.
      addDOM(dom) {
          if (dom.nodeType == 3) {
              this.addTextNode(dom);
          }
          else if (dom.nodeType == 1) {
              let style = dom.getAttribute("style");
              if (!style) {
                  this.addElement(dom);
              }
              else {
                  let marks = this.readStyles(parseStyles(style));
                  if (!marks)
                      return; // A style with ignore: true
                  let [addMarks, removeMarks] = marks, top = this.top;
                  for (let i = 0; i < removeMarks.length; i++)
                      this.removePendingMark(removeMarks[i], top);
                  for (let i = 0; i < addMarks.length; i++)
                      this.addPendingMark(addMarks[i]);
                  this.addElement(dom);
                  for (let i = 0; i < addMarks.length; i++)
                      this.removePendingMark(addMarks[i], top);
                  for (let i = 0; i < removeMarks.length; i++)
                      this.addPendingMark(removeMarks[i]);
              }
          }
      }
      addTextNode(dom) {
          let value = dom.nodeValue;
          let top = this.top;
          if (top.options & OPT_PRESERVE_WS_FULL ||
              top.inlineContext(dom) ||
              /[^ \t\r\n\u000c]/.test(value)) {
              if (!(top.options & OPT_PRESERVE_WS)) {
                  value = value.replace(/[ \t\r\n\u000c]+/g, " ");
                  // If this starts with whitespace, and there is no node before it, or
                  // a hard break, or a text node that ends with whitespace, strip the
                  // leading space.
                  if (/^[ \t\r\n\u000c]/.test(value) && this.open == this.nodes.length - 1) {
                      let nodeBefore = top.content[top.content.length - 1];
                      let domNodeBefore = dom.previousSibling;
                      if (!nodeBefore ||
                          (domNodeBefore && domNodeBefore.nodeName == 'BR') ||
                          (nodeBefore.isText && /[ \t\r\n\u000c]$/.test(nodeBefore.text)))
                          value = value.slice(1);
                  }
              }
              else if (!(top.options & OPT_PRESERVE_WS_FULL)) {
                  value = value.replace(/\r?\n|\r/g, " ");
              }
              else {
                  value = value.replace(/\r\n?/g, "\n");
              }
              if (value)
                  this.insertNode(this.parser.schema.text(value));
              this.findInText(dom);
          }
          else {
              this.findInside(dom);
          }
      }
      // Try to find a handler for the given tag and use that to parse. If
      // none is found, the element's content nodes are added directly.
      addElement(dom, matchAfter) {
          let name = dom.nodeName.toLowerCase(), ruleID;
          if (listTags.hasOwnProperty(name) && this.parser.normalizeLists)
              normalizeList(dom);
          let rule = (this.options.ruleFromNode && this.options.ruleFromNode(dom)) ||
              (ruleID = this.parser.matchTag(dom, this, matchAfter));
          if (rule ? rule.ignore : ignoreTags.hasOwnProperty(name)) {
              this.findInside(dom);
              this.ignoreFallback(dom);
          }
          else if (!rule || rule.skip || rule.closeParent) {
              if (rule && rule.closeParent)
                  this.open = Math.max(0, this.open - 1);
              else if (rule && rule.skip.nodeType)
                  dom = rule.skip;
              let sync, top = this.top, oldNeedsBlock = this.needsBlock;
              if (blockTags.hasOwnProperty(name)) {
                  if (top.content.length && top.content[0].isInline && this.open) {
                      this.open--;
                      top = this.top;
                  }
                  sync = true;
                  if (!top.type)
                      this.needsBlock = true;
              }
              else if (!dom.firstChild) {
                  this.leafFallback(dom);
                  return;
              }
              this.addAll(dom);
              if (sync)
                  this.sync(top);
              this.needsBlock = oldNeedsBlock;
          }
          else {
              this.addElementByRule(dom, rule, rule.consuming === false ? ruleID : undefined);
          }
      }
      // Called for leaf DOM nodes that would otherwise be ignored
      leafFallback(dom) {
          if (dom.nodeName == "BR" && this.top.type && this.top.type.inlineContent)
              this.addTextNode(dom.ownerDocument.createTextNode("\n"));
      }
      // Called for ignored nodes
      ignoreFallback(dom) {
          // Ignored BR nodes should at least create an inline context
          if (dom.nodeName == "BR" && (!this.top.type || !this.top.type.inlineContent))
              this.findPlace(this.parser.schema.text("-"));
      }
      // Run any style parser associated with the node's styles. Either
      // return an array of marks, or null to indicate some of the styles
      // had a rule with `ignore` set.
      readStyles(styles) {
          let add = Mark.none, remove = Mark.none;
          style: for (let i = 0; i < styles.length; i += 2) {
              for (let after = undefined;;) {
                  let rule = this.parser.matchStyle(styles[i], styles[i + 1], this, after);
                  if (!rule)
                      continue style;
                  if (rule.ignore)
                      return null;
                  if (rule.clearMark) {
                      this.top.pendingMarks.forEach(m => {
                          if (rule.clearMark(m))
                              remove = m.addToSet(remove);
                      });
                  }
                  else {
                      add = this.parser.schema.marks[rule.mark].create(rule.attrs).addToSet(add);
                  }
                  if (rule.consuming === false)
                      after = rule;
                  else
                      break;
              }
          }
          return [add, remove];
      }
      // Look up a handler for the given node. If none are found, return
      // false. Otherwise, apply it, use its return value to drive the way
      // the node's content is wrapped, and return true.
      addElementByRule(dom, rule, continueAfter) {
          let sync, nodeType, mark;
          if (rule.node) {
              nodeType = this.parser.schema.nodes[rule.node];
              if (!nodeType.isLeaf) {
                  sync = this.enter(nodeType, rule.attrs || null, rule.preserveWhitespace);
              }
              else if (!this.insertNode(nodeType.create(rule.attrs))) {
                  this.leafFallback(dom);
              }
          }
          else {
              let markType = this.parser.schema.marks[rule.mark];
              mark = markType.create(rule.attrs);
              this.addPendingMark(mark);
          }
          let startIn = this.top;
          if (nodeType && nodeType.isLeaf) {
              this.findInside(dom);
          }
          else if (continueAfter) {
              this.addElement(dom, continueAfter);
          }
          else if (rule.getContent) {
              this.findInside(dom);
              rule.getContent(dom, this.parser.schema).forEach(node => this.insertNode(node));
          }
          else {
              let contentDOM = dom;
              if (typeof rule.contentElement == "string")
                  contentDOM = dom.querySelector(rule.contentElement);
              else if (typeof rule.contentElement == "function")
                  contentDOM = rule.contentElement(dom);
              else if (rule.contentElement)
                  contentDOM = rule.contentElement;
              this.findAround(dom, contentDOM, true);
              this.addAll(contentDOM);
          }
          if (sync && this.sync(startIn))
              this.open--;
          if (mark)
              this.removePendingMark(mark, startIn);
      }
      // Add all child nodes between `startIndex` and `endIndex` (or the
      // whole node, if not given). If `sync` is passed, use it to
      // synchronize after every block element.
      addAll(parent, startIndex, endIndex) {
          let index = startIndex || 0;
          for (let dom = startIndex ? parent.childNodes[startIndex] : parent.firstChild, end = endIndex == null ? null : parent.childNodes[endIndex]; dom != end; dom = dom.nextSibling, ++index) {
              this.findAtPoint(parent, index);
              this.addDOM(dom);
          }
          this.findAtPoint(parent, index);
      }
      // Try to find a way to fit the given node type into the current
      // context. May add intermediate wrappers and/or leave non-solid
      // nodes that we're in.
      findPlace(node) {
          let route, sync;
          for (let depth = this.open; depth >= 0; depth--) {
              let cx = this.nodes[depth];
              let found = cx.findWrapping(node);
              if (found && (!route || route.length > found.length)) {
                  route = found;
                  sync = cx;
                  if (!found.length)
                      break;
              }
              if (cx.solid)
                  break;
          }
          if (!route)
              return false;
          this.sync(sync);
          for (let i = 0; i < route.length; i++)
              this.enterInner(route[i], null, false);
          return true;
      }
      // Try to insert the given node, adjusting the context when needed.
      insertNode(node) {
          if (node.isInline && this.needsBlock && !this.top.type) {
              let block = this.textblockFromContext();
              if (block)
                  this.enterInner(block);
          }
          if (this.findPlace(node)) {
              this.closeExtra();
              let top = this.top;
              top.applyPending(node.type);
              if (top.match)
                  top.match = top.match.matchType(node.type);
              let marks = top.activeMarks;
              for (let i = 0; i < node.marks.length; i++)
                  if (!top.type || top.type.allowsMarkType(node.marks[i].type))
                      marks = node.marks[i].addToSet(marks);
              top.content.push(node.mark(marks));
              return true;
          }
          return false;
      }
      // Try to start a node of the given type, adjusting the context when
      // necessary.
      enter(type, attrs, preserveWS) {
          let ok = this.findPlace(type.create(attrs));
          if (ok)
              this.enterInner(type, attrs, true, preserveWS);
          return ok;
      }
      // Open a node of the given type
      enterInner(type, attrs = null, solid = false, preserveWS) {
          this.closeExtra();
          let top = this.top;
          top.applyPending(type);
          top.match = top.match && top.match.matchType(type);
          let options = wsOptionsFor(type, preserveWS, top.options);
          if ((top.options & OPT_OPEN_LEFT) && top.content.length == 0)
              options |= OPT_OPEN_LEFT;
          this.nodes.push(new NodeContext(type, attrs, top.activeMarks, top.pendingMarks, solid, null, options));
          this.open++;
      }
      // Make sure all nodes above this.open are finished and added to
      // their parents
      closeExtra(openEnd = false) {
          let i = this.nodes.length - 1;
          if (i > this.open) {
              for (; i > this.open; i--)
                  this.nodes[i - 1].content.push(this.nodes[i].finish(openEnd));
              this.nodes.length = this.open + 1;
          }
      }
      finish() {
          this.open = 0;
          this.closeExtra(this.isOpen);
          return this.nodes[0].finish(this.isOpen || this.options.topOpen);
      }
      sync(to) {
          for (let i = this.open; i >= 0; i--)
              if (this.nodes[i] == to) {
                  this.open = i;
                  return true;
              }
          return false;
      }
      get currentPos() {
          this.closeExtra();
          let pos = 0;
          for (let i = this.open; i >= 0; i--) {
              let content = this.nodes[i].content;
              for (let j = content.length - 1; j >= 0; j--)
                  pos += content[j].nodeSize;
              if (i)
                  pos++;
          }
          return pos;
      }
      findAtPoint(parent, offset) {
          if (this.find)
              for (let i = 0; i < this.find.length; i++) {
                  if (this.find[i].node == parent && this.find[i].offset == offset)
                      this.find[i].pos = this.currentPos;
              }
      }
      findInside(parent) {
          if (this.find)
              for (let i = 0; i < this.find.length; i++) {
                  if (this.find[i].pos == null && parent.nodeType == 1 && parent.contains(this.find[i].node))
                      this.find[i].pos = this.currentPos;
              }
      }
      findAround(parent, content, before) {
          if (parent != content && this.find)
              for (let i = 0; i < this.find.length; i++) {
                  if (this.find[i].pos == null && parent.nodeType == 1 && parent.contains(this.find[i].node)) {
                      let pos = content.compareDocumentPosition(this.find[i].node);
                      if (pos & (before ? 2 : 4))
                          this.find[i].pos = this.currentPos;
                  }
              }
      }
      findInText(textNode) {
          if (this.find)
              for (let i = 0; i < this.find.length; i++) {
                  if (this.find[i].node == textNode)
                      this.find[i].pos = this.currentPos - (textNode.nodeValue.length - this.find[i].offset);
              }
      }
      // Determines whether the given context string matches this context.
      matchesContext(context) {
          if (context.indexOf("|") > -1)
              return context.split(/\s*\|\s*/).some(this.matchesContext, this);
          let parts = context.split("/");
          let option = this.options.context;
          let useRoot = !this.isOpen && (!option || option.parent.type == this.nodes[0].type);
          let minDepth = -(option ? option.depth + 1 : 0) + (useRoot ? 0 : 1);
          let match = (i, depth) => {
              for (; i >= 0; i--) {
                  let part = parts[i];
                  if (part == "") {
                      if (i == parts.length - 1 || i == 0)
                          continue;
                      for (; depth >= minDepth; depth--)
                          if (match(i - 1, depth))
                              return true;
                      return false;
                  }
                  else {
                      let next = depth > 0 || (depth == 0 && useRoot) ? this.nodes[depth].type
                          : option && depth >= minDepth ? option.node(depth - minDepth).type
                              : null;
                      if (!next || (next.name != part && next.groups.indexOf(part) == -1))
                          return false;
                      depth--;
                  }
              }
              return true;
          };
          return match(parts.length - 1, this.open);
      }
      textblockFromContext() {
          let $context = this.options.context;
          if ($context)
              for (let d = $context.depth; d >= 0; d--) {
                  let deflt = $context.node(d).contentMatchAt($context.indexAfter(d)).defaultType;
                  if (deflt && deflt.isTextblock && deflt.defaultAttrs)
                      return deflt;
              }
          for (let name in this.parser.schema.nodes) {
              let type = this.parser.schema.nodes[name];
              if (type.isTextblock && type.defaultAttrs)
                  return type;
          }
      }
      addPendingMark(mark) {
          let found = findSameMarkInSet(mark, this.top.pendingMarks);
          if (found)
              this.top.stashMarks.push(found);
          this.top.pendingMarks = mark.addToSet(this.top.pendingMarks);
      }
      removePendingMark(mark, upto) {
          for (let depth = this.open; depth >= 0; depth--) {
              let level = this.nodes[depth];
              let found = level.pendingMarks.lastIndexOf(mark);
              if (found > -1) {
                  level.pendingMarks = mark.removeFromSet(level.pendingMarks);
              }
              else {
                  level.activeMarks = mark.removeFromSet(level.activeMarks);
                  let stashMark = level.popFromStashMark(mark);
                  if (stashMark && level.type && level.type.allowsMarkType(stashMark.type))
                      level.activeMarks = stashMark.addToSet(level.activeMarks);
              }
              if (level == upto)
                  break;
          }
      }
  }
  // Kludge to work around directly nested list nodes produced by some
  // tools and allowed by browsers to mean that the nested list is
  // actually part of the list item above it.
  function normalizeList(dom) {
      for (let child = dom.firstChild, prevItem = null; child; child = child.nextSibling) {
          let name = child.nodeType == 1 ? child.nodeName.toLowerCase() : null;
          if (name && listTags.hasOwnProperty(name) && prevItem) {
              prevItem.appendChild(child);
              child = prevItem;
          }
          else if (name == "li") {
              prevItem = child;
          }
          else if (name) {
              prevItem = null;
          }
      }
  }
  // Apply a CSS selector.
  function matches(dom, selector) {
      return (dom.matches || dom.msMatchesSelector || dom.webkitMatchesSelector || dom.mozMatchesSelector).call(dom, selector);
  }
  // Tokenize a style attribute into property/value pairs.
  function parseStyles(style) {
      let re = /\s*([\w-]+)\s*:\s*([^;]+)/g, m, result = [];
      while (m = re.exec(style))
          result.push(m[1], m[2].trim());
      return result;
  }
  function copy(obj) {
      let copy = {};
      for (let prop in obj)
          copy[prop] = obj[prop];
      return copy;
  }
  // Used when finding a mark at the top level of a fragment parse.
  // Checks whether it would be reasonable to apply a given mark type to
  // a given node, by looking at the way the mark occurs in the schema.
  function markMayApply(markType, nodeType) {
      let nodes = nodeType.schema.nodes;
      for (let name in nodes) {
          let parent = nodes[name];
          if (!parent.allowsMarkType(markType))
              continue;
          let seen = [], scan = (match) => {
              seen.push(match);
              for (let i = 0; i < match.edgeCount; i++) {
                  let { type, next } = match.edge(i);
                  if (type == nodeType)
                      return true;
                  if (seen.indexOf(next) < 0 && scan(next))
                      return true;
              }
          };
          if (scan(parent.contentMatch))
              return true;
      }
  }
  function findSameMarkInSet(mark, set) {
      for (let i = 0; i < set.length; i++) {
          if (mark.eq(set[i]))
              return set[i];
      }
  }

  /**
  A DOM serializer knows how to convert ProseMirror nodes and
  marks of various types to DOM nodes.
  */
  class DOMSerializer {
      /**
      Create a serializer. `nodes` should map node names to functions
      that take a node and return a description of the corresponding
      DOM. `marks` does the same for mark names, but also gets an
      argument that tells it whether the mark's content is block or
      inline content (for typical use, it'll always be inline). A mark
      serializer may be `null` to indicate that marks of that type
      should not be serialized.
      */
      constructor(
      /**
      The node serialization functions.
      */
      nodes, 
      /**
      The mark serialization functions.
      */
      marks) {
          this.nodes = nodes;
          this.marks = marks;
      }
      /**
      Serialize the content of this fragment to a DOM fragment. When
      not in the browser, the `document` option, containing a DOM
      document, should be passed so that the serializer can create
      nodes.
      */
      serializeFragment(fragment, options = {}, target) {
          if (!target)
              target = doc$2(options).createDocumentFragment();
          let top = target, active = [];
          fragment.forEach(node => {
              if (active.length || node.marks.length) {
                  let keep = 0, rendered = 0;
                  while (keep < active.length && rendered < node.marks.length) {
                      let next = node.marks[rendered];
                      if (!this.marks[next.type.name]) {
                          rendered++;
                          continue;
                      }
                      if (!next.eq(active[keep][0]) || next.type.spec.spanning === false)
                          break;
                      keep++;
                      rendered++;
                  }
                  while (keep < active.length)
                      top = active.pop()[1];
                  while (rendered < node.marks.length) {
                      let add = node.marks[rendered++];
                      let markDOM = this.serializeMark(add, node.isInline, options);
                      if (markDOM) {
                          active.push([add, top]);
                          top.appendChild(markDOM.dom);
                          top = markDOM.contentDOM || markDOM.dom;
                      }
                  }
              }
              top.appendChild(this.serializeNodeInner(node, options));
          });
          return target;
      }
      /**
      @internal
      */
      serializeNodeInner(node, options) {
          let { dom, contentDOM } = DOMSerializer.renderSpec(doc$2(options), this.nodes[node.type.name](node));
          if (contentDOM) {
              if (node.isLeaf)
                  throw new RangeError("Content hole not allowed in a leaf node spec");
              this.serializeFragment(node.content, options, contentDOM);
          }
          return dom;
      }
      /**
      Serialize this node to a DOM node. This can be useful when you
      need to serialize a part of a document, as opposed to the whole
      document. To serialize a whole document, use
      [`serializeFragment`](https://prosemirror.net/docs/ref/#model.DOMSerializer.serializeFragment) on
      its [content](https://prosemirror.net/docs/ref/#model.Node.content).
      */
      serializeNode(node, options = {}) {
          let dom = this.serializeNodeInner(node, options);
          for (let i = node.marks.length - 1; i >= 0; i--) {
              let wrap = this.serializeMark(node.marks[i], node.isInline, options);
              if (wrap) {
                  (wrap.contentDOM || wrap.dom).appendChild(dom);
                  dom = wrap.dom;
              }
          }
          return dom;
      }
      /**
      @internal
      */
      serializeMark(mark, inline, options = {}) {
          let toDOM = this.marks[mark.type.name];
          return toDOM && DOMSerializer.renderSpec(doc$2(options), toDOM(mark, inline));
      }
      /**
      Render an [output spec](https://prosemirror.net/docs/ref/#model.DOMOutputSpec) to a DOM node. If
      the spec has a hole (zero) in it, `contentDOM` will point at the
      node with the hole.
      */
      static renderSpec(doc, structure, xmlNS = null) {
          if (typeof structure == "string")
              return { dom: doc.createTextNode(structure) };
          if (structure.nodeType != null)
              return { dom: structure };
          if (structure.dom && structure.dom.nodeType != null)
              return structure;
          let tagName = structure[0], space = tagName.indexOf(" ");
          if (space > 0) {
              xmlNS = tagName.slice(0, space);
              tagName = tagName.slice(space + 1);
          }
          let contentDOM;
          let dom = (xmlNS ? doc.createElementNS(xmlNS, tagName) : doc.createElement(tagName));
          let attrs = structure[1], start = 1;
          if (attrs && typeof attrs == "object" && attrs.nodeType == null && !Array.isArray(attrs)) {
              start = 2;
              for (let name in attrs)
                  if (attrs[name] != null) {
                      let space = name.indexOf(" ");
                      if (space > 0)
                          dom.setAttributeNS(name.slice(0, space), name.slice(space + 1), attrs[name]);
                      else
                          dom.setAttribute(name, attrs[name]);
                  }
          }
          for (let i = start; i < structure.length; i++) {
              let child = structure[i];
              if (child === 0) {
                  if (i < structure.length - 1 || i > start)
                      throw new RangeError("Content hole must be the only child of its parent node");
                  return { dom, contentDOM: dom };
              }
              else {
                  let { dom: inner, contentDOM: innerContent } = DOMSerializer.renderSpec(doc, child, xmlNS);
                  dom.appendChild(inner);
                  if (innerContent) {
                      if (contentDOM)
                          throw new RangeError("Multiple content holes");
                      contentDOM = innerContent;
                  }
              }
          }
          return { dom, contentDOM };
      }
      /**
      Build a serializer using the [`toDOM`](https://prosemirror.net/docs/ref/#model.NodeSpec.toDOM)
      properties in a schema's node and mark specs.
      */
      static fromSchema(schema) {
          return schema.cached.domSerializer ||
              (schema.cached.domSerializer = new DOMSerializer(this.nodesFromSchema(schema), this.marksFromSchema(schema)));
      }
      /**
      Gather the serializers in a schema's node specs into an object.
      This can be useful as a base to build a custom serializer from.
      */
      static nodesFromSchema(schema) {
          let result = gatherToDOM(schema.nodes);
          if (!result.text)
              result.text = node => node.text;
          return result;
      }
      /**
      Gather the serializers in a schema's mark specs into an object.
      */
      static marksFromSchema(schema) {
          return gatherToDOM(schema.marks);
      }
  }
  function gatherToDOM(obj) {
      let result = {};
      for (let name in obj) {
          let toDOM = obj[name].spec.toDOM;
          if (toDOM)
              result[name] = toDOM;
      }
      return result;
  }
  function doc$2(options) {
      return options.document || window.document;
  }

  // Recovery values encode a range index and an offset. They are
  // represented as numbers, because tons of them will be created when
  // mapping, for example, a large number of decorations. The number's
  // lower 16 bits provide the index, the remaining bits the offset.
  //
  // Note: We intentionally don't use bit shift operators to en- and
  // decode these, since those clip to 32 bits, which we might in rare
  // cases want to overflow. A 64-bit float can represent 48-bit
  // integers precisely.
  const lower16 = 0xffff;
  const factor16 = Math.pow(2, 16);
  function makeRecover(index, offset) { return index + offset * factor16; }
  function recoverIndex(value) { return value & lower16; }
  function recoverOffset(value) { return (value - (value & lower16)) / factor16; }
  const DEL_BEFORE = 1, DEL_AFTER = 2, DEL_ACROSS = 4, DEL_SIDE = 8;
  /**
  An object representing a mapped position with extra
  information.
  */
  class MapResult {
      /**
      @internal
      */
      constructor(
      /**
      The mapped version of the position.
      */
      pos, 
      /**
      @internal
      */
      delInfo, 
      /**
      @internal
      */
      recover) {
          this.pos = pos;
          this.delInfo = delInfo;
          this.recover = recover;
      }
      /**
      Tells you whether the position was deleted, that is, whether the
      step removed the token on the side queried (via the `assoc`)
      argument from the document.
      */
      get deleted() { return (this.delInfo & DEL_SIDE) > 0; }
      /**
      Tells you whether the token before the mapped position was deleted.
      */
      get deletedBefore() { return (this.delInfo & (DEL_BEFORE | DEL_ACROSS)) > 0; }
      /**
      True when the token after the mapped position was deleted.
      */
      get deletedAfter() { return (this.delInfo & (DEL_AFTER | DEL_ACROSS)) > 0; }
      /**
      Tells whether any of the steps mapped through deletes across the
      position (including both the token before and after the
      position).
      */
      get deletedAcross() { return (this.delInfo & DEL_ACROSS) > 0; }
  }
  /**
  A map describing the deletions and insertions made by a step, which
  can be used to find the correspondence between positions in the
  pre-step version of a document and the same position in the
  post-step version.
  */
  class StepMap {
      /**
      Create a position map. The modifications to the document are
      represented as an array of numbers, in which each group of three
      represents a modified chunk as `[start, oldSize, newSize]`.
      */
      constructor(
      /**
      @internal
      */
      ranges, 
      /**
      @internal
      */
      inverted = false) {
          this.ranges = ranges;
          this.inverted = inverted;
          if (!ranges.length && StepMap.empty)
              return StepMap.empty;
      }
      /**
      @internal
      */
      recover(value) {
          let diff = 0, index = recoverIndex(value);
          if (!this.inverted)
              for (let i = 0; i < index; i++)
                  diff += this.ranges[i * 3 + 2] - this.ranges[i * 3 + 1];
          return this.ranges[index * 3] + diff + recoverOffset(value);
      }
      mapResult(pos, assoc = 1) { return this._map(pos, assoc, false); }
      map(pos, assoc = 1) { return this._map(pos, assoc, true); }
      /**
      @internal
      */
      _map(pos, assoc, simple) {
          let diff = 0, oldIndex = this.inverted ? 2 : 1, newIndex = this.inverted ? 1 : 2;
          for (let i = 0; i < this.ranges.length; i += 3) {
              let start = this.ranges[i] - (this.inverted ? diff : 0);
              if (start > pos)
                  break;
              let oldSize = this.ranges[i + oldIndex], newSize = this.ranges[i + newIndex], end = start + oldSize;
              if (pos <= end) {
                  let side = !oldSize ? assoc : pos == start ? -1 : pos == end ? 1 : assoc;
                  let result = start + diff + (side < 0 ? 0 : newSize);
                  if (simple)
                      return result;
                  let recover = pos == (assoc < 0 ? start : end) ? null : makeRecover(i / 3, pos - start);
                  let del = pos == start ? DEL_AFTER : pos == end ? DEL_BEFORE : DEL_ACROSS;
                  if (assoc < 0 ? pos != start : pos != end)
                      del |= DEL_SIDE;
                  return new MapResult(result, del, recover);
              }
              diff += newSize - oldSize;
          }
          return simple ? pos + diff : new MapResult(pos + diff, 0, null);
      }
      /**
      @internal
      */
      touches(pos, recover) {
          let diff = 0, index = recoverIndex(recover);
          let oldIndex = this.inverted ? 2 : 1, newIndex = this.inverted ? 1 : 2;
          for (let i = 0; i < this.ranges.length; i += 3) {
              let start = this.ranges[i] - (this.inverted ? diff : 0);
              if (start > pos)
                  break;
              let oldSize = this.ranges[i + oldIndex], end = start + oldSize;
              if (pos <= end && i == index * 3)
                  return true;
              diff += this.ranges[i + newIndex] - oldSize;
          }
          return false;
      }
      /**
      Calls the given function on each of the changed ranges included in
      this map.
      */
      forEach(f) {
          let oldIndex = this.inverted ? 2 : 1, newIndex = this.inverted ? 1 : 2;
          for (let i = 0, diff = 0; i < this.ranges.length; i += 3) {
              let start = this.ranges[i], oldStart = start - (this.inverted ? diff : 0), newStart = start + (this.inverted ? 0 : diff);
              let oldSize = this.ranges[i + oldIndex], newSize = this.ranges[i + newIndex];
              f(oldStart, oldStart + oldSize, newStart, newStart + newSize);
              diff += newSize - oldSize;
          }
      }
      /**
      Create an inverted version of this map. The result can be used to
      map positions in the post-step document to the pre-step document.
      */
      invert() {
          return new StepMap(this.ranges, !this.inverted);
      }
      /**
      @internal
      */
      toString() {
          return (this.inverted ? "-" : "") + JSON.stringify(this.ranges);
      }
      /**
      Create a map that moves all positions by offset `n` (which may be
      negative). This can be useful when applying steps meant for a
      sub-document to a larger document, or vice-versa.
      */
      static offset(n) {
          return n == 0 ? StepMap.empty : new StepMap(n < 0 ? [0, -n, 0] : [0, 0, n]);
      }
  }
  /**
  A StepMap that contains no changed ranges.
  */
  StepMap.empty = new StepMap([]);
  /**
  A mapping represents a pipeline of zero or more [step
  maps](https://prosemirror.net/docs/ref/#transform.StepMap). It has special provisions for losslessly
  handling mapping positions through a series of steps in which some
  steps are inverted versions of earlier steps. (This comes up when
  ‘[rebasing](/docs/guide/#transform.rebasing)’ steps for
  collaboration or history management.)
  */
  class Mapping {
      /**
      Create a new mapping with the given position maps.
      */
      constructor(
      /**
      The step maps in this mapping.
      */
      maps = [], 
      /**
      @internal
      */
      mirror, 
      /**
      The starting position in the `maps` array, used when `map` or
      `mapResult` is called.
      */
      from = 0, 
      /**
      The end position in the `maps` array.
      */
      to = maps.length) {
          this.maps = maps;
          this.mirror = mirror;
          this.from = from;
          this.to = to;
      }
      /**
      Create a mapping that maps only through a part of this one.
      */
      slice(from = 0, to = this.maps.length) {
          return new Mapping(this.maps, this.mirror, from, to);
      }
      /**
      @internal
      */
      copy() {
          return new Mapping(this.maps.slice(), this.mirror && this.mirror.slice(), this.from, this.to);
      }
      /**
      Add a step map to the end of this mapping. If `mirrors` is
      given, it should be the index of the step map that is the mirror
      image of this one.
      */
      appendMap(map, mirrors) {
          this.to = this.maps.push(map);
          if (mirrors != null)
              this.setMirror(this.maps.length - 1, mirrors);
      }
      /**
      Add all the step maps in a given mapping to this one (preserving
      mirroring information).
      */
      appendMapping(mapping) {
          for (let i = 0, startSize = this.maps.length; i < mapping.maps.length; i++) {
              let mirr = mapping.getMirror(i);
              this.appendMap(mapping.maps[i], mirr != null && mirr < i ? startSize + mirr : undefined);
          }
      }
      /**
      Finds the offset of the step map that mirrors the map at the
      given offset, in this mapping (as per the second argument to
      `appendMap`).
      */
      getMirror(n) {
          if (this.mirror)
              for (let i = 0; i < this.mirror.length; i++)
                  if (this.mirror[i] == n)
                      return this.mirror[i + (i % 2 ? -1 : 1)];
      }
      /**
      @internal
      */
      setMirror(n, m) {
          if (!this.mirror)
              this.mirror = [];
          this.mirror.push(n, m);
      }
      /**
      Append the inverse of the given mapping to this one.
      */
      appendMappingInverted(mapping) {
          for (let i = mapping.maps.length - 1, totalSize = this.maps.length + mapping.maps.length; i >= 0; i--) {
              let mirr = mapping.getMirror(i);
              this.appendMap(mapping.maps[i].invert(), mirr != null && mirr > i ? totalSize - mirr - 1 : undefined);
          }
      }
      /**
      Create an inverted version of this mapping.
      */
      invert() {
          let inverse = new Mapping;
          inverse.appendMappingInverted(this);
          return inverse;
      }
      /**
      Map a position through this mapping.
      */
      map(pos, assoc = 1) {
          if (this.mirror)
              return this._map(pos, assoc, true);
          for (let i = this.from; i < this.to; i++)
              pos = this.maps[i].map(pos, assoc);
          return pos;
      }
      /**
      Map a position through this mapping, returning a mapping
      result.
      */
      mapResult(pos, assoc = 1) { return this._map(pos, assoc, false); }
      /**
      @internal
      */
      _map(pos, assoc, simple) {
          let delInfo = 0;
          for (let i = this.from; i < this.to; i++) {
              let map = this.maps[i], result = map.mapResult(pos, assoc);
              if (result.recover != null) {
                  let corr = this.getMirror(i);
                  if (corr != null && corr > i && corr < this.to) {
                      i = corr;
                      pos = this.maps[corr].recover(result.recover);
                      continue;
                  }
              }
              delInfo |= result.delInfo;
              pos = result.pos;
          }
          return simple ? pos : new MapResult(pos, delInfo, null);
      }
  }

  const stepsByID = Object.create(null);
  /**
  A step object represents an atomic change. It generally applies
  only to the document it was created for, since the positions
  stored in it will only make sense for that document.

  New steps are defined by creating classes that extend `Step`,
  overriding the `apply`, `invert`, `map`, `getMap` and `fromJSON`
  methods, and registering your class with a unique
  JSON-serialization identifier using
  [`Step.jsonID`](https://prosemirror.net/docs/ref/#transform.Step^jsonID).
  */
  class Step {
      /**
      Get the step map that represents the changes made by this step,
      and which can be used to transform between positions in the old
      and the new document.
      */
      getMap() { return StepMap.empty; }
      /**
      Try to merge this step with another one, to be applied directly
      after it. Returns the merged step when possible, null if the
      steps can't be merged.
      */
      merge(other) { return null; }
      /**
      Deserialize a step from its JSON representation. Will call
      through to the step class' own implementation of this method.
      */
      static fromJSON(schema, json) {
          if (!json || !json.stepType)
              throw new RangeError("Invalid input for Step.fromJSON");
          let type = stepsByID[json.stepType];
          if (!type)
              throw new RangeError(`No step type ${json.stepType} defined`);
          return type.fromJSON(schema, json);
      }
      /**
      To be able to serialize steps to JSON, each step needs a string
      ID to attach to its JSON representation. Use this method to
      register an ID for your step classes. Try to pick something
      that's unlikely to clash with steps from other modules.
      */
      static jsonID(id, stepClass) {
          if (id in stepsByID)
              throw new RangeError("Duplicate use of step JSON ID " + id);
          stepsByID[id] = stepClass;
          stepClass.prototype.jsonID = id;
          return stepClass;
      }
  }
  /**
  The result of [applying](https://prosemirror.net/docs/ref/#transform.Step.apply) a step. Contains either a
  new document or a failure value.
  */
  class StepResult {
      /**
      @internal
      */
      constructor(
      /**
      The transformed document, if successful.
      */
      doc, 
      /**
      The failure message, if unsuccessful.
      */
      failed) {
          this.doc = doc;
          this.failed = failed;
      }
      /**
      Create a successful step result.
      */
      static ok(doc) { return new StepResult(doc, null); }
      /**
      Create a failed step result.
      */
      static fail(message) { return new StepResult(null, message); }
      /**
      Call [`Node.replace`](https://prosemirror.net/docs/ref/#model.Node.replace) with the given
      arguments. Create a successful result if it succeeds, and a
      failed one if it throws a `ReplaceError`.
      */
      static fromReplace(doc, from, to, slice) {
          try {
              return StepResult.ok(doc.replace(from, to, slice));
          }
          catch (e) {
              if (e instanceof ReplaceError)
                  return StepResult.fail(e.message);
              throw e;
          }
      }
  }

  function mapFragment(fragment, f, parent) {
      let mapped = [];
      for (let i = 0; i < fragment.childCount; i++) {
          let child = fragment.child(i);
          if (child.content.size)
              child = child.copy(mapFragment(child.content, f, child));
          if (child.isInline)
              child = f(child, parent, i);
          mapped.push(child);
      }
      return Fragment.fromArray(mapped);
  }
  /**
  Add a mark to all inline content between two positions.
  */
  class AddMarkStep extends Step {
      /**
      Create a mark step.
      */
      constructor(
      /**
      The start of the marked range.
      */
      from, 
      /**
      The end of the marked range.
      */
      to, 
      /**
      The mark to add.
      */
      mark) {
          super();
          this.from = from;
          this.to = to;
          this.mark = mark;
      }
      apply(doc) {
          let oldSlice = doc.slice(this.from, this.to), $from = doc.resolve(this.from);
          let parent = $from.node($from.sharedDepth(this.to));
          let slice = new Slice(mapFragment(oldSlice.content, (node, parent) => {
              if (!node.isAtom || !parent.type.allowsMarkType(this.mark.type))
                  return node;
              return node.mark(this.mark.addToSet(node.marks));
          }, parent), oldSlice.openStart, oldSlice.openEnd);
          return StepResult.fromReplace(doc, this.from, this.to, slice);
      }
      invert() {
          return new RemoveMarkStep(this.from, this.to, this.mark);
      }
      map(mapping) {
          let from = mapping.mapResult(this.from, 1), to = mapping.mapResult(this.to, -1);
          if (from.deleted && to.deleted || from.pos >= to.pos)
              return null;
          return new AddMarkStep(from.pos, to.pos, this.mark);
      }
      merge(other) {
          if (other instanceof AddMarkStep &&
              other.mark.eq(this.mark) &&
              this.from <= other.to && this.to >= other.from)
              return new AddMarkStep(Math.min(this.from, other.from), Math.max(this.to, other.to), this.mark);
          return null;
      }
      toJSON() {
          return { stepType: "addMark", mark: this.mark.toJSON(),
              from: this.from, to: this.to };
      }
      /**
      @internal
      */
      static fromJSON(schema, json) {
          if (typeof json.from != "number" || typeof json.to != "number")
              throw new RangeError("Invalid input for AddMarkStep.fromJSON");
          return new AddMarkStep(json.from, json.to, schema.markFromJSON(json.mark));
      }
  }
  Step.jsonID("addMark", AddMarkStep);
  /**
  Remove a mark from all inline content between two positions.
  */
  class RemoveMarkStep extends Step {
      /**
      Create a mark-removing step.
      */
      constructor(
      /**
      The start of the unmarked range.
      */
      from, 
      /**
      The end of the unmarked range.
      */
      to, 
      /**
      The mark to remove.
      */
      mark) {
          super();
          this.from = from;
          this.to = to;
          this.mark = mark;
      }
      apply(doc) {
          let oldSlice = doc.slice(this.from, this.to);
          let slice = new Slice(mapFragment(oldSlice.content, node => {
              return node.mark(this.mark.removeFromSet(node.marks));
          }, doc), oldSlice.openStart, oldSlice.openEnd);
          return StepResult.fromReplace(doc, this.from, this.to, slice);
      }
      invert() {
          return new AddMarkStep(this.from, this.to, this.mark);
      }
      map(mapping) {
          let from = mapping.mapResult(this.from, 1), to = mapping.mapResult(this.to, -1);
          if (from.deleted && to.deleted || from.pos >= to.pos)
              return null;
          return new RemoveMarkStep(from.pos, to.pos, this.mark);
      }
      merge(other) {
          if (other instanceof RemoveMarkStep &&
              other.mark.eq(this.mark) &&
              this.from <= other.to && this.to >= other.from)
              return new RemoveMarkStep(Math.min(this.from, other.from), Math.max(this.to, other.to), this.mark);
          return null;
      }
      toJSON() {
          return { stepType: "removeMark", mark: this.mark.toJSON(),
              from: this.from, to: this.to };
      }
      /**
      @internal
      */
      static fromJSON(schema, json) {
          if (typeof json.from != "number" || typeof json.to != "number")
              throw new RangeError("Invalid input for RemoveMarkStep.fromJSON");
          return new RemoveMarkStep(json.from, json.to, schema.markFromJSON(json.mark));
      }
  }
  Step.jsonID("removeMark", RemoveMarkStep);
  /**
  Add a mark to a specific node.
  */
  class AddNodeMarkStep extends Step {
      /**
      Create a node mark step.
      */
      constructor(
      /**
      The position of the target node.
      */
      pos, 
      /**
      The mark to add.
      */
      mark) {
          super();
          this.pos = pos;
          this.mark = mark;
      }
      apply(doc) {
          let node = doc.nodeAt(this.pos);
          if (!node)
              return StepResult.fail("No node at mark step's position");
          let updated = node.type.create(node.attrs, null, this.mark.addToSet(node.marks));
          return StepResult.fromReplace(doc, this.pos, this.pos + 1, new Slice(Fragment.from(updated), 0, node.isLeaf ? 0 : 1));
      }
      invert(doc) {
          let node = doc.nodeAt(this.pos);
          if (node) {
              let newSet = this.mark.addToSet(node.marks);
              if (newSet.length == node.marks.length) {
                  for (let i = 0; i < node.marks.length; i++)
                      if (!node.marks[i].isInSet(newSet))
                          return new AddNodeMarkStep(this.pos, node.marks[i]);
                  return new AddNodeMarkStep(this.pos, this.mark);
              }
          }
          return new RemoveNodeMarkStep(this.pos, this.mark);
      }
      map(mapping) {
          let pos = mapping.mapResult(this.pos, 1);
          return pos.deletedAfter ? null : new AddNodeMarkStep(pos.pos, this.mark);
      }
      toJSON() {
          return { stepType: "addNodeMark", pos: this.pos, mark: this.mark.toJSON() };
      }
      /**
      @internal
      */
      static fromJSON(schema, json) {
          if (typeof json.pos != "number")
              throw new RangeError("Invalid input for AddNodeMarkStep.fromJSON");
          return new AddNodeMarkStep(json.pos, schema.markFromJSON(json.mark));
      }
  }
  Step.jsonID("addNodeMark", AddNodeMarkStep);
  /**
  Remove a mark from a specific node.
  */
  class RemoveNodeMarkStep extends Step {
      /**
      Create a mark-removing step.
      */
      constructor(
      /**
      The position of the target node.
      */
      pos, 
      /**
      The mark to remove.
      */
      mark) {
          super();
          this.pos = pos;
          this.mark = mark;
      }
      apply(doc) {
          let node = doc.nodeAt(this.pos);
          if (!node)
              return StepResult.fail("No node at mark step's position");
          let updated = node.type.create(node.attrs, null, this.mark.removeFromSet(node.marks));
          return StepResult.fromReplace(doc, this.pos, this.pos + 1, new Slice(Fragment.from(updated), 0, node.isLeaf ? 0 : 1));
      }
      invert(doc) {
          let node = doc.nodeAt(this.pos);
          if (!node || !this.mark.isInSet(node.marks))
              return this;
          return new AddNodeMarkStep(this.pos, this.mark);
      }
      map(mapping) {
          let pos = mapping.mapResult(this.pos, 1);
          return pos.deletedAfter ? null : new RemoveNodeMarkStep(pos.pos, this.mark);
      }
      toJSON() {
          return { stepType: "removeNodeMark", pos: this.pos, mark: this.mark.toJSON() };
      }
      /**
      @internal
      */
      static fromJSON(schema, json) {
          if (typeof json.pos != "number")
              throw new RangeError("Invalid input for RemoveNodeMarkStep.fromJSON");
          return new RemoveNodeMarkStep(json.pos, schema.markFromJSON(json.mark));
      }
  }
  Step.jsonID("removeNodeMark", RemoveNodeMarkStep);

  /**
  Replace a part of the document with a slice of new content.
  */
  class ReplaceStep extends Step {
      /**
      The given `slice` should fit the 'gap' between `from` and
      `to`—the depths must line up, and the surrounding nodes must be
      able to be joined with the open sides of the slice. When
      `structure` is true, the step will fail if the content between
      from and to is not just a sequence of closing and then opening
      tokens (this is to guard against rebased replace steps
      overwriting something they weren't supposed to).
      */
      constructor(
      /**
      The start position of the replaced range.
      */
      from, 
      /**
      The end position of the replaced range.
      */
      to, 
      /**
      The slice to insert.
      */
      slice, 
      /**
      @internal
      */
      structure = false) {
          super();
          this.from = from;
          this.to = to;
          this.slice = slice;
          this.structure = structure;
      }
      apply(doc) {
          if (this.structure && contentBetween(doc, this.from, this.to))
              return StepResult.fail("Structure replace would overwrite content");
          return StepResult.fromReplace(doc, this.from, this.to, this.slice);
      }
      getMap() {
          return new StepMap([this.from, this.to - this.from, this.slice.size]);
      }
      invert(doc) {
          return new ReplaceStep(this.from, this.from + this.slice.size, doc.slice(this.from, this.to));
      }
      map(mapping) {
          let from = mapping.mapResult(this.from, 1), to = mapping.mapResult(this.to, -1);
          if (from.deletedAcross && to.deletedAcross)
              return null;
          return new ReplaceStep(from.pos, Math.max(from.pos, to.pos), this.slice);
      }
      merge(other) {
          if (!(other instanceof ReplaceStep) || other.structure || this.structure)
              return null;
          if (this.from + this.slice.size == other.from && !this.slice.openEnd && !other.slice.openStart) {
              let slice = this.slice.size + other.slice.size == 0 ? Slice.empty
                  : new Slice(this.slice.content.append(other.slice.content), this.slice.openStart, other.slice.openEnd);
              return new ReplaceStep(this.from, this.to + (other.to - other.from), slice, this.structure);
          }
          else if (other.to == this.from && !this.slice.openStart && !other.slice.openEnd) {
              let slice = this.slice.size + other.slice.size == 0 ? Slice.empty
                  : new Slice(other.slice.content.append(this.slice.content), other.slice.openStart, this.slice.openEnd);
              return new ReplaceStep(other.from, this.to, slice, this.structure);
          }
          else {
              return null;
          }
      }
      toJSON() {
          let json = { stepType: "replace", from: this.from, to: this.to };
          if (this.slice.size)
              json.slice = this.slice.toJSON();
          if (this.structure)
              json.structure = true;
          return json;
      }
      /**
      @internal
      */
      static fromJSON(schema, json) {
          if (typeof json.from != "number" || typeof json.to != "number")
              throw new RangeError("Invalid input for ReplaceStep.fromJSON");
          return new ReplaceStep(json.from, json.to, Slice.fromJSON(schema, json.slice), !!json.structure);
      }
  }
  Step.jsonID("replace", ReplaceStep);
  /**
  Replace a part of the document with a slice of content, but
  preserve a range of the replaced content by moving it into the
  slice.
  */
  class ReplaceAroundStep extends Step {
      /**
      Create a replace-around step with the given range and gap.
      `insert` should be the point in the slice into which the content
      of the gap should be moved. `structure` has the same meaning as
      it has in the [`ReplaceStep`](https://prosemirror.net/docs/ref/#transform.ReplaceStep) class.
      */
      constructor(
      /**
      The start position of the replaced range.
      */
      from, 
      /**
      The end position of the replaced range.
      */
      to, 
      /**
      The start of preserved range.
      */
      gapFrom, 
      /**
      The end of preserved range.
      */
      gapTo, 
      /**
      The slice to insert.
      */
      slice, 
      /**
      The position in the slice where the preserved range should be
      inserted.
      */
      insert, 
      /**
      @internal
      */
      structure = false) {
          super();
          this.from = from;
          this.to = to;
          this.gapFrom = gapFrom;
          this.gapTo = gapTo;
          this.slice = slice;
          this.insert = insert;
          this.structure = structure;
      }
      apply(doc) {
          if (this.structure && (contentBetween(doc, this.from, this.gapFrom) ||
              contentBetween(doc, this.gapTo, this.to)))
              return StepResult.fail("Structure gap-replace would overwrite content");
          let gap = doc.slice(this.gapFrom, this.gapTo);
          if (gap.openStart || gap.openEnd)
              return StepResult.fail("Gap is not a flat range");
          let inserted = this.slice.insertAt(this.insert, gap.content);
          if (!inserted)
              return StepResult.fail("Content does not fit in gap");
          return StepResult.fromReplace(doc, this.from, this.to, inserted);
      }
      getMap() {
          return new StepMap([this.from, this.gapFrom - this.from, this.insert,
              this.gapTo, this.to - this.gapTo, this.slice.size - this.insert]);
      }
      invert(doc) {
          let gap = this.gapTo - this.gapFrom;
          return new ReplaceAroundStep(this.from, this.from + this.slice.size + gap, this.from + this.insert, this.from + this.insert + gap, doc.slice(this.from, this.to).removeBetween(this.gapFrom - this.from, this.gapTo - this.from), this.gapFrom - this.from, this.structure);
      }
      map(mapping) {
          let from = mapping.mapResult(this.from, 1), to = mapping.mapResult(this.to, -1);
          let gapFrom = mapping.map(this.gapFrom, -1), gapTo = mapping.map(this.gapTo, 1);
          if ((from.deletedAcross && to.deletedAcross) || gapFrom < from.pos || gapTo > to.pos)
              return null;
          return new ReplaceAroundStep(from.pos, to.pos, gapFrom, gapTo, this.slice, this.insert, this.structure);
      }
      toJSON() {
          let json = { stepType: "replaceAround", from: this.from, to: this.to,
              gapFrom: this.gapFrom, gapTo: this.gapTo, insert: this.insert };
          if (this.slice.size)
              json.slice = this.slice.toJSON();
          if (this.structure)
              json.structure = true;
          return json;
      }
      /**
      @internal
      */
      static fromJSON(schema, json) {
          if (typeof json.from != "number" || typeof json.to != "number" ||
              typeof json.gapFrom != "number" || typeof json.gapTo != "number" || typeof json.insert != "number")
              throw new RangeError("Invalid input for ReplaceAroundStep.fromJSON");
          return new ReplaceAroundStep(json.from, json.to, json.gapFrom, json.gapTo, Slice.fromJSON(schema, json.slice), json.insert, !!json.structure);
      }
  }
  Step.jsonID("replaceAround", ReplaceAroundStep);
  function contentBetween(doc, from, to) {
      let $from = doc.resolve(from), dist = to - from, depth = $from.depth;
      while (dist > 0 && depth > 0 && $from.indexAfter(depth) == $from.node(depth).childCount) {
          depth--;
          dist--;
      }
      if (dist > 0) {
          let next = $from.node(depth).maybeChild($from.indexAfter(depth));
          while (dist > 0) {
              if (!next || next.isLeaf)
                  return true;
              next = next.firstChild;
              dist--;
          }
      }
      return false;
  }

  function addMark(tr, from, to, mark) {
      let removed = [], added = [];
      let removing, adding;
      tr.doc.nodesBetween(from, to, (node, pos, parent) => {
          if (!node.isInline)
              return;
          let marks = node.marks;
          if (!mark.isInSet(marks) && parent.type.allowsMarkType(mark.type)) {
              let start = Math.max(pos, from), end = Math.min(pos + node.nodeSize, to);
              let newSet = mark.addToSet(marks);
              for (let i = 0; i < marks.length; i++) {
                  if (!marks[i].isInSet(newSet)) {
                      if (removing && removing.to == start && removing.mark.eq(marks[i]))
                          removing.to = end;
                      else
                          removed.push(removing = new RemoveMarkStep(start, end, marks[i]));
                  }
              }
              if (adding && adding.to == start)
                  adding.to = end;
              else
                  added.push(adding = new AddMarkStep(start, end, mark));
          }
      });
      removed.forEach(s => tr.step(s));
      added.forEach(s => tr.step(s));
  }
  function removeMark(tr, from, to, mark) {
      let matched = [], step = 0;
      tr.doc.nodesBetween(from, to, (node, pos) => {
          if (!node.isInline)
              return;
          step++;
          let toRemove = null;
          if (mark instanceof MarkType) {
              let set = node.marks, found;
              while (found = mark.isInSet(set)) {
                  (toRemove || (toRemove = [])).push(found);
                  set = found.removeFromSet(set);
              }
          }
          else if (mark) {
              if (mark.isInSet(node.marks))
                  toRemove = [mark];
          }
          else {
              toRemove = node.marks;
          }
          if (toRemove && toRemove.length) {
              let end = Math.min(pos + node.nodeSize, to);
              for (let i = 0; i < toRemove.length; i++) {
                  let style = toRemove[i], found;
                  for (let j = 0; j < matched.length; j++) {
                      let m = matched[j];
                      if (m.step == step - 1 && style.eq(matched[j].style))
                          found = m;
                  }
                  if (found) {
                      found.to = end;
                      found.step = step;
                  }
                  else {
                      matched.push({ style, from: Math.max(pos, from), to: end, step });
                  }
              }
          }
      });
      matched.forEach(m => tr.step(new RemoveMarkStep(m.from, m.to, m.style)));
  }
  function clearIncompatible(tr, pos, parentType, match = parentType.contentMatch) {
      let node = tr.doc.nodeAt(pos);
      let delSteps = [], cur = pos + 1;
      for (let i = 0; i < node.childCount; i++) {
          let child = node.child(i), end = cur + child.nodeSize;
          let allowed = match.matchType(child.type);
          if (!allowed) {
              delSteps.push(new ReplaceStep(cur, end, Slice.empty));
          }
          else {
              match = allowed;
              for (let j = 0; j < child.marks.length; j++)
                  if (!parentType.allowsMarkType(child.marks[j].type))
                      tr.step(new RemoveMarkStep(cur, end, child.marks[j]));
          }
          cur = end;
      }
      if (!match.validEnd) {
          let fill = match.fillBefore(Fragment.empty, true);
          tr.replace(cur, cur, new Slice(fill, 0, 0));
      }
      for (let i = delSteps.length - 1; i >= 0; i--)
          tr.step(delSteps[i]);
  }

  function canCut(node, start, end) {
      return (start == 0 || node.canReplace(start, node.childCount)) &&
          (end == node.childCount || node.canReplace(0, end));
  }
  /**
  Try to find a target depth to which the content in the given range
  can be lifted. Will not go across
  [isolating](https://prosemirror.net/docs/ref/#model.NodeSpec.isolating) parent nodes.
  */
  function liftTarget(range) {
      let parent = range.parent;
      let content = parent.content.cutByIndex(range.startIndex, range.endIndex);
      for (let depth = range.depth;; --depth) {
          let node = range.$from.node(depth);
          let index = range.$from.index(depth), endIndex = range.$to.indexAfter(depth);
          if (depth < range.depth && node.canReplace(index, endIndex, content))
              return depth;
          if (depth == 0 || node.type.spec.isolating || !canCut(node, index, endIndex))
              break;
      }
      return null;
  }
  function lift$1(tr, range, target) {
      let { $from, $to, depth } = range;
      let gapStart = $from.before(depth + 1), gapEnd = $to.after(depth + 1);
      let start = gapStart, end = gapEnd;
      let before = Fragment.empty, openStart = 0;
      for (let d = depth, splitting = false; d > target; d--)
          if (splitting || $from.index(d) > 0) {
              splitting = true;
              before = Fragment.from($from.node(d).copy(before));
              openStart++;
          }
          else {
              start--;
          }
      let after = Fragment.empty, openEnd = 0;
      for (let d = depth, splitting = false; d > target; d--)
          if (splitting || $to.after(d + 1) < $to.end(d)) {
              splitting = true;
              after = Fragment.from($to.node(d).copy(after));
              openEnd++;
          }
          else {
              end++;
          }
      tr.step(new ReplaceAroundStep(start, end, gapStart, gapEnd, new Slice(before.append(after), openStart, openEnd), before.size - openStart, true));
  }
  /**
  Try to find a valid way to wrap the content in the given range in a
  node of the given type. May introduce extra nodes around and inside
  the wrapper node, if necessary. Returns null if no valid wrapping
  could be found. When `innerRange` is given, that range's content is
  used as the content to fit into the wrapping, instead of the
  content of `range`.
  */
  function findWrapping(range, nodeType, attrs = null, innerRange = range) {
      let around = findWrappingOutside(range, nodeType);
      let inner = around && findWrappingInside(innerRange, nodeType);
      if (!inner)
          return null;
      return around.map(withAttrs)
          .concat({ type: nodeType, attrs }).concat(inner.map(withAttrs));
  }
  function withAttrs(type) { return { type, attrs: null }; }
  function findWrappingOutside(range, type) {
      let { parent, startIndex, endIndex } = range;
      let around = parent.contentMatchAt(startIndex).findWrapping(type);
      if (!around)
          return null;
      let outer = around.length ? around[0] : type;
      return parent.canReplaceWith(startIndex, endIndex, outer) ? around : null;
  }
  function findWrappingInside(range, type) {
      let { parent, startIndex, endIndex } = range;
      let inner = parent.child(startIndex);
      let inside = type.contentMatch.findWrapping(inner.type);
      if (!inside)
          return null;
      let lastType = inside.length ? inside[inside.length - 1] : type;
      let innerMatch = lastType.contentMatch;
      for (let i = startIndex; innerMatch && i < endIndex; i++)
          innerMatch = innerMatch.matchType(parent.child(i).type);
      if (!innerMatch || !innerMatch.validEnd)
          return null;
      return inside;
  }
  function wrap(tr, range, wrappers) {
      let content = Fragment.empty;
      for (let i = wrappers.length - 1; i >= 0; i--) {
          if (content.size) {
              let match = wrappers[i].type.contentMatch.matchFragment(content);
              if (!match || !match.validEnd)
                  throw new RangeError("Wrapper type given to Transform.wrap does not form valid content of its parent wrapper");
          }
          content = Fragment.from(wrappers[i].type.create(wrappers[i].attrs, content));
      }
      let start = range.start, end = range.end;
      tr.step(new ReplaceAroundStep(start, end, start, end, new Slice(content, 0, 0), wrappers.length, true));
  }
  function setBlockType$1(tr, from, to, type, attrs) {
      if (!type.isTextblock)
          throw new RangeError("Type given to setBlockType should be a textblock");
      let mapFrom = tr.steps.length;
      tr.doc.nodesBetween(from, to, (node, pos) => {
          if (node.isTextblock && !node.hasMarkup(type, attrs) && canChangeType(tr.doc, tr.mapping.slice(mapFrom).map(pos), type)) {
              // Ensure all markup that isn't allowed in the new node type is cleared
              tr.clearIncompatible(tr.mapping.slice(mapFrom).map(pos, 1), type);
              let mapping = tr.mapping.slice(mapFrom);
              let startM = mapping.map(pos, 1), endM = mapping.map(pos + node.nodeSize, 1);
              tr.step(new ReplaceAroundStep(startM, endM, startM + 1, endM - 1, new Slice(Fragment.from(type.create(attrs, null, node.marks)), 0, 0), 1, true));
              return false;
          }
      });
  }
  function canChangeType(doc, pos, type) {
      let $pos = doc.resolve(pos), index = $pos.index();
      return $pos.parent.canReplaceWith(index, index + 1, type);
  }
  /**
  Change the type, attributes, and/or marks of the node at `pos`.
  When `type` isn't given, the existing node type is preserved,
  */
  function setNodeMarkup(tr, pos, type, attrs, marks) {
      let node = tr.doc.nodeAt(pos);
      if (!node)
          throw new RangeError("No node at given position");
      if (!type)
          type = node.type;
      let newNode = type.create(attrs, null, marks || node.marks);
      if (node.isLeaf)
          return tr.replaceWith(pos, pos + node.nodeSize, newNode);
      if (!type.validContent(node.content))
          throw new RangeError("Invalid content for node type " + type.name);
      tr.step(new ReplaceAroundStep(pos, pos + node.nodeSize, pos + 1, pos + node.nodeSize - 1, new Slice(Fragment.from(newNode), 0, 0), 1, true));
  }
  /**
  Check whether splitting at the given position is allowed.
  */
  function canSplit(doc, pos, depth = 1, typesAfter) {
      let $pos = doc.resolve(pos), base = $pos.depth - depth;
      let innerType = (typesAfter && typesAfter[typesAfter.length - 1]) || $pos.parent;
      if (base < 0 || $pos.parent.type.spec.isolating ||
          !$pos.parent.canReplace($pos.index(), $pos.parent.childCount) ||
          !innerType.type.validContent($pos.parent.content.cutByIndex($pos.index(), $pos.parent.childCount)))
          return false;
      for (let d = $pos.depth - 1, i = depth - 2; d > base; d--, i--) {
          let node = $pos.node(d), index = $pos.index(d);
          if (node.type.spec.isolating)
              return false;
          let rest = node.content.cutByIndex(index, node.childCount);
          let after = (typesAfter && typesAfter[i]) || node;
          if (after != node)
              rest = rest.replaceChild(0, after.type.create(after.attrs));
          if (!node.canReplace(index + 1, node.childCount) || !after.type.validContent(rest))
              return false;
      }
      let index = $pos.indexAfter(base);
      let baseType = typesAfter && typesAfter[0];
      return $pos.node(base).canReplaceWith(index, index, baseType ? baseType.type : $pos.node(base + 1).type);
  }
  function split(tr, pos, depth = 1, typesAfter) {
      let $pos = tr.doc.resolve(pos), before = Fragment.empty, after = Fragment.empty;
      for (let d = $pos.depth, e = $pos.depth - depth, i = depth - 1; d > e; d--, i--) {
          before = Fragment.from($pos.node(d).copy(before));
          let typeAfter = typesAfter && typesAfter[i];
          after = Fragment.from(typeAfter ? typeAfter.type.create(typeAfter.attrs, after) : $pos.node(d).copy(after));
      }
      tr.step(new ReplaceStep(pos, pos, new Slice(before.append(after), depth, depth), true));
  }
  /**
  Test whether the blocks before and after a given position can be
  joined.
  */
  function canJoin(doc, pos) {
      let $pos = doc.resolve(pos), index = $pos.index();
      return joinable($pos.nodeBefore, $pos.nodeAfter) &&
          $pos.parent.canReplace(index, index + 1);
  }
  function joinable(a, b) {
      return !!(a && b && !a.isLeaf && a.canAppend(b));
  }
  /**
  Find an ancestor of the given position that can be joined to the
  block before (or after if `dir` is positive). Returns the joinable
  point, if any.
  */
  function joinPoint(doc, pos, dir = -1) {
      let $pos = doc.resolve(pos);
      for (let d = $pos.depth;; d--) {
          let before, after, index = $pos.index(d);
          if (d == $pos.depth) {
              before = $pos.nodeBefore;
              after = $pos.nodeAfter;
          }
          else if (dir > 0) {
              before = $pos.node(d + 1);
              index++;
              after = $pos.node(d).maybeChild(index);
          }
          else {
              before = $pos.node(d).maybeChild(index - 1);
              after = $pos.node(d + 1);
          }
          if (before && !before.isTextblock && joinable(before, after) &&
              $pos.node(d).canReplace(index, index + 1))
              return pos;
          if (d == 0)
              break;
          pos = dir < 0 ? $pos.before(d) : $pos.after(d);
      }
  }
  function join(tr, pos, depth) {
      let step = new ReplaceStep(pos - depth, pos + depth, Slice.empty, true);
      tr.step(step);
  }
  /**
  Try to find a point where a node of the given type can be inserted
  near `pos`, by searching up the node hierarchy when `pos` itself
  isn't a valid place but is at the start or end of a node. Return
  null if no position was found.
  */
  function insertPoint(doc, pos, nodeType) {
      let $pos = doc.resolve(pos);
      if ($pos.parent.canReplaceWith($pos.index(), $pos.index(), nodeType))
          return pos;
      if ($pos.parentOffset == 0)
          for (let d = $pos.depth - 1; d >= 0; d--) {
              let index = $pos.index(d);
              if ($pos.node(d).canReplaceWith(index, index, nodeType))
                  return $pos.before(d + 1);
              if (index > 0)
                  return null;
          }
      if ($pos.parentOffset == $pos.parent.content.size)
          for (let d = $pos.depth - 1; d >= 0; d--) {
              let index = $pos.indexAfter(d);
              if ($pos.node(d).canReplaceWith(index, index, nodeType))
                  return $pos.after(d + 1);
              if (index < $pos.node(d).childCount)
                  return null;
          }
      return null;
  }
  /**
  Finds a position at or around the given position where the given
  slice can be inserted. Will look at parent nodes' nearest boundary
  and try there, even if the original position wasn't directly at the
  start or end of that node. Returns null when no position was found.
  */
  function dropPoint(doc, pos, slice) {
      let $pos = doc.resolve(pos);
      if (!slice.content.size)
          return pos;
      let content = slice.content;
      for (let i = 0; i < slice.openStart; i++)
          content = content.firstChild.content;
      for (let pass = 1; pass <= (slice.openStart == 0 && slice.size ? 2 : 1); pass++) {
          for (let d = $pos.depth; d >= 0; d--) {
              let bias = d == $pos.depth ? 0 : $pos.pos <= ($pos.start(d + 1) + $pos.end(d + 1)) / 2 ? -1 : 1;
              let insertPos = $pos.index(d) + (bias > 0 ? 1 : 0);
              let parent = $pos.node(d), fits = false;
              if (pass == 1) {
                  fits = parent.canReplace(insertPos, insertPos, content);
              }
              else {
                  let wrapping = parent.contentMatchAt(insertPos).findWrapping(content.firstChild.type);
                  fits = wrapping && parent.canReplaceWith(insertPos, insertPos, wrapping[0]);
              }
              if (fits)
                  return bias == 0 ? $pos.pos : bias < 0 ? $pos.before(d + 1) : $pos.after(d + 1);
          }
      }
      return null;
  }

  /**
  ‘Fit’ a slice into a given position in the document, producing a
  [step](https://prosemirror.net/docs/ref/#transform.Step) that inserts it. Will return null if
  there's no meaningful way to insert the slice here, or inserting it
  would be a no-op (an empty slice over an empty range).
  */
  function replaceStep(doc, from, to = from, slice = Slice.empty) {
      if (from == to && !slice.size)
          return null;
      let $from = doc.resolve(from), $to = doc.resolve(to);
      // Optimization -- avoid work if it's obvious that it's not needed.
      if (fitsTrivially($from, $to, slice))
          return new ReplaceStep(from, to, slice);
      return new Fitter($from, $to, slice).fit();
  }
  function fitsTrivially($from, $to, slice) {
      return !slice.openStart && !slice.openEnd && $from.start() == $to.start() &&
          $from.parent.canReplace($from.index(), $to.index(), slice.content);
  }
  // Algorithm for 'placing' the elements of a slice into a gap:
  //
  // We consider the content of each node that is open to the left to be
  // independently placeable. I.e. in <p("foo"), p("bar")>, when the
  // paragraph on the left is open, "foo" can be placed (somewhere on
  // the left side of the replacement gap) independently from p("bar").
  //
  // This class tracks the state of the placement progress in the
  // following properties:
  //
  //  - `frontier` holds a stack of `{type, match}` objects that
  //    represent the open side of the replacement. It starts at
  //    `$from`, then moves forward as content is placed, and is finally
  //    reconciled with `$to`.
  //
  //  - `unplaced` is a slice that represents the content that hasn't
  //    been placed yet.
  //
  //  - `placed` is a fragment of placed content. Its open-start value
  //    is implicit in `$from`, and its open-end value in `frontier`.
  class Fitter {
      constructor($from, $to, unplaced) {
          this.$from = $from;
          this.$to = $to;
          this.unplaced = unplaced;
          this.frontier = [];
          this.placed = Fragment.empty;
          for (let i = 0; i <= $from.depth; i++) {
              let node = $from.node(i);
              this.frontier.push({
                  type: node.type,
                  match: node.contentMatchAt($from.indexAfter(i))
              });
          }
          for (let i = $from.depth; i > 0; i--)
              this.placed = Fragment.from($from.node(i).copy(this.placed));
      }
      get depth() { return this.frontier.length - 1; }
      fit() {
          // As long as there's unplaced content, try to place some of it.
          // If that fails, either increase the open score of the unplaced
          // slice, or drop nodes from it, and then try again.
          while (this.unplaced.size) {
              let fit = this.findFittable();
              if (fit)
                  this.placeNodes(fit);
              else
                  this.openMore() || this.dropNode();
          }
          // When there's inline content directly after the frontier _and_
          // directly after `this.$to`, we must generate a `ReplaceAround`
          // step that pulls that content into the node after the frontier.
          // That means the fitting must be done to the end of the textblock
          // node after `this.$to`, not `this.$to` itself.
          let moveInline = this.mustMoveInline(), placedSize = this.placed.size - this.depth - this.$from.depth;
          let $from = this.$from, $to = this.close(moveInline < 0 ? this.$to : $from.doc.resolve(moveInline));
          if (!$to)
              return null;
          // If closing to `$to` succeeded, create a step
          let content = this.placed, openStart = $from.depth, openEnd = $to.depth;
          while (openStart && openEnd && content.childCount == 1) { // Normalize by dropping open parent nodes
              content = content.firstChild.content;
              openStart--;
              openEnd--;
          }
          let slice = new Slice(content, openStart, openEnd);
          if (moveInline > -1)
              return new ReplaceAroundStep($from.pos, moveInline, this.$to.pos, this.$to.end(), slice, placedSize);
          if (slice.size || $from.pos != this.$to.pos) // Don't generate no-op steps
              return new ReplaceStep($from.pos, $to.pos, slice);
          return null;
      }
      // Find a position on the start spine of `this.unplaced` that has
      // content that can be moved somewhere on the frontier. Returns two
      // depths, one for the slice and one for the frontier.
      findFittable() {
          let startDepth = this.unplaced.openStart;
          for (let cur = this.unplaced.content, d = 0, openEnd = this.unplaced.openEnd; d < startDepth; d++) {
              let node = cur.firstChild;
              if (cur.childCount > 1)
                  openEnd = 0;
              if (node.type.spec.isolating && openEnd <= d) {
                  startDepth = d;
                  break;
              }
              cur = node.content;
          }
          // Only try wrapping nodes (pass 2) after finding a place without
          // wrapping failed.
          for (let pass = 1; pass <= 2; pass++) {
              for (let sliceDepth = pass == 1 ? startDepth : this.unplaced.openStart; sliceDepth >= 0; sliceDepth--) {
                  let fragment, parent = null;
                  if (sliceDepth) {
                      parent = contentAt(this.unplaced.content, sliceDepth - 1).firstChild;
                      fragment = parent.content;
                  }
                  else {
                      fragment = this.unplaced.content;
                  }
                  let first = fragment.firstChild;
                  for (let frontierDepth = this.depth; frontierDepth >= 0; frontierDepth--) {
                      let { type, match } = this.frontier[frontierDepth], wrap, inject = null;
                      // In pass 1, if the next node matches, or there is no next
                      // node but the parents look compatible, we've found a
                      // place.
                      if (pass == 1 && (first ? match.matchType(first.type) || (inject = match.fillBefore(Fragment.from(first), false))
                          : parent && type.compatibleContent(parent.type)))
                          return { sliceDepth, frontierDepth, parent, inject };
                      // In pass 2, look for a set of wrapping nodes that make
                      // `first` fit here.
                      else if (pass == 2 && first && (wrap = match.findWrapping(first.type)))
                          return { sliceDepth, frontierDepth, parent, wrap };
                      // Don't continue looking further up if the parent node
                      // would fit here.
                      if (parent && match.matchType(parent.type))
                          break;
                  }
              }
          }
      }
      openMore() {
          let { content, openStart, openEnd } = this.unplaced;
          let inner = contentAt(content, openStart);
          if (!inner.childCount || inner.firstChild.isLeaf)
              return false;
          this.unplaced = new Slice(content, openStart + 1, Math.max(openEnd, inner.size + openStart >= content.size - openEnd ? openStart + 1 : 0));
          return true;
      }
      dropNode() {
          let { content, openStart, openEnd } = this.unplaced;
          let inner = contentAt(content, openStart);
          if (inner.childCount <= 1 && openStart > 0) {
              let openAtEnd = content.size - openStart <= openStart + inner.size;
              this.unplaced = new Slice(dropFromFragment(content, openStart - 1, 1), openStart - 1, openAtEnd ? openStart - 1 : openEnd);
          }
          else {
              this.unplaced = new Slice(dropFromFragment(content, openStart, 1), openStart, openEnd);
          }
      }
      // Move content from the unplaced slice at `sliceDepth` to the
      // frontier node at `frontierDepth`. Close that frontier node when
      // applicable.
      placeNodes({ sliceDepth, frontierDepth, parent, inject, wrap }) {
          while (this.depth > frontierDepth)
              this.closeFrontierNode();
          if (wrap)
              for (let i = 0; i < wrap.length; i++)
                  this.openFrontierNode(wrap[i]);
          let slice = this.unplaced, fragment = parent ? parent.content : slice.content;
          let openStart = slice.openStart - sliceDepth;
          let taken = 0, add = [];
          let { match, type } = this.frontier[frontierDepth];
          if (inject) {
              for (let i = 0; i < inject.childCount; i++)
                  add.push(inject.child(i));
              match = match.matchFragment(inject);
          }
          // Computes the amount of (end) open nodes at the end of the
          // fragment. When 0, the parent is open, but no more. When
          // negative, nothing is open.
          let openEndCount = (fragment.size + sliceDepth) - (slice.content.size - slice.openEnd);
          // Scan over the fragment, fitting as many child nodes as
          // possible.
          while (taken < fragment.childCount) {
              let next = fragment.child(taken), matches = match.matchType(next.type);
              if (!matches)
                  break;
              taken++;
              if (taken > 1 || openStart == 0 || next.content.size) { // Drop empty open nodes
                  match = matches;
                  add.push(closeNodeStart(next.mark(type.allowedMarks(next.marks)), taken == 1 ? openStart : 0, taken == fragment.childCount ? openEndCount : -1));
              }
          }
          let toEnd = taken == fragment.childCount;
          if (!toEnd)
              openEndCount = -1;
          this.placed = addToFragment(this.placed, frontierDepth, Fragment.from(add));
          this.frontier[frontierDepth].match = match;
          // If the parent types match, and the entire node was moved, and
          // it's not open, close this frontier node right away.
          if (toEnd && openEndCount < 0 && parent && parent.type == this.frontier[this.depth].type && this.frontier.length > 1)
              this.closeFrontierNode();
          // Add new frontier nodes for any open nodes at the end.
          for (let i = 0, cur = fragment; i < openEndCount; i++) {
              let node = cur.lastChild;
              this.frontier.push({ type: node.type, match: node.contentMatchAt(node.childCount) });
              cur = node.content;
          }
          // Update `this.unplaced`. Drop the entire node from which we
          // placed it we got to its end, otherwise just drop the placed
          // nodes.
          this.unplaced = !toEnd ? new Slice(dropFromFragment(slice.content, sliceDepth, taken), slice.openStart, slice.openEnd)
              : sliceDepth == 0 ? Slice.empty
                  : new Slice(dropFromFragment(slice.content, sliceDepth - 1, 1), sliceDepth - 1, openEndCount < 0 ? slice.openEnd : sliceDepth - 1);
      }
      mustMoveInline() {
          if (!this.$to.parent.isTextblock)
              return -1;
          let top = this.frontier[this.depth], level;
          if (!top.type.isTextblock || !contentAfterFits(this.$to, this.$to.depth, top.type, top.match, false) ||
              (this.$to.depth == this.depth && (level = this.findCloseLevel(this.$to)) && level.depth == this.depth))
              return -1;
          let { depth } = this.$to, after = this.$to.after(depth);
          while (depth > 1 && after == this.$to.end(--depth))
              ++after;
          return after;
      }
      findCloseLevel($to) {
          scan: for (let i = Math.min(this.depth, $to.depth); i >= 0; i--) {
              let { match, type } = this.frontier[i];
              let dropInner = i < $to.depth && $to.end(i + 1) == $to.pos + ($to.depth - (i + 1));
              let fit = contentAfterFits($to, i, type, match, dropInner);
              if (!fit)
                  continue;
              for (let d = i - 1; d >= 0; d--) {
                  let { match, type } = this.frontier[d];
                  let matches = contentAfterFits($to, d, type, match, true);
                  if (!matches || matches.childCount)
                      continue scan;
              }
              return { depth: i, fit, move: dropInner ? $to.doc.resolve($to.after(i + 1)) : $to };
          }
      }
      close($to) {
          let close = this.findCloseLevel($to);
          if (!close)
              return null;
          while (this.depth > close.depth)
              this.closeFrontierNode();
          if (close.fit.childCount)
              this.placed = addToFragment(this.placed, close.depth, close.fit);
          $to = close.move;
          for (let d = close.depth + 1; d <= $to.depth; d++) {
              let node = $to.node(d), add = node.type.contentMatch.fillBefore(node.content, true, $to.index(d));
              this.openFrontierNode(node.type, node.attrs, add);
          }
          return $to;
      }
      openFrontierNode(type, attrs = null, content) {
          let top = this.frontier[this.depth];
          top.match = top.match.matchType(type);
          this.placed = addToFragment(this.placed, this.depth, Fragment.from(type.create(attrs, content)));
          this.frontier.push({ type, match: type.contentMatch });
      }
      closeFrontierNode() {
          let open = this.frontier.pop();
          let add = open.match.fillBefore(Fragment.empty, true);
          if (add.childCount)
              this.placed = addToFragment(this.placed, this.frontier.length, add);
      }
  }
  function dropFromFragment(fragment, depth, count) {
      if (depth == 0)
          return fragment.cutByIndex(count, fragment.childCount);
      return fragment.replaceChild(0, fragment.firstChild.copy(dropFromFragment(fragment.firstChild.content, depth - 1, count)));
  }
  function addToFragment(fragment, depth, content) {
      if (depth == 0)
          return fragment.append(content);
      return fragment.replaceChild(fragment.childCount - 1, fragment.lastChild.copy(addToFragment(fragment.lastChild.content, depth - 1, content)));
  }
  function contentAt(fragment, depth) {
      for (let i = 0; i < depth; i++)
          fragment = fragment.firstChild.content;
      return fragment;
  }
  function closeNodeStart(node, openStart, openEnd) {
      if (openStart <= 0)
          return node;
      let frag = node.content;
      if (openStart > 1)
          frag = frag.replaceChild(0, closeNodeStart(frag.firstChild, openStart - 1, frag.childCount == 1 ? openEnd - 1 : 0));
      if (openStart > 0) {
          frag = node.type.contentMatch.fillBefore(frag).append(frag);
          if (openEnd <= 0)
              frag = frag.append(node.type.contentMatch.matchFragment(frag).fillBefore(Fragment.empty, true));
      }
      return node.copy(frag);
  }
  function contentAfterFits($to, depth, type, match, open) {
      let node = $to.node(depth), index = open ? $to.indexAfter(depth) : $to.index(depth);
      if (index == node.childCount && !type.compatibleContent(node.type))
          return null;
      let fit = match.fillBefore(node.content, true, index);
      return fit && !invalidMarks(type, node.content, index) ? fit : null;
  }
  function invalidMarks(type, fragment, start) {
      for (let i = start; i < fragment.childCount; i++)
          if (!type.allowsMarks(fragment.child(i).marks))
              return true;
      return false;
  }
  function definesContent(type) {
      return type.spec.defining || type.spec.definingForContent;
  }
  function replaceRange(tr, from, to, slice) {
      if (!slice.size)
          return tr.deleteRange(from, to);
      let $from = tr.doc.resolve(from), $to = tr.doc.resolve(to);
      if (fitsTrivially($from, $to, slice))
          return tr.step(new ReplaceStep(from, to, slice));
      let targetDepths = coveredDepths($from, tr.doc.resolve(to));
      // Can't replace the whole document, so remove 0 if it's present
      if (targetDepths[targetDepths.length - 1] == 0)
          targetDepths.pop();
      // Negative numbers represent not expansion over the whole node at
      // that depth, but replacing from $from.before(-D) to $to.pos.
      let preferredTarget = -($from.depth + 1);
      targetDepths.unshift(preferredTarget);
      // This loop picks a preferred target depth, if one of the covering
      // depths is not outside of a defining node, and adds negative
      // depths for any depth that has $from at its start and does not
      // cross a defining node.
      for (let d = $from.depth, pos = $from.pos - 1; d > 0; d--, pos--) {
          let spec = $from.node(d).type.spec;
          if (spec.defining || spec.definingAsContext || spec.isolating)
              break;
          if (targetDepths.indexOf(d) > -1)
              preferredTarget = d;
          else if ($from.before(d) == pos)
              targetDepths.splice(1, 0, -d);
      }
      // Try to fit each possible depth of the slice into each possible
      // target depth, starting with the preferred depths.
      let preferredTargetIndex = targetDepths.indexOf(preferredTarget);
      let leftNodes = [], preferredDepth = slice.openStart;
      for (let content = slice.content, i = 0;; i++) {
          let node = content.firstChild;
          leftNodes.push(node);
          if (i == slice.openStart)
              break;
          content = node.content;
      }
      // Back up preferredDepth to cover defining textblocks directly
      // above it, possibly skipping a non-defining textblock.
      for (let d = preferredDepth - 1; d >= 0; d--) {
          let type = leftNodes[d].type, def = definesContent(type);
          if (def && $from.node(preferredTargetIndex).type != type)
              preferredDepth = d;
          else if (def || !type.isTextblock)
              break;
      }
      for (let j = slice.openStart; j >= 0; j--) {
          let openDepth = (j + preferredDepth + 1) % (slice.openStart + 1);
          let insert = leftNodes[openDepth];
          if (!insert)
              continue;
          for (let i = 0; i < targetDepths.length; i++) {
              // Loop over possible expansion levels, starting with the
              // preferred one
              let targetDepth = targetDepths[(i + preferredTargetIndex) % targetDepths.length], expand = true;
              if (targetDepth < 0) {
                  expand = false;
                  targetDepth = -targetDepth;
              }
              let parent = $from.node(targetDepth - 1), index = $from.index(targetDepth - 1);
              if (parent.canReplaceWith(index, index, insert.type, insert.marks))
                  return tr.replace($from.before(targetDepth), expand ? $to.after(targetDepth) : to, new Slice(closeFragment(slice.content, 0, slice.openStart, openDepth), openDepth, slice.openEnd));
          }
      }
      let startSteps = tr.steps.length;
      for (let i = targetDepths.length - 1; i >= 0; i--) {
          tr.replace(from, to, slice);
          if (tr.steps.length > startSteps)
              break;
          let depth = targetDepths[i];
          if (depth < 0)
              continue;
          from = $from.before(depth);
          to = $to.after(depth);
      }
  }
  function closeFragment(fragment, depth, oldOpen, newOpen, parent) {
      if (depth < oldOpen) {
          let first = fragment.firstChild;
          fragment = fragment.replaceChild(0, first.copy(closeFragment(first.content, depth + 1, oldOpen, newOpen, first)));
      }
      if (depth > newOpen) {
          let match = parent.contentMatchAt(0);
          let start = match.fillBefore(fragment).append(fragment);
          fragment = start.append(match.matchFragment(start).fillBefore(Fragment.empty, true));
      }
      return fragment;
  }
  function replaceRangeWith(tr, from, to, node) {
      if (!node.isInline && from == to && tr.doc.resolve(from).parent.content.size) {
          let point = insertPoint(tr.doc, from, node.type);
          if (point != null)
              from = to = point;
      }
      tr.replaceRange(from, to, new Slice(Fragment.from(node), 0, 0));
  }
  function deleteRange(tr, from, to) {
      let $from = tr.doc.resolve(from), $to = tr.doc.resolve(to);
      let covered = coveredDepths($from, $to);
      for (let i = 0; i < covered.length; i++) {
          let depth = covered[i], last = i == covered.length - 1;
          if ((last && depth == 0) || $from.node(depth).type.contentMatch.validEnd)
              return tr.delete($from.start(depth), $to.end(depth));
          if (depth > 0 && (last || $from.node(depth - 1).canReplace($from.index(depth - 1), $to.indexAfter(depth - 1))))
              return tr.delete($from.before(depth), $to.after(depth));
      }
      for (let d = 1; d <= $from.depth && d <= $to.depth; d++) {
          if (from - $from.start(d) == $from.depth - d && to > $from.end(d) && $to.end(d) - to != $to.depth - d)
              return tr.delete($from.before(d), to);
      }
      tr.delete(from, to);
  }
  // Returns an array of all depths for which $from - $to spans the
  // whole content of the nodes at that depth.
  function coveredDepths($from, $to) {
      let result = [], minDepth = Math.min($from.depth, $to.depth);
      for (let d = minDepth; d >= 0; d--) {
          let start = $from.start(d);
          if (start < $from.pos - ($from.depth - d) ||
              $to.end(d) > $to.pos + ($to.depth - d) ||
              $from.node(d).type.spec.isolating ||
              $to.node(d).type.spec.isolating)
              break;
          if (start == $to.start(d) ||
              (d == $from.depth && d == $to.depth && $from.parent.inlineContent && $to.parent.inlineContent &&
                  d && $to.start(d - 1) == start - 1))
              result.push(d);
      }
      return result;
  }

  /**
  Update an attribute in a specific node.
  */
  class AttrStep extends Step {
      /**
      Construct an attribute step.
      */
      constructor(
      /**
      The position of the target node.
      */
      pos, 
      /**
      The attribute to set.
      */
      attr, 
      // The attribute's new value.
      value) {
          super();
          this.pos = pos;
          this.attr = attr;
          this.value = value;
      }
      apply(doc) {
          let node = doc.nodeAt(this.pos);
          if (!node)
              return StepResult.fail("No node at attribute step's position");
          let attrs = Object.create(null);
          for (let name in node.attrs)
              attrs[name] = node.attrs[name];
          attrs[this.attr] = this.value;
          let updated = node.type.create(attrs, null, node.marks);
          return StepResult.fromReplace(doc, this.pos, this.pos + 1, new Slice(Fragment.from(updated), 0, node.isLeaf ? 0 : 1));
      }
      getMap() {
          return StepMap.empty;
      }
      invert(doc) {
          return new AttrStep(this.pos, this.attr, doc.nodeAt(this.pos).attrs[this.attr]);
      }
      map(mapping) {
          let pos = mapping.mapResult(this.pos, 1);
          return pos.deletedAfter ? null : new AttrStep(pos.pos, this.attr, this.value);
      }
      toJSON() {
          return { stepType: "attr", pos: this.pos, attr: this.attr, value: this.value };
      }
      static fromJSON(schema, json) {
          if (typeof json.pos != "number" || typeof json.attr != "string")
              throw new RangeError("Invalid input for AttrStep.fromJSON");
          return new AttrStep(json.pos, json.attr, json.value);
      }
  }
  Step.jsonID("attr", AttrStep);

  /**
  @internal
  */
  let TransformError = class extends Error {
  };
  TransformError = function TransformError(message) {
      let err = Error.call(this, message);
      err.__proto__ = TransformError.prototype;
      return err;
  };
  TransformError.prototype = Object.create(Error.prototype);
  TransformError.prototype.constructor = TransformError;
  TransformError.prototype.name = "TransformError";
  /**
  Abstraction to build up and track an array of
  [steps](https://prosemirror.net/docs/ref/#transform.Step) representing a document transformation.

  Most transforming methods return the `Transform` object itself, so
  that they can be chained.
  */
  class Transform {
      /**
      Create a transform that starts with the given document.
      */
      constructor(
      /**
      The current document (the result of applying the steps in the
      transform).
      */
      doc) {
          this.doc = doc;
          /**
          The steps in this transform.
          */
          this.steps = [];
          /**
          The documents before each of the steps.
          */
          this.docs = [];
          /**
          A mapping with the maps for each of the steps in this transform.
          */
          this.mapping = new Mapping;
      }
      /**
      The starting document.
      */
      get before() { return this.docs.length ? this.docs[0] : this.doc; }
      /**
      Apply a new step in this transform, saving the result. Throws an
      error when the step fails.
      */
      step(step) {
          let result = this.maybeStep(step);
          if (result.failed)
              throw new TransformError(result.failed);
          return this;
      }
      /**
      Try to apply a step in this transformation, ignoring it if it
      fails. Returns the step result.
      */
      maybeStep(step) {
          let result = step.apply(this.doc);
          if (!result.failed)
              this.addStep(step, result.doc);
          return result;
      }
      /**
      True when the document has been changed (when there are any
      steps).
      */
      get docChanged() {
          return this.steps.length > 0;
      }
      /**
      @internal
      */
      addStep(step, doc) {
          this.docs.push(this.doc);
          this.steps.push(step);
          this.mapping.appendMap(step.getMap());
          this.doc = doc;
      }
      /**
      Replace the part of the document between `from` and `to` with the
      given `slice`.
      */
      replace(from, to = from, slice = Slice.empty) {
          let step = replaceStep(this.doc, from, to, slice);
          if (step)
              this.step(step);
          return this;
      }
      /**
      Replace the given range with the given content, which may be a
      fragment, node, or array of nodes.
      */
      replaceWith(from, to, content) {
          return this.replace(from, to, new Slice(Fragment.from(content), 0, 0));
      }
      /**
      Delete the content between the given positions.
      */
      delete(from, to) {
          return this.replace(from, to, Slice.empty);
      }
      /**
      Insert the given content at the given position.
      */
      insert(pos, content) {
          return this.replaceWith(pos, pos, content);
      }
      /**
      Replace a range of the document with a given slice, using
      `from`, `to`, and the slice's
      [`openStart`](https://prosemirror.net/docs/ref/#model.Slice.openStart) property as hints, rather
      than fixed start and end points. This method may grow the
      replaced area or close open nodes in the slice in order to get a
      fit that is more in line with WYSIWYG expectations, by dropping
      fully covered parent nodes of the replaced region when they are
      marked [non-defining as
      context](https://prosemirror.net/docs/ref/#model.NodeSpec.definingAsContext), or including an
      open parent node from the slice that _is_ marked as [defining
      its content](https://prosemirror.net/docs/ref/#model.NodeSpec.definingForContent).
      
      This is the method, for example, to handle paste. The similar
      [`replace`](https://prosemirror.net/docs/ref/#transform.Transform.replace) method is a more
      primitive tool which will _not_ move the start and end of its given
      range, and is useful in situations where you need more precise
      control over what happens.
      */
      replaceRange(from, to, slice) {
          replaceRange(this, from, to, slice);
          return this;
      }
      /**
      Replace the given range with a node, but use `from` and `to` as
      hints, rather than precise positions. When from and to are the same
      and are at the start or end of a parent node in which the given
      node doesn't fit, this method may _move_ them out towards a parent
      that does allow the given node to be placed. When the given range
      completely covers a parent node, this method may completely replace
      that parent node.
      */
      replaceRangeWith(from, to, node) {
          replaceRangeWith(this, from, to, node);
          return this;
      }
      /**
      Delete the given range, expanding it to cover fully covered
      parent nodes until a valid replace is found.
      */
      deleteRange(from, to) {
          deleteRange(this, from, to);
          return this;
      }
      /**
      Split the content in the given range off from its parent, if there
      is sibling content before or after it, and move it up the tree to
      the depth specified by `target`. You'll probably want to use
      [`liftTarget`](https://prosemirror.net/docs/ref/#transform.liftTarget) to compute `target`, to make
      sure the lift is valid.
      */
      lift(range, target) {
          lift$1(this, range, target);
          return this;
      }
      /**
      Join the blocks around the given position. If depth is 2, their
      last and first siblings are also joined, and so on.
      */
      join(pos, depth = 1) {
          join(this, pos, depth);
          return this;
      }
      /**
      Wrap the given [range](https://prosemirror.net/docs/ref/#model.NodeRange) in the given set of wrappers.
      The wrappers are assumed to be valid in this position, and should
      probably be computed with [`findWrapping`](https://prosemirror.net/docs/ref/#transform.findWrapping).
      */
      wrap(range, wrappers) {
          wrap(this, range, wrappers);
          return this;
      }
      /**
      Set the type of all textblocks (partly) between `from` and `to` to
      the given node type with the given attributes.
      */
      setBlockType(from, to = from, type, attrs = null) {
          setBlockType$1(this, from, to, type, attrs);
          return this;
      }
      /**
      Change the type, attributes, and/or marks of the node at `pos`.
      When `type` isn't given, the existing node type is preserved,
      */
      setNodeMarkup(pos, type, attrs = null, marks) {
          setNodeMarkup(this, pos, type, attrs, marks);
          return this;
      }
      /**
      Set a single attribute on a given node to a new value.
      */
      setNodeAttribute(pos, attr, value) {
          this.step(new AttrStep(pos, attr, value));
          return this;
      }
      /**
      Add a mark to the node at position `pos`.
      */
      addNodeMark(pos, mark) {
          this.step(new AddNodeMarkStep(pos, mark));
          return this;
      }
      /**
      Remove a mark (or a mark of the given type) from the node at
      position `pos`.
      */
      removeNodeMark(pos, mark) {
          if (!(mark instanceof Mark)) {
              let node = this.doc.nodeAt(pos);
              if (!node)
                  throw new RangeError("No node at position " + pos);
              mark = mark.isInSet(node.marks);
              if (!mark)
                  return this;
          }
          this.step(new RemoveNodeMarkStep(pos, mark));
          return this;
      }
      /**
      Split the node at the given position, and optionally, if `depth` is
      greater than one, any number of nodes above that. By default, the
      parts split off will inherit the node type of the original node.
      This can be changed by passing an array of types and attributes to
      use after the split.
      */
      split(pos, depth = 1, typesAfter) {
          split(this, pos, depth, typesAfter);
          return this;
      }
      /**
      Add the given mark to the inline content between `from` and `to`.
      */
      addMark(from, to, mark) {
          addMark(this, from, to, mark);
          return this;
      }
      /**
      Remove marks from inline nodes between `from` and `to`. When
      `mark` is a single mark, remove precisely that mark. When it is
      a mark type, remove all marks of that type. When it is null,
      remove all marks of any type.
      */
      removeMark(from, to, mark) {
          removeMark(this, from, to, mark);
          return this;
      }
      /**
      Removes all marks and nodes from the content of the node at
      `pos` that don't match the given new parent node type. Accepts
      an optional starting [content match](https://prosemirror.net/docs/ref/#model.ContentMatch) as
      third argument.
      */
      clearIncompatible(pos, parentType, match) {
          clearIncompatible(this, pos, parentType, match);
          return this;
      }
  }

  var index$6 = /*#__PURE__*/Object.freeze({
    __proto__: null,
    AddMarkStep: AddMarkStep,
    AddNodeMarkStep: AddNodeMarkStep,
    AttrStep: AttrStep,
    MapResult: MapResult,
    Mapping: Mapping,
    RemoveMarkStep: RemoveMarkStep,
    RemoveNodeMarkStep: RemoveNodeMarkStep,
    ReplaceAroundStep: ReplaceAroundStep,
    ReplaceStep: ReplaceStep,
    Step: Step,
    StepMap: StepMap,
    StepResult: StepResult,
    Transform: Transform,
    get TransformError () { return TransformError; },
    canJoin: canJoin,
    canSplit: canSplit,
    dropPoint: dropPoint,
    findWrapping: findWrapping,
    insertPoint: insertPoint,
    joinPoint: joinPoint,
    liftTarget: liftTarget,
    replaceStep: replaceStep
  });

  const classesById = Object.create(null);
  /**
  Superclass for editor selections. Every selection type should
  extend this. Should not be instantiated directly.
  */
  class Selection {
      /**
      Initialize a selection with the head and anchor and ranges. If no
      ranges are given, constructs a single range across `$anchor` and
      `$head`.
      */
      constructor(
      /**
      The resolved anchor of the selection (the side that stays in
      place when the selection is modified).
      */
      $anchor, 
      /**
      The resolved head of the selection (the side that moves when
      the selection is modified).
      */
      $head, ranges) {
          this.$anchor = $anchor;
          this.$head = $head;
          this.ranges = ranges || [new SelectionRange($anchor.min($head), $anchor.max($head))];
      }
      /**
      The selection's anchor, as an unresolved position.
      */
      get anchor() { return this.$anchor.pos; }
      /**
      The selection's head.
      */
      get head() { return this.$head.pos; }
      /**
      The lower bound of the selection's main range.
      */
      get from() { return this.$from.pos; }
      /**
      The upper bound of the selection's main range.
      */
      get to() { return this.$to.pos; }
      /**
      The resolved lower  bound of the selection's main range.
      */
      get $from() {
          return this.ranges[0].$from;
      }
      /**
      The resolved upper bound of the selection's main range.
      */
      get $to() {
          return this.ranges[0].$to;
      }
      /**
      Indicates whether the selection contains any content.
      */
      get empty() {
          let ranges = this.ranges;
          for (let i = 0; i < ranges.length; i++)
              if (ranges[i].$from.pos != ranges[i].$to.pos)
                  return false;
          return true;
      }
      /**
      Get the content of this selection as a slice.
      */
      content() {
          return this.$from.doc.slice(this.from, this.to, true);
      }
      /**
      Replace the selection with a slice or, if no slice is given,
      delete the selection. Will append to the given transaction.
      */
      replace(tr, content = Slice.empty) {
          // Put the new selection at the position after the inserted
          // content. When that ended in an inline node, search backwards,
          // to get the position after that node. If not, search forward.
          let lastNode = content.content.lastChild, lastParent = null;
          for (let i = 0; i < content.openEnd; i++) {
              lastParent = lastNode;
              lastNode = lastNode.lastChild;
          }
          let mapFrom = tr.steps.length, ranges = this.ranges;
          for (let i = 0; i < ranges.length; i++) {
              let { $from, $to } = ranges[i], mapping = tr.mapping.slice(mapFrom);
              tr.replaceRange(mapping.map($from.pos), mapping.map($to.pos), i ? Slice.empty : content);
              if (i == 0)
                  selectionToInsertionEnd(tr, mapFrom, (lastNode ? lastNode.isInline : lastParent && lastParent.isTextblock) ? -1 : 1);
          }
      }
      /**
      Replace the selection with the given node, appending the changes
      to the given transaction.
      */
      replaceWith(tr, node) {
          let mapFrom = tr.steps.length, ranges = this.ranges;
          for (let i = 0; i < ranges.length; i++) {
              let { $from, $to } = ranges[i], mapping = tr.mapping.slice(mapFrom);
              let from = mapping.map($from.pos), to = mapping.map($to.pos);
              if (i) {
                  tr.deleteRange(from, to);
              }
              else {
                  tr.replaceRangeWith(from, to, node);
                  selectionToInsertionEnd(tr, mapFrom, node.isInline ? -1 : 1);
              }
          }
      }
      /**
      Find a valid cursor or leaf node selection starting at the given
      position and searching back if `dir` is negative, and forward if
      positive. When `textOnly` is true, only consider cursor
      selections. Will return null when no valid selection position is
      found.
      */
      static findFrom($pos, dir, textOnly = false) {
          let inner = $pos.parent.inlineContent ? new TextSelection($pos)
              : findSelectionIn($pos.node(0), $pos.parent, $pos.pos, $pos.index(), dir, textOnly);
          if (inner)
              return inner;
          for (let depth = $pos.depth - 1; depth >= 0; depth--) {
              let found = dir < 0
                  ? findSelectionIn($pos.node(0), $pos.node(depth), $pos.before(depth + 1), $pos.index(depth), dir, textOnly)
                  : findSelectionIn($pos.node(0), $pos.node(depth), $pos.after(depth + 1), $pos.index(depth) + 1, dir, textOnly);
              if (found)
                  return found;
          }
          return null;
      }
      /**
      Find a valid cursor or leaf node selection near the given
      position. Searches forward first by default, but if `bias` is
      negative, it will search backwards first.
      */
      static near($pos, bias = 1) {
          return this.findFrom($pos, bias) || this.findFrom($pos, -bias) || new AllSelection($pos.node(0));
      }
      /**
      Find the cursor or leaf node selection closest to the start of
      the given document. Will return an
      [`AllSelection`](https://prosemirror.net/docs/ref/#state.AllSelection) if no valid position
      exists.
      */
      static atStart(doc) {
          return findSelectionIn(doc, doc, 0, 0, 1) || new AllSelection(doc);
      }
      /**
      Find the cursor or leaf node selection closest to the end of the
      given document.
      */
      static atEnd(doc) {
          return findSelectionIn(doc, doc, doc.content.size, doc.childCount, -1) || new AllSelection(doc);
      }
      /**
      Deserialize the JSON representation of a selection. Must be
      implemented for custom classes (as a static class method).
      */
      static fromJSON(doc, json) {
          if (!json || !json.type)
              throw new RangeError("Invalid input for Selection.fromJSON");
          let cls = classesById[json.type];
          if (!cls)
              throw new RangeError(`No selection type ${json.type} defined`);
          return cls.fromJSON(doc, json);
      }
      /**
      To be able to deserialize selections from JSON, custom selection
      classes must register themselves with an ID string, so that they
      can be disambiguated. Try to pick something that's unlikely to
      clash with classes from other modules.
      */
      static jsonID(id, selectionClass) {
          if (id in classesById)
              throw new RangeError("Duplicate use of selection JSON ID " + id);
          classesById[id] = selectionClass;
          selectionClass.prototype.jsonID = id;
          return selectionClass;
      }
      /**
      Get a [bookmark](https://prosemirror.net/docs/ref/#state.SelectionBookmark) for this selection,
      which is a value that can be mapped without having access to a
      current document, and later resolved to a real selection for a
      given document again. (This is used mostly by the history to
      track and restore old selections.) The default implementation of
      this method just converts the selection to a text selection and
      returns the bookmark for that.
      */
      getBookmark() {
          return TextSelection.between(this.$anchor, this.$head).getBookmark();
      }
  }
  Selection.prototype.visible = true;
  /**
  Represents a selected range in a document.
  */
  class SelectionRange {
      /**
      Create a range.
      */
      constructor(
      /**
      The lower bound of the range.
      */
      $from, 
      /**
      The upper bound of the range.
      */
      $to) {
          this.$from = $from;
          this.$to = $to;
      }
  }
  let warnedAboutTextSelection = false;
  function checkTextSelection($pos) {
      if (!warnedAboutTextSelection && !$pos.parent.inlineContent) {
          warnedAboutTextSelection = true;
          console["warn"]("TextSelection endpoint not pointing into a node with inline content (" + $pos.parent.type.name + ")");
      }
  }
  /**
  A text selection represents a classical editor selection, with a
  head (the moving side) and anchor (immobile side), both of which
  point into textblock nodes. It can be empty (a regular cursor
  position).
  */
  class TextSelection extends Selection {
      /**
      Construct a text selection between the given points.
      */
      constructor($anchor, $head = $anchor) {
          checkTextSelection($anchor);
          checkTextSelection($head);
          super($anchor, $head);
      }
      /**
      Returns a resolved position if this is a cursor selection (an
      empty text selection), and null otherwise.
      */
      get $cursor() { return this.$anchor.pos == this.$head.pos ? this.$head : null; }
      map(doc, mapping) {
          let $head = doc.resolve(mapping.map(this.head));
          if (!$head.parent.inlineContent)
              return Selection.near($head);
          let $anchor = doc.resolve(mapping.map(this.anchor));
          return new TextSelection($anchor.parent.inlineContent ? $anchor : $head, $head);
      }
      replace(tr, content = Slice.empty) {
          super.replace(tr, content);
          if (content == Slice.empty) {
              let marks = this.$from.marksAcross(this.$to);
              if (marks)
                  tr.ensureMarks(marks);
          }
      }
      eq(other) {
          return other instanceof TextSelection && other.anchor == this.anchor && other.head == this.head;
      }
      getBookmark() {
          return new TextBookmark(this.anchor, this.head);
      }
      toJSON() {
          return { type: "text", anchor: this.anchor, head: this.head };
      }
      /**
      @internal
      */
      static fromJSON(doc, json) {
          if (typeof json.anchor != "number" || typeof json.head != "number")
              throw new RangeError("Invalid input for TextSelection.fromJSON");
          return new TextSelection(doc.resolve(json.anchor), doc.resolve(json.head));
      }
      /**
      Create a text selection from non-resolved positions.
      */
      static create(doc, anchor, head = anchor) {
          let $anchor = doc.resolve(anchor);
          return new this($anchor, head == anchor ? $anchor : doc.resolve(head));
      }
      /**
      Return a text selection that spans the given positions or, if
      they aren't text positions, find a text selection near them.
      `bias` determines whether the method searches forward (default)
      or backwards (negative number) first. Will fall back to calling
      [`Selection.near`](https://prosemirror.net/docs/ref/#state.Selection^near) when the document
      doesn't contain a valid text position.
      */
      static between($anchor, $head, bias) {
          let dPos = $anchor.pos - $head.pos;
          if (!bias || dPos)
              bias = dPos >= 0 ? 1 : -1;
          if (!$head.parent.inlineContent) {
              let found = Selection.findFrom($head, bias, true) || Selection.findFrom($head, -bias, true);
              if (found)
                  $head = found.$head;
              else
                  return Selection.near($head, bias);
          }
          if (!$anchor.parent.inlineContent) {
              if (dPos == 0) {
                  $anchor = $head;
              }
              else {
                  $anchor = (Selection.findFrom($anchor, -bias, true) || Selection.findFrom($anchor, bias, true)).$anchor;
                  if (($anchor.pos < $head.pos) != (dPos < 0))
                      $anchor = $head;
              }
          }
          return new TextSelection($anchor, $head);
      }
  }
  Selection.jsonID("text", TextSelection);
  class TextBookmark {
      constructor(anchor, head) {
          this.anchor = anchor;
          this.head = head;
      }
      map(mapping) {
          return new TextBookmark(mapping.map(this.anchor), mapping.map(this.head));
      }
      resolve(doc) {
          return TextSelection.between(doc.resolve(this.anchor), doc.resolve(this.head));
      }
  }
  /**
  A node selection is a selection that points at a single node. All
  nodes marked [selectable](https://prosemirror.net/docs/ref/#model.NodeSpec.selectable) can be the
  target of a node selection. In such a selection, `from` and `to`
  point directly before and after the selected node, `anchor` equals
  `from`, and `head` equals `to`..
  */
  class NodeSelection extends Selection {
      /**
      Create a node selection. Does not verify the validity of its
      argument.
      */
      constructor($pos) {
          let node = $pos.nodeAfter;
          let $end = $pos.node(0).resolve($pos.pos + node.nodeSize);
          super($pos, $end);
          this.node = node;
      }
      map(doc, mapping) {
          let { deleted, pos } = mapping.mapResult(this.anchor);
          let $pos = doc.resolve(pos);
          if (deleted)
              return Selection.near($pos);
          return new NodeSelection($pos);
      }
      content() {
          return new Slice(Fragment.from(this.node), 0, 0);
      }
      eq(other) {
          return other instanceof NodeSelection && other.anchor == this.anchor;
      }
      toJSON() {
          return { type: "node", anchor: this.anchor };
      }
      getBookmark() { return new NodeBookmark(this.anchor); }
      /**
      @internal
      */
      static fromJSON(doc, json) {
          if (typeof json.anchor != "number")
              throw new RangeError("Invalid input for NodeSelection.fromJSON");
          return new NodeSelection(doc.resolve(json.anchor));
      }
      /**
      Create a node selection from non-resolved positions.
      */
      static create(doc, from) {
          return new NodeSelection(doc.resolve(from));
      }
      /**
      Determines whether the given node may be selected as a node
      selection.
      */
      static isSelectable(node) {
          return !node.isText && node.type.spec.selectable !== false;
      }
  }
  NodeSelection.prototype.visible = false;
  Selection.jsonID("node", NodeSelection);
  class NodeBookmark {
      constructor(anchor) {
          this.anchor = anchor;
      }
      map(mapping) {
          let { deleted, pos } = mapping.mapResult(this.anchor);
          return deleted ? new TextBookmark(pos, pos) : new NodeBookmark(pos);
      }
      resolve(doc) {
          let $pos = doc.resolve(this.anchor), node = $pos.nodeAfter;
          if (node && NodeSelection.isSelectable(node))
              return new NodeSelection($pos);
          return Selection.near($pos);
      }
  }
  /**
  A selection type that represents selecting the whole document
  (which can not necessarily be expressed with a text selection, when
  there are for example leaf block nodes at the start or end of the
  document).
  */
  class AllSelection extends Selection {
      /**
      Create an all-selection over the given document.
      */
      constructor(doc) {
          super(doc.resolve(0), doc.resolve(doc.content.size));
      }
      replace(tr, content = Slice.empty) {
          if (content == Slice.empty) {
              tr.delete(0, tr.doc.content.size);
              let sel = Selection.atStart(tr.doc);
              if (!sel.eq(tr.selection))
                  tr.setSelection(sel);
          }
          else {
              super.replace(tr, content);
          }
      }
      toJSON() { return { type: "all" }; }
      /**
      @internal
      */
      static fromJSON(doc) { return new AllSelection(doc); }
      map(doc) { return new AllSelection(doc); }
      eq(other) { return other instanceof AllSelection; }
      getBookmark() { return AllBookmark; }
  }
  Selection.jsonID("all", AllSelection);
  const AllBookmark = {
      map() { return this; },
      resolve(doc) { return new AllSelection(doc); }
  };
  // FIXME we'll need some awareness of text direction when scanning for selections
  // Try to find a selection inside the given node. `pos` points at the
  // position where the search starts. When `text` is true, only return
  // text selections.
  function findSelectionIn(doc, node, pos, index, dir, text = false) {
      if (node.inlineContent)
          return TextSelection.create(doc, pos);
      for (let i = index - (dir > 0 ? 0 : 1); dir > 0 ? i < node.childCount : i >= 0; i += dir) {
          let child = node.child(i);
          if (!child.isAtom) {
              let inner = findSelectionIn(doc, child, pos + dir, dir < 0 ? child.childCount : 0, dir, text);
              if (inner)
                  return inner;
          }
          else if (!text && NodeSelection.isSelectable(child)) {
              return NodeSelection.create(doc, pos - (dir < 0 ? child.nodeSize : 0));
          }
          pos += child.nodeSize * dir;
      }
      return null;
  }
  function selectionToInsertionEnd(tr, startLen, bias) {
      let last = tr.steps.length - 1;
      if (last < startLen)
          return;
      let step = tr.steps[last];
      if (!(step instanceof ReplaceStep || step instanceof ReplaceAroundStep))
          return;
      let map = tr.mapping.maps[last], end;
      map.forEach((_from, _to, _newFrom, newTo) => { if (end == null)
          end = newTo; });
      tr.setSelection(Selection.near(tr.doc.resolve(end), bias));
  }

  const UPDATED_SEL = 1, UPDATED_MARKS = 2, UPDATED_SCROLL = 4;
  /**
  An editor state transaction, which can be applied to a state to
  create an updated state. Use
  [`EditorState.tr`](https://prosemirror.net/docs/ref/#state.EditorState.tr) to create an instance.

  Transactions track changes to the document (they are a subclass of
  [`Transform`](https://prosemirror.net/docs/ref/#transform.Transform)), but also other state changes,
  like selection updates and adjustments of the set of [stored
  marks](https://prosemirror.net/docs/ref/#state.EditorState.storedMarks). In addition, you can store
  metadata properties in a transaction, which are extra pieces of
  information that client code or plugins can use to describe what a
  transaction represents, so that they can update their [own
  state](https://prosemirror.net/docs/ref/#state.StateField) accordingly.

  The [editor view](https://prosemirror.net/docs/ref/#view.EditorView) uses a few metadata properties:
  it will attach a property `"pointer"` with the value `true` to
  selection transactions directly caused by mouse or touch input, and
  a `"uiEvent"` property of that may be `"paste"`, `"cut"`, or `"drop"`.
  */
  class Transaction extends Transform {
      /**
      @internal
      */
      constructor(state) {
          super(state.doc);
          // The step count for which the current selection is valid.
          this.curSelectionFor = 0;
          // Bitfield to track which aspects of the state were updated by
          // this transaction.
          this.updated = 0;
          // Object used to store metadata properties for the transaction.
          this.meta = Object.create(null);
          this.time = Date.now();
          this.curSelection = state.selection;
          this.storedMarks = state.storedMarks;
      }
      /**
      The transaction's current selection. This defaults to the editor
      selection [mapped](https://prosemirror.net/docs/ref/#state.Selection.map) through the steps in the
      transaction, but can be overwritten with
      [`setSelection`](https://prosemirror.net/docs/ref/#state.Transaction.setSelection).
      */
      get selection() {
          if (this.curSelectionFor < this.steps.length) {
              this.curSelection = this.curSelection.map(this.doc, this.mapping.slice(this.curSelectionFor));
              this.curSelectionFor = this.steps.length;
          }
          return this.curSelection;
      }
      /**
      Update the transaction's current selection. Will determine the
      selection that the editor gets when the transaction is applied.
      */
      setSelection(selection) {
          if (selection.$from.doc != this.doc)
              throw new RangeError("Selection passed to setSelection must point at the current document");
          this.curSelection = selection;
          this.curSelectionFor = this.steps.length;
          this.updated = (this.updated | UPDATED_SEL) & ~UPDATED_MARKS;
          this.storedMarks = null;
          return this;
      }
      /**
      Whether the selection was explicitly updated by this transaction.
      */
      get selectionSet() {
          return (this.updated & UPDATED_SEL) > 0;
      }
      /**
      Set the current stored marks.
      */
      setStoredMarks(marks) {
          this.storedMarks = marks;
          this.updated |= UPDATED_MARKS;
          return this;
      }
      /**
      Make sure the current stored marks or, if that is null, the marks
      at the selection, match the given set of marks. Does nothing if
      this is already the case.
      */
      ensureMarks(marks) {
          if (!Mark.sameSet(this.storedMarks || this.selection.$from.marks(), marks))
              this.setStoredMarks(marks);
          return this;
      }
      /**
      Add a mark to the set of stored marks.
      */
      addStoredMark(mark) {
          return this.ensureMarks(mark.addToSet(this.storedMarks || this.selection.$head.marks()));
      }
      /**
      Remove a mark or mark type from the set of stored marks.
      */
      removeStoredMark(mark) {
          return this.ensureMarks(mark.removeFromSet(this.storedMarks || this.selection.$head.marks()));
      }
      /**
      Whether the stored marks were explicitly set for this transaction.
      */
      get storedMarksSet() {
          return (this.updated & UPDATED_MARKS) > 0;
      }
      /**
      @internal
      */
      addStep(step, doc) {
          super.addStep(step, doc);
          this.updated = this.updated & ~UPDATED_MARKS;
          this.storedMarks = null;
      }
      /**
      Update the timestamp for the transaction.
      */
      setTime(time) {
          this.time = time;
          return this;
      }
      /**
      Replace the current selection with the given slice.
      */
      replaceSelection(slice) {
          this.selection.replace(this, slice);
          return this;
      }
      /**
      Replace the selection with the given node. When `inheritMarks` is
      true and the content is inline, it inherits the marks from the
      place where it is inserted.
      */
      replaceSelectionWith(node, inheritMarks = true) {
          let selection = this.selection;
          if (inheritMarks)
              node = node.mark(this.storedMarks || (selection.empty ? selection.$from.marks() : (selection.$from.marksAcross(selection.$to) || Mark.none)));
          selection.replaceWith(this, node);
          return this;
      }
      /**
      Delete the selection.
      */
      deleteSelection() {
          this.selection.replace(this);
          return this;
      }
      /**
      Replace the given range, or the selection if no range is given,
      with a text node containing the given string.
      */
      insertText(text, from, to) {
          let schema = this.doc.type.schema;
          if (from == null) {
              if (!text)
                  return this.deleteSelection();
              return this.replaceSelectionWith(schema.text(text), true);
          }
          else {
              if (to == null)
                  to = from;
              to = to == null ? from : to;
              if (!text)
                  return this.deleteRange(from, to);
              let marks = this.storedMarks;
              if (!marks) {
                  let $from = this.doc.resolve(from);
                  marks = to == from ? $from.marks() : $from.marksAcross(this.doc.resolve(to));
              }
              this.replaceRangeWith(from, to, schema.text(text, marks));
              if (!this.selection.empty)
                  this.setSelection(Selection.near(this.selection.$to));
              return this;
          }
      }
      /**
      Store a metadata property in this transaction, keyed either by
      name or by plugin.
      */
      setMeta(key, value) {
          this.meta[typeof key == "string" ? key : key.key] = value;
          return this;
      }
      /**
      Retrieve a metadata property for a given name or plugin.
      */
      getMeta(key) {
          return this.meta[typeof key == "string" ? key : key.key];
      }
      /**
      Returns true if this transaction doesn't contain any metadata,
      and can thus safely be extended.
      */
      get isGeneric() {
          for (let _ in this.meta)
              return false;
          return true;
      }
      /**
      Indicate that the editor should scroll the selection into view
      when updated to the state produced by this transaction.
      */
      scrollIntoView() {
          this.updated |= UPDATED_SCROLL;
          return this;
      }
      /**
      True when this transaction has had `scrollIntoView` called on it.
      */
      get scrolledIntoView() {
          return (this.updated & UPDATED_SCROLL) > 0;
      }
  }

  function bind(f, self) {
      return !self || !f ? f : f.bind(self);
  }
  class FieldDesc {
      constructor(name, desc, self) {
          this.name = name;
          this.init = bind(desc.init, self);
          this.apply = bind(desc.apply, self);
      }
  }
  const baseFields = [
      new FieldDesc("doc", {
          init(config) { return config.doc || config.schema.topNodeType.createAndFill(); },
          apply(tr) { return tr.doc; }
      }),
      new FieldDesc("selection", {
          init(config, instance) { return config.selection || Selection.atStart(instance.doc); },
          apply(tr) { return tr.selection; }
      }),
      new FieldDesc("storedMarks", {
          init(config) { return config.storedMarks || null; },
          apply(tr, _marks, _old, state) { return state.selection.$cursor ? tr.storedMarks : null; }
      }),
      new FieldDesc("scrollToSelection", {
          init() { return 0; },
          apply(tr, prev) { return tr.scrolledIntoView ? prev + 1 : prev; }
      })
  ];
  // Object wrapping the part of a state object that stays the same
  // across transactions. Stored in the state's `config` property.
  class Configuration {
      constructor(schema, plugins) {
          this.schema = schema;
          this.plugins = [];
          this.pluginsByKey = Object.create(null);
          this.fields = baseFields.slice();
          if (plugins)
              plugins.forEach(plugin => {
                  if (this.pluginsByKey[plugin.key])
                      throw new RangeError("Adding different instances of a keyed plugin (" + plugin.key + ")");
                  this.plugins.push(plugin);
                  this.pluginsByKey[plugin.key] = plugin;
                  if (plugin.spec.state)
                      this.fields.push(new FieldDesc(plugin.key, plugin.spec.state, plugin));
              });
      }
  }
  /**
  The state of a ProseMirror editor is represented by an object of
  this type. A state is a persistent data structure—it isn't
  updated, but rather a new state value is computed from an old one
  using the [`apply`](https://prosemirror.net/docs/ref/#state.EditorState.apply) method.

  A state holds a number of built-in fields, and plugins can
  [define](https://prosemirror.net/docs/ref/#state.PluginSpec.state) additional fields.
  */
  class EditorState {
      /**
      @internal
      */
      constructor(
      /**
      @internal
      */
      config) {
          this.config = config;
      }
      /**
      The schema of the state's document.
      */
      get schema() {
          return this.config.schema;
      }
      /**
      The plugins that are active in this state.
      */
      get plugins() {
          return this.config.plugins;
      }
      /**
      Apply the given transaction to produce a new state.
      */
      apply(tr) {
          return this.applyTransaction(tr).state;
      }
      /**
      @internal
      */
      filterTransaction(tr, ignore = -1) {
          for (let i = 0; i < this.config.plugins.length; i++)
              if (i != ignore) {
                  let plugin = this.config.plugins[i];
                  if (plugin.spec.filterTransaction && !plugin.spec.filterTransaction.call(plugin, tr, this))
                      return false;
              }
          return true;
      }
      /**
      Verbose variant of [`apply`](https://prosemirror.net/docs/ref/#state.EditorState.apply) that
      returns the precise transactions that were applied (which might
      be influenced by the [transaction
      hooks](https://prosemirror.net/docs/ref/#state.PluginSpec.filterTransaction) of
      plugins) along with the new state.
      */
      applyTransaction(rootTr) {
          if (!this.filterTransaction(rootTr))
              return { state: this, transactions: [] };
          let trs = [rootTr], newState = this.applyInner(rootTr), seen = null;
          // This loop repeatedly gives plugins a chance to respond to
          // transactions as new transactions are added, making sure to only
          // pass the transactions the plugin did not see before.
          for (;;) {
              let haveNew = false;
              for (let i = 0; i < this.config.plugins.length; i++) {
                  let plugin = this.config.plugins[i];
                  if (plugin.spec.appendTransaction) {
                      let n = seen ? seen[i].n : 0, oldState = seen ? seen[i].state : this;
                      let tr = n < trs.length &&
                          plugin.spec.appendTransaction.call(plugin, n ? trs.slice(n) : trs, oldState, newState);
                      if (tr && newState.filterTransaction(tr, i)) {
                          tr.setMeta("appendedTransaction", rootTr);
                          if (!seen) {
                              seen = [];
                              for (let j = 0; j < this.config.plugins.length; j++)
                                  seen.push(j < i ? { state: newState, n: trs.length } : { state: this, n: 0 });
                          }
                          trs.push(tr);
                          newState = newState.applyInner(tr);
                          haveNew = true;
                      }
                      if (seen)
                          seen[i] = { state: newState, n: trs.length };
                  }
              }
              if (!haveNew)
                  return { state: newState, transactions: trs };
          }
      }
      /**
      @internal
      */
      applyInner(tr) {
          if (!tr.before.eq(this.doc))
              throw new RangeError("Applying a mismatched transaction");
          let newInstance = new EditorState(this.config), fields = this.config.fields;
          for (let i = 0; i < fields.length; i++) {
              let field = fields[i];
              newInstance[field.name] = field.apply(tr, this[field.name], this, newInstance);
          }
          return newInstance;
      }
      /**
      Start a [transaction](https://prosemirror.net/docs/ref/#state.Transaction) from this state.
      */
      get tr() { return new Transaction(this); }
      /**
      Create a new state.
      */
      static create(config) {
          let $config = new Configuration(config.doc ? config.doc.type.schema : config.schema, config.plugins);
          let instance = new EditorState($config);
          for (let i = 0; i < $config.fields.length; i++)
              instance[$config.fields[i].name] = $config.fields[i].init(config, instance);
          return instance;
      }
      /**
      Create a new state based on this one, but with an adjusted set
      of active plugins. State fields that exist in both sets of
      plugins are kept unchanged. Those that no longer exist are
      dropped, and those that are new are initialized using their
      [`init`](https://prosemirror.net/docs/ref/#state.StateField.init) method, passing in the new
      configuration object..
      */
      reconfigure(config) {
          let $config = new Configuration(this.schema, config.plugins);
          let fields = $config.fields, instance = new EditorState($config);
          for (let i = 0; i < fields.length; i++) {
              let name = fields[i].name;
              instance[name] = this.hasOwnProperty(name) ? this[name] : fields[i].init(config, instance);
          }
          return instance;
      }
      /**
      Serialize this state to JSON. If you want to serialize the state
      of plugins, pass an object mapping property names to use in the
      resulting JSON object to plugin objects. The argument may also be
      a string or number, in which case it is ignored, to support the
      way `JSON.stringify` calls `toString` methods.
      */
      toJSON(pluginFields) {
          let result = { doc: this.doc.toJSON(), selection: this.selection.toJSON() };
          if (this.storedMarks)
              result.storedMarks = this.storedMarks.map(m => m.toJSON());
          if (pluginFields && typeof pluginFields == 'object')
              for (let prop in pluginFields) {
                  if (prop == "doc" || prop == "selection")
                      throw new RangeError("The JSON fields `doc` and `selection` are reserved");
                  let plugin = pluginFields[prop], state = plugin.spec.state;
                  if (state && state.toJSON)
                      result[prop] = state.toJSON.call(plugin, this[plugin.key]);
              }
          return result;
      }
      /**
      Deserialize a JSON representation of a state. `config` should
      have at least a `schema` field, and should contain array of
      plugins to initialize the state with. `pluginFields` can be used
      to deserialize the state of plugins, by associating plugin
      instances with the property names they use in the JSON object.
      */
      static fromJSON(config, json, pluginFields) {
          if (!json)
              throw new RangeError("Invalid input for EditorState.fromJSON");
          if (!config.schema)
              throw new RangeError("Required config field 'schema' missing");
          let $config = new Configuration(config.schema, config.plugins);
          let instance = new EditorState($config);
          $config.fields.forEach(field => {
              if (field.name == "doc") {
                  instance.doc = Node.fromJSON(config.schema, json.doc);
              }
              else if (field.name == "selection") {
                  instance.selection = Selection.fromJSON(instance.doc, json.selection);
              }
              else if (field.name == "storedMarks") {
                  if (json.storedMarks)
                      instance.storedMarks = json.storedMarks.map(config.schema.markFromJSON);
              }
              else {
                  if (pluginFields)
                      for (let prop in pluginFields) {
                          let plugin = pluginFields[prop], state = plugin.spec.state;
                          if (plugin.key == field.name && state && state.fromJSON &&
                              Object.prototype.hasOwnProperty.call(json, prop)) {
                              instance[field.name] = state.fromJSON.call(plugin, config, json[prop], instance);
                              return;
                          }
                      }
                  instance[field.name] = field.init(config, instance);
              }
          });
          return instance;
      }
  }

  function bindProps(obj, self, target) {
      for (let prop in obj) {
          let val = obj[prop];
          if (val instanceof Function)
              val = val.bind(self);
          else if (prop == "handleDOMEvents")
              val = bindProps(val, self, {});
          target[prop] = val;
      }
      return target;
  }
  /**
  Plugins bundle functionality that can be added to an editor.
  They are part of the [editor state](https://prosemirror.net/docs/ref/#state.EditorState) and
  may influence that state and the view that contains it.
  */
  class Plugin {
      /**
      Create a plugin.
      */
      constructor(
      /**
      The plugin's [spec object](https://prosemirror.net/docs/ref/#state.PluginSpec).
      */
      spec) {
          this.spec = spec;
          /**
          The [props](https://prosemirror.net/docs/ref/#view.EditorProps) exported by this plugin.
          */
          this.props = {};
          if (spec.props)
              bindProps(spec.props, this, this.props);
          this.key = spec.key ? spec.key.key : createKey("plugin");
      }
      /**
      Extract the plugin's state field from an editor state.
      */
      getState(state) { return state[this.key]; }
  }
  const keys = Object.create(null);
  function createKey(name) {
      if (name in keys)
          return name + "$" + ++keys[name];
      keys[name] = 0;
      return name + "$";
  }
  /**
  A key is used to [tag](https://prosemirror.net/docs/ref/#state.PluginSpec.key) plugins in a way
  that makes it possible to find them, given an editor state.
  Assigning a key does mean only one plugin of that type can be
  active in a state.
  */
  class PluginKey {
      /**
      Create a plugin key.
      */
      constructor(name = "key") { this.key = createKey(name); }
      /**
      Get the active plugin with this key, if any, from an editor
      state.
      */
      get(state) { return state.config.pluginsByKey[this.key]; }
      /**
      Get the plugin's state from an editor state.
      */
      getState(state) { return state[this.key]; }
  }

  var index$5 = /*#__PURE__*/Object.freeze({
    __proto__: null,
    AllSelection: AllSelection,
    EditorState: EditorState,
    NodeSelection: NodeSelection,
    Plugin: Plugin,
    PluginKey: PluginKey,
    Selection: Selection,
    SelectionRange: SelectionRange,
    TextSelection: TextSelection,
    Transaction: Transaction
  });

  const domIndex = function (node) {
      for (var index = 0;; index++) {
          node = node.previousSibling;
          if (!node)
              return index;
      }
  };
  const parentNode = function (node) {
      let parent = node.assignedSlot || node.parentNode;
      return parent && parent.nodeType == 11 ? parent.host : parent;
  };
  let reusedRange = null;
  // Note that this will always return the same range, because DOM range
  // objects are every expensive, and keep slowing down subsequent DOM
  // updates, for some reason.
  const textRange = function (node, from, to) {
      let range = reusedRange || (reusedRange = document.createRange());
      range.setEnd(node, to == null ? node.nodeValue.length : to);
      range.setStart(node, from || 0);
      return range;
  };
  // Scans forward and backward through DOM positions equivalent to the
  // given one to see if the two are in the same place (i.e. after a
  // text node vs at the end of that text node)
  const isEquivalentPosition = function (node, off, targetNode, targetOff) {
      return targetNode && (scanFor(node, off, targetNode, targetOff, -1) ||
          scanFor(node, off, targetNode, targetOff, 1));
  };
  const atomElements = /^(img|br|input|textarea|hr)$/i;
  function scanFor(node, off, targetNode, targetOff, dir) {
      for (;;) {
          if (node == targetNode && off == targetOff)
              return true;
          if (off == (dir < 0 ? 0 : nodeSize(node))) {
              let parent = node.parentNode;
              if (!parent || parent.nodeType != 1 || hasBlockDesc(node) || atomElements.test(node.nodeName) ||
                  node.contentEditable == "false")
                  return false;
              off = domIndex(node) + (dir < 0 ? 0 : 1);
              node = parent;
          }
          else if (node.nodeType == 1) {
              node = node.childNodes[off + (dir < 0 ? -1 : 0)];
              if (node.contentEditable == "false")
                  return false;
              off = dir < 0 ? nodeSize(node) : 0;
          }
          else {
              return false;
          }
      }
  }
  function nodeSize(node) {
      return node.nodeType == 3 ? node.nodeValue.length : node.childNodes.length;
  }
  function isOnEdge(node, offset, parent) {
      for (let atStart = offset == 0, atEnd = offset == nodeSize(node); atStart || atEnd;) {
          if (node == parent)
              return true;
          let index = domIndex(node);
          node = node.parentNode;
          if (!node)
              return false;
          atStart = atStart && index == 0;
          atEnd = atEnd && index == nodeSize(node);
      }
  }
  function hasBlockDesc(dom) {
      let desc;
      for (let cur = dom; cur; cur = cur.parentNode)
          if (desc = cur.pmViewDesc)
              break;
      return desc && desc.node && desc.node.isBlock && (desc.dom == dom || desc.contentDOM == dom);
  }
  // Work around Chrome issue https://bugs.chromium.org/p/chromium/issues/detail?id=447523
  // (isCollapsed inappropriately returns true in shadow dom)
  const selectionCollapsed = function (domSel) {
      return domSel.focusNode && isEquivalentPosition(domSel.focusNode, domSel.focusOffset, domSel.anchorNode, domSel.anchorOffset);
  };
  function keyEvent(keyCode, key) {
      let event = document.createEvent("Event");
      event.initEvent("keydown", true, true);
      event.keyCode = keyCode;
      event.key = event.code = key;
      return event;
  }
  function deepActiveElement(doc) {
      let elt = doc.activeElement;
      while (elt && elt.shadowRoot)
          elt = elt.shadowRoot.activeElement;
      return elt;
  }

  const nav = typeof navigator != "undefined" ? navigator : null;
  const doc$1 = typeof document != "undefined" ? document : null;
  const agent = (nav && nav.userAgent) || "";
  const ie_edge = /Edge\/(\d+)/.exec(agent);
  const ie_upto10 = /MSIE \d/.exec(agent);
  const ie_11up = /Trident\/(?:[7-9]|\d{2,})\..*rv:(\d+)/.exec(agent);
  const ie$1 = !!(ie_upto10 || ie_11up || ie_edge);
  const ie_version = ie_upto10 ? document.documentMode : ie_11up ? +ie_11up[1] : ie_edge ? +ie_edge[1] : 0;
  const gecko = !ie$1 && /gecko\/(\d+)/i.test(agent);
  gecko && +(/Firefox\/(\d+)/.exec(agent) || [0, 0])[1];
  const _chrome = !ie$1 && /Chrome\/(\d+)/.exec(agent);
  const chrome$1 = !!_chrome;
  const chrome_version = _chrome ? +_chrome[1] : 0;
  const safari = !ie$1 && !!nav && /Apple Computer/.test(nav.vendor);
  // Is true for both iOS and iPadOS for convenience
  const ios = safari && (/Mobile\/\w+/.test(agent) || !!nav && nav.maxTouchPoints > 2);
  const mac$3 = ios || (nav ? /Mac/.test(nav.platform) : false);
  const android = /Android \d/.test(agent);
  const webkit = !!doc$1 && "webkitFontSmoothing" in doc$1.documentElement.style;
  const webkit_version = webkit ? +(/\bAppleWebKit\/(\d+)/.exec(navigator.userAgent) || [0, 0])[1] : 0;

  function windowRect(doc) {
      return { left: 0, right: doc.documentElement.clientWidth,
          top: 0, bottom: doc.documentElement.clientHeight };
  }
  function getSide(value, side) {
      return typeof value == "number" ? value : value[side];
  }
  function clientRect(node) {
      let rect = node.getBoundingClientRect();
      // Adjust for elements with style "transform: scale()"
      let scaleX = (rect.width / node.offsetWidth) || 1;
      let scaleY = (rect.height / node.offsetHeight) || 1;
      // Make sure scrollbar width isn't included in the rectangle
      return { left: rect.left, right: rect.left + node.clientWidth * scaleX,
          top: rect.top, bottom: rect.top + node.clientHeight * scaleY };
  }
  function scrollRectIntoView(view, rect, startDOM) {
      let scrollThreshold = view.someProp("scrollThreshold") || 0, scrollMargin = view.someProp("scrollMargin") || 5;
      let doc = view.dom.ownerDocument;
      for (let parent = startDOM || view.dom;; parent = parentNode(parent)) {
          if (!parent)
              break;
          if (parent.nodeType != 1)
              continue;
          let elt = parent;
          let atTop = elt == doc.body;
          let bounding = atTop ? windowRect(doc) : clientRect(elt);
          let moveX = 0, moveY = 0;
          if (rect.top < bounding.top + getSide(scrollThreshold, "top"))
              moveY = -(bounding.top - rect.top + getSide(scrollMargin, "top"));
          else if (rect.bottom > bounding.bottom - getSide(scrollThreshold, "bottom"))
              moveY = rect.bottom - bounding.bottom + getSide(scrollMargin, "bottom");
          if (rect.left < bounding.left + getSide(scrollThreshold, "left"))
              moveX = -(bounding.left - rect.left + getSide(scrollMargin, "left"));
          else if (rect.right > bounding.right - getSide(scrollThreshold, "right"))
              moveX = rect.right - bounding.right + getSide(scrollMargin, "right");
          if (moveX || moveY) {
              if (atTop) {
                  doc.defaultView.scrollBy(moveX, moveY);
              }
              else {
                  let startX = elt.scrollLeft, startY = elt.scrollTop;
                  if (moveY)
                      elt.scrollTop += moveY;
                  if (moveX)
                      elt.scrollLeft += moveX;
                  let dX = elt.scrollLeft - startX, dY = elt.scrollTop - startY;
                  rect = { left: rect.left - dX, top: rect.top - dY, right: rect.right - dX, bottom: rect.bottom - dY };
              }
          }
          if (atTop)
              break;
      }
  }
  // Store the scroll position of the editor's parent nodes, along with
  // the top position of an element near the top of the editor, which
  // will be used to make sure the visible viewport remains stable even
  // when the size of the content above changes.
  function storeScrollPos(view) {
      let rect = view.dom.getBoundingClientRect(), startY = Math.max(0, rect.top);
      let refDOM, refTop;
      for (let x = (rect.left + rect.right) / 2, y = startY + 1; y < Math.min(innerHeight, rect.bottom); y += 5) {
          let dom = view.root.elementFromPoint(x, y);
          if (!dom || dom == view.dom || !view.dom.contains(dom))
              continue;
          let localRect = dom.getBoundingClientRect();
          if (localRect.top >= startY - 20) {
              refDOM = dom;
              refTop = localRect.top;
              break;
          }
      }
      return { refDOM: refDOM, refTop: refTop, stack: scrollStack(view.dom) };
  }
  function scrollStack(dom) {
      let stack = [], doc = dom.ownerDocument;
      for (let cur = dom; cur; cur = parentNode(cur)) {
          stack.push({ dom: cur, top: cur.scrollTop, left: cur.scrollLeft });
          if (dom == doc)
              break;
      }
      return stack;
  }
  // Reset the scroll position of the editor's parent nodes to that what
  // it was before, when storeScrollPos was called.
  function resetScrollPos({ refDOM, refTop, stack }) {
      let newRefTop = refDOM ? refDOM.getBoundingClientRect().top : 0;
      restoreScrollStack(stack, newRefTop == 0 ? 0 : newRefTop - refTop);
  }
  function restoreScrollStack(stack, dTop) {
      for (let i = 0; i < stack.length; i++) {
          let { dom, top, left } = stack[i];
          if (dom.scrollTop != top + dTop)
              dom.scrollTop = top + dTop;
          if (dom.scrollLeft != left)
              dom.scrollLeft = left;
      }
  }
  let preventScrollSupported = null;
  // Feature-detects support for .focus({preventScroll: true}), and uses
  // a fallback kludge when not supported.
  function focusPreventScroll(dom) {
      if (dom.setActive)
          return dom.setActive(); // in IE
      if (preventScrollSupported)
          return dom.focus(preventScrollSupported);
      let stored = scrollStack(dom);
      dom.focus(preventScrollSupported == null ? {
          get preventScroll() {
              preventScrollSupported = { preventScroll: true };
              return true;
          }
      } : undefined);
      if (!preventScrollSupported) {
          preventScrollSupported = false;
          restoreScrollStack(stored, 0);
      }
  }
  function findOffsetInNode(node, coords) {
      let closest, dxClosest = 2e8, coordsClosest, offset = 0;
      let rowBot = coords.top, rowTop = coords.top;
      for (let child = node.firstChild, childIndex = 0; child; child = child.nextSibling, childIndex++) {
          let rects;
          if (child.nodeType == 1)
              rects = child.getClientRects();
          else if (child.nodeType == 3)
              rects = textRange(child).getClientRects();
          else
              continue;
          for (let i = 0; i < rects.length; i++) {
              let rect = rects[i];
              if (rect.top <= rowBot && rect.bottom >= rowTop) {
                  rowBot = Math.max(rect.bottom, rowBot);
                  rowTop = Math.min(rect.top, rowTop);
                  let dx = rect.left > coords.left ? rect.left - coords.left
                      : rect.right < coords.left ? coords.left - rect.right : 0;
                  if (dx < dxClosest) {
                      closest = child;
                      dxClosest = dx;
                      coordsClosest = dx && closest.nodeType == 3 ? {
                          left: rect.right < coords.left ? rect.right : rect.left,
                          top: coords.top
                      } : coords;
                      if (child.nodeType == 1 && dx)
                          offset = childIndex + (coords.left >= (rect.left + rect.right) / 2 ? 1 : 0);
                      continue;
                  }
              }
              if (!closest && (coords.left >= rect.right && coords.top >= rect.top ||
                  coords.left >= rect.left && coords.top >= rect.bottom))
                  offset = childIndex + 1;
          }
      }
      if (closest && closest.nodeType == 3)
          return findOffsetInText(closest, coordsClosest);
      if (!closest || (dxClosest && closest.nodeType == 1))
          return { node, offset };
      return findOffsetInNode(closest, coordsClosest);
  }
  function findOffsetInText(node, coords) {
      let len = node.nodeValue.length;
      let range = document.createRange();
      for (let i = 0; i < len; i++) {
          range.setEnd(node, i + 1);
          range.setStart(node, i);
          let rect = singleRect(range, 1);
          if (rect.top == rect.bottom)
              continue;
          if (inRect(coords, rect))
              return { node, offset: i + (coords.left >= (rect.left + rect.right) / 2 ? 1 : 0) };
      }
      return { node, offset: 0 };
  }
  function inRect(coords, rect) {
      return coords.left >= rect.left - 1 && coords.left <= rect.right + 1 &&
          coords.top >= rect.top - 1 && coords.top <= rect.bottom + 1;
  }
  function targetKludge(dom, coords) {
      let parent = dom.parentNode;
      if (parent && /^li$/i.test(parent.nodeName) && coords.left < dom.getBoundingClientRect().left)
          return parent;
      return dom;
  }
  function posFromElement(view, elt, coords) {
      let { node, offset } = findOffsetInNode(elt, coords), bias = -1;
      if (node.nodeType == 1 && !node.firstChild) {
          let rect = node.getBoundingClientRect();
          bias = rect.left != rect.right && coords.left > (rect.left + rect.right) / 2 ? 1 : -1;
      }
      return view.docView.posFromDOM(node, offset, bias);
  }
  function posFromCaret(view, node, offset, coords) {
      // Browser (in caretPosition/RangeFromPoint) will agressively
      // normalize towards nearby inline nodes. Since we are interested in
      // positions between block nodes too, we first walk up the hierarchy
      // of nodes to see if there are block nodes that the coordinates
      // fall outside of. If so, we take the position before/after that
      // block. If not, we call `posFromDOM` on the raw node/offset.
      let outsideBlock = -1;
      for (let cur = node, sawBlock = false;;) {
          if (cur == view.dom)
              break;
          let desc = view.docView.nearestDesc(cur, true);
          if (!desc)
              return null;
          if (desc.dom.nodeType == 1 && (desc.node.isBlock && desc.parent && !sawBlock || !desc.contentDOM)) {
              let rect = desc.dom.getBoundingClientRect();
              if (desc.node.isBlock && desc.parent && !sawBlock) {
                  sawBlock = true;
                  if (rect.left > coords.left || rect.top > coords.top)
                      outsideBlock = desc.posBefore;
                  else if (rect.right < coords.left || rect.bottom < coords.top)
                      outsideBlock = desc.posAfter;
              }
              if (!desc.contentDOM && outsideBlock < 0) {
                  // If we are inside a leaf, return the side of the leaf closer to the coords
                  let before = desc.node.isBlock ? coords.top < (rect.top + rect.bottom) / 2
                      : coords.left < (rect.left + rect.right) / 2;
                  return before ? desc.posBefore : desc.posAfter;
              }
          }
          cur = desc.dom.parentNode;
      }
      return outsideBlock > -1 ? outsideBlock : view.docView.posFromDOM(node, offset, -1);
  }
  function elementFromPoint(element, coords, box) {
      let len = element.childNodes.length;
      if (len && box.top < box.bottom) {
          for (let startI = Math.max(0, Math.min(len - 1, Math.floor(len * (coords.top - box.top) / (box.bottom - box.top)) - 2)), i = startI;;) {
              let child = element.childNodes[i];
              if (child.nodeType == 1) {
                  let rects = child.getClientRects();
                  for (let j = 0; j < rects.length; j++) {
                      let rect = rects[j];
                      if (inRect(coords, rect))
                          return elementFromPoint(child, coords, rect);
                  }
              }
              if ((i = (i + 1) % len) == startI)
                  break;
          }
      }
      return element;
  }
  // Given an x,y position on the editor, get the position in the document.
  function posAtCoords(view, coords) {
      let doc = view.dom.ownerDocument, node, offset = 0;
      if (doc.caretPositionFromPoint) {
          try { // Firefox throws for this call in hard-to-predict circumstances (#994)
              let pos = doc.caretPositionFromPoint(coords.left, coords.top);
              if (pos)
                  ({ offsetNode: node, offset } = pos);
          }
          catch (_) { }
      }
      if (!node && doc.caretRangeFromPoint) {
          let range = doc.caretRangeFromPoint(coords.left, coords.top);
          if (range)
              ({ startContainer: node, startOffset: offset } = range);
      }
      let elt = (view.root.elementFromPoint ? view.root : doc)
          .elementFromPoint(coords.left, coords.top);
      let pos;
      if (!elt || !view.dom.contains(elt.nodeType != 1 ? elt.parentNode : elt)) {
          let box = view.dom.getBoundingClientRect();
          if (!inRect(coords, box))
              return null;
          elt = elementFromPoint(view.dom, coords, box);
          if (!elt)
              return null;
      }
      // Safari's caretRangeFromPoint returns nonsense when on a draggable element
      if (safari) {
          for (let p = elt; node && p; p = parentNode(p))
              if (p.draggable)
                  node = undefined;
      }
      elt = targetKludge(elt, coords);
      if (node) {
          if (gecko && node.nodeType == 1) {
              // Firefox will sometimes return offsets into <input> nodes, which
              // have no actual children, from caretPositionFromPoint (#953)
              offset = Math.min(offset, node.childNodes.length);
              // It'll also move the returned position before image nodes,
              // even if those are behind it.
              if (offset < node.childNodes.length) {
                  let next = node.childNodes[offset], box;
                  if (next.nodeName == "IMG" && (box = next.getBoundingClientRect()).right <= coords.left &&
                      box.bottom > coords.top)
                      offset++;
              }
          }
          // Suspiciously specific kludge to work around caret*FromPoint
          // never returning a position at the end of the document
          if (node == view.dom && offset == node.childNodes.length - 1 && node.lastChild.nodeType == 1 &&
              coords.top > node.lastChild.getBoundingClientRect().bottom)
              pos = view.state.doc.content.size;
          // Ignore positions directly after a BR, since caret*FromPoint
          // 'round up' positions that would be more accurately placed
          // before the BR node.
          else if (offset == 0 || node.nodeType != 1 || node.childNodes[offset - 1].nodeName != "BR")
              pos = posFromCaret(view, node, offset, coords);
      }
      if (pos == null)
          pos = posFromElement(view, elt, coords);
      let desc = view.docView.nearestDesc(elt, true);
      return { pos, inside: desc ? desc.posAtStart - desc.border : -1 };
  }
  function singleRect(target, bias) {
      let rects = target.getClientRects();
      return !rects.length ? target.getBoundingClientRect() : rects[bias < 0 ? 0 : rects.length - 1];
  }
  const BIDI = /[\u0590-\u05f4\u0600-\u06ff\u0700-\u08ac]/;
  // Given a position in the document model, get a bounding box of the
  // character at that position, relative to the window.
  function coordsAtPos(view, pos, side) {
      let { node, offset, atom } = view.docView.domFromPos(pos, side < 0 ? -1 : 1);
      let supportEmptyRange = webkit || gecko;
      if (node.nodeType == 3) {
          // These browsers support querying empty text ranges. Prefer that in
          // bidi context or when at the end of a node.
          if (supportEmptyRange && (BIDI.test(node.nodeValue) || (side < 0 ? !offset : offset == node.nodeValue.length))) {
              let rect = singleRect(textRange(node, offset, offset), side);
              // Firefox returns bad results (the position before the space)
              // when querying a position directly after line-broken
              // whitespace. Detect this situation and and kludge around it
              if (gecko && offset && /\s/.test(node.nodeValue[offset - 1]) && offset < node.nodeValue.length) {
                  let rectBefore = singleRect(textRange(node, offset - 1, offset - 1), -1);
                  if (rectBefore.top == rect.top) {
                      let rectAfter = singleRect(textRange(node, offset, offset + 1), -1);
                      if (rectAfter.top != rect.top)
                          return flattenV(rectAfter, rectAfter.left < rectBefore.left);
                  }
              }
              return rect;
          }
          else {
              let from = offset, to = offset, takeSide = side < 0 ? 1 : -1;
              if (side < 0 && !offset) {
                  to++;
                  takeSide = -1;
              }
              else if (side >= 0 && offset == node.nodeValue.length) {
                  from--;
                  takeSide = 1;
              }
              else if (side < 0) {
                  from--;
              }
              else {
                  to++;
              }
              return flattenV(singleRect(textRange(node, from, to), 1), takeSide < 0);
          }
      }
      let $dom = view.state.doc.resolve(pos - (atom || 0));
      // Return a horizontal line in block context
      if (!$dom.parent.inlineContent) {
          if (atom == null && offset && (side < 0 || offset == nodeSize(node))) {
              let before = node.childNodes[offset - 1];
              if (before.nodeType == 1)
                  return flattenH(before.getBoundingClientRect(), false);
          }
          if (atom == null && offset < nodeSize(node)) {
              let after = node.childNodes[offset];
              if (after.nodeType == 1)
                  return flattenH(after.getBoundingClientRect(), true);
          }
          return flattenH(node.getBoundingClientRect(), side >= 0);
      }
      // Inline, not in text node (this is not Bidi-safe)
      if (atom == null && offset && (side < 0 || offset == nodeSize(node))) {
          let before = node.childNodes[offset - 1];
          let target = before.nodeType == 3 ? textRange(before, nodeSize(before) - (supportEmptyRange ? 0 : 1))
              // BR nodes tend to only return the rectangle before them.
              // Only use them if they are the last element in their parent
              : before.nodeType == 1 && (before.nodeName != "BR" || !before.nextSibling) ? before : null;
          if (target)
              return flattenV(singleRect(target, 1), false);
      }
      if (atom == null && offset < nodeSize(node)) {
          let after = node.childNodes[offset];
          while (after.pmViewDesc && after.pmViewDesc.ignoreForCoords)
              after = after.nextSibling;
          let target = !after ? null : after.nodeType == 3 ? textRange(after, 0, (supportEmptyRange ? 0 : 1))
              : after.nodeType == 1 ? after : null;
          if (target)
              return flattenV(singleRect(target, -1), true);
      }
      // All else failed, just try to get a rectangle for the target node
      return flattenV(singleRect(node.nodeType == 3 ? textRange(node) : node, -side), side >= 0);
  }
  function flattenV(rect, left) {
      if (rect.width == 0)
          return rect;
      let x = left ? rect.left : rect.right;
      return { top: rect.top, bottom: rect.bottom, left: x, right: x };
  }
  function flattenH(rect, top) {
      if (rect.height == 0)
          return rect;
      let y = top ? rect.top : rect.bottom;
      return { top: y, bottom: y, left: rect.left, right: rect.right };
  }
  function withFlushedState(view, state, f) {
      let viewState = view.state, active = view.root.activeElement;
      if (viewState != state)
          view.updateState(state);
      if (active != view.dom)
          view.focus();
      try {
          return f();
      }
      finally {
          if (viewState != state)
              view.updateState(viewState);
          if (active != view.dom && active)
              active.focus();
      }
  }
  // Whether vertical position motion in a given direction
  // from a position would leave a text block.
  function endOfTextblockVertical(view, state, dir) {
      let sel = state.selection;
      let $pos = dir == "up" ? sel.$from : sel.$to;
      return withFlushedState(view, state, () => {
          let { node: dom } = view.docView.domFromPos($pos.pos, dir == "up" ? -1 : 1);
          for (;;) {
              let nearest = view.docView.nearestDesc(dom, true);
              if (!nearest)
                  break;
              if (nearest.node.isBlock) {
                  dom = nearest.contentDOM || nearest.dom;
                  break;
              }
              dom = nearest.dom.parentNode;
          }
          let coords = coordsAtPos(view, $pos.pos, 1);
          for (let child = dom.firstChild; child; child = child.nextSibling) {
              let boxes;
              if (child.nodeType == 1)
                  boxes = child.getClientRects();
              else if (child.nodeType == 3)
                  boxes = textRange(child, 0, child.nodeValue.length).getClientRects();
              else
                  continue;
              for (let i = 0; i < boxes.length; i++) {
                  let box = boxes[i];
                  if (box.bottom > box.top + 1 &&
                      (dir == "up" ? coords.top - box.top > (box.bottom - coords.top) * 2
                          : box.bottom - coords.bottom > (coords.bottom - box.top) * 2))
                      return false;
              }
          }
          return true;
      });
  }
  const maybeRTL = /[\u0590-\u08ac]/;
  function endOfTextblockHorizontal(view, state, dir) {
      let { $head } = state.selection;
      if (!$head.parent.isTextblock)
          return false;
      let offset = $head.parentOffset, atStart = !offset, atEnd = offset == $head.parent.content.size;
      let sel = view.domSelection();
      // If the textblock is all LTR, or the browser doesn't support
      // Selection.modify (Edge), fall back to a primitive approach
      if (!maybeRTL.test($head.parent.textContent) || !sel.modify)
          return dir == "left" || dir == "backward" ? atStart : atEnd;
      return withFlushedState(view, state, () => {
          // This is a huge hack, but appears to be the best we can
          // currently do: use `Selection.modify` to move the selection by
          // one character, and see if that moves the cursor out of the
          // textblock (or doesn't move it at all, when at the start/end of
          // the document).
          let { focusNode: oldNode, focusOffset: oldOff, anchorNode, anchorOffset } = view.domSelectionRange();
          let oldBidiLevel = sel.caretBidiLevel // Only for Firefox
          ;
          sel.modify("move", dir, "character");
          let parentDOM = $head.depth ? view.docView.domAfterPos($head.before()) : view.dom;
          let { focusNode: newNode, focusOffset: newOff } = view.domSelectionRange();
          let result = newNode && !parentDOM.contains(newNode.nodeType == 1 ? newNode : newNode.parentNode) ||
              (oldNode == newNode && oldOff == newOff);
          // Restore the previous selection
          try {
              sel.collapse(anchorNode, anchorOffset);
              if (oldNode && (oldNode != anchorNode || oldOff != anchorOffset) && sel.extend)
                  sel.extend(oldNode, oldOff);
          }
          catch (_) { }
          if (oldBidiLevel != null)
              sel.caretBidiLevel = oldBidiLevel;
          return result;
      });
  }
  let cachedState = null;
  let cachedDir = null;
  let cachedResult = false;
  function endOfTextblock(view, state, dir) {
      if (cachedState == state && cachedDir == dir)
          return cachedResult;
      cachedState = state;
      cachedDir = dir;
      return cachedResult = dir == "up" || dir == "down"
          ? endOfTextblockVertical(view, state, dir)
          : endOfTextblockHorizontal(view, state, dir);
  }

  // View descriptions are data structures that describe the DOM that is
  // used to represent the editor's content. They are used for:
  //
  // - Incremental redrawing when the document changes
  //
  // - Figuring out what part of the document a given DOM position
  //   corresponds to
  //
  // - Wiring in custom implementations of the editing interface for a
  //   given node
  //
  // They form a doubly-linked mutable tree, starting at `view.docView`.
  const NOT_DIRTY = 0, CHILD_DIRTY = 1, CONTENT_DIRTY = 2, NODE_DIRTY = 3;
  // Superclass for the various kinds of descriptions. Defines their
  // basic structure and shared methods.
  class ViewDesc {
      constructor(parent, children, dom, 
      // This is the node that holds the child views. It may be null for
      // descs that don't have children.
      contentDOM) {
          this.parent = parent;
          this.children = children;
          this.dom = dom;
          this.contentDOM = contentDOM;
          this.dirty = NOT_DIRTY;
          // An expando property on the DOM node provides a link back to its
          // description.
          dom.pmViewDesc = this;
      }
      // Used to check whether a given description corresponds to a
      // widget/mark/node.
      matchesWidget(widget) { return false; }
      matchesMark(mark) { return false; }
      matchesNode(node, outerDeco, innerDeco) { return false; }
      matchesHack(nodeName) { return false; }
      // When parsing in-editor content (in domchange.js), we allow
      // descriptions to determine the parse rules that should be used to
      // parse them.
      parseRule() { return null; }
      // Used by the editor's event handler to ignore events that come
      // from certain descs.
      stopEvent(event) { return false; }
      // The size of the content represented by this desc.
      get size() {
          let size = 0;
          for (let i = 0; i < this.children.length; i++)
              size += this.children[i].size;
          return size;
      }
      // For block nodes, this represents the space taken up by their
      // start/end tokens.
      get border() { return 0; }
      destroy() {
          this.parent = undefined;
          if (this.dom.pmViewDesc == this)
              this.dom.pmViewDesc = undefined;
          for (let i = 0; i < this.children.length; i++)
              this.children[i].destroy();
      }
      posBeforeChild(child) {
          for (let i = 0, pos = this.posAtStart;; i++) {
              let cur = this.children[i];
              if (cur == child)
                  return pos;
              pos += cur.size;
          }
      }
      get posBefore() {
          return this.parent.posBeforeChild(this);
      }
      get posAtStart() {
          return this.parent ? this.parent.posBeforeChild(this) + this.border : 0;
      }
      get posAfter() {
          return this.posBefore + this.size;
      }
      get posAtEnd() {
          return this.posAtStart + this.size - 2 * this.border;
      }
      localPosFromDOM(dom, offset, bias) {
          // If the DOM position is in the content, use the child desc after
          // it to figure out a position.
          if (this.contentDOM && this.contentDOM.contains(dom.nodeType == 1 ? dom : dom.parentNode)) {
              if (bias < 0) {
                  let domBefore, desc;
                  if (dom == this.contentDOM) {
                      domBefore = dom.childNodes[offset - 1];
                  }
                  else {
                      while (dom.parentNode != this.contentDOM)
                          dom = dom.parentNode;
                      domBefore = dom.previousSibling;
                  }
                  while (domBefore && !((desc = domBefore.pmViewDesc) && desc.parent == this))
                      domBefore = domBefore.previousSibling;
                  return domBefore ? this.posBeforeChild(desc) + desc.size : this.posAtStart;
              }
              else {
                  let domAfter, desc;
                  if (dom == this.contentDOM) {
                      domAfter = dom.childNodes[offset];
                  }
                  else {
                      while (dom.parentNode != this.contentDOM)
                          dom = dom.parentNode;
                      domAfter = dom.nextSibling;
                  }
                  while (domAfter && !((desc = domAfter.pmViewDesc) && desc.parent == this))
                      domAfter = domAfter.nextSibling;
                  return domAfter ? this.posBeforeChild(desc) : this.posAtEnd;
              }
          }
          // Otherwise, use various heuristics, falling back on the bias
          // parameter, to determine whether to return the position at the
          // start or at the end of this view desc.
          let atEnd;
          if (dom == this.dom && this.contentDOM) {
              atEnd = offset > domIndex(this.contentDOM);
          }
          else if (this.contentDOM && this.contentDOM != this.dom && this.dom.contains(this.contentDOM)) {
              atEnd = dom.compareDocumentPosition(this.contentDOM) & 2;
          }
          else if (this.dom.firstChild) {
              if (offset == 0)
                  for (let search = dom;; search = search.parentNode) {
                      if (search == this.dom) {
                          atEnd = false;
                          break;
                      }
                      if (search.previousSibling)
                          break;
                  }
              if (atEnd == null && offset == dom.childNodes.length)
                  for (let search = dom;; search = search.parentNode) {
                      if (search == this.dom) {
                          atEnd = true;
                          break;
                      }
                      if (search.nextSibling)
                          break;
                  }
          }
          return (atEnd == null ? bias > 0 : atEnd) ? this.posAtEnd : this.posAtStart;
      }
      nearestDesc(dom, onlyNodes = false) {
          for (let first = true, cur = dom; cur; cur = cur.parentNode) {
              let desc = this.getDesc(cur), nodeDOM;
              if (desc && (!onlyNodes || desc.node)) {
                  // If dom is outside of this desc's nodeDOM, don't count it.
                  if (first && (nodeDOM = desc.nodeDOM) &&
                      !(nodeDOM.nodeType == 1 ? nodeDOM.contains(dom.nodeType == 1 ? dom : dom.parentNode) : nodeDOM == dom))
                      first = false;
                  else
                      return desc;
              }
          }
      }
      getDesc(dom) {
          let desc = dom.pmViewDesc;
          for (let cur = desc; cur; cur = cur.parent)
              if (cur == this)
                  return desc;
      }
      posFromDOM(dom, offset, bias) {
          for (let scan = dom; scan; scan = scan.parentNode) {
              let desc = this.getDesc(scan);
              if (desc)
                  return desc.localPosFromDOM(dom, offset, bias);
          }
          return -1;
      }
      // Find the desc for the node after the given pos, if any. (When a
      // parent node overrode rendering, there might not be one.)
      descAt(pos) {
          for (let i = 0, offset = 0; i < this.children.length; i++) {
              let child = this.children[i], end = offset + child.size;
              if (offset == pos && end != offset) {
                  while (!child.border && child.children.length)
                      child = child.children[0];
                  return child;
              }
              if (pos < end)
                  return child.descAt(pos - offset - child.border);
              offset = end;
          }
      }
      domFromPos(pos, side) {
          if (!this.contentDOM)
              return { node: this.dom, offset: 0, atom: pos + 1 };
          // First find the position in the child array
          let i = 0, offset = 0;
          for (let curPos = 0; i < this.children.length; i++) {
              let child = this.children[i], end = curPos + child.size;
              if (end > pos || child instanceof TrailingHackViewDesc) {
                  offset = pos - curPos;
                  break;
              }
              curPos = end;
          }
          // If this points into the middle of a child, call through
          if (offset)
              return this.children[i].domFromPos(offset - this.children[i].border, side);
          // Go back if there were any zero-length widgets with side >= 0 before this point
          for (let prev; i && !(prev = this.children[i - 1]).size && prev instanceof WidgetViewDesc && prev.side >= 0; i--) { }
          // Scan towards the first useable node
          if (side <= 0) {
              let prev, enter = true;
              for (;; i--, enter = false) {
                  prev = i ? this.children[i - 1] : null;
                  if (!prev || prev.dom.parentNode == this.contentDOM)
                      break;
              }
              if (prev && side && enter && !prev.border && !prev.domAtom)
                  return prev.domFromPos(prev.size, side);
              return { node: this.contentDOM, offset: prev ? domIndex(prev.dom) + 1 : 0 };
          }
          else {
              let next, enter = true;
              for (;; i++, enter = false) {
                  next = i < this.children.length ? this.children[i] : null;
                  if (!next || next.dom.parentNode == this.contentDOM)
                      break;
              }
              if (next && enter && !next.border && !next.domAtom)
                  return next.domFromPos(0, side);
              return { node: this.contentDOM, offset: next ? domIndex(next.dom) : this.contentDOM.childNodes.length };
          }
      }
      // Used to find a DOM range in a single parent for a given changed
      // range.
      parseRange(from, to, base = 0) {
          if (this.children.length == 0)
              return { node: this.contentDOM, from, to, fromOffset: 0, toOffset: this.contentDOM.childNodes.length };
          let fromOffset = -1, toOffset = -1;
          for (let offset = base, i = 0;; i++) {
              let child = this.children[i], end = offset + child.size;
              if (fromOffset == -1 && from <= end) {
                  let childBase = offset + child.border;
                  // FIXME maybe descend mark views to parse a narrower range?
                  if (from >= childBase && to <= end - child.border && child.node &&
                      child.contentDOM && this.contentDOM.contains(child.contentDOM))
                      return child.parseRange(from, to, childBase);
                  from = offset;
                  for (let j = i; j > 0; j--) {
                      let prev = this.children[j - 1];
                      if (prev.size && prev.dom.parentNode == this.contentDOM && !prev.emptyChildAt(1)) {
                          fromOffset = domIndex(prev.dom) + 1;
                          break;
                      }
                      from -= prev.size;
                  }
                  if (fromOffset == -1)
                      fromOffset = 0;
              }
              if (fromOffset > -1 && (end > to || i == this.children.length - 1)) {
                  to = end;
                  for (let j = i + 1; j < this.children.length; j++) {
                      let next = this.children[j];
                      if (next.size && next.dom.parentNode == this.contentDOM && !next.emptyChildAt(-1)) {
                          toOffset = domIndex(next.dom);
                          break;
                      }
                      to += next.size;
                  }
                  if (toOffset == -1)
                      toOffset = this.contentDOM.childNodes.length;
                  break;
              }
              offset = end;
          }
          return { node: this.contentDOM, from, to, fromOffset, toOffset };
      }
      emptyChildAt(side) {
          if (this.border || !this.contentDOM || !this.children.length)
              return false;
          let child = this.children[side < 0 ? 0 : this.children.length - 1];
          return child.size == 0 || child.emptyChildAt(side);
      }
      domAfterPos(pos) {
          let { node, offset } = this.domFromPos(pos, 0);
          if (node.nodeType != 1 || offset == node.childNodes.length)
              throw new RangeError("No node after pos " + pos);
          return node.childNodes[offset];
      }
      // View descs are responsible for setting any selection that falls
      // entirely inside of them, so that custom implementations can do
      // custom things with the selection. Note that this falls apart when
      // a selection starts in such a node and ends in another, in which
      // case we just use whatever domFromPos produces as a best effort.
      setSelection(anchor, head, root, force = false) {
          // If the selection falls entirely in a child, give it to that child
          let from = Math.min(anchor, head), to = Math.max(anchor, head);
          for (let i = 0, offset = 0; i < this.children.length; i++) {
              let child = this.children[i], end = offset + child.size;
              if (from > offset && to < end)
                  return child.setSelection(anchor - offset - child.border, head - offset - child.border, root, force);
              offset = end;
          }
          let anchorDOM = this.domFromPos(anchor, anchor ? -1 : 1);
          let headDOM = head == anchor ? anchorDOM : this.domFromPos(head, head ? -1 : 1);
          let domSel = root.getSelection();
          let brKludge = false;
          // On Firefox, using Selection.collapse to put the cursor after a
          // BR node for some reason doesn't always work (#1073). On Safari,
          // the cursor sometimes inexplicable visually lags behind its
          // reported position in such situations (#1092).
          if ((gecko || safari) && anchor == head) {
              let { node, offset } = anchorDOM;
              if (node.nodeType == 3) {
                  brKludge = !!(offset && node.nodeValue[offset - 1] == "\n");
                  // Issue #1128
                  if (brKludge && offset == node.nodeValue.length) {
                      for (let scan = node, after; scan; scan = scan.parentNode) {
                          if (after = scan.nextSibling) {
                              if (after.nodeName == "BR")
                                  anchorDOM = headDOM = { node: after.parentNode, offset: domIndex(after) + 1 };
                              break;
                          }
                          let desc = scan.pmViewDesc;
                          if (desc && desc.node && desc.node.isBlock)
                              break;
                      }
                  }
              }
              else {
                  let prev = node.childNodes[offset - 1];
                  brKludge = prev && (prev.nodeName == "BR" || prev.contentEditable == "false");
              }
          }
          // Firefox can act strangely when the selection is in front of an
          // uneditable node. See #1163 and https://bugzilla.mozilla.org/show_bug.cgi?id=1709536
          if (gecko && domSel.focusNode && domSel.focusNode != headDOM.node && domSel.focusNode.nodeType == 1) {
              let after = domSel.focusNode.childNodes[domSel.focusOffset];
              if (after && after.contentEditable == "false")
                  force = true;
          }
          if (!(force || brKludge && safari) &&
              isEquivalentPosition(anchorDOM.node, anchorDOM.offset, domSel.anchorNode, domSel.anchorOffset) &&
              isEquivalentPosition(headDOM.node, headDOM.offset, domSel.focusNode, domSel.focusOffset))
              return;
          // Selection.extend can be used to create an 'inverted' selection
          // (one where the focus is before the anchor), but not all
          // browsers support it yet.
          let domSelExtended = false;
          if ((domSel.extend || anchor == head) && !brKludge) {
              domSel.collapse(anchorDOM.node, anchorDOM.offset);
              try {
                  if (anchor != head)
                      domSel.extend(headDOM.node, headDOM.offset);
                  domSelExtended = true;
              }
              catch (_) {
                  // In some cases with Chrome the selection is empty after calling
                  // collapse, even when it should be valid. This appears to be a bug, but
                  // it is difficult to isolate. If this happens fallback to the old path
                  // without using extend.
                  // Similarly, this could crash on Safari if the editor is hidden, and
                  // there was no selection.
              }
          }
          if (!domSelExtended) {
              if (anchor > head) {
                  let tmp = anchorDOM;
                  anchorDOM = headDOM;
                  headDOM = tmp;
              }
              let range = document.createRange();
              range.setEnd(headDOM.node, headDOM.offset);
              range.setStart(anchorDOM.node, anchorDOM.offset);
              domSel.removeAllRanges();
              domSel.addRange(range);
          }
      }
      ignoreMutation(mutation) {
          return !this.contentDOM && mutation.type != "selection";
      }
      get contentLost() {
          return this.contentDOM && this.contentDOM != this.dom && !this.dom.contains(this.contentDOM);
      }
      // Remove a subtree of the element tree that has been touched
      // by a DOM change, so that the next update will redraw it.
      markDirty(from, to) {
          for (let offset = 0, i = 0; i < this.children.length; i++) {
              let child = this.children[i], end = offset + child.size;
              if (offset == end ? from <= end && to >= offset : from < end && to > offset) {
                  let startInside = offset + child.border, endInside = end - child.border;
                  if (from >= startInside && to <= endInside) {
                      this.dirty = from == offset || to == end ? CONTENT_DIRTY : CHILD_DIRTY;
                      if (from == startInside && to == endInside &&
                          (child.contentLost || child.dom.parentNode != this.contentDOM))
                          child.dirty = NODE_DIRTY;
                      else
                          child.markDirty(from - startInside, to - startInside);
                      return;
                  }
                  else {
                      child.dirty = child.dom == child.contentDOM && child.dom.parentNode == this.contentDOM && !child.children.length
                          ? CONTENT_DIRTY : NODE_DIRTY;
                  }
              }
              offset = end;
          }
          this.dirty = CONTENT_DIRTY;
      }
      markParentsDirty() {
          let level = 1;
          for (let node = this.parent; node; node = node.parent, level++) {
              let dirty = level == 1 ? CONTENT_DIRTY : CHILD_DIRTY;
              if (node.dirty < dirty)
                  node.dirty = dirty;
          }
      }
      get domAtom() { return false; }
      get ignoreForCoords() { return false; }
  }
  // A widget desc represents a widget decoration, which is a DOM node
  // drawn between the document nodes.
  class WidgetViewDesc extends ViewDesc {
      constructor(parent, widget, view, pos) {
          let self, dom = widget.type.toDOM;
          if (typeof dom == "function")
              dom = dom(view, () => {
                  if (!self)
                      return pos;
                  if (self.parent)
                      return self.parent.posBeforeChild(self);
              });
          if (!widget.type.spec.raw) {
              if (dom.nodeType != 1) {
                  let wrap = document.createElement("span");
                  wrap.appendChild(dom);
                  dom = wrap;
              }
              dom.contentEditable = "false";
              dom.classList.add("ProseMirror-widget");
          }
          super(parent, [], dom, null);
          this.widget = widget;
          this.widget = widget;
          self = this;
      }
      matchesWidget(widget) {
          return this.dirty == NOT_DIRTY && widget.type.eq(this.widget.type);
      }
      parseRule() { return { ignore: true }; }
      stopEvent(event) {
          let stop = this.widget.spec.stopEvent;
          return stop ? stop(event) : false;
      }
      ignoreMutation(mutation) {
          return mutation.type != "selection" || this.widget.spec.ignoreSelection;
      }
      destroy() {
          this.widget.type.destroy(this.dom);
          super.destroy();
      }
      get domAtom() { return true; }
      get side() { return this.widget.type.side; }
  }
  class CompositionViewDesc extends ViewDesc {
      constructor(parent, dom, textDOM, text) {
          super(parent, [], dom, null);
          this.textDOM = textDOM;
          this.text = text;
      }
      get size() { return this.text.length; }
      localPosFromDOM(dom, offset) {
          if (dom != this.textDOM)
              return this.posAtStart + (offset ? this.size : 0);
          return this.posAtStart + offset;
      }
      domFromPos(pos) {
          return { node: this.textDOM, offset: pos };
      }
      ignoreMutation(mut) {
          return mut.type === 'characterData' && mut.target.nodeValue == mut.oldValue;
      }
  }
  // A mark desc represents a mark. May have multiple children,
  // depending on how the mark is split. Note that marks are drawn using
  // a fixed nesting order, for simplicity and predictability, so in
  // some cases they will be split more often than would appear
  // necessary.
  class MarkViewDesc extends ViewDesc {
      constructor(parent, mark, dom, contentDOM) {
          super(parent, [], dom, contentDOM);
          this.mark = mark;
      }
      static create(parent, mark, inline, view) {
          let custom = view.nodeViews[mark.type.name];
          let spec = custom && custom(mark, view, inline);
          if (!spec || !spec.dom)
              spec = DOMSerializer.renderSpec(document, mark.type.spec.toDOM(mark, inline));
          return new MarkViewDesc(parent, mark, spec.dom, spec.contentDOM || spec.dom);
      }
      parseRule() {
          if ((this.dirty & NODE_DIRTY) || this.mark.type.spec.reparseInView)
              return null;
          return { mark: this.mark.type.name, attrs: this.mark.attrs, contentElement: this.contentDOM || undefined };
      }
      matchesMark(mark) { return this.dirty != NODE_DIRTY && this.mark.eq(mark); }
      markDirty(from, to) {
          super.markDirty(from, to);
          // Move dirty info to nearest node view
          if (this.dirty != NOT_DIRTY) {
              let parent = this.parent;
              while (!parent.node)
                  parent = parent.parent;
              if (parent.dirty < this.dirty)
                  parent.dirty = this.dirty;
              this.dirty = NOT_DIRTY;
          }
      }
      slice(from, to, view) {
          let copy = MarkViewDesc.create(this.parent, this.mark, true, view);
          let nodes = this.children, size = this.size;
          if (to < size)
              nodes = replaceNodes(nodes, to, size, view);
          if (from > 0)
              nodes = replaceNodes(nodes, 0, from, view);
          for (let i = 0; i < nodes.length; i++)
              nodes[i].parent = copy;
          copy.children = nodes;
          return copy;
      }
  }
  // Node view descs are the main, most common type of view desc, and
  // correspond to an actual node in the document. Unlike mark descs,
  // they populate their child array themselves.
  class NodeViewDesc extends ViewDesc {
      constructor(parent, node, outerDeco, innerDeco, dom, contentDOM, nodeDOM, view, pos) {
          super(parent, [], dom, contentDOM);
          this.node = node;
          this.outerDeco = outerDeco;
          this.innerDeco = innerDeco;
          this.nodeDOM = nodeDOM;
          if (contentDOM)
              this.updateChildren(view, pos);
      }
      // By default, a node is rendered using the `toDOM` method from the
      // node type spec. But client code can use the `nodeViews` spec to
      // supply a custom node view, which can influence various aspects of
      // the way the node works.
      //
      // (Using subclassing for this was intentionally decided against,
      // since it'd require exposing a whole slew of finicky
      // implementation details to the user code that they probably will
      // never need.)
      static create(parent, node, outerDeco, innerDeco, view, pos) {
          let custom = view.nodeViews[node.type.name], descObj;
          let spec = custom && custom(node, view, () => {
              // (This is a function that allows the custom view to find its
              // own position)
              if (!descObj)
                  return pos;
              if (descObj.parent)
                  return descObj.parent.posBeforeChild(descObj);
          }, outerDeco, innerDeco);
          let dom = spec && spec.dom, contentDOM = spec && spec.contentDOM;
          if (node.isText) {
              if (!dom)
                  dom = document.createTextNode(node.text);
              else if (dom.nodeType != 3)
                  throw new RangeError("Text must be rendered as a DOM text node");
          }
          else if (!dom) {
              ({ dom, contentDOM } = DOMSerializer.renderSpec(document, node.type.spec.toDOM(node)));
          }
          if (!contentDOM && !node.isText && dom.nodeName != "BR") { // Chrome gets confused by <br contenteditable=false>
              if (!dom.hasAttribute("contenteditable"))
                  dom.contentEditable = "false";
              if (node.type.spec.draggable)
                  dom.draggable = true;
          }
          let nodeDOM = dom;
          dom = applyOuterDeco(dom, outerDeco, node);
          if (spec)
              return descObj = new CustomNodeViewDesc(parent, node, outerDeco, innerDeco, dom, contentDOM || null, nodeDOM, spec, view, pos + 1);
          else if (node.isText)
              return new TextViewDesc(parent, node, outerDeco, innerDeco, dom, nodeDOM, view);
          else
              return new NodeViewDesc(parent, node, outerDeco, innerDeco, dom, contentDOM || null, nodeDOM, view, pos + 1);
      }
      parseRule() {
          // Experimental kludge to allow opt-in re-parsing of nodes
          if (this.node.type.spec.reparseInView)
              return null;
          // FIXME the assumption that this can always return the current
          // attrs means that if the user somehow manages to change the
          // attrs in the dom, that won't be picked up. Not entirely sure
          // whether this is a problem
          let rule = { node: this.node.type.name, attrs: this.node.attrs };
          if (this.node.type.whitespace == "pre")
              rule.preserveWhitespace = "full";
          if (!this.contentDOM) {
              rule.getContent = () => this.node.content;
          }
          else if (!this.contentLost) {
              rule.contentElement = this.contentDOM;
          }
          else {
              // Chrome likes to randomly recreate parent nodes when
              // backspacing things. When that happens, this tries to find the
              // new parent.
              for (let i = this.children.length - 1; i >= 0; i--) {
                  let child = this.children[i];
                  if (this.dom.contains(child.dom.parentNode)) {
                      rule.contentElement = child.dom.parentNode;
                      break;
                  }
              }
              if (!rule.contentElement)
                  rule.getContent = () => Fragment.empty;
          }
          return rule;
      }
      matchesNode(node, outerDeco, innerDeco) {
          return this.dirty == NOT_DIRTY && node.eq(this.node) &&
              sameOuterDeco(outerDeco, this.outerDeco) && innerDeco.eq(this.innerDeco);
      }
      get size() { return this.node.nodeSize; }
      get border() { return this.node.isLeaf ? 0 : 1; }
      // Syncs `this.children` to match `this.node.content` and the local
      // decorations, possibly introducing nesting for marks. Then, in a
      // separate step, syncs the DOM inside `this.contentDOM` to
      // `this.children`.
      updateChildren(view, pos) {
          let inline = this.node.inlineContent, off = pos;
          let composition = view.composing ? this.localCompositionInfo(view, pos) : null;
          let localComposition = composition && composition.pos > -1 ? composition : null;
          let compositionInChild = composition && composition.pos < 0;
          let updater = new ViewTreeUpdater(this, localComposition && localComposition.node, view);
          iterDeco(this.node, this.innerDeco, (widget, i, insideNode) => {
              if (widget.spec.marks)
                  updater.syncToMarks(widget.spec.marks, inline, view);
              else if (widget.type.side >= 0 && !insideNode)
                  updater.syncToMarks(i == this.node.childCount ? Mark.none : this.node.child(i).marks, inline, view);
              // If the next node is a desc matching this widget, reuse it,
              // otherwise insert the widget as a new view desc.
              updater.placeWidget(widget, view, off);
          }, (child, outerDeco, innerDeco, i) => {
              // Make sure the wrapping mark descs match the node's marks.
              updater.syncToMarks(child.marks, inline, view);
              // Try several strategies for drawing this node
              let compIndex;
              if (updater.findNodeMatch(child, outerDeco, innerDeco, i)) ;
              else if (compositionInChild && view.state.selection.from > off &&
                  view.state.selection.to < off + child.nodeSize &&
                  (compIndex = updater.findIndexWithChild(composition.node)) > -1 &&
                  updater.updateNodeAt(child, outerDeco, innerDeco, compIndex, view)) ;
              else if (updater.updateNextNode(child, outerDeco, innerDeco, view, i)) ;
              else {
                  // Add it as a new view
                  updater.addNode(child, outerDeco, innerDeco, view, off);
              }
              off += child.nodeSize;
          });
          // Drop all remaining descs after the current position.
          updater.syncToMarks([], inline, view);
          if (this.node.isTextblock)
              updater.addTextblockHacks();
          updater.destroyRest();
          // Sync the DOM if anything changed
          if (updater.changed || this.dirty == CONTENT_DIRTY) {
              // May have to protect focused DOM from being changed if a composition is active
              if (localComposition)
                  this.protectLocalComposition(view, localComposition);
              renderDescs(this.contentDOM, this.children, view);
              if (ios)
                  iosHacks(this.dom);
          }
      }
      localCompositionInfo(view, pos) {
          // Only do something if both the selection and a focused text node
          // are inside of this node
          let { from, to } = view.state.selection;
          if (!(view.state.selection instanceof TextSelection) || from < pos || to > pos + this.node.content.size)
              return null;
          let sel = view.domSelectionRange();
          let textNode = nearbyTextNode(sel.focusNode, sel.focusOffset);
          if (!textNode || !this.dom.contains(textNode.parentNode))
              return null;
          if (this.node.inlineContent) {
              // Find the text in the focused node in the node, stop if it's not
              // there (may have been modified through other means, in which
              // case it should overwritten)
              let text = textNode.nodeValue;
              let textPos = findTextInFragment(this.node.content, text, from - pos, to - pos);
              return textPos < 0 ? null : { node: textNode, pos: textPos, text };
          }
          else {
              return { node: textNode, pos: -1, text: "" };
          }
      }
      protectLocalComposition(view, { node, pos, text }) {
          // The node is already part of a local view desc, leave it there
          if (this.getDesc(node))
              return;
          // Create a composition view for the orphaned nodes
          let topNode = node;
          for (;; topNode = topNode.parentNode) {
              if (topNode.parentNode == this.contentDOM)
                  break;
              while (topNode.previousSibling)
                  topNode.parentNode.removeChild(topNode.previousSibling);
              while (topNode.nextSibling)
                  topNode.parentNode.removeChild(topNode.nextSibling);
              if (topNode.pmViewDesc)
                  topNode.pmViewDesc = undefined;
          }
          let desc = new CompositionViewDesc(this, topNode, node, text);
          view.input.compositionNodes.push(desc);
          // Patch up this.children to contain the composition view
          this.children = replaceNodes(this.children, pos, pos + text.length, view, desc);
      }
      // If this desc must be updated to match the given node decoration,
      // do so and return true.
      update(node, outerDeco, innerDeco, view) {
          if (this.dirty == NODE_DIRTY ||
              !node.sameMarkup(this.node))
              return false;
          this.updateInner(node, outerDeco, innerDeco, view);
          return true;
      }
      updateInner(node, outerDeco, innerDeco, view) {
          this.updateOuterDeco(outerDeco);
          this.node = node;
          this.innerDeco = innerDeco;
          if (this.contentDOM)
              this.updateChildren(view, this.posAtStart);
          this.dirty = NOT_DIRTY;
      }
      updateOuterDeco(outerDeco) {
          if (sameOuterDeco(outerDeco, this.outerDeco))
              return;
          let needsWrap = this.nodeDOM.nodeType != 1;
          let oldDOM = this.dom;
          this.dom = patchOuterDeco(this.dom, this.nodeDOM, computeOuterDeco(this.outerDeco, this.node, needsWrap), computeOuterDeco(outerDeco, this.node, needsWrap));
          if (this.dom != oldDOM) {
              oldDOM.pmViewDesc = undefined;
              this.dom.pmViewDesc = this;
          }
          this.outerDeco = outerDeco;
      }
      // Mark this node as being the selected node.
      selectNode() {
          if (this.nodeDOM.nodeType == 1)
              this.nodeDOM.classList.add("ProseMirror-selectednode");
          if (this.contentDOM || !this.node.type.spec.draggable)
              this.dom.draggable = true;
      }
      // Remove selected node marking from this node.
      deselectNode() {
          if (this.nodeDOM.nodeType == 1)
              this.nodeDOM.classList.remove("ProseMirror-selectednode");
          if (this.contentDOM || !this.node.type.spec.draggable)
              this.dom.removeAttribute("draggable");
      }
      get domAtom() { return this.node.isAtom; }
  }
  // Create a view desc for the top-level document node, to be exported
  // and used by the view class.
  function docViewDesc(doc, outerDeco, innerDeco, dom, view) {
      applyOuterDeco(dom, outerDeco, doc);
      return new NodeViewDesc(undefined, doc, outerDeco, innerDeco, dom, dom, dom, view, 0);
  }
  class TextViewDesc extends NodeViewDesc {
      constructor(parent, node, outerDeco, innerDeco, dom, nodeDOM, view) {
          super(parent, node, outerDeco, innerDeco, dom, null, nodeDOM, view, 0);
      }
      parseRule() {
          let skip = this.nodeDOM.parentNode;
          while (skip && skip != this.dom && !skip.pmIsDeco)
              skip = skip.parentNode;
          return { skip: (skip || true) };
      }
      update(node, outerDeco, innerDeco, view) {
          if (this.dirty == NODE_DIRTY || (this.dirty != NOT_DIRTY && !this.inParent()) ||
              !node.sameMarkup(this.node))
              return false;
          this.updateOuterDeco(outerDeco);
          if ((this.dirty != NOT_DIRTY || node.text != this.node.text) && node.text != this.nodeDOM.nodeValue) {
              this.nodeDOM.nodeValue = node.text;
              if (view.trackWrites == this.nodeDOM)
                  view.trackWrites = null;
          }
          this.node = node;
          this.dirty = NOT_DIRTY;
          return true;
      }
      inParent() {
          let parentDOM = this.parent.contentDOM;
          for (let n = this.nodeDOM; n; n = n.parentNode)
              if (n == parentDOM)
                  return true;
          return false;
      }
      domFromPos(pos) {
          return { node: this.nodeDOM, offset: pos };
      }
      localPosFromDOM(dom, offset, bias) {
          if (dom == this.nodeDOM)
              return this.posAtStart + Math.min(offset, this.node.text.length);
          return super.localPosFromDOM(dom, offset, bias);
      }
      ignoreMutation(mutation) {
          return mutation.type != "characterData" && mutation.type != "selection";
      }
      slice(from, to, view) {
          let node = this.node.cut(from, to), dom = document.createTextNode(node.text);
          return new TextViewDesc(this.parent, node, this.outerDeco, this.innerDeco, dom, dom, view);
      }
      markDirty(from, to) {
          super.markDirty(from, to);
          if (this.dom != this.nodeDOM && (from == 0 || to == this.nodeDOM.nodeValue.length))
              this.dirty = NODE_DIRTY;
      }
      get domAtom() { return false; }
  }
  // A dummy desc used to tag trailing BR or IMG nodes created to work
  // around contentEditable terribleness.
  class TrailingHackViewDesc extends ViewDesc {
      parseRule() { return { ignore: true }; }
      matchesHack(nodeName) { return this.dirty == NOT_DIRTY && this.dom.nodeName == nodeName; }
      get domAtom() { return true; }
      get ignoreForCoords() { return this.dom.nodeName == "IMG"; }
  }
  // A separate subclass is used for customized node views, so that the
  // extra checks only have to be made for nodes that are actually
  // customized.
  class CustomNodeViewDesc extends NodeViewDesc {
      constructor(parent, node, outerDeco, innerDeco, dom, contentDOM, nodeDOM, spec, view, pos) {
          super(parent, node, outerDeco, innerDeco, dom, contentDOM, nodeDOM, view, pos);
          this.spec = spec;
      }
      // A custom `update` method gets to decide whether the update goes
      // through. If it does, and there's a `contentDOM` node, our logic
      // updates the children.
      update(node, outerDeco, innerDeco, view) {
          if (this.dirty == NODE_DIRTY)
              return false;
          if (this.spec.update) {
              let result = this.spec.update(node, outerDeco, innerDeco);
              if (result)
                  this.updateInner(node, outerDeco, innerDeco, view);
              return result;
          }
          else if (!this.contentDOM && !node.isLeaf) {
              return false;
          }
          else {
              return super.update(node, outerDeco, innerDeco, view);
          }
      }
      selectNode() {
          this.spec.selectNode ? this.spec.selectNode() : super.selectNode();
      }
      deselectNode() {
          this.spec.deselectNode ? this.spec.deselectNode() : super.deselectNode();
      }
      setSelection(anchor, head, root, force) {
          this.spec.setSelection ? this.spec.setSelection(anchor, head, root)
              : super.setSelection(anchor, head, root, force);
      }
      destroy() {
          if (this.spec.destroy)
              this.spec.destroy();
          super.destroy();
      }
      stopEvent(event) {
          return this.spec.stopEvent ? this.spec.stopEvent(event) : false;
      }
      ignoreMutation(mutation) {
          return this.spec.ignoreMutation ? this.spec.ignoreMutation(mutation) : super.ignoreMutation(mutation);
      }
  }
  // Sync the content of the given DOM node with the nodes associated
  // with the given array of view descs, recursing into mark descs
  // because this should sync the subtree for a whole node at a time.
  function renderDescs(parentDOM, descs, view) {
      let dom = parentDOM.firstChild, written = false;
      for (let i = 0; i < descs.length; i++) {
          let desc = descs[i], childDOM = desc.dom;
          if (childDOM.parentNode == parentDOM) {
              while (childDOM != dom) {
                  dom = rm(dom);
                  written = true;
              }
              dom = dom.nextSibling;
          }
          else {
              written = true;
              parentDOM.insertBefore(childDOM, dom);
          }
          if (desc instanceof MarkViewDesc) {
              let pos = dom ? dom.previousSibling : parentDOM.lastChild;
              renderDescs(desc.contentDOM, desc.children, view);
              dom = pos ? pos.nextSibling : parentDOM.firstChild;
          }
      }
      while (dom) {
          dom = rm(dom);
          written = true;
      }
      if (written && view.trackWrites == parentDOM)
          view.trackWrites = null;
  }
  const OuterDecoLevel = function (nodeName) {
      if (nodeName)
          this.nodeName = nodeName;
  };
  OuterDecoLevel.prototype = Object.create(null);
  const noDeco = [new OuterDecoLevel];
  function computeOuterDeco(outerDeco, node, needsWrap) {
      if (outerDeco.length == 0)
          return noDeco;
      let top = needsWrap ? noDeco[0] : new OuterDecoLevel, result = [top];
      for (let i = 0; i < outerDeco.length; i++) {
          let attrs = outerDeco[i].type.attrs;
          if (!attrs)
              continue;
          if (attrs.nodeName)
              result.push(top = new OuterDecoLevel(attrs.nodeName));
          for (let name in attrs) {
              let val = attrs[name];
              if (val == null)
                  continue;
              if (needsWrap && result.length == 1)
                  result.push(top = new OuterDecoLevel(node.isInline ? "span" : "div"));
              if (name == "class")
                  top.class = (top.class ? top.class + " " : "") + val;
              else if (name == "style")
                  top.style = (top.style ? top.style + ";" : "") + val;
              else if (name != "nodeName")
                  top[name] = val;
          }
      }
      return result;
  }
  function patchOuterDeco(outerDOM, nodeDOM, prevComputed, curComputed) {
      // Shortcut for trivial case
      if (prevComputed == noDeco && curComputed == noDeco)
          return nodeDOM;
      let curDOM = nodeDOM;
      for (let i = 0; i < curComputed.length; i++) {
          let deco = curComputed[i], prev = prevComputed[i];
          if (i) {
              let parent;
              if (prev && prev.nodeName == deco.nodeName && curDOM != outerDOM &&
                  (parent = curDOM.parentNode) && parent.nodeName.toLowerCase() == deco.nodeName) {
                  curDOM = parent;
              }
              else {
                  parent = document.createElement(deco.nodeName);
                  parent.pmIsDeco = true;
                  parent.appendChild(curDOM);
                  prev = noDeco[0];
                  curDOM = parent;
              }
          }
          patchAttributes(curDOM, prev || noDeco[0], deco);
      }
      return curDOM;
  }
  function patchAttributes(dom, prev, cur) {
      for (let name in prev)
          if (name != "class" && name != "style" && name != "nodeName" && !(name in cur))
              dom.removeAttribute(name);
      for (let name in cur)
          if (name != "class" && name != "style" && name != "nodeName" && cur[name] != prev[name])
              dom.setAttribute(name, cur[name]);
      if (prev.class != cur.class) {
          let prevList = prev.class ? prev.class.split(" ").filter(Boolean) : [];
          let curList = cur.class ? cur.class.split(" ").filter(Boolean) : [];
          for (let i = 0; i < prevList.length; i++)
              if (curList.indexOf(prevList[i]) == -1)
                  dom.classList.remove(prevList[i]);
          for (let i = 0; i < curList.length; i++)
              if (prevList.indexOf(curList[i]) == -1)
                  dom.classList.add(curList[i]);
          if (dom.classList.length == 0)
              dom.removeAttribute("class");
      }
      if (prev.style != cur.style) {
          if (prev.style) {
              let prop = /\s*([\w\-\xa1-\uffff]+)\s*:(?:"(?:\\.|[^"])*"|'(?:\\.|[^'])*'|\(.*?\)|[^;])*/g, m;
              while (m = prop.exec(prev.style))
                  dom.style.removeProperty(m[1]);
          }
          if (cur.style)
              dom.style.cssText += cur.style;
      }
  }
  function applyOuterDeco(dom, deco, node) {
      return patchOuterDeco(dom, dom, noDeco, computeOuterDeco(deco, node, dom.nodeType != 1));
  }
  function sameOuterDeco(a, b) {
      if (a.length != b.length)
          return false;
      for (let i = 0; i < a.length; i++)
          if (!a[i].type.eq(b[i].type))
              return false;
      return true;
  }
  // Remove a DOM node and return its next sibling.
  function rm(dom) {
      let next = dom.nextSibling;
      dom.parentNode.removeChild(dom);
      return next;
  }
  // Helper class for incrementally updating a tree of mark descs and
  // the widget and node descs inside of them.
  class ViewTreeUpdater {
      constructor(top, lock, view) {
          this.lock = lock;
          this.view = view;
          // Index into `this.top`'s child array, represents the current
          // update position.
          this.index = 0;
          // When entering a mark, the current top and index are pushed
          // onto this.
          this.stack = [];
          // Tracks whether anything was changed
          this.changed = false;
          this.top = top;
          this.preMatch = preMatch(top.node.content, top);
      }
      // Destroy and remove the children between the given indices in
      // `this.top`.
      destroyBetween(start, end) {
          if (start == end)
              return;
          for (let i = start; i < end; i++)
              this.top.children[i].destroy();
          this.top.children.splice(start, end - start);
          this.changed = true;
      }
      // Destroy all remaining children in `this.top`.
      destroyRest() {
          this.destroyBetween(this.index, this.top.children.length);
      }
      // Sync the current stack of mark descs with the given array of
      // marks, reusing existing mark descs when possible.
      syncToMarks(marks, inline, view) {
          let keep = 0, depth = this.stack.length >> 1;
          let maxKeep = Math.min(depth, marks.length);
          while (keep < maxKeep &&
              (keep == depth - 1 ? this.top : this.stack[(keep + 1) << 1])
                  .matchesMark(marks[keep]) && marks[keep].type.spec.spanning !== false)
              keep++;
          while (keep < depth) {
              this.destroyRest();
              this.top.dirty = NOT_DIRTY;
              this.index = this.stack.pop();
              this.top = this.stack.pop();
              depth--;
          }
          while (depth < marks.length) {
              this.stack.push(this.top, this.index + 1);
              let found = -1;
              for (let i = this.index; i < Math.min(this.index + 3, this.top.children.length); i++) {
                  let next = this.top.children[i];
                  if (next.matchesMark(marks[depth]) && !this.isLocked(next.dom)) {
                      found = i;
                      break;
                  }
              }
              if (found > -1) {
                  if (found > this.index) {
                      this.changed = true;
                      this.destroyBetween(this.index, found);
                  }
                  this.top = this.top.children[this.index];
              }
              else {
                  let markDesc = MarkViewDesc.create(this.top, marks[depth], inline, view);
                  this.top.children.splice(this.index, 0, markDesc);
                  this.top = markDesc;
                  this.changed = true;
              }
              this.index = 0;
              depth++;
          }
      }
      // Try to find a node desc matching the given data. Skip over it and
      // return true when successful.
      findNodeMatch(node, outerDeco, innerDeco, index) {
          let found = -1, targetDesc;
          if (index >= this.preMatch.index &&
              (targetDesc = this.preMatch.matches[index - this.preMatch.index]).parent == this.top &&
              targetDesc.matchesNode(node, outerDeco, innerDeco)) {
              found = this.top.children.indexOf(targetDesc, this.index);
          }
          else {
              for (let i = this.index, e = Math.min(this.top.children.length, i + 5); i < e; i++) {
                  let child = this.top.children[i];
                  if (child.matchesNode(node, outerDeco, innerDeco) && !this.preMatch.matched.has(child)) {
                      found = i;
                      break;
                  }
              }
          }
          if (found < 0)
              return false;
          this.destroyBetween(this.index, found);
          this.index++;
          return true;
      }
      updateNodeAt(node, outerDeco, innerDeco, index, view) {
          let child = this.top.children[index];
          if (child.dirty == NODE_DIRTY && child.dom == child.contentDOM)
              child.dirty = CONTENT_DIRTY;
          if (!child.update(node, outerDeco, innerDeco, view))
              return false;
          this.destroyBetween(this.index, index);
          this.index++;
          return true;
      }
      findIndexWithChild(domNode) {
          for (;;) {
              let parent = domNode.parentNode;
              if (!parent)
                  return -1;
              if (parent == this.top.contentDOM) {
                  let desc = domNode.pmViewDesc;
                  if (desc)
                      for (let i = this.index; i < this.top.children.length; i++) {
                          if (this.top.children[i] == desc)
                              return i;
                      }
                  return -1;
              }
              domNode = parent;
          }
      }
      // Try to update the next node, if any, to the given data. Checks
      // pre-matches to avoid overwriting nodes that could still be used.
      updateNextNode(node, outerDeco, innerDeco, view, index) {
          for (let i = this.index; i < this.top.children.length; i++) {
              let next = this.top.children[i];
              if (next instanceof NodeViewDesc) {
                  let preMatch = this.preMatch.matched.get(next);
                  if (preMatch != null && preMatch != index)
                      return false;
                  let nextDOM = next.dom;
                  // Can't update if nextDOM is or contains this.lock, except if
                  // it's a text node whose content already matches the new text
                  // and whose decorations match the new ones.
                  let locked = this.isLocked(nextDOM) &&
                      !(node.isText && next.node && next.node.isText && next.nodeDOM.nodeValue == node.text &&
                          next.dirty != NODE_DIRTY && sameOuterDeco(outerDeco, next.outerDeco));
                  if (!locked && next.update(node, outerDeco, innerDeco, view)) {
                      this.destroyBetween(this.index, i);
                      if (next.dom != nextDOM)
                          this.changed = true;
                      this.index++;
                      return true;
                  }
                  break;
              }
          }
          return false;
      }
      // Insert the node as a newly created node desc.
      addNode(node, outerDeco, innerDeco, view, pos) {
          this.top.children.splice(this.index++, 0, NodeViewDesc.create(this.top, node, outerDeco, innerDeco, view, pos));
          this.changed = true;
      }
      placeWidget(widget, view, pos) {
          let next = this.index < this.top.children.length ? this.top.children[this.index] : null;
          if (next && next.matchesWidget(widget) &&
              (widget == next.widget || !next.widget.type.toDOM.parentNode)) {
              this.index++;
          }
          else {
              let desc = new WidgetViewDesc(this.top, widget, view, pos);
              this.top.children.splice(this.index++, 0, desc);
              this.changed = true;
          }
      }
      // Make sure a textblock looks and behaves correctly in
      // contentEditable.
      addTextblockHacks() {
          let lastChild = this.top.children[this.index - 1], parent = this.top;
          while (lastChild instanceof MarkViewDesc) {
              parent = lastChild;
              lastChild = parent.children[parent.children.length - 1];
          }
          if (!lastChild || // Empty textblock
              !(lastChild instanceof TextViewDesc) ||
              /\n$/.test(lastChild.node.text) ||
              (this.view.requiresGeckoHackNode && /\s$/.test(lastChild.node.text))) {
              // Avoid bugs in Safari's cursor drawing (#1165) and Chrome's mouse selection (#1152)
              if ((safari || chrome$1) && lastChild && lastChild.dom.contentEditable == "false")
                  this.addHackNode("IMG", parent);
              this.addHackNode("BR", this.top);
          }
      }
      addHackNode(nodeName, parent) {
          if (parent == this.top && this.index < parent.children.length && parent.children[this.index].matchesHack(nodeName)) {
              this.index++;
          }
          else {
              let dom = document.createElement(nodeName);
              if (nodeName == "IMG") {
                  dom.className = "ProseMirror-separator";
                  dom.alt = "";
              }
              if (nodeName == "BR")
                  dom.className = "ProseMirror-trailingBreak";
              let hack = new TrailingHackViewDesc(this.top, [], dom, null);
              if (parent != this.top)
                  parent.children.push(hack);
              else
                  parent.children.splice(this.index++, 0, hack);
              this.changed = true;
          }
      }
      isLocked(node) {
          return this.lock && (node == this.lock || node.nodeType == 1 && node.contains(this.lock.parentNode));
      }
  }
  // Iterate from the end of the fragment and array of descs to find
  // directly matching ones, in order to avoid overeagerly reusing those
  // for other nodes. Returns the fragment index of the first node that
  // is part of the sequence of matched nodes at the end of the
  // fragment.
  function preMatch(frag, parentDesc) {
      let curDesc = parentDesc, descI = curDesc.children.length;
      let fI = frag.childCount, matched = new Map, matches = [];
      outer: while (fI > 0) {
          let desc;
          for (;;) {
              if (descI) {
                  let next = curDesc.children[descI - 1];
                  if (next instanceof MarkViewDesc) {
                      curDesc = next;
                      descI = next.children.length;
                  }
                  else {
                      desc = next;
                      descI--;
                      break;
                  }
              }
              else if (curDesc == parentDesc) {
                  break outer;
              }
              else {
                  // FIXME
                  descI = curDesc.parent.children.indexOf(curDesc);
                  curDesc = curDesc.parent;
              }
          }
          let node = desc.node;
          if (!node)
              continue;
          if (node != frag.child(fI - 1))
              break;
          --fI;
          matched.set(desc, fI);
          matches.push(desc);
      }
      return { index: fI, matched, matches: matches.reverse() };
  }
  function compareSide(a, b) {
      return a.type.side - b.type.side;
  }
  // This function abstracts iterating over the nodes and decorations in
  // a fragment. Calls `onNode` for each node, with its local and child
  // decorations. Splits text nodes when there is a decoration starting
  // or ending inside of them. Calls `onWidget` for each widget.
  function iterDeco(parent, deco, onWidget, onNode) {
      let locals = deco.locals(parent), offset = 0;
      // Simple, cheap variant for when there are no local decorations
      if (locals.length == 0) {
          for (let i = 0; i < parent.childCount; i++) {
              let child = parent.child(i);
              onNode(child, locals, deco.forChild(offset, child), i);
              offset += child.nodeSize;
          }
          return;
      }
      let decoIndex = 0, active = [], restNode = null;
      for (let parentIndex = 0;;) {
          if (decoIndex < locals.length && locals[decoIndex].to == offset) {
              let widget = locals[decoIndex++], widgets;
              while (decoIndex < locals.length && locals[decoIndex].to == offset)
                  (widgets || (widgets = [widget])).push(locals[decoIndex++]);
              if (widgets) {
                  widgets.sort(compareSide);
                  for (let i = 0; i < widgets.length; i++)
                      onWidget(widgets[i], parentIndex, !!restNode);
              }
              else {
                  onWidget(widget, parentIndex, !!restNode);
              }
          }
          let child, index;
          if (restNode) {
              index = -1;
              child = restNode;
              restNode = null;
          }
          else if (parentIndex < parent.childCount) {
              index = parentIndex;
              child = parent.child(parentIndex++);
          }
          else {
              break;
          }
          for (let i = 0; i < active.length; i++)
              if (active[i].to <= offset)
                  active.splice(i--, 1);
          while (decoIndex < locals.length && locals[decoIndex].from <= offset && locals[decoIndex].to > offset)
              active.push(locals[decoIndex++]);
          let end = offset + child.nodeSize;
          if (child.isText) {
              let cutAt = end;
              if (decoIndex < locals.length && locals[decoIndex].from < cutAt)
                  cutAt = locals[decoIndex].from;
              for (let i = 0; i < active.length; i++)
                  if (active[i].to < cutAt)
                      cutAt = active[i].to;
              if (cutAt < end) {
                  restNode = child.cut(cutAt - offset);
                  child = child.cut(0, cutAt - offset);
                  end = cutAt;
                  index = -1;
              }
          }
          let outerDeco = child.isInline && !child.isLeaf ? active.filter(d => !d.inline) : active.slice();
          onNode(child, outerDeco, deco.forChild(offset, child), index);
          offset = end;
      }
  }
  // List markers in Mobile Safari will mysteriously disappear
  // sometimes. This works around that.
  function iosHacks(dom) {
      if (dom.nodeName == "UL" || dom.nodeName == "OL") {
          let oldCSS = dom.style.cssText;
          dom.style.cssText = oldCSS + "; list-style: square !important";
          window.getComputedStyle(dom).listStyle;
          dom.style.cssText = oldCSS;
      }
  }
  function nearbyTextNode(node, offset) {
      for (;;) {
          if (node.nodeType == 3)
              return node;
          if (node.nodeType == 1 && offset > 0) {
              if (node.childNodes.length > offset && node.childNodes[offset].nodeType == 3)
                  return node.childNodes[offset];
              node = node.childNodes[offset - 1];
              offset = nodeSize(node);
          }
          else if (node.nodeType == 1 && offset < node.childNodes.length) {
              node = node.childNodes[offset];
              offset = 0;
          }
          else {
              return null;
          }
      }
  }
  // Find a piece of text in an inline fragment, overlapping from-to
  function findTextInFragment(frag, text, from, to) {
      for (let i = 0, pos = 0; i < frag.childCount && pos <= to;) {
          let child = frag.child(i++), childStart = pos;
          pos += child.nodeSize;
          if (!child.isText)
              continue;
          let str = child.text;
          while (i < frag.childCount) {
              let next = frag.child(i++);
              pos += next.nodeSize;
              if (!next.isText)
                  break;
              str += next.text;
          }
          if (pos >= from) {
              let found = childStart < to ? str.lastIndexOf(text, to - childStart - 1) : -1;
              if (found >= 0 && found + text.length + childStart >= from)
                  return childStart + found;
              if (from == to && str.length >= (to + text.length) - childStart &&
                  str.slice(to - childStart, to - childStart + text.length) == text)
                  return to;
          }
      }
      return -1;
  }
  // Replace range from-to in an array of view descs with replacement
  // (may be null to just delete). This goes very much against the grain
  // of the rest of this code, which tends to create nodes with the
  // right shape in one go, rather than messing with them after
  // creation, but is necessary in the composition hack.
  function replaceNodes(nodes, from, to, view, replacement) {
      let result = [];
      for (let i = 0, off = 0; i < nodes.length; i++) {
          let child = nodes[i], start = off, end = off += child.size;
          if (start >= to || end <= from) {
              result.push(child);
          }
          else {
              if (start < from)
                  result.push(child.slice(0, from - start, view));
              if (replacement) {
                  result.push(replacement);
                  replacement = undefined;
              }
              if (end > to)
                  result.push(child.slice(to - start, child.size, view));
          }
      }
      return result;
  }

  function selectionFromDOM(view, origin = null) {
      let domSel = view.domSelectionRange(), doc = view.state.doc;
      if (!domSel.focusNode)
          return null;
      let nearestDesc = view.docView.nearestDesc(domSel.focusNode), inWidget = nearestDesc && nearestDesc.size == 0;
      let head = view.docView.posFromDOM(domSel.focusNode, domSel.focusOffset, 1);
      if (head < 0)
          return null;
      let $head = doc.resolve(head), $anchor, selection;
      if (selectionCollapsed(domSel)) {
          $anchor = $head;
          while (nearestDesc && !nearestDesc.node)
              nearestDesc = nearestDesc.parent;
          let nearestDescNode = nearestDesc.node;
          if (nearestDesc && nearestDescNode.isAtom && NodeSelection.isSelectable(nearestDescNode) && nearestDesc.parent
              && !(nearestDescNode.isInline && isOnEdge(domSel.focusNode, domSel.focusOffset, nearestDesc.dom))) {
              let pos = nearestDesc.posBefore;
              selection = new NodeSelection(head == pos ? $head : doc.resolve(pos));
          }
      }
      else {
          let anchor = view.docView.posFromDOM(domSel.anchorNode, domSel.anchorOffset, 1);
          if (anchor < 0)
              return null;
          $anchor = doc.resolve(anchor);
      }
      if (!selection) {
          let bias = origin == "pointer" || (view.state.selection.head < $head.pos && !inWidget) ? 1 : -1;
          selection = selectionBetween(view, $anchor, $head, bias);
      }
      return selection;
  }
  function editorOwnsSelection(view) {
      return view.editable ? view.hasFocus() :
          hasSelection(view) && document.activeElement && document.activeElement.contains(view.dom);
  }
  function selectionToDOM(view, force = false) {
      let sel = view.state.selection;
      syncNodeSelection(view, sel);
      if (!editorOwnsSelection(view))
          return;
      // The delayed drag selection causes issues with Cell Selections
      // in Safari. And the drag selection delay is to workarond issues
      // which only present in Chrome.
      if (!force && view.input.mouseDown && view.input.mouseDown.allowDefault && chrome$1) {
          let domSel = view.domSelectionRange(), curSel = view.domObserver.currentSelection;
          if (domSel.anchorNode && curSel.anchorNode &&
              isEquivalentPosition(domSel.anchorNode, domSel.anchorOffset, curSel.anchorNode, curSel.anchorOffset)) {
              view.input.mouseDown.delayedSelectionSync = true;
              view.domObserver.setCurSelection();
              return;
          }
      }
      view.domObserver.disconnectSelection();
      if (view.cursorWrapper) {
          selectCursorWrapper(view);
      }
      else {
          let { anchor, head } = sel, resetEditableFrom, resetEditableTo;
          if (brokenSelectBetweenUneditable && !(sel instanceof TextSelection)) {
              if (!sel.$from.parent.inlineContent)
                  resetEditableFrom = temporarilyEditableNear(view, sel.from);
              if (!sel.empty && !sel.$from.parent.inlineContent)
                  resetEditableTo = temporarilyEditableNear(view, sel.to);
          }
          view.docView.setSelection(anchor, head, view.root, force);
          if (brokenSelectBetweenUneditable) {
              if (resetEditableFrom)
                  resetEditable(resetEditableFrom);
              if (resetEditableTo)
                  resetEditable(resetEditableTo);
          }
          if (sel.visible) {
              view.dom.classList.remove("ProseMirror-hideselection");
          }
          else {
              view.dom.classList.add("ProseMirror-hideselection");
              if ("onselectionchange" in document)
                  removeClassOnSelectionChange(view);
          }
      }
      view.domObserver.setCurSelection();
      view.domObserver.connectSelection();
  }
  // Kludge to work around Webkit not allowing a selection to start/end
  // between non-editable block nodes. We briefly make something
  // editable, set the selection, then set it uneditable again.
  const brokenSelectBetweenUneditable = safari || chrome$1 && chrome_version < 63;
  function temporarilyEditableNear(view, pos) {
      let { node, offset } = view.docView.domFromPos(pos, 0);
      let after = offset < node.childNodes.length ? node.childNodes[offset] : null;
      let before = offset ? node.childNodes[offset - 1] : null;
      if (safari && after && after.contentEditable == "false")
          return setEditable(after);
      if ((!after || after.contentEditable == "false") &&
          (!before || before.contentEditable == "false")) {
          if (after)
              return setEditable(after);
          else if (before)
              return setEditable(before);
      }
  }
  function setEditable(element) {
      element.contentEditable = "true";
      if (safari && element.draggable) {
          element.draggable = false;
          element.wasDraggable = true;
      }
      return element;
  }
  function resetEditable(element) {
      element.contentEditable = "false";
      if (element.wasDraggable) {
          element.draggable = true;
          element.wasDraggable = null;
      }
  }
  function removeClassOnSelectionChange(view) {
      let doc = view.dom.ownerDocument;
      doc.removeEventListener("selectionchange", view.input.hideSelectionGuard);
      let domSel = view.domSelectionRange();
      let node = domSel.anchorNode, offset = domSel.anchorOffset;
      doc.addEventListener("selectionchange", view.input.hideSelectionGuard = () => {
          if (domSel.anchorNode != node || domSel.anchorOffset != offset) {
              doc.removeEventListener("selectionchange", view.input.hideSelectionGuard);
              setTimeout(() => {
                  if (!editorOwnsSelection(view) || view.state.selection.visible)
                      view.dom.classList.remove("ProseMirror-hideselection");
              }, 20);
          }
      });
  }
  function selectCursorWrapper(view) {
      let domSel = view.domSelection(), range = document.createRange();
      let node = view.cursorWrapper.dom, img = node.nodeName == "IMG";
      if (img)
          range.setEnd(node.parentNode, domIndex(node) + 1);
      else
          range.setEnd(node, 0);
      range.collapse(false);
      domSel.removeAllRanges();
      domSel.addRange(range);
      // Kludge to kill 'control selection' in IE11 when selecting an
      // invisible cursor wrapper, since that would result in those weird
      // resize handles and a selection that considers the absolutely
      // positioned wrapper, rather than the root editable node, the
      // focused element.
      if (!img && !view.state.selection.visible && ie$1 && ie_version <= 11) {
          node.disabled = true;
          node.disabled = false;
      }
  }
  function syncNodeSelection(view, sel) {
      if (sel instanceof NodeSelection) {
          let desc = view.docView.descAt(sel.from);
          if (desc != view.lastSelectedViewDesc) {
              clearNodeSelection(view);
              if (desc)
                  desc.selectNode();
              view.lastSelectedViewDesc = desc;
          }
      }
      else {
          clearNodeSelection(view);
      }
  }
  // Clear all DOM statefulness of the last node selection.
  function clearNodeSelection(view) {
      if (view.lastSelectedViewDesc) {
          if (view.lastSelectedViewDesc.parent)
              view.lastSelectedViewDesc.deselectNode();
          view.lastSelectedViewDesc = undefined;
      }
  }
  function selectionBetween(view, $anchor, $head, bias) {
      return view.someProp("createSelectionBetween", f => f(view, $anchor, $head))
          || TextSelection.between($anchor, $head, bias);
  }
  function hasFocusAndSelection(view) {
      if (view.editable && !view.hasFocus())
          return false;
      return hasSelection(view);
  }
  function hasSelection(view) {
      let sel = view.domSelectionRange();
      if (!sel.anchorNode)
          return false;
      try {
          // Firefox will raise 'permission denied' errors when accessing
          // properties of `sel.anchorNode` when it's in a generated CSS
          // element.
          return view.dom.contains(sel.anchorNode.nodeType == 3 ? sel.anchorNode.parentNode : sel.anchorNode) &&
              (view.editable || view.dom.contains(sel.focusNode.nodeType == 3 ? sel.focusNode.parentNode : sel.focusNode));
      }
      catch (_) {
          return false;
      }
  }
  function anchorInRightPlace(view) {
      let anchorDOM = view.docView.domFromPos(view.state.selection.anchor, 0);
      let domSel = view.domSelectionRange();
      return isEquivalentPosition(anchorDOM.node, anchorDOM.offset, domSel.anchorNode, domSel.anchorOffset);
  }

  function moveSelectionBlock(state, dir) {
      let { $anchor, $head } = state.selection;
      let $side = dir > 0 ? $anchor.max($head) : $anchor.min($head);
      let $start = !$side.parent.inlineContent ? $side : $side.depth ? state.doc.resolve(dir > 0 ? $side.after() : $side.before()) : null;
      return $start && Selection.findFrom($start, dir);
  }
  function apply(view, sel) {
      view.dispatch(view.state.tr.setSelection(sel).scrollIntoView());
      return true;
  }
  function selectHorizontally(view, dir, mods) {
      let sel = view.state.selection;
      if (sel instanceof TextSelection) {
          if (!sel.empty || mods.indexOf("s") > -1) {
              return false;
          }
          else if (view.endOfTextblock(dir > 0 ? "right" : "left")) {
              let next = moveSelectionBlock(view.state, dir);
              if (next && (next instanceof NodeSelection))
                  return apply(view, next);
              return false;
          }
          else if (!(mac$3 && mods.indexOf("m") > -1)) {
              let $head = sel.$head, node = $head.textOffset ? null : dir < 0 ? $head.nodeBefore : $head.nodeAfter, desc;
              if (!node || node.isText)
                  return false;
              let nodePos = dir < 0 ? $head.pos - node.nodeSize : $head.pos;
              if (!(node.isAtom || (desc = view.docView.descAt(nodePos)) && !desc.contentDOM))
                  return false;
              if (NodeSelection.isSelectable(node)) {
                  return apply(view, new NodeSelection(dir < 0 ? view.state.doc.resolve($head.pos - node.nodeSize) : $head));
              }
              else if (webkit) {
                  // Chrome and Safari will introduce extra pointless cursor
                  // positions around inline uneditable nodes, so we have to
                  // take over and move the cursor past them (#937)
                  return apply(view, new TextSelection(view.state.doc.resolve(dir < 0 ? nodePos : nodePos + node.nodeSize)));
              }
              else {
                  return false;
              }
          }
      }
      else if (sel instanceof NodeSelection && sel.node.isInline) {
          return apply(view, new TextSelection(dir > 0 ? sel.$to : sel.$from));
      }
      else {
          let next = moveSelectionBlock(view.state, dir);
          if (next)
              return apply(view, next);
          return false;
      }
  }
  function nodeLen(node) {
      return node.nodeType == 3 ? node.nodeValue.length : node.childNodes.length;
  }
  function isIgnorable(dom) {
      let desc = dom.pmViewDesc;
      return desc && desc.size == 0 && (dom.nextSibling || dom.nodeName != "BR");
  }
  // Make sure the cursor isn't directly after one or more ignored
  // nodes, which will confuse the browser's cursor motion logic.
  function skipIgnoredNodesLeft(view) {
      let sel = view.domSelectionRange();
      let node = sel.focusNode, offset = sel.focusOffset;
      if (!node)
          return;
      let moveNode, moveOffset, force = false;
      // Gecko will do odd things when the selection is directly in front
      // of a non-editable node, so in that case, move it into the next
      // node if possible. Issue prosemirror/prosemirror#832.
      if (gecko && node.nodeType == 1 && offset < nodeLen(node) && isIgnorable(node.childNodes[offset]))
          force = true;
      for (;;) {
          if (offset > 0) {
              if (node.nodeType != 1) {
                  break;
              }
              else {
                  let before = node.childNodes[offset - 1];
                  if (isIgnorable(before)) {
                      moveNode = node;
                      moveOffset = --offset;
                  }
                  else if (before.nodeType == 3) {
                      node = before;
                      offset = node.nodeValue.length;
                  }
                  else
                      break;
              }
          }
          else if (isBlockNode(node)) {
              break;
          }
          else {
              let prev = node.previousSibling;
              while (prev && isIgnorable(prev)) {
                  moveNode = node.parentNode;
                  moveOffset = domIndex(prev);
                  prev = prev.previousSibling;
              }
              if (!prev) {
                  node = node.parentNode;
                  if (node == view.dom)
                      break;
                  offset = 0;
              }
              else {
                  node = prev;
                  offset = nodeLen(node);
              }
          }
      }
      if (force)
          setSelFocus(view, node, offset);
      else if (moveNode)
          setSelFocus(view, moveNode, moveOffset);
  }
  // Make sure the cursor isn't directly before one or more ignored
  // nodes.
  function skipIgnoredNodesRight(view) {
      let sel = view.domSelectionRange();
      let node = sel.focusNode, offset = sel.focusOffset;
      if (!node)
          return;
      let len = nodeLen(node);
      let moveNode, moveOffset;
      for (;;) {
          if (offset < len) {
              if (node.nodeType != 1)
                  break;
              let after = node.childNodes[offset];
              if (isIgnorable(after)) {
                  moveNode = node;
                  moveOffset = ++offset;
              }
              else
                  break;
          }
          else if (isBlockNode(node)) {
              break;
          }
          else {
              let next = node.nextSibling;
              while (next && isIgnorable(next)) {
                  moveNode = next.parentNode;
                  moveOffset = domIndex(next) + 1;
                  next = next.nextSibling;
              }
              if (!next) {
                  node = node.parentNode;
                  if (node == view.dom)
                      break;
                  offset = len = 0;
              }
              else {
                  node = next;
                  offset = 0;
                  len = nodeLen(node);
              }
          }
      }
      if (moveNode)
          setSelFocus(view, moveNode, moveOffset);
  }
  function isBlockNode(dom) {
      let desc = dom.pmViewDesc;
      return desc && desc.node && desc.node.isBlock;
  }
  function setSelFocus(view, node, offset) {
      let sel = view.domSelection();
      if (selectionCollapsed(sel)) {
          let range = document.createRange();
          range.setEnd(node, offset);
          range.setStart(node, offset);
          sel.removeAllRanges();
          sel.addRange(range);
      }
      else if (sel.extend) {
          sel.extend(node, offset);
      }
      view.domObserver.setCurSelection();
      let { state } = view;
      // If no state update ends up happening, reset the selection.
      setTimeout(() => {
          if (view.state == state)
              selectionToDOM(view);
      }, 50);
  }
  // Check whether vertical selection motion would involve node
  // selections. If so, apply it (if not, the result is left to the
  // browser)
  function selectVertically(view, dir, mods) {
      let sel = view.state.selection;
      if (sel instanceof TextSelection && !sel.empty || mods.indexOf("s") > -1)
          return false;
      if (mac$3 && mods.indexOf("m") > -1)
          return false;
      let { $from, $to } = sel;
      if (!$from.parent.inlineContent || view.endOfTextblock(dir < 0 ? "up" : "down")) {
          let next = moveSelectionBlock(view.state, dir);
          if (next && (next instanceof NodeSelection))
              return apply(view, next);
      }
      if (!$from.parent.inlineContent) {
          let side = dir < 0 ? $from : $to;
          let beyond = sel instanceof AllSelection ? Selection.near(side, dir) : Selection.findFrom(side, dir);
          return beyond ? apply(view, beyond) : false;
      }
      return false;
  }
  function stopNativeHorizontalDelete(view, dir) {
      if (!(view.state.selection instanceof TextSelection))
          return true;
      let { $head, $anchor, empty } = view.state.selection;
      if (!$head.sameParent($anchor))
          return true;
      if (!empty)
          return false;
      if (view.endOfTextblock(dir > 0 ? "forward" : "backward"))
          return true;
      let nextNode = !$head.textOffset && (dir < 0 ? $head.nodeBefore : $head.nodeAfter);
      if (nextNode && !nextNode.isText) {
          let tr = view.state.tr;
          if (dir < 0)
              tr.delete($head.pos - nextNode.nodeSize, $head.pos);
          else
              tr.delete($head.pos, $head.pos + nextNode.nodeSize);
          view.dispatch(tr);
          return true;
      }
      return false;
  }
  function switchEditable(view, node, state) {
      view.domObserver.stop();
      node.contentEditable = state;
      view.domObserver.start();
  }
  // Issue #867 / #1090 / https://bugs.chromium.org/p/chromium/issues/detail?id=903821
  // In which Safari (and at some point in the past, Chrome) does really
  // wrong things when the down arrow is pressed when the cursor is
  // directly at the start of a textblock and has an uneditable node
  // after it
  function safariDownArrowBug(view) {
      if (!safari || view.state.selection.$head.parentOffset > 0)
          return false;
      let { focusNode, focusOffset } = view.domSelectionRange();
      if (focusNode && focusNode.nodeType == 1 && focusOffset == 0 &&
          focusNode.firstChild && focusNode.firstChild.contentEditable == "false") {
          let child = focusNode.firstChild;
          switchEditable(view, child, "true");
          setTimeout(() => switchEditable(view, child, "false"), 20);
      }
      return false;
  }
  // A backdrop key mapping used to make sure we always suppress keys
  // that have a dangerous default effect, even if the commands they are
  // bound to return false, and to make sure that cursor-motion keys
  // find a cursor (as opposed to a node selection) when pressed. For
  // cursor-motion keys, the code in the handlers also takes care of
  // block selections.
  function getMods(event) {
      let result = "";
      if (event.ctrlKey)
          result += "c";
      if (event.metaKey)
          result += "m";
      if (event.altKey)
          result += "a";
      if (event.shiftKey)
          result += "s";
      return result;
  }
  function captureKeyDown(view, event) {
      let code = event.keyCode, mods = getMods(event);
      if (code == 8 || (mac$3 && code == 72 && mods == "c")) { // Backspace, Ctrl-h on Mac
          return stopNativeHorizontalDelete(view, -1) || skipIgnoredNodesLeft(view);
      }
      else if (code == 46 || (mac$3 && code == 68 && mods == "c")) { // Delete, Ctrl-d on Mac
          return stopNativeHorizontalDelete(view, 1) || skipIgnoredNodesRight(view);
      }
      else if (code == 13 || code == 27) { // Enter, Esc
          return true;
      }
      else if (code == 37 || (mac$3 && code == 66 && mods == "c")) { // Left arrow, Ctrl-b on Mac
          return selectHorizontally(view, -1, mods) || skipIgnoredNodesLeft(view);
      }
      else if (code == 39 || (mac$3 && code == 70 && mods == "c")) { // Right arrow, Ctrl-f on Mac
          return selectHorizontally(view, 1, mods) || skipIgnoredNodesRight(view);
      }
      else if (code == 38 || (mac$3 && code == 80 && mods == "c")) { // Up arrow, Ctrl-p on Mac
          return selectVertically(view, -1, mods) || skipIgnoredNodesLeft(view);
      }
      else if (code == 40 || (mac$3 && code == 78 && mods == "c")) { // Down arrow, Ctrl-n on Mac
          return safariDownArrowBug(view) || selectVertically(view, 1, mods) || skipIgnoredNodesRight(view);
      }
      else if (mods == (mac$3 ? "m" : "c") &&
          (code == 66 || code == 73 || code == 89 || code == 90)) { // Mod-[biyz]
          return true;
      }
      return false;
  }

  function serializeForClipboard(view, slice) {
      view.someProp("transformCopied", f => { slice = f(slice, view); });
      let context = [], { content, openStart, openEnd } = slice;
      while (openStart > 1 && openEnd > 1 && content.childCount == 1 && content.firstChild.childCount == 1) {
          openStart--;
          openEnd--;
          let node = content.firstChild;
          context.push(node.type.name, node.attrs != node.type.defaultAttrs ? node.attrs : null);
          content = node.content;
      }
      let serializer = view.someProp("clipboardSerializer") || DOMSerializer.fromSchema(view.state.schema);
      let doc = detachedDoc(), wrap = doc.createElement("div");
      wrap.appendChild(serializer.serializeFragment(content, { document: doc }));
      let firstChild = wrap.firstChild, needsWrap, wrappers = 0;
      while (firstChild && firstChild.nodeType == 1 && (needsWrap = wrapMap[firstChild.nodeName.toLowerCase()])) {
          for (let i = needsWrap.length - 1; i >= 0; i--) {
              let wrapper = doc.createElement(needsWrap[i]);
              while (wrap.firstChild)
                  wrapper.appendChild(wrap.firstChild);
              wrap.appendChild(wrapper);
              wrappers++;
          }
          firstChild = wrap.firstChild;
      }
      if (firstChild && firstChild.nodeType == 1)
          firstChild.setAttribute("data-pm-slice", `${openStart} ${openEnd}${wrappers ? ` -${wrappers}` : ""} ${JSON.stringify(context)}`);
      let text = view.someProp("clipboardTextSerializer", f => f(slice, view)) ||
          slice.content.textBetween(0, slice.content.size, "\n\n");
      return { dom: wrap, text };
  }
  // Read a slice of content from the clipboard (or drop data).
  function parseFromClipboard(view, text, html, plainText, $context) {
      let inCode = $context.parent.type.spec.code;
      let dom, slice;
      if (!html && !text)
          return null;
      let asText = text && (plainText || inCode || !html);
      if (asText) {
          view.someProp("transformPastedText", f => { text = f(text, inCode || plainText, view); });
          if (inCode)
              return text ? new Slice(Fragment.from(view.state.schema.text(text.replace(/\r\n?/g, "\n"))), 0, 0) : Slice.empty;
          let parsed = view.someProp("clipboardTextParser", f => f(text, $context, plainText, view));
          if (parsed) {
              slice = parsed;
          }
          else {
              let marks = $context.marks();
              let { schema } = view.state, serializer = DOMSerializer.fromSchema(schema);
              dom = document.createElement("div");
              text.split(/(?:\r\n?|\n)+/).forEach(block => {
                  let p = dom.appendChild(document.createElement("p"));
                  if (block)
                      p.appendChild(serializer.serializeNode(schema.text(block, marks)));
              });
          }
      }
      else {
          view.someProp("transformPastedHTML", f => { html = f(html, view); });
          dom = readHTML(html);
          if (webkit)
              restoreReplacedSpaces(dom);
      }
      let contextNode = dom && dom.querySelector("[data-pm-slice]");
      let sliceData = contextNode && /^(\d+) (\d+)(?: -(\d+))? (.*)/.exec(contextNode.getAttribute("data-pm-slice") || "");
      if (sliceData && sliceData[3])
          for (let i = +sliceData[3]; i > 0; i--) {
              let child = dom.firstChild;
              while (child && child.nodeType != 1)
                  child = child.nextSibling;
              if (!child)
                  break;
              dom = child;
          }
      if (!slice) {
          let parser = view.someProp("clipboardParser") || view.someProp("domParser") || DOMParser$1.fromSchema(view.state.schema);
          slice = parser.parseSlice(dom, {
              preserveWhitespace: !!(asText || sliceData),
              context: $context,
              ruleFromNode(dom) {
                  if (dom.nodeName == "BR" && !dom.nextSibling &&
                      dom.parentNode && !inlineParents.test(dom.parentNode.nodeName))
                      return { ignore: true };
                  return null;
              }
          });
      }
      if (sliceData) {
          slice = addContext(closeSlice(slice, +sliceData[1], +sliceData[2]), sliceData[4]);
      }
      else { // HTML wasn't created by ProseMirror. Make sure top-level siblings are coherent
          slice = Slice.maxOpen(normalizeSiblings(slice.content, $context), true);
          if (slice.openStart || slice.openEnd) {
              let openStart = 0, openEnd = 0;
              for (let node = slice.content.firstChild; openStart < slice.openStart && !node.type.spec.isolating; openStart++, node = node.firstChild) { }
              for (let node = slice.content.lastChild; openEnd < slice.openEnd && !node.type.spec.isolating; openEnd++, node = node.lastChild) { }
              slice = closeSlice(slice, openStart, openEnd);
          }
      }
      view.someProp("transformPasted", f => { slice = f(slice, view); });
      return slice;
  }
  const inlineParents = /^(a|abbr|acronym|b|cite|code|del|em|i|ins|kbd|label|output|q|ruby|s|samp|span|strong|sub|sup|time|u|tt|var)$/i;
  // Takes a slice parsed with parseSlice, which means there hasn't been
  // any content-expression checking done on the top nodes, tries to
  // find a parent node in the current context that might fit the nodes,
  // and if successful, rebuilds the slice so that it fits into that parent.
  //
  // This addresses the problem that Transform.replace expects a
  // coherent slice, and will fail to place a set of siblings that don't
  // fit anywhere in the schema.
  function normalizeSiblings(fragment, $context) {
      if (fragment.childCount < 2)
          return fragment;
      for (let d = $context.depth; d >= 0; d--) {
          let parent = $context.node(d);
          let match = parent.contentMatchAt($context.index(d));
          let lastWrap, result = [];
          fragment.forEach(node => {
              if (!result)
                  return;
              let wrap = match.findWrapping(node.type), inLast;
              if (!wrap)
                  return result = null;
              if (inLast = result.length && lastWrap.length && addToSibling(wrap, lastWrap, node, result[result.length - 1], 0)) {
                  result[result.length - 1] = inLast;
              }
              else {
                  if (result.length)
                      result[result.length - 1] = closeRight(result[result.length - 1], lastWrap.length);
                  let wrapped = withWrappers(node, wrap);
                  result.push(wrapped);
                  match = match.matchType(wrapped.type);
                  lastWrap = wrap;
              }
          });
          if (result)
              return Fragment.from(result);
      }
      return fragment;
  }
  function withWrappers(node, wrap, from = 0) {
      for (let i = wrap.length - 1; i >= from; i--)
          node = wrap[i].create(null, Fragment.from(node));
      return node;
  }
  // Used to group adjacent nodes wrapped in similar parents by
  // normalizeSiblings into the same parent node
  function addToSibling(wrap, lastWrap, node, sibling, depth) {
      if (depth < wrap.length && depth < lastWrap.length && wrap[depth] == lastWrap[depth]) {
          let inner = addToSibling(wrap, lastWrap, node, sibling.lastChild, depth + 1);
          if (inner)
              return sibling.copy(sibling.content.replaceChild(sibling.childCount - 1, inner));
          let match = sibling.contentMatchAt(sibling.childCount);
          if (match.matchType(depth == wrap.length - 1 ? node.type : wrap[depth + 1]))
              return sibling.copy(sibling.content.append(Fragment.from(withWrappers(node, wrap, depth + 1))));
      }
  }
  function closeRight(node, depth) {
      if (depth == 0)
          return node;
      let fragment = node.content.replaceChild(node.childCount - 1, closeRight(node.lastChild, depth - 1));
      let fill = node.contentMatchAt(node.childCount).fillBefore(Fragment.empty, true);
      return node.copy(fragment.append(fill));
  }
  function closeRange(fragment, side, from, to, depth, openEnd) {
      let node = side < 0 ? fragment.firstChild : fragment.lastChild, inner = node.content;
      if (depth < to - 1)
          inner = closeRange(inner, side, from, to, depth + 1, openEnd);
      if (depth >= from)
          inner = side < 0 ? node.contentMatchAt(0).fillBefore(inner, fragment.childCount > 1 || openEnd <= depth).append(inner)
              : inner.append(node.contentMatchAt(node.childCount).fillBefore(Fragment.empty, true));
      return fragment.replaceChild(side < 0 ? 0 : fragment.childCount - 1, node.copy(inner));
  }
  function closeSlice(slice, openStart, openEnd) {
      if (openStart < slice.openStart)
          slice = new Slice(closeRange(slice.content, -1, openStart, slice.openStart, 0, slice.openEnd), openStart, slice.openEnd);
      if (openEnd < slice.openEnd)
          slice = new Slice(closeRange(slice.content, 1, openEnd, slice.openEnd, 0, 0), slice.openStart, openEnd);
      return slice;
  }
  // Trick from jQuery -- some elements must be wrapped in other
  // elements for innerHTML to work. I.e. if you do `div.innerHTML =
  // "<td>..</td>"` the table cells are ignored.
  const wrapMap = {
      thead: ["table"],
      tbody: ["table"],
      tfoot: ["table"],
      caption: ["table"],
      colgroup: ["table"],
      col: ["table", "colgroup"],
      tr: ["table", "tbody"],
      td: ["table", "tbody", "tr"],
      th: ["table", "tbody", "tr"]
  };
  let _detachedDoc = null;
  function detachedDoc() {
      return _detachedDoc || (_detachedDoc = document.implementation.createHTMLDocument("title"));
  }
  function readHTML(html) {
      let metas = /^(\s*<meta [^>]*>)*/.exec(html);
      if (metas)
          html = html.slice(metas[0].length);
      let elt = detachedDoc().createElement("div");
      let firstTag = /<([a-z][^>\s]+)/i.exec(html), wrap;
      if (wrap = firstTag && wrapMap[firstTag[1].toLowerCase()])
          html = wrap.map(n => "<" + n + ">").join("") + html + wrap.map(n => "</" + n + ">").reverse().join("");
      elt.innerHTML = html;
      if (wrap)
          for (let i = 0; i < wrap.length; i++)
              elt = elt.querySelector(wrap[i]) || elt;
      return elt;
  }
  // Webkit browsers do some hard-to-predict replacement of regular
  // spaces with non-breaking spaces when putting content on the
  // clipboard. This tries to convert such non-breaking spaces (which
  // will be wrapped in a plain span on Chrome, a span with class
  // Apple-converted-space on Safari) back to regular spaces.
  function restoreReplacedSpaces(dom) {
      let nodes = dom.querySelectorAll(chrome$1 ? "span:not([class]):not([style])" : "span.Apple-converted-space");
      for (let i = 0; i < nodes.length; i++) {
          let node = nodes[i];
          if (node.childNodes.length == 1 && node.textContent == "\u00a0" && node.parentNode)
              node.parentNode.replaceChild(dom.ownerDocument.createTextNode(" "), node);
      }
  }
  function addContext(slice, context) {
      if (!slice.size)
          return slice;
      let schema = slice.content.firstChild.type.schema, array;
      try {
          array = JSON.parse(context);
      }
      catch (e) {
          return slice;
      }
      let { content, openStart, openEnd } = slice;
      for (let i = array.length - 2; i >= 0; i -= 2) {
          let type = schema.nodes[array[i]];
          if (!type || type.hasRequiredAttrs())
              break;
          content = Fragment.from(type.create(array[i + 1], content));
          openStart++;
          openEnd++;
      }
      return new Slice(content, openStart, openEnd);
  }

  // A collection of DOM events that occur within the editor, and callback functions
  // to invoke when the event fires.
  const handlers = {};
  const editHandlers = {};
  const passiveHandlers = { touchstart: true, touchmove: true };
  class InputState {
      constructor() {
          this.shiftKey = false;
          this.mouseDown = null;
          this.lastKeyCode = null;
          this.lastKeyCodeTime = 0;
          this.lastClick = { time: 0, x: 0, y: 0, type: "" };
          this.lastSelectionOrigin = null;
          this.lastSelectionTime = 0;
          this.lastIOSEnter = 0;
          this.lastIOSEnterFallbackTimeout = -1;
          this.lastFocus = 0;
          this.lastTouch = 0;
          this.lastAndroidDelete = 0;
          this.composing = false;
          this.composingTimeout = -1;
          this.compositionNodes = [];
          this.compositionEndedAt = -2e8;
          this.domChangeCount = 0;
          this.eventHandlers = Object.create(null);
          this.hideSelectionGuard = null;
      }
  }
  function initInput(view) {
      for (let event in handlers) {
          let handler = handlers[event];
          view.dom.addEventListener(event, view.input.eventHandlers[event] = (event) => {
              if (eventBelongsToView(view, event) && !runCustomHandler(view, event) &&
                  (view.editable || !(event.type in editHandlers)))
                  handler(view, event);
          }, passiveHandlers[event] ? { passive: true } : undefined);
      }
      // On Safari, for reasons beyond my understanding, adding an input
      // event handler makes an issue where the composition vanishes when
      // you press enter go away.
      if (safari)
          view.dom.addEventListener("input", () => null);
      ensureListeners(view);
  }
  function setSelectionOrigin(view, origin) {
      view.input.lastSelectionOrigin = origin;
      view.input.lastSelectionTime = Date.now();
  }
  function destroyInput(view) {
      view.domObserver.stop();
      for (let type in view.input.eventHandlers)
          view.dom.removeEventListener(type, view.input.eventHandlers[type]);
      clearTimeout(view.input.composingTimeout);
      clearTimeout(view.input.lastIOSEnterFallbackTimeout);
  }
  function ensureListeners(view) {
      view.someProp("handleDOMEvents", currentHandlers => {
          for (let type in currentHandlers)
              if (!view.input.eventHandlers[type])
                  view.dom.addEventListener(type, view.input.eventHandlers[type] = event => runCustomHandler(view, event));
      });
  }
  function runCustomHandler(view, event) {
      return view.someProp("handleDOMEvents", handlers => {
          let handler = handlers[event.type];
          return handler ? handler(view, event) || event.defaultPrevented : false;
      });
  }
  function eventBelongsToView(view, event) {
      if (!event.bubbles)
          return true;
      if (event.defaultPrevented)
          return false;
      for (let node = event.target; node != view.dom; node = node.parentNode)
          if (!node || node.nodeType == 11 ||
              (node.pmViewDesc && node.pmViewDesc.stopEvent(event)))
              return false;
      return true;
  }
  function dispatchEvent(view, event) {
      if (!runCustomHandler(view, event) && handlers[event.type] &&
          (view.editable || !(event.type in editHandlers)))
          handlers[event.type](view, event);
  }
  editHandlers.keydown = (view, _event) => {
      let event = _event;
      view.input.shiftKey = event.keyCode == 16 || event.shiftKey;
      if (inOrNearComposition(view, event))
          return;
      view.input.lastKeyCode = event.keyCode;
      view.input.lastKeyCodeTime = Date.now();
      // Suppress enter key events on Chrome Android, because those tend
      // to be part of a confused sequence of composition events fired,
      // and handling them eagerly tends to corrupt the input.
      if (android && chrome$1 && event.keyCode == 13)
          return;
      if (event.keyCode != 229)
          view.domObserver.forceFlush();
      // On iOS, if we preventDefault enter key presses, the virtual
      // keyboard gets confused. So the hack here is to set a flag that
      // makes the DOM change code recognize that what just happens should
      // be replaced by whatever the Enter key handlers do.
      if (ios && event.keyCode == 13 && !event.ctrlKey && !event.altKey && !event.metaKey) {
          let now = Date.now();
          view.input.lastIOSEnter = now;
          view.input.lastIOSEnterFallbackTimeout = setTimeout(() => {
              if (view.input.lastIOSEnter == now) {
                  view.someProp("handleKeyDown", f => f(view, keyEvent(13, "Enter")));
                  view.input.lastIOSEnter = 0;
              }
          }, 200);
      }
      else if (view.someProp("handleKeyDown", f => f(view, event)) || captureKeyDown(view, event)) {
          event.preventDefault();
      }
      else {
          setSelectionOrigin(view, "key");
      }
  };
  editHandlers.keyup = (view, event) => {
      if (event.keyCode == 16)
          view.input.shiftKey = false;
  };
  editHandlers.keypress = (view, _event) => {
      let event = _event;
      if (inOrNearComposition(view, event) || !event.charCode ||
          event.ctrlKey && !event.altKey || mac$3 && event.metaKey)
          return;
      if (view.someProp("handleKeyPress", f => f(view, event))) {
          event.preventDefault();
          return;
      }
      let sel = view.state.selection;
      if (!(sel instanceof TextSelection) || !sel.$from.sameParent(sel.$to)) {
          let text = String.fromCharCode(event.charCode);
          if (!/[\r\n]/.test(text) && !view.someProp("handleTextInput", f => f(view, sel.$from.pos, sel.$to.pos, text)))
              view.dispatch(view.state.tr.insertText(text).scrollIntoView());
          event.preventDefault();
      }
  };
  function eventCoords(event) { return { left: event.clientX, top: event.clientY }; }
  function isNear(event, click) {
      let dx = click.x - event.clientX, dy = click.y - event.clientY;
      return dx * dx + dy * dy < 100;
  }
  function runHandlerOnContext(view, propName, pos, inside, event) {
      if (inside == -1)
          return false;
      let $pos = view.state.doc.resolve(inside);
      for (let i = $pos.depth + 1; i > 0; i--) {
          if (view.someProp(propName, f => i > $pos.depth ? f(view, pos, $pos.nodeAfter, $pos.before(i), event, true)
              : f(view, pos, $pos.node(i), $pos.before(i), event, false)))
              return true;
      }
      return false;
  }
  function updateSelection(view, selection, origin) {
      if (!view.focused)
          view.focus();
      let tr = view.state.tr.setSelection(selection);
      if (origin == "pointer")
          tr.setMeta("pointer", true);
      view.dispatch(tr);
  }
  function selectClickedLeaf(view, inside) {
      if (inside == -1)
          return false;
      let $pos = view.state.doc.resolve(inside), node = $pos.nodeAfter;
      if (node && node.isAtom && NodeSelection.isSelectable(node)) {
          updateSelection(view, new NodeSelection($pos), "pointer");
          return true;
      }
      return false;
  }
  function selectClickedNode(view, inside) {
      if (inside == -1)
          return false;
      let sel = view.state.selection, selectedNode, selectAt;
      if (sel instanceof NodeSelection)
          selectedNode = sel.node;
      let $pos = view.state.doc.resolve(inside);
      for (let i = $pos.depth + 1; i > 0; i--) {
          let node = i > $pos.depth ? $pos.nodeAfter : $pos.node(i);
          if (NodeSelection.isSelectable(node)) {
              if (selectedNode && sel.$from.depth > 0 &&
                  i >= sel.$from.depth && $pos.before(sel.$from.depth + 1) == sel.$from.pos)
                  selectAt = $pos.before(sel.$from.depth);
              else
                  selectAt = $pos.before(i);
              break;
          }
      }
      if (selectAt != null) {
          updateSelection(view, NodeSelection.create(view.state.doc, selectAt), "pointer");
          return true;
      }
      else {
          return false;
      }
  }
  function handleSingleClick(view, pos, inside, event, selectNode) {
      return runHandlerOnContext(view, "handleClickOn", pos, inside, event) ||
          view.someProp("handleClick", f => f(view, pos, event)) ||
          (selectNode ? selectClickedNode(view, inside) : selectClickedLeaf(view, inside));
  }
  function handleDoubleClick(view, pos, inside, event) {
      return runHandlerOnContext(view, "handleDoubleClickOn", pos, inside, event) ||
          view.someProp("handleDoubleClick", f => f(view, pos, event));
  }
  function handleTripleClick$1(view, pos, inside, event) {
      return runHandlerOnContext(view, "handleTripleClickOn", pos, inside, event) ||
          view.someProp("handleTripleClick", f => f(view, pos, event)) ||
          defaultTripleClick(view, inside, event);
  }
  function defaultTripleClick(view, inside, event) {
      if (event.button != 0)
          return false;
      let doc = view.state.doc;
      if (inside == -1) {
          if (doc.inlineContent) {
              updateSelection(view, TextSelection.create(doc, 0, doc.content.size), "pointer");
              return true;
          }
          return false;
      }
      let $pos = doc.resolve(inside);
      for (let i = $pos.depth + 1; i > 0; i--) {
          let node = i > $pos.depth ? $pos.nodeAfter : $pos.node(i);
          let nodePos = $pos.before(i);
          if (node.inlineContent)
              updateSelection(view, TextSelection.create(doc, nodePos + 1, nodePos + 1 + node.content.size), "pointer");
          else if (NodeSelection.isSelectable(node))
              updateSelection(view, NodeSelection.create(doc, nodePos), "pointer");
          else
              continue;
          return true;
      }
  }
  function forceDOMFlush(view) {
      return endComposition(view);
  }
  const selectNodeModifier = mac$3 ? "metaKey" : "ctrlKey";
  handlers.mousedown = (view, _event) => {
      let event = _event;
      view.input.shiftKey = event.shiftKey;
      let flushed = forceDOMFlush(view);
      let now = Date.now(), type = "singleClick";
      if (now - view.input.lastClick.time < 500 && isNear(event, view.input.lastClick) && !event[selectNodeModifier]) {
          if (view.input.lastClick.type == "singleClick")
              type = "doubleClick";
          else if (view.input.lastClick.type == "doubleClick")
              type = "tripleClick";
      }
      view.input.lastClick = { time: now, x: event.clientX, y: event.clientY, type };
      let pos = view.posAtCoords(eventCoords(event));
      if (!pos)
          return;
      if (type == "singleClick") {
          if (view.input.mouseDown)
              view.input.mouseDown.done();
          view.input.mouseDown = new MouseDown(view, pos, event, !!flushed);
      }
      else if ((type == "doubleClick" ? handleDoubleClick : handleTripleClick$1)(view, pos.pos, pos.inside, event)) {
          event.preventDefault();
      }
      else {
          setSelectionOrigin(view, "pointer");
      }
  };
  class MouseDown {
      constructor(view, pos, event, flushed) {
          this.view = view;
          this.pos = pos;
          this.event = event;
          this.flushed = flushed;
          this.delayedSelectionSync = false;
          this.mightDrag = null;
          this.startDoc = view.state.doc;
          this.selectNode = !!event[selectNodeModifier];
          this.allowDefault = event.shiftKey;
          let targetNode, targetPos;
          if (pos.inside > -1) {
              targetNode = view.state.doc.nodeAt(pos.inside);
              targetPos = pos.inside;
          }
          else {
              let $pos = view.state.doc.resolve(pos.pos);
              targetNode = $pos.parent;
              targetPos = $pos.depth ? $pos.before() : 0;
          }
          const target = flushed ? null : event.target;
          const targetDesc = target ? view.docView.nearestDesc(target, true) : null;
          this.target = targetDesc ? targetDesc.dom : null;
          let { selection } = view.state;
          if (event.button == 0 &&
              targetNode.type.spec.draggable && targetNode.type.spec.selectable !== false ||
              selection instanceof NodeSelection && selection.from <= targetPos && selection.to > targetPos)
              this.mightDrag = {
                  node: targetNode,
                  pos: targetPos,
                  addAttr: !!(this.target && !this.target.draggable),
                  setUneditable: !!(this.target && gecko && !this.target.hasAttribute("contentEditable"))
              };
          if (this.target && this.mightDrag && (this.mightDrag.addAttr || this.mightDrag.setUneditable)) {
              this.view.domObserver.stop();
              if (this.mightDrag.addAttr)
                  this.target.draggable = true;
              if (this.mightDrag.setUneditable)
                  setTimeout(() => {
                      if (this.view.input.mouseDown == this)
                          this.target.setAttribute("contentEditable", "false");
                  }, 20);
              this.view.domObserver.start();
          }
          view.root.addEventListener("mouseup", this.up = this.up.bind(this));
          view.root.addEventListener("mousemove", this.move = this.move.bind(this));
          setSelectionOrigin(view, "pointer");
      }
      done() {
          this.view.root.removeEventListener("mouseup", this.up);
          this.view.root.removeEventListener("mousemove", this.move);
          if (this.mightDrag && this.target) {
              this.view.domObserver.stop();
              if (this.mightDrag.addAttr)
                  this.target.removeAttribute("draggable");
              if (this.mightDrag.setUneditable)
                  this.target.removeAttribute("contentEditable");
              this.view.domObserver.start();
          }
          if (this.delayedSelectionSync)
              setTimeout(() => selectionToDOM(this.view));
          this.view.input.mouseDown = null;
      }
      up(event) {
          this.done();
          if (!this.view.dom.contains(event.target))
              return;
          let pos = this.pos;
          if (this.view.state.doc != this.startDoc)
              pos = this.view.posAtCoords(eventCoords(event));
          this.updateAllowDefault(event);
          if (this.allowDefault || !pos) {
              setSelectionOrigin(this.view, "pointer");
          }
          else if (handleSingleClick(this.view, pos.pos, pos.inside, event, this.selectNode)) {
              event.preventDefault();
          }
          else if (event.button == 0 &&
              (this.flushed ||
                  // Safari ignores clicks on draggable elements
                  (safari && this.mightDrag && !this.mightDrag.node.isAtom) ||
                  // Chrome will sometimes treat a node selection as a
                  // cursor, but still report that the node is selected
                  // when asked through getSelection. You'll then get a
                  // situation where clicking at the point where that
                  // (hidden) cursor is doesn't change the selection, and
                  // thus doesn't get a reaction from ProseMirror. This
                  // works around that.
                  (chrome$1 && !this.view.state.selection.visible &&
                      Math.min(Math.abs(pos.pos - this.view.state.selection.from), Math.abs(pos.pos - this.view.state.selection.to)) <= 2))) {
              updateSelection(this.view, Selection.near(this.view.state.doc.resolve(pos.pos)), "pointer");
              event.preventDefault();
          }
          else {
              setSelectionOrigin(this.view, "pointer");
          }
      }
      move(event) {
          this.updateAllowDefault(event);
          setSelectionOrigin(this.view, "pointer");
          if (event.buttons == 0)
              this.done();
      }
      updateAllowDefault(event) {
          if (!this.allowDefault && (Math.abs(this.event.x - event.clientX) > 4 ||
              Math.abs(this.event.y - event.clientY) > 4))
              this.allowDefault = true;
      }
  }
  handlers.touchstart = view => {
      view.input.lastTouch = Date.now();
      forceDOMFlush(view);
      setSelectionOrigin(view, "pointer");
  };
  handlers.touchmove = view => {
      view.input.lastTouch = Date.now();
      setSelectionOrigin(view, "pointer");
  };
  handlers.contextmenu = view => forceDOMFlush(view);
  function inOrNearComposition(view, event) {
      if (view.composing)
          return true;
      // See https://www.stum.de/2016/06/24/handling-ime-events-in-javascript/.
      // On Japanese input method editors (IMEs), the Enter key is used to confirm character
      // selection. On Safari, when Enter is pressed, compositionend and keydown events are
      // emitted. The keydown event triggers newline insertion, which we don't want.
      // This method returns true if the keydown event should be ignored.
      // We only ignore it once, as pressing Enter a second time *should* insert a newline.
      // Furthermore, the keydown event timestamp must be close to the compositionEndedAt timestamp.
      // This guards against the case where compositionend is triggered without the keyboard
      // (e.g. character confirmation may be done with the mouse), and keydown is triggered
      // afterwards- we wouldn't want to ignore the keydown event in this case.
      if (safari && Math.abs(event.timeStamp - view.input.compositionEndedAt) < 500) {
          view.input.compositionEndedAt = -2e8;
          return true;
      }
      return false;
  }
  // Drop active composition after 5 seconds of inactivity on Android
  const timeoutComposition = android ? 5000 : -1;
  editHandlers.compositionstart = editHandlers.compositionupdate = view => {
      if (!view.composing) {
          view.domObserver.flush();
          let { state } = view, $pos = state.selection.$from;
          if (state.selection.empty &&
              (state.storedMarks ||
                  (!$pos.textOffset && $pos.parentOffset && $pos.nodeBefore.marks.some(m => m.type.spec.inclusive === false)))) {
              // Need to wrap the cursor in mark nodes different from the ones in the DOM context
              view.markCursor = view.state.storedMarks || $pos.marks();
              endComposition(view, true);
              view.markCursor = null;
          }
          else {
              endComposition(view);
              // In firefox, if the cursor is after but outside a marked node,
              // the inserted text won't inherit the marks. So this moves it
              // inside if necessary.
              if (gecko && state.selection.empty && $pos.parentOffset && !$pos.textOffset && $pos.nodeBefore.marks.length) {
                  let sel = view.domSelectionRange();
                  for (let node = sel.focusNode, offset = sel.focusOffset; node && node.nodeType == 1 && offset != 0;) {
                      let before = offset < 0 ? node.lastChild : node.childNodes[offset - 1];
                      if (!before)
                          break;
                      if (before.nodeType == 3) {
                          view.domSelection().collapse(before, before.nodeValue.length);
                          break;
                      }
                      else {
                          node = before;
                          offset = -1;
                      }
                  }
              }
          }
          view.input.composing = true;
      }
      scheduleComposeEnd(view, timeoutComposition);
  };
  editHandlers.compositionend = (view, event) => {
      if (view.composing) {
          view.input.composing = false;
          view.input.compositionEndedAt = event.timeStamp;
          scheduleComposeEnd(view, 20);
      }
  };
  function scheduleComposeEnd(view, delay) {
      clearTimeout(view.input.composingTimeout);
      if (delay > -1)
          view.input.composingTimeout = setTimeout(() => endComposition(view), delay);
  }
  function clearComposition(view) {
      if (view.composing) {
          view.input.composing = false;
          view.input.compositionEndedAt = timestampFromCustomEvent();
      }
      while (view.input.compositionNodes.length > 0)
          view.input.compositionNodes.pop().markParentsDirty();
  }
  function timestampFromCustomEvent() {
      let event = document.createEvent("Event");
      event.initEvent("event", true, true);
      return event.timeStamp;
  }
  /**
  @internal
  */
  function endComposition(view, forceUpdate = false) {
      if (android && view.domObserver.flushingSoon >= 0)
          return;
      view.domObserver.forceFlush();
      clearComposition(view);
      if (forceUpdate || view.docView && view.docView.dirty) {
          let sel = selectionFromDOM(view);
          if (sel && !sel.eq(view.state.selection))
              view.dispatch(view.state.tr.setSelection(sel));
          else
              view.updateState(view.state);
          return true;
      }
      return false;
  }
  function captureCopy(view, dom) {
      // The extra wrapper is somehow necessary on IE/Edge to prevent the
      // content from being mangled when it is put onto the clipboard
      if (!view.dom.parentNode)
          return;
      let wrap = view.dom.parentNode.appendChild(document.createElement("div"));
      wrap.appendChild(dom);
      wrap.style.cssText = "position: fixed; left: -10000px; top: 10px";
      let sel = getSelection(), range = document.createRange();
      range.selectNodeContents(dom);
      // Done because IE will fire a selectionchange moving the selection
      // to its start when removeAllRanges is called and the editor still
      // has focus (which will mess up the editor's selection state).
      view.dom.blur();
      sel.removeAllRanges();
      sel.addRange(range);
      setTimeout(() => {
          if (wrap.parentNode)
              wrap.parentNode.removeChild(wrap);
          view.focus();
      }, 50);
  }
  // This is very crude, but unfortunately both these browsers _pretend_
  // that they have a clipboard API—all the objects and methods are
  // there, they just don't work, and they are hard to test.
  const brokenClipboardAPI = (ie$1 && ie_version < 15) ||
      (ios && webkit_version < 604);
  handlers.copy = editHandlers.cut = (view, _event) => {
      let event = _event;
      let sel = view.state.selection, cut = event.type == "cut";
      if (sel.empty)
          return;
      // IE and Edge's clipboard interface is completely broken
      let data = brokenClipboardAPI ? null : event.clipboardData;
      let slice = sel.content(), { dom, text } = serializeForClipboard(view, slice);
      if (data) {
          event.preventDefault();
          data.clearData();
          data.setData("text/html", dom.innerHTML);
          data.setData("text/plain", text);
      }
      else {
          captureCopy(view, dom);
      }
      if (cut)
          view.dispatch(view.state.tr.deleteSelection().scrollIntoView().setMeta("uiEvent", "cut"));
  };
  function sliceSingleNode(slice) {
      return slice.openStart == 0 && slice.openEnd == 0 && slice.content.childCount == 1 ? slice.content.firstChild : null;
  }
  function capturePaste(view, event) {
      if (!view.dom.parentNode)
          return;
      let plainText = view.input.shiftKey || view.state.selection.$from.parent.type.spec.code;
      let target = view.dom.parentNode.appendChild(document.createElement(plainText ? "textarea" : "div"));
      if (!plainText)
          target.contentEditable = "true";
      target.style.cssText = "position: fixed; left: -10000px; top: 10px";
      target.focus();
      setTimeout(() => {
          view.focus();
          if (target.parentNode)
              target.parentNode.removeChild(target);
          if (plainText)
              doPaste(view, target.value, null, view.input.shiftKey, event);
          else
              doPaste(view, target.textContent, target.innerHTML, view.input.shiftKey, event);
      }, 50);
  }
  function doPaste(view, text, html, preferPlain, event) {
      let slice = parseFromClipboard(view, text, html, preferPlain, view.state.selection.$from);
      if (view.someProp("handlePaste", f => f(view, event, slice || Slice.empty)))
          return true;
      if (!slice)
          return false;
      let singleNode = sliceSingleNode(slice);
      let tr = singleNode
          ? view.state.tr.replaceSelectionWith(singleNode, view.input.shiftKey)
          : view.state.tr.replaceSelection(slice);
      view.dispatch(tr.scrollIntoView().setMeta("paste", true).setMeta("uiEvent", "paste"));
      return true;
  }
  editHandlers.paste = (view, _event) => {
      let event = _event;
      // Handling paste from JavaScript during composition is very poorly
      // handled by browsers, so as a dodgy but preferable kludge, we just
      // let the browser do its native thing there, except on Android,
      // where the editor is almost always composing.
      if (view.composing && !android)
          return;
      let data = brokenClipboardAPI ? null : event.clipboardData;
      if (data && doPaste(view, data.getData("text/plain"), data.getData("text/html"), view.input.shiftKey, event))
          event.preventDefault();
      else
          capturePaste(view, event);
  };
  class Dragging {
      constructor(slice, move) {
          this.slice = slice;
          this.move = move;
      }
  }
  const dragCopyModifier = mac$3 ? "altKey" : "ctrlKey";
  handlers.dragstart = (view, _event) => {
      let event = _event;
      let mouseDown = view.input.mouseDown;
      if (mouseDown)
          mouseDown.done();
      if (!event.dataTransfer)
          return;
      let sel = view.state.selection;
      let pos = sel.empty ? null : view.posAtCoords(eventCoords(event));
      if (pos && pos.pos >= sel.from && pos.pos <= (sel instanceof NodeSelection ? sel.to - 1 : sel.to)) ;
      else if (mouseDown && mouseDown.mightDrag) {
          view.dispatch(view.state.tr.setSelection(NodeSelection.create(view.state.doc, mouseDown.mightDrag.pos)));
      }
      else if (event.target && event.target.nodeType == 1) {
          let desc = view.docView.nearestDesc(event.target, true);
          if (desc && desc.node.type.spec.draggable && desc != view.docView)
              view.dispatch(view.state.tr.setSelection(NodeSelection.create(view.state.doc, desc.posBefore)));
      }
      let slice = view.state.selection.content(), { dom, text } = serializeForClipboard(view, slice);
      event.dataTransfer.clearData();
      event.dataTransfer.setData(brokenClipboardAPI ? "Text" : "text/html", dom.innerHTML);
      // See https://github.com/ProseMirror/prosemirror/issues/1156
      event.dataTransfer.effectAllowed = "copyMove";
      if (!brokenClipboardAPI)
          event.dataTransfer.setData("text/plain", text);
      view.dragging = new Dragging(slice, !event[dragCopyModifier]);
  };
  handlers.dragend = view => {
      let dragging = view.dragging;
      window.setTimeout(() => {
          if (view.dragging == dragging)
              view.dragging = null;
      }, 50);
  };
  editHandlers.dragover = editHandlers.dragenter = (_, e) => e.preventDefault();
  editHandlers.drop = (view, _event) => {
      let event = _event;
      let dragging = view.dragging;
      view.dragging = null;
      if (!event.dataTransfer)
          return;
      let eventPos = view.posAtCoords(eventCoords(event));
      if (!eventPos)
          return;
      let $mouse = view.state.doc.resolve(eventPos.pos);
      let slice = dragging && dragging.slice;
      if (slice) {
          view.someProp("transformPasted", f => { slice = f(slice, view); });
      }
      else {
          slice = parseFromClipboard(view, event.dataTransfer.getData(brokenClipboardAPI ? "Text" : "text/plain"), brokenClipboardAPI ? null : event.dataTransfer.getData("text/html"), false, $mouse);
      }
      let move = !!(dragging && !event[dragCopyModifier]);
      if (view.someProp("handleDrop", f => f(view, event, slice || Slice.empty, move))) {
          event.preventDefault();
          return;
      }
      if (!slice)
          return;
      event.preventDefault();
      let insertPos = slice ? dropPoint(view.state.doc, $mouse.pos, slice) : $mouse.pos;
      if (insertPos == null)
          insertPos = $mouse.pos;
      let tr = view.state.tr;
      if (move)
          tr.deleteSelection();
      let pos = tr.mapping.map(insertPos);
      let isNode = slice.openStart == 0 && slice.openEnd == 0 && slice.content.childCount == 1;
      let beforeInsert = tr.doc;
      if (isNode)
          tr.replaceRangeWith(pos, pos, slice.content.firstChild);
      else
          tr.replaceRange(pos, pos, slice);
      if (tr.doc.eq(beforeInsert))
          return;
      let $pos = tr.doc.resolve(pos);
      if (isNode && NodeSelection.isSelectable(slice.content.firstChild) &&
          $pos.nodeAfter && $pos.nodeAfter.sameMarkup(slice.content.firstChild)) {
          tr.setSelection(new NodeSelection($pos));
      }
      else {
          let end = tr.mapping.map(insertPos);
          tr.mapping.maps[tr.mapping.maps.length - 1].forEach((_from, _to, _newFrom, newTo) => end = newTo);
          tr.setSelection(selectionBetween(view, $pos, tr.doc.resolve(end)));
      }
      view.focus();
      view.dispatch(tr.setMeta("uiEvent", "drop"));
  };
  handlers.focus = view => {
      view.input.lastFocus = Date.now();
      if (!view.focused) {
          view.domObserver.stop();
          view.dom.classList.add("ProseMirror-focused");
          view.domObserver.start();
          view.focused = true;
          setTimeout(() => {
              if (view.docView && view.hasFocus() && !view.domObserver.currentSelection.eq(view.domSelectionRange()))
                  selectionToDOM(view);
          }, 20);
      }
  };
  handlers.blur = (view, _event) => {
      let event = _event;
      if (view.focused) {
          view.domObserver.stop();
          view.dom.classList.remove("ProseMirror-focused");
          view.domObserver.start();
          if (event.relatedTarget && view.dom.contains(event.relatedTarget))
              view.domObserver.currentSelection.clear();
          view.focused = false;
      }
  };
  handlers.beforeinput = (view, _event) => {
      let event = _event;
      // We should probably do more with beforeinput events, but support
      // is so spotty that I'm still waiting to see where they are going.
      // Very specific hack to deal with backspace sometimes failing on
      // Chrome Android when after an uneditable node.
      if (chrome$1 && android && event.inputType == "deleteContentBackward") {
          view.domObserver.flushSoon();
          let { domChangeCount } = view.input;
          setTimeout(() => {
              if (view.input.domChangeCount != domChangeCount)
                  return; // Event already had some effect
              // This bug tends to close the virtual keyboard, so we refocus
              view.dom.blur();
              view.focus();
              if (view.someProp("handleKeyDown", f => f(view, keyEvent(8, "Backspace"))))
                  return;
              let { $cursor } = view.state.selection;
              // Crude approximation of backspace behavior when no command handled it
              if ($cursor && $cursor.pos > 0)
                  view.dispatch(view.state.tr.delete($cursor.pos - 1, $cursor.pos).scrollIntoView());
          }, 50);
      }
  };
  // Make sure all handlers get registered
  for (let prop in editHandlers)
      handlers[prop] = editHandlers[prop];

  function compareObjs(a, b) {
      if (a == b)
          return true;
      for (let p in a)
          if (a[p] !== b[p])
              return false;
      for (let p in b)
          if (!(p in a))
              return false;
      return true;
  }
  class WidgetType {
      constructor(toDOM, spec) {
          this.toDOM = toDOM;
          this.spec = spec || noSpec;
          this.side = this.spec.side || 0;
      }
      map(mapping, span, offset, oldOffset) {
          let { pos, deleted } = mapping.mapResult(span.from + oldOffset, this.side < 0 ? -1 : 1);
          return deleted ? null : new Decoration(pos - offset, pos - offset, this);
      }
      valid() { return true; }
      eq(other) {
          return this == other ||
              (other instanceof WidgetType &&
                  (this.spec.key && this.spec.key == other.spec.key ||
                      this.toDOM == other.toDOM && compareObjs(this.spec, other.spec)));
      }
      destroy(node) {
          if (this.spec.destroy)
              this.spec.destroy(node);
      }
  }
  class InlineType {
      constructor(attrs, spec) {
          this.attrs = attrs;
          this.spec = spec || noSpec;
      }
      map(mapping, span, offset, oldOffset) {
          let from = mapping.map(span.from + oldOffset, this.spec.inclusiveStart ? -1 : 1) - offset;
          let to = mapping.map(span.to + oldOffset, this.spec.inclusiveEnd ? 1 : -1) - offset;
          return from >= to ? null : new Decoration(from, to, this);
      }
      valid(_, span) { return span.from < span.to; }
      eq(other) {
          return this == other ||
              (other instanceof InlineType && compareObjs(this.attrs, other.attrs) &&
                  compareObjs(this.spec, other.spec));
      }
      static is(span) { return span.type instanceof InlineType; }
      destroy() { }
  }
  class NodeType {
      constructor(attrs, spec) {
          this.attrs = attrs;
          this.spec = spec || noSpec;
      }
      map(mapping, span, offset, oldOffset) {
          let from = mapping.mapResult(span.from + oldOffset, 1);
          if (from.deleted)
              return null;
          let to = mapping.mapResult(span.to + oldOffset, -1);
          if (to.deleted || to.pos <= from.pos)
              return null;
          return new Decoration(from.pos - offset, to.pos - offset, this);
      }
      valid(node, span) {
          let { index, offset } = node.content.findIndex(span.from), child;
          return offset == span.from && !(child = node.child(index)).isText && offset + child.nodeSize == span.to;
      }
      eq(other) {
          return this == other ||
              (other instanceof NodeType && compareObjs(this.attrs, other.attrs) &&
                  compareObjs(this.spec, other.spec));
      }
      destroy() { }
  }
  /**
  Decoration objects can be provided to the view through the
  [`decorations` prop](https://prosemirror.net/docs/ref/#view.EditorProps.decorations). They come in
  several variants—see the static members of this class for details.
  */
  class Decoration {
      /**
      @internal
      */
      constructor(
      /**
      The start position of the decoration.
      */
      from, 
      /**
      The end position. Will be the same as `from` for [widget
      decorations](https://prosemirror.net/docs/ref/#view.Decoration^widget).
      */
      to, 
      /**
      @internal
      */
      type) {
          this.from = from;
          this.to = to;
          this.type = type;
      }
      /**
      @internal
      */
      copy(from, to) {
          return new Decoration(from, to, this.type);
      }
      /**
      @internal
      */
      eq(other, offset = 0) {
          return this.type.eq(other.type) && this.from + offset == other.from && this.to + offset == other.to;
      }
      /**
      @internal
      */
      map(mapping, offset, oldOffset) {
          return this.type.map(mapping, this, offset, oldOffset);
      }
      /**
      Creates a widget decoration, which is a DOM node that's shown in
      the document at the given position. It is recommended that you
      delay rendering the widget by passing a function that will be
      called when the widget is actually drawn in a view, but you can
      also directly pass a DOM node. `getPos` can be used to find the
      widget's current document position.
      */
      static widget(pos, toDOM, spec) {
          return new Decoration(pos, pos, new WidgetType(toDOM, spec));
      }
      /**
      Creates an inline decoration, which adds the given attributes to
      each inline node between `from` and `to`.
      */
      static inline(from, to, attrs, spec) {
          return new Decoration(from, to, new InlineType(attrs, spec));
      }
      /**
      Creates a node decoration. `from` and `to` should point precisely
      before and after a node in the document. That node, and only that
      node, will receive the given attributes.
      */
      static node(from, to, attrs, spec) {
          return new Decoration(from, to, new NodeType(attrs, spec));
      }
      /**
      The spec provided when creating this decoration. Can be useful
      if you've stored extra information in that object.
      */
      get spec() { return this.type.spec; }
      /**
      @internal
      */
      get inline() { return this.type instanceof InlineType; }
  }
  const none = [], noSpec = {};
  /**
  A collection of [decorations](https://prosemirror.net/docs/ref/#view.Decoration), organized in such
  a way that the drawing algorithm can efficiently use and compare
  them. This is a persistent data structure—it is not modified,
  updates create a new value.
  */
  class DecorationSet {
      /**
      @internal
      */
      constructor(local, children) {
          this.local = local.length ? local : none;
          this.children = children.length ? children : none;
      }
      /**
      Create a set of decorations, using the structure of the given
      document.
      */
      static create(doc, decorations) {
          return decorations.length ? buildTree(decorations, doc, 0, noSpec) : empty;
      }
      /**
      Find all decorations in this set which touch the given range
      (including decorations that start or end directly at the
      boundaries) and match the given predicate on their spec. When
      `start` and `end` are omitted, all decorations in the set are
      considered. When `predicate` isn't given, all decorations are
      assumed to match.
      */
      find(start, end, predicate) {
          let result = [];
          this.findInner(start == null ? 0 : start, end == null ? 1e9 : end, result, 0, predicate);
          return result;
      }
      findInner(start, end, result, offset, predicate) {
          for (let i = 0; i < this.local.length; i++) {
              let span = this.local[i];
              if (span.from <= end && span.to >= start && (!predicate || predicate(span.spec)))
                  result.push(span.copy(span.from + offset, span.to + offset));
          }
          for (let i = 0; i < this.children.length; i += 3) {
              if (this.children[i] < end && this.children[i + 1] > start) {
                  let childOff = this.children[i] + 1;
                  this.children[i + 2].findInner(start - childOff, end - childOff, result, offset + childOff, predicate);
              }
          }
      }
      /**
      Map the set of decorations in response to a change in the
      document.
      */
      map(mapping, doc, options) {
          if (this == empty || mapping.maps.length == 0)
              return this;
          return this.mapInner(mapping, doc, 0, 0, options || noSpec);
      }
      /**
      @internal
      */
      mapInner(mapping, node, offset, oldOffset, options) {
          let newLocal;
          for (let i = 0; i < this.local.length; i++) {
              let mapped = this.local[i].map(mapping, offset, oldOffset);
              if (mapped && mapped.type.valid(node, mapped))
                  (newLocal || (newLocal = [])).push(mapped);
              else if (options.onRemove)
                  options.onRemove(this.local[i].spec);
          }
          if (this.children.length)
              return mapChildren(this.children, newLocal || [], mapping, node, offset, oldOffset, options);
          else
              return newLocal ? new DecorationSet(newLocal.sort(byPos), none) : empty;
      }
      /**
      Add the given array of decorations to the ones in the set,
      producing a new set. Needs access to the current document to
      create the appropriate tree structure.
      */
      add(doc, decorations) {
          if (!decorations.length)
              return this;
          if (this == empty)
              return DecorationSet.create(doc, decorations);
          return this.addInner(doc, decorations, 0);
      }
      addInner(doc, decorations, offset) {
          let children, childIndex = 0;
          doc.forEach((childNode, childOffset) => {
              let baseOffset = childOffset + offset, found;
              if (!(found = takeSpansForNode(decorations, childNode, baseOffset)))
                  return;
              if (!children)
                  children = this.children.slice();
              while (childIndex < children.length && children[childIndex] < childOffset)
                  childIndex += 3;
              if (children[childIndex] == childOffset)
                  children[childIndex + 2] = children[childIndex + 2].addInner(childNode, found, baseOffset + 1);
              else
                  children.splice(childIndex, 0, childOffset, childOffset + childNode.nodeSize, buildTree(found, childNode, baseOffset + 1, noSpec));
              childIndex += 3;
          });
          let local = moveSpans(childIndex ? withoutNulls(decorations) : decorations, -offset);
          for (let i = 0; i < local.length; i++)
              if (!local[i].type.valid(doc, local[i]))
                  local.splice(i--, 1);
          return new DecorationSet(local.length ? this.local.concat(local).sort(byPos) : this.local, children || this.children);
      }
      /**
      Create a new set that contains the decorations in this set, minus
      the ones in the given array.
      */
      remove(decorations) {
          if (decorations.length == 0 || this == empty)
              return this;
          return this.removeInner(decorations, 0);
      }
      removeInner(decorations, offset) {
          let children = this.children, local = this.local;
          for (let i = 0; i < children.length; i += 3) {
              let found;
              let from = children[i] + offset, to = children[i + 1] + offset;
              for (let j = 0, span; j < decorations.length; j++)
                  if (span = decorations[j]) {
                      if (span.from > from && span.to < to) {
                          decorations[j] = null;
                          (found || (found = [])).push(span);
                      }
                  }
              if (!found)
                  continue;
              if (children == this.children)
                  children = this.children.slice();
              let removed = children[i + 2].removeInner(found, from + 1);
              if (removed != empty) {
                  children[i + 2] = removed;
              }
              else {
                  children.splice(i, 3);
                  i -= 3;
              }
          }
          if (local.length)
              for (let i = 0, span; i < decorations.length; i++)
                  if (span = decorations[i]) {
                      for (let j = 0; j < local.length; j++)
                          if (local[j].eq(span, offset)) {
                              if (local == this.local)
                                  local = this.local.slice();
                              local.splice(j--, 1);
                          }
                  }
          if (children == this.children && local == this.local)
              return this;
          return local.length || children.length ? new DecorationSet(local, children) : empty;
      }
      /**
      @internal
      */
      forChild(offset, node) {
          if (this == empty)
              return this;
          if (node.isLeaf)
              return DecorationSet.empty;
          let child, local;
          for (let i = 0; i < this.children.length; i += 3)
              if (this.children[i] >= offset) {
                  if (this.children[i] == offset)
                      child = this.children[i + 2];
                  break;
              }
          let start = offset + 1, end = start + node.content.size;
          for (let i = 0; i < this.local.length; i++) {
              let dec = this.local[i];
              if (dec.from < end && dec.to > start && (dec.type instanceof InlineType)) {
                  let from = Math.max(start, dec.from) - start, to = Math.min(end, dec.to) - start;
                  if (from < to)
                      (local || (local = [])).push(dec.copy(from, to));
              }
          }
          if (local) {
              let localSet = new DecorationSet(local.sort(byPos), none);
              return child ? new DecorationGroup([localSet, child]) : localSet;
          }
          return child || empty;
      }
      /**
      @internal
      */
      eq(other) {
          if (this == other)
              return true;
          if (!(other instanceof DecorationSet) ||
              this.local.length != other.local.length ||
              this.children.length != other.children.length)
              return false;
          for (let i = 0; i < this.local.length; i++)
              if (!this.local[i].eq(other.local[i]))
                  return false;
          for (let i = 0; i < this.children.length; i += 3)
              if (this.children[i] != other.children[i] ||
                  this.children[i + 1] != other.children[i + 1] ||
                  !this.children[i + 2].eq(other.children[i + 2]))
                  return false;
          return true;
      }
      /**
      @internal
      */
      locals(node) {
          return removeOverlap(this.localsInner(node));
      }
      /**
      @internal
      */
      localsInner(node) {
          if (this == empty)
              return none;
          if (node.inlineContent || !this.local.some(InlineType.is))
              return this.local;
          let result = [];
          for (let i = 0; i < this.local.length; i++) {
              if (!(this.local[i].type instanceof InlineType))
                  result.push(this.local[i]);
          }
          return result;
      }
  }
  /**
  The empty set of decorations.
  */
  DecorationSet.empty = new DecorationSet([], []);
  /**
  @internal
  */
  DecorationSet.removeOverlap = removeOverlap;
  const empty = DecorationSet.empty;
  // An abstraction that allows the code dealing with decorations to
  // treat multiple DecorationSet objects as if it were a single object
  // with (a subset of) the same interface.
  class DecorationGroup {
      constructor(members) {
          this.members = members;
      }
      map(mapping, doc) {
          const mappedDecos = this.members.map(member => member.map(mapping, doc, noSpec));
          return DecorationGroup.from(mappedDecos);
      }
      forChild(offset, child) {
          if (child.isLeaf)
              return DecorationSet.empty;
          let found = [];
          for (let i = 0; i < this.members.length; i++) {
              let result = this.members[i].forChild(offset, child);
              if (result == empty)
                  continue;
              if (result instanceof DecorationGroup)
                  found = found.concat(result.members);
              else
                  found.push(result);
          }
          return DecorationGroup.from(found);
      }
      eq(other) {
          if (!(other instanceof DecorationGroup) ||
              other.members.length != this.members.length)
              return false;
          for (let i = 0; i < this.members.length; i++)
              if (!this.members[i].eq(other.members[i]))
                  return false;
          return true;
      }
      locals(node) {
          let result, sorted = true;
          for (let i = 0; i < this.members.length; i++) {
              let locals = this.members[i].localsInner(node);
              if (!locals.length)
                  continue;
              if (!result) {
                  result = locals;
              }
              else {
                  if (sorted) {
                      result = result.slice();
                      sorted = false;
                  }
                  for (let j = 0; j < locals.length; j++)
                      result.push(locals[j]);
              }
          }
          return result ? removeOverlap(sorted ? result : result.sort(byPos)) : none;
      }
      // Create a group for the given array of decoration sets, or return
      // a single set when possible.
      static from(members) {
          switch (members.length) {
              case 0: return empty;
              case 1: return members[0];
              default: return new DecorationGroup(members.every(m => m instanceof DecorationSet) ? members :
                  members.reduce((r, m) => r.concat(m instanceof DecorationSet ? m : m.members), []));
          }
      }
  }
  function mapChildren(oldChildren, newLocal, mapping, node, offset, oldOffset, options) {
      let children = oldChildren.slice();
      // Mark the children that are directly touched by changes, and
      // move those that are after the changes.
      for (let i = 0, baseOffset = oldOffset; i < mapping.maps.length; i++) {
          let moved = 0;
          mapping.maps[i].forEach((oldStart, oldEnd, newStart, newEnd) => {
              let dSize = (newEnd - newStart) - (oldEnd - oldStart);
              for (let i = 0; i < children.length; i += 3) {
                  let end = children[i + 1];
                  if (end < 0 || oldStart > end + baseOffset - moved)
                      continue;
                  let start = children[i] + baseOffset - moved;
                  if (oldEnd >= start) {
                      children[i + 1] = oldStart <= start ? -2 : -1;
                  }
                  else if (newStart >= offset && dSize) {
                      children[i] += dSize;
                      children[i + 1] += dSize;
                  }
              }
              moved += dSize;
          });
          baseOffset = mapping.maps[i].map(baseOffset, -1);
      }
      // Find the child nodes that still correspond to a single node,
      // recursively call mapInner on them and update their positions.
      let mustRebuild = false;
      for (let i = 0; i < children.length; i += 3)
          if (children[i + 1] < 0) { // Touched nodes
              if (children[i + 1] == -2) {
                  mustRebuild = true;
                  children[i + 1] = -1;
                  continue;
              }
              let from = mapping.map(oldChildren[i] + oldOffset), fromLocal = from - offset;
              if (fromLocal < 0 || fromLocal >= node.content.size) {
                  mustRebuild = true;
                  continue;
              }
              // Must read oldChildren because children was tagged with -1
              let to = mapping.map(oldChildren[i + 1] + oldOffset, -1), toLocal = to - offset;
              let { index, offset: childOffset } = node.content.findIndex(fromLocal);
              let childNode = node.maybeChild(index);
              if (childNode && childOffset == fromLocal && childOffset + childNode.nodeSize == toLocal) {
                  let mapped = children[i + 2]
                      .mapInner(mapping, childNode, from + 1, oldChildren[i] + oldOffset + 1, options);
                  if (mapped != empty) {
                      children[i] = fromLocal;
                      children[i + 1] = toLocal;
                      children[i + 2] = mapped;
                  }
                  else {
                      children[i + 1] = -2;
                      mustRebuild = true;
                  }
              }
              else {
                  mustRebuild = true;
              }
          }
      // Remaining children must be collected and rebuilt into the appropriate structure
      if (mustRebuild) {
          let decorations = mapAndGatherRemainingDecorations(children, oldChildren, newLocal, mapping, offset, oldOffset, options);
          let built = buildTree(decorations, node, 0, options);
          newLocal = built.local;
          for (let i = 0; i < children.length; i += 3)
              if (children[i + 1] < 0) {
                  children.splice(i, 3);
                  i -= 3;
              }
          for (let i = 0, j = 0; i < built.children.length; i += 3) {
              let from = built.children[i];
              while (j < children.length && children[j] < from)
                  j += 3;
              children.splice(j, 0, built.children[i], built.children[i + 1], built.children[i + 2]);
          }
      }
      return new DecorationSet(newLocal.sort(byPos), children);
  }
  function moveSpans(spans, offset) {
      if (!offset || !spans.length)
          return spans;
      let result = [];
      for (let i = 0; i < spans.length; i++) {
          let span = spans[i];
          result.push(new Decoration(span.from + offset, span.to + offset, span.type));
      }
      return result;
  }
  function mapAndGatherRemainingDecorations(children, oldChildren, decorations, mapping, offset, oldOffset, options) {
      // Gather all decorations from the remaining marked children
      function gather(set, oldOffset) {
          for (let i = 0; i < set.local.length; i++) {
              let mapped = set.local[i].map(mapping, offset, oldOffset);
              if (mapped)
                  decorations.push(mapped);
              else if (options.onRemove)
                  options.onRemove(set.local[i].spec);
          }
          for (let i = 0; i < set.children.length; i += 3)
              gather(set.children[i + 2], set.children[i] + oldOffset + 1);
      }
      for (let i = 0; i < children.length; i += 3)
          if (children[i + 1] == -1)
              gather(children[i + 2], oldChildren[i] + oldOffset + 1);
      return decorations;
  }
  function takeSpansForNode(spans, node, offset) {
      if (node.isLeaf)
          return null;
      let end = offset + node.nodeSize, found = null;
      for (let i = 0, span; i < spans.length; i++) {
          if ((span = spans[i]) && span.from > offset && span.to < end) {
              (found || (found = [])).push(span);
              spans[i] = null;
          }
      }
      return found;
  }
  function withoutNulls(array) {
      let result = [];
      for (let i = 0; i < array.length; i++)
          if (array[i] != null)
              result.push(array[i]);
      return result;
  }
  // Build up a tree that corresponds to a set of decorations. `offset`
  // is a base offset that should be subtracted from the `from` and `to`
  // positions in the spans (so that we don't have to allocate new spans
  // for recursive calls).
  function buildTree(spans, node, offset, options) {
      let children = [], hasNulls = false;
      node.forEach((childNode, localStart) => {
          let found = takeSpansForNode(spans, childNode, localStart + offset);
          if (found) {
              hasNulls = true;
              let subtree = buildTree(found, childNode, offset + localStart + 1, options);
              if (subtree != empty)
                  children.push(localStart, localStart + childNode.nodeSize, subtree);
          }
      });
      let locals = moveSpans(hasNulls ? withoutNulls(spans) : spans, -offset).sort(byPos);
      for (let i = 0; i < locals.length; i++)
          if (!locals[i].type.valid(node, locals[i])) {
              if (options.onRemove)
                  options.onRemove(locals[i].spec);
              locals.splice(i--, 1);
          }
      return locals.length || children.length ? new DecorationSet(locals, children) : empty;
  }
  // Used to sort decorations so that ones with a low start position
  // come first, and within a set with the same start position, those
  // with an smaller end position come first.
  function byPos(a, b) {
      return a.from - b.from || a.to - b.to;
  }
  // Scan a sorted array of decorations for partially overlapping spans,
  // and split those so that only fully overlapping spans are left (to
  // make subsequent rendering easier). Will return the input array if
  // no partially overlapping spans are found (the common case).
  function removeOverlap(spans) {
      let working = spans;
      for (let i = 0; i < working.length - 1; i++) {
          let span = working[i];
          if (span.from != span.to)
              for (let j = i + 1; j < working.length; j++) {
                  let next = working[j];
                  if (next.from == span.from) {
                      if (next.to != span.to) {
                          if (working == spans)
                              working = spans.slice();
                          // Followed by a partially overlapping larger span. Split that
                          // span.
                          working[j] = next.copy(next.from, span.to);
                          insertAhead(working, j + 1, next.copy(span.to, next.to));
                      }
                      continue;
                  }
                  else {
                      if (next.from < span.to) {
                          if (working == spans)
                              working = spans.slice();
                          // The end of this one overlaps with a subsequent span. Split
                          // this one.
                          working[i] = span.copy(span.from, next.from);
                          insertAhead(working, j, span.copy(next.from, span.to));
                      }
                      break;
                  }
              }
      }
      return working;
  }
  function insertAhead(array, i, deco) {
      while (i < array.length && byPos(deco, array[i]) > 0)
          i++;
      array.splice(i, 0, deco);
  }
  // Get the decorations associated with the current props of a view.
  function viewDecorations(view) {
      let found = [];
      view.someProp("decorations", f => {
          let result = f(view.state);
          if (result && result != empty)
              found.push(result);
      });
      if (view.cursorWrapper)
          found.push(DecorationSet.create(view.state.doc, [view.cursorWrapper.deco]));
      return DecorationGroup.from(found);
  }

  const observeOptions = {
      childList: true,
      characterData: true,
      characterDataOldValue: true,
      attributes: true,
      attributeOldValue: true,
      subtree: true
  };
  // IE11 has very broken mutation observers, so we also listen to DOMCharacterDataModified
  const useCharData = ie$1 && ie_version <= 11;
  class SelectionState {
      constructor() {
          this.anchorNode = null;
          this.anchorOffset = 0;
          this.focusNode = null;
          this.focusOffset = 0;
      }
      set(sel) {
          this.anchorNode = sel.anchorNode;
          this.anchorOffset = sel.anchorOffset;
          this.focusNode = sel.focusNode;
          this.focusOffset = sel.focusOffset;
      }
      clear() {
          this.anchorNode = this.focusNode = null;
      }
      eq(sel) {
          return sel.anchorNode == this.anchorNode && sel.anchorOffset == this.anchorOffset &&
              sel.focusNode == this.focusNode && sel.focusOffset == this.focusOffset;
      }
  }
  class DOMObserver {
      constructor(view, handleDOMChange) {
          this.view = view;
          this.handleDOMChange = handleDOMChange;
          this.queue = [];
          this.flushingSoon = -1;
          this.observer = null;
          this.currentSelection = new SelectionState;
          this.onCharData = null;
          this.suppressingSelectionUpdates = false;
          this.observer = window.MutationObserver &&
              new window.MutationObserver(mutations => {
                  for (let i = 0; i < mutations.length; i++)
                      this.queue.push(mutations[i]);
                  // IE11 will sometimes (on backspacing out a single character
                  // text node after a BR node) call the observer callback
                  // before actually updating the DOM, which will cause
                  // ProseMirror to miss the change (see #930)
                  if (ie$1 && ie_version <= 11 && mutations.some(m => m.type == "childList" && m.removedNodes.length ||
                      m.type == "characterData" && m.oldValue.length > m.target.nodeValue.length))
                      this.flushSoon();
                  else
                      this.flush();
              });
          if (useCharData) {
              this.onCharData = e => {
                  this.queue.push({ target: e.target, type: "characterData", oldValue: e.prevValue });
                  this.flushSoon();
              };
          }
          this.onSelectionChange = this.onSelectionChange.bind(this);
      }
      flushSoon() {
          if (this.flushingSoon < 0)
              this.flushingSoon = window.setTimeout(() => { this.flushingSoon = -1; this.flush(); }, 20);
      }
      forceFlush() {
          if (this.flushingSoon > -1) {
              window.clearTimeout(this.flushingSoon);
              this.flushingSoon = -1;
              this.flush();
          }
      }
      start() {
          if (this.observer) {
              this.observer.takeRecords();
              this.observer.observe(this.view.dom, observeOptions);
          }
          if (this.onCharData)
              this.view.dom.addEventListener("DOMCharacterDataModified", this.onCharData);
          this.connectSelection();
      }
      stop() {
          if (this.observer) {
              let take = this.observer.takeRecords();
              if (take.length) {
                  for (let i = 0; i < take.length; i++)
                      this.queue.push(take[i]);
                  window.setTimeout(() => this.flush(), 20);
              }
              this.observer.disconnect();
          }
          if (this.onCharData)
              this.view.dom.removeEventListener("DOMCharacterDataModified", this.onCharData);
          this.disconnectSelection();
      }
      connectSelection() {
          this.view.dom.ownerDocument.addEventListener("selectionchange", this.onSelectionChange);
      }
      disconnectSelection() {
          this.view.dom.ownerDocument.removeEventListener("selectionchange", this.onSelectionChange);
      }
      suppressSelectionUpdates() {
          this.suppressingSelectionUpdates = true;
          setTimeout(() => this.suppressingSelectionUpdates = false, 50);
      }
      onSelectionChange() {
          if (!hasFocusAndSelection(this.view))
              return;
          if (this.suppressingSelectionUpdates)
              return selectionToDOM(this.view);
          // Deletions on IE11 fire their events in the wrong order, giving
          // us a selection change event before the DOM changes are
          // reported.
          if (ie$1 && ie_version <= 11 && !this.view.state.selection.empty) {
              let sel = this.view.domSelectionRange();
              // Selection.isCollapsed isn't reliable on IE
              if (sel.focusNode && isEquivalentPosition(sel.focusNode, sel.focusOffset, sel.anchorNode, sel.anchorOffset))
                  return this.flushSoon();
          }
          this.flush();
      }
      setCurSelection() {
          this.currentSelection.set(this.view.domSelectionRange());
      }
      ignoreSelectionChange(sel) {
          if (!sel.focusNode)
              return true;
          let ancestors = new Set, container;
          for (let scan = sel.focusNode; scan; scan = parentNode(scan))
              ancestors.add(scan);
          for (let scan = sel.anchorNode; scan; scan = parentNode(scan))
              if (ancestors.has(scan)) {
                  container = scan;
                  break;
              }
          let desc = container && this.view.docView.nearestDesc(container);
          if (desc && desc.ignoreMutation({
              type: "selection",
              target: container.nodeType == 3 ? container.parentNode : container
          })) {
              this.setCurSelection();
              return true;
          }
      }
      flush() {
          let { view } = this;
          if (!view.docView || this.flushingSoon > -1)
              return;
          let mutations = this.observer ? this.observer.takeRecords() : [];
          if (this.queue.length) {
              mutations = this.queue.concat(mutations);
              this.queue.length = 0;
          }
          let sel = view.domSelectionRange();
          let newSel = !this.suppressingSelectionUpdates && !this.currentSelection.eq(sel) && hasFocusAndSelection(view) && !this.ignoreSelectionChange(sel);
          let from = -1, to = -1, typeOver = false, added = [];
          if (view.editable) {
              for (let i = 0; i < mutations.length; i++) {
                  let result = this.registerMutation(mutations[i], added);
                  if (result) {
                      from = from < 0 ? result.from : Math.min(result.from, from);
                      to = to < 0 ? result.to : Math.max(result.to, to);
                      if (result.typeOver)
                          typeOver = true;
                  }
              }
          }
          if (gecko && added.length > 1) {
              let brs = added.filter(n => n.nodeName == "BR");
              if (brs.length == 2) {
                  let a = brs[0], b = brs[1];
                  if (a.parentNode && a.parentNode.parentNode == b.parentNode)
                      b.remove();
                  else
                      a.remove();
              }
          }
          let readSel = null;
          // If it looks like the browser has reset the selection to the
          // start of the document after focus, restore the selection from
          // the state
          if (from < 0 && newSel && view.input.lastFocus > Date.now() - 200 &&
              Math.max(view.input.lastTouch, view.input.lastClick.time) < Date.now() - 300 &&
              selectionCollapsed(sel) && (readSel = selectionFromDOM(view)) &&
              readSel.eq(Selection.near(view.state.doc.resolve(0), 1))) {
              view.input.lastFocus = 0;
              selectionToDOM(view);
              this.currentSelection.set(sel);
              view.scrollToSelection();
          }
          else if (from > -1 || newSel) {
              if (from > -1) {
                  view.docView.markDirty(from, to);
                  checkCSS(view);
              }
              this.handleDOMChange(from, to, typeOver, added);
              if (view.docView && view.docView.dirty)
                  view.updateState(view.state);
              else if (!this.currentSelection.eq(sel))
                  selectionToDOM(view);
              this.currentSelection.set(sel);
          }
      }
      registerMutation(mut, added) {
          // Ignore mutations inside nodes that were already noted as inserted
          if (added.indexOf(mut.target) > -1)
              return null;
          let desc = this.view.docView.nearestDesc(mut.target);
          if (mut.type == "attributes" &&
              (desc == this.view.docView || mut.attributeName == "contenteditable" ||
                  // Firefox sometimes fires spurious events for null/empty styles
                  (mut.attributeName == "style" && !mut.oldValue && !mut.target.getAttribute("style"))))
              return null;
          if (!desc || desc.ignoreMutation(mut))
              return null;
          if (mut.type == "childList") {
              for (let i = 0; i < mut.addedNodes.length; i++)
                  added.push(mut.addedNodes[i]);
              if (desc.contentDOM && desc.contentDOM != desc.dom && !desc.contentDOM.contains(mut.target))
                  return { from: desc.posBefore, to: desc.posAfter };
              let prev = mut.previousSibling, next = mut.nextSibling;
              if (ie$1 && ie_version <= 11 && mut.addedNodes.length) {
                  // IE11 gives us incorrect next/prev siblings for some
                  // insertions, so if there are added nodes, recompute those
                  for (let i = 0; i < mut.addedNodes.length; i++) {
                      let { previousSibling, nextSibling } = mut.addedNodes[i];
                      if (!previousSibling || Array.prototype.indexOf.call(mut.addedNodes, previousSibling) < 0)
                          prev = previousSibling;
                      if (!nextSibling || Array.prototype.indexOf.call(mut.addedNodes, nextSibling) < 0)
                          next = nextSibling;
                  }
              }
              let fromOffset = prev && prev.parentNode == mut.target
                  ? domIndex(prev) + 1 : 0;
              let from = desc.localPosFromDOM(mut.target, fromOffset, -1);
              let toOffset = next && next.parentNode == mut.target
                  ? domIndex(next) : mut.target.childNodes.length;
              let to = desc.localPosFromDOM(mut.target, toOffset, 1);
              return { from, to };
          }
          else if (mut.type == "attributes") {
              return { from: desc.posAtStart - desc.border, to: desc.posAtEnd + desc.border };
          }
          else { // "characterData"
              return {
                  from: desc.posAtStart,
                  to: desc.posAtEnd,
                  // An event was generated for a text change that didn't change
                  // any text. Mark the dom change to fall back to assuming the
                  // selection was typed over with an identical value if it can't
                  // find another change.
                  typeOver: mut.target.nodeValue == mut.oldValue
              };
          }
      }
  }
  let cssChecked = new WeakMap();
  let cssCheckWarned = false;
  function checkCSS(view) {
      if (cssChecked.has(view))
          return;
      cssChecked.set(view, null);
      if (['normal', 'nowrap', 'pre-line'].indexOf(getComputedStyle(view.dom).whiteSpace) !== -1) {
          view.requiresGeckoHackNode = gecko;
          if (cssCheckWarned)
              return;
          console["warn"]("ProseMirror expects the CSS white-space property to be set, preferably to 'pre-wrap'. It is recommended to load style/prosemirror.css from the prosemirror-view package.");
          cssCheckWarned = true;
      }
  }
  // Used to work around a Safari Selection/shadow DOM bug
  // Based on https://github.com/codemirror/dev/issues/414 fix
  function safariShadowSelectionRange(view) {
      let found;
      function read(event) {
          event.preventDefault();
          event.stopImmediatePropagation();
          found = event.getTargetRanges()[0];
      }
      // Because Safari (at least in 2018-2022) doesn't provide regular
      // access to the selection inside a shadowRoot, we have to perform a
      // ridiculous hack to get at it—using `execCommand` to trigger a
      // `beforeInput` event so that we can read the target range from the
      // event.
      view.dom.addEventListener("beforeinput", read, true);
      document.execCommand("indent");
      view.dom.removeEventListener("beforeinput", read, true);
      let anchorNode = found.startContainer, anchorOffset = found.startOffset;
      let focusNode = found.endContainer, focusOffset = found.endOffset;
      let currentAnchor = view.domAtPos(view.state.selection.anchor);
      // Since such a range doesn't distinguish between anchor and head,
      // use a heuristic that flips it around if its end matches the
      // current anchor.
      if (isEquivalentPosition(currentAnchor.node, currentAnchor.offset, focusNode, focusOffset))
          [anchorNode, anchorOffset, focusNode, focusOffset] = [focusNode, focusOffset, anchorNode, anchorOffset];
      return { anchorNode, anchorOffset, focusNode, focusOffset };
  }

  // Note that all referencing and parsing is done with the
  // start-of-operation selection and document, since that's the one
  // that the DOM represents. If any changes came in in the meantime,
  // the modification is mapped over those before it is applied, in
  // readDOMChange.
  function parseBetween(view, from_, to_) {
      let { node: parent, fromOffset, toOffset, from, to } = view.docView.parseRange(from_, to_);
      let domSel = view.domSelectionRange();
      let find;
      let anchor = domSel.anchorNode;
      if (anchor && view.dom.contains(anchor.nodeType == 1 ? anchor : anchor.parentNode)) {
          find = [{ node: anchor, offset: domSel.anchorOffset }];
          if (!selectionCollapsed(domSel))
              find.push({ node: domSel.focusNode, offset: domSel.focusOffset });
      }
      // Work around issue in Chrome where backspacing sometimes replaces
      // the deleted content with a random BR node (issues #799, #831)
      if (chrome$1 && view.input.lastKeyCode === 8) {
          for (let off = toOffset; off > fromOffset; off--) {
              let node = parent.childNodes[off - 1], desc = node.pmViewDesc;
              if (node.nodeName == "BR" && !desc) {
                  toOffset = off;
                  break;
              }
              if (!desc || desc.size)
                  break;
          }
      }
      let startDoc = view.state.doc;
      let parser = view.someProp("domParser") || DOMParser$1.fromSchema(view.state.schema);
      let $from = startDoc.resolve(from);
      let sel = null, doc = parser.parse(parent, {
          topNode: $from.parent,
          topMatch: $from.parent.contentMatchAt($from.index()),
          topOpen: true,
          from: fromOffset,
          to: toOffset,
          preserveWhitespace: $from.parent.type.whitespace == "pre" ? "full" : true,
          findPositions: find,
          ruleFromNode,
          context: $from
      });
      if (find && find[0].pos != null) {
          let anchor = find[0].pos, head = find[1] && find[1].pos;
          if (head == null)
              head = anchor;
          sel = { anchor: anchor + from, head: head + from };
      }
      return { doc, sel, from, to };
  }
  function ruleFromNode(dom) {
      let desc = dom.pmViewDesc;
      if (desc) {
          return desc.parseRule();
      }
      else if (dom.nodeName == "BR" && dom.parentNode) {
          // Safari replaces the list item or table cell with a BR
          // directly in the list node (?!) if you delete the last
          // character in a list item or table cell (#708, #862)
          if (safari && /^(ul|ol)$/i.test(dom.parentNode.nodeName)) {
              let skip = document.createElement("div");
              skip.appendChild(document.createElement("li"));
              return { skip };
          }
          else if (dom.parentNode.lastChild == dom || safari && /^(tr|table)$/i.test(dom.parentNode.nodeName)) {
              return { ignore: true };
          }
      }
      else if (dom.nodeName == "IMG" && dom.getAttribute("mark-placeholder")) {
          return { ignore: true };
      }
      return null;
  }
  const isInline = /^(a|abbr|acronym|b|bd[io]|big|br|button|cite|code|data(list)?|del|dfn|em|i|ins|kbd|label|map|mark|meter|output|q|ruby|s|samp|small|span|strong|su[bp]|time|u|tt|var)$/i;
  function readDOMChange(view, from, to, typeOver, addedNodes) {
      if (from < 0) {
          let origin = view.input.lastSelectionTime > Date.now() - 50 ? view.input.lastSelectionOrigin : null;
          let newSel = selectionFromDOM(view, origin);
          if (newSel && !view.state.selection.eq(newSel)) {
              if (chrome$1 && android &&
                  view.input.lastKeyCode === 13 && Date.now() - 100 < view.input.lastKeyCodeTime &&
                  view.someProp("handleKeyDown", f => f(view, keyEvent(13, "Enter"))))
                  return;
              let tr = view.state.tr.setSelection(newSel);
              if (origin == "pointer")
                  tr.setMeta("pointer", true);
              else if (origin == "key")
                  tr.scrollIntoView();
              view.dispatch(tr);
          }
          return;
      }
      let $before = view.state.doc.resolve(from);
      let shared = $before.sharedDepth(to);
      from = $before.before(shared + 1);
      to = view.state.doc.resolve(to).after(shared + 1);
      let sel = view.state.selection;
      let parse = parseBetween(view, from, to);
      let doc = view.state.doc, compare = doc.slice(parse.from, parse.to);
      let preferredPos, preferredSide;
      // Prefer anchoring to end when Backspace is pressed
      if (view.input.lastKeyCode === 8 && Date.now() - 100 < view.input.lastKeyCodeTime) {
          preferredPos = view.state.selection.to;
          preferredSide = "end";
      }
      else {
          preferredPos = view.state.selection.from;
          preferredSide = "start";
      }
      view.input.lastKeyCode = null;
      let change = findDiff(compare.content, parse.doc.content, parse.from, preferredPos, preferredSide);
      if ((ios && view.input.lastIOSEnter > Date.now() - 225 || android) &&
          addedNodes.some(n => n.nodeType == 1 && !isInline.test(n.nodeName)) &&
          (!change || change.endA >= change.endB) &&
          view.someProp("handleKeyDown", f => f(view, keyEvent(13, "Enter")))) {
          view.input.lastIOSEnter = 0;
          return;
      }
      if (!change) {
          if (typeOver && sel instanceof TextSelection && !sel.empty && sel.$head.sameParent(sel.$anchor) &&
              !view.composing && !(parse.sel && parse.sel.anchor != parse.sel.head)) {
              change = { start: sel.from, endA: sel.to, endB: sel.to };
          }
          else {
              if (parse.sel) {
                  let sel = resolveSelection(view, view.state.doc, parse.sel);
                  if (sel && !sel.eq(view.state.selection))
                      view.dispatch(view.state.tr.setSelection(sel));
              }
              return;
          }
      }
      // Chrome sometimes leaves the cursor before the inserted text when
      // composing after a cursor wrapper. This moves it forward.
      if (chrome$1 && view.cursorWrapper && parse.sel && parse.sel.anchor == view.cursorWrapper.deco.from &&
          parse.sel.head == parse.sel.anchor) {
          let size = change.endB - change.start;
          parse.sel = { anchor: parse.sel.anchor + size, head: parse.sel.anchor + size };
      }
      view.input.domChangeCount++;
      // Handle the case where overwriting a selection by typing matches
      // the start or end of the selected content, creating a change
      // that's smaller than what was actually overwritten.
      if (view.state.selection.from < view.state.selection.to &&
          change.start == change.endB &&
          view.state.selection instanceof TextSelection) {
          if (change.start > view.state.selection.from && change.start <= view.state.selection.from + 2 &&
              view.state.selection.from >= parse.from) {
              change.start = view.state.selection.from;
          }
          else if (change.endA < view.state.selection.to && change.endA >= view.state.selection.to - 2 &&
              view.state.selection.to <= parse.to) {
              change.endB += (view.state.selection.to - change.endA);
              change.endA = view.state.selection.to;
          }
      }
      // IE11 will insert a non-breaking space _ahead_ of the space after
      // the cursor space when adding a space before another space. When
      // that happened, adjust the change to cover the space instead.
      if (ie$1 && ie_version <= 11 && change.endB == change.start + 1 &&
          change.endA == change.start && change.start > parse.from &&
          parse.doc.textBetween(change.start - parse.from - 1, change.start - parse.from + 1) == " \u00a0") {
          change.start--;
          change.endA--;
          change.endB--;
      }
      let $from = parse.doc.resolveNoCache(change.start - parse.from);
      let $to = parse.doc.resolveNoCache(change.endB - parse.from);
      let $fromA = doc.resolve(change.start);
      let inlineChange = $from.sameParent($to) && $from.parent.inlineContent && $fromA.end() >= change.endA;
      let nextSel;
      // If this looks like the effect of pressing Enter (or was recorded
      // as being an iOS enter press), just dispatch an Enter key instead.
      if (((ios && view.input.lastIOSEnter > Date.now() - 225 &&
          (!inlineChange || addedNodes.some(n => n.nodeName == "DIV" || n.nodeName == "P"))) ||
          (!inlineChange && $from.pos < parse.doc.content.size &&
              (nextSel = Selection.findFrom(parse.doc.resolve($from.pos + 1), 1, true)) &&
              nextSel.head == $to.pos)) &&
          view.someProp("handleKeyDown", f => f(view, keyEvent(13, "Enter")))) {
          view.input.lastIOSEnter = 0;
          return;
      }
      // Same for backspace
      if (view.state.selection.anchor > change.start &&
          looksLikeJoin(doc, change.start, change.endA, $from, $to) &&
          view.someProp("handleKeyDown", f => f(view, keyEvent(8, "Backspace")))) {
          if (android && chrome$1)
              view.domObserver.suppressSelectionUpdates(); // #820
          return;
      }
      // Chrome Android will occasionally, during composition, delete the
      // entire composition and then immediately insert it again. This is
      // used to detect that situation.
      if (chrome$1 && android && change.endB == change.start)
          view.input.lastAndroidDelete = Date.now();
      // This tries to detect Android virtual keyboard
      // enter-and-pick-suggestion action. That sometimes (see issue
      // #1059) first fires a DOM mutation, before moving the selection to
      // the newly created block. And then, because ProseMirror cleans up
      // the DOM selection, it gives up moving the selection entirely,
      // leaving the cursor in the wrong place. When that happens, we drop
      // the new paragraph from the initial change, and fire a simulated
      // enter key afterwards.
      if (android && !inlineChange && $from.start() != $to.start() && $to.parentOffset == 0 && $from.depth == $to.depth &&
          parse.sel && parse.sel.anchor == parse.sel.head && parse.sel.head == change.endA) {
          change.endB -= 2;
          $to = parse.doc.resolveNoCache(change.endB - parse.from);
          setTimeout(() => {
              view.someProp("handleKeyDown", function (f) { return f(view, keyEvent(13, "Enter")); });
          }, 20);
      }
      let chFrom = change.start, chTo = change.endA;
      let tr, storedMarks, markChange;
      if (inlineChange) {
          if ($from.pos == $to.pos) { // Deletion
              // IE11 sometimes weirdly moves the DOM selection around after
              // backspacing out the first element in a textblock
              if (ie$1 && ie_version <= 11 && $from.parentOffset == 0) {
                  view.domObserver.suppressSelectionUpdates();
                  setTimeout(() => selectionToDOM(view), 20);
              }
              tr = view.state.tr.delete(chFrom, chTo);
              storedMarks = doc.resolve(change.start).marksAcross(doc.resolve(change.endA));
          }
          else if ( // Adding or removing a mark
          change.endA == change.endB &&
              (markChange = isMarkChange($from.parent.content.cut($from.parentOffset, $to.parentOffset), $fromA.parent.content.cut($fromA.parentOffset, change.endA - $fromA.start())))) {
              tr = view.state.tr;
              if (markChange.type == "add")
                  tr.addMark(chFrom, chTo, markChange.mark);
              else
                  tr.removeMark(chFrom, chTo, markChange.mark);
          }
          else if ($from.parent.child($from.index()).isText && $from.index() == $to.index() - ($to.textOffset ? 0 : 1)) {
              // Both positions in the same text node -- simply insert text
              let text = $from.parent.textBetween($from.parentOffset, $to.parentOffset);
              if (view.someProp("handleTextInput", f => f(view, chFrom, chTo, text)))
                  return;
              tr = view.state.tr.insertText(text, chFrom, chTo);
          }
      }
      if (!tr)
          tr = view.state.tr.replace(chFrom, chTo, parse.doc.slice(change.start - parse.from, change.endB - parse.from));
      if (parse.sel) {
          let sel = resolveSelection(view, tr.doc, parse.sel);
          // Chrome Android will sometimes, during composition, report the
          // selection in the wrong place. If it looks like that is
          // happening, don't update the selection.
          // Edge just doesn't move the cursor forward when you start typing
          // in an empty block or between br nodes.
          if (sel && !(chrome$1 && android && view.composing && sel.empty &&
              (change.start != change.endB || view.input.lastAndroidDelete < Date.now() - 100) &&
              (sel.head == chFrom || sel.head == tr.mapping.map(chTo) - 1) ||
              ie$1 && sel.empty && sel.head == chFrom))
              tr.setSelection(sel);
      }
      if (storedMarks)
          tr.ensureMarks(storedMarks);
      view.dispatch(tr.scrollIntoView());
  }
  function resolveSelection(view, doc, parsedSel) {
      if (Math.max(parsedSel.anchor, parsedSel.head) > doc.content.size)
          return null;
      return selectionBetween(view, doc.resolve(parsedSel.anchor), doc.resolve(parsedSel.head));
  }
  // Given two same-length, non-empty fragments of inline content,
  // determine whether the first could be created from the second by
  // removing or adding a single mark type.
  function isMarkChange(cur, prev) {
      let curMarks = cur.firstChild.marks, prevMarks = prev.firstChild.marks;
      let added = curMarks, removed = prevMarks, type, mark, update;
      for (let i = 0; i < prevMarks.length; i++)
          added = prevMarks[i].removeFromSet(added);
      for (let i = 0; i < curMarks.length; i++)
          removed = curMarks[i].removeFromSet(removed);
      if (added.length == 1 && removed.length == 0) {
          mark = added[0];
          type = "add";
          update = (node) => node.mark(mark.addToSet(node.marks));
      }
      else if (added.length == 0 && removed.length == 1) {
          mark = removed[0];
          type = "remove";
          update = (node) => node.mark(mark.removeFromSet(node.marks));
      }
      else {
          return null;
      }
      let updated = [];
      for (let i = 0; i < prev.childCount; i++)
          updated.push(update(prev.child(i)));
      if (Fragment.from(updated).eq(cur))
          return { mark, type };
  }
  function looksLikeJoin(old, start, end, $newStart, $newEnd) {
      if (!$newStart.parent.isTextblock ||
          // The content must have shrunk
          end - start <= $newEnd.pos - $newStart.pos ||
          // newEnd must point directly at or after the end of the block that newStart points into
          skipClosingAndOpening($newStart, true, false) < $newEnd.pos)
          return false;
      let $start = old.resolve(start);
      // Start must be at the end of a block
      if ($start.parentOffset < $start.parent.content.size || !$start.parent.isTextblock)
          return false;
      let $next = old.resolve(skipClosingAndOpening($start, true, true));
      // The next textblock must start before end and end near it
      if (!$next.parent.isTextblock || $next.pos > end ||
          skipClosingAndOpening($next, true, false) < end)
          return false;
      // The fragments after the join point must match
      return $newStart.parent.content.cut($newStart.parentOffset).eq($next.parent.content);
  }
  function skipClosingAndOpening($pos, fromEnd, mayOpen) {
      let depth = $pos.depth, end = fromEnd ? $pos.end() : $pos.pos;
      while (depth > 0 && (fromEnd || $pos.indexAfter(depth) == $pos.node(depth).childCount)) {
          depth--;
          end++;
          fromEnd = false;
      }
      if (mayOpen) {
          let next = $pos.node(depth).maybeChild($pos.indexAfter(depth));
          while (next && !next.isLeaf) {
              next = next.firstChild;
              end++;
          }
      }
      return end;
  }
  function findDiff(a, b, pos, preferredPos, preferredSide) {
      let start = a.findDiffStart(b, pos);
      if (start == null)
          return null;
      let { a: endA, b: endB } = a.findDiffEnd(b, pos + a.size, pos + b.size);
      if (preferredSide == "end") {
          let adjust = Math.max(0, start - Math.min(endA, endB));
          preferredPos -= endA + adjust - start;
      }
      if (endA < start && a.size < b.size) {
          let move = preferredPos <= start && preferredPos >= endA ? start - preferredPos : 0;
          start -= move;
          endB = start + (endB - endA);
          endA = start;
      }
      else if (endB < start) {
          let move = preferredPos <= start && preferredPos >= endB ? start - preferredPos : 0;
          start -= move;
          endA = start + (endA - endB);
          endB = start;
      }
      return { start, endA, endB };
  }
  /**
  An editor view manages the DOM structure that represents an
  editable document. Its state and behavior are determined by its
  [props](https://prosemirror.net/docs/ref/#view.DirectEditorProps).
  */
  class EditorView {
      /**
      Create a view. `place` may be a DOM node that the editor should
      be appended to, a function that will place it into the document,
      or an object whose `mount` property holds the node to use as the
      document container. If it is `null`, the editor will not be
      added to the document.
      */
      constructor(place, props) {
          this._root = null;
          /**
          @internal
          */
          this.focused = false;
          /**
          Kludge used to work around a Chrome bug @internal
          */
          this.trackWrites = null;
          this.mounted = false;
          /**
          @internal
          */
          this.markCursor = null;
          /**
          @internal
          */
          this.cursorWrapper = null;
          /**
          @internal
          */
          this.lastSelectedViewDesc = undefined;
          /**
          @internal
          */
          this.input = new InputState;
          this.prevDirectPlugins = [];
          this.pluginViews = [];
          /**
          Holds `true` when a hack node is needed in Firefox to prevent the
          [space is eaten issue](https://github.com/ProseMirror/prosemirror/issues/651)
          @internal
          */
          this.requiresGeckoHackNode = false;
          /**
          When editor content is being dragged, this object contains
          information about the dragged slice and whether it is being
          copied or moved. At any other time, it is null.
          */
          this.dragging = null;
          this._props = props;
          this.state = props.state;
          this.directPlugins = props.plugins || [];
          this.directPlugins.forEach(checkStateComponent);
          this.dispatch = this.dispatch.bind(this);
          this.dom = (place && place.mount) || document.createElement("div");
          if (place) {
              if (place.appendChild)
                  place.appendChild(this.dom);
              else if (typeof place == "function")
                  place(this.dom);
              else if (place.mount)
                  this.mounted = true;
          }
          this.editable = getEditable(this);
          updateCursorWrapper(this);
          this.nodeViews = buildNodeViews(this);
          this.docView = docViewDesc(this.state.doc, computeDocDeco(this), viewDecorations(this), this.dom, this);
          this.domObserver = new DOMObserver(this, (from, to, typeOver, added) => readDOMChange(this, from, to, typeOver, added));
          this.domObserver.start();
          initInput(this);
          this.updatePluginViews();
      }
      /**
      Holds `true` when a
      [composition](https://w3c.github.io/uievents/#events-compositionevents)
      is active.
      */
      get composing() { return this.input.composing; }
      /**
      The view's current [props](https://prosemirror.net/docs/ref/#view.EditorProps).
      */
      get props() {
          if (this._props.state != this.state) {
              let prev = this._props;
              this._props = {};
              for (let name in prev)
                  this._props[name] = prev[name];
              this._props.state = this.state;
          }
          return this._props;
      }
      /**
      Update the view's props. Will immediately cause an update to
      the DOM.
      */
      update(props) {
          if (props.handleDOMEvents != this._props.handleDOMEvents)
              ensureListeners(this);
          let prevProps = this._props;
          this._props = props;
          if (props.plugins) {
              props.plugins.forEach(checkStateComponent);
              this.directPlugins = props.plugins;
          }
          this.updateStateInner(props.state, prevProps);
      }
      /**
      Update the view by updating existing props object with the object
      given as argument. Equivalent to `view.update(Object.assign({},
      view.props, props))`.
      */
      setProps(props) {
          let updated = {};
          for (let name in this._props)
              updated[name] = this._props[name];
          updated.state = this.state;
          for (let name in props)
              updated[name] = props[name];
          this.update(updated);
      }
      /**
      Update the editor's `state` prop, without touching any of the
      other props.
      */
      updateState(state) {
          this.updateStateInner(state, this._props);
      }
      updateStateInner(state, prevProps) {
          let prev = this.state, redraw = false, updateSel = false;
          // When stored marks are added, stop composition, so that they can
          // be displayed.
          if (state.storedMarks && this.composing) {
              clearComposition(this);
              updateSel = true;
          }
          this.state = state;
          let pluginsChanged = prev.plugins != state.plugins || this._props.plugins != prevProps.plugins;
          if (pluginsChanged || this._props.plugins != prevProps.plugins || this._props.nodeViews != prevProps.nodeViews) {
              let nodeViews = buildNodeViews(this);
              if (changedNodeViews(nodeViews, this.nodeViews)) {
                  this.nodeViews = nodeViews;
                  redraw = true;
              }
          }
          if (pluginsChanged || prevProps.handleDOMEvents != this._props.handleDOMEvents) {
              ensureListeners(this);
          }
          this.editable = getEditable(this);
          updateCursorWrapper(this);
          let innerDeco = viewDecorations(this), outerDeco = computeDocDeco(this);
          let scroll = prev.plugins != state.plugins && !prev.doc.eq(state.doc) ? "reset"
              : state.scrollToSelection > prev.scrollToSelection ? "to selection" : "preserve";
          let updateDoc = redraw || !this.docView.matchesNode(state.doc, outerDeco, innerDeco);
          if (updateDoc || !state.selection.eq(prev.selection))
              updateSel = true;
          let oldScrollPos = scroll == "preserve" && updateSel && this.dom.style.overflowAnchor == null && storeScrollPos(this);
          if (updateSel) {
              this.domObserver.stop();
              // Work around an issue in Chrome, IE, and Edge where changing
              // the DOM around an active selection puts it into a broken
              // state where the thing the user sees differs from the
              // selection reported by the Selection object (#710, #973,
              // #1011, #1013, #1035).
              let forceSelUpdate = updateDoc && (ie$1 || chrome$1) && !this.composing &&
                  !prev.selection.empty && !state.selection.empty && selectionContextChanged(prev.selection, state.selection);
              if (updateDoc) {
                  // If the node that the selection points into is written to,
                  // Chrome sometimes starts misreporting the selection, so this
                  // tracks that and forces a selection reset when our update
                  // did write to the node.
                  let chromeKludge = chrome$1 ? (this.trackWrites = this.domSelectionRange().focusNode) : null;
                  if (redraw || !this.docView.update(state.doc, outerDeco, innerDeco, this)) {
                      this.docView.updateOuterDeco([]);
                      this.docView.destroy();
                      this.docView = docViewDesc(state.doc, outerDeco, innerDeco, this.dom, this);
                  }
                  if (chromeKludge && !this.trackWrites)
                      forceSelUpdate = true;
              }
              // Work around for an issue where an update arriving right between
              // a DOM selection change and the "selectionchange" event for it
              // can cause a spurious DOM selection update, disrupting mouse
              // drag selection.
              if (forceSelUpdate ||
                  !(this.input.mouseDown && this.domObserver.currentSelection.eq(this.domSelectionRange()) &&
                      anchorInRightPlace(this))) {
                  selectionToDOM(this, forceSelUpdate);
              }
              else {
                  syncNodeSelection(this, state.selection);
                  this.domObserver.setCurSelection();
              }
              this.domObserver.start();
          }
          this.updatePluginViews(prev);
          if (scroll == "reset") {
              this.dom.scrollTop = 0;
          }
          else if (scroll == "to selection") {
              this.scrollToSelection();
          }
          else if (oldScrollPos) {
              resetScrollPos(oldScrollPos);
          }
      }
      /**
      @internal
      */
      scrollToSelection() {
          let startDOM = this.domSelectionRange().focusNode;
          if (this.someProp("handleScrollToSelection", f => f(this))) ;
          else if (this.state.selection instanceof NodeSelection) {
              let target = this.docView.domAfterPos(this.state.selection.from);
              if (target.nodeType == 1)
                  scrollRectIntoView(this, target.getBoundingClientRect(), startDOM);
          }
          else {
              scrollRectIntoView(this, this.coordsAtPos(this.state.selection.head, 1), startDOM);
          }
      }
      destroyPluginViews() {
          let view;
          while (view = this.pluginViews.pop())
              if (view.destroy)
                  view.destroy();
      }
      updatePluginViews(prevState) {
          if (!prevState || prevState.plugins != this.state.plugins || this.directPlugins != this.prevDirectPlugins) {
              this.prevDirectPlugins = this.directPlugins;
              this.destroyPluginViews();
              for (let i = 0; i < this.directPlugins.length; i++) {
                  let plugin = this.directPlugins[i];
                  if (plugin.spec.view)
                      this.pluginViews.push(plugin.spec.view(this));
              }
              for (let i = 0; i < this.state.plugins.length; i++) {
                  let plugin = this.state.plugins[i];
                  if (plugin.spec.view)
                      this.pluginViews.push(plugin.spec.view(this));
              }
          }
          else {
              for (let i = 0; i < this.pluginViews.length; i++) {
                  let pluginView = this.pluginViews[i];
                  if (pluginView.update)
                      pluginView.update(this, prevState);
              }
          }
      }
      someProp(propName, f) {
          let prop = this._props && this._props[propName], value;
          if (prop != null && (value = f ? f(prop) : prop))
              return value;
          for (let i = 0; i < this.directPlugins.length; i++) {
              let prop = this.directPlugins[i].props[propName];
              if (prop != null && (value = f ? f(prop) : prop))
                  return value;
          }
          let plugins = this.state.plugins;
          if (plugins)
              for (let i = 0; i < plugins.length; i++) {
                  let prop = plugins[i].props[propName];
                  if (prop != null && (value = f ? f(prop) : prop))
                      return value;
              }
      }
      /**
      Query whether the view has focus.
      */
      hasFocus() {
          // Work around IE not handling focus correctly if resize handles are shown.
          // If the cursor is inside an element with resize handles, activeElement
          // will be that element instead of this.dom.
          if (ie$1) {
              // If activeElement is within this.dom, and there are no other elements
              // setting `contenteditable` to false in between, treat it as focused.
              let node = this.root.activeElement;
              if (node == this.dom)
                  return true;
              if (!node || !this.dom.contains(node))
                  return false;
              while (node && this.dom != node && this.dom.contains(node)) {
                  if (node.contentEditable == 'false')
                      return false;
                  node = node.parentElement;
              }
              return true;
          }
          return this.root.activeElement == this.dom;
      }
      /**
      Focus the editor.
      */
      focus() {
          this.domObserver.stop();
          if (this.editable)
              focusPreventScroll(this.dom);
          selectionToDOM(this);
          this.domObserver.start();
      }
      /**
      Get the document root in which the editor exists. This will
      usually be the top-level `document`, but might be a [shadow
      DOM](https://developer.mozilla.org/en-US/docs/Web/Web_Components/Shadow_DOM)
      root if the editor is inside one.
      */
      get root() {
          let cached = this._root;
          if (cached == null)
              for (let search = this.dom.parentNode; search; search = search.parentNode) {
                  if (search.nodeType == 9 || (search.nodeType == 11 && search.host)) {
                      if (!search.getSelection)
                          Object.getPrototypeOf(search).getSelection = () => search.ownerDocument.getSelection();
                      return this._root = search;
                  }
              }
          return cached || document;
      }
      /**
      Given a pair of viewport coordinates, return the document
      position that corresponds to them. May return null if the given
      coordinates aren't inside of the editor. When an object is
      returned, its `pos` property is the position nearest to the
      coordinates, and its `inside` property holds the position of the
      inner node that the position falls inside of, or -1 if it is at
      the top level, not in any node.
      */
      posAtCoords(coords) {
          return posAtCoords(this, coords);
      }
      /**
      Returns the viewport rectangle at a given document position.
      `left` and `right` will be the same number, as this returns a
      flat cursor-ish rectangle. If the position is between two things
      that aren't directly adjacent, `side` determines which element
      is used. When < 0, the element before the position is used,
      otherwise the element after.
      */
      coordsAtPos(pos, side = 1) {
          return coordsAtPos(this, pos, side);
      }
      /**
      Find the DOM position that corresponds to the given document
      position. When `side` is negative, find the position as close as
      possible to the content before the position. When positive,
      prefer positions close to the content after the position. When
      zero, prefer as shallow a position as possible.
      
      Note that you should **not** mutate the editor's internal DOM,
      only inspect it (and even that is usually not necessary).
      */
      domAtPos(pos, side = 0) {
          return this.docView.domFromPos(pos, side);
      }
      /**
      Find the DOM node that represents the document node after the
      given position. May return `null` when the position doesn't point
      in front of a node or if the node is inside an opaque node view.
      
      This is intended to be able to call things like
      `getBoundingClientRect` on that DOM node. Do **not** mutate the
      editor DOM directly, or add styling this way, since that will be
      immediately overriden by the editor as it redraws the node.
      */
      nodeDOM(pos) {
          let desc = this.docView.descAt(pos);
          return desc ? desc.nodeDOM : null;
      }
      /**
      Find the document position that corresponds to a given DOM
      position. (Whenever possible, it is preferable to inspect the
      document structure directly, rather than poking around in the
      DOM, but sometimes—for example when interpreting an event
      target—you don't have a choice.)
      
      The `bias` parameter can be used to influence which side of a DOM
      node to use when the position is inside a leaf node.
      */
      posAtDOM(node, offset, bias = -1) {
          let pos = this.docView.posFromDOM(node, offset, bias);
          if (pos == null)
              throw new RangeError("DOM position not inside the editor");
          return pos;
      }
      /**
      Find out whether the selection is at the end of a textblock when
      moving in a given direction. When, for example, given `"left"`,
      it will return true if moving left from the current cursor
      position would leave that position's parent textblock. Will apply
      to the view's current state by default, but it is possible to
      pass a different state.
      */
      endOfTextblock(dir, state) {
          return endOfTextblock(this, state || this.state, dir);
      }
      /**
      Run the editor's paste logic with the given HTML string. The
      `event`, if given, will be passed to the
      [`handlePaste`](https://prosemirror.net/docs/ref/#view.EditorProps.handlePaste) hook.
      */
      pasteHTML(html, event) {
          return doPaste(this, "", html, false, event || new ClipboardEvent("paste"));
      }
      /**
      Run the editor's paste logic with the given plain-text input.
      */
      pasteText(text, event) {
          return doPaste(this, text, null, true, event || new ClipboardEvent("paste"));
      }
      /**
      Removes the editor from the DOM and destroys all [node
      views](https://prosemirror.net/docs/ref/#view.NodeView).
      */
      destroy() {
          if (!this.docView)
              return;
          destroyInput(this);
          this.destroyPluginViews();
          if (this.mounted) {
              this.docView.update(this.state.doc, [], viewDecorations(this), this);
              this.dom.textContent = "";
          }
          else if (this.dom.parentNode) {
              this.dom.parentNode.removeChild(this.dom);
          }
          this.docView.destroy();
          this.docView = null;
      }
      /**
      This is true when the view has been
      [destroyed](https://prosemirror.net/docs/ref/#view.EditorView.destroy) (and thus should not be
      used anymore).
      */
      get isDestroyed() {
          return this.docView == null;
      }
      /**
      Used for testing.
      */
      dispatchEvent(event) {
          return dispatchEvent(this, event);
      }
      /**
      Dispatch a transaction. Will call
      [`dispatchTransaction`](https://prosemirror.net/docs/ref/#view.DirectEditorProps.dispatchTransaction)
      when given, and otherwise defaults to applying the transaction to
      the current state and calling
      [`updateState`](https://prosemirror.net/docs/ref/#view.EditorView.updateState) with the result.
      This method is bound to the view instance, so that it can be
      easily passed around.
      */
      dispatch(tr) {
          let dispatchTransaction = this._props.dispatchTransaction;
          if (dispatchTransaction)
              dispatchTransaction.call(this, tr);
          else
              this.updateState(this.state.apply(tr));
      }
      /**
      @internal
      */
      domSelectionRange() {
          return safari && this.root.nodeType === 11 && deepActiveElement(this.dom.ownerDocument) == this.dom
              ? safariShadowSelectionRange(this) : this.domSelection();
      }
      /**
      @internal
      */
      domSelection() {
          return this.root.getSelection();
      }
  }
  function computeDocDeco(view) {
      let attrs = Object.create(null);
      attrs.class = "ProseMirror";
      attrs.contenteditable = String(view.editable);
      attrs.translate = "no";
      view.someProp("attributes", value => {
          if (typeof value == "function")
              value = value(view.state);
          if (value)
              for (let attr in value) {
                  if (attr == "class")
                      attrs.class += " " + value[attr];
                  if (attr == "style") {
                      attrs.style = (attrs.style ? attrs.style + ";" : "") + value[attr];
                  }
                  else if (!attrs[attr] && attr != "contenteditable" && attr != "nodeName")
                      attrs[attr] = String(value[attr]);
              }
      });
      return [Decoration.node(0, view.state.doc.content.size, attrs)];
  }
  function updateCursorWrapper(view) {
      if (view.markCursor) {
          let dom = document.createElement("img");
          dom.className = "ProseMirror-separator";
          dom.setAttribute("mark-placeholder", "true");
          dom.setAttribute("alt", "");
          view.cursorWrapper = { dom, deco: Decoration.widget(view.state.selection.head, dom, { raw: true, marks: view.markCursor }) };
      }
      else {
          view.cursorWrapper = null;
      }
  }
  function getEditable(view) {
      return !view.someProp("editable", value => value(view.state) === false);
  }
  function selectionContextChanged(sel1, sel2) {
      let depth = Math.min(sel1.$anchor.sharedDepth(sel1.head), sel2.$anchor.sharedDepth(sel2.head));
      return sel1.$anchor.start(depth) != sel2.$anchor.start(depth);
  }
  function buildNodeViews(view) {
      let result = Object.create(null);
      function add(obj) {
          for (let prop in obj)
              if (!Object.prototype.hasOwnProperty.call(result, prop))
                  result[prop] = obj[prop];
      }
      view.someProp("nodeViews", add);
      view.someProp("markViews", add);
      return result;
  }
  function changedNodeViews(a, b) {
      let nA = 0, nB = 0;
      for (let prop in a) {
          if (a[prop] != b[prop])
              return true;
          nA++;
      }
      for (let _ in b)
          nB++;
      return nA != nB;
  }
  function checkStateComponent(plugin) {
      if (plugin.spec.state || plugin.spec.filterTransaction || plugin.spec.appendTransaction)
          throw new RangeError("Plugins passed directly to the view must not have a state component");
  }

  /**
  Input rules are regular expressions describing a piece of text
  that, when typed, causes something to happen. This might be
  changing two dashes into an emdash, wrapping a paragraph starting
  with `"> "` into a blockquote, or something entirely different.
  */
  class InputRule {
      // :: (RegExp, union<string, (state: EditorState, match: [string], start: number, end: number) → ?Transaction>)
      /**
      Create an input rule. The rule applies when the user typed
      something and the text directly in front of the cursor matches
      `match`, which should end with `$`.
      
      The `handler` can be a string, in which case the matched text, or
      the first matched group in the regexp, is replaced by that
      string.
      
      Or a it can be a function, which will be called with the match
      array produced by
      [`RegExp.exec`](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/RegExp/exec),
      as well as the start and end of the matched range, and which can
      return a [transaction](https://prosemirror.net/docs/ref/#state.Transaction) that describes the
      rule's effect, or null to indicate the input was not handled.
      */
      constructor(
      /**
      @internal
      */
      match, handler) {
          this.match = match;
          this.match = match;
          this.handler = typeof handler == "string" ? stringHandler(handler) : handler;
      }
  }
  function stringHandler(string) {
      return function (state, match, start, end) {
          let insert = string;
          if (match[1]) {
              let offset = match[0].lastIndexOf(match[1]);
              insert += match[0].slice(offset + match[1].length);
              start += offset;
              let cutOff = start - end;
              if (cutOff > 0) {
                  insert = match[0].slice(offset - cutOff, offset) + insert;
                  start = end;
              }
          }
          return state.tr.insertText(insert, start, end);
      };
  }
  const MAX_MATCH = 500;
  /**
  Create an input rules plugin. When enabled, it will cause text
  input that matches any of the given rules to trigger the rule's
  action.
  */
  function inputRules({ rules }) {
      let plugin = new Plugin({
          state: {
              init() { return null; },
              apply(tr, prev) {
                  let stored = tr.getMeta(this);
                  if (stored)
                      return stored;
                  return tr.selectionSet || tr.docChanged ? null : prev;
              }
          },
          props: {
              handleTextInput(view, from, to, text) {
                  return run(view, from, to, text, rules, plugin);
              },
              handleDOMEvents: {
                  compositionend: (view) => {
                      setTimeout(() => {
                          let { $cursor } = view.state.selection;
                          if ($cursor)
                              run(view, $cursor.pos, $cursor.pos, "", rules, plugin);
                      });
                  }
              }
          },
          isInputRules: true
      });
      return plugin;
  }
  function run(view, from, to, text, rules, plugin) {
      if (view.composing)
          return false;
      let state = view.state, $from = state.doc.resolve(from);
      if ($from.parent.type.spec.code)
          return false;
      let textBefore = $from.parent.textBetween(Math.max(0, $from.parentOffset - MAX_MATCH), $from.parentOffset, null, "\ufffc") + text;
      for (let i = 0; i < rules.length; i++) {
          let match = rules[i].match.exec(textBefore);
          let tr = match && rules[i].handler(state, match, from - (match[0].length - text.length), to);
          if (!tr)
              continue;
          view.dispatch(tr.setMeta(plugin, { transform: tr, from, to, text }));
          return true;
      }
      return false;
  }
  /**
  This is a command that will undo an input rule, if applying such a
  rule was the last thing that the user did.
  */
  const undoInputRule = (state, dispatch) => {
      let plugins = state.plugins;
      for (let i = 0; i < plugins.length; i++) {
          let plugin = plugins[i], undoable;
          if (plugin.spec.isInputRules && (undoable = plugin.getState(state))) {
              if (dispatch) {
                  let tr = state.tr, toUndo = undoable.transform;
                  for (let j = toUndo.steps.length - 1; j >= 0; j--)
                      tr.step(toUndo.steps[j].invert(toUndo.docs[j]));
                  if (undoable.text) {
                      let marks = tr.doc.resolve(undoable.from).marks();
                      tr.replaceWith(undoable.from, undoable.to, state.schema.text(undoable.text, marks));
                  }
                  else {
                      tr.delete(undoable.from, undoable.to);
                  }
                  dispatch(tr);
              }
              return true;
          }
      }
      return false;
  };

  /**
  Converts double dashes to an emdash.
  */
  const emDash = new InputRule(/--$/, "—");
  /**
  Converts three dots to an ellipsis character.
  */
  const ellipsis = new InputRule(/\.\.\.$/, "…");
  /**
  “Smart” opening double quotes.
  */
  const openDoubleQuote = new InputRule(/(?:^|[\s\{\[\(\<'"\u2018\u201C])(")$/, "“");
  /**
  “Smart” closing double quotes.
  */
  const closeDoubleQuote = new InputRule(/"$/, "”");
  /**
  “Smart” opening single quotes.
  */
  const openSingleQuote = new InputRule(/(?:^|[\s\{\[\(\<'"\u2018\u201C])(')$/, "‘");
  /**
  “Smart” closing single quotes.
  */
  const closeSingleQuote = new InputRule(/'$/, "’");
  /**
  Smart-quote related input rules.
  */
  const smartQuotes = [openDoubleQuote, closeDoubleQuote, openSingleQuote, closeSingleQuote];

  /**
  Build an input rule for automatically wrapping a textblock when a
  given string is typed. The `regexp` argument is
  directly passed through to the `InputRule` constructor. You'll
  probably want the regexp to start with `^`, so that the pattern can
  only occur at the start of a textblock.

  `nodeType` is the type of node to wrap in. If it needs attributes,
  you can either pass them directly, or pass a function that will
  compute them from the regular expression match.

  By default, if there's a node with the same type above the newly
  wrapped node, the rule will try to [join](https://prosemirror.net/docs/ref/#transform.Transform.join) those
  two nodes. You can pass a join predicate, which takes a regular
  expression match and the node before the wrapped node, and can
  return a boolean to indicate whether a join should happen.
  */
  function wrappingInputRule(regexp, nodeType, getAttrs = null, joinPredicate) {
      return new InputRule(regexp, (state, match, start, end) => {
          let attrs = getAttrs instanceof Function ? getAttrs(match) : getAttrs;
          let tr = state.tr.delete(start, end);
          let $start = tr.doc.resolve(start), range = $start.blockRange(), wrapping = range && findWrapping(range, nodeType, attrs);
          if (!wrapping)
              return null;
          tr.wrap(range, wrapping);
          let before = tr.doc.resolve(start - 1).nodeBefore;
          if (before && before.type == nodeType && canJoin(tr.doc, start - 1) &&
              (!joinPredicate || joinPredicate(match, before)))
              tr.join(start - 1);
          return tr;
      });
  }
  /**
  Build an input rule that changes the type of a textblock when the
  matched text is typed into it. You'll usually want to start your
  regexp with `^` to that it is only matched at the start of a
  textblock. The optional `getAttrs` parameter can be used to compute
  the new node's attributes, and works the same as in the
  `wrappingInputRule` function.
  */
  function textblockTypeInputRule(regexp, nodeType, getAttrs = null) {
      return new InputRule(regexp, (state, match, start, end) => {
          let $start = state.doc.resolve(start);
          let attrs = getAttrs instanceof Function ? getAttrs(match) : getAttrs;
          if (!$start.node(-1).canReplaceWith($start.index(-1), $start.indexAfter(-1), nodeType))
              return null;
          return state.tr
              .delete(start, end)
              .setBlockType(start, start, nodeType, attrs);
      });
  }

  var index$4 = /*#__PURE__*/Object.freeze({
    __proto__: null,
    InputRule: InputRule,
    closeDoubleQuote: closeDoubleQuote,
    closeSingleQuote: closeSingleQuote,
    ellipsis: ellipsis,
    emDash: emDash,
    inputRules: inputRules,
    openDoubleQuote: openDoubleQuote,
    openSingleQuote: openSingleQuote,
    smartQuotes: smartQuotes,
    textblockTypeInputRule: textblockTypeInputRule,
    undoInputRule: undoInputRule,
    wrappingInputRule: wrappingInputRule
  });

  /**
   * @abstract
   */
  class ProseMirrorPlugin {
    /**
     * An abstract class for building a ProseMirror Plugin.
     * @see {Plugin}
     * @param {Schema} schema  The schema to build the plugin against.
     */
    constructor(schema) {
      /**
       * The ProseMirror schema to build the plugin against.
       * @type {Schema}
       */
      Object.defineProperty(this, "schema", {value: schema});
    }

    /* -------------------------------------------- */

    /**
     * Build the plugin.
     * @param {Schema} schema     The ProseMirror schema to build the plugin against.
     * @param {object} [options]  Additional options to pass to the plugin.
     * @returns {Plugin}
     * @abstract
     */
    static build(schema, options={}) {
      throw new Error("Subclasses of ProseMirrorPlugin must implement a static build method.");
    }
  }

  /**
   * A class responsible for building the input rules for the ProseMirror editor.
   * @extends {ProseMirrorPlugin}
   */
  class ProseMirrorInputRules extends ProseMirrorPlugin {
    /**
     * Build the plugin.
     * @param {Schema} schema     The ProseMirror schema to build the plugin against.
     * @param {object} [options]  Additional options to pass to the plugin.
     * @param {number} [options.minHeadingLevel=0]  The minimum heading level to start from when generating heading input
     *                                              rules. The resulting heading level for a heading rule is equal to the
     *                                              number of leading hashes minus this number.
     * */
    static build(schema, {minHeadingLevel=0}={}) {
      const rules = new this(schema, {minHeadingLevel});
      return inputRules({rules: rules.buildRules()});
    }

    /* -------------------------------------------- */

    /**
     * Build input rules for node types present in the schema.
     * @returns {InputRule[]}
     */
    buildRules() {
      const rules = [ellipsis, this.constructor.#emDashRule()];
      if ( "blockquote" in this.schema.nodes ) rules.push(this.#blockQuoteRule());
      if ( "ordered_list" in this.schema.nodes ) rules.push(this.#orderedListRule());
      if ( "bullet_list" in this.schema.nodes ) rules.push(this.#bulletListRule());
      if ( "code_block" in this.schema.nodes ) rules.push(this.#codeBlockRule());
      if ( "heading" in this.schema.nodes ) rules.push(this.#headingRule(1, 6));
      if ( "horizontal_rule" in this.schema.nodes ) rules.push(this.#hrRule());
      return rules;
    }

    /* -------------------------------------------- */

    /**
     * Turn a "&gt;" at the start of a textblock into a blockquote.
     * @returns {InputRule}
     * @private
     */
    #blockQuoteRule() {
      return wrappingInputRule(/^\s*>\s$/, this.schema.nodes.blockquote);
    }

    /* -------------------------------------------- */

    /**
     * Turn a number followed by a dot at the start of a textblock into an ordered list.
     * @returns {InputRule}
     * @private
     */
    #orderedListRule() {
      return wrappingInputRule(
        /^(\d+)\.\s$/, this.schema.nodes.ordered_list,
        match => ({order: Number(match[1])}),
        (match, node) => (node.childCount + node.attrs.order) === Number(match[1])
      );
    }

    /* -------------------------------------------- */

    /**
     * Turn a -, +, or * at the start of a textblock into a bulleted list.
     * @returns {InputRule}
     * @private
     */
    #bulletListRule() {
      return wrappingInputRule(/^\s*[-+*]\s$/, this.schema.nodes.bullet_list);
    }

    /* -------------------------------------------- */

    /**
     * Turn three backticks at the start of a textblock into a code block.
     * @returns {InputRule}
     * @private
     */
    #codeBlockRule() {
      return textblockTypeInputRule(/^```$/, this.schema.nodes.code_block);
    }

    /* -------------------------------------------- */

    /**
     * Turns a double dash anywhere into an em-dash. Does not match at the start of the line to avoid conflict with the
     * HR rule.
     * @returns {InputRule}
     * @private
     */
    static #emDashRule() {
      return new InputRule(/[^-]+(--)/, "—");
    }

    /* -------------------------------------------- */

    /**
     * Turns a number of # characters followed by a space at the start of a textblock into a heading up to a maximum
     * level.
     * @param {number} minLevel  The minimum heading level to start generating input rules for.
     * @param {number} maxLevel  The maximum number of heading levels.
     * @returns {InputRule}
     * @private
     */
    #headingRule(minLevel, maxLevel) {
      const range = maxLevel - minLevel + 1;
      return textblockTypeInputRule(
        new RegExp(`^(#{1,${range}})\\s$`), this.schema.nodes.heading,
        match => {
          const level = match[1].length;
          return {level: level + minLevel - 1};
        }
      );
    }

    /* -------------------------------------------- */

    /**
     * Turns three hyphens at the start of a line into a horizontal rule.
     * @returns {InputRule}
     * @private
     */
    #hrRule() {
      const hr = this.schema.nodes.horizontal_rule;
      return new InputRule(/^---$/, (state, match, start, end) => {
        return state.tr.replaceRangeWith(start, end, hr.create()).scrollIntoView();
      });
    }
  }

  var base = {
    8: "Backspace",
    9: "Tab",
    10: "Enter",
    12: "NumLock",
    13: "Enter",
    16: "Shift",
    17: "Control",
    18: "Alt",
    20: "CapsLock",
    27: "Escape",
    32: " ",
    33: "PageUp",
    34: "PageDown",
    35: "End",
    36: "Home",
    37: "ArrowLeft",
    38: "ArrowUp",
    39: "ArrowRight",
    40: "ArrowDown",
    44: "PrintScreen",
    45: "Insert",
    46: "Delete",
    59: ";",
    61: "=",
    91: "Meta",
    92: "Meta",
    106: "*",
    107: "+",
    108: ",",
    109: "-",
    110: ".",
    111: "/",
    144: "NumLock",
    145: "ScrollLock",
    160: "Shift",
    161: "Shift",
    162: "Control",
    163: "Control",
    164: "Alt",
    165: "Alt",
    173: "-",
    186: ";",
    187: "=",
    188: ",",
    189: "-",
    190: ".",
    191: "/",
    192: "`",
    219: "[",
    220: "\\",
    221: "]",
    222: "'"
  };

  var shift = {
    48: ")",
    49: "!",
    50: "@",
    51: "#",
    52: "$",
    53: "%",
    54: "^",
    55: "&",
    56: "*",
    57: "(",
    59: ":",
    61: "+",
    173: "_",
    186: ":",
    187: "+",
    188: "<",
    189: "_",
    190: ">",
    191: "?",
    192: "~",
    219: "{",
    220: "|",
    221: "}",
    222: "\""
  };

  var chrome = typeof navigator != "undefined" && /Chrome\/(\d+)/.exec(navigator.userAgent);
  var mac$2 = typeof navigator != "undefined" && /Mac/.test(navigator.platform);
  var ie = typeof navigator != "undefined" && /MSIE \d|Trident\/(?:[7-9]|\d{2,})\..*rv:(\d+)/.exec(navigator.userAgent);
  var brokenModifierNames = mac$2 || chrome && +chrome[1] < 57;

  // Fill in the digit keys
  for (var i = 0; i < 10; i++) base[48 + i] = base[96 + i] = String(i);

  // The function keys
  for (var i = 1; i <= 24; i++) base[i + 111] = "F" + i;

  // And the alphabetic keys
  for (var i = 65; i <= 90; i++) {
    base[i] = String.fromCharCode(i + 32);
    shift[i] = String.fromCharCode(i);
  }

  // For each code that doesn't have a shift-equivalent, copy the base name
  for (var code$1 in base) if (!shift.hasOwnProperty(code$1)) shift[code$1] = base[code$1];

  function keyName(event) {
    var ignoreKey = brokenModifierNames && (event.ctrlKey || event.altKey || event.metaKey) ||
      ie && event.shiftKey && event.key && event.key.length == 1 ||
      event.key == "Unidentified";
    var name = (!ignoreKey && event.key) ||
      (event.shiftKey ? shift : base)[event.keyCode] ||
      event.key || "Unidentified";
    // Edge sometimes produces wrong names (Issue #3)
    if (name == "Esc") name = "Escape";
    if (name == "Del") name = "Delete";
    // https://developer.microsoft.com/en-us/microsoft-edge/platform/issues/8860571/
    if (name == "Left") name = "ArrowLeft";
    if (name == "Up") name = "ArrowUp";
    if (name == "Right") name = "ArrowRight";
    if (name == "Down") name = "ArrowDown";
    return name
  }

  const mac$1 = typeof navigator != "undefined" ? /Mac|iP(hone|[oa]d)/.test(navigator.platform) : false;
  function normalizeKeyName(name) {
      let parts = name.split(/-(?!$)/), result = parts[parts.length - 1];
      if (result == "Space")
          result = " ";
      let alt, ctrl, shift, meta;
      for (let i = 0; i < parts.length - 1; i++) {
          let mod = parts[i];
          if (/^(cmd|meta|m)$/i.test(mod))
              meta = true;
          else if (/^a(lt)?$/i.test(mod))
              alt = true;
          else if (/^(c|ctrl|control)$/i.test(mod))
              ctrl = true;
          else if (/^s(hift)?$/i.test(mod))
              shift = true;
          else if (/^mod$/i.test(mod)) {
              if (mac$1)
                  meta = true;
              else
                  ctrl = true;
          }
          else
              throw new Error("Unrecognized modifier name: " + mod);
      }
      if (alt)
          result = "Alt-" + result;
      if (ctrl)
          result = "Ctrl-" + result;
      if (meta)
          result = "Meta-" + result;
      if (shift)
          result = "Shift-" + result;
      return result;
  }
  function normalize(map) {
      let copy = Object.create(null);
      for (let prop in map)
          copy[normalizeKeyName(prop)] = map[prop];
      return copy;
  }
  function modifiers(name, event, shift = true) {
      if (event.altKey)
          name = "Alt-" + name;
      if (event.ctrlKey)
          name = "Ctrl-" + name;
      if (event.metaKey)
          name = "Meta-" + name;
      if (shift && event.shiftKey)
          name = "Shift-" + name;
      return name;
  }
  /**
  Create a keymap plugin for the given set of bindings.

  Bindings should map key names to [command](https://prosemirror.net/docs/ref/#commands)-style
  functions, which will be called with `(EditorState, dispatch,
  EditorView)` arguments, and should return true when they've handled
  the key. Note that the view argument isn't part of the command
  protocol, but can be used as an escape hatch if a binding needs to
  directly interact with the UI.

  Key names may be strings like `"Shift-Ctrl-Enter"`—a key
  identifier prefixed with zero or more modifiers. Key identifiers
  are based on the strings that can appear in
  [`KeyEvent.key`](https:developer.mozilla.org/en-US/docs/Web/API/KeyboardEvent/key).
  Use lowercase letters to refer to letter keys (or uppercase letters
  if you want shift to be held). You may use `"Space"` as an alias
  for the `" "` name.

  Modifiers can be given in any order. `Shift-` (or `s-`), `Alt-` (or
  `a-`), `Ctrl-` (or `c-` or `Control-`) and `Cmd-` (or `m-` or
  `Meta-`) are recognized. For characters that are created by holding
  shift, the `Shift-` prefix is implied, and should not be added
  explicitly.

  You can use `Mod-` as a shorthand for `Cmd-` on Mac and `Ctrl-` on
  other platforms.

  You can add multiple keymap plugins to an editor. The order in
  which they appear determines their precedence (the ones early in
  the array get to dispatch first).
  */
  function keymap(bindings) {
      return new Plugin({ props: { handleKeyDown: keydownHandler(bindings) } });
  }
  /**
  Given a set of bindings (using the same format as
  [`keymap`](https://prosemirror.net/docs/ref/#keymap.keymap)), return a [keydown
  handler](https://prosemirror.net/docs/ref/#view.EditorProps.handleKeyDown) that handles them.
  */
  function keydownHandler(bindings) {
      let map = normalize(bindings);
      return function (view, event) {
          let name = keyName(event), baseName, direct = map[modifiers(name, event)];
          if (direct && direct(view.state, view.dispatch, view))
              return true;
          // A character key
          if (name.length == 1 && name != " ") {
              if (event.shiftKey) {
                  // In case the name was already modified by shift, try looking
                  // it up without its shift modifier
                  let noShift = map[modifiers(name, event, false)];
                  if (noShift && noShift(view.state, view.dispatch, view))
                      return true;
              }
              if ((event.shiftKey || event.altKey || event.metaKey || name.charCodeAt(0) > 127) &&
                  (baseName = base[event.keyCode]) && baseName != name) {
                  // Try falling back to the keyCode when there's a modifier
                  // active or the character produced isn't ASCII, and our table
                  // produces a different name from the the keyCode. See #668,
                  // #1060
                  let fromCode = map[modifiers(baseName, event)];
                  if (fromCode && fromCode(view.state, view.dispatch, view))
                      return true;
              }
          }
          return false;
      };
  }

  /**
  Delete the selection, if there is one.
  */
  const deleteSelection = (state, dispatch) => {
      if (state.selection.empty)
          return false;
      if (dispatch)
          dispatch(state.tr.deleteSelection().scrollIntoView());
      return true;
  };
  function atBlockStart(state, view) {
      let { $cursor } = state.selection;
      if (!$cursor || (view ? !view.endOfTextblock("backward", state)
          : $cursor.parentOffset > 0))
          return null;
      return $cursor;
  }
  /**
  If the selection is empty and at the start of a textblock, try to
  reduce the distance between that block and the one before it—if
  there's a block directly before it that can be joined, join them.
  If not, try to move the selected block closer to the next one in
  the document structure by lifting it out of its parent or moving it
  into a parent of the previous block. Will use the view for accurate
  (bidi-aware) start-of-textblock detection if given.
  */
  const joinBackward = (state, dispatch, view) => {
      let $cursor = atBlockStart(state, view);
      if (!$cursor)
          return false;
      let $cut = findCutBefore($cursor);
      // If there is no node before this, try to lift
      if (!$cut) {
          let range = $cursor.blockRange(), target = range && liftTarget(range);
          if (target == null)
              return false;
          if (dispatch)
              dispatch(state.tr.lift(range, target).scrollIntoView());
          return true;
      }
      let before = $cut.nodeBefore;
      // Apply the joining algorithm
      if (!before.type.spec.isolating && deleteBarrier(state, $cut, dispatch))
          return true;
      // If the node below has no content and the node above is
      // selectable, delete the node below and select the one above.
      if ($cursor.parent.content.size == 0 &&
          (textblockAt(before, "end") || NodeSelection.isSelectable(before))) {
          let delStep = replaceStep(state.doc, $cursor.before(), $cursor.after(), Slice.empty);
          if (delStep && delStep.slice.size < delStep.to - delStep.from) {
              if (dispatch) {
                  let tr = state.tr.step(delStep);
                  tr.setSelection(textblockAt(before, "end") ? Selection.findFrom(tr.doc.resolve(tr.mapping.map($cut.pos, -1)), -1)
                      : NodeSelection.create(tr.doc, $cut.pos - before.nodeSize));
                  dispatch(tr.scrollIntoView());
              }
              return true;
          }
      }
      // If the node before is an atom, delete it
      if (before.isAtom && $cut.depth == $cursor.depth - 1) {
          if (dispatch)
              dispatch(state.tr.delete($cut.pos - before.nodeSize, $cut.pos).scrollIntoView());
          return true;
      }
      return false;
  };
  /**
  A more limited form of [`joinBackward`]($commands.joinBackward)
  that only tries to join the current textblock to the one before
  it, if the cursor is at the start of a textblock.
  */
  const joinTextblockBackward = (state, dispatch, view) => {
      let $cursor = atBlockStart(state, view);
      if (!$cursor)
          return false;
      let $cut = findCutBefore($cursor);
      return $cut ? joinTextblocksAround(state, $cut, dispatch) : false;
  };
  /**
  A more limited form of [`joinForward`]($commands.joinForward)
  that only tries to join the current textblock to the one after
  it, if the cursor is at the end of a textblock.
  */
  const joinTextblockForward = (state, dispatch, view) => {
      let $cursor = atBlockEnd(state, view);
      if (!$cursor)
          return false;
      let $cut = findCutAfter($cursor);
      return $cut ? joinTextblocksAround(state, $cut, dispatch) : false;
  };
  function joinTextblocksAround(state, $cut, dispatch) {
      let before = $cut.nodeBefore, beforeText = before, beforePos = $cut.pos - 1;
      for (; !beforeText.isTextblock; beforePos--) {
          if (beforeText.type.spec.isolating)
              return false;
          let child = beforeText.lastChild;
          if (!child)
              return false;
          beforeText = child;
      }
      let after = $cut.nodeAfter, afterText = after, afterPos = $cut.pos + 1;
      for (; !afterText.isTextblock; afterPos++) {
          if (afterText.type.spec.isolating)
              return false;
          let child = afterText.firstChild;
          if (!child)
              return false;
          afterText = child;
      }
      let step = replaceStep(state.doc, beforePos, afterPos, Slice.empty);
      if (!step || step.from != beforePos ||
          step instanceof ReplaceStep && step.slice.size >= afterPos - beforePos)
          return false;
      if (dispatch) {
          let tr = state.tr.step(step);
          tr.setSelection(TextSelection.create(tr.doc, beforePos));
          dispatch(tr.scrollIntoView());
      }
      return true;
  }
  function textblockAt(node, side, only = false) {
      for (let scan = node; scan; scan = (side == "start" ? scan.firstChild : scan.lastChild)) {
          if (scan.isTextblock)
              return true;
          if (only && scan.childCount != 1)
              return false;
      }
      return false;
  }
  /**
  When the selection is empty and at the start of a textblock, select
  the node before that textblock, if possible. This is intended to be
  bound to keys like backspace, after
  [`joinBackward`](https://prosemirror.net/docs/ref/#commands.joinBackward) or other deleting
  commands, as a fall-back behavior when the schema doesn't allow
  deletion at the selected point.
  */
  const selectNodeBackward = (state, dispatch, view) => {
      let { $head, empty } = state.selection, $cut = $head;
      if (!empty)
          return false;
      if ($head.parent.isTextblock) {
          if (view ? !view.endOfTextblock("backward", state) : $head.parentOffset > 0)
              return false;
          $cut = findCutBefore($head);
      }
      let node = $cut && $cut.nodeBefore;
      if (!node || !NodeSelection.isSelectable(node))
          return false;
      if (dispatch)
          dispatch(state.tr.setSelection(NodeSelection.create(state.doc, $cut.pos - node.nodeSize)).scrollIntoView());
      return true;
  };
  function findCutBefore($pos) {
      if (!$pos.parent.type.spec.isolating)
          for (let i = $pos.depth - 1; i >= 0; i--) {
              if ($pos.index(i) > 0)
                  return $pos.doc.resolve($pos.before(i + 1));
              if ($pos.node(i).type.spec.isolating)
                  break;
          }
      return null;
  }
  function atBlockEnd(state, view) {
      let { $cursor } = state.selection;
      if (!$cursor || (view ? !view.endOfTextblock("forward", state)
          : $cursor.parentOffset < $cursor.parent.content.size))
          return null;
      return $cursor;
  }
  /**
  If the selection is empty and the cursor is at the end of a
  textblock, try to reduce or remove the boundary between that block
  and the one after it, either by joining them or by moving the other
  block closer to this one in the tree structure. Will use the view
  for accurate start-of-textblock detection if given.
  */
  const joinForward = (state, dispatch, view) => {
      let $cursor = atBlockEnd(state, view);
      if (!$cursor)
          return false;
      let $cut = findCutAfter($cursor);
      // If there is no node after this, there's nothing to do
      if (!$cut)
          return false;
      let after = $cut.nodeAfter;
      // Try the joining algorithm
      if (deleteBarrier(state, $cut, dispatch))
          return true;
      // If the node above has no content and the node below is
      // selectable, delete the node above and select the one below.
      if ($cursor.parent.content.size == 0 &&
          (textblockAt(after, "start") || NodeSelection.isSelectable(after))) {
          let delStep = replaceStep(state.doc, $cursor.before(), $cursor.after(), Slice.empty);
          if (delStep && delStep.slice.size < delStep.to - delStep.from) {
              if (dispatch) {
                  let tr = state.tr.step(delStep);
                  tr.setSelection(textblockAt(after, "start") ? Selection.findFrom(tr.doc.resolve(tr.mapping.map($cut.pos)), 1)
                      : NodeSelection.create(tr.doc, tr.mapping.map($cut.pos)));
                  dispatch(tr.scrollIntoView());
              }
              return true;
          }
      }
      // If the next node is an atom, delete it
      if (after.isAtom && $cut.depth == $cursor.depth - 1) {
          if (dispatch)
              dispatch(state.tr.delete($cut.pos, $cut.pos + after.nodeSize).scrollIntoView());
          return true;
      }
      return false;
  };
  /**
  When the selection is empty and at the end of a textblock, select
  the node coming after that textblock, if possible. This is intended
  to be bound to keys like delete, after
  [`joinForward`](https://prosemirror.net/docs/ref/#commands.joinForward) and similar deleting
  commands, to provide a fall-back behavior when the schema doesn't
  allow deletion at the selected point.
  */
  const selectNodeForward = (state, dispatch, view) => {
      let { $head, empty } = state.selection, $cut = $head;
      if (!empty)
          return false;
      if ($head.parent.isTextblock) {
          if (view ? !view.endOfTextblock("forward", state) : $head.parentOffset < $head.parent.content.size)
              return false;
          $cut = findCutAfter($head);
      }
      let node = $cut && $cut.nodeAfter;
      if (!node || !NodeSelection.isSelectable(node))
          return false;
      if (dispatch)
          dispatch(state.tr.setSelection(NodeSelection.create(state.doc, $cut.pos)).scrollIntoView());
      return true;
  };
  function findCutAfter($pos) {
      if (!$pos.parent.type.spec.isolating)
          for (let i = $pos.depth - 1; i >= 0; i--) {
              let parent = $pos.node(i);
              if ($pos.index(i) + 1 < parent.childCount)
                  return $pos.doc.resolve($pos.after(i + 1));
              if (parent.type.spec.isolating)
                  break;
          }
      return null;
  }
  /**
  Join the selected block or, if there is a text selection, the
  closest ancestor block of the selection that can be joined, with
  the sibling above it.
  */
  const joinUp = (state, dispatch) => {
      let sel = state.selection, nodeSel = sel instanceof NodeSelection, point;
      if (nodeSel) {
          if (sel.node.isTextblock || !canJoin(state.doc, sel.from))
              return false;
          point = sel.from;
      }
      else {
          point = joinPoint(state.doc, sel.from, -1);
          if (point == null)
              return false;
      }
      if (dispatch) {
          let tr = state.tr.join(point);
          if (nodeSel)
              tr.setSelection(NodeSelection.create(tr.doc, point - state.doc.resolve(point).nodeBefore.nodeSize));
          dispatch(tr.scrollIntoView());
      }
      return true;
  };
  /**
  Join the selected block, or the closest ancestor of the selection
  that can be joined, with the sibling after it.
  */
  const joinDown = (state, dispatch) => {
      let sel = state.selection, point;
      if (sel instanceof NodeSelection) {
          if (sel.node.isTextblock || !canJoin(state.doc, sel.to))
              return false;
          point = sel.to;
      }
      else {
          point = joinPoint(state.doc, sel.to, 1);
          if (point == null)
              return false;
      }
      if (dispatch)
          dispatch(state.tr.join(point).scrollIntoView());
      return true;
  };
  /**
  Lift the selected block, or the closest ancestor block of the
  selection that can be lifted, out of its parent node.
  */
  const lift = (state, dispatch) => {
      let { $from, $to } = state.selection;
      let range = $from.blockRange($to), target = range && liftTarget(range);
      if (target == null)
          return false;
      if (dispatch)
          dispatch(state.tr.lift(range, target).scrollIntoView());
      return true;
  };
  /**
  If the selection is in a node whose type has a truthy
  [`code`](https://prosemirror.net/docs/ref/#model.NodeSpec.code) property in its spec, replace the
  selection with a newline character.
  */
  const newlineInCode = (state, dispatch) => {
      let { $head, $anchor } = state.selection;
      if (!$head.parent.type.spec.code || !$head.sameParent($anchor))
          return false;
      if (dispatch)
          dispatch(state.tr.insertText("\n").scrollIntoView());
      return true;
  };
  function defaultBlockAt(match) {
      for (let i = 0; i < match.edgeCount; i++) {
          let { type } = match.edge(i);
          if (type.isTextblock && !type.hasRequiredAttrs())
              return type;
      }
      return null;
  }
  /**
  When the selection is in a node with a truthy
  [`code`](https://prosemirror.net/docs/ref/#model.NodeSpec.code) property in its spec, create a
  default block after the code block, and move the cursor there.
  */
  const exitCode = (state, dispatch) => {
      let { $head, $anchor } = state.selection;
      if (!$head.parent.type.spec.code || !$head.sameParent($anchor))
          return false;
      let above = $head.node(-1), after = $head.indexAfter(-1), type = defaultBlockAt(above.contentMatchAt(after));
      if (!type || !above.canReplaceWith(after, after, type))
          return false;
      if (dispatch) {
          let pos = $head.after(), tr = state.tr.replaceWith(pos, pos, type.createAndFill());
          tr.setSelection(Selection.near(tr.doc.resolve(pos), 1));
          dispatch(tr.scrollIntoView());
      }
      return true;
  };
  /**
  If a block node is selected, create an empty paragraph before (if
  it is its parent's first child) or after it.
  */
  const createParagraphNear = (state, dispatch) => {
      let sel = state.selection, { $from, $to } = sel;
      if (sel instanceof AllSelection || $from.parent.inlineContent || $to.parent.inlineContent)
          return false;
      let type = defaultBlockAt($to.parent.contentMatchAt($to.indexAfter()));
      if (!type || !type.isTextblock)
          return false;
      if (dispatch) {
          let side = (!$from.parentOffset && $to.index() < $to.parent.childCount ? $from : $to).pos;
          let tr = state.tr.insert(side, type.createAndFill());
          tr.setSelection(TextSelection.create(tr.doc, side + 1));
          dispatch(tr.scrollIntoView());
      }
      return true;
  };
  /**
  If the cursor is in an empty textblock that can be lifted, lift the
  block.
  */
  const liftEmptyBlock = (state, dispatch) => {
      let { $cursor } = state.selection;
      if (!$cursor || $cursor.parent.content.size)
          return false;
      if ($cursor.depth > 1 && $cursor.after() != $cursor.end(-1)) {
          let before = $cursor.before();
          if (canSplit(state.doc, before)) {
              if (dispatch)
                  dispatch(state.tr.split(before).scrollIntoView());
              return true;
          }
      }
      let range = $cursor.blockRange(), target = range && liftTarget(range);
      if (target == null)
          return false;
      if (dispatch)
          dispatch(state.tr.lift(range, target).scrollIntoView());
      return true;
  };
  /**
  Create a variant of [`splitBlock`](https://prosemirror.net/docs/ref/#commands.splitBlock) that uses
  a custom function to determine the type of the newly split off block.
  */
  function splitBlockAs(splitNode) {
      return (state, dispatch) => {
          let { $from, $to } = state.selection;
          if (state.selection instanceof NodeSelection && state.selection.node.isBlock) {
              if (!$from.parentOffset || !canSplit(state.doc, $from.pos))
                  return false;
              if (dispatch)
                  dispatch(state.tr.split($from.pos).scrollIntoView());
              return true;
          }
          if (!$from.parent.isBlock)
              return false;
          if (dispatch) {
              let atEnd = $to.parentOffset == $to.parent.content.size;
              let tr = state.tr;
              if (state.selection instanceof TextSelection || state.selection instanceof AllSelection)
                  tr.deleteSelection();
              let deflt = $from.depth == 0 ? null : defaultBlockAt($from.node(-1).contentMatchAt($from.indexAfter(-1)));
              let splitType = splitNode && splitNode($to.parent, atEnd);
              let types = splitType ? [splitType] : atEnd && deflt ? [{ type: deflt }] : undefined;
              let can = canSplit(tr.doc, tr.mapping.map($from.pos), 1, types);
              if (!types && !can && canSplit(tr.doc, tr.mapping.map($from.pos), 1, deflt ? [{ type: deflt }] : undefined)) {
                  if (deflt)
                      types = [{ type: deflt }];
                  can = true;
              }
              if (can) {
                  tr.split(tr.mapping.map($from.pos), 1, types);
                  if (!atEnd && !$from.parentOffset && $from.parent.type != deflt) {
                      let first = tr.mapping.map($from.before()), $first = tr.doc.resolve(first);
                      if (deflt && $from.node(-1).canReplaceWith($first.index(), $first.index() + 1, deflt))
                          tr.setNodeMarkup(tr.mapping.map($from.before()), deflt);
                  }
              }
              dispatch(tr.scrollIntoView());
          }
          return true;
      };
  }
  /**
  Split the parent block of the selection. If the selection is a text
  selection, also delete its content.
  */
  const splitBlock = splitBlockAs();
  /**
  Acts like [`splitBlock`](https://prosemirror.net/docs/ref/#commands.splitBlock), but without
  resetting the set of active marks at the cursor.
  */
  const splitBlockKeepMarks = (state, dispatch) => {
      return splitBlock(state, dispatch && (tr => {
          let marks = state.storedMarks || (state.selection.$to.parentOffset && state.selection.$from.marks());
          if (marks)
              tr.ensureMarks(marks);
          dispatch(tr);
      }));
  };
  /**
  Move the selection to the node wrapping the current selection, if
  any. (Will not select the document node.)
  */
  const selectParentNode = (state, dispatch) => {
      let { $from, to } = state.selection, pos;
      let same = $from.sharedDepth(to);
      if (same == 0)
          return false;
      pos = $from.before(same);
      if (dispatch)
          dispatch(state.tr.setSelection(NodeSelection.create(state.doc, pos)));
      return true;
  };
  /**
  Select the whole document.
  */
  const selectAll = (state, dispatch) => {
      if (dispatch)
          dispatch(state.tr.setSelection(new AllSelection(state.doc)));
      return true;
  };
  function joinMaybeClear(state, $pos, dispatch) {
      let before = $pos.nodeBefore, after = $pos.nodeAfter, index = $pos.index();
      if (!before || !after || !before.type.compatibleContent(after.type))
          return false;
      if (!before.content.size && $pos.parent.canReplace(index - 1, index)) {
          if (dispatch)
              dispatch(state.tr.delete($pos.pos - before.nodeSize, $pos.pos).scrollIntoView());
          return true;
      }
      if (!$pos.parent.canReplace(index, index + 1) || !(after.isTextblock || canJoin(state.doc, $pos.pos)))
          return false;
      if (dispatch)
          dispatch(state.tr
              .clearIncompatible($pos.pos, before.type, before.contentMatchAt(before.childCount))
              .join($pos.pos)
              .scrollIntoView());
      return true;
  }
  function deleteBarrier(state, $cut, dispatch) {
      let before = $cut.nodeBefore, after = $cut.nodeAfter, conn, match;
      if (before.type.spec.isolating || after.type.spec.isolating)
          return false;
      if (joinMaybeClear(state, $cut, dispatch))
          return true;
      let canDelAfter = $cut.parent.canReplace($cut.index(), $cut.index() + 1);
      if (canDelAfter &&
          (conn = (match = before.contentMatchAt(before.childCount)).findWrapping(after.type)) &&
          match.matchType(conn[0] || after.type).validEnd) {
          if (dispatch) {
              let end = $cut.pos + after.nodeSize, wrap = Fragment.empty;
              for (let i = conn.length - 1; i >= 0; i--)
                  wrap = Fragment.from(conn[i].create(null, wrap));
              wrap = Fragment.from(before.copy(wrap));
              let tr = state.tr.step(new ReplaceAroundStep($cut.pos - 1, end, $cut.pos, end, new Slice(wrap, 1, 0), conn.length, true));
              let joinAt = end + 2 * conn.length;
              if (canJoin(tr.doc, joinAt))
                  tr.join(joinAt);
              dispatch(tr.scrollIntoView());
          }
          return true;
      }
      let selAfter = Selection.findFrom($cut, 1);
      let range = selAfter && selAfter.$from.blockRange(selAfter.$to), target = range && liftTarget(range);
      if (target != null && target >= $cut.depth) {
          if (dispatch)
              dispatch(state.tr.lift(range, target).scrollIntoView());
          return true;
      }
      if (canDelAfter && textblockAt(after, "start", true) && textblockAt(before, "end")) {
          let at = before, wrap = [];
          for (;;) {
              wrap.push(at);
              if (at.isTextblock)
                  break;
              at = at.lastChild;
          }
          let afterText = after, afterDepth = 1;
          for (; !afterText.isTextblock; afterText = afterText.firstChild)
              afterDepth++;
          if (at.canReplace(at.childCount, at.childCount, afterText.content)) {
              if (dispatch) {
                  let end = Fragment.empty;
                  for (let i = wrap.length - 1; i >= 0; i--)
                      end = Fragment.from(wrap[i].copy(end));
                  let tr = state.tr.step(new ReplaceAroundStep($cut.pos - wrap.length, $cut.pos + after.nodeSize, $cut.pos + afterDepth, $cut.pos + after.nodeSize - afterDepth, new Slice(end, wrap.length, 0), 0, true));
                  dispatch(tr.scrollIntoView());
              }
              return true;
          }
      }
      return false;
  }
  function selectTextblockSide(side) {
      return function (state, dispatch) {
          let sel = state.selection, $pos = side < 0 ? sel.$from : sel.$to;
          let depth = $pos.depth;
          while ($pos.node(depth).isInline) {
              if (!depth)
                  return false;
              depth--;
          }
          if (!$pos.node(depth).isTextblock)
              return false;
          if (dispatch)
              dispatch(state.tr.setSelection(TextSelection.create(state.doc, side < 0 ? $pos.start(depth) : $pos.end(depth))));
          return true;
      };
  }
  /**
  Moves the cursor to the start of current text block.
  */
  const selectTextblockStart = selectTextblockSide(-1);
  /**
  Moves the cursor to the end of current text block.
  */
  const selectTextblockEnd = selectTextblockSide(1);
  // Parameterized commands
  /**
  Wrap the selection in a node of the given type with the given
  attributes.
  */
  function wrapIn(nodeType, attrs = null) {
      return function (state, dispatch) {
          let { $from, $to } = state.selection;
          let range = $from.blockRange($to), wrapping = range && findWrapping(range, nodeType, attrs);
          if (!wrapping)
              return false;
          if (dispatch)
              dispatch(state.tr.wrap(range, wrapping).scrollIntoView());
          return true;
      };
  }
  /**
  Returns a command that tries to set the selected textblocks to the
  given node type with the given attributes.
  */
  function setBlockType(nodeType, attrs = null) {
      return function (state, dispatch) {
          let applicable = false;
          for (let i = 0; i < state.selection.ranges.length && !applicable; i++) {
              let { $from: { pos: from }, $to: { pos: to } } = state.selection.ranges[i];
              state.doc.nodesBetween(from, to, (node, pos) => {
                  if (applicable)
                      return false;
                  if (!node.isTextblock || node.hasMarkup(nodeType, attrs))
                      return;
                  if (node.type == nodeType) {
                      applicable = true;
                  }
                  else {
                      let $pos = state.doc.resolve(pos), index = $pos.index();
                      applicable = $pos.parent.canReplaceWith(index, index + 1, nodeType);
                  }
              });
          }
          if (!applicable)
              return false;
          if (dispatch) {
              let tr = state.tr;
              for (let i = 0; i < state.selection.ranges.length; i++) {
                  let { $from: { pos: from }, $to: { pos: to } } = state.selection.ranges[i];
                  tr.setBlockType(from, to, nodeType, attrs);
              }
              dispatch(tr.scrollIntoView());
          }
          return true;
      };
  }
  function markApplies(doc, ranges, type) {
      for (let i = 0; i < ranges.length; i++) {
          let { $from, $to } = ranges[i];
          let can = $from.depth == 0 ? doc.inlineContent && doc.type.allowsMarkType(type) : false;
          doc.nodesBetween($from.pos, $to.pos, node => {
              if (can)
                  return false;
              can = node.inlineContent && node.type.allowsMarkType(type);
          });
          if (can)
              return true;
      }
      return false;
  }
  /**
  Create a command function that toggles the given mark with the
  given attributes. Will return `false` when the current selection
  doesn't support that mark. This will remove the mark if any marks
  of that type exist in the selection, or add it otherwise. If the
  selection is empty, this applies to the [stored
  marks](https://prosemirror.net/docs/ref/#state.EditorState.storedMarks) instead of a range of the
  document.
  */
  function toggleMark(markType, attrs = null) {
      return function (state, dispatch) {
          let { empty, $cursor, ranges } = state.selection;
          if ((empty && !$cursor) || !markApplies(state.doc, ranges, markType))
              return false;
          if (dispatch) {
              if ($cursor) {
                  if (markType.isInSet(state.storedMarks || $cursor.marks()))
                      dispatch(state.tr.removeStoredMark(markType));
                  else
                      dispatch(state.tr.addStoredMark(markType.create(attrs)));
              }
              else {
                  let has = false, tr = state.tr;
                  for (let i = 0; !has && i < ranges.length; i++) {
                      let { $from, $to } = ranges[i];
                      has = state.doc.rangeHasMark($from.pos, $to.pos, markType);
                  }
                  for (let i = 0; i < ranges.length; i++) {
                      let { $from, $to } = ranges[i];
                      if (has) {
                          tr.removeMark($from.pos, $to.pos, markType);
                      }
                      else {
                          let from = $from.pos, to = $to.pos, start = $from.nodeAfter, end = $to.nodeBefore;
                          let spaceStart = start && start.isText ? /^\s*/.exec(start.text)[0].length : 0;
                          let spaceEnd = end && end.isText ? /\s*$/.exec(end.text)[0].length : 0;
                          if (from + spaceStart < to) {
                              from += spaceStart;
                              to -= spaceEnd;
                          }
                          tr.addMark(from, to, markType.create(attrs));
                      }
                  }
                  dispatch(tr.scrollIntoView());
              }
          }
          return true;
      };
  }
  function wrapDispatchForJoin(dispatch, isJoinable) {
      return (tr) => {
          if (!tr.isGeneric)
              return dispatch(tr);
          let ranges = [];
          for (let i = 0; i < tr.mapping.maps.length; i++) {
              let map = tr.mapping.maps[i];
              for (let j = 0; j < ranges.length; j++)
                  ranges[j] = map.map(ranges[j]);
              map.forEach((_s, _e, from, to) => ranges.push(from, to));
          }
          // Figure out which joinable points exist inside those ranges,
          // by checking all node boundaries in their parent nodes.
          let joinable = [];
          for (let i = 0; i < ranges.length; i += 2) {
              let from = ranges[i], to = ranges[i + 1];
              let $from = tr.doc.resolve(from), depth = $from.sharedDepth(to), parent = $from.node(depth);
              for (let index = $from.indexAfter(depth), pos = $from.after(depth + 1); pos <= to; ++index) {
                  let after = parent.maybeChild(index);
                  if (!after)
                      break;
                  if (index && joinable.indexOf(pos) == -1) {
                      let before = parent.child(index - 1);
                      if (before.type == after.type && isJoinable(before, after))
                          joinable.push(pos);
                  }
                  pos += after.nodeSize;
              }
          }
          // Join the joinable points
          joinable.sort((a, b) => a - b);
          for (let i = joinable.length - 1; i >= 0; i--) {
              if (canJoin(tr.doc, joinable[i]))
                  tr.join(joinable[i]);
          }
          dispatch(tr);
      };
  }
  /**
  Wrap a command so that, when it produces a transform that causes
  two joinable nodes to end up next to each other, those are joined.
  Nodes are considered joinable when they are of the same type and
  when the `isJoinable` predicate returns true for them or, if an
  array of strings was passed, if their node type name is in that
  array.
  */
  function autoJoin(command, isJoinable) {
      let canJoin = Array.isArray(isJoinable) ? (node) => isJoinable.indexOf(node.type.name) > -1
          : isJoinable;
      return (state, dispatch, view) => command(state, dispatch && wrapDispatchForJoin(dispatch, canJoin), view);
  }
  /**
  Combine a number of command functions into a single function (which
  calls them one by one until one returns true).
  */
  function chainCommands(...commands) {
      return function (state, dispatch, view) {
          for (let i = 0; i < commands.length; i++)
              if (commands[i](state, dispatch, view))
                  return true;
          return false;
      };
  }
  let backspace = chainCommands(deleteSelection, joinBackward, selectNodeBackward);
  let del = chainCommands(deleteSelection, joinForward, selectNodeForward);
  /**
  A basic keymap containing bindings not specific to any schema.
  Binds the following keys (when multiple commands are listed, they
  are chained with [`chainCommands`](https://prosemirror.net/docs/ref/#commands.chainCommands)):

  * **Enter** to `newlineInCode`, `createParagraphNear`, `liftEmptyBlock`, `splitBlock`
  * **Mod-Enter** to `exitCode`
  * **Backspace** and **Mod-Backspace** to `deleteSelection`, `joinBackward`, `selectNodeBackward`
  * **Delete** and **Mod-Delete** to `deleteSelection`, `joinForward`, `selectNodeForward`
  * **Mod-Delete** to `deleteSelection`, `joinForward`, `selectNodeForward`
  * **Mod-a** to `selectAll`
  */
  const pcBaseKeymap = {
      "Enter": chainCommands(newlineInCode, createParagraphNear, liftEmptyBlock, splitBlock),
      "Mod-Enter": exitCode,
      "Backspace": backspace,
      "Mod-Backspace": backspace,
      "Shift-Backspace": backspace,
      "Delete": del,
      "Mod-Delete": del,
      "Mod-a": selectAll
  };
  /**
  A copy of `pcBaseKeymap` that also binds **Ctrl-h** like Backspace,
  **Ctrl-d** like Delete, **Alt-Backspace** like Ctrl-Backspace, and
  **Ctrl-Alt-Backspace**, **Alt-Delete**, and **Alt-d** like
  Ctrl-Delete.
  */
  const macBaseKeymap = {
      "Ctrl-h": pcBaseKeymap["Backspace"],
      "Alt-Backspace": pcBaseKeymap["Mod-Backspace"],
      "Ctrl-d": pcBaseKeymap["Delete"],
      "Ctrl-Alt-Backspace": pcBaseKeymap["Mod-Delete"],
      "Alt-Delete": pcBaseKeymap["Mod-Delete"],
      "Alt-d": pcBaseKeymap["Mod-Delete"],
      "Ctrl-a": selectTextblockStart,
      "Ctrl-e": selectTextblockEnd
  };
  for (let key in pcBaseKeymap)
      macBaseKeymap[key] = pcBaseKeymap[key];
  const mac = typeof navigator != "undefined" ? /Mac|iP(hone|[oa]d)/.test(navigator.platform)
      // @ts-ignore
      : typeof os != "undefined" && os.platform ? os.platform() == "darwin" : false;
  /**
  Depending on the detected platform, this will hold
  [`pcBasekeymap`](https://prosemirror.net/docs/ref/#commands.pcBaseKeymap) or
  [`macBaseKeymap`](https://prosemirror.net/docs/ref/#commands.macBaseKeymap).
  */
  const baseKeymap = mac ? macBaseKeymap : pcBaseKeymap;

  var index$3 = /*#__PURE__*/Object.freeze({
    __proto__: null,
    autoJoin: autoJoin,
    baseKeymap: baseKeymap,
    chainCommands: chainCommands,
    createParagraphNear: createParagraphNear,
    deleteSelection: deleteSelection,
    exitCode: exitCode,
    joinBackward: joinBackward,
    joinDown: joinDown,
    joinForward: joinForward,
    joinTextblockBackward: joinTextblockBackward,
    joinTextblockForward: joinTextblockForward,
    joinUp: joinUp,
    lift: lift,
    liftEmptyBlock: liftEmptyBlock,
    macBaseKeymap: macBaseKeymap,
    newlineInCode: newlineInCode,
    pcBaseKeymap: pcBaseKeymap,
    selectAll: selectAll,
    selectNodeBackward: selectNodeBackward,
    selectNodeForward: selectNodeForward,
    selectParentNode: selectParentNode,
    selectTextblockEnd: selectTextblockEnd,
    selectTextblockStart: selectTextblockStart,
    setBlockType: setBlockType,
    splitBlock: splitBlock,
    splitBlockAs: splitBlockAs,
    splitBlockKeepMarks: splitBlockKeepMarks,
    toggleMark: toggleMark,
    wrapIn: wrapIn
  });

  /**
  Create a plugin that, when added to a ProseMirror instance,
  causes a decoration to show up at the drop position when something
  is dragged over the editor.

  Nodes may add a `disableDropCursor` property to their spec to
  control the showing of a drop cursor inside them. This may be a
  boolean or a function, which will be called with a view and a
  position, and should return a boolean.
  */
  function dropCursor(options = {}) {
      return new Plugin({
          view(editorView) { return new DropCursorView(editorView, options); }
      });
  }
  class DropCursorView {
      constructor(editorView, options) {
          var _a;
          this.editorView = editorView;
          this.cursorPos = null;
          this.element = null;
          this.timeout = -1;
          this.width = (_a = options.width) !== null && _a !== void 0 ? _a : 1;
          this.color = options.color === false ? undefined : (options.color || "black");
          this.class = options.class;
          this.handlers = ["dragover", "dragend", "drop", "dragleave"].map(name => {
              let handler = (e) => { this[name](e); };
              editorView.dom.addEventListener(name, handler);
              return { name, handler };
          });
      }
      destroy() {
          this.handlers.forEach(({ name, handler }) => this.editorView.dom.removeEventListener(name, handler));
      }
      update(editorView, prevState) {
          if (this.cursorPos != null && prevState.doc != editorView.state.doc) {
              if (this.cursorPos > editorView.state.doc.content.size)
                  this.setCursor(null);
              else
                  this.updateOverlay();
          }
      }
      setCursor(pos) {
          if (pos == this.cursorPos)
              return;
          this.cursorPos = pos;
          if (pos == null) {
              this.element.parentNode.removeChild(this.element);
              this.element = null;
          }
          else {
              this.updateOverlay();
          }
      }
      updateOverlay() {
          let $pos = this.editorView.state.doc.resolve(this.cursorPos);
          let isBlock = !$pos.parent.inlineContent, rect;
          if (isBlock) {
              let before = $pos.nodeBefore, after = $pos.nodeAfter;
              if (before || after) {
                  let node = this.editorView.nodeDOM(this.cursorPos - (before ? before.nodeSize : 0));
                  if (node) {
                      let nodeRect = node.getBoundingClientRect();
                      let top = before ? nodeRect.bottom : nodeRect.top;
                      if (before && after)
                          top = (top + this.editorView.nodeDOM(this.cursorPos).getBoundingClientRect().top) / 2;
                      rect = { left: nodeRect.left, right: nodeRect.right, top: top - this.width / 2, bottom: top + this.width / 2 };
                  }
              }
          }
          if (!rect) {
              let coords = this.editorView.coordsAtPos(this.cursorPos);
              rect = { left: coords.left - this.width / 2, right: coords.left + this.width / 2, top: coords.top, bottom: coords.bottom };
          }
          let parent = this.editorView.dom.offsetParent;
          if (!this.element) {
              this.element = parent.appendChild(document.createElement("div"));
              if (this.class)
                  this.element.className = this.class;
              this.element.style.cssText = "position: absolute; z-index: 50; pointer-events: none;";
              if (this.color) {
                  this.element.style.backgroundColor = this.color;
              }
          }
          this.element.classList.toggle("prosemirror-dropcursor-block", isBlock);
          this.element.classList.toggle("prosemirror-dropcursor-inline", !isBlock);
          let parentLeft, parentTop;
          if (!parent || parent == document.body && getComputedStyle(parent).position == "static") {
              parentLeft = -pageXOffset;
              parentTop = -pageYOffset;
          }
          else {
              let rect = parent.getBoundingClientRect();
              parentLeft = rect.left - parent.scrollLeft;
              parentTop = rect.top - parent.scrollTop;
          }
          this.element.style.left = (rect.left - parentLeft) + "px";
          this.element.style.top = (rect.top - parentTop) + "px";
          this.element.style.width = (rect.right - rect.left) + "px";
          this.element.style.height = (rect.bottom - rect.top) + "px";
      }
      scheduleRemoval(timeout) {
          clearTimeout(this.timeout);
          this.timeout = setTimeout(() => this.setCursor(null), timeout);
      }
      dragover(event) {
          if (!this.editorView.editable)
              return;
          let pos = this.editorView.posAtCoords({ left: event.clientX, top: event.clientY });
          let node = pos && pos.inside >= 0 && this.editorView.state.doc.nodeAt(pos.inside);
          let disableDropCursor = node && node.type.spec.disableDropCursor;
          let disabled = typeof disableDropCursor == "function" ? disableDropCursor(this.editorView, pos, event) : disableDropCursor;
          if (pos && !disabled) {
              let target = pos.pos;
              if (this.editorView.dragging && this.editorView.dragging.slice) {
                  let point = dropPoint(this.editorView.state.doc, target, this.editorView.dragging.slice);
                  if (point != null)
                      target = point;
              }
              this.setCursor(target);
              this.scheduleRemoval(5000);
          }
      }
      dragend() {
          this.scheduleRemoval(20);
      }
      drop() {
          this.scheduleRemoval(20);
      }
      dragleave(event) {
          if (event.target == this.editorView.dom || !this.editorView.dom.contains(event.relatedTarget))
              this.setCursor(null);
      }
  }

  /**
  Gap cursor selections are represented using this class. Its
  `$anchor` and `$head` properties both point at the cursor position.
  */
  class GapCursor extends Selection {
      /**
      Create a gap cursor.
      */
      constructor($pos) {
          super($pos, $pos);
      }
      map(doc, mapping) {
          let $pos = doc.resolve(mapping.map(this.head));
          return GapCursor.valid($pos) ? new GapCursor($pos) : Selection.near($pos);
      }
      content() { return Slice.empty; }
      eq(other) {
          return other instanceof GapCursor && other.head == this.head;
      }
      toJSON() {
          return { type: "gapcursor", pos: this.head };
      }
      /**
      @internal
      */
      static fromJSON(doc, json) {
          if (typeof json.pos != "number")
              throw new RangeError("Invalid input for GapCursor.fromJSON");
          return new GapCursor(doc.resolve(json.pos));
      }
      /**
      @internal
      */
      getBookmark() { return new GapBookmark(this.anchor); }
      /**
      @internal
      */
      static valid($pos) {
          let parent = $pos.parent;
          if (parent.isTextblock || !closedBefore($pos) || !closedAfter($pos))
              return false;
          let override = parent.type.spec.allowGapCursor;
          if (override != null)
              return override;
          let deflt = parent.contentMatchAt($pos.index()).defaultType;
          return deflt && deflt.isTextblock;
      }
      /**
      @internal
      */
      static findGapCursorFrom($pos, dir, mustMove = false) {
          search: for (;;) {
              if (!mustMove && GapCursor.valid($pos))
                  return $pos;
              let pos = $pos.pos, next = null;
              // Scan up from this position
              for (let d = $pos.depth;; d--) {
                  let parent = $pos.node(d);
                  if (dir > 0 ? $pos.indexAfter(d) < parent.childCount : $pos.index(d) > 0) {
                      next = parent.child(dir > 0 ? $pos.indexAfter(d) : $pos.index(d) - 1);
                      break;
                  }
                  else if (d == 0) {
                      return null;
                  }
                  pos += dir;
                  let $cur = $pos.doc.resolve(pos);
                  if (GapCursor.valid($cur))
                      return $cur;
              }
              // And then down into the next node
              for (;;) {
                  let inside = dir > 0 ? next.firstChild : next.lastChild;
                  if (!inside) {
                      if (next.isAtom && !next.isText && !NodeSelection.isSelectable(next)) {
                          $pos = $pos.doc.resolve(pos + next.nodeSize * dir);
                          mustMove = false;
                          continue search;
                      }
                      break;
                  }
                  next = inside;
                  pos += dir;
                  let $cur = $pos.doc.resolve(pos);
                  if (GapCursor.valid($cur))
                      return $cur;
              }
              return null;
          }
      }
  }
  GapCursor.prototype.visible = false;
  GapCursor.findFrom = GapCursor.findGapCursorFrom;
  Selection.jsonID("gapcursor", GapCursor);
  class GapBookmark {
      constructor(pos) {
          this.pos = pos;
      }
      map(mapping) {
          return new GapBookmark(mapping.map(this.pos));
      }
      resolve(doc) {
          let $pos = doc.resolve(this.pos);
          return GapCursor.valid($pos) ? new GapCursor($pos) : Selection.near($pos);
      }
  }
  function closedBefore($pos) {
      for (let d = $pos.depth; d >= 0; d--) {
          let index = $pos.index(d), parent = $pos.node(d);
          // At the start of this parent, look at next one
          if (index == 0) {
              if (parent.type.spec.isolating)
                  return true;
              continue;
          }
          // See if the node before (or its first ancestor) is closed
          for (let before = parent.child(index - 1);; before = before.lastChild) {
              if ((before.childCount == 0 && !before.inlineContent) || before.isAtom || before.type.spec.isolating)
                  return true;
              if (before.inlineContent)
                  return false;
          }
      }
      // Hit start of document
      return true;
  }
  function closedAfter($pos) {
      for (let d = $pos.depth; d >= 0; d--) {
          let index = $pos.indexAfter(d), parent = $pos.node(d);
          if (index == parent.childCount) {
              if (parent.type.spec.isolating)
                  return true;
              continue;
          }
          for (let after = parent.child(index);; after = after.firstChild) {
              if ((after.childCount == 0 && !after.inlineContent) || after.isAtom || after.type.spec.isolating)
                  return true;
              if (after.inlineContent)
                  return false;
          }
      }
      return true;
  }

  /**
  Create a gap cursor plugin. When enabled, this will capture clicks
  near and arrow-key-motion past places that don't have a normally
  selectable position nearby, and create a gap cursor selection for
  them. The cursor is drawn as an element with class
  `ProseMirror-gapcursor`. You can either include
  `style/gapcursor.css` from the package's directory or add your own
  styles to make it visible.
  */
  function gapCursor() {
      return new Plugin({
          props: {
              decorations: drawGapCursor,
              createSelectionBetween(_view, $anchor, $head) {
                  return $anchor.pos == $head.pos && GapCursor.valid($head) ? new GapCursor($head) : null;
              },
              handleClick,
              handleKeyDown: handleKeyDown$1,
              handleDOMEvents: { beforeinput: beforeinput }
          }
      });
  }
  const handleKeyDown$1 = keydownHandler({
      "ArrowLeft": arrow$1("horiz", -1),
      "ArrowRight": arrow$1("horiz", 1),
      "ArrowUp": arrow$1("vert", -1),
      "ArrowDown": arrow$1("vert", 1)
  });
  function arrow$1(axis, dir) {
      const dirStr = axis == "vert" ? (dir > 0 ? "down" : "up") : (dir > 0 ? "right" : "left");
      return function (state, dispatch, view) {
          let sel = state.selection;
          let $start = dir > 0 ? sel.$to : sel.$from, mustMove = sel.empty;
          if (sel instanceof TextSelection) {
              if (!view.endOfTextblock(dirStr) || $start.depth == 0)
                  return false;
              mustMove = false;
              $start = state.doc.resolve(dir > 0 ? $start.after() : $start.before());
          }
          let $found = GapCursor.findGapCursorFrom($start, dir, mustMove);
          if (!$found)
              return false;
          if (dispatch)
              dispatch(state.tr.setSelection(new GapCursor($found)));
          return true;
      };
  }
  function handleClick(view, pos, event) {
      if (!view || !view.editable)
          return false;
      let $pos = view.state.doc.resolve(pos);
      if (!GapCursor.valid($pos))
          return false;
      let clickPos = view.posAtCoords({ left: event.clientX, top: event.clientY });
      if (clickPos && clickPos.inside > -1 && NodeSelection.isSelectable(view.state.doc.nodeAt(clickPos.inside)))
          return false;
      view.dispatch(view.state.tr.setSelection(new GapCursor($pos)));
      return true;
  }
  // This is a hack that, when a composition starts while a gap cursor
  // is active, quickly creates an inline context for the composition to
  // happen in, to avoid it being aborted by the DOM selection being
  // moved into a valid position.
  function beforeinput(view, event) {
      if (event.inputType != "insertCompositionText" || !(view.state.selection instanceof GapCursor))
          return false;
      let { $from } = view.state.selection;
      let insert = $from.parent.contentMatchAt($from.index()).findWrapping(view.state.schema.nodes.text);
      if (!insert)
          return false;
      let frag = Fragment.empty;
      for (let i = insert.length - 1; i >= 0; i--)
          frag = Fragment.from(insert[i].createAndFill(null, frag));
      let tr = view.state.tr.replace($from.pos, $from.pos, new Slice(frag, 0, 0));
      tr.setSelection(TextSelection.near(tr.doc.resolve($from.pos + 1)));
      view.dispatch(tr);
      return false;
  }
  function drawGapCursor(state) {
      if (!(state.selection instanceof GapCursor))
          return null;
      let node = document.createElement("div");
      node.className = "ProseMirror-gapcursor";
      return DecorationSet.create(state.doc, [Decoration.widget(state.selection.head, node, { key: "gapcursor" })]);
  }

  var GOOD_LEAF_SIZE = 200;

  // :: class<T> A rope sequence is a persistent sequence data structure
  // that supports appending, prepending, and slicing without doing a
  // full copy. It is represented as a mostly-balanced tree.
  var RopeSequence = function RopeSequence () {};

  RopeSequence.prototype.append = function append (other) {
    if (!other.length) { return this }
    other = RopeSequence.from(other);

    return (!this.length && other) ||
      (other.length < GOOD_LEAF_SIZE && this.leafAppend(other)) ||
      (this.length < GOOD_LEAF_SIZE && other.leafPrepend(this)) ||
      this.appendInner(other)
  };

  // :: (union<[T], RopeSequence<T>>) → RopeSequence<T>
  // Prepend an array or other rope to this one, returning a new rope.
  RopeSequence.prototype.prepend = function prepend (other) {
    if (!other.length) { return this }
    return RopeSequence.from(other).append(this)
  };

  RopeSequence.prototype.appendInner = function appendInner (other) {
    return new Append(this, other)
  };

  // :: (?number, ?number) → RopeSequence<T>
  // Create a rope repesenting a sub-sequence of this rope.
  RopeSequence.prototype.slice = function slice (from, to) {
      if ( from === void 0 ) from = 0;
      if ( to === void 0 ) to = this.length;

    if (from >= to) { return RopeSequence.empty }
    return this.sliceInner(Math.max(0, from), Math.min(this.length, to))
  };

  // :: (number) → T
  // Retrieve the element at the given position from this rope.
  RopeSequence.prototype.get = function get (i) {
    if (i < 0 || i >= this.length) { return undefined }
    return this.getInner(i)
  };

  // :: ((element: T, index: number) → ?bool, ?number, ?number)
  // Call the given function for each element between the given
  // indices. This tends to be more efficient than looping over the
  // indices and calling `get`, because it doesn't have to descend the
  // tree for every element.
  RopeSequence.prototype.forEach = function forEach (f, from, to) {
      if ( from === void 0 ) from = 0;
      if ( to === void 0 ) to = this.length;

    if (from <= to)
      { this.forEachInner(f, from, to, 0); }
    else
      { this.forEachInvertedInner(f, from, to, 0); }
  };

  // :: ((element: T, index: number) → U, ?number, ?number) → [U]
  // Map the given functions over the elements of the rope, producing
  // a flat array.
  RopeSequence.prototype.map = function map (f, from, to) {
      if ( from === void 0 ) from = 0;
      if ( to === void 0 ) to = this.length;

    var result = [];
    this.forEach(function (elt, i) { return result.push(f(elt, i)); }, from, to);
    return result
  };

  // :: (?union<[T], RopeSequence<T>>) → RopeSequence<T>
  // Create a rope representing the given array, or return the rope
  // itself if a rope was given.
  RopeSequence.from = function from (values) {
    if (values instanceof RopeSequence) { return values }
    return values && values.length ? new Leaf(values) : RopeSequence.empty
  };

  var Leaf = /*@__PURE__*/(function (RopeSequence) {
    function Leaf(values) {
      RopeSequence.call(this);
      this.values = values;
    }

    if ( RopeSequence ) Leaf.__proto__ = RopeSequence;
    Leaf.prototype = Object.create( RopeSequence && RopeSequence.prototype );
    Leaf.prototype.constructor = Leaf;

    var prototypeAccessors = { length: { configurable: true },depth: { configurable: true } };

    Leaf.prototype.flatten = function flatten () {
      return this.values
    };

    Leaf.prototype.sliceInner = function sliceInner (from, to) {
      if (from == 0 && to == this.length) { return this }
      return new Leaf(this.values.slice(from, to))
    };

    Leaf.prototype.getInner = function getInner (i) {
      return this.values[i]
    };

    Leaf.prototype.forEachInner = function forEachInner (f, from, to, start) {
      for (var i = from; i < to; i++)
        { if (f(this.values[i], start + i) === false) { return false } }
    };

    Leaf.prototype.forEachInvertedInner = function forEachInvertedInner (f, from, to, start) {
      for (var i = from - 1; i >= to; i--)
        { if (f(this.values[i], start + i) === false) { return false } }
    };

    Leaf.prototype.leafAppend = function leafAppend (other) {
      if (this.length + other.length <= GOOD_LEAF_SIZE)
        { return new Leaf(this.values.concat(other.flatten())) }
    };

    Leaf.prototype.leafPrepend = function leafPrepend (other) {
      if (this.length + other.length <= GOOD_LEAF_SIZE)
        { return new Leaf(other.flatten().concat(this.values)) }
    };

    prototypeAccessors.length.get = function () { return this.values.length };

    prototypeAccessors.depth.get = function () { return 0 };

    Object.defineProperties( Leaf.prototype, prototypeAccessors );

    return Leaf;
  }(RopeSequence));

  // :: RopeSequence
  // The empty rope sequence.
  RopeSequence.empty = new Leaf([]);

  var Append = /*@__PURE__*/(function (RopeSequence) {
    function Append(left, right) {
      RopeSequence.call(this);
      this.left = left;
      this.right = right;
      this.length = left.length + right.length;
      this.depth = Math.max(left.depth, right.depth) + 1;
    }

    if ( RopeSequence ) Append.__proto__ = RopeSequence;
    Append.prototype = Object.create( RopeSequence && RopeSequence.prototype );
    Append.prototype.constructor = Append;

    Append.prototype.flatten = function flatten () {
      return this.left.flatten().concat(this.right.flatten())
    };

    Append.prototype.getInner = function getInner (i) {
      return i < this.left.length ? this.left.get(i) : this.right.get(i - this.left.length)
    };

    Append.prototype.forEachInner = function forEachInner (f, from, to, start) {
      var leftLen = this.left.length;
      if (from < leftLen &&
          this.left.forEachInner(f, from, Math.min(to, leftLen), start) === false)
        { return false }
      if (to > leftLen &&
          this.right.forEachInner(f, Math.max(from - leftLen, 0), Math.min(this.length, to) - leftLen, start + leftLen) === false)
        { return false }
    };

    Append.prototype.forEachInvertedInner = function forEachInvertedInner (f, from, to, start) {
      var leftLen = this.left.length;
      if (from > leftLen &&
          this.right.forEachInvertedInner(f, from - leftLen, Math.max(to, leftLen) - leftLen, start + leftLen) === false)
        { return false }
      if (to < leftLen &&
          this.left.forEachInvertedInner(f, Math.min(from, leftLen), to, start) === false)
        { return false }
    };

    Append.prototype.sliceInner = function sliceInner (from, to) {
      if (from == 0 && to == this.length) { return this }
      var leftLen = this.left.length;
      if (to <= leftLen) { return this.left.slice(from, to) }
      if (from >= leftLen) { return this.right.slice(from - leftLen, to - leftLen) }
      return this.left.slice(from, leftLen).append(this.right.slice(0, to - leftLen))
    };

    Append.prototype.leafAppend = function leafAppend (other) {
      var inner = this.right.leafAppend(other);
      if (inner) { return new Append(this.left, inner) }
    };

    Append.prototype.leafPrepend = function leafPrepend (other) {
      var inner = this.left.leafPrepend(other);
      if (inner) { return new Append(inner, this.right) }
    };

    Append.prototype.appendInner = function appendInner (other) {
      if (this.left.depth >= Math.max(this.right.depth, other.depth) + 1)
        { return new Append(this.left, new Append(this.right, other)) }
      return new Append(this, other)
    };

    return Append;
  }(RopeSequence));

  var ropeSequence = RopeSequence;

  // ProseMirror's history isn't simply a way to roll back to a previous
  // state, because ProseMirror supports applying changes without adding
  // them to the history (for example during collaboration).
  //
  // To this end, each 'Branch' (one for the undo history and one for
  // the redo history) keeps an array of 'Items', which can optionally
  // hold a step (an actual undoable change), and always hold a position
  // map (which is needed to move changes below them to apply to the
  // current document).
  //
  // An item that has both a step and a selection bookmark is the start
  // of an 'event' — a group of changes that will be undone or redone at
  // once. (It stores only the bookmark, since that way we don't have to
  // provide a document until the selection is actually applied, which
  // is useful when compressing.)
  // Used to schedule history compression
  const max_empty_items = 500;
  class Branch {
      constructor(items, eventCount) {
          this.items = items;
          this.eventCount = eventCount;
      }
      // Pop the latest event off the branch's history and apply it
      // to a document transform.
      popEvent(state, preserveItems) {
          if (this.eventCount == 0)
              return null;
          let end = this.items.length;
          for (;; end--) {
              let next = this.items.get(end - 1);
              if (next.selection) {
                  --end;
                  break;
              }
          }
          let remap, mapFrom;
          if (preserveItems) {
              remap = this.remapping(end, this.items.length);
              mapFrom = remap.maps.length;
          }
          let transform = state.tr;
          let selection, remaining;
          let addAfter = [], addBefore = [];
          this.items.forEach((item, i) => {
              if (!item.step) {
                  if (!remap) {
                      remap = this.remapping(end, i + 1);
                      mapFrom = remap.maps.length;
                  }
                  mapFrom--;
                  addBefore.push(item);
                  return;
              }
              if (remap) {
                  addBefore.push(new Item(item.map));
                  let step = item.step.map(remap.slice(mapFrom)), map;
                  if (step && transform.maybeStep(step).doc) {
                      map = transform.mapping.maps[transform.mapping.maps.length - 1];
                      addAfter.push(new Item(map, undefined, undefined, addAfter.length + addBefore.length));
                  }
                  mapFrom--;
                  if (map)
                      remap.appendMap(map, mapFrom);
              }
              else {
                  transform.maybeStep(item.step);
              }
              if (item.selection) {
                  selection = remap ? item.selection.map(remap.slice(mapFrom)) : item.selection;
                  remaining = new Branch(this.items.slice(0, end).append(addBefore.reverse().concat(addAfter)), this.eventCount - 1);
                  return false;
              }
          }, this.items.length, 0);
          return { remaining: remaining, transform, selection: selection };
      }
      // Create a new branch with the given transform added.
      addTransform(transform, selection, histOptions, preserveItems) {
          let newItems = [], eventCount = this.eventCount;
          let oldItems = this.items, lastItem = !preserveItems && oldItems.length ? oldItems.get(oldItems.length - 1) : null;
          for (let i = 0; i < transform.steps.length; i++) {
              let step = transform.steps[i].invert(transform.docs[i]);
              let item = new Item(transform.mapping.maps[i], step, selection), merged;
              if (merged = lastItem && lastItem.merge(item)) {
                  item = merged;
                  if (i)
                      newItems.pop();
                  else
                      oldItems = oldItems.slice(0, oldItems.length - 1);
              }
              newItems.push(item);
              if (selection) {
                  eventCount++;
                  selection = undefined;
              }
              if (!preserveItems)
                  lastItem = item;
          }
          let overflow = eventCount - histOptions.depth;
          if (overflow > DEPTH_OVERFLOW) {
              oldItems = cutOffEvents(oldItems, overflow);
              eventCount -= overflow;
          }
          return new Branch(oldItems.append(newItems), eventCount);
      }
      remapping(from, to) {
          let maps = new Mapping;
          this.items.forEach((item, i) => {
              let mirrorPos = item.mirrorOffset != null && i - item.mirrorOffset >= from
                  ? maps.maps.length - item.mirrorOffset : undefined;
              maps.appendMap(item.map, mirrorPos);
          }, from, to);
          return maps;
      }
      addMaps(array) {
          if (this.eventCount == 0)
              return this;
          return new Branch(this.items.append(array.map(map => new Item(map))), this.eventCount);
      }
      // When the collab module receives remote changes, the history has
      // to know about those, so that it can adjust the steps that were
      // rebased on top of the remote changes, and include the position
      // maps for the remote changes in its array of items.
      rebased(rebasedTransform, rebasedCount) {
          if (!this.eventCount)
              return this;
          let rebasedItems = [], start = Math.max(0, this.items.length - rebasedCount);
          let mapping = rebasedTransform.mapping;
          let newUntil = rebasedTransform.steps.length;
          let eventCount = this.eventCount;
          this.items.forEach(item => { if (item.selection)
              eventCount--; }, start);
          let iRebased = rebasedCount;
          this.items.forEach(item => {
              let pos = mapping.getMirror(--iRebased);
              if (pos == null)
                  return;
              newUntil = Math.min(newUntil, pos);
              let map = mapping.maps[pos];
              if (item.step) {
                  let step = rebasedTransform.steps[pos].invert(rebasedTransform.docs[pos]);
                  let selection = item.selection && item.selection.map(mapping.slice(iRebased + 1, pos));
                  if (selection)
                      eventCount++;
                  rebasedItems.push(new Item(map, step, selection));
              }
              else {
                  rebasedItems.push(new Item(map));
              }
          }, start);
          let newMaps = [];
          for (let i = rebasedCount; i < newUntil; i++)
              newMaps.push(new Item(mapping.maps[i]));
          let items = this.items.slice(0, start).append(newMaps).append(rebasedItems);
          let branch = new Branch(items, eventCount);
          if (branch.emptyItemCount() > max_empty_items)
              branch = branch.compress(this.items.length - rebasedItems.length);
          return branch;
      }
      emptyItemCount() {
          let count = 0;
          this.items.forEach(item => { if (!item.step)
              count++; });
          return count;
      }
      // Compressing a branch means rewriting it to push the air (map-only
      // items) out. During collaboration, these naturally accumulate
      // because each remote change adds one. The `upto` argument is used
      // to ensure that only the items below a given level are compressed,
      // because `rebased` relies on a clean, untouched set of items in
      // order to associate old items with rebased steps.
      compress(upto = this.items.length) {
          let remap = this.remapping(0, upto), mapFrom = remap.maps.length;
          let items = [], events = 0;
          this.items.forEach((item, i) => {
              if (i >= upto) {
                  items.push(item);
                  if (item.selection)
                      events++;
              }
              else if (item.step) {
                  let step = item.step.map(remap.slice(mapFrom)), map = step && step.getMap();
                  mapFrom--;
                  if (map)
                      remap.appendMap(map, mapFrom);
                  if (step) {
                      let selection = item.selection && item.selection.map(remap.slice(mapFrom));
                      if (selection)
                          events++;
                      let newItem = new Item(map.invert(), step, selection), merged, last = items.length - 1;
                      if (merged = items.length && items[last].merge(newItem))
                          items[last] = merged;
                      else
                          items.push(newItem);
                  }
              }
              else if (item.map) {
                  mapFrom--;
              }
          }, this.items.length, 0);
          return new Branch(ropeSequence.from(items.reverse()), events);
      }
  }
  Branch.empty = new Branch(ropeSequence.empty, 0);
  function cutOffEvents(items, n) {
      let cutPoint;
      items.forEach((item, i) => {
          if (item.selection && (n-- == 0)) {
              cutPoint = i;
              return false;
          }
      });
      return items.slice(cutPoint);
  }
  class Item {
      constructor(
      // The (forward) step map for this item.
      map, 
      // The inverted step
      step, 
      // If this is non-null, this item is the start of a group, and
      // this selection is the starting selection for the group (the one
      // that was active before the first step was applied)
      selection, 
      // If this item is the inverse of a previous mapping on the stack,
      // this points at the inverse's offset
      mirrorOffset) {
          this.map = map;
          this.step = step;
          this.selection = selection;
          this.mirrorOffset = mirrorOffset;
      }
      merge(other) {
          if (this.step && other.step && !other.selection) {
              let step = other.step.merge(this.step);
              if (step)
                  return new Item(step.getMap().invert(), step, this.selection);
          }
      }
  }
  // The value of the state field that tracks undo/redo history for that
  // state. Will be stored in the plugin state when the history plugin
  // is active.
  class HistoryState {
      constructor(done, undone, prevRanges, prevTime) {
          this.done = done;
          this.undone = undone;
          this.prevRanges = prevRanges;
          this.prevTime = prevTime;
      }
  }
  const DEPTH_OVERFLOW = 20;
  // Record a transformation in undo history.
  function applyTransaction(history, state, tr, options) {
      let historyTr = tr.getMeta(historyKey), rebased;
      if (historyTr)
          return historyTr.historyState;
      if (tr.getMeta(closeHistoryKey))
          history = new HistoryState(history.done, history.undone, null, 0);
      let appended = tr.getMeta("appendedTransaction");
      if (tr.steps.length == 0) {
          return history;
      }
      else if (appended && appended.getMeta(historyKey)) {
          if (appended.getMeta(historyKey).redo)
              return new HistoryState(history.done.addTransform(tr, undefined, options, mustPreserveItems(state)), history.undone, rangesFor(tr.mapping.maps[tr.steps.length - 1]), history.prevTime);
          else
              return new HistoryState(history.done, history.undone.addTransform(tr, undefined, options, mustPreserveItems(state)), null, history.prevTime);
      }
      else if (tr.getMeta("addToHistory") !== false && !(appended && appended.getMeta("addToHistory") === false)) {
          // Group transforms that occur in quick succession into one event.
          let newGroup = history.prevTime == 0 || !appended && (history.prevTime < (tr.time || 0) - options.newGroupDelay ||
              !isAdjacentTo(tr, history.prevRanges));
          let prevRanges = appended ? mapRanges(history.prevRanges, tr.mapping) : rangesFor(tr.mapping.maps[tr.steps.length - 1]);
          return new HistoryState(history.done.addTransform(tr, newGroup ? state.selection.getBookmark() : undefined, options, mustPreserveItems(state)), Branch.empty, prevRanges, tr.time);
      }
      else if (rebased = tr.getMeta("rebased")) {
          // Used by the collab module to tell the history that some of its
          // content has been rebased.
          return new HistoryState(history.done.rebased(tr, rebased), history.undone.rebased(tr, rebased), mapRanges(history.prevRanges, tr.mapping), history.prevTime);
      }
      else {
          return new HistoryState(history.done.addMaps(tr.mapping.maps), history.undone.addMaps(tr.mapping.maps), mapRanges(history.prevRanges, tr.mapping), history.prevTime);
      }
  }
  function isAdjacentTo(transform, prevRanges) {
      if (!prevRanges)
          return false;
      if (!transform.docChanged)
          return true;
      let adjacent = false;
      transform.mapping.maps[0].forEach((start, end) => {
          for (let i = 0; i < prevRanges.length; i += 2)
              if (start <= prevRanges[i + 1] && end >= prevRanges[i])
                  adjacent = true;
      });
      return adjacent;
  }
  function rangesFor(map) {
      let result = [];
      map.forEach((_from, _to, from, to) => result.push(from, to));
      return result;
  }
  function mapRanges(ranges, mapping) {
      if (!ranges)
          return null;
      let result = [];
      for (let i = 0; i < ranges.length; i += 2) {
          let from = mapping.map(ranges[i], 1), to = mapping.map(ranges[i + 1], -1);
          if (from <= to)
              result.push(from, to);
      }
      return result;
  }
  // Apply the latest event from one branch to the document and shift the event
  // onto the other branch.
  function histTransaction(history, state, dispatch, redo) {
      let preserveItems = mustPreserveItems(state);
      let histOptions = historyKey.get(state).spec.config;
      let pop = (redo ? history.undone : history.done).popEvent(state, preserveItems);
      if (!pop)
          return;
      let selection = pop.selection.resolve(pop.transform.doc);
      let added = (redo ? history.done : history.undone).addTransform(pop.transform, state.selection.getBookmark(), histOptions, preserveItems);
      let newHist = new HistoryState(redo ? added : pop.remaining, redo ? pop.remaining : added, null, 0);
      dispatch(pop.transform.setSelection(selection).setMeta(historyKey, { redo, historyState: newHist }).scrollIntoView());
  }
  let cachedPreserveItems = false, cachedPreserveItemsPlugins = null;
  // Check whether any plugin in the given state has a
  // `historyPreserveItems` property in its spec, in which case we must
  // preserve steps exactly as they came in, so that they can be
  // rebased.
  function mustPreserveItems(state) {
      let plugins = state.plugins;
      if (cachedPreserveItemsPlugins != plugins) {
          cachedPreserveItems = false;
          cachedPreserveItemsPlugins = plugins;
          for (let i = 0; i < plugins.length; i++)
              if (plugins[i].spec.historyPreserveItems) {
                  cachedPreserveItems = true;
                  break;
              }
      }
      return cachedPreserveItems;
  }
  const historyKey = new PluginKey("history");
  const closeHistoryKey = new PluginKey("closeHistory");
  /**
  Returns a plugin that enables the undo history for an editor. The
  plugin will track undo and redo stacks, which can be used with the
  [`undo`](https://prosemirror.net/docs/ref/#history.undo) and [`redo`](https://prosemirror.net/docs/ref/#history.redo) commands.

  You can set an `"addToHistory"` [metadata
  property](https://prosemirror.net/docs/ref/#state.Transaction.setMeta) of `false` on a transaction
  to prevent it from being rolled back by undo.
  */
  function history(config = {}) {
      config = { depth: config.depth || 100,
          newGroupDelay: config.newGroupDelay || 500 };
      return new Plugin({
          key: historyKey,
          state: {
              init() {
                  return new HistoryState(Branch.empty, Branch.empty, null, 0);
              },
              apply(tr, hist, state) {
                  return applyTransaction(hist, state, tr, config);
              }
          },
          config,
          props: {
              handleDOMEvents: {
                  beforeinput(view, e) {
                      let inputType = e.inputType;
                      let command = inputType == "historyUndo" ? undo : inputType == "historyRedo" ? redo : null;
                      if (!command)
                          return false;
                      e.preventDefault();
                      return command(view.state, view.dispatch);
                  }
              }
          }
      });
  }
  /**
  A command function that undoes the last change, if any.
  */
  const undo = (state, dispatch) => {
      let hist = historyKey.getState(state);
      if (!hist || hist.done.eventCount == 0)
          return false;
      if (dispatch)
          histTransaction(hist, state, dispatch, false);
      return true;
  };
  /**
  A command function that redoes the last undone change, if any.
  */
  const redo = (state, dispatch) => {
      let hist = historyKey.getState(state);
      if (!hist || hist.undone.eventCount == 0)
          return false;
      if (dispatch)
          histTransaction(hist, state, dispatch, true);
      return true;
  };

  const olDOM = ["ol", 0], ulDOM = ["ul", 0], liDOM = ["li", 0];
  /**
  An ordered list [node spec](https://prosemirror.net/docs/ref/#model.NodeSpec). Has a single
  attribute, `order`, which determines the number at which the list
  starts counting, and defaults to 1. Represented as an `<ol>`
  element.
  */
  const orderedList = {
      attrs: { order: { default: 1 } },
      parseDOM: [{ tag: "ol", getAttrs(dom) {
                  return { order: dom.hasAttribute("start") ? +dom.getAttribute("start") : 1 };
              } }],
      toDOM(node) {
          return node.attrs.order == 1 ? olDOM : ["ol", { start: node.attrs.order }, 0];
      }
  };
  /**
  A bullet list node spec, represented in the DOM as `<ul>`.
  */
  const bulletList = {
      parseDOM: [{ tag: "ul" }],
      toDOM() { return ulDOM; }
  };
  /**
  A list item (`<li>`) spec.
  */
  const listItem = {
      parseDOM: [{ tag: "li" }],
      toDOM() { return liDOM; },
      defining: true
  };
  function add(obj, props) {
      let copy = {};
      for (let prop in obj)
          copy[prop] = obj[prop];
      for (let prop in props)
          copy[prop] = props[prop];
      return copy;
  }
  /**
  Convenience function for adding list-related node types to a map
  specifying the nodes for a schema. Adds
  [`orderedList`](https://prosemirror.net/docs/ref/#schema-list.orderedList) as `"ordered_list"`,
  [`bulletList`](https://prosemirror.net/docs/ref/#schema-list.bulletList) as `"bullet_list"`, and
  [`listItem`](https://prosemirror.net/docs/ref/#schema-list.listItem) as `"list_item"`.

  `itemContent` determines the content expression for the list items.
  If you want the commands defined in this module to apply to your
  list structure, it should have a shape like `"paragraph block*"` or
  `"paragraph (ordered_list | bullet_list)*"`. `listGroup` can be
  given to assign a group name to the list node types, for example
  `"block"`.
  */
  function addListNodes(nodes, itemContent, listGroup) {
      return nodes.append({
          ordered_list: add(orderedList, { content: "list_item+", group: listGroup }),
          bullet_list: add(bulletList, { content: "list_item+", group: listGroup }),
          list_item: add(listItem, { content: itemContent })
      });
  }
  /**
  Returns a command function that wraps the selection in a list with
  the given type an attributes. If `dispatch` is null, only return a
  value to indicate whether this is possible, but don't actually
  perform the change.
  */
  function wrapInList(listType, attrs = null) {
      return function (state, dispatch) {
          let { $from, $to } = state.selection;
          let range = $from.blockRange($to), doJoin = false, outerRange = range;
          if (!range)
              return false;
          // This is at the top of an existing list item
          if (range.depth >= 2 && $from.node(range.depth - 1).type.compatibleContent(listType) && range.startIndex == 0) {
              // Don't do anything if this is the top of the list
              if ($from.index(range.depth - 1) == 0)
                  return false;
              let $insert = state.doc.resolve(range.start - 2);
              outerRange = new NodeRange($insert, $insert, range.depth);
              if (range.endIndex < range.parent.childCount)
                  range = new NodeRange($from, state.doc.resolve($to.end(range.depth)), range.depth);
              doJoin = true;
          }
          let wrap = findWrapping(outerRange, listType, attrs, range);
          if (!wrap)
              return false;
          if (dispatch)
              dispatch(doWrapInList(state.tr, range, wrap, doJoin, listType).scrollIntoView());
          return true;
      };
  }
  function doWrapInList(tr, range, wrappers, joinBefore, listType) {
      let content = Fragment.empty;
      for (let i = wrappers.length - 1; i >= 0; i--)
          content = Fragment.from(wrappers[i].type.create(wrappers[i].attrs, content));
      tr.step(new ReplaceAroundStep(range.start - (joinBefore ? 2 : 0), range.end, range.start, range.end, new Slice(content, 0, 0), wrappers.length, true));
      let found = 0;
      for (let i = 0; i < wrappers.length; i++)
          if (wrappers[i].type == listType)
              found = i + 1;
      let splitDepth = wrappers.length - found;
      let splitPos = range.start + wrappers.length - (joinBefore ? 2 : 0), parent = range.parent;
      for (let i = range.startIndex, e = range.endIndex, first = true; i < e; i++, first = false) {
          if (!first && canSplit(tr.doc, splitPos, splitDepth)) {
              tr.split(splitPos, splitDepth);
              splitPos += 2 * splitDepth;
          }
          splitPos += parent.child(i).nodeSize;
      }
      return tr;
  }
  /**
  Build a command that splits a non-empty textblock at the top level
  of a list item by also splitting that list item.
  */
  function splitListItem(itemType) {
      return function (state, dispatch) {
          let { $from, $to, node } = state.selection;
          if ((node && node.isBlock) || $from.depth < 2 || !$from.sameParent($to))
              return false;
          let grandParent = $from.node(-1);
          if (grandParent.type != itemType)
              return false;
          if ($from.parent.content.size == 0 && $from.node(-1).childCount == $from.indexAfter(-1)) {
              // In an empty block. If this is a nested list, the wrapping
              // list item should be split. Otherwise, bail out and let next
              // command handle lifting.
              if ($from.depth == 3 || $from.node(-3).type != itemType ||
                  $from.index(-2) != $from.node(-2).childCount - 1)
                  return false;
              if (dispatch) {
                  let wrap = Fragment.empty;
                  let depthBefore = $from.index(-1) ? 1 : $from.index(-2) ? 2 : 3;
                  // Build a fragment containing empty versions of the structure
                  // from the outer list item to the parent node of the cursor
                  for (let d = $from.depth - depthBefore; d >= $from.depth - 3; d--)
                      wrap = Fragment.from($from.node(d).copy(wrap));
                  let depthAfter = $from.indexAfter(-1) < $from.node(-2).childCount ? 1
                      : $from.indexAfter(-2) < $from.node(-3).childCount ? 2 : 3;
                  // Add a second list item with an empty default start node
                  wrap = wrap.append(Fragment.from(itemType.createAndFill()));
                  let start = $from.before($from.depth - (depthBefore - 1));
                  let tr = state.tr.replace(start, $from.after(-depthAfter), new Slice(wrap, 4 - depthBefore, 0));
                  let sel = -1;
                  tr.doc.nodesBetween(start, tr.doc.content.size, (node, pos) => {
                      if (sel > -1)
                          return false;
                      if (node.isTextblock && node.content.size == 0)
                          sel = pos + 1;
                  });
                  if (sel > -1)
                      tr.setSelection(Selection.near(tr.doc.resolve(sel)));
                  dispatch(tr.scrollIntoView());
              }
              return true;
          }
          let nextType = $to.pos == $from.end() ? grandParent.contentMatchAt(0).defaultType : null;
          let tr = state.tr.delete($from.pos, $to.pos);
          let types = nextType ? [null, { type: nextType }] : undefined;
          if (!canSplit(tr.doc, $from.pos, 2, types))
              return false;
          if (dispatch)
              dispatch(tr.split($from.pos, 2, types).scrollIntoView());
          return true;
      };
  }
  /**
  Create a command to lift the list item around the selection up into
  a wrapping list.
  */
  function liftListItem(itemType) {
      return function (state, dispatch) {
          let { $from, $to } = state.selection;
          let range = $from.blockRange($to, node => node.childCount > 0 && node.firstChild.type == itemType);
          if (!range)
              return false;
          if (!dispatch)
              return true;
          if ($from.node(range.depth - 1).type == itemType) // Inside a parent list
              return liftToOuterList(state, dispatch, itemType, range);
          else // Outer list node
              return liftOutOfList(state, dispatch, range);
      };
  }
  function liftToOuterList(state, dispatch, itemType, range) {
      let tr = state.tr, end = range.end, endOfList = range.$to.end(range.depth);
      if (end < endOfList) {
          // There are siblings after the lifted items, which must become
          // children of the last item
          tr.step(new ReplaceAroundStep(end - 1, endOfList, end, endOfList, new Slice(Fragment.from(itemType.create(null, range.parent.copy())), 1, 0), 1, true));
          range = new NodeRange(tr.doc.resolve(range.$from.pos), tr.doc.resolve(endOfList), range.depth);
      }
      const target = liftTarget(range);
      if (target == null)
          return false;
      tr.lift(range, target);
      let after = tr.mapping.map(end, -1) - 1;
      if (canJoin(tr.doc, after))
          tr.join(after);
      dispatch(tr.scrollIntoView());
      return true;
  }
  function liftOutOfList(state, dispatch, range) {
      let tr = state.tr, list = range.parent;
      // Merge the list items into a single big item
      for (let pos = range.end, i = range.endIndex - 1, e = range.startIndex; i > e; i--) {
          pos -= list.child(i).nodeSize;
          tr.delete(pos - 1, pos + 1);
      }
      let $start = tr.doc.resolve(range.start), item = $start.nodeAfter;
      if (tr.mapping.map(range.end) != range.start + $start.nodeAfter.nodeSize)
          return false;
      let atStart = range.startIndex == 0, atEnd = range.endIndex == list.childCount;
      let parent = $start.node(-1), indexBefore = $start.index(-1);
      if (!parent.canReplace(indexBefore + (atStart ? 0 : 1), indexBefore + 1, item.content.append(atEnd ? Fragment.empty : Fragment.from(list))))
          return false;
      let start = $start.pos, end = start + item.nodeSize;
      // Strip off the surrounding list. At the sides where we're not at
      // the end of the list, the existing list is closed. At sides where
      // this is the end, it is overwritten to its end.
      tr.step(new ReplaceAroundStep(start - (atStart ? 1 : 0), end + (atEnd ? 1 : 0), start + 1, end - 1, new Slice((atStart ? Fragment.empty : Fragment.from(list.copy(Fragment.empty)))
          .append(atEnd ? Fragment.empty : Fragment.from(list.copy(Fragment.empty))), atStart ? 0 : 1, atEnd ? 0 : 1), atStart ? 0 : 1));
      dispatch(tr.scrollIntoView());
      return true;
  }
  /**
  Create a command to sink the list item around the selection down
  into an inner list.
  */
  function sinkListItem(itemType) {
      return function (state, dispatch) {
          let { $from, $to } = state.selection;
          let range = $from.blockRange($to, node => node.childCount > 0 && node.firstChild.type == itemType);
          if (!range)
              return false;
          let startIndex = range.startIndex;
          if (startIndex == 0)
              return false;
          let parent = range.parent, nodeBefore = parent.child(startIndex - 1);
          if (nodeBefore.type != itemType)
              return false;
          if (dispatch) {
              let nestedBefore = nodeBefore.lastChild && nodeBefore.lastChild.type == parent.type;
              let inner = Fragment.from(nestedBefore ? itemType.create() : null);
              let slice = new Slice(Fragment.from(itemType.create(null, Fragment.from(parent.type.create(null, inner)))), nestedBefore ? 3 : 1, 0);
              let before = range.start, after = range.end;
              dispatch(state.tr.step(new ReplaceAroundStep(before - (nestedBefore ? 3 : 1), after, before, after, slice, 1, true))
                  .scrollIntoView());
          }
          return true;
      };
  }

  var index$2 = /*#__PURE__*/Object.freeze({
    __proto__: null,
    addListNodes: addListNodes,
    bulletList: bulletList,
    liftListItem: liftListItem,
    listItem: listItem,
    orderedList: orderedList,
    sinkListItem: sinkListItem,
    splitListItem: splitListItem,
    wrapInList: wrapInList
  });

  /**
   * A representation of a color in hexadecimal format.
   * This class provides methods for transformations and manipulations of colors.
   */
  class Color extends Number {

    /**
     * A CSS-compatible color string.
     * An alias for Color#toString.
     * @type {string}
     */
    get css() {
      return this.toString(16);
    }

    /* ------------------------------------------ */

    /**
     * The color represented as an RGB array.
     * @type {[number, number, number]}
     */
    get rgb() {
      return [((this >> 16) & 0xFF) / 255, ((this >> 8) & 0xFF) / 255, (this & 0xFF) / 255];
    }

    /* ------------------------------------------ */

    /**
     * The numeric value of the red channel between [0, 1].
     * @type {number}
     */
    get r() {
      return ((this >> 16) & 0xFF) / 255;
    }

    /* ------------------------------------------ */

    /**
     * The numeric value of the green channel between [0, 1].
     * @type {number}
     */
    get g() {
      return ((this >> 8) & 0xFF) / 255;
    }

    /* ------------------------------------------ */

    /**
     * The numeric value of the blue channel between [0, 1].
     * @type {number}
     */
    get b() {
      return (this & 0xFF) / 255;
    }

    /* ------------------------------------------ */

    /**
     * The maximum value of all channels.
     * @type {number}
     */
    get maximum() {
      return Math.max(...this);
    }

    /* ------------------------------------------ */

    /**
     * The minimum value of all channels.
     * @type {number}
     */
    get minimum() {
      return Math.min(...this);
    }

    /* ------------------------------------------ */

    /**
     * Get the value of this color in little endian format.
     * @type {number}
     */
    get littleEndian() {
      return ((this >> 16) & 0xFF) + (this & 0x00FF00) + ((this & 0xFF) << 16);
    }

    /* ------------------------------------------ */

    /**
     * The color represented as an HSV array.
     * Conversion formula adapted from http://en.wikipedia.org/wiki/HSV_color_space.
     * Assumes r, g, and b are contained in the set [0, 1] and returns h, s, and v in the set [0, 1].
     * @type {[number, number, number]}
     */
    get hsv() {
      const [r, g, b] = this.rgb;
      const max = Math.max(r, g, b);
      const min = Math.min(r, g, b);
      const d = max - min;

      let h;
      const s = max === 0 ? 0 : d / max;
      const v = max;

      // Achromatic colors
      if (max === min) return [0, s, v];

      // Normal colors
      switch (max) {
        case r: h = (g - b) / d + (g < b ? 6 : 0); break;
        case g: h = (b - r) / d + 2; break;
        case b: h = (r - g) / d + 4; break;
      }
      h /= 6;
      return [h, s, v];
    }

    /* ------------------------------------------ */
    /*  Color Manipulation Methods                */
    /* ------------------------------------------ */

    /** @override */
    toString(radix) {
      return `#${super.toString(16).padStart(6, "0")}`;
    }

    /* ------------------------------------------ */

    /**
     * Test whether this color equals some other color
     * @param {Color|number} other  Some other color or hex number
     * @returns {boolean}           Are the colors equal?
     */
    equals(other) {
      return this.valueOf() === other.valueOf();
    }

    /* ------------------------------------------ */

    /**
     * Get a CSS-compatible RGBA color string.
     * @param {number} alpha      The desired alpha in the range [0, 1]
     * @returns {string}          A CSS-compatible RGBA string
     */
    toRGBA(alpha) {
      const rgba = [(this >> 16) & 0xFF, (this >> 8) & 0xFF, this & 0xFF, alpha];
      return `rgba(${rgba.join(", ")})`;
    }

    /* ------------------------------------------ */

    /**
     * Mix this Color with some other Color using a provided interpolation weight.
     * @param {Color} other       Some other Color to mix with
     * @param {number} weight     The mixing weight placed on this color where weight is placed on the other color
     * @returns {Color}           The resulting mixed Color
     */
    mix(other, weight) {
      return new Color(Color.mix(this, other, weight));
    }

    /* ------------------------------------------ */

    /**
     * Multiply this Color by another Color or a static scalar.
     * @param {Color|number} other  Some other Color or a static scalar.
     * @returns {Color}             The resulting Color.
     */
    multiply(other) {
      if ( other instanceof Color ) return new Color(Color.multiply(this, other));
      return new Color(Color.multiplyScalar(this, other));
    }

    /* ------------------------------------------ */

    /**
     * Add this Color by another Color or a static scalar.
     * @param {Color|number} other  Some other Color or a static scalar.
     * @returns {Color}             The resulting Color.
     */
    add(other) {
      if ( other instanceof Color ) return new Color(Color.add(this, other));
      return new Color(Color.addScalar(this, other));
    }

    /* ------------------------------------------ */

    /**
     * Subtract this Color by another Color or a static scalar.
     * @param {Color|number} other  Some other Color or a static scalar.
     * @returns {Color}             The resulting Color.
     */
    subtract(other) {
      if ( other instanceof Color ) return new Color(Color.subtract(this, other));
      return new Color(Color.subtractScalar(this, other));
    }

    /* ------------------------------------------ */

    /**
     * Max this color by another Color or a static scalar.
     * @param {Color|number} other  Some other Color or a static scalar.
     * @returns {Color}             The resulting Color.
     */
    maximize(other) {
      if ( other instanceof Color ) return new Color(Color.maximize(this, other));
      return new Color(Color.maximizeScalar(this, other));
    }

    /* ------------------------------------------ */

    /**
     * Min this color by another Color or a static scalar.
     * @param {Color|number} other  Some other Color or a static scalar.
     * @returns {Color}             The resulting Color.
     */
    minimize(other) {
      if ( other instanceof Color ) return new Color(Color.minimize(this, other));
      return new Color(Color.minimizeScalar(this, other));
    }

    /* ------------------------------------------ */
    /*  Iterator                                  */
    /* ------------------------------------------ */

    /**
     * Iterating over a Color is equivalent to iterating over its [r,g,b] color channels.
     * @returns {Generator<number>}
     */
    *[Symbol.iterator]() {
      yield this.r;
      yield this.g;
      yield this.b;
    }

    /* ------------------------------------------------------------------------------------------- */
    /*                      Real-time performance Methods and Properties                           */
    /*  Important Note:                                                                            */
    /*  These methods are not a replacement, but a tool when real-time performance is needed.      */
    /*  They do not have the flexibility of the "classic" methods and come with some limitations.  */
    /*  Unless you have to deal with real-time performance, you should use the "classic" methods.  */
    /* ------------------------------------------------------------------------------------------- */

    /**
     * Set an rgb array with the rgb values contained in this Color class.
     * @param {number[]} vec3  Receive the result. Must be an array with at least a length of 3.
     */
    applyRGB(vec3) {
      vec3[0] = ((this >> 16) & 0xFF) / 255;
      vec3[1] = ((this >> 8) & 0xFF) / 255;
      vec3[2] = (this & 0xFF) / 255;
    }

    /* ------------------------------------------ */

    /**
     * Apply a linear interpolation between two colors, according to the weight.
     * @param {number}        color1       The first color to mix.
     * @param {number}        color2       The second color to mix.
     * @param {number}        weight       Weight of the linear interpolation.
     * @returns {number}                   The resulting mixed color
     */
    static mix(color1, color2, weight) {
      return (((((color1 >> 16) & 0xFF) * (1 - weight) + ((color2 >> 16) & 0xFF) * weight) << 16) & 0xFF0000)
        | (((((color1 >> 8) & 0xFF) * (1 - weight) + ((color2 >> 8) & 0xFF) * weight) << 8) & 0x00FF00)
        | (((color1 & 0xFF) * (1 - weight) + (color2 & 0xFF) * weight) & 0x0000FF);
    }

    /* ------------------------------------------ */

    /**
     * Multiply two colors.
     * @param {number}        color1       The first color to multiply.
     * @param {number}        color2       The second color to multiply.
     * @returns {number}                   The result.
     */
    static multiply(color1, color2) {
      return ((((color1 >> 16) & 0xFF) / 255 * ((color2 >> 16) & 0xFF) / 255) * 255 << 16)
        | ((((color1 >> 8) & 0xFF) / 255 * ((color2 >> 8) & 0xFF) / 255) * 255 << 8)
        | (((color1 & 0xFF) / 255 * ((color2 & 0xFF) / 255)) * 255);
    }

    /* ------------------------------------------ */

    /**
     * Multiply a color by a scalar
     * @param {number} color        The color to multiply.
     * @param {number} scalar       A static scalar to multiply with.
     * @returns {number}            The resulting color as a number.
     */
    static multiplyScalar(color, scalar) {
      return ((((color >> 16) & 0xFF) / 255 * scalar) * 255 << 16)
        | ((((color >> 8) & 0xFF) / 255 * scalar) * 255 << 8)
        | (((color & 0xFF) / 255 * scalar) * 255);
    }

    /* ------------------------------------------ */

    /**
     * Maximize two colors.
     * @param {number}        color1       The first color.
     * @param {number}        color2       The second color.
     * @returns {number}                   The result.
     */
    static maximize(color1, color2) {
      return (Math.clamped(Math.max((color1 >> 16) & 0xFF, (color2 >> 16) & 0xFF), 0, 0xFF) << 16)
        | (Math.clamped(Math.max((color1 >> 8) & 0xFF, (color2 >> 8) & 0xFF), 0, 0xFF) << 8)
        | Math.clamped(Math.max(color1 & 0xFF, color2 & 0xFF), 0, 0xFF);
    }

    /* ------------------------------------------ */

    /**
     * Maximize a color by a static scalar.
     * @param {number} color         The color to maximize.
     * @param {number} scalar        Scalar to maximize with (normalized).
     * @returns {number}             The resulting color as a number.
     */
    static maximizeScalar(color, scalar) {
      return (Math.clamped(Math.max((color >> 16) & 0xFF, scalar * 255), 0, 0xFF) << 16)
        | (Math.clamped(Math.max((color >> 8) & 0xFF, scalar * 255), 0, 0xFF) << 8)
        | Math.clamped(Math.max(color & 0xFF, scalar * 255), 0, 0xFF);
    }

    /* ------------------------------------------ */

    /**
     * Add two colors.
     * @param {number}        color1       The first color.
     * @param {number}        color2       The second color.
     * @returns {number}                   The resulting color as a number.
     */
    static add(color1, color2) {
      return (Math.clamped((((color1 >> 16) & 0xFF) + ((color2 >> 16) & 0xFF)), 0, 0xFF) << 16)
        | (Math.clamped((((color1 >> 8) & 0xFF) + ((color2 >> 8) & 0xFF)), 0, 0xFF) << 8)
        | Math.clamped(((color1 & 0xFF) + (color2 & 0xFF)), 0, 0xFF);
    }

    /* ------------------------------------------ */

    /**
     * Add a static scalar to a color.
     * @param {number} color         The color.
     * @param {number} scalar        Scalar to add with (normalized).
     * @returns {number}             The resulting color as a number.
     */
    static addScalar(color, scalar) {
      return (Math.clamped((((color >> 16) & 0xFF) + scalar * 255), 0, 0xFF) << 16)
        | (Math.clamped((((color >> 8) & 0xFF) + scalar * 255), 0, 0xFF) << 8)
        | Math.clamped(((color & 0xFF) + scalar * 255), 0, 0xFF);
    }

    /* ------------------------------------------ */

    /**
     * Subtract two colors.
     * @param {number}        color1       The first color.
     * @param {number}        color2       The second color.
     */
    static subtract(color1, color2) {
      return (Math.clamped((((color1 >> 16) & 0xFF) - ((color2 >> 16) & 0xFF)), 0, 0xFF) << 16)
        | (Math.clamped((((color1 >> 8) & 0xFF) - ((color2 >> 8) & 0xFF)), 0, 0xFF) << 8)
        | Math.clamped(((color1 & 0xFF) - (color2 & 0xFF)), 0, 0xFF);
    }

    /* ------------------------------------------ */

    /**
     * Subtract a color by a static scalar.
     * @param {number} color         The color.
     * @param {number} scalar        Scalar to subtract with (normalized).
     * @returns {number}             The resulting color as a number.
     */
    static subtractScalar(color, scalar) {
      return (Math.clamped((((color >> 16) & 0xFF) - scalar * 255), 0, 0xFF) << 16)
        | (Math.clamped((((color >> 8) & 0xFF) - scalar * 255), 0, 0xFF) << 8)
        | Math.clamped(((color & 0xFF) - scalar * 255), 0, 0xFF);
    }

    /* ------------------------------------------ */

    /**
     * Minimize two colors.
     * @param {number}        color1       The first color.
     * @param {number}        color2       The second color.
     */
    static minimize(color1, color2) {
      return (Math.clamped(Math.min((color1 >> 16) & 0xFF, (color2 >> 16) & 0xFF), 0, 0xFF) << 16)
        | (Math.clamped(Math.min((color1 >> 8) & 0xFF, (color2 >> 8) & 0xFF), 0, 0xFF) << 8)
        | Math.clamped(Math.min(color1 & 0xFF, color2 & 0xFF), 0, 0xFF);
    }

    /* ------------------------------------------ */

    /**
     * Minimize a color by a static scalar.
     * @param {number} color         The color.
     * @param {number} scalar        Scalar to minimize with (normalized).
     */
    static minimizeScalar(color, scalar) {
      return (Math.clamped(Math.min((color >> 16) & 0xFF, scalar * 255), 0, 0xFF) << 16)
        | (Math.clamped(Math.min((color >> 8) & 0xFF, scalar * 255), 0, 0xFF) << 8)
        | Math.clamped(Math.min(color & 0xFF, scalar * 255), 0, 0xFF);
    }

    /* ------------------------------------------ */

    /**
     * Convert a color to RGB and assign values to a passed array.
     * @param {number} color   The color to convert to RGB values.
     * @param {number[]} vec3  Receive the result. Must be an array with at least a length of 3.
     */
    static applyRGB(color, vec3) {
      vec3[0] = ((color >> 16) & 0xFF) / 255;
      vec3[1] = ((color >> 8) & 0xFF) / 255;
      vec3[2] = (color & 0xFF) / 255;
    }

    /* ------------------------------------------ */
    /*  Factory Methods                           */
    /* ------------------------------------------ */

    /**
     * Create a Color instance from an RGB array.
     * @param {null|string|number|number[]} color A color input
     * @returns {Color|NaN}                       The hex color instance or NaN
     */
    static from(color) {
      if ( (color === null) || (color === undefined) ) return NaN;
      if ( typeof color === "string" ) return this.fromString(color);
      if ( typeof color === "number" ) return new this(color);
      if ( (color instanceof Array) && (color.length === 3) ) return this.fromRGB(color);
      if ( color instanceof Color ) return color;
      // For all other cases, we keep the Number logic.
      return Number(color);
    }

    /* ------------------------------------------ */

    /**
     * Create a Color instance from a color string which either includes or does not include a leading #.
     * @param {string} color                      A color string
     * @returns {Color}                           The hex color instance
     */
    static fromString(color) {
      return new this(parseInt(color.startsWith("#") ? color.substring(1) : color, 16));
    }

    /* ------------------------------------------ */

    /**
     * Create a Color instance from an RGB array.
     * @param {[number, number, number]} rgb      An RGB tuple
     * @returns {Color}                           The hex color instance
     */
    static fromRGB(rgb) {
      return new this(((rgb[0] * 255) << 16) + ((rgb[1] * 255) << 8) + (rgb[2] * 255 | 0));
    }

    /* ------------------------------------------ */

    /**
     * Create a Color instance from an RGB normalized values.
     * @param {number} r                          The red value
     * @param {number} g                          The green value
     * @param {number} b                          The blue value
     * @returns {Color}                           The hex color instance
     */
    static fromRGBvalues(r, g, b) {
      return new this(((r * 255) << 16) + ((g * 255) << 8) + (b * 255 | 0));
    }

    /* ------------------------------------------ */

    /**
     * Create a Color instance from an HSV array.
     * Conversion formula adapted from http://en.wikipedia.org/wiki/HSV_color_space.
     * Assumes h, s, and v are contained in the set [0, 1].
     * @param {[number, number, number]} hsv      An HSV tuple
     * @returns {Color}                           The hex color instance
     */
    static fromHSV(hsv) {
      const [h, s, v] = hsv;
      const i = Math.floor(h * 6);
      const f = (h * 6) - i;
      const p = v * (1 - s);
      const q = v * (1 - f * s);
      const t = v * (1 - (1 - f) * s);
      let rgb;
      switch (i % 6) {
        case 0: rgb = [v, t, p]; break;
        case 1: rgb = [q, v, p]; break;
        case 2: rgb = [p, v, t]; break;
        case 3: rgb = [p, q, v]; break;
        case 4: rgb = [t, p, v]; break;
        case 5: rgb = [v, p, q]; break;
      }
      return this.fromRGB(rgb);
    }
  }

  /** @module constants */

  /**
   * Define the allowed User permission levels.
   * Each level is assigned a value in ascending order. Higher levels grant more permissions.
   * @enum {number}
   * @see https://foundryvtt.com/article/users/
   */
  const USER_ROLES = {
    /**
     * The User is blocked from taking actions in Foundry Virtual Tabletop.
     * You can use this role to temporarily or permanently ban a user from joining the game.
     */
    NONE: 0,

    /**
     * The User is able to join the game with permissions available to a standard player.
     * They cannot take some more advanced actions which require Trusted permissions, but they have the basic functionalities needed to operate in the virtual tabletop.
     */
    PLAYER: 1,

    /**
     * Similar to the Player role, except a Trusted User has the ability to perform some more advanced actions like create drawings, measured templates, or even to (optionally) upload media files to the server.
     */
    TRUSTED: 2,

    /**
     * A special User who has many of the same in-game controls as a Game Master User, but does not have the ability to perform administrative actions like changing User roles or modifying World-level settings.
     */
    ASSISTANT: 3,

    /**
     *  A special User who has administrative control over this specific World.
     *  Game Masters behave quite differently than Players in that they have the ability to see all Documents and Objects within the world as well as the capability to configure World settings.
     */
    GAMEMASTER: 4
  };

  /**
   * Invert the User Role mapping to recover role names from a role integer
   * @enum {string}
   * @see USER_ROLES
   */
  Object.entries(USER_ROLES).reduce((obj, r) => {
    obj[r[1]] = r[0];
    return obj;
  }, {});

  /**
   * The supported file extensions for image-type files, and their corresponding mime types.
   * @type {Object<string, string>}
   */
  const IMAGE_FILE_EXTENSIONS = {
    apng: "image/apng",
    avif: "image/avif",
    bmp: "image/bmp",
    gif: "image/gif",
    jpeg: "image/jpeg",
    jpg: "image/jpeg",
    png: "image/png",
    svg: "image/svg+xml",
    tiff: "image/tiff",
    webp: "image/webp"
  };

  /**
   * The supported file extensions for video-type files, and their corresponding mime types.
   * @type {Object<string, string>}
   */
  const VIDEO_FILE_EXTENSIONS = {
    m4v: "video/mp4",
    mp4: "video/mp4",
    ogv: "video/ogg",
    webm: "video/webm"
  };

  /**
   * The supported file extensions for audio-type files, and their corresponding mime types.
   * @type {Object<string, string>}
   */
  const AUDIO_FILE_EXTENSIONS = {
    aac: "audio/aac",
    flac: "audio/flac",
    m4a: "audio/mp4",
    mid: "audio/midi",
    mp3: "audio/mpeg",
    ogg: "audio/ogg",
    opus: "audio/opus",
    wav: "audio/wav",
    webm: "audio/webm"
  };

  /**
   * The supported file extensions for text files, and their corresponding mime types.
   * @type {Object<string, string>}
   */
  const TEXT_FILE_EXTENSIONS = {
    csv: "text/csv",
    json: "application/json",
    md: "text/markdown",
    pdf: "application/pdf",
    tsv: "text/tab-separated-values",
    txt: "text/plain",
    xml: "application/xml",
    yml: "application/yaml",
    yaml: "application/yaml"
  };

  /**
   * Supported file extensions for font files, and their corresponding mime types.
   * @type {Object<string, string>}
   */
  const FONT_FILE_EXTENSIONS = {
    ttf: "font/ttf",
    otf: "font/otf",
    woff: "font/woff",
    woff2: "font/woff2"
  };

  /**
   * Supported file extensions for 3D files, and their corresponding mime types.
   * @type {Object<string, string>}
   */
  const GRAPHICS_FILE_EXTENSIONS = {
    fbx: "application/octet-stream",
    glb: "model/gltf-binary",
    gltf: "model/gltf+json",
    mtl: "model/mtl",
    obj: "model/obj",
    stl: "model/stl",
    usdz: "model/vnd.usdz+zip"
  };

  /**
   * A consolidated mapping of all extensions permitted for upload.
   * @type {Object<string, string>}
   */
  const UPLOADABLE_FILE_EXTENSIONS = {
    ...IMAGE_FILE_EXTENSIONS,
    ...VIDEO_FILE_EXTENSIONS,
    ...AUDIO_FILE_EXTENSIONS,
    ...TEXT_FILE_EXTENSIONS,
    ...FONT_FILE_EXTENSIONS,
    ...GRAPHICS_FILE_EXTENSIONS
  };

  /**
   * A list of MIME types which are treated as uploaded "media", which are allowed to overwrite existing files.
   * Any non-media MIME type is not allowed to replace an existing file.
   * @type {string[]}
   */
  Object.values(UPLOADABLE_FILE_EXTENSIONS);

  /* -------------------------------------------- */

  /**
   * Quickly clone a simple piece of data, returning a copy which can be mutated safely.
   * This method DOES support recursive data structures containing inner objects or arrays.
   * This method DOES NOT support advanced object types like Set, Map, or other specialized classes.
   * @param {*} original                     Some sort of data
   * @param {object} [options]               Options to configure the behaviour of deepClone
   * @param {boolean} [options.strict=false] Throw an Error if deepClone is unable to clone something instead of returning the original
   * @return {*}                             The clone of that data
   */
  function deepClone(original, {strict=false}={}) {

    // Simple types
    if ( (typeof original !== "object") || (original === null) ) return original;

    // Arrays
    if ( original instanceof Array ) return original.map(deepClone);

    // Dates
    if ( original instanceof Date ) return new Date(original);

    // Unsupported advanced objects
    if ( original.constructor && (original.constructor !== Object) ) {
      if ( strict ) throw new Error("deepClone cannot clone advanced objects");
      return original;
    }

    // Other objects
    const clone = {};
    for ( let k of Object.keys(original) ) {
      clone[k] = deepClone(original[k]);
    }
    return clone;
  }

  /* -------------------------------------------- */

  /**
   * Expand a flattened object to be a standard nested Object by converting all dot-notation keys to inner objects.
   * Only simple objects will be expanded. Other Object types like class instances will be retained as-is.
   * @param {object} obj      The object to expand
   * @return {object}         An expanded object
   */
  function expandObject(obj) {
    function _expand(value, depth) {
      if ( depth > 32 ) throw new Error("Maximum object expansion depth exceeded");
      if ( !value ) return value;
      if ( Array.isArray(value) ) return value.map(v => _expand(v, depth+1)); // Map arrays
      if ( value.constructor?.name !== "Object" ) return value;               // Return advanced objects directly
      const expanded = {};                                                    // Expand simple objects
      for ( let [k, v] of Object.entries(value) ) {
        setProperty(expanded, k, _expand(v, depth+1));
      }
      return expanded;
    }
    return _expand(obj, 0);
  }

  /* -------------------------------------------- */

  /**
   * Learn the underlying data type of some variable. Supported identifiable types include:
   * undefined, null, number, string, boolean, function, Array, Set, Map, Promise, Error,
   * HTMLElement (client side only), Object (catchall for other object types)
   * @param {*} variable  A provided variable
   * @return {string}     The named type of the token
   */
  function getType(variable) {

    // Primitive types, handled with simple typeof check
    const typeOf = typeof variable;
    if ( typeOf !== "object" ) return typeOf;

    // Special cases of object
    if ( variable === null ) return "null";
    if ( !variable.constructor ) return "Object"; // Object with the null prototype.
    if ( variable.constructor.name === "Object" ) return "Object";  // simple objects

    // Match prototype instances
    const prototypes = [
      [Array, "Array"],
      [Set, "Set"],
      [Map, "Map"],
      [Promise, "Promise"],
      [Error, "Error"],
      [Color, "number"]
    ];
    if ( "HTMLElement" in globalThis ) prototypes.push([globalThis.HTMLElement, "HTMLElement"]);
    for ( const [cls, type] of prototypes ) {
      if ( variable instanceof cls ) return type;
    }

    // Unknown Object type
    return "Object";
  }

  /* -------------------------------------------- */

  /**
   * A helper function which searches through an object to assign a value using a string key
   * This string key supports the notation a.b.c which would target object[a][b][c]
   * @param {object} object   The object to update
   * @param {string} key      The string key
   * @param {*} value         The value to be assigned
   * @return {boolean}        Whether the value was changed from its previous value
   */
  function setProperty(object, key, value) {
    let target = object;
    let changed = false;

    // Convert the key to an object reference if it contains dot notation
    if ( key.indexOf('.') !== -1 ) {
      let parts = key.split('.');
      key = parts.pop();
      target = parts.reduce((o, i) => {
        if ( !o.hasOwnProperty(i) ) o[i] = {};
        return o[i];
      }, object);
    }

    // Update the target
    if ( target[key] !== value ) {
      changed = true;
      target[key] = value;
    }

    // Return changed status
    return changed;
  }

  /* -------------------------------------------- */

  /**
   * Test whether a value is empty-like; either undefined or a content-less object.
   * @param {*} value       The value to test
   * @returns {boolean}     Is the value empty-like?
   */
  function isEmpty$1(value) {
    const t = getType(value);
    switch ( t ) {
      case "undefined":
        return true;
      case "null":
        return true;
      case "Array":
        return !value.length;
      case "Object":
        return !Object.keys(value).length;
      case "Set":
      case "Map":
        return !value.size;
      default:
        return false;
    }
  }

  /* -------------------------------------------- */

  /**
   * Update a source object by replacing its keys and values with those from a target object.
   *
   * @param {object} original                           The initial object which should be updated with values from the
   *                                                    target
   * @param {object} [other={}]                         A new object whose values should replace those in the source
   * @param {object} [options={}]                       Additional options which configure the merge
   * @param {boolean} [options.insertKeys=true]         Control whether to insert new top-level objects into the resulting
   *                                                    structure which do not previously exist in the original object.
   * @param {boolean} [options.insertValues=true]       Control whether to insert new nested values into child objects in
   *                                                    the resulting structure which did not previously exist in the
   *                                                    original object.
   * @param {boolean} [options.overwrite=true]          Control whether to replace existing values in the source, or only
   *                                                    merge values which do not already exist in the original object.
   * @param {boolean} [options.recursive=true]          Control whether to merge inner-objects recursively (if true), or
   *                                                    whether to simply replace inner objects with a provided new value.
   * @param {boolean} [options.inplace=true]            Control whether to apply updates to the original object in-place
   *                                                    (if true), otherwise the original object is duplicated and the
   *                                                    copy is merged.
   * @param {boolean} [options.enforceTypes=false]      Control whether strict type checking requires that the value of a
   *                                                    key in the other object must match the data type in the original
   *                                                    data to be merged.
   * @param {boolean} [options.performDeletions=false]  Control whether to perform deletions on the original object if
   *                                                    deletion keys are present in the other object.
   * @param {number} [_d=0]                             A privately used parameter to track recursion depth.
   * @returns {object}                                  The original source object including updated, inserted, or
   *                                                    overwritten records.
   *
   * @example Control how new keys and values are added
   * ```js
   * mergeObject({k1: "v1"}, {k2: "v2"}, {insertKeys: false}); // {k1: "v1"}
   * mergeObject({k1: "v1"}, {k2: "v2"}, {insertKeys: true});  // {k1: "v1", k2: "v2"}
   * mergeObject({k1: {i1: "v1"}}, {k1: {i2: "v2"}}, {insertValues: false}); // {k1: {i1: "v1"}}
   * mergeObject({k1: {i1: "v1"}}, {k1: {i2: "v2"}}, {insertValues: true}); // {k1: {i1: "v1", i2: "v2"}}
   * ```
   *
   * @example Control how existing data is overwritten
   * ```js
   * mergeObject({k1: "v1"}, {k1: "v2"}, {overwrite: true}); // {k1: "v2"}
   * mergeObject({k1: "v1"}, {k1: "v2"}, {overwrite: false}); // {k1: "v1"}
   * ```
   *
   * @example Control whether merges are performed recursively
   * ```js
   * mergeObject({k1: {i1: "v1"}}, {k1: {i2: "v2"}}, {recursive: false}); // {k1: {i2: "v2"}}
   * mergeObject({k1: {i1: "v1"}}, {k1: {i2: "v2"}}, {recursive: true}); // {k1: {i1: "v1", i2: "v2"}}
   * ```
   *
   * @example Deleting an existing object key
   * ```js
   * mergeObject({k1: "v1", k2: "v2"}, {"-=k1": null}, {performDeletions: true});   // {k2: "v2"}
   * ```
   */
  function mergeObject(original, other={}, {
      insertKeys=true, insertValues=true, overwrite=true, recursive=true, inplace=true, enforceTypes=false,
      performDeletions=false
    }={}, _d=0) {
    other = other || {};
    if (!(original instanceof Object) || !(other instanceof Object)) {
      throw new Error("One of original or other are not Objects!");
    }
    const options = {insertKeys, insertValues, overwrite, recursive, inplace, enforceTypes, performDeletions};

    // Special handling at depth 0
    if ( _d === 0 ) {
      if ( Object.keys(other).some(k => /\./.test(k)) ) other = expandObject(other);
      if ( Object.keys(original).some(k => /\./.test(k)) ) {
        const expanded = expandObject(original);
        if ( inplace ) {
          Object.keys(original).forEach(k => delete original[k]);
          Object.assign(original, expanded);
        }
        else original = expanded;
      }
      else if ( !inplace ) original = deepClone(original);
    }

    // Iterate over the other object
    for ( let k of Object.keys(other) ) {
      const v = other[k];
      if ( original.hasOwnProperty(k) ) _mergeUpdate(original, k, v, options, _d+1);
      else _mergeInsert(original, k, v, options, _d+1);
    }
    return original;
  }

  /**
   * A helper function for merging objects when the target key does not exist in the original
   * @private
   */
  function _mergeInsert(original, k, v, {insertKeys, insertValues, performDeletions}={}, _d) {
    // Delete a key
    if ( k.startsWith("-=") && performDeletions ) {
      delete original[k.slice(2)];
      return;
    }

    const canInsert = ((_d <= 1) && insertKeys) || ((_d > 1) && insertValues);
    if ( !canInsert ) return;

    // Recursively create simple objects
    if ( v?.constructor === Object ) {
      original[k] = mergeObject({}, v, {insertKeys: true, inplace: true, performDeletions});
      return;
    }

    // Insert a key
    original[k] = v;
  }

  /**
   * A helper function for merging objects when the target key exists in the original
   * @private
   */
  function _mergeUpdate(original, k, v, {
      insertKeys, insertValues, enforceTypes, overwrite, recursive, performDeletions
    }={}, _d) {
    const x = original[k];
    const tv = getType(v);
    const tx = getType(x);

    // Recursively merge an inner object
    if ( (tv === "Object") && (tx === "Object") && recursive) {
      return mergeObject(x, v, {
        insertKeys, insertValues, overwrite, enforceTypes, performDeletions,
        inplace: true
      }, _d);
    }

    // Overwrite an existing value
    if ( overwrite ) {
      if ( (tx !== "undefined") && (tv !== tx) && enforceTypes ) {
        throw new Error(`Mismatched data types encountered during object merge.`);
      }
      original[k] = v;
    }
  }

  /* -------------------------------------------- */

  /**
   * Generate a random string ID of a given requested length.
   * @param {number} length    The length of the random ID to generate
   * @return {string}          Return a string containing random letters and numbers
   */
  function randomID(length=16) {
    const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
    const r = Array.from({length}, () => (Math.random() * chars.length) >> 0);
    return r.map(i => chars[i]).join("");
  }

  /**
   * A class responsible for building the keyboard commands for the ProseMirror editor.
   * @extends {ProseMirrorPlugin}
   */
  class ProseMirrorKeyMaps extends ProseMirrorPlugin {
    /**
     * @param {Schema} schema              The ProseMirror schema to build keymaps for.
     * @param {object} [options]           Additional options to configure the plugin's behaviour.
     * @param {Function} [options.onSave]  A function to call when Ctrl+S is pressed.
     */
    constructor(schema, {onSave}={}) {
      super(schema);

      /**
       * A function to call when Ctrl+S is pressed.
       * @type {Function}
       */
      Object.defineProperty(this, "onSave", {value: onSave, writable: false});
    }

    /* -------------------------------------------- */

    /** @inheritdoc */
    static build(schema, options={}) {
      const keymaps = new this(schema, options);
      return keymap(keymaps.buildMapping());
    }

    /* -------------------------------------------- */

    /**
     * @callback ProseMirrorCommand
     * @param {EditorState} state               The current editor state.
     * @param {function(Transaction)} dispatch  A function to dispatch a transaction.
     * @param {EditorView} view                 Escape-hatch for when the command needs to interact directly with the UI.
     * @returns {boolean}                       Whether the command has performed any action and consumed the event.
     */

    /**
     * Build keyboard commands for nodes and marks present in the schema.
     * @returns {Object<ProseMirrorCommand>}  An object of keyboard shortcuts to editor functions.
     */
    buildMapping() {
      // TODO: Figure out how to integrate this with our keybindings system.
      const mapping = {};

      // Undo, Redo, Backspace.
      mapping["Mod-z"] = undo;
      mapping["Shift-Mod-z"] = redo;
      mapping["Backspace"] = undoInputRule;

      // ProseMirror-specific block operations.
      mapping["Alt-ArrowUp"] = joinUp;
      mapping["Alt-ArrowDown"] = joinDown;
      mapping["Mod-BracketLeft"] = lift;
      mapping["Escape"] = selectParentNode;

      // Bold.
      if ( "strong" in this.schema.marks ) {
        mapping["Mod-b"] = toggleMark(this.schema.marks.strong);
        mapping["Mod-B"] = toggleMark(this.schema.marks.strong);
      }

      // Italic.
      if ( "em" in this.schema.marks ) {
        mapping["Mod-i"] = toggleMark(this.schema.marks.em);
        mapping["Mod-I"] = toggleMark(this.schema.marks.em);
      }

      // Underline.
      if ( "underline" in this.schema.marks ) {
        mapping["Mod-u"] = toggleMark(this.schema.marks.underline);
        mapping["Mod-U"] = toggleMark(this.schema.marks.underline);
      }

      // Inline code.
      if ( "code" in this.schema.marks ) mapping["Mod-`"] = toggleMark(this.schema.marks.code);

      // Bulleted list.
      if ( "bullet_list" in this.schema.nodes ) mapping["Shift-Mod-8"] = wrapInList(this.schema.nodes.bullet_list);

      // Numbered list.
      if ( "ordered_list" in this.schema.nodes ) mapping["Shift-Mod-9"] = wrapInList(this.schema.nodes.ordered_list);

      // Blockquotes.
      if ( "blockquote" in this.schema.nodes ) mapping["Mod->"] = wrapInList(this.schema.nodes.blockquote);

      // Line breaks.
      if ( "hard_break" in this.schema.nodes ) this.#lineBreakMapping(mapping);

      // Block splitting.
      this.#newLineMapping(mapping);

      // List items.
      if ( "list_item" in this.schema.nodes ) {
        const li = this.schema.nodes.list_item;
        mapping["Shift-Tab"] = liftListItem(li);
        mapping["Tab"] = sinkListItem(li);
      }

      // Paragraphs.
      if ( "paragraph" in this.schema.nodes ) mapping["Shift-Mod-0"] = setBlockType(this.schema.nodes.paragraph);

      // Code blocks.
      if ( "code_block" in this.schema.nodes ) mapping["Shift-Mod-\\"] = setBlockType(this.schema.nodes.code_block);

      // Headings.
      if ( "heading" in this.schema.nodes ) this.#headingsMapping(mapping, 6);

      // Horizontal rules.
      if ( "horizontal_rule" in this.schema.nodes ) this.#horizontalRuleMapping(mapping);

      // Saving.
      if ( this.onSave ) this.#addSaveMapping(mapping);

      return mapping;
    }

    /* -------------------------------------------- */

    /**
     * Implement keyboard commands for heading levels.
     * @param {Object<ProseMirrorCommand>} mapping  The keyboard mapping.
     * @param {number} maxLevel                     The maximum level of headings.
     */
    #headingsMapping(mapping, maxLevel) {
      const h = this.schema.nodes.heading;
      Array.fromRange(maxLevel, 1).forEach(level => mapping[`Shift-Mod-${level}`] = setBlockType(h, {level}));
    }

    /* -------------------------------------------- */

    /**
     * Implement keyboard commands for horizontal rules.
     * @param {Object<ProseMirrorCommand>} mapping  The keyboard mapping.
     */
    #horizontalRuleMapping(mapping) {
      const hr = this.schema.nodes.horizontal_rule;
      mapping["Mod-_"] = (state, dispatch) => {
        dispatch(state.tr.replaceSelectionWith(hr.create()).scrollIntoView());
        return true;
      };
    }

    /* -------------------------------------------- */

    /**
     * Implement line-break keyboard commands.
     * @param {Object<ProseMirrorCommand>} mapping  The keyboard mapping.
     */
    #lineBreakMapping(mapping) {
      const br = this.schema.nodes.hard_break;

      // Exit a code block if we're in one, then create a line-break.
      const cmd = chainCommands(exitCode, (state, dispatch) => {
        dispatch(state.tr.replaceSelectionWith(br.create()).scrollIntoView());
        return true;
      });

      mapping["Mod-Enter"] = cmd;
      mapping["Shift-Enter"] = cmd;
    }

    /* -------------------------------------------- */

    /**
     * Implement some custom logic for how to split special blocks.
     * @param {Object<ProseMirrorCommand>} mapping  The keyboard mapping.
     */
    #newLineMapping(mapping) {
      const cmds = Object.values(this.schema.nodes).reduce((arr, node) => {
        if ( node.split instanceof Function ) arr.push(node.split);
        return arr;
      }, []);
      if ( !cmds.length ) return;
      mapping["Enter"] = cmds.length < 2 ? cmds[0] : chainCommands(...cmds);
    }

    /* -------------------------------------------- */

    /**
     * Implement save shortcut.
     * @param {Object<ProseMirrorCommand>} mapping  The keyboard mapping.
     */
    #addSaveMapping(mapping) {
      mapping["Mod-s"] = () => {
        this.onSave();
        return true;
      };
    }
  }

  class ProseMirrorDropDown {
    /**
     * A class responsible for rendering a menu drop-down.
     * @param {string} title                             The default title.
     * @param {ProseMirrorDropDownEntry[]} items         The configured menu items.
     * @param {object} [options]
     * @param {string} [options.cssClass]                The menu CSS class name. Required if providing an action.
     * @param {string} [options.icon]                    Use an icon for the dropdown rather than a text label.
     * @param {function(MouseEvent)} [options.onAction]  A callback to fire when a menu item is clicked.
     */
    constructor(title, items, {cssClass, icon, onAction}={}) {
      /**
       * The default title for this drop-down.
       * @type {string}
       */
      Object.defineProperty(this, "title", {value: title, writable: false});

      /**
       * The items configured for this drop-down.
       * @type {ProseMirrorDropDownEntry[]}
       */
      Object.defineProperty(this, "items", {value: items, writable: false});
      this.#icon = icon;
      this.#cssClass = cssClass;
      this.#onAction = onAction;
    }

    /* -------------------------------------------- */

    /**
     * The menu CSS class name.
     * @type {string}
     */
    #cssClass;

    /* -------------------------------------------- */

    /**
     * The icon to use instead of a text label, if any.
     * @type {string}
     */
    #icon;

    /* -------------------------------------------- */

    /**
     * The callback to fire when a menu item is clicked.
     * @type {function(MouseEvent)}
     */
    #onAction;

    /* -------------------------------------------- */

    /**
     * Attach event listeners.
     * @param {HTMLMenuElement} html  The root menu element.
     */
    activateListeners(html) {
      if ( !this.#onAction ) return;
      html.querySelectorAll(`.pm-dropdown.${this.#cssClass} li`).forEach(item => {
        item.addEventListener("click", event => {
          this.#onAction(event);
        });
      });
    }

    /* -------------------------------------------- */

    /**
     * Construct the drop-down menu's HTML.
     * @returns {string}  HTML contents as a string.
     */
    render() {

      // Record which dropdown options are currently active
      const activeItems = [];
      this.forEachItem(item => {
        if ( !item.active ) return;
        activeItems.push(item);
      });
      activeItems.sort((a, b) => a.priority - b.priority);
      const activeItem = activeItems.shift();

      // Render the dropdown
      const active = game.i18n.localize(activeItem ? activeItem.title : this.title);
      const items = this.constructor._renderMenu(this.items);
      return `
      <button type="button" class="pm-dropdown ${this.#icon ? "icon" : ""} ${this.#cssClass}">
        ${this.#icon ? this.#icon : `<span>${active}</span>`}
        <i class="fa-solid fa-chevron-down"></i>
        ${items}
      </button>
    `;
    }

    /* -------------------------------------------- */

    /**
     * Recurse through the menu structure and apply a function to each item in it.
     * @param {function(ProseMirrorDropDownEntry):boolean} fn  The function to call on each item. Return false to prevent
     *                                                         iterating over any further items.
     */
    forEachItem(fn) {
      const forEach = items => {
        for ( const item of items ) {
          const result = fn(item);
          if ( result === false ) break;
          if ( item.children?.length ) forEach(item.children);
        }
      };
      forEach(this.items);
    }

    /* -------------------------------------------- */

    /**
     * Render a list of drop-down menu items.
     * @param {ProseMirrorDropDownEntry[]} entries  The menu items.
     * @returns {string}  HTML contents as a string.
     * @protected
     */
    static _renderMenu(entries) {
      const groups = entries.reduce((arr, item) => {
        const group = item.group ?? 0;
        arr[group] ??= [];
        arr[group].push(this._renderMenuItem(item));
        return arr;
      }, []);
      const items = groups.reduce((arr, group) => {
        if ( group?.length ) arr.push(group.join(""));
        return arr;
      }, []);
      return `<ul>${items.join('<li class="divider"></li>')}</ul>`;
    }

    /* -------------------------------------------- */

    /**
     * Render an individual drop-down menu item.
     * @param {ProseMirrorDropDownEntry} item  The menu item.
     * @returns {string}  HTML contents as a string.
     * @protected
     */
    static _renderMenuItem(item) {
      const parts = [`<li data-action="${item.action}" class="${item.class ?? ""}">`];
      parts.push(`<span style="${item.style ?? ""}">${game.i18n.localize(item.title)}</span>`);
      if ( item.active && !item.children?.length ) parts.push('<i class="fa-solid fa-check"></i>');
      if ( item.children?.length ) {
        parts.push('<i class="fa-solid fa-chevron-right"></i>', this._renderMenu(item.children));
      }
      parts.push("</li>");
      return parts.join("");
    }
  }

  // src/index.ts

  // src/tablemap.ts
  var readFromCache;
  var addToCache;
  if (typeof WeakMap != "undefined") {
    let cache = /* @__PURE__ */ new WeakMap();
    readFromCache = (key) => cache.get(key);
    addToCache = (key, value) => {
      cache.set(key, value);
      return value;
    };
  } else {
    const cache = [];
    const cacheSize = 10;
    let cachePos = 0;
    readFromCache = (key) => {
      for (let i = 0; i < cache.length; i += 2)
        if (cache[i] == key)
          return cache[i + 1];
    };
    addToCache = (key, value) => {
      if (cachePos == cacheSize)
        cachePos = 0;
      cache[cachePos++] = key;
      return cache[cachePos++] = value;
    };
  }
  var TableMap = class {
    constructor(width, height, map, problems) {
      this.width = width;
      this.height = height;
      this.map = map;
      this.problems = problems;
    }
    findCell(pos) {
      for (let i = 0; i < this.map.length; i++) {
        const curPos = this.map[i];
        if (curPos != pos)
          continue;
        const left = i % this.width;
        const top = i / this.width | 0;
        let right = left + 1;
        let bottom = top + 1;
        for (let j = 1; right < this.width && this.map[i + j] == curPos; j++) {
          right++;
        }
        for (let j = 1; bottom < this.height && this.map[i + this.width * j] == curPos; j++) {
          bottom++;
        }
        return { left, top, right, bottom };
      }
      throw new RangeError(`No cell with offset ${pos} found`);
    }
    colCount(pos) {
      for (let i = 0; i < this.map.length; i++) {
        if (this.map[i] == pos) {
          return i % this.width;
        }
      }
      throw new RangeError(`No cell with offset ${pos} found`);
    }
    nextCell(pos, axis, dir) {
      const { left, right, top, bottom } = this.findCell(pos);
      if (axis == "horiz") {
        if (dir < 0 ? left == 0 : right == this.width)
          return null;
        return this.map[top * this.width + (dir < 0 ? left - 1 : right)];
      } else {
        if (dir < 0 ? top == 0 : bottom == this.height)
          return null;
        return this.map[left + this.width * (dir < 0 ? top - 1 : bottom)];
      }
    }
    rectBetween(a, b) {
      const {
        left: leftA,
        right: rightA,
        top: topA,
        bottom: bottomA
      } = this.findCell(a);
      const {
        left: leftB,
        right: rightB,
        top: topB,
        bottom: bottomB
      } = this.findCell(b);
      return {
        left: Math.min(leftA, leftB),
        top: Math.min(topA, topB),
        right: Math.max(rightA, rightB),
        bottom: Math.max(bottomA, bottomB)
      };
    }
    cellsInRect(rect) {
      const result = [];
      const seen = {};
      for (let row = rect.top; row < rect.bottom; row++) {
        for (let col = rect.left; col < rect.right; col++) {
          const index = row * this.width + col;
          const pos = this.map[index];
          if (seen[pos])
            continue;
          seen[pos] = true;
          if (col == rect.left && col && this.map[index - 1] == pos || row == rect.top && row && this.map[index - this.width] == pos) {
            continue;
          }
          result.push(pos);
        }
      }
      return result;
    }
    positionAt(row, col, table) {
      for (let i = 0, rowStart = 0; ; i++) {
        const rowEnd = rowStart + table.child(i).nodeSize;
        if (i == row) {
          let index = col + row * this.width;
          const rowEndIndex = (row + 1) * this.width;
          while (index < rowEndIndex && this.map[index] < rowStart)
            index++;
          return index == rowEndIndex ? rowEnd - 1 : this.map[index];
        }
        rowStart = rowEnd;
      }
    }
    static get(table) {
      return readFromCache(table) || addToCache(table, computeMap(table));
    }
  };
  function computeMap(table) {
    if (table.type.spec.tableRole != "table")
      throw new RangeError("Not a table node: " + table.type.name);
    const width = findWidth(table), height = table.childCount;
    const map = [];
    let mapPos = 0;
    let problems = null;
    const colWidths = [];
    for (let i = 0, e = width * height; i < e; i++)
      map[i] = 0;
    for (let row = 0, pos = 0; row < height; row++) {
      const rowNode = table.child(row);
      pos++;
      for (let i = 0; ; i++) {
        while (mapPos < map.length && map[mapPos] != 0)
          mapPos++;
        if (i == rowNode.childCount)
          break;
        const cellNode = rowNode.child(i);
        const { colspan, rowspan, colwidth } = cellNode.attrs;
        for (let h = 0; h < rowspan; h++) {
          if (h + row >= height) {
            (problems || (problems = [])).push({
              type: "overlong_rowspan",
              pos,
              n: rowspan - h
            });
            break;
          }
          const start = mapPos + h * width;
          for (let w = 0; w < colspan; w++) {
            if (map[start + w] == 0)
              map[start + w] = pos;
            else
              (problems || (problems = [])).push({
                type: "collision",
                row,
                pos,
                n: colspan - w
              });
            const colW = colwidth && colwidth[w];
            if (colW) {
              const widthIndex = (start + w) % width * 2, prev = colWidths[widthIndex];
              if (prev == null || prev != colW && colWidths[widthIndex + 1] == 1) {
                colWidths[widthIndex] = colW;
                colWidths[widthIndex + 1] = 1;
              } else if (prev == colW) {
                colWidths[widthIndex + 1]++;
              }
            }
          }
        }
        mapPos += colspan;
        pos += cellNode.nodeSize;
      }
      const expectedPos = (row + 1) * width;
      let missing = 0;
      while (mapPos < expectedPos)
        if (map[mapPos++] == 0)
          missing++;
      if (missing)
        (problems || (problems = [])).push({ type: "missing", row, n: missing });
      pos++;
    }
    const tableMap = new TableMap(width, height, map, problems);
    let badWidths = false;
    for (let i = 0; !badWidths && i < colWidths.length; i += 2)
      if (colWidths[i] != null && colWidths[i + 1] < height)
        badWidths = true;
    if (badWidths)
      findBadColWidths(tableMap, colWidths, table);
    return tableMap;
  }
  function findWidth(table) {
    let width = -1;
    let hasRowSpan = false;
    for (let row = 0; row < table.childCount; row++) {
      const rowNode = table.child(row);
      let rowWidth = 0;
      if (hasRowSpan)
        for (let j = 0; j < row; j++) {
          const prevRow = table.child(j);
          for (let i = 0; i < prevRow.childCount; i++) {
            const cell = prevRow.child(i);
            if (j + cell.attrs.rowspan > row)
              rowWidth += cell.attrs.colspan;
          }
        }
      for (let i = 0; i < rowNode.childCount; i++) {
        const cell = rowNode.child(i);
        rowWidth += cell.attrs.colspan;
        if (cell.attrs.rowspan > 1)
          hasRowSpan = true;
      }
      if (width == -1)
        width = rowWidth;
      else if (width != rowWidth)
        width = Math.max(width, rowWidth);
    }
    return width;
  }
  function findBadColWidths(map, colWidths, table) {
    if (!map.problems)
      map.problems = [];
    const seen = {};
    for (let i = 0; i < map.map.length; i++) {
      const pos = map.map[i];
      if (seen[pos])
        continue;
      seen[pos] = true;
      const node = table.nodeAt(pos);
      if (!node) {
        throw new RangeError(`No cell with offset ${pos} found`);
      }
      let updated = null;
      const attrs = node.attrs;
      for (let j = 0; j < attrs.colspan; j++) {
        const col = (i + j) % map.width;
        const colWidth = colWidths[col * 2];
        if (colWidth != null && (!attrs.colwidth || attrs.colwidth[j] != colWidth))
          (updated || (updated = freshColWidth(attrs)))[j] = colWidth;
      }
      if (updated)
        map.problems.unshift({
          type: "colwidth mismatch",
          pos,
          colwidth: updated
        });
    }
  }
  function freshColWidth(attrs) {
    if (attrs.colwidth)
      return attrs.colwidth.slice();
    const result = [];
    for (let i = 0; i < attrs.colspan; i++)
      result.push(0);
    return result;
  }

  // src/schema.ts
  function getCellAttrs(dom, extraAttrs) {
    if (typeof dom === "string") {
      return {};
    }
    const widthAttr = dom.getAttribute("data-colwidth");
    const widths = widthAttr && /^\d+(,\d+)*$/.test(widthAttr) ? widthAttr.split(",").map((s) => Number(s)) : null;
    const colspan = Number(dom.getAttribute("colspan") || 1);
    const result = {
      colspan,
      rowspan: Number(dom.getAttribute("rowspan") || 1),
      colwidth: widths && widths.length == colspan ? widths : null
    };
    for (const prop in extraAttrs) {
      const getter = extraAttrs[prop].getFromDOM;
      const value = getter && getter(dom);
      if (value != null) {
        result[prop] = value;
      }
    }
    return result;
  }
  function setCellAttrs(node, extraAttrs) {
    const attrs = {};
    if (node.attrs.colspan != 1)
      attrs.colspan = node.attrs.colspan;
    if (node.attrs.rowspan != 1)
      attrs.rowspan = node.attrs.rowspan;
    if (node.attrs.colwidth)
      attrs["data-colwidth"] = node.attrs.colwidth.join(",");
    for (const prop in extraAttrs) {
      const setter = extraAttrs[prop].setDOMAttr;
      if (setter)
        setter(node.attrs[prop], attrs);
    }
    return attrs;
  }
  function tableNodes(options) {
    const extraAttrs = options.cellAttributes || {};
    const cellAttrs = {
      colspan: { default: 1 },
      rowspan: { default: 1 },
      colwidth: { default: null }
    };
    for (const prop in extraAttrs)
      cellAttrs[prop] = { default: extraAttrs[prop].default };
    return {
      table: {
        content: "table_row+",
        tableRole: "table",
        isolating: true,
        group: options.tableGroup,
        parseDOM: [{ tag: "table" }],
        toDOM() {
          return ["table", ["tbody", 0]];
        }
      },
      table_row: {
        content: "(table_cell | table_header)*",
        tableRole: "row",
        parseDOM: [{ tag: "tr" }],
        toDOM() {
          return ["tr", 0];
        }
      },
      table_cell: {
        content: options.cellContent,
        attrs: cellAttrs,
        tableRole: "cell",
        isolating: true,
        parseDOM: [
          { tag: "td", getAttrs: (dom) => getCellAttrs(dom, extraAttrs) }
        ],
        toDOM(node) {
          return ["td", setCellAttrs(node, extraAttrs), 0];
        }
      },
      table_header: {
        content: options.cellContent,
        attrs: cellAttrs,
        tableRole: "header_cell",
        isolating: true,
        parseDOM: [
          { tag: "th", getAttrs: (dom) => getCellAttrs(dom, extraAttrs) }
        ],
        toDOM(node) {
          return ["th", setCellAttrs(node, extraAttrs), 0];
        }
      }
    };
  }
  function tableNodeTypes(schema) {
    let result = schema.cached.tableNodeTypes;
    if (!result) {
      result = schema.cached.tableNodeTypes = {};
      for (const name in schema.nodes) {
        const type = schema.nodes[name], role = type.spec.tableRole;
        if (role)
          result[role] = type;
      }
    }
    return result;
  }

  // src/util.ts
  var tableEditingKey = new PluginKey("selectingCells");
  function cellAround($pos) {
    for (let d = $pos.depth - 1; d > 0; d--)
      if ($pos.node(d).type.spec.tableRole == "row")
        return $pos.node(0).resolve($pos.before(d + 1));
    return null;
  }
  function cellWrapping($pos) {
    for (let d = $pos.depth; d > 0; d--) {
      const role = $pos.node(d).type.spec.tableRole;
      if (role === "cell" || role === "header_cell")
        return $pos.node(d);
    }
    return null;
  }
  function isInTable(state) {
    const $head = state.selection.$head;
    for (let d = $head.depth; d > 0; d--)
      if ($head.node(d).type.spec.tableRole == "row")
        return true;
    return false;
  }
  function selectionCell(state) {
    const sel = state.selection;
    if ("$anchorCell" in sel && sel.$anchorCell) {
      return sel.$anchorCell.pos > sel.$headCell.pos ? sel.$anchorCell : sel.$headCell;
    } else if ("node" in sel && sel.node && sel.node.type.spec.tableRole == "cell") {
      return sel.$anchor;
    }
    const $cell = cellAround(sel.$head) || cellNear(sel.$head);
    if ($cell) {
      return $cell;
    }
    throw new RangeError(`No cell found around position ${sel.head}`);
  }
  function cellNear($pos) {
    for (let after = $pos.nodeAfter, pos = $pos.pos; after; after = after.firstChild, pos++) {
      const role = after.type.spec.tableRole;
      if (role == "cell" || role == "header_cell")
        return $pos.doc.resolve(pos);
    }
    for (let before = $pos.nodeBefore, pos = $pos.pos; before; before = before.lastChild, pos--) {
      const role = before.type.spec.tableRole;
      if (role == "cell" || role == "header_cell")
        return $pos.doc.resolve(pos - before.nodeSize);
    }
  }
  function pointsAtCell($pos) {
    return $pos.parent.type.spec.tableRole == "row" && !!$pos.nodeAfter;
  }
  function moveCellForward($pos) {
    return $pos.node(0).resolve($pos.pos + $pos.nodeAfter.nodeSize);
  }
  function inSameTable($cellA, $cellB) {
    return $cellA.depth == $cellB.depth && $cellA.pos >= $cellB.start(-1) && $cellA.pos <= $cellB.end(-1);
  }
  function findCell($pos) {
    return TableMap.get($pos.node(-1)).findCell($pos.pos - $pos.start(-1));
  }
  function colCount($pos) {
    return TableMap.get($pos.node(-1)).colCount($pos.pos - $pos.start(-1));
  }
  function nextCell($pos, axis, dir) {
    const table = $pos.node(-1);
    const map = TableMap.get(table);
    const tableStart = $pos.start(-1);
    const moved = map.nextCell($pos.pos - tableStart, axis, dir);
    return moved == null ? null : $pos.node(0).resolve(tableStart + moved);
  }
  function removeColSpan(attrs, pos, n = 1) {
    const result = { ...attrs, colspan: attrs.colspan - n };
    if (result.colwidth) {
      result.colwidth = result.colwidth.slice();
      result.colwidth.splice(pos, n);
      if (!result.colwidth.some((w) => w > 0))
        result.colwidth = null;
    }
    return result;
  }
  function addColSpan(attrs, pos, n = 1) {
    const result = { ...attrs, colspan: attrs.colspan + n };
    if (result.colwidth) {
      result.colwidth = result.colwidth.slice();
      for (let i = 0; i < n; i++)
        result.colwidth.splice(pos, 0, 0);
    }
    return result;
  }
  function columnIsHeader(map, table, col) {
    const headerCell = tableNodeTypes(table.type.schema).header_cell;
    for (let row = 0; row < map.height; row++)
      if (table.nodeAt(map.map[col + row * map.width]).type != headerCell)
        return false;
    return true;
  }

  // src/cellselection.ts
  var CellSelection = class extends Selection {
    constructor($anchorCell, $headCell = $anchorCell) {
      const table = $anchorCell.node(-1);
      const map = TableMap.get(table);
      const tableStart = $anchorCell.start(-1);
      const rect = map.rectBetween(
        $anchorCell.pos - tableStart,
        $headCell.pos - tableStart
      );
      const doc = $anchorCell.node(0);
      const cells = map.cellsInRect(rect).filter((p) => p != $headCell.pos - tableStart);
      cells.unshift($headCell.pos - tableStart);
      const ranges = cells.map((pos) => {
        const cell = table.nodeAt(pos);
        if (!cell) {
          throw RangeError(`No cell with offset ${pos} found`);
        }
        const from = tableStart + pos + 1;
        return new SelectionRange(
          doc.resolve(from),
          doc.resolve(from + cell.content.size)
        );
      });
      super(ranges[0].$from, ranges[0].$to, ranges);
      this.$anchorCell = $anchorCell;
      this.$headCell = $headCell;
    }
    map(doc, mapping) {
      const $anchorCell = doc.resolve(mapping.map(this.$anchorCell.pos));
      const $headCell = doc.resolve(mapping.map(this.$headCell.pos));
      if (pointsAtCell($anchorCell) && pointsAtCell($headCell) && inSameTable($anchorCell, $headCell)) {
        const tableChanged = this.$anchorCell.node(-1) != $anchorCell.node(-1);
        if (tableChanged && this.isRowSelection())
          return CellSelection.rowSelection($anchorCell, $headCell);
        else if (tableChanged && this.isColSelection())
          return CellSelection.colSelection($anchorCell, $headCell);
        else
          return new CellSelection($anchorCell, $headCell);
      }
      return TextSelection.between($anchorCell, $headCell);
    }
    content() {
      const table = this.$anchorCell.node(-1);
      const map = TableMap.get(table);
      const tableStart = this.$anchorCell.start(-1);
      const rect = map.rectBetween(
        this.$anchorCell.pos - tableStart,
        this.$headCell.pos - tableStart
      );
      const seen = {};
      const rows = [];
      for (let row = rect.top; row < rect.bottom; row++) {
        const rowContent = [];
        for (let index = row * map.width + rect.left, col = rect.left; col < rect.right; col++, index++) {
          const pos = map.map[index];
          if (seen[pos])
            continue;
          seen[pos] = true;
          const cellRect = map.findCell(pos);
          let cell = table.nodeAt(pos);
          if (!cell) {
            throw RangeError(`No cell with offset ${pos} found`);
          }
          const extraLeft = rect.left - cellRect.left;
          const extraRight = cellRect.right - rect.right;
          if (extraLeft > 0 || extraRight > 0) {
            let attrs = cell.attrs;
            if (extraLeft > 0) {
              attrs = removeColSpan(attrs, 0, extraLeft);
            }
            if (extraRight > 0) {
              attrs = removeColSpan(
                attrs,
                attrs.colspan - extraRight,
                extraRight
              );
            }
            if (cellRect.left < rect.left) {
              cell = cell.type.createAndFill(attrs);
              if (!cell) {
                throw RangeError(
                  `Could not create cell with attrs ${JSON.stringify(attrs)}`
                );
              }
            } else {
              cell = cell.type.create(attrs, cell.content);
            }
          }
          if (cellRect.top < rect.top || cellRect.bottom > rect.bottom) {
            const attrs = {
              ...cell.attrs,
              rowspan: Math.min(cellRect.bottom, rect.bottom) - Math.max(cellRect.top, rect.top)
            };
            if (cellRect.top < rect.top) {
              cell = cell.type.createAndFill(attrs);
            } else {
              cell = cell.type.create(attrs, cell.content);
            }
          }
          rowContent.push(cell);
        }
        rows.push(table.child(row).copy(Fragment.from(rowContent)));
      }
      const fragment = this.isColSelection() && this.isRowSelection() ? table : rows;
      return new Slice(Fragment.from(fragment), 1, 1);
    }
    replace(tr, content = Slice.empty) {
      const mapFrom = tr.steps.length, ranges = this.ranges;
      for (let i = 0; i < ranges.length; i++) {
        const { $from, $to } = ranges[i], mapping = tr.mapping.slice(mapFrom);
        tr.replace(
          mapping.map($from.pos),
          mapping.map($to.pos),
          i ? Slice.empty : content
        );
      }
      const sel = Selection.findFrom(
        tr.doc.resolve(tr.mapping.slice(mapFrom).map(this.to)),
        -1
      );
      if (sel)
        tr.setSelection(sel);
    }
    replaceWith(tr, node) {
      this.replace(tr, new Slice(Fragment.from(node), 0, 0));
    }
    forEachCell(f) {
      const table = this.$anchorCell.node(-1);
      const map = TableMap.get(table);
      const tableStart = this.$anchorCell.start(-1);
      const cells = map.cellsInRect(
        map.rectBetween(
          this.$anchorCell.pos - tableStart,
          this.$headCell.pos - tableStart
        )
      );
      for (let i = 0; i < cells.length; i++) {
        f(table.nodeAt(cells[i]), tableStart + cells[i]);
      }
    }
    isColSelection() {
      const anchorTop = this.$anchorCell.index(-1);
      const headTop = this.$headCell.index(-1);
      if (Math.min(anchorTop, headTop) > 0)
        return false;
      const anchorBottom = anchorTop + this.$anchorCell.nodeAfter.attrs.rowspan;
      const headBottom = headTop + this.$headCell.nodeAfter.attrs.rowspan;
      return Math.max(anchorBottom, headBottom) == this.$headCell.node(-1).childCount;
    }
    static colSelection($anchorCell, $headCell = $anchorCell) {
      const table = $anchorCell.node(-1);
      const map = TableMap.get(table);
      const tableStart = $anchorCell.start(-1);
      const anchorRect = map.findCell($anchorCell.pos - tableStart);
      const headRect = map.findCell($headCell.pos - tableStart);
      const doc = $anchorCell.node(0);
      if (anchorRect.top <= headRect.top) {
        if (anchorRect.top > 0)
          $anchorCell = doc.resolve(tableStart + map.map[anchorRect.left]);
        if (headRect.bottom < map.height)
          $headCell = doc.resolve(
            tableStart + map.map[map.width * (map.height - 1) + headRect.right - 1]
          );
      } else {
        if (headRect.top > 0)
          $headCell = doc.resolve(tableStart + map.map[headRect.left]);
        if (anchorRect.bottom < map.height)
          $anchorCell = doc.resolve(
            tableStart + map.map[map.width * (map.height - 1) + anchorRect.right - 1]
          );
      }
      return new CellSelection($anchorCell, $headCell);
    }
    isRowSelection() {
      const table = this.$anchorCell.node(-1);
      const map = TableMap.get(table);
      const tableStart = this.$anchorCell.start(-1);
      const anchorLeft = map.colCount(this.$anchorCell.pos - tableStart);
      const headLeft = map.colCount(this.$headCell.pos - tableStart);
      if (Math.min(anchorLeft, headLeft) > 0)
        return false;
      const anchorRight = anchorLeft + this.$anchorCell.nodeAfter.attrs.colspan;
      const headRight = headLeft + this.$headCell.nodeAfter.attrs.colspan;
      return Math.max(anchorRight, headRight) == map.width;
    }
    eq(other) {
      return other instanceof CellSelection && other.$anchorCell.pos == this.$anchorCell.pos && other.$headCell.pos == this.$headCell.pos;
    }
    static rowSelection($anchorCell, $headCell = $anchorCell) {
      const table = $anchorCell.node(-1);
      const map = TableMap.get(table);
      const tableStart = $anchorCell.start(-1);
      const anchorRect = map.findCell($anchorCell.pos - tableStart);
      const headRect = map.findCell($headCell.pos - tableStart);
      const doc = $anchorCell.node(0);
      if (anchorRect.left <= headRect.left) {
        if (anchorRect.left > 0)
          $anchorCell = doc.resolve(
            tableStart + map.map[anchorRect.top * map.width]
          );
        if (headRect.right < map.width)
          $headCell = doc.resolve(
            tableStart + map.map[map.width * (headRect.top + 1) - 1]
          );
      } else {
        if (headRect.left > 0)
          $headCell = doc.resolve(tableStart + map.map[headRect.top * map.width]);
        if (anchorRect.right < map.width)
          $anchorCell = doc.resolve(
            tableStart + map.map[map.width * (anchorRect.top + 1) - 1]
          );
      }
      return new CellSelection($anchorCell, $headCell);
    }
    toJSON() {
      return {
        type: "cell",
        anchor: this.$anchorCell.pos,
        head: this.$headCell.pos
      };
    }
    static fromJSON(doc, json) {
      return new CellSelection(doc.resolve(json.anchor), doc.resolve(json.head));
    }
    static create(doc, anchorCell, headCell = anchorCell) {
      return new CellSelection(doc.resolve(anchorCell), doc.resolve(headCell));
    }
    getBookmark() {
      return new CellBookmark(this.$anchorCell.pos, this.$headCell.pos);
    }
  };
  CellSelection.prototype.visible = false;
  Selection.jsonID("cell", CellSelection);
  var CellBookmark = class {
    constructor(anchor, head) {
      this.anchor = anchor;
      this.head = head;
    }
    map(mapping) {
      return new CellBookmark(mapping.map(this.anchor), mapping.map(this.head));
    }
    resolve(doc) {
      const $anchorCell = doc.resolve(this.anchor), $headCell = doc.resolve(this.head);
      if ($anchorCell.parent.type.spec.tableRole == "row" && $headCell.parent.type.spec.tableRole == "row" && $anchorCell.index() < $anchorCell.parent.childCount && $headCell.index() < $headCell.parent.childCount && inSameTable($anchorCell, $headCell))
        return new CellSelection($anchorCell, $headCell);
      else
        return Selection.near($headCell, 1);
    }
  };
  function drawCellSelection(state) {
    if (!(state.selection instanceof CellSelection))
      return null;
    const cells = [];
    state.selection.forEachCell((node, pos) => {
      cells.push(
        Decoration.node(pos, pos + node.nodeSize, { class: "selectedCell" })
      );
    });
    return DecorationSet.create(state.doc, cells);
  }
  function isCellBoundarySelection({ $from, $to }) {
    if ($from.pos == $to.pos || $from.pos < $from.pos - 6)
      return false;
    let afterFrom = $from.pos;
    let beforeTo = $to.pos;
    let depth = $from.depth;
    for (; depth >= 0; depth--, afterFrom++)
      if ($from.after(depth + 1) < $from.end(depth))
        break;
    for (let d = $to.depth; d >= 0; d--, beforeTo--)
      if ($to.before(d + 1) > $to.start(d))
        break;
    return afterFrom == beforeTo && /row|table/.test($from.node(depth).type.spec.tableRole);
  }
  function isTextSelectionAcrossCells({ $from, $to }) {
    let fromCellBoundaryNode;
    let toCellBoundaryNode;
    for (let i = $from.depth; i > 0; i--) {
      const node = $from.node(i);
      if (node.type.spec.tableRole === "cell" || node.type.spec.tableRole === "header_cell") {
        fromCellBoundaryNode = node;
        break;
      }
    }
    for (let i = $to.depth; i > 0; i--) {
      const node = $to.node(i);
      if (node.type.spec.tableRole === "cell" || node.type.spec.tableRole === "header_cell") {
        toCellBoundaryNode = node;
        break;
      }
    }
    return fromCellBoundaryNode !== toCellBoundaryNode && $to.parentOffset === 0;
  }
  function normalizeSelection(state, tr, allowTableNodeSelection) {
    const sel = (tr || state).selection;
    const doc = (tr || state).doc;
    let normalize;
    let role;
    if (sel instanceof NodeSelection && (role = sel.node.type.spec.tableRole)) {
      if (role == "cell" || role == "header_cell") {
        normalize = CellSelection.create(doc, sel.from);
      } else if (role == "row") {
        const $cell = doc.resolve(sel.from + 1);
        normalize = CellSelection.rowSelection($cell, $cell);
      } else if (!allowTableNodeSelection) {
        const map = TableMap.get(sel.node);
        const start = sel.from + 1;
        const lastCell = start + map.map[map.width * map.height - 1];
        normalize = CellSelection.create(doc, start + 1, lastCell);
      }
    } else if (sel instanceof TextSelection && isCellBoundarySelection(sel)) {
      normalize = TextSelection.create(doc, sel.from);
    } else if (sel instanceof TextSelection && isTextSelectionAcrossCells(sel)) {
      normalize = TextSelection.create(doc, sel.$from.start(), sel.$from.end());
    }
    if (normalize)
      (tr || (tr = state.tr)).setSelection(normalize);
    return tr;
  }
  var fixTablesKey = new PluginKey("fix-tables");
  function changedDescendants(old, cur, offset, f) {
    const oldSize = old.childCount, curSize = cur.childCount;
    outer:
      for (let i = 0, j = 0; i < curSize; i++) {
        const child = cur.child(i);
        for (let scan = j, e = Math.min(oldSize, i + 3); scan < e; scan++) {
          if (old.child(scan) == child) {
            j = scan + 1;
            offset += child.nodeSize;
            continue outer;
          }
        }
        f(child, offset);
        if (j < oldSize && old.child(j).sameMarkup(child))
          changedDescendants(old.child(j), child, offset + 1, f);
        else
          child.nodesBetween(0, child.content.size, f, offset + 1);
        offset += child.nodeSize;
      }
  }
  function fixTables(state, oldState) {
    let tr;
    const check = (node, pos) => {
      if (node.type.spec.tableRole == "table")
        tr = fixTable(state, node, pos, tr);
    };
    if (!oldState)
      state.doc.descendants(check);
    else if (oldState.doc != state.doc)
      changedDescendants(oldState.doc, state.doc, 0, check);
    return tr;
  }
  function fixTable(state, table, tablePos, tr) {
    const map = TableMap.get(table);
    if (!map.problems)
      return tr;
    if (!tr)
      tr = state.tr;
    const mustAdd = [];
    for (let i = 0; i < map.height; i++)
      mustAdd.push(0);
    for (let i = 0; i < map.problems.length; i++) {
      const prob = map.problems[i];
      if (prob.type == "collision") {
        const cell = table.nodeAt(prob.pos);
        if (!cell)
          continue;
        const attrs = cell.attrs;
        for (let j = 0; j < attrs.rowspan; j++)
          mustAdd[prob.row + j] += prob.n;
        tr.setNodeMarkup(
          tr.mapping.map(tablePos + 1 + prob.pos),
          null,
          removeColSpan(attrs, attrs.colspan - prob.n, prob.n)
        );
      } else if (prob.type == "missing") {
        mustAdd[prob.row] += prob.n;
      } else if (prob.type == "overlong_rowspan") {
        const cell = table.nodeAt(prob.pos);
        if (!cell)
          continue;
        tr.setNodeMarkup(tr.mapping.map(tablePos + 1 + prob.pos), null, {
          ...cell.attrs,
          rowspan: cell.attrs.rowspan - prob.n
        });
      } else if (prob.type == "colwidth mismatch") {
        const cell = table.nodeAt(prob.pos);
        if (!cell)
          continue;
        tr.setNodeMarkup(tr.mapping.map(tablePos + 1 + prob.pos), null, {
          ...cell.attrs,
          colwidth: prob.colwidth
        });
      }
    }
    let first, last;
    for (let i = 0; i < mustAdd.length; i++)
      if (mustAdd[i]) {
        if (first == null)
          first = i;
        last = i;
      }
    for (let i = 0, pos = tablePos + 1; i < map.height; i++) {
      const row = table.child(i);
      const end = pos + row.nodeSize;
      const add = mustAdd[i];
      if (add > 0) {
        let role = "cell";
        if (row.firstChild) {
          role = row.firstChild.type.spec.tableRole;
        }
        const nodes = [];
        for (let j = 0; j < add; j++) {
          const node = tableNodeTypes(state.schema)[role].createAndFill();
          if (node)
            nodes.push(node);
        }
        const side = (i == 0 || first == i - 1) && last == i ? pos + 1 : end - 1;
        tr.insert(tr.mapping.map(side), nodes);
      }
      pos = end;
    }
    return tr.setMeta(fixTablesKey, { fixTables: true });
  }
  function pastedCells(slice) {
    if (!slice.size)
      return null;
    let { content, openStart, openEnd } = slice;
    while (content.childCount == 1 && (openStart > 0 && openEnd > 0 || content.child(0).type.spec.tableRole == "table")) {
      openStart--;
      openEnd--;
      content = content.child(0).content;
    }
    const first = content.child(0);
    const role = first.type.spec.tableRole;
    const schema = first.type.schema, rows = [];
    if (role == "row") {
      for (let i = 0; i < content.childCount; i++) {
        let cells = content.child(i).content;
        const left = i ? 0 : Math.max(0, openStart - 1);
        const right = i < content.childCount - 1 ? 0 : Math.max(0, openEnd - 1);
        if (left || right)
          cells = fitSlice(
            tableNodeTypes(schema).row,
            new Slice(cells, left, right)
          ).content;
        rows.push(cells);
      }
    } else if (role == "cell" || role == "header_cell") {
      rows.push(
        openStart || openEnd ? fitSlice(
          tableNodeTypes(schema).row,
          new Slice(content, openStart, openEnd)
        ).content : content
      );
    } else {
      return null;
    }
    return ensureRectangular(schema, rows);
  }
  function ensureRectangular(schema, rows) {
    const widths = [];
    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      for (let j = row.childCount - 1; j >= 0; j--) {
        const { rowspan, colspan } = row.child(j).attrs;
        for (let r = i; r < i + rowspan; r++)
          widths[r] = (widths[r] || 0) + colspan;
      }
    }
    let width = 0;
    for (let r = 0; r < widths.length; r++)
      width = Math.max(width, widths[r]);
    for (let r = 0; r < widths.length; r++) {
      if (r >= rows.length)
        rows.push(Fragment.empty);
      if (widths[r] < width) {
        const empty = tableNodeTypes(schema).cell.createAndFill();
        const cells = [];
        for (let i = widths[r]; i < width; i++) {
          cells.push(empty);
        }
        rows[r] = rows[r].append(Fragment.from(cells));
      }
    }
    return { height: rows.length, width, rows };
  }
  function fitSlice(nodeType, slice) {
    const node = nodeType.createAndFill();
    const tr = new Transform(node).replace(0, node.content.size, slice);
    return tr.doc;
  }
  function clipCells({ width, height, rows }, newWidth, newHeight) {
    if (width != newWidth) {
      const added = [];
      const newRows = [];
      for (let row = 0; row < rows.length; row++) {
        const frag = rows[row], cells = [];
        for (let col = added[row] || 0, i = 0; col < newWidth; i++) {
          let cell = frag.child(i % frag.childCount);
          if (col + cell.attrs.colspan > newWidth)
            cell = cell.type.createChecked(
              removeColSpan(
                cell.attrs,
                cell.attrs.colspan,
                col + cell.attrs.colspan - newWidth
              ),
              cell.content
            );
          cells.push(cell);
          col += cell.attrs.colspan;
          for (let j = 1; j < cell.attrs.rowspan; j++)
            added[row + j] = (added[row + j] || 0) + cell.attrs.colspan;
        }
        newRows.push(Fragment.from(cells));
      }
      rows = newRows;
      width = newWidth;
    }
    if (height != newHeight) {
      const newRows = [];
      for (let row = 0, i = 0; row < newHeight; row++, i++) {
        const cells = [], source = rows[i % height];
        for (let j = 0; j < source.childCount; j++) {
          let cell = source.child(j);
          if (row + cell.attrs.rowspan > newHeight)
            cell = cell.type.create(
              {
                ...cell.attrs,
                rowspan: Math.max(1, newHeight - cell.attrs.rowspan)
              },
              cell.content
            );
          cells.push(cell);
        }
        newRows.push(Fragment.from(cells));
      }
      rows = newRows;
      height = newHeight;
    }
    return { width, height, rows };
  }
  function growTable(tr, map, table, start, width, height, mapFrom) {
    const schema = tr.doc.type.schema;
    const types = tableNodeTypes(schema);
    let empty;
    let emptyHead;
    if (width > map.width) {
      for (let row = 0, rowEnd = 0; row < map.height; row++) {
        const rowNode = table.child(row);
        rowEnd += rowNode.nodeSize;
        const cells = [];
        let add;
        if (rowNode.lastChild == null || rowNode.lastChild.type == types.cell)
          add = empty || (empty = types.cell.createAndFill());
        else
          add = emptyHead || (emptyHead = types.header_cell.createAndFill());
        for (let i = map.width; i < width; i++)
          cells.push(add);
        tr.insert(tr.mapping.slice(mapFrom).map(rowEnd - 1 + start), cells);
      }
    }
    if (height > map.height) {
      const cells = [];
      for (let i = 0, start2 = (map.height - 1) * map.width; i < Math.max(map.width, width); i++) {
        const header = i >= map.width ? false : table.nodeAt(map.map[start2 + i]).type == types.header_cell;
        cells.push(
          header ? emptyHead || (emptyHead = types.header_cell.createAndFill()) : empty || (empty = types.cell.createAndFill())
        );
      }
      const emptyRow = types.row.create(null, Fragment.from(cells)), rows = [];
      for (let i = map.height; i < height; i++)
        rows.push(emptyRow);
      tr.insert(tr.mapping.slice(mapFrom).map(start + table.nodeSize - 2), rows);
    }
    return !!(empty || emptyHead);
  }
  function isolateHorizontal(tr, map, table, start, left, right, top, mapFrom) {
    if (top == 0 || top == map.height)
      return false;
    let found = false;
    for (let col = left; col < right; col++) {
      const index = top * map.width + col, pos = map.map[index];
      if (map.map[index - map.width] == pos) {
        found = true;
        const cell = table.nodeAt(pos);
        const { top: cellTop, left: cellLeft } = map.findCell(pos);
        tr.setNodeMarkup(tr.mapping.slice(mapFrom).map(pos + start), null, {
          ...cell.attrs,
          rowspan: top - cellTop
        });
        tr.insert(
          tr.mapping.slice(mapFrom).map(map.positionAt(top, cellLeft, table)),
          cell.type.createAndFill({
            ...cell.attrs,
            rowspan: cellTop + cell.attrs.rowspan - top
          })
        );
        col += cell.attrs.colspan - 1;
      }
    }
    return found;
  }
  function isolateVertical(tr, map, table, start, top, bottom, left, mapFrom) {
    if (left == 0 || left == map.width)
      return false;
    let found = false;
    for (let row = top; row < bottom; row++) {
      const index = row * map.width + left, pos = map.map[index];
      if (map.map[index - 1] == pos) {
        found = true;
        const cell = table.nodeAt(pos);
        const cellLeft = map.colCount(pos);
        const updatePos = tr.mapping.slice(mapFrom).map(pos + start);
        tr.setNodeMarkup(
          updatePos,
          null,
          removeColSpan(
            cell.attrs,
            left - cellLeft,
            cell.attrs.colspan - (left - cellLeft)
          )
        );
        tr.insert(
          updatePos + cell.nodeSize,
          cell.type.createAndFill(
            removeColSpan(cell.attrs, 0, left - cellLeft)
          )
        );
        row += cell.attrs.rowspan - 1;
      }
    }
    return found;
  }
  function insertCells(state, dispatch, tableStart, rect, cells) {
    let table = tableStart ? state.doc.nodeAt(tableStart - 1) : state.doc;
    if (!table) {
      throw new Error("No table found");
    }
    let map = TableMap.get(table);
    const { top, left } = rect;
    const right = left + cells.width, bottom = top + cells.height;
    const tr = state.tr;
    let mapFrom = 0;
    function recomp() {
      table = tableStart ? tr.doc.nodeAt(tableStart - 1) : tr.doc;
      if (!table) {
        throw new Error("No table found");
      }
      map = TableMap.get(table);
      mapFrom = tr.mapping.maps.length;
    }
    if (growTable(tr, map, table, tableStart, right, bottom, mapFrom))
      recomp();
    if (isolateHorizontal(tr, map, table, tableStart, left, right, top, mapFrom))
      recomp();
    if (isolateHorizontal(tr, map, table, tableStart, left, right, bottom, mapFrom))
      recomp();
    if (isolateVertical(tr, map, table, tableStart, top, bottom, left, mapFrom))
      recomp();
    if (isolateVertical(tr, map, table, tableStart, top, bottom, right, mapFrom))
      recomp();
    for (let row = top; row < bottom; row++) {
      const from = map.positionAt(row, left, table), to = map.positionAt(row, right, table);
      tr.replace(
        tr.mapping.slice(mapFrom).map(from + tableStart),
        tr.mapping.slice(mapFrom).map(to + tableStart),
        new Slice(cells.rows[row - top], 0, 0)
      );
    }
    recomp();
    tr.setSelection(
      new CellSelection(
        tr.doc.resolve(tableStart + map.positionAt(top, left, table)),
        tr.doc.resolve(tableStart + map.positionAt(bottom - 1, right - 1, table))
      )
    );
    dispatch(tr);
  }

  // src/input.ts
  var handleKeyDown = keydownHandler({
    ArrowLeft: arrow("horiz", -1),
    ArrowRight: arrow("horiz", 1),
    ArrowUp: arrow("vert", -1),
    ArrowDown: arrow("vert", 1),
    "Shift-ArrowLeft": shiftArrow("horiz", -1),
    "Shift-ArrowRight": shiftArrow("horiz", 1),
    "Shift-ArrowUp": shiftArrow("vert", -1),
    "Shift-ArrowDown": shiftArrow("vert", 1),
    Backspace: deleteCellSelection,
    "Mod-Backspace": deleteCellSelection,
    Delete: deleteCellSelection,
    "Mod-Delete": deleteCellSelection
  });
  function maybeSetSelection(state, dispatch, selection) {
    if (selection.eq(state.selection))
      return false;
    if (dispatch)
      dispatch(state.tr.setSelection(selection).scrollIntoView());
    return true;
  }
  function arrow(axis, dir) {
    return (state, dispatch, view) => {
      if (!view)
        return false;
      const sel = state.selection;
      if (sel instanceof CellSelection) {
        return maybeSetSelection(
          state,
          dispatch,
          Selection.near(sel.$headCell, dir)
        );
      }
      if (axis != "horiz" && !sel.empty)
        return false;
      const end = atEndOfCell(view, axis, dir);
      if (end == null)
        return false;
      if (axis == "horiz") {
        return maybeSetSelection(
          state,
          dispatch,
          Selection.near(state.doc.resolve(sel.head + dir), dir)
        );
      } else {
        const $cell = state.doc.resolve(end);
        const $next = nextCell($cell, axis, dir);
        let newSel;
        if ($next)
          newSel = Selection.near($next, 1);
        else if (dir < 0)
          newSel = Selection.near(state.doc.resolve($cell.before(-1)), -1);
        else
          newSel = Selection.near(state.doc.resolve($cell.after(-1)), 1);
        return maybeSetSelection(state, dispatch, newSel);
      }
    };
  }
  function shiftArrow(axis, dir) {
    return (state, dispatch, view) => {
      if (!view)
        return false;
      const sel = state.selection;
      let cellSel;
      if (sel instanceof CellSelection) {
        cellSel = sel;
      } else {
        const end = atEndOfCell(view, axis, dir);
        if (end == null)
          return false;
        cellSel = new CellSelection(state.doc.resolve(end));
      }
      const $head = nextCell(cellSel.$headCell, axis, dir);
      if (!$head)
        return false;
      return maybeSetSelection(
        state,
        dispatch,
        new CellSelection(cellSel.$anchorCell, $head)
      );
    };
  }
  function deleteCellSelection(state, dispatch) {
    const sel = state.selection;
    if (!(sel instanceof CellSelection))
      return false;
    if (dispatch) {
      const tr = state.tr;
      const baseContent = tableNodeTypes(state.schema).cell.createAndFill().content;
      sel.forEachCell((cell, pos) => {
        if (!cell.content.eq(baseContent))
          tr.replace(
            tr.mapping.map(pos + 1),
            tr.mapping.map(pos + cell.nodeSize - 1),
            new Slice(baseContent, 0, 0)
          );
      });
      if (tr.docChanged)
        dispatch(tr);
    }
    return true;
  }
  function handleTripleClick(view, pos) {
    const doc = view.state.doc, $cell = cellAround(doc.resolve(pos));
    if (!$cell)
      return false;
    view.dispatch(view.state.tr.setSelection(new CellSelection($cell)));
    return true;
  }
  function handlePaste(view, _, slice) {
    if (!isInTable(view.state))
      return false;
    let cells = pastedCells(slice);
    const sel = view.state.selection;
    if (sel instanceof CellSelection) {
      if (!cells)
        cells = {
          width: 1,
          height: 1,
          rows: [
            Fragment.from(
              fitSlice(tableNodeTypes(view.state.schema).cell, slice)
            )
          ]
        };
      const table = sel.$anchorCell.node(-1);
      const start = sel.$anchorCell.start(-1);
      const rect = TableMap.get(table).rectBetween(
        sel.$anchorCell.pos - start,
        sel.$headCell.pos - start
      );
      cells = clipCells(cells, rect.right - rect.left, rect.bottom - rect.top);
      insertCells(view.state, view.dispatch, start, rect, cells);
      return true;
    } else if (cells) {
      const $cell = selectionCell(view.state);
      const start = $cell.start(-1);
      insertCells(
        view.state,
        view.dispatch,
        start,
        TableMap.get($cell.node(-1)).findCell($cell.pos - start),
        cells
      );
      return true;
    } else {
      return false;
    }
  }
  function handleMouseDown(view, startEvent) {
    var _a;
    if (startEvent.ctrlKey || startEvent.metaKey)
      return;
    const startDOMCell = domInCell(view, startEvent.target);
    let $anchor;
    if (startEvent.shiftKey && view.state.selection instanceof CellSelection) {
      setCellSelection(view.state.selection.$anchorCell, startEvent);
      startEvent.preventDefault();
    } else if (startEvent.shiftKey && startDOMCell && ($anchor = cellAround(view.state.selection.$anchor)) != null && ((_a = cellUnderMouse(view, startEvent)) == null ? void 0 : _a.pos) != $anchor.pos) {
      setCellSelection($anchor, startEvent);
      startEvent.preventDefault();
    } else if (!startDOMCell) {
      return;
    }
    function setCellSelection($anchor2, event) {
      let $head = cellUnderMouse(view, event);
      const starting = tableEditingKey.getState(view.state) == null;
      if (!$head || !inSameTable($anchor2, $head)) {
        if (starting)
          $head = $anchor2;
        else
          return;
      }
      const selection = new CellSelection($anchor2, $head);
      if (starting || !view.state.selection.eq(selection)) {
        const tr = view.state.tr.setSelection(selection);
        if (starting)
          tr.setMeta(tableEditingKey, $anchor2.pos);
        view.dispatch(tr);
      }
    }
    function stop() {
      view.root.removeEventListener("mouseup", stop);
      view.root.removeEventListener("dragstart", stop);
      view.root.removeEventListener("mousemove", move);
      if (tableEditingKey.getState(view.state) != null)
        view.dispatch(view.state.tr.setMeta(tableEditingKey, -1));
    }
    function move(_event) {
      const event = _event;
      const anchor = tableEditingKey.getState(view.state);
      let $anchor2;
      if (anchor != null) {
        $anchor2 = view.state.doc.resolve(anchor);
      } else if (domInCell(view, event.target) != startDOMCell) {
        $anchor2 = cellUnderMouse(view, startEvent);
        if (!$anchor2)
          return stop();
      }
      if ($anchor2)
        setCellSelection($anchor2, event);
    }
    view.root.addEventListener("mouseup", stop);
    view.root.addEventListener("dragstart", stop);
    view.root.addEventListener("mousemove", move);
  }
  function atEndOfCell(view, axis, dir) {
    if (!(view.state.selection instanceof TextSelection))
      return null;
    const { $head } = view.state.selection;
    for (let d = $head.depth - 1; d >= 0; d--) {
      const parent = $head.node(d), index = dir < 0 ? $head.index(d) : $head.indexAfter(d);
      if (index != (dir < 0 ? 0 : parent.childCount))
        return null;
      if (parent.type.spec.tableRole == "cell" || parent.type.spec.tableRole == "header_cell") {
        const cellPos = $head.before(d);
        const dirStr = axis == "vert" ? dir > 0 ? "down" : "up" : dir > 0 ? "right" : "left";
        return view.endOfTextblock(dirStr) ? cellPos : null;
      }
    }
    return null;
  }
  function domInCell(view, dom) {
    for (; dom && dom != view.dom; dom = dom.parentNode) {
      if (dom.nodeName == "TD" || dom.nodeName == "TH") {
        return dom;
      }
    }
    return null;
  }
  function cellUnderMouse(view, event) {
    const mousePos = view.posAtCoords({
      left: event.clientX,
      top: event.clientY
    });
    if (!mousePos)
      return null;
    return mousePos ? cellAround(view.state.doc.resolve(mousePos.pos)) : null;
  }

  // src/tableview.ts
  var TableView = class {
    constructor(node, cellMinWidth) {
      this.node = node;
      this.cellMinWidth = cellMinWidth;
      this.dom = document.createElement("div");
      this.dom.className = "tableWrapper";
      this.table = this.dom.appendChild(document.createElement("table"));
      this.colgroup = this.table.appendChild(document.createElement("colgroup"));
      updateColumnsOnResize(node, this.colgroup, this.table, cellMinWidth);
      this.contentDOM = this.table.appendChild(document.createElement("tbody"));
    }
    update(node) {
      if (node.type != this.node.type)
        return false;
      this.node = node;
      updateColumnsOnResize(node, this.colgroup, this.table, this.cellMinWidth);
      return true;
    }
    ignoreMutation(record) {
      return record.type == "attributes" && (record.target == this.table || this.colgroup.contains(record.target));
    }
  };
  function updateColumnsOnResize(node, colgroup, table, cellMinWidth, overrideCol, overrideValue) {
    var _a;
    let totalWidth = 0;
    let fixedWidth = true;
    let nextDOM = colgroup.firstChild;
    const row = node.firstChild;
    if (!row)
      return;
    for (let i = 0, col = 0; i < row.childCount; i++) {
      const { colspan, colwidth } = row.child(i).attrs;
      for (let j = 0; j < colspan; j++, col++) {
        const hasWidth = overrideCol == col ? overrideValue : colwidth && colwidth[j];
        const cssWidth = hasWidth ? hasWidth + "px" : "";
        totalWidth += hasWidth || cellMinWidth;
        if (!hasWidth)
          fixedWidth = false;
        if (!nextDOM) {
          colgroup.appendChild(document.createElement("col")).style.width = cssWidth;
        } else {
          if (nextDOM.style.width != cssWidth)
            nextDOM.style.width = cssWidth;
          nextDOM = nextDOM.nextSibling;
        }
      }
    }
    while (nextDOM) {
      const after = nextDOM.nextSibling;
      (_a = nextDOM.parentNode) == null ? void 0 : _a.removeChild(nextDOM);
      nextDOM = after;
    }
    if (fixedWidth) {
      table.style.width = totalWidth + "px";
      table.style.minWidth = "";
    } else {
      table.style.width = "";
      table.style.minWidth = totalWidth + "px";
    }
  }

  // src/columnresizing.ts
  var columnResizingPluginKey = new PluginKey(
    "tableColumnResizing"
  );
  function columnResizing({
    handleWidth = 5,
    cellMinWidth = 25,
    View = TableView,
    lastColumnResizable = true
  } = {}) {
    const plugin = new Plugin({
      key: columnResizingPluginKey,
      state: {
        init(_, state) {
          plugin.spec.props.nodeViews[tableNodeTypes(state.schema).table.name] = (node, view) => new View(node, cellMinWidth, view);
          return new ResizeState(-1, false);
        },
        apply(tr, prev) {
          return prev.apply(tr);
        }
      },
      props: {
        attributes: (state) => {
          const pluginState = columnResizingPluginKey.getState(state);
          return pluginState && pluginState.activeHandle > -1 ? { class: "resize-cursor" } : {};
        },
        handleDOMEvents: {
          mousemove: (view, event) => {
            handleMouseMove(
              view,
              event,
              handleWidth,
              cellMinWidth,
              lastColumnResizable
            );
          },
          mouseleave: (view) => {
            handleMouseLeave(view);
          },
          mousedown: (view, event) => {
            handleMouseDown2(view, event, cellMinWidth);
          }
        },
        decorations: (state) => {
          const pluginState = columnResizingPluginKey.getState(state);
          if (pluginState && pluginState.activeHandle > -1) {
            return handleDecorations(state, pluginState.activeHandle);
          }
        },
        nodeViews: {}
      }
    });
    return plugin;
  }
  var ResizeState = class {
    constructor(activeHandle, dragging) {
      this.activeHandle = activeHandle;
      this.dragging = dragging;
    }
    apply(tr) {
      const state = this;
      const action = tr.getMeta(columnResizingPluginKey);
      if (action && action.setHandle != null)
        return new ResizeState(action.setHandle, false);
      if (action && action.setDragging !== void 0)
        return new ResizeState(state.activeHandle, action.setDragging);
      if (state.activeHandle > -1 && tr.docChanged) {
        let handle = tr.mapping.map(state.activeHandle, -1);
        if (!pointsAtCell(tr.doc.resolve(handle))) {
          handle = -1;
        }
        return new ResizeState(handle, state.dragging);
      }
      return state;
    }
  };
  function handleMouseMove(view, event, handleWidth, cellMinWidth, lastColumnResizable) {
    const pluginState = columnResizingPluginKey.getState(view.state);
    if (!pluginState)
      return;
    if (!pluginState.dragging) {
      const target = domCellAround(event.target);
      let cell = -1;
      if (target) {
        const { left, right } = target.getBoundingClientRect();
        if (event.clientX - left <= handleWidth)
          cell = edgeCell(view, event, "left");
        else if (right - event.clientX <= handleWidth)
          cell = edgeCell(view, event, "right");
      }
      if (cell != pluginState.activeHandle) {
        if (!lastColumnResizable && cell !== -1) {
          const $cell = view.state.doc.resolve(cell);
          const table = $cell.node(-1);
          const map = TableMap.get(table);
          const tableStart = $cell.start(-1);
          const col = map.colCount($cell.pos - tableStart) + $cell.nodeAfter.attrs.colspan - 1;
          if (col == map.width - 1) {
            return;
          }
        }
        updateHandle(view, cell);
      }
    }
  }
  function handleMouseLeave(view) {
    const pluginState = columnResizingPluginKey.getState(view.state);
    if (pluginState && pluginState.activeHandle > -1 && !pluginState.dragging)
      updateHandle(view, -1);
  }
  function handleMouseDown2(view, event, cellMinWidth) {
    const pluginState = columnResizingPluginKey.getState(view.state);
    if (!pluginState || pluginState.activeHandle == -1 || pluginState.dragging)
      return false;
    const cell = view.state.doc.nodeAt(pluginState.activeHandle);
    const width = currentColWidth(view, pluginState.activeHandle, cell.attrs);
    view.dispatch(
      view.state.tr.setMeta(columnResizingPluginKey, {
        setDragging: { startX: event.clientX, startWidth: width }
      })
    );
    function finish(event2) {
      window.removeEventListener("mouseup", finish);
      window.removeEventListener("mousemove", move);
      const pluginState2 = columnResizingPluginKey.getState(view.state);
      if (pluginState2 == null ? void 0 : pluginState2.dragging) {
        updateColumnWidth(
          view,
          pluginState2.activeHandle,
          draggedWidth(pluginState2.dragging, event2, cellMinWidth)
        );
        view.dispatch(
          view.state.tr.setMeta(columnResizingPluginKey, { setDragging: null })
        );
      }
    }
    function move(event2) {
      if (!event2.which)
        return finish(event2);
      const pluginState2 = columnResizingPluginKey.getState(view.state);
      if (!pluginState2)
        return;
      if (pluginState2.dragging) {
        const dragged = draggedWidth(pluginState2.dragging, event2, cellMinWidth);
        displayColumnWidth(view, pluginState2.activeHandle, dragged, cellMinWidth);
      }
    }
    window.addEventListener("mouseup", finish);
    window.addEventListener("mousemove", move);
    event.preventDefault();
    return true;
  }
  function currentColWidth(view, cellPos, { colspan, colwidth }) {
    const width = colwidth && colwidth[colwidth.length - 1];
    if (width)
      return width;
    const dom = view.domAtPos(cellPos);
    const node = dom.node.childNodes[dom.offset];
    let domWidth = node.offsetWidth, parts = colspan;
    if (colwidth) {
      for (let i = 0; i < colspan; i++)
        if (colwidth[i]) {
          domWidth -= colwidth[i];
          parts--;
        }
    }
    return domWidth / parts;
  }
  function domCellAround(target) {
    while (target && target.nodeName != "TD" && target.nodeName != "TH")
      target = target.classList && target.classList.contains("ProseMirror") ? null : target.parentNode;
    return target;
  }
  function edgeCell(view, event, side) {
    const found = view.posAtCoords({ left: event.clientX, top: event.clientY });
    if (!found)
      return -1;
    const { pos } = found;
    const $cell = cellAround(view.state.doc.resolve(pos));
    if (!$cell)
      return -1;
    if (side == "right")
      return $cell.pos;
    const map = TableMap.get($cell.node(-1)), start = $cell.start(-1);
    const index = map.map.indexOf($cell.pos - start);
    return index % map.width == 0 ? -1 : start + map.map[index - 1];
  }
  function draggedWidth(dragging, event, cellMinWidth) {
    const offset = event.clientX - dragging.startX;
    return Math.max(cellMinWidth, dragging.startWidth + offset);
  }
  function updateHandle(view, value) {
    view.dispatch(
      view.state.tr.setMeta(columnResizingPluginKey, { setHandle: value })
    );
  }
  function updateColumnWidth(view, cell, width) {
    const $cell = view.state.doc.resolve(cell);
    const table = $cell.node(-1), map = TableMap.get(table), start = $cell.start(-1);
    const col = map.colCount($cell.pos - start) + $cell.nodeAfter.attrs.colspan - 1;
    const tr = view.state.tr;
    for (let row = 0; row < map.height; row++) {
      const mapIndex = row * map.width + col;
      if (row && map.map[mapIndex] == map.map[mapIndex - map.width])
        continue;
      const pos = map.map[mapIndex];
      const attrs = table.nodeAt(pos).attrs;
      const index = attrs.colspan == 1 ? 0 : col - map.colCount(pos);
      if (attrs.colwidth && attrs.colwidth[index] == width)
        continue;
      const colwidth = attrs.colwidth ? attrs.colwidth.slice() : zeroes(attrs.colspan);
      colwidth[index] = width;
      tr.setNodeMarkup(start + pos, null, { ...attrs, colwidth });
    }
    if (tr.docChanged)
      view.dispatch(tr);
  }
  function displayColumnWidth(view, cell, width, cellMinWidth) {
    const $cell = view.state.doc.resolve(cell);
    const table = $cell.node(-1), start = $cell.start(-1);
    const col = TableMap.get(table).colCount($cell.pos - start) + $cell.nodeAfter.attrs.colspan - 1;
    let dom = view.domAtPos($cell.start(-1)).node;
    while (dom && dom.nodeName != "TABLE") {
      dom = dom.parentNode;
    }
    if (!dom)
      return;
    updateColumnsOnResize(
      table,
      dom.firstChild,
      dom,
      cellMinWidth,
      col,
      width
    );
  }
  function zeroes(n) {
    return Array(n).fill(0);
  }
  function handleDecorations(state, cell) {
    const decorations = [];
    const $cell = state.doc.resolve(cell);
    const table = $cell.node(-1);
    if (!table) {
      return DecorationSet.empty;
    }
    const map = TableMap.get(table);
    const start = $cell.start(-1);
    const col = map.colCount($cell.pos - start) + $cell.nodeAfter.attrs.colspan;
    for (let row = 0; row < map.height; row++) {
      const index = col + row * map.width - 1;
      if ((col == map.width || map.map[index] != map.map[index + 1]) && (row == 0 || map.map[index - 1] != map.map[index - 1 - map.width])) {
        const cellPos = map.map[index];
        const pos = start + cellPos + table.nodeAt(cellPos).nodeSize - 1;
        const dom = document.createElement("div");
        dom.className = "column-resize-handle";
        decorations.push(Decoration.widget(pos, dom));
      }
    }
    return DecorationSet.create(state.doc, decorations);
  }
  function selectedRect(state) {
    const sel = state.selection;
    const $pos = selectionCell(state);
    const table = $pos.node(-1);
    const tableStart = $pos.start(-1);
    const map = TableMap.get(table);
    const rect = sel instanceof CellSelection ? map.rectBetween(
      sel.$anchorCell.pos - tableStart,
      sel.$headCell.pos - tableStart
    ) : map.findCell($pos.pos - tableStart);
    return { ...rect, tableStart, map, table };
  }
  function addColumn(tr, { map, tableStart, table }, col) {
    let refColumn = col > 0 ? -1 : 0;
    if (columnIsHeader(map, table, col + refColumn)) {
      refColumn = col == 0 || col == map.width ? null : 0;
    }
    for (let row = 0; row < map.height; row++) {
      const index = row * map.width + col;
      if (col > 0 && col < map.width && map.map[index - 1] == map.map[index]) {
        const pos = map.map[index];
        const cell = table.nodeAt(pos);
        tr.setNodeMarkup(
          tr.mapping.map(tableStart + pos),
          null,
          addColSpan(cell.attrs, col - map.colCount(pos))
        );
        row += cell.attrs.rowspan - 1;
      } else {
        const type = refColumn == null ? tableNodeTypes(table.type.schema).cell : table.nodeAt(map.map[index + refColumn]).type;
        const pos = map.positionAt(row, col, table);
        tr.insert(tr.mapping.map(tableStart + pos), type.createAndFill());
      }
    }
    return tr;
  }
  function addColumnBefore(state, dispatch) {
    if (!isInTable(state))
      return false;
    if (dispatch) {
      const rect = selectedRect(state);
      dispatch(addColumn(state.tr, rect, rect.left));
    }
    return true;
  }
  function addColumnAfter(state, dispatch) {
    if (!isInTable(state))
      return false;
    if (dispatch) {
      const rect = selectedRect(state);
      dispatch(addColumn(state.tr, rect, rect.right));
    }
    return true;
  }
  function removeColumn(tr, { map, table, tableStart }, col) {
    const mapStart = tr.mapping.maps.length;
    for (let row = 0; row < map.height; ) {
      const index = row * map.width + col;
      const pos = map.map[index];
      const cell = table.nodeAt(pos);
      const attrs = cell.attrs;
      if (col > 0 && map.map[index - 1] == pos || col < map.width - 1 && map.map[index + 1] == pos) {
        tr.setNodeMarkup(
          tr.mapping.slice(mapStart).map(tableStart + pos),
          null,
          removeColSpan(attrs, col - map.colCount(pos))
        );
      } else {
        const start = tr.mapping.slice(mapStart).map(tableStart + pos);
        tr.delete(start, start + cell.nodeSize);
      }
      row += attrs.rowspan;
    }
  }
  function deleteColumn(state, dispatch) {
    if (!isInTable(state))
      return false;
    if (dispatch) {
      const rect = selectedRect(state);
      const tr = state.tr;
      if (rect.left == 0 && rect.right == rect.map.width)
        return false;
      for (let i = rect.right - 1; ; i--) {
        removeColumn(tr, rect, i);
        if (i == rect.left)
          break;
        const table = rect.tableStart ? tr.doc.nodeAt(rect.tableStart - 1) : tr.doc;
        if (!table) {
          throw RangeError("No table found");
        }
        rect.table = table;
        rect.map = TableMap.get(table);
      }
      dispatch(tr);
    }
    return true;
  }
  function rowIsHeader(map, table, row) {
    var _a;
    const headerCell = tableNodeTypes(table.type.schema).header_cell;
    for (let col = 0; col < map.width; col++)
      if (((_a = table.nodeAt(map.map[col + row * map.width])) == null ? void 0 : _a.type) != headerCell)
        return false;
    return true;
  }
  function addRow(tr, { map, tableStart, table }, row) {
    var _a;
    let rowPos = tableStart;
    for (let i = 0; i < row; i++)
      rowPos += table.child(i).nodeSize;
    const cells = [];
    let refRow = row > 0 ? -1 : 0;
    if (rowIsHeader(map, table, row + refRow))
      refRow = row == 0 || row == map.height ? null : 0;
    for (let col = 0, index = map.width * row; col < map.width; col++, index++) {
      if (row > 0 && row < map.height && map.map[index] == map.map[index - map.width]) {
        const pos = map.map[index];
        const attrs = table.nodeAt(pos).attrs;
        tr.setNodeMarkup(tableStart + pos, null, {
          ...attrs,
          rowspan: attrs.rowspan + 1
        });
        col += attrs.colspan - 1;
      } else {
        const type = refRow == null ? tableNodeTypes(table.type.schema).cell : (_a = table.nodeAt(map.map[index + refRow * map.width])) == null ? void 0 : _a.type;
        const node = type == null ? void 0 : type.createAndFill();
        if (node)
          cells.push(node);
      }
    }
    tr.insert(rowPos, tableNodeTypes(table.type.schema).row.create(null, cells));
    return tr;
  }
  function addRowBefore(state, dispatch) {
    if (!isInTable(state))
      return false;
    if (dispatch) {
      const rect = selectedRect(state);
      dispatch(addRow(state.tr, rect, rect.top));
    }
    return true;
  }
  function addRowAfter(state, dispatch) {
    if (!isInTable(state))
      return false;
    if (dispatch) {
      const rect = selectedRect(state);
      dispatch(addRow(state.tr, rect, rect.bottom));
    }
    return true;
  }
  function removeRow(tr, { map, table, tableStart }, row) {
    let rowPos = 0;
    for (let i = 0; i < row; i++)
      rowPos += table.child(i).nodeSize;
    const nextRow = rowPos + table.child(row).nodeSize;
    const mapFrom = tr.mapping.maps.length;
    tr.delete(rowPos + tableStart, nextRow + tableStart);
    for (let col = 0, index = row * map.width; col < map.width; col++, index++) {
      const pos = map.map[index];
      if (row > 0 && pos == map.map[index - map.width]) {
        const attrs = table.nodeAt(pos).attrs;
        tr.setNodeMarkup(tr.mapping.slice(mapFrom).map(pos + tableStart), null, {
          ...attrs,
          rowspan: attrs.rowspan - 1
        });
        col += attrs.colspan - 1;
      } else if (row < map.width && pos == map.map[index + map.width]) {
        const cell = table.nodeAt(pos);
        const attrs = cell.attrs;
        const copy = cell.type.create(
          { ...attrs, rowspan: cell.attrs.rowspan - 1 },
          cell.content
        );
        const newPos = map.positionAt(row + 1, col, table);
        tr.insert(tr.mapping.slice(mapFrom).map(tableStart + newPos), copy);
        col += attrs.colspan - 1;
      }
    }
  }
  function deleteRow(state, dispatch) {
    if (!isInTable(state))
      return false;
    if (dispatch) {
      const rect = selectedRect(state), tr = state.tr;
      if (rect.top == 0 && rect.bottom == rect.map.height)
        return false;
      for (let i = rect.bottom - 1; ; i--) {
        removeRow(tr, rect, i);
        if (i == rect.top)
          break;
        const table = rect.tableStart ? tr.doc.nodeAt(rect.tableStart - 1) : tr.doc;
        if (!table) {
          throw RangeError("No table found");
        }
        rect.table = table;
        rect.map = TableMap.get(rect.table);
      }
      dispatch(tr);
    }
    return true;
  }
  function isEmpty(cell) {
    const c = cell.content;
    return c.childCount == 1 && c.child(0).isTextblock && c.child(0).childCount == 0;
  }
  function cellsOverlapRectangle({ width, height, map }, rect) {
    let indexTop = rect.top * width + rect.left, indexLeft = indexTop;
    let indexBottom = (rect.bottom - 1) * width + rect.left, indexRight = indexTop + (rect.right - rect.left - 1);
    for (let i = rect.top; i < rect.bottom; i++) {
      if (rect.left > 0 && map[indexLeft] == map[indexLeft - 1] || rect.right < width && map[indexRight] == map[indexRight + 1])
        return true;
      indexLeft += width;
      indexRight += width;
    }
    for (let i = rect.left; i < rect.right; i++) {
      if (rect.top > 0 && map[indexTop] == map[indexTop - width] || rect.bottom < height && map[indexBottom] == map[indexBottom + width])
        return true;
      indexTop++;
      indexBottom++;
    }
    return false;
  }
  function mergeCells(state, dispatch) {
    const sel = state.selection;
    if (!(sel instanceof CellSelection) || sel.$anchorCell.pos == sel.$headCell.pos)
      return false;
    const rect = selectedRect(state), { map } = rect;
    if (cellsOverlapRectangle(map, rect))
      return false;
    if (dispatch) {
      const tr = state.tr;
      const seen = {};
      let content = Fragment.empty;
      let mergedPos;
      let mergedCell;
      for (let row = rect.top; row < rect.bottom; row++) {
        for (let col = rect.left; col < rect.right; col++) {
          const cellPos = map.map[row * map.width + col];
          const cell = rect.table.nodeAt(cellPos);
          if (seen[cellPos] || !cell)
            continue;
          seen[cellPos] = true;
          if (mergedPos == null) {
            mergedPos = cellPos;
            mergedCell = cell;
          } else {
            if (!isEmpty(cell))
              content = content.append(cell.content);
            const mapped = tr.mapping.map(cellPos + rect.tableStart);
            tr.delete(mapped, mapped + cell.nodeSize);
          }
        }
      }
      if (mergedPos == null || mergedCell == null) {
        return true;
      }
      tr.setNodeMarkup(mergedPos + rect.tableStart, null, {
        ...addColSpan(
          mergedCell.attrs,
          mergedCell.attrs.colspan,
          rect.right - rect.left - mergedCell.attrs.colspan
        ),
        rowspan: rect.bottom - rect.top
      });
      if (content.size) {
        const end = mergedPos + 1 + mergedCell.content.size;
        const start = isEmpty(mergedCell) ? mergedPos + 1 : end;
        tr.replaceWith(start + rect.tableStart, end + rect.tableStart, content);
      }
      tr.setSelection(
        new CellSelection(tr.doc.resolve(mergedPos + rect.tableStart))
      );
      dispatch(tr);
    }
    return true;
  }
  function splitCell(state, dispatch) {
    const nodeTypes = tableNodeTypes(state.schema);
    return splitCellWithType(({ node }) => {
      return nodeTypes[node.type.spec.tableRole];
    })(state, dispatch);
  }
  function splitCellWithType(getCellType) {
    return (state, dispatch) => {
      var _a;
      const sel = state.selection;
      let cellNode;
      let cellPos;
      if (!(sel instanceof CellSelection)) {
        cellNode = cellWrapping(sel.$from);
        if (!cellNode)
          return false;
        cellPos = (_a = cellAround(sel.$from)) == null ? void 0 : _a.pos;
      } else {
        if (sel.$anchorCell.pos != sel.$headCell.pos)
          return false;
        cellNode = sel.$anchorCell.nodeAfter;
        cellPos = sel.$anchorCell.pos;
      }
      if (cellNode == null || cellPos == null) {
        return false;
      }
      if (cellNode.attrs.colspan == 1 && cellNode.attrs.rowspan == 1) {
        return false;
      }
      if (dispatch) {
        let baseAttrs = cellNode.attrs;
        const attrs = [];
        const colwidth = baseAttrs.colwidth;
        if (baseAttrs.rowspan > 1)
          baseAttrs = { ...baseAttrs, rowspan: 1 };
        if (baseAttrs.colspan > 1)
          baseAttrs = { ...baseAttrs, colspan: 1 };
        const rect = selectedRect(state), tr = state.tr;
        for (let i = 0; i < rect.right - rect.left; i++)
          attrs.push(
            colwidth ? {
              ...baseAttrs,
              colwidth: colwidth && colwidth[i] ? [colwidth[i]] : null
            } : baseAttrs
          );
        let lastCell;
        for (let row = rect.top; row < rect.bottom; row++) {
          let pos = rect.map.positionAt(row, rect.left, rect.table);
          if (row == rect.top)
            pos += cellNode.nodeSize;
          for (let col = rect.left, i = 0; col < rect.right; col++, i++) {
            if (col == rect.left && row == rect.top)
              continue;
            tr.insert(
              lastCell = tr.mapping.map(pos + rect.tableStart, 1),
              getCellType({ node: cellNode, row, col }).createAndFill(attrs[i])
            );
          }
        }
        tr.setNodeMarkup(
          cellPos,
          getCellType({ node: cellNode, row: rect.top, col: rect.left }),
          attrs[0]
        );
        if (sel instanceof CellSelection)
          tr.setSelection(
            new CellSelection(
              tr.doc.resolve(sel.$anchorCell.pos),
              lastCell ? tr.doc.resolve(lastCell) : void 0
            )
          );
        dispatch(tr);
      }
      return true;
    };
  }
  function setCellAttr(name, value) {
    return function(state, dispatch) {
      if (!isInTable(state))
        return false;
      const $cell = selectionCell(state);
      if ($cell.nodeAfter.attrs[name] === value)
        return false;
      if (dispatch) {
        const tr = state.tr;
        if (state.selection instanceof CellSelection)
          state.selection.forEachCell((node, pos) => {
            if (node.attrs[name] !== value)
              tr.setNodeMarkup(pos, null, {
                ...node.attrs,
                [name]: value
              });
          });
        else
          tr.setNodeMarkup($cell.pos, null, {
            ...$cell.nodeAfter.attrs,
            [name]: value
          });
        dispatch(tr);
      }
      return true;
    };
  }
  function deprecated_toggleHeader(type) {
    return function(state, dispatch) {
      if (!isInTable(state))
        return false;
      if (dispatch) {
        const types = tableNodeTypes(state.schema);
        const rect = selectedRect(state), tr = state.tr;
        const cells = rect.map.cellsInRect(
          type == "column" ? {
            left: rect.left,
            top: 0,
            right: rect.right,
            bottom: rect.map.height
          } : type == "row" ? {
            left: 0,
            top: rect.top,
            right: rect.map.width,
            bottom: rect.bottom
          } : rect
        );
        const nodes = cells.map((pos) => rect.table.nodeAt(pos));
        for (let i = 0; i < cells.length; i++)
          if (nodes[i].type == types.header_cell)
            tr.setNodeMarkup(
              rect.tableStart + cells[i],
              types.cell,
              nodes[i].attrs
            );
        if (tr.steps.length == 0)
          for (let i = 0; i < cells.length; i++)
            tr.setNodeMarkup(
              rect.tableStart + cells[i],
              types.header_cell,
              nodes[i].attrs
            );
        dispatch(tr);
      }
      return true;
    };
  }
  function isHeaderEnabledByType(type, rect, types) {
    const cellPositions = rect.map.cellsInRect({
      left: 0,
      top: 0,
      right: type == "row" ? rect.map.width : 1,
      bottom: type == "column" ? rect.map.height : 1
    });
    for (let i = 0; i < cellPositions.length; i++) {
      const cell = rect.table.nodeAt(cellPositions[i]);
      if (cell && cell.type !== types.header_cell) {
        return false;
      }
    }
    return true;
  }
  function toggleHeader(type, options) {
    options = options || { useDeprecatedLogic: false };
    if (options.useDeprecatedLogic)
      return deprecated_toggleHeader(type);
    return function(state, dispatch) {
      if (!isInTable(state))
        return false;
      if (dispatch) {
        const types = tableNodeTypes(state.schema);
        const rect = selectedRect(state), tr = state.tr;
        const isHeaderRowEnabled = isHeaderEnabledByType("row", rect, types);
        const isHeaderColumnEnabled = isHeaderEnabledByType(
          "column",
          rect,
          types
        );
        const isHeaderEnabled = type === "column" ? isHeaderRowEnabled : type === "row" ? isHeaderColumnEnabled : false;
        const selectionStartsAt = isHeaderEnabled ? 1 : 0;
        const cellsRect = type == "column" ? {
          left: 0,
          top: selectionStartsAt,
          right: 1,
          bottom: rect.map.height
        } : type == "row" ? {
          left: selectionStartsAt,
          top: 0,
          right: rect.map.width,
          bottom: 1
        } : rect;
        const newType = type == "column" ? isHeaderColumnEnabled ? types.cell : types.header_cell : type == "row" ? isHeaderRowEnabled ? types.cell : types.header_cell : types.cell;
        rect.map.cellsInRect(cellsRect).forEach((relativeCellPos) => {
          const cellPos = relativeCellPos + rect.tableStart;
          const cell = tr.doc.nodeAt(cellPos);
          if (cell) {
            tr.setNodeMarkup(cellPos, newType, cell.attrs);
          }
        });
        dispatch(tr);
      }
      return true;
    };
  }
  var toggleHeaderRow = toggleHeader("row", {
    useDeprecatedLogic: true
  });
  var toggleHeaderColumn = toggleHeader("column", {
    useDeprecatedLogic: true
  });
  var toggleHeaderCell = toggleHeader("cell", {
    useDeprecatedLogic: true
  });
  function findNextCell($cell, dir) {
    if (dir < 0) {
      const before = $cell.nodeBefore;
      if (before)
        return $cell.pos - before.nodeSize;
      for (let row = $cell.index(-1) - 1, rowEnd = $cell.before(); row >= 0; row--) {
        const rowNode = $cell.node(-1).child(row);
        const lastChild = rowNode.lastChild;
        if (lastChild) {
          return rowEnd - 1 - lastChild.nodeSize;
        }
        rowEnd -= rowNode.nodeSize;
      }
    } else {
      if ($cell.index() < $cell.parent.childCount - 1) {
        return $cell.pos + $cell.nodeAfter.nodeSize;
      }
      const table = $cell.node(-1);
      for (let row = $cell.indexAfter(-1), rowStart = $cell.after(); row < table.childCount; row++) {
        const rowNode = table.child(row);
        if (rowNode.childCount)
          return rowStart + 1;
        rowStart += rowNode.nodeSize;
      }
    }
    return null;
  }
  function goToNextCell(direction) {
    return function(state, dispatch) {
      if (!isInTable(state))
        return false;
      const cell = findNextCell(selectionCell(state), direction);
      if (cell == null)
        return false;
      if (dispatch) {
        const $cell = state.doc.resolve(cell);
        dispatch(
          state.tr.setSelection(TextSelection.between($cell, moveCellForward($cell))).scrollIntoView()
        );
      }
      return true;
    };
  }
  function deleteTable(state, dispatch) {
    const $pos = state.selection.$anchor;
    for (let d = $pos.depth; d > 0; d--) {
      const node = $pos.node(d);
      if (node.type.spec.tableRole == "table") {
        if (dispatch)
          dispatch(
            state.tr.delete($pos.before(d), $pos.after(d)).scrollIntoView()
          );
        return true;
      }
    }
    return false;
  }

  // src/index.ts
  function tableEditing({
    allowTableNodeSelection = false
  } = {}) {
    return new Plugin({
      key: tableEditingKey,
      state: {
        init() {
          return null;
        },
        apply(tr, cur) {
          const set = tr.getMeta(tableEditingKey);
          if (set != null)
            return set == -1 ? null : set;
          if (cur == null || !tr.docChanged)
            return cur;
          const { deleted, pos } = tr.mapping.mapResult(cur);
          return deleted ? null : pos;
        }
      },
      props: {
        decorations: drawCellSelection,
        handleDOMEvents: {
          mousedown: handleMouseDown
        },
        createSelectionBetween(view) {
          return tableEditingKey.getState(view.state) != null ? view.state.selection : null;
        },
        handleTripleClick,
        handleKeyDown,
        handlePaste
      },
      appendTransaction(_, oldState, state) {
        return normalizeSelection(
          state,
          fixTables(state, oldState),
          allowTableNodeSelection
        );
      }
    });
  }

  var index$1 = /*#__PURE__*/Object.freeze({
    __proto__: null,
    CellBookmark: CellBookmark,
    CellSelection: CellSelection,
    ResizeState: ResizeState,
    TableMap: TableMap,
    TableView: TableView,
    __clipCells: clipCells,
    __insertCells: insertCells,
    __pastedCells: pastedCells,
    addColSpan: addColSpan,
    addColumn: addColumn,
    addColumnAfter: addColumnAfter,
    addColumnBefore: addColumnBefore,
    addRow: addRow,
    addRowAfter: addRowAfter,
    addRowBefore: addRowBefore,
    cellAround: cellAround,
    colCount: colCount,
    columnIsHeader: columnIsHeader,
    columnResizing: columnResizing,
    columnResizingPluginKey: columnResizingPluginKey,
    deleteColumn: deleteColumn,
    deleteRow: deleteRow,
    deleteTable: deleteTable,
    findCell: findCell,
    fixTables: fixTables,
    fixTablesKey: fixTablesKey,
    goToNextCell: goToNextCell,
    handlePaste: handlePaste,
    inSameTable: inSameTable,
    isInTable: isInTable,
    mergeCells: mergeCells,
    moveCellForward: moveCellForward,
    nextCell: nextCell,
    pointsAtCell: pointsAtCell,
    removeColSpan: removeColSpan,
    removeColumn: removeColumn,
    removeRow: removeRow,
    rowIsHeader: rowIsHeader,
    selectedRect: selectedRect,
    selectionCell: selectionCell,
    setCellAttr: setCellAttr,
    splitCell: splitCell,
    splitCellWithType: splitCellWithType,
    tableEditing: tableEditing,
    tableEditingKey: tableEditingKey,
    tableNodeTypes: tableNodeTypes,
    tableNodes: tableNodes,
    toggleHeader: toggleHeader,
    toggleHeaderCell: toggleHeaderCell,
    toggleHeaderColumn: toggleHeaderColumn,
    toggleHeaderRow: toggleHeaderRow,
    updateColumnsOnResize: updateColumnsOnResize
  });

  /**
   * A class responsible for building a menu for a ProseMirror instance.
   * @extends {ProseMirrorPlugin}
   */
  class ProseMirrorMenu extends ProseMirrorPlugin {
    /**
     * @typedef {object} ProseMirrorMenuOptions
     * @property {Function} [onSave]        A function to call when the save button is pressed.
     * @property {boolean} [destroyOnSave]  Whether this editor instance is intended to be destroyed when saved.
     * @property {boolean} [compact]        Whether to display a more compact version of the menu.
     */

    /**
     * @param {Schema} schema                     The ProseMirror schema to build a menu for.
     * @param {EditorView} view                   The editor view.
     * @param {ProseMirrorMenuOptions} [options]  Additional options to configure the plugin's behaviour.
     */
    constructor(schema, view, options={}) {
      super(schema);
      this.options = options;

      /**
       * The editor view.
       * @type {EditorView}
       */
      Object.defineProperty(this, "view", {value: view});

      /**
       * The items configured for this menu.
       * @type {ProseMirrorMenuItem[]}
       */
      Object.defineProperty(this, "items", {value: this._getMenuItems()});

      /**
       * The ID of the menu element in the DOM.
       * @type {string}
       */
      Object.defineProperty(this, "id", {value: `prosemirror-menu-${foundry.utils.randomID()}`, writable: false});

      this._createDropDowns();
      this._wrapEditor();
    }

    /* -------------------------------------------- */

    /**
     * An enumeration of editor scopes in which a menu item can appear
     * @enum {string}
     * @protected
     */
    static _MENU_ITEM_SCOPES = {
      BOTH: "",
      TEXT: "text",
      HTML: "html"
    }

    /* -------------------------------------------- */

    /**
     * Additional options to configure the plugin's behaviour.
     * @type {ProseMirrorMenuOptions}
     */
    options;

    /* -------------------------------------------- */

    /**
     * An HTML element that we write HTML to before injecting it into the DOM.
     * @type {HTMLTemplateElement}
     * @private
     */
    #renderTarget = document.createElement("template");

    /* -------------------------------------------- */

    /**
     * Track whether we are currently in a state of editing the HTML source.
     * @type {boolean}
     */
    #editingSource = false;
    get editingSource() {
      return this.#editingSource;
    }

    /* -------------------------------------------- */

    /** @inheritdoc */
    static build(schema, options={}) {
      return new Plugin({
        view: editorView => {
          return new this(schema, editorView, options).render();
        }
      });
    }

    /* -------------------------------------------- */

    /**
     * Render the menu's HTML.
     * @returns {ProseMirrorMenu}
     */
    render() {
      const scopes = this.constructor._MENU_ITEM_SCOPES;
      const scopeKey = this.editingSource ? "HTML" : "TEXT";

      // Dropdown Menus
      const dropdowns = this.dropdowns.map(d => `<li class="text">${d.render()}</li>`);

      // Button items
      const buttons = this.items.reduce((buttons, item) => {
        if ( ![scopes.BOTH, scopes[scopeKey]].includes(item.scope) ) return buttons;
        const liClass = [item.active ? "active" : "", item.cssClass, item.scope].filterJoin(" ");
        const bClass = item.active ? "active" : "";
        const tip = game.i18n.localize(item.title);
        buttons.push(`
      <li class="${liClass}">
        <button type="button" class="${bClass}" data-tooltip="${tip}" data-action="${item.action}">
          ${item.icon}
        </button>
      </li>`);
        return buttons;
      }, []);

      // Add collaboration indicator.
      const collaborating = document.getElementById(this.id)?.querySelector(".concurrent-users");
      const tooltip = collaborating?.dataset.tooltip || game.i18n.localize("EDITOR.CollaboratingUsers");
      buttons.push(`
      <li class="concurrent-users" data-tooltip="${tooltip}">
        ${collaborating?.innerHTML || ""}
      </li>
    `);

      // Replace Menu HTML
      this.#renderTarget.innerHTML = `
      <menu class="editor-menu" id="${this.id}">
        ${dropdowns.join("")}
        ${buttons.join("")}
      </menu>
    `;
      document.getElementById(this.id).replaceWith(this.#renderTarget.content.getElementById(this.id));

      // Toggle source editing state for the parent
      const editor = this.view.dom.closest(".editor");
      editor.classList.toggle("editing-source", this.editingSource);

      // Menu interactivity
      this.activateListeners(document.getElementById(this.id));
      return this;
    }

    /* -------------------------------------------- */

    /**
     * Attach event listeners.
     * @param {HTMLMenuElement} html  The root menu element.
     */
    activateListeners(html) {
      html.querySelectorAll("button[data-action]").forEach(button => button.onclick = evt => this._onAction(evt));
      this.dropdowns.map(d => d.activateListeners(html));
    }

    /* -------------------------------------------- */

    /**
     * Called whenever the view's state is updated.
     * @param {EditorView} view       The current editor state.
     * @param {EditorView} prevState  The previous editor state.
     */
    update(view, prevState) {
      this.dropdowns.forEach(d => d.forEachItem(item => {
        item.active = this._isItemActive(item);
      }));
      this.items.forEach(item => item.active = this._isItemActive(item));
      this.render();
    }

    /* -------------------------------------------- */

    /**
     * Called when the view is destroyed or receives a state with different plugins.
     */
    destroy() {
      const menu = this.view.dom.closest(".editor").querySelector("menu");
      menu.nextElementSibling.remove();
      menu.remove();
    }

    /* -------------------------------------------- */

    /**
     * Instantiate the ProseMirrorDropDown instances and configure them with the defined menu items.
     * @protected
     */
    _createDropDowns() {
      const dropdowns = Object.values(this._getDropDownMenus()).map(({title, cssClass, icon, entries}) => {
        return new ProseMirrorDropDown(title, entries, { cssClass, icon, onAction: this._onAction.bind(this) });
      });

      /**
       * The dropdowns configured for this menu.
       * @type {ProseMirrorDropDown[]}
       */
      Object.defineProperty(this, "dropdowns", {value: dropdowns});
    }

    /* -------------------------------------------- */

    /**
     * @typedef {object} ProseMirrorMenuItem
     * @property {string} action             A string identifier for this menu item.
     * @property {string} title              The description of the menu item.
     * @property {string} [class]            An optional class to apply to the menu item.
     * @property {string} [style]            An optional style to apply to the title text.
     * @property {string} [icon]             The menu item's icon HTML.
     * @property {MarkType} [mark]           The mark to apply to the selected text.
     * @property {NodeType} [node]           The node to wrap the selected text in.
     * @property {object} [attrs]            An object of attributes for the node or mark.
     * @property {number} [group]            Entries with the same group number will be grouped together in the drop-down.
     *                                       Lower-numbered groups appear higher in the list.
     * @property {number} [priority]         A numeric priority which determines whether this item is displayed as the
     *                                       dropdown title. Lower priority takes precedence.
     * @property {ProseMirrorCommand} [cmd]  The command to run when the menu item is clicked.
     * @property {boolean} [active=false]    Whether the current item is active under the given selection or cursor.
     */

    /**
     * @typedef {ProseMirrorMenuItem} ProseMirrorDropDownEntry
     * @property {ProseMirrorDropDownEntry[]} [children]  Any child entries.
     */

    /**
     * @typedef {object} ProseMirrorDropDownConfig
     * @property {string} title                        The default title of the drop-down.
     * @property {string} cssClass                     The menu CSS class.
     * @property {string} [icon]                       An optional icon to use instead of a text label.
     * @property {ProseMirrorDropDownEntry[]} entries  The drop-down entries.
     */

    /**
     * Configure dropdowns for this menu. Each entry in the top-level array corresponds to a separate drop-down.
     * @returns {Object<ProseMirrorDropDownConfig>}
     * @protected
     */
    _getDropDownMenus() {
      const menus = {
        format: {
          title: "EDITOR.Format",
          cssClass: "format",
          entries: [
            {
              action: "block",
              title: "EDITOR.Block",
              children: [{
                action: "paragraph",
                title: "EDITOR.Paragraph",
                priority: 3,
                node: this.schema.nodes.paragraph
              }, {
                action: "blockquote",
                title: "EDITOR.Blockquote",
                priority: 1,
                node: this.schema.nodes.blockquote,
                cmd: () => this._toggleBlock(this.schema.nodes.blockquote, wrapIn)
              }, {
                action: "code-block",
                title: "EDITOR.CodeBlock",
                priority: 1,
                node: this.schema.nodes.code_block,
                cmd: () => this._toggleTextBlock(this.schema.nodes.code_block)
              }, {
                action: "secret",
                title: "EDITOR.Secret",
                priority: 1,
                node: this.schema.nodes.secret,
                cmd: () => {
                  this._toggleBlock(this.schema.nodes.secret, wrapIn, {
                    attrs: {
                      id: `secret-${foundry.utils.randomID()}`
                    }
                  });
                }
              }]
            }, {
              action: "inline",
              title: "EDITOR.Inline",
              children: [{
                action: "bold",
                title: "EDITOR.Bold",
                priority: 2,
                style: "font-weight: bold;",
                mark: this.schema.marks.strong,
                cmd: toggleMark(this.schema.marks.strong)
              }, {
                action: "italic",
                title: "EDITOR.Italic",
                priority: 2,
                style: "font-style: italic;",
                mark: this.schema.marks.em,
                cmd: toggleMark(this.schema.marks.em)
              }, {
                action: "code",
                title: "EDITOR.Code",
                priority: 2,
                style: "font-family: monospace;",
                mark: this.schema.marks.code,
                cmd: toggleMark(this.schema.marks.code)
              }, {
                action: "underline",
                title: "EDITOR.Underline",
                priority: 2,
                style: "text-decoration: underline;",
                mark: this.schema.marks.underline,
                cmd: toggleMark(this.schema.marks.underline)
              }, {
                action: "strikethrough",
                title: "EDITOR.Strikethrough",
                priority: 2,
                style: "text-decoration: line-through;",
                mark: this.schema.marks.strikethrough,
                cmd: toggleMark(this.schema.marks.strikethrough)
              }, {
                action: "superscript",
                title: "EDITOR.Superscript",
                priority: 2,
                mark: this.schema.marks.superscript,
                cmd: toggleMark(this.schema.marks.superscript)
              }, {
                action: "subscript",
                title: "EDITOR.Subscript",
                priority: 2,
                mark: this.schema.marks.subscript,
                cmd: toggleMark(this.schema.marks.subscript)
              }]
            }, {
              action: "alignment",
              title: "EDITOR.Alignment",
              children: [{
                action: "align-left",
                title: "EDITOR.AlignmentLeft",
                priority: 4,
                node: this.schema.nodes.paragraph,
                attrs: {alignment: "left"},
                cmd: () => this.#toggleAlignment("left")
              }, {
                action: "align-center",
                title: "EDITOR.AlignmentCenter",
                priority: 4,
                node: this.schema.nodes.paragraph,
                attrs: {alignment: "center"},
                cmd: () => this.#toggleAlignment("center")
              }, {
                action: "align-justify",
                title: "EDITOR.AlignmentJustify",
                priority: 4,
                node: this.schema.nodes.paragraph,
                attrs: {alignment: "justify"},
                cmd: () => this.#toggleAlignment("justify")
              }, {
                action: "align-right",
                title: "EDITOR.AlignmentRight",
                priority: 4,
                node: this.schema.nodes.paragraph,
                attrs: {alignment: "right"},
                cmd: () => this.#toggleAlignment("right")
              }]
            }
          ]
        }
      };

      const headings = Array.fromRange(6, 1).map(level => ({
        action: `h${level}`,
        title: game.i18n.format("EDITOR.Heading", {level}),
        priority: 1,
        class: `level${level}`,
        node: this.schema.nodes.heading,
        attrs: {level},
        cmd: () => this._toggleTextBlock(this.schema.nodes.heading, {attrs: {level}})
      }));

      menus.format.entries.unshift({
        action: "headings",
        title: "EDITOR.Headings",
        children: headings
      });

      const fonts = FontConfig.getAvailableFonts().sort().map(family => ({
        action: `font-family-${family.slugify()}`,
        title: family,
        priority: 2,
        style: `font-family: '${family}';`,
        mark: this.schema.marks.font,
        attrs: {family},
        cmd: toggleMark(this.schema.marks.font, {family})
      }));

      if ( this.options.compact ) {
        menus.format.entries.push({
          action: "fonts",
          title: "EDITOR.Font",
          children: fonts
        });
      } else {
        menus.fonts = {
          title: "EDITOR.Font",
          cssClass: "fonts",
          entries: fonts
        };
      }

      menus.table = {
        title: "EDITOR.Table",
        cssClass: "tables",
        icon: '<i class="fas fa-table"></i>',
        entries: [{
          action: "insert-table",
          title: "EDITOR.TableInsert",
          group: 1,
          cmd: this._insertTablePrompt.bind(this)
        }, {
          action: "delete-table",
          title: "EDITOR.TableDelete",
          group: 1,
          cmd: deleteTable
        }, {
          action: "add-col-after",
          title: "EDITOR.TableAddColumnAfter",
          group: 2,
          cmd: addColumnAfter
        }, {
          action: "add-col-before",
          title: "EDITOR.TableAddColumnBefore",
          group: 2,
          cmd: addColumnBefore
        }, {
          action: "delete-col",
          title: "EDITOR.TableDeleteColumn",
          group: 2,
          cmd: deleteColumn
        }, {
          action: "add-row-after",
          title: "EDITOR.TableAddRowAfter",
          group: 3,
          cmd: addRowAfter
        }, {
          action: "add-row-before",
          title: "EDITOR.TableAddRowBefore",
          group: 3,
          cmd: addRowBefore
        }, {
          action: "delete-row",
          title: "EDITOR.TableDeleteRow",
          group: 3,
          cmd: deleteRow
        }, {
          action: "merge-cells",
          title: "EDITOR.TableMergeCells",
          group: 4,
          cmd: mergeCells
        }, {
          action: "split-cell",
          title: "EDITOR.TableSplitCell",
          group: 4,
          cmd: splitCell
        }]
      };

      Hooks.callAll("getProseMirrorMenuDropDowns", this, menus);
      return menus;
    }

    /* -------------------------------------------- */

    /**
     * Configure the items for this menu.
     * @returns {ProseMirrorMenuItem[]}
     * @protected
     */
    _getMenuItems() {
      const scopes = this.constructor._MENU_ITEM_SCOPES;
      const items = [
        {
          action: "bullet-list",
          title: "EDITOR.BulletList",
          icon: '<i class="fa-solid fa-list-ul"></i>',
          node: this.schema.nodes.bullet_list,
          scope: scopes.TEXT,
          cmd: () => this._toggleBlock(this.schema.nodes.bullet_list, wrapInList)
        },
        {
          action: "number-list",
          title: "EDITOR.NumberList",
          icon: '<i class="fa-solid fa-list-ol"></i>',
          node: this.schema.nodes.ordered_list,
          scope: scopes.TEXT,
          cmd: () => this._toggleBlock(this.schema.nodes.ordered_list, wrapInList)
        },
        {
          action: "horizontal-rule",
          title: "EDITOR.HorizontalRule",
          icon: '<i class="fa-solid fa-horizontal-rule"></i>',
          scope: scopes.TEXT,
          cmd: this.#insertHorizontalRule.bind(this)
        },
        {
          action: "image",
          title: "EDITOR.InsertImage",
          icon: '<i class="fa-solid fa-image"></i>',
          scope: scopes.TEXT,
          node: this.schema.nodes.image,
          cmd: this._insertImagePrompt.bind(this)
        },
        {
          action: "link",
          title: "EDITOR.Link",
          icon: '<i class="fa-solid fa-link"></i>',
          scope: scopes.TEXT,
          mark: this.schema.marks.link,
          cmd: this._insertLinkPrompt.bind(this)
        },
        {
          action: "clear-formatting",
          title: "EDITOR.ClearFormatting",
          icon: '<i class="fa-solid fa-text-slash"></i>',
          scope: scopes.TEXT,
          cmd: this._clearFormatting.bind(this)
        },
        {
          action: "cancel-html",
          title: "EDITOR.DiscardHTML",
          icon: '<i class="fa-solid fa-times"></i>',
          scope: scopes.HTML,
          cmd: this.#clearSourceTextarea.bind(this)
        }
      ];

      if ( this.view.state.plugins.some(p => p.spec.isHighlightMatchesPlugin) ) {
        items.push({
          action: "toggle-matches",
          title: "EDITOR.EnableHighlightDocumentMatches",
          icon: '<i class="fa-solid fa-wand-magic-sparkles"></i>',
          scope: scopes.TEXT,
          cssClass: "toggle-matches",
          cmd: this._toggleMatches.bind(this),
          active: game.settings.get("core", "pmHighlightDocumentMatches")
        });
      }

      if ( this.options.onSave ) {
        items.push({
          action: "save",
          title: `EDITOR.${this.options.destroyOnSave ? "SaveAndClose" : "Save"}`,
          icon: `<i class="fa-solid fa-${this.options.destroyOnSave ? "floppy-disk-circle-arrow-right" : "save"}"></i>`,
          scope: scopes.BOTH,
          cssClass: "right",
          cmd: this._handleSave.bind(this)
        });
      }

      items.push({
        action: "source-code",
        title: "EDITOR.SourceHTML",
        icon: '<i class="fa-solid fa-code"></i>',
        scope: scopes.BOTH,
        cssClass: "source-code-edit right",
        cmd: this.#toggleSource.bind(this)
      });

      Hooks.callAll("getProseMirrorMenuItems", this, items);
      return items;
    }

    /* -------------------------------------------- */

    /**
     * Determine whether the given menu item is currently active or not.
     * @param {ProseMirrorMenuItem} item  The menu item.
     * @returns {boolean}                 Whether the cursor or selection is in a state represented by the given menu
     *                                    item.
     * @protected
     */
    _isItemActive(item) {
      if ( item.action === "source-code" ) return !!this.#editingSource;
      if ( item.action === "toggle-matches" ) return game.settings.get("core", "pmHighlightDocumentMatches");
      if ( item.mark ) return this._isMarkActive(item);
      if ( item.node ) return this._isNodeActive(item);
      return false;
    }

    /* -------------------------------------------- */

    /**
     * Determine whether the given menu item representing a mark is active or not.
     * @param {ProseMirrorMenuItem} item  The menu item representing a {@link MarkType}.
     * @returns {boolean}                 Whether the cursor or selection is in a state represented by the given mark.
     * @protected
     */
    _isMarkActive(item) {
      const state = this.view.state;
      const {from, $from, to, empty} = state.selection;
      const markCompare = mark => {
        if ( mark.type !== item.mark ) return false;
        const attrs = foundry.utils.deepClone(mark.attrs);
        delete attrs._preserve;
        if ( item.attrs ) return foundry.utils.objectsEqual(attrs, item.attrs);
        return true;
      };
      if ( empty ) return $from.marks().some(markCompare);
      let active = false;
      state.doc.nodesBetween(from, to, node => {
        if ( node.marks.some(markCompare) ) active = true;
        return !active;
      });
      return active;
    }

    /* -------------------------------------------- */

    /**
     * Determine whether the given menu item representing a node is active or not.
     * @param {ProseMirrorMenuItem} item  The menu item representing a {@link NodeType}.
     * @returns {boolean}                 Whether the cursor or selection is currently within a block of this menu item's
     *                                    node type.
     * @protected
     */
    _isNodeActive(item) {
      const state = this.view.state;
      const {$from, $to, empty} = state.selection;
      const sameParent = empty || $from.sameParent($to);
      // If the selection spans multiple nodes, give up on detecting whether we're in a given block.
      // TODO: Add more complex logic for detecting if all selected nodes belong to the same parent.
      if ( !sameParent ) return false;
      return (state.doc.nodeAt($from.pos)?.type === item.node) || $from.hasAncestor(item.node, item.attrs);
    }

    /* -------------------------------------------- */

    /**
     * Handle a button press.
     * @param {MouseEvent} event  The click event.
     * @protected
     */
    _onAction(event) {
      event.preventDefault();
      const action = event.currentTarget.dataset.action;
      let item;

      // Check dropdowns first
      this.dropdowns.forEach(d => d.forEachItem(i => {
        if ( i.action !== action ) return;
        item = i;
        return false;
      }));

      // Menu items
      if ( !item ) item = this.items.find(i => i.action === action);
      item?.cmd?.(this.view.state, this.view.dispatch, this.view);
    }

    /* -------------------------------------------- */

    /**
     * Wrap the editor view element and inject our template ready to be rendered into.
     * @protected
     */
    _wrapEditor() {
      const wrapper = document.createElement("div");
      const template = document.createElement("template");
      wrapper.classList.add("editor-container");
      template.setAttribute("id", this.id);
      this.view.dom.before(template);
      this.view.dom.replaceWith(wrapper);
      wrapper.appendChild(this.view.dom);
    }

    /* -------------------------------------------- */

    /**
     * Handle requests to save the editor contents
     * @protected
     */
    _handleSave() {
      if ( this.#editingSource ) this.#commitSourceTextarea();
      return this.options.onSave?.();
    }

    /* -------------------------------------------- */
    /*  Source Code Textarea Management             */
    /* -------------------------------------------- */

    /**
     * Handle a request to edit the source HTML directly.
     * @protected
     */
    #toggleSource () {
      if ( this.editingSource ) return this.#commitSourceTextarea();
      this.#activateSourceTextarea();
    }

    /* -------------------------------------------- */

    /**
     * Conclude editing the source HTML textarea. Clear its contents and return the HTML which was contained.
     * @returns {string}      The HTML text contained within the textarea before it was cleared
     */
    #clearSourceTextarea() {
      const editor = this.view.dom.closest(".editor");
      const textarea = editor.querySelector(":scope > textarea");
      const html = textarea.value;
      textarea.remove();
      this.#editingSource = false;
      this.items.find(i => i.action === "source-code").active = false;
      this.render();
      return html;
    }

    /* -------------------------------------------- */

    /**
     * Create and activate the source code editing textarea
     */
    #activateSourceTextarea() {
      const editor = this.view.dom.closest(".editor");
      const original = ProseMirror.dom.serializeString(this.view.state.doc.content, {spaces: 4});
      const textarea = document.createElement("textarea");
      textarea.value = original;
      editor.appendChild(textarea);
      this.#editingSource = true;
      this.items.find(i => i.action === "source-code").active = true;
      this.render();
    }

    /* -------------------------------------------- */

    /**
     * Commit changes from the source textarea to the view.
     */
    #commitSourceTextarea() {
      const html = this.#clearSourceTextarea();
      const newDoc = ProseMirror.dom.parseString(html);
      const selection = new ProseMirror.AllSelection(this.view.state.doc);
      this.view.dispatch(this.view.state.tr.setSelection(selection).replaceSelectionWith(newDoc));
    }

    /* -------------------------------------------- */

    /**
     * Display the insert image prompt.
     * @protected
     */
    async _insertImagePrompt() {
      const state = this.view.state;
      const { $from, empty } = state.selection;
      const image = this.schema.nodes.image;
      const data = { src: "", alt: "", width: "", height: "" };
      if ( !empty ) {
        const selected = state.doc.nodeAt($from.pos);
        Object.assign(data, selected?.attrs ?? {});
      }
      const dialog = await this._showDialog("image", "templates/journal/insert-image.html", { data });
      const form = dialog.querySelector("form");
      const src = form.elements.src;
      const filePicker = src.nextElementSibling;
      filePicker.addEventListener("click", () => {
        new FilePicker({field: src, type: "image", current: src.value ?? "", button: filePicker}).browse();
      });
      form.elements.save.addEventListener("click", () => {
        if ( !src.value ) return;
        this.view.dispatch(this.view.state.tr.replaceSelectionWith(image.create({
          src: src.value,
          alt: form.elements.alt.value,
          width: form.elements.width.value,
          height: form.elements.height.value
        })).scrollIntoView());
      });
    }

    /* -------------------------------------------- */

    /**
     * Display the insert link prompt.
     * @protected
     */
    async _insertLinkPrompt() {
      const state = this.view.state;
      const {$from, $to, $cursor} = state.selection;

      // Capture the selected text.
      const selection = state.selection.content().content;
      const data = {text: selection.textBetween(0, selection.size), href: "", title: ""};

      // Check if the user has placed the cursor within a single link, or has selected a single link.
      let links = [];
      state.doc.nodesBetween($from.pos, $to.pos, (node, pos) => {
        if ( node.marks.some(m => m.type === this.schema.marks.link) ) links.push([node, pos]);
      });
      const existing = links.length === 1 && links[0];
      if ( existing ) {
        const [node] = existing;
        if ( $cursor ) data.text = node.text;
        // Pre-fill the dialog with the existing link's attributes.
        const link = node.marks.find(m => m.type === this.schema.marks.link);
        data.href = link.attrs.href;
        data.title = link.attrs.title;
      }

      const dialog = await this._showDialog("link", "templates/journal/insert-link.html", {data});
      const form = dialog.querySelector("form");
      form.elements.save.addEventListener("click", () => {
        const href = form.elements.href.value;
        const text = form.elements.text.value || href;
        if ( !href ) return;
        const link = this.schema.marks.link.create({href, title: form.elements.title.value});
        const tr = state.tr;

        // The user has placed the cursor within a link they wish to edit.
        if ( existing && $cursor ) {
          const [node, pos] = existing;
          const selection = TextSelection.create(state.doc, pos, pos + node.nodeSize);
          tr.setSelection(selection);
        }

        tr.addStoredMark(link).replaceSelectionWith(this.schema.text(text)).scrollIntoView();
        this.view.dispatch(tr);
      });
    }

    /* -------------------------------------------- */

    /**
     * Display the insert table prompt.
     * @protected
     */
    async _insertTablePrompt() {
      const dialog = await this._showDialog("insert-table", "templates/journal/insert-table.html");
      const form = dialog.querySelector("form");
      form.elements.save.addEventListener("click", () => {
        const rows = Number(form.elements.rows.value) || 1;
        const cols = Number(form.elements.cols.value) || 1;
        const html = `
        <table>
          ${Array.fromRange(rows).reduce(row => row + `
            <tr>${Array.fromRange(cols).reduce(col => col + "<td></td>", "")}</tr>
          `, "")}
        </table>
      `;
        const table = ProseMirror.dom.parseString(html, this.schema);
        this.view.dispatch(this.view.state.tr.replaceSelectionWith(table).scrollIntoView());
      });
    }

    /* -------------------------------------------- */

    /**
     * Create a dialog for a menu button.
     * @param {string} action                      The unique menu button action.
     * @param {string} template                    The dialog's template.
     * @param {object} [options]                   Additional options to configure the dialog's behaviour.
     * @param {object} [options.data={}]           Data to pass to the template.
     * @returns {HTMLDialogElement}
     * @protected
     */
    async _showDialog(action, template, {data={}}={}) {
      const button = this.view.dom.closest(".editor").querySelector(`[data-action="${action}"]`);
      button.classList.add("active");
      const dialog = document.createElement("dialog");
      dialog.classList.add("menu-dialog", "prosemirror");
      dialog.innerHTML = await renderTemplate(template, data);
      document.body.appendChild(dialog);
      dialog.addEventListener("click", event => {
        if ( event.target.closest("form") ) return;
        button.classList.remove("active");
        dialog.remove();
      });
      const form = dialog.querySelector("form");
      const rect = button.getBoundingClientRect();
      form.style.top = `${rect.top + 30}px`;
      form.style.left = `${rect.left - 200 + 15}px`;
      dialog.style.zIndex = ++_maxZ;
      form.elements.save?.addEventListener("click", () => {
        button.classList.remove("active");
        dialog.remove();
      });
      dialog.open = true;
      return dialog;
    }

    /* -------------------------------------------- */

    /**
     * Clear any marks from the current selection.
     * @protected
     */
    _clearFormatting() {
      const state = this.view.state;
      const {empty, $from, $to} = state.selection;
      if ( empty ) return;
      const tr = this.view.state.tr;
      for ( const markType of Object.values(this.schema.marks) ) {
        if ( state.doc.rangeHasMark($from.pos, $to.pos, markType) ) tr.removeMark($from.pos, $to.pos, markType);
      }
      const range = $from.blockRange($to);
      const nodePositions = [];
      // Capture any nodes that are completely encompassed by the selection, or ones that begin and end exactly at the
      // selection boundaries (i.e., the user has selected all text inside the node).
      tr.doc.nodesBetween($from.pos, $to.pos, (node, pos) => {
        if ( node.isText ) return false;
        // Node is entirely contained within the selection.
        if ( (pos >= range.start) && (pos + node.nodeSize <= range.end) ) nodePositions.push(pos);
      });
      // Clear marks and attributes from all eligible nodes.
      nodePositions.forEach(pos => {
        const node = state.doc.nodeAt(pos);
        const attrs = {...node.attrs};
        for ( const [attr, spec] of Object.entries(node.type.spec.attrs) ) {
          if ( spec.formatting ) delete attrs[attr];
        }
        tr.setNodeMarkup(pos, null, attrs);
      });
      this.view.dispatch(tr);
    }

    /* -------------------------------------------- */

    /**
     * Toggle link recommendations
     * @protected
     */
    async _toggleMatches() {
      const enabled = game.settings.get("core", "pmHighlightDocumentMatches");
      await game.settings.set("core", "pmHighlightDocumentMatches", !enabled);
      this.items.find(i => i.action === "toggle-matches").active = !enabled;
      this.render();
    }

    /* -------------------------------------------- */

    /**
     * Inserts a horizontal rule at the cursor.
     */
    #insertHorizontalRule() {
      const hr = this.schema.nodes.horizontal_rule;
      this.view.dispatch(this.view.state.tr.replaceSelectionWith(hr.create()).scrollIntoView());
    }

    /* -------------------------------------------- */

    /**
     * Toggle a particular alignment for the given selection.
     * @param {string} alignment  The text alignment to toggle.
     */
    #toggleAlignment(alignment) {
      const state = this.view.state;
      const {$from, $to} = state.selection;
      const range = $from.blockRange($to);
      if ( !range ) return;
      const {paragraph, image} = this.schema.nodes;
      const positions = [];
      // The range positions are absolute, so we need to convert them to be relative to the parent node.
      const blockStart = range.parent.eq(state.doc) ? 0 : range.start;
      // Calculate the positions of all the paragraph nodes that are direct descendents of the blockRange parent node.
      range.parent.nodesBetween(range.start - blockStart, range.end - blockStart, (node, pos) => {
        if ( ![paragraph, image].includes(node.type) ) return false;
        positions.push({pos: blockStart + pos, attrs: node.attrs});
      });
      const tr = state.tr;
      positions.forEach(({pos, attrs}) => {
        const node = state.doc.nodeAt(pos);
        tr.setNodeMarkup(pos, null, {
          ...attrs, alignment: attrs.alignment === alignment ? node.type.attrs.alignment.default : alignment
        });
      });
      this.view.dispatch(tr);
    }

    /* -------------------------------------------- */

    /**
     * @callback MenuToggleBlockWrapCommand
     * @param {NodeType} node   The node to wrap the selection in.
     * @param {object} [attrs]  Attributes for the node.
     * @returns ProseMirrorCommand
     */

    /**
     * Toggle the given selection by wrapping it in a given block or lifting it out of one.
     * @param {NodeType} node                    The type of node being interacted with.
     * @param {MenuToggleBlockWrapCommand} wrap  The wrap command specific to the given node.
     * @param {object} [options]                 Additional options to configure behaviour.
     * @param {object} [options.attrs]           Attributes for the node.
     * @protected
     */
    _toggleBlock(node, wrap, {attrs=null}={}) {
      const state = this.view.state;
      const {$from, $to} = state.selection;
      const range = $from.blockRange($to);
      if ( !range ) return;
      const inBlock = $from.hasAncestor(node);
      if ( inBlock ) {
        // FIXME: This will lift out of the closest block rather than only the given one, and doesn't work on multiple
        // list elements.
        const target = liftTarget(range);
        if ( target != null ) this.view.dispatch(state.tr.lift(range, target));
      } else autoJoin(wrap(node, attrs), [node.name])(state, this.view.dispatch);
    }

    /* -------------------------------------------- */

    /**
     * Toggle the given selection by wrapping it in a given text block, or reverting to a paragraph block.
     * @param {NodeType} node           The type of node being interacted with.
     * @param {object} [options]        Additional options to configure behaviour.
     * @param {object} [options.attrs]  Attributes for the node.
     * @protected
     */
    _toggleTextBlock(node, {attrs=null}={}) {
      const state = this.view.state;
      const {$from, $to} = state.selection;
      const range = $from.blockRange($to);
      if ( !range ) return;
      const inBlock = $from.hasAncestor(node, attrs);
      if ( inBlock ) node = this.schema.nodes.paragraph;
      this.view.dispatch(state.tr.setBlockType(range.start, range.end, node, attrs));
    }
  }

  /**
   * Determine whether a given position has an ancestor node of the given type.
   * @param {NodeType} other  The other node type.
   * @param {object} [attrs]  An object of attributes that must also match, if provided.
   * @returns {boolean}
   */
  ResolvedPos.prototype.hasAncestor = function(other, attrs) {
    if ( !this.depth ) return false;
    for ( let i = this.depth; i > 0; i-- ) { // Depth 0 is the root document, so we don't need to test that.
      const node = this.node(i);
      if ( node.type === other ) {
        const nodeAttrs = foundry.utils.deepClone(node.attrs);
        delete nodeAttrs._preserve; // Do not include our internal attributes in the comparison.
        if ( attrs ) return foundry.utils.objectsEqual(nodeAttrs, attrs);
        return true;
      }
    }
    return false;
  };

  class Rebaseable {
      constructor(step, inverted, origin) {
          this.step = step;
          this.inverted = inverted;
          this.origin = origin;
      }
  }
  /**
  Undo a given set of steps, apply a set of other steps, and then
  redo them @internal
  */
  function rebaseSteps(steps, over, transform) {
      for (let i = steps.length - 1; i >= 0; i--)
          transform.step(steps[i].inverted);
      for (let i = 0; i < over.length; i++)
          transform.step(over[i]);
      let result = [];
      for (let i = 0, mapFrom = steps.length; i < steps.length; i++) {
          let mapped = steps[i].step.map(transform.mapping.slice(mapFrom));
          mapFrom--;
          if (mapped && !transform.maybeStep(mapped).failed) {
              transform.mapping.setMirror(mapFrom, transform.steps.length - 1);
              result.push(new Rebaseable(mapped, mapped.invert(transform.docs[transform.docs.length - 1]), steps[i].origin));
          }
      }
      return result;
  }
  // This state field accumulates changes that have to be sent to the
  // central authority in the collaborating group and makes it possible
  // to integrate changes made by peers into our local document. It is
  // defined by the plugin, and will be available as the `collab` field
  // in the resulting editor state.
  class CollabState {
      constructor(
      // The version number of the last update received from the central
      // authority. Starts at 0 or the value of the `version` property
      // in the option object, for the editor's value when the option
      // was enabled.
      version, 
      // The local steps that havent been successfully sent to the
      // server yet.
      unconfirmed) {
          this.version = version;
          this.unconfirmed = unconfirmed;
      }
  }
  function unconfirmedFrom(transform) {
      let result = [];
      for (let i = 0; i < transform.steps.length; i++)
          result.push(new Rebaseable(transform.steps[i], transform.steps[i].invert(transform.docs[i]), transform));
      return result;
  }
  const collabKey = new PluginKey("collab");
  /**
  Creates a plugin that enables the collaborative editing framework
  for the editor.
  */
  function collab(config = {}) {
      let conf = {
          version: config.version || 0,
          clientID: config.clientID == null ? Math.floor(Math.random() * 0xFFFFFFFF) : config.clientID
      };
      return new Plugin({
          key: collabKey,
          state: {
              init: () => new CollabState(conf.version, []),
              apply(tr, collab) {
                  let newState = tr.getMeta(collabKey);
                  if (newState)
                      return newState;
                  if (tr.docChanged)
                      return new CollabState(collab.version, collab.unconfirmed.concat(unconfirmedFrom(tr)));
                  return collab;
              }
          },
          config: conf,
          // This is used to notify the history plugin to not merge steps,
          // so that the history can be rebased.
          historyPreserveItems: true
      });
  }
  /**
  Create a transaction that represents a set of new steps received from
  the authority. Applying this transaction moves the state forward to
  adjust to the authority's view of the document.
  */
  function receiveTransaction(state, steps, clientIDs, options = {}) {
      // Pushes a set of steps (received from the central authority) into
      // the editor state (which should have the collab plugin enabled).
      // Will recognize its own changes, and confirm unconfirmed steps as
      // appropriate. Remaining unconfirmed steps will be rebased over
      // remote steps.
      let collabState = collabKey.getState(state);
      let version = collabState.version + steps.length;
      let ourID = collabKey.get(state).spec.config.clientID;
      // Find out which prefix of the steps originated with us
      let ours = 0;
      while (ours < clientIDs.length && clientIDs[ours] == ourID)
          ++ours;
      let unconfirmed = collabState.unconfirmed.slice(ours);
      steps = ours ? steps.slice(ours) : steps;
      // If all steps originated with us, we're done.
      if (!steps.length)
          return state.tr.setMeta(collabKey, new CollabState(version, unconfirmed));
      let nUnconfirmed = unconfirmed.length;
      let tr = state.tr;
      if (nUnconfirmed) {
          unconfirmed = rebaseSteps(unconfirmed, steps, tr);
      }
      else {
          for (let i = 0; i < steps.length; i++)
              tr.step(steps[i]);
          unconfirmed = [];
      }
      let newCollabState = new CollabState(version, unconfirmed);
      if (options && options.mapSelectionBackward && state.selection instanceof TextSelection) {
          tr.setSelection(TextSelection.between(tr.doc.resolve(tr.mapping.map(state.selection.anchor, -1)), tr.doc.resolve(tr.mapping.map(state.selection.head, -1)), -1));
          tr.updated &= ~1;
      }
      return tr.setMeta("rebased", nUnconfirmed).setMeta("addToHistory", false).setMeta(collabKey, newCollabState);
  }
  /**
  Provides data describing the editor's unconfirmed steps, which need
  to be sent to the central authority. Returns null when there is
  nothing to send.

  `origins` holds the _original_ transactions that produced each
  steps. This can be useful for looking up time stamps and other
  metadata for the steps, but note that the steps may have been
  rebased, whereas the origin transactions are still the old,
  unchanged objects.
  */
  function sendableSteps(state) {
      let collabState = collabKey.getState(state);
      if (collabState.unconfirmed.length == 0)
          return null;
      return {
          version: collabState.version,
          steps: collabState.unconfirmed.map(s => s.step),
          clientID: collabKey.get(state).spec.config.clientID,
          get origins() {
              return this._origins || (this._origins = collabState.unconfirmed.map(s => s.origin));
          }
      };
  }
  /**
  Get the version up to which the collab plugin has synced with the
  central authority.
  */
  function getVersion(state) {
      return collabKey.getState(state).version;
  }

  var index = /*#__PURE__*/Object.freeze({
    __proto__: null,
    collab: collab,
    getVersion: getVersion,
    rebaseSteps: rebaseSteps,
    receiveTransaction: receiveTransaction,
    sendableSteps: sendableSteps
  });

  class DOMParser extends DOMParser$1 {
    /** @inheritdoc */
    parse(dom, options) {
      this.#unwrapImages(dom);
      return super.parse(dom, options);
    }

    /* -------------------------------------------- */

    /**
     * Unwrap any image tags that may have been wrapped in <p></p> tags in earlier iterations of the schema.
     * @param {HTMLElement} dom  The root HTML element to parse.
     */
    #unwrapImages(dom) {
      dom.querySelectorAll("img").forEach(img => {
        const paragraph = img.parentElement;
        if ( paragraph?.tagName !== "P" ) return;
        const parent = paragraph.parentElement || dom;
        parent.insertBefore(img, paragraph);
        // If the paragraph element was purely holding the image element and is now empty, we can remove it.
        if ( !paragraph.childNodes.length ) paragraph.remove();
      });
    }

    /* -------------------------------------------- */

    /** @inheritdoc */
    static fromSchema(schema) {
      if ( schema.cached.domParser ) return schema.cached.domParser;
      return schema.cached.domParser = new this(schema, this.schemaRules(schema));
    }
  }

  /**
   * @callback ProseMirrorNodeOutput
   * @param {Node} node        The ProseMirror node.
   * @returns {DOMOutputSpec}  The specification to build a DOM node for this ProseMirror node.
   */

  /**
   * @callback ProseMirrorMarkOutput
   * @param {Mark} mark        The ProseMirror mark.
   * @param {boolean} inline   Is the mark appearing in an inline context?
   * @returns {DOMOutputSpec}  The specification to build a DOM node for this ProseMirror mark.
   */

  /**
   * A class responsible for serializing a ProseMirror document into a string of HTML.
   */
  class StringSerializer {
    /**
     * @param {Object<ProseMirrorNodeOutput>} nodes  The node output specs.
     * @param {Object<ProseMirrorMarkOutput>} marks  The mark output specs.
     */
    constructor(nodes, marks) {
      this.#nodes = nodes;
      this.#marks = marks;
    }

    /* -------------------------------------------- */

    /**
     * The node output specs.
     * @type {Object<ProseMirrorNodeOutput>}
     */
    #nodes;

    /* -------------------------------------------- */

    /**
     * The mark output specs.
     * @type {Object<ProseMirrorMarkOutput>}
     */
    #marks;

    /* -------------------------------------------- */

    /**
     * Build a serializer for the given schema.
     * @param {Schema} schema  The ProseMirror schema.
     * @returns {StringSerializer}
     */
    static fromSchema(schema) {
      if ( schema.cached.stringSerializer ) return schema.cached.stringSerializer;
      return schema.cached.stringSerializer =
        new StringSerializer(DOMSerializer.nodesFromSchema(schema), DOMSerializer.marksFromSchema(schema));
    }

    /* -------------------------------------------- */

    /**
     * Create a StringNode from a ProseMirror DOMOutputSpec.
     * @param {DOMOutputSpec} spec                            The specification.
     * @param {boolean} inline                                Whether this is a block or inline node.
     * @returns {{outer: StringNode, [content]: StringNode}}  An object describing the outer node, and a reference to the
     *                                                        child node where content should be appended, if applicable.
     * @protected
     */
    _specToStringNode(spec, inline) {
      if ( typeof spec === "string" ) {
        // This is raw text content.
        const node = new StringNode();
        node.appendChild(spec);
        return {outer: node};
      }

      // Our schema only uses the array type of DOMOutputSpec so we don't need to support the other types here.
      // Array specs take the form of [tagName, ...tail], where the tail elements may be an object of attributes, another
      // array representing a child spec, or the value 0 (read 'hole').
      let attrs = {};
      let [tagName, ...tail] = spec;
      if ( getType(tail[0]) === "Object" ) attrs = tail.shift();
      const outer = new StringNode(tagName, attrs, inline);
      let content;

      for ( const innerSpec of tail ) {
        if ( innerSpec === 0 ) {
          if ( tail.length > 1 ) throw new RangeError("Content hole must be the only child of its parent node.");
          // The outer node and the node to append content to are the same node. The vast majority of our output specs
          // are like this.
          return {outer, content: outer};
        }

        // Otherwise, recursively build any inner specifications and update our content reference to point to wherever the
        // hole is found.
        const {outer: inner, content: innerContent} = this._specToStringNode(innerSpec, true);
        outer.appendChild(inner);
        if ( innerContent ) {
          if ( content ) throw new RangeError("Multiple content holes.");
          content = innerContent;
        }
      }
      return {outer, content};
    }

    /* -------------------------------------------- */

    /**
     * Serialize a ProseMirror fragment into an HTML string.
     * @param {Fragment} fragment    The ProseMirror fragment, a collection of ProseMirror nodes.
     * @param {StringNode} [target]  The target to append to. Not required for the top-level invocation.
     * @returns {StringNode}         A DOM tree representation as a StringNode.
     */
    serializeFragment(fragment, target) {
      target = target ?? new StringNode();
      const stack = [];
      let parent = target;
      fragment.forEach(node => {
        /**
         * Handling marks is a little complicated as ProseMirror stores them in a 'flat' structure, rather than a
         * nested structure that is more natural for HTML. For example, the following HTML:
         *   <em>Almost before <strong>we knew it</strong>, we had left the ground.</em>
         * is represented in ProseMirror's internal structure as:
         *   {marks: [ITALIC], content: "Almost before "}, {marks: [ITALIC, BOLD], content: "we knew it"},
         *   {marks: [ITALIC], content: ", we had left the ground"}
         * In order to translate from the latter back into the former, we maintain a stack. When we see a new mark, we
         * push it onto the stack so that content is appended to that mark. When the mark stops appearing in subsequent
         * nodes, we pop off the stack until we find a mark that does exist, and start appending to that one again.
         *
         * The order that marks appear in the node.marks array is guaranteed to be the order that they were declared in
         * the schema.
         */
        if ( stack.length || node.marks.length ) {
          // Walk along the stack to find a mark that is not already pending (i.e. we haven't seen it yet).
          let pos = 0;
          while ( (pos < stack.length) && (pos < node.marks.length) ) {
            const next = node.marks[pos];
            // If the mark does not span multiple nodes, we can serialize it now rather than waiting.
            if ( !next.eq(stack[pos].mark) || (next.type.spec.spanning === false) ) break;
            pos++;
          }

          // Pop off the stack to reach the position of our mark.
          while ( pos < stack.length ) parent = stack.pop().parent;

          // Add the marks from this point.
          for ( let i = pos; i < node.marks.length; i++ ) {
            const mark = node.marks[i];
            const {outer, content} = this._serializeMark(mark, node.isInline);
            stack.push({mark, parent});
            parent.appendChild(outer);
            parent = content ?? outer;
          }
        }

        // Finally append the content to whichever parent node we've arrived at.
        parent.appendChild(this._toStringNode(node));
      });
      return target;
    }

    /* -------------------------------------------- */

    /**
     * Convert a ProseMirror node representation to a StringNode.
     * @param {Node} node  The ProseMirror node.
     * @returns {StringNode}
     * @protected
     */
    _toStringNode(node) {
      const {outer, content} = this._specToStringNode(this.#nodes[node.type.name](node), node.type.inlineContent);
      if ( content ) {
        if ( node.isLeaf ) throw new RangeError("Content hole not allowed in a leaf node spec.");
        this.serializeFragment(node.content, content);
      }
      return outer;
    }

    /* -------------------------------------------- */

    /**
     * Convert a ProseMirror mark representation to a StringNode.
     * @param {Mark} mark       The ProseMirror mark.
     * @param {boolean} inline  Does the mark appear in an inline context?
     * @returns {{outer: StringNode, [content]: StringNode}}
     * @protected
     */
    _serializeMark(mark, inline) {
      return this._specToStringNode(this.#marks[mark.type.name](mark, inline), true);
    }
  }

  /**
   * A class that behaves like a lightweight DOM node, allowing children to be appended. Serializes to an HTML string.
   */
  class StringNode {
    /**
     * @param {string} [tag]            The tag name. If none is provided, this node's children will not be wrapped in an
     *                                  outer tag.
     * @param {Object<string>} [attrs]  The tag attributes.
     * @param {boolean} [inline=false]  Whether the node appears inline or as a block.
     */
    constructor(tag, attrs={}, inline=true) {
      /**
       * The tag name.
       * @type {string}
       */
      Object.defineProperty(this, "tag", {value: tag, writable: false});

      /**
       * The tag attributes.
       * @type {Object<string>}
       */
      Object.defineProperty(this, "attrs", {value: attrs, writable: false});

      this.#inline = inline;
    }

    /* -------------------------------------------- */

    /**
     * A list of HTML void elements that do not have a closing tag.
     * @type {Set<string>}
     */
    static #VOID = new Set([
      "area", "base", "br", "col", "embed", "hr", "img", "input", "link", "meta", "param", "source", "track", "wbr"
    ]);

    /* -------------------------------------------- */

    /**
     * A list of children. Either other StringNodes, or plain strings.
     * @type {Array<StringNode|string>}
     * @private
     */
    #children = [];

    /* -------------------------------------------- */

    /**
     * @ignore
     */
    #inline;

    /**
     * Whether the node appears inline or as a block.
     */
    get inline() {
      if ( !this.tag || StringNode.#VOID.has(this.tag) || !this.#children.length ) return true;
      return this.#inline;
    }

    /* -------------------------------------------- */

    /**
     * Append a child to this string node.
     * @param {StringNode|string} child  The child node or string.
     * @throws If attempting to append a child to a void element.
     */
    appendChild(child) {
      if ( StringNode.#VOID.has(this.tag) ) throw new Error("Void elements cannot contain children.");
      this.#children.push(child);
    }

    /* -------------------------------------------- */

    /**
     * Serialize the StringNode structure into a single string.
     * @param {string|number} spaces  The number of spaces to use for indentation (maximum 10). If this value is a string,
     *                                that string is used as indentation instead (or the first 10 characters if it is
     *                                longer).
     */
    toString(spaces=0, {_depth=0, _inlineParent=false}={}) {
      let indent = "";
      const isRoot = _depth < 1;
      if ( !_inlineParent ) {
        if ( typeof spaces === "number" ) indent = " ".repeat(Math.min(10, spaces));
        else if ( typeof spaces === "string" ) indent = spaces.substring(0, 10);
        indent = indent.repeat(Math.max(0, _depth - 1));
      }
      const attrs = isEmpty$1(this.attrs) ? "" : " " + Object.entries(this.attrs).map(([k, v]) => `${k}="${v}"`).join(" ");
      const open = this.tag ? `${indent}<${this.tag}${attrs}>` : "";
      if ( StringNode.#VOID.has(this.tag) ) return open;
      const close = this.tag ? `${this.inline && !isRoot ? "" : indent}</${this.tag}>` : "";
      const children = this.#children.map(c => {
        let content = c.toString(spaces, {_depth: _depth + 1, _inlineParent: this.inline});
        if ( !isRoot && !this.tag ) content = StringNode.#escapeHTML(content);
        return content;
      });
      const lineBreak = (this.inline && !isRoot) || !spaces ? "" : "\n";
      return [open, ...children, close].filterJoin(lineBreak);
    }

    /* -------------------------------------------- */

    /**
     * Escape HTML tags within string content.
     * @param {string} content  The string content.
     * @returns {string}
     */
    static #escapeHTML(content) {
      return content.replace(/[<>]/g, char => {
        switch ( char ) {
          case "<": return "&lt;";
          case ">": return "&gt;";
        }
        return char;
      });
    }
  }

  /**
   * Use the DOM and ProseMirror's DOMParser to construct a ProseMirror document state from an HTML string. This cannot be
   * used server-side.
   * @param {string} htmlString  A string of HTML.
   * @param {Schema} [schema]    The ProseMirror schema to use instead of the default one.
   * @returns {Node}             The document node.
   */
  function parseHTMLString(htmlString, schema$1) {
    const target = document.createElement("template");
    target.innerHTML = htmlString;
    return DOMParser.fromSchema(schema$1 ?? schema).parse(target.content);
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
  function serializeHTMLString(doc, {schema: schema$1, spaces}={}) {
    schema$1 = schema$1 ?? schema;
    // If the only content is an empty <p></p> tag, return an empty string.
    if ( (doc.size < 3) && (doc.content[0].type === schema$1.nodes.paragraph) ) return "";
    return StringSerializer.fromSchema(schema$1).serializeFragment(doc.content).toString(spaces);
  }

  /**
   * @callback ProseMirrorSliceTransformer
   * @param {Node} node    The candidate node.
   * @returns {Node|void}  A new node to replace the candidate node, or nothing if a replacement should not be made.
   */

  /**
   * Apply a transformation to some nodes in a slice, and return the new slice.
   * @param {Slice} slice           The slice to transform.
   * @param {function} transformer  The transformation function.
   * @returns {Slice}               Either the original slice if no changes were made, or the newly-transformed slice.
   */
  function transformSlice(slice, transformer) {
    const nodeTree = new Map();
    slice.content.nodesBetween(0, slice.content.size, (node, start, parent, index) => {
      nodeTree.set(node, { parent, index });
    });
    let newSlice;
    const replaceNode = (node, { parent, index }) => {
      // If there is a parent, make the replacement, then recurse up the tree to the root, creating new nodes as we go.
      if ( parent ) {
        const newContent = parent.content.replaceChild(index, node);
        const newParent = parent.copy(newContent);
        replaceNode(newParent, nodeTree.get(parent));
        return;
      }

      // Otherwise, handle replacing the root slice's content.
      const targetSlice = newSlice ?? slice;
      const fragment = targetSlice.content;
      const newFragment = fragment.replaceChild(index, node);
      newSlice = new Slice(newFragment, targetSlice.openStart, targetSlice.openEnd);
    };
    for ( const [node, treeInfo] of nodeTree.entries() ) {
      const newNode = transformer(node);
      if ( newNode ) replaceNode(newNode, treeInfo);
    }
    return newSlice ?? slice;
  }

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

  /* -------------------------------------------- */

  const blockquote = {
    content: "block+",
    group: "block",
    defining: true,
    parseDOM: [{tag: "blockquote"}],
    toDOM: () => ["blockquote", 0]
  };

  /* -------------------------------------------- */

  const hr = {
    group: "block",
    parseDOM: [{tag: "hr"}],
    toDOM: () => ["hr"]
  };

  /* -------------------------------------------- */

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

  /* -------------------------------------------- */

  const pre = {
    content: "text*",
    marks: "",
    group: "block",
    code: true,
    defining: true,
    parseDOM: [{tag: "pre", preserveWhitespace: "full"}],
    toDOM: () => ["pre", ["code", 0]]
  };

  /* -------------------------------------------- */

  const br = {
    inline: true,
    group: "inline",
    selectable: false,
    parseDOM: [{tag: "br"}],
    toDOM: () => ["br"]
  };

  // A list of tag names that are considered allowable inside a node that only supports inline content.
  const INLINE_TAGS = new Set(["A", "EM", "I", "STRONG", "B", "CODE", "U", "S", "DEL", "SUP", "SUB", "SPAN"]);

  /**
   * Determine if an HTML element contains purely inline content, i.e. only text nodes and 'mark' elements.
   * @param {HTMLElement} element  The element.
   * @returns {boolean}
   */
  function onlyInlineContent(element) {
    for ( const child of element.children ) {
      if ( !INLINE_TAGS.has(child.tagName) ) return false;
    }
    return true;
  }

  /* -------------------------------------------- */

  /**
   * Determine if an HTML element is empty.
   * @param {HTMLElement} element  The element.
   * @returns {boolean}
   */
  function isElementEmpty(element) {
    return !element.childNodes.length;
  }

  /* -------------------------------------------- */

  /**
   * Convert an element's style attribute string into an object.
   * @param {string} str  The style string.
   * @returns {object}
   */
  function stylesFromString(str) {
    return Object.fromEntries(str.split(/;\s*/g).map(prop => prop.split(/:\s*/)));
  }

  /* -------------------------------------------- */

  /**
   * Merge two style attribute strings.
   * @param {string} a  The first style string.
   * @param {string} b  The second style string.
   * @returns {string}
   */
  function mergeStyle(a, b) {
    const allStyles = mergeObject(stylesFromString(a), stylesFromString(b));
    return Object.entries(allStyles).map(([k, v]) => v ? `${k}: ${v}` : null).filterJoin("; ");
  }

  /* -------------------------------------------- */

  /**
   * Convert an element's class attribute string into an array of class names.
   * @param {string} str  The class string.
   * @returns {string[]}
   */
  function classesFromString(str) {
    return str.split(/\s+/g);
  }

  /* -------------------------------------------- */

  /**
   * Merge two class attribute strings.
   * @param {string} a  The first class string.
   * @param {string} b  The second class string.
   * @returns {string}
   */
  function mergeClass(a, b) {
    const allClasses = classesFromString(a).concat(classesFromString(b));
    return Array.from(new Set(allClasses)).join(" ");
  }

  const ol = {
    content: "(list_item | list_item_text)+",
    managed: {attributes: ["start"]},
    group: "block",
    attrs: {order: {default: 1}},
    parseDOM: [{tag: "ol", getAttrs: el => ({order: el.hasAttribute("start") ? Number(el.start) : 1})}],
    toDOM: node => node.attrs.order === 1 ? ["ol", 0] : ["ol", {start: node.attrs.order}, 0]
  };

  /* -------------------------------------------- */

  const ul = {
    content: "(list_item | list_item_text)+",
    group: "block",
    parseDOM: [{tag: "ul"}],
    toDOM: () => ["ul", 0]
  };

  /* -------------------------------------------- */

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

  /* -------------------------------------------- */

  const liText = {
    content: "text*",
    defining: true,
    parseDOM: [{tag: "li", getAttrs: el => {
        // If this contains any non-inline elements, do not use this node type.
        if ( isElementEmpty(el) || !onlyInlineContent(el) ) return false;
      }}],
    toDOM: () => ["li", 0]
  };

  const CELL_ATTRS = {
    colspan: {default: 1},
    rowspan: {default: 1},
    colwidth: {default: null}
  };

  const MANAGED_CELL_ATTRS = {
    attributes: ["colspan", "rowspan", "data-colwidth"]
  };

  // If any of these elements are part of a table, consider it a 'complex' table and do not attempt to make it editable.
  const COMPLEX_TABLE_ELEMENTS = new Set(["CAPTION", "COLGROUP", "THEAD", "TFOOT"]);

  /* -------------------------------------------- */
  /*  Utilities                                   */
  /* -------------------------------------------- */

  /**
   * Determine node attributes for a table cell when parsing the DOM.
   * @param {HTMLTableCellElement} cell  The table cell DOM node.
   * @returns {{colspan: number, rowspan: number}}
   */
  function getTableCellAttrs(cell) {
    const colspan = cell.getAttribute("colspan") || 1;
    const rowspan = cell.getAttribute("rowspan") || 1;
    return {
      colspan: Number(colspan),
      rowspan: Number(rowspan)
    };
  }

  /**
   * Determine the HTML attributes to be set on the table cell DOM node based on its ProseMirror node attributes.
   * @param {Node} node  The table cell ProseMirror node.
   * @returns {object}   An object of attribute name -> attribute value.
   */
  function setTableCellAttrs(node) {
    const attrs = {};
    const {colspan, rowspan} = node.attrs;
    if ( colspan !== 1 ) attrs.colspan = colspan;
    if ( rowspan !== 1 ) attrs.rowspan = rowspan;
    return attrs;
  }

  /**
   * Whether this element exists as part of a 'complex' table.
   * @param {HTMLElement} el  The element to test.
   * @returns {boolean|void}
   */
  function inComplexTable(el) {
    const table = el.closest("table");
    if ( !table ) return;
    return Array.from(table.children).some(child => COMPLEX_TABLE_ELEMENTS.has(child.tagName));
  }

  /* -------------------------------------------- */
  /*  Built-in Tables                             */
  /* -------------------------------------------- */

  const builtInTableNodes = tableNodes({
    tableGroup: "block",
    cellContent: "block+"
  });

  /* -------------------------------------------- */
  /*  'Complex' Tables                            */
  /* -------------------------------------------- */

  const tableComplex = {
    content: "(caption | caption_block)? colgroup? thead? tbody tfoot?",
    isolating: true,
    group: "block",
    parseDOM: [{tag: "table", getAttrs: el => {
        if ( inComplexTable(el) === false ) return false;
      }}],
    toDOM: () => ["table", 0]
  };

  /* -------------------------------------------- */

  const colgroup = {
    content: "col*",
    isolating: true,
    parseDOM: [{tag: "colgroup"}],
    toDOM: () => ["colgroup", 0]
  };

  /* -------------------------------------------- */

  const col = {
    tableRole: "col",
    parseDOM: [{tag: "col"}],
    toDOM: () => ["col"]
  };

  /* -------------------------------------------- */

  const thead = {
    content: "table_row_complex+",
    isolating: true,
    parseDOM: [{tag: "thead"}],
    toDOM: () => ["thead", 0]
  };

  /* -------------------------------------------- */

  const tbody = {
    content: "table_row_complex+",
    isolating: true,
    parseDOM: [{tag: "tbody", getAttrs: el => {
        if ( inComplexTable(el) === false ) return false;
      }}],
    toDOM: () => ["tbody", 0]
  };

  /* -------------------------------------------- */

  const tfoot = {
    content: "table_row_complex+",
    isolating: true,
    parseDOM: [{tag: "tfoot"}],
    toDOM: () => ["tfoot", 0]
  };

  /* -------------------------------------------- */

  const caption = {
    content: "text*",
    isolating: true,
    parseDOM: [{tag: "caption", getAttrs: el => {
        if ( !isElementEmpty(el) && !onlyInlineContent(el) ) return false;
      }}],
    toDOM: () => ["caption", 0]
  };

  /* -------------------------------------------- */

  const captionBlock = {
    content: "block*",
    isolating: true,
    parseDOM: [{tag: "caption", getAttrs: el => {
        if ( isElementEmpty(el) || onlyInlineContent(el) ) return false;
      }}],
    toDOM: () => ["caption", 0]
  };

  /* -------------------------------------------- */

  const tableRowComplex = {
    content: "(table_cell_complex | table_header_complex | table_cell_complex_block | table_header_complex_block)*",
    parseDOM: [{tag: "tr", getAttrs: el => {
        if ( inComplexTable(el) === false ) return false;
      }}],
    toDOM: () => ["tr", 0]
  };

  /* -------------------------------------------- */

  const tableCellComplex = {
    content: "text*",
    attrs: CELL_ATTRS,
    managed: MANAGED_CELL_ATTRS,
    isolating: true,
    parseDOM: [{tag: "td", getAttrs: el => {
        if ( inComplexTable(el) === false ) return false;
        if ( !isElementEmpty(el) && !onlyInlineContent(el) ) return false;
        return getTableCellAttrs(el);
      }}],
    toDOM: node => ["td", setTableCellAttrs(node), 0]
  };

  /* -------------------------------------------- */

  const tableCellComplexBlock = {
    content: "block*",
    attrs: CELL_ATTRS,
    managed: MANAGED_CELL_ATTRS,
    isolating: true,
    parseDOM: [{tag: "td", getAttrs: el => {
        if ( inComplexTable(el) === false ) return false;
        if ( isElementEmpty(el) || onlyInlineContent(el) ) return false;
        return getTableCellAttrs(el);
      }}],
    toDOM: node => ["td", setTableCellAttrs(node), 0]
  };

  /* -------------------------------------------- */

  const tableHeaderComplex = {
    content: "text*",
    attrs: CELL_ATTRS,
    managed: MANAGED_CELL_ATTRS,
    isolating: true,
    parseDOM: [{tag: "th", getAttrs: el => {
        if ( inComplexTable(el) === false ) return false;
        if ( !isElementEmpty(el) && !onlyInlineContent(el) ) return false;
        return getTableCellAttrs(el);
      }}],
    toDOM: node => ["th", setTableCellAttrs(node), 0]
  };

  /* -------------------------------------------- */

  const tableHeaderComplexBlock = {
    content: "block*",
    attrs: CELL_ATTRS,
    managed: MANAGED_CELL_ATTRS,
    isolating: true,
    parseDOM: [{tag: "th", getAttrs: el => {
        if ( inComplexTable(el) === false ) return false;
        if ( isElementEmpty(el) || onlyInlineContent(el) ) return false;
        return getTableCellAttrs(el);
      }}],
    toDOM: node => ["th", setTableCellAttrs(node), 0]
  };

  // These nodes are supported for HTML preservation purposes, but do not have robust editing support for now.

  const details = {
    content: "(summary | summary_block) block*",
    group: "block",
    defining: true,
    parseDOM: [{tag: "details"}],
    toDOM: () => ["details", 0]
  };

  /* -------------------------------------------- */

  const summary = {
    content: "text*",
    defining: true,
    parseDOM: [{tag: "summary", getAttrs: el => {
        // If this contains any non-inline elements, do not use this node type.
        if ( !isElementEmpty(el) && !onlyInlineContent(el) ) return false;
      }}],
    toDOM: () => ["summary", 0]
  };

  /* -------------------------------------------- */

  const summaryBlock = {
    content: "block+",
    defining: true,
    parseDOM: [{tag: "summary", getAttrs: el => {
        // If this contains only text nodes and no elements, do not use this node type.
        if ( isElementEmpty(el) || onlyInlineContent(el) ) return false;
      }}],
    toDOM: () => ["summary", 0]
  };

  /* -------------------------------------------- */

  const dl = {
    content: "(block|dt|dd)*",
    group: "block",
    defining: true,
    parseDOM: [{tag: "dl"}],
    toDOM: () => ["dl", 0]
  };

  /* -------------------------------------------- */

  const dt = {
    content: "block+",
    defining: true,
    parseDOM: [{tag: "dt"}],
    toDOM: () => ["dt", 0]
  };

  /* -------------------------------------------- */

  const dd = {
    content: "block+",
    defining: true,
    parseDOM: [{tag: "dd"}],
    toDOM: () => ["dd", 0]
  };

  /* -------------------------------------------- */

  const fieldset = {
    content: "legend block*",
    group: "block",
    defining: true,
    parseDOM: [{tag: "fieldset"}],
    toDOM: () => ["fieldset", 0]
  };

  /* -------------------------------------------- */

  const legend = {
    content: "inline+",
    defining: true,
    parseDOM: [{tag: "legend"}],
    toDOM: () => ["legend", 0]
  };

  /* -------------------------------------------- */

  const picture = {
    content: "source* image",
    group: "block",
    defining: true,
    parseDOM: [{tag: "picture"}],
    toDOM: () => ["picture", 0]
  };

  /* -------------------------------------------- */

  const audio = {
    content: "source* track*",
    group: "block",
    parseDOM: [{tag: "audio"}],
    toDOM: () => ["audio", 0]
  };

  /* -------------------------------------------- */

  const video = {
    content: "source* track*",
    group: "block",
    parseDOM: [{tag: "video"}],
    toDOM: () => ["video", 0]
  };

  /* -------------------------------------------- */

  const track = {
    parseDOM: [{tag: "track"}],
    toDOM: () => ["track"]
  };

  /* -------------------------------------------- */

  const source = {
    parseDOM: [{tag: "source"}],
    toDOM: () => ["source"]
  };

  /* -------------------------------------------- */

  const object = {
    inline: true,
    group: "inline",
    parseDOM: [{tag: "object"}],
    toDOM: () => ["object"]
  };

  /* -------------------------------------------- */

  const figure = {
    content: "(figcaption|block)*",
    group: "block",
    defining: true,
    parseDOM: [{tag: "figure"}],
    toDOM: () => ["figure", 0]
  };

  /* -------------------------------------------- */

  const figcaption = {
    content: "inline+",
    defining: true,
    parseDOM: [{tag: "figcaption"}],
    toDOM: () => ["figcaption", 0]
  };

  /* -------------------------------------------- */

  const small = {
    content: "paragraph block*",
    group: "block",
    defining: true,
    parseDOM: [{tag: "small"}],
    toDOM: () => ["small", 0]
  };

  /* -------------------------------------------- */

  const ruby = {
    content: "(rp|rt|block)+",
    group: "block",
    defining: true,
    parseDOM: [{tag: "ruby"}],
    toDOM: () => ["ruby", 0]
  };

  /* -------------------------------------------- */

  const rp = {
    content: "inline+",
    parseDOM: [{tag: "rp"}],
    toDOM: () => ["rp", 0]
  };

  /* -------------------------------------------- */

  const rt = {
    content: "inline+",
    parseDOM: [{tag: "rt"}],
    toDOM: () => ["rt", 0]
  };

  /* -------------------------------------------- */

  const iframe = {
    attrs: { sandbox: { default: "allow-scripts allow-forms" } },
    managed: { attributes: ["sandbox"] },
    group: "block",
    defining: true,
    parseDOM: [{tag: "iframe", getAttrs: el => {
      let sandbox = "allow-scripts allow-forms";
      const url = URL.parseSafe(el.src);
      const host = url?.hostname;
      const isTrusted = CONST.TRUSTED_IFRAME_DOMAINS.some(domain => (host === domain) || host?.endsWith(`.${domain}`));
      if ( isTrusted ) sandbox = null;
      return { sandbox };
    }}],
    toDOM: node => {
      const attrs = {};
      if ( node.attrs.sandbox ) attrs.sandbox = node.attrs.sandbox;
      return ["iframe", attrs];
    }
  };

  const em = {
    parseDOM: [{tag: "i"}, {tag: "em"}, {style: "font-style=italic"}],
    toDOM: () => ["em", 0]
  };

  /* -------------------------------------------- */

  const strong = {
    parseDOM: [
      {tag: "strong"},
      {tag: "b"},
      {style: "font-weight", getAttrs: weight => /^(bold(er)?|[5-9]\d{2})$/.test(weight) && null}
    ],
    toDOM: () => ["strong", 0]
  };

  /* -------------------------------------------- */

  const code = {
    parseDOM: [{tag: "code"}],
    toDOM: () => ["code", 0]
  };

  /* -------------------------------------------- */

  const underline = {
    parseDOM: [{tag: "u"}, {style: "text-decoration=underline"}],
    toDOM: () => ["span", {style: "text-decoration: underline;"}, 0]
  };

  /* -------------------------------------------- */

  const strikethrough = {
    parseDOM: [{tag: "s"}, {tag: "del"}, {style: "text-decoration=line-through"}],
    toDOM: () => ["s", 0]
  };

  /* -------------------------------------------- */

  const superscript = {
    parseDOM: [{tag: "sup"}, {style: "vertical-align=super"}],
    toDOM: () => ["sup", 0]
  };

  /* -------------------------------------------- */

  const subscript = {
    parseDOM: [{tag: "sub"}, {style: "vertical-align=sub"}],
    toDOM: () => ["sub", 0]
  };

  /* -------------------------------------------- */

  const span = {
    parseDOM: [{tag: "span", getAttrs: el => {
        if ( el.style.fontFamily ) return false;
        return {};
      }}],
    toDOM: () => ["span", 0]
  };

  /* -------------------------------------------- */

  const font = {
    attrs: {
      family: {}
    },
    parseDOM: [{style: "font-family", getAttrs: family => ({family})}],
    toDOM: node => ["span", {style: `font-family: ${node.attrs.family.replaceAll('"', "'")}`}]
  };

  /**
   * An abstract interface for a ProseMirror schema definition.
   * @abstract
   */
  class SchemaDefinition {
    /* -------------------------------------------- */
    /*  Properties                                  */
    /* -------------------------------------------- */

    /**
     * The HTML tag selector this node is associated with.
     * @type {string}
     */
    static tag = "";

    /* -------------------------------------------- */
    /*  Methods                                     */
    /* -------------------------------------------- */

    /**
     * Schema attributes.
     * @returns {Object<AttributeSpec>}
     * @abstract
     */
    static get attrs() {
      throw new Error("SchemaDefinition subclasses must implement the attrs getter.");
    }

    /* -------------------------------------------- */

    /**
     * Check if an HTML element is appropriate to represent as this node, and if so, extract its schema attributes.
     * @param {HTMLElement} el    The HTML element.
     * @returns {object|boolean}  Returns false if the HTML element is not appropriate for this schema node, otherwise
     *                            returns its attributes.
     * @abstract
     */
    static getAttrs(el) {
      throw new Error("SchemaDefinition subclasses must implement the getAttrs method.");
    }

    /* -------------------------------------------- */

    /**
     * Convert a ProseMirror Node back into an HTML element.
     * @param {Node} node  The ProseMirror node.
     * @returns {[string, any]}
     * @abstract
     */
    static toDOM(node) {
      throw new Error("SchemaDefinition subclasses must implement the toDOM method.");
    }

    /* -------------------------------------------- */

    /**
     * Create the ProseMirror schema specification.
     * @returns {NodeSpec|MarkSpec}
     * @abstract
     */
    static make() {
      return {
        attrs: this.attrs,
        parseDOM: [{tag: this.tag, getAttrs: this.getAttrs.bind(this)}],
        toDOM: this.toDOM.bind(this)
      };
    }
  }

  /**
   * A class responsible for encapsulating logic around image nodes in the ProseMirror schema.
   * @extends {SchemaDefinition}
   */
  class ImageNode extends SchemaDefinition {
    /** @override */
    static tag = "img[src]";

    /* -------------------------------------------- */

    /** @override */
    static get attrs() {
      return {
        src: {},
        alt: {default: null},
        title: {default: null},
        width: {default: ""},
        height: {default: ""},
        alignment: {default: "", formatting: true}
      };
    }

    /* -------------------------------------------- */

    /** @override */
    static getAttrs(el) {
      const attrs = {
        src: el.getAttribute("src"),
        title: el.title,
        alt: el.alt
      };
      if ( el.classList.contains("centered") ) attrs.alignment = "center";
      else if ( el.style.float ) attrs.alignment = el.style.float;
      if ( el.hasAttribute("width") ) attrs.width = el.width;
      if ( el.hasAttribute("height") ) attrs.height = el.height;
      return attrs;
    }

    /* -------------------------------------------- */

    /** @override */
    static toDOM(node) {
      const {src, alt, title, width, height, alignment} = node.attrs;
      const attrs = {src};
      if ( alignment === "center" ) attrs.class = "centered";
      else if ( alignment ) attrs.style = `float: ${alignment};`;
      if ( alt ) attrs.alt = alt;
      if ( title ) attrs.title = title;
      if ( width ) attrs.width = width;
      if ( height ) attrs.height = height;
      return ["img", attrs];
    }

    /* -------------------------------------------- */

    /** @inheritdoc */
    static make() {
      return mergeObject(super.make(), {
        managed: {styles: ["float"], classes: ["centered"]},
        group: "block",
        draggable: true
      });
    }
  }

  /**
   * A class responsible for encapsulating logic around link marks in the ProseMirror schema.
   * @extends {SchemaDefinition}
   */
  class LinkMark extends SchemaDefinition {
    /** @override */
    static tag = "a";

    /* -------------------------------------------- */

    /** @override */
    static get attrs() {
      return {
        href: { default: null },
        title: { default: null }
      }
    }

    /* -------------------------------------------- */

    /** @override */
    static getAttrs(el) {
      if ( (el.children.length === 1) && (el.children[0]?.tagName === "IMG") ) return false;
      return { href: el.href, title: el.title };
    }

    /* -------------------------------------------- */

    /** @override */
    static toDOM(node) {
      const { href, title } = node.attrs;
      const attrs = {};
      if ( href ) attrs.href = href;
      if ( title ) attrs.title = title;
      return ["a", attrs];
    }

    /* -------------------------------------------- */

    /** @inheritdoc */
    static make() {
      return mergeObject(super.make(), {
        inclusive: false
      });
    }

    /* -------------------------------------------- */

    /**
     * Handle clicks on link marks while editing.
     * @param {EditorView} view     The ProseMirror editor view.
     * @param {number} pos          The position in the ProseMirror document that the click occurred at.
     * @param {PointerEvent} event  The click event.
     * @param {Mark} mark           The Mark instance.
     * @returns {boolean|void}      Returns true to indicate the click was handled here and should not be propagated to
     *                              other plugins.
     */
    static onClick(view, pos, event, mark) {
      if ( (event.ctrlKey || event.metaKey) && mark.attrs.href ) window.open(mark.attrs.href, "_blank");
      return true;
    }
  }

  /**
   * A class responsible for encapsulating logic around image-link nodes in the ProseMirror schema.
   * @extends {SchemaDefinition}
   */
  class ImageLinkNode extends SchemaDefinition {
    /** @override */
    static tag = "a";

    /* -------------------------------------------- */

    /** @override */
    static get attrs() {
      return mergeObject(ImageNode.attrs, LinkMark.attrs);
    }

    /* -------------------------------------------- */

    /** @override */
    static getAttrs(el) {
      if ( (el.children.length !== 1) || (el.children[0].tagName !== "IMG") ) return false;
      const attrs = ImageNode.getAttrs(el.children[0]);
      attrs.href = el.href;
      attrs.title = el.title;
      return attrs;
    }

    /* -------------------------------------------- */

    /** @override */
    static toDOM(node) {
      const spec = LinkMark.toDOM(node);
      spec.push(ImageNode.toDOM(node));
      return spec;
    }

    /* -------------------------------------------- */

    /** @inheritdoc */
    static make() {
      return mergeObject(super.make(), {
        group: "block",
        draggable: true,
        managed: { styles: ["float"], classes: ["centered"] }
      });
    }

    /* -------------------------------------------- */

    /**
     * Handle clicking on image links while editing.
     * @param {EditorView} view     The ProseMirror editor view.
     * @param {number} pos          The position in the ProseMirror document that the click occurred at.
     * @param {PointerEvent} event  The click event.
     * @param {Node} node           The Node instance.
     */
    static onClick(view, pos, event, node) {
      if ( (event.ctrlKey || event.metaKey) && node.attrs.href ) window.open(node.attrs.href, "_blank");
      // For some reason, calling event.preventDefault in this (mouseup) handler is not enough to cancel the default click
      // behaviour. It seems to be related to the outer anchor being set to contenteditable="false" by ProseMirror.
      // This workaround seems to prevent the click.
      const parent = event.target.parentElement;
      if ( (parent.tagName === "A") && !parent.isContentEditable ) parent.contentEditable = "true";
      return true;
    }
  }

  /**
   * A class responsible for encapsulating logic around secret nodes in the ProseMirror schema.
   * @extends {SchemaDefinition}
   */
  class SecretNode extends SchemaDefinition {
    /** @override */
    static tag = "section";

    /* -------------------------------------------- */

    /** @override */
    static get attrs() {
      return {
        revealed: { default: false },
        id: {}
      };
    }

    /* -------------------------------------------- */

    /** @override */
    static getAttrs(el) {
      if ( !el.classList.contains("secret") ) return false;
      return {
        revealed: el.classList.contains("revealed"),
        id: el.id || `secret-${randomID()}`
      };
    }

    /* -------------------------------------------- */

    /** @override */
    static toDOM(node) {
      const attrs = {
        id: node.attrs.id,
        class: `secret${node.attrs.revealed ? " revealed" : ""}`
      };
      return ["section", attrs, 0];
    }

    /* -------------------------------------------- */

    /** @inheritdoc */
    static make() {
      return mergeObject(super.make(), {
        content: "block+",
        group: "block",
        defining: true,
        managed: { attributes: ["id"], classes: ["revealed"] }
      });
    }

    /* -------------------------------------------- */

    /**
     * Handle splitting a secret block in two, making sure the new block gets a unique ID.
     * @param {EditorState} state                   The ProseMirror editor state.
     * @param {(tr: Transaction) => void} dispatch  The editor dispatch function.
     */
    static split(state, dispatch) {
      const secret = state.schema.nodes.secret;
      const { $cursor } = state.selection;
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
    }
  }

  /**
   * @typedef {object} AllowedAttributeConfiguration
   * @property {Set<string>} attrs   The set of exactly-matching attribute names.
   * @property {string[]} wildcards  A list of wildcard allowed prefixes for attributes.
   */

  /**
   * @typedef {object} ManagedAttributesSpec
   * @property {string[]} attributes  A list of managed attributes.
   * @property {string[]} styles      A list of CSS property names that are managed as inline styles.
   * @property {string[]} classes     A list of managed class names.
   */

  /**
   * A class responsible for injecting attribute capture logic into the ProseMirror schema.
   */
  class AttributeCapture {
    constructor() {
      this.#parseAllowedAttributesConfig(CONST.ALLOWED_HTML_ATTRIBUTES ?? {});
    }

    /* -------------------------------------------- */

    /**
     * The configuration of attributes that are allowed on HTML elements.
     * @type {Record<string, AllowedAttributeConfiguration>}
     */
    #allowedAttrs = {};

    /* -------------------------------------------- */

    /**
     * Augments the schema definition to allow each node or mark to capture all the attributes on an element and preserve
     * them when re-serialized back into the DOM.
     * @param {NodeSpec|MarkSpec} spec  The schema specification.
     */
    attributeCapture(spec) {
      if ( !spec.parseDOM ) return;
      if ( !spec.attrs ) spec.attrs = {};
      spec.attrs._preserve = { default: {}, formatting: true };
      spec.parseDOM.forEach(rule => {
        if ( rule.style ) return; // This doesn't work for style rules. We need a different solution there.
        const getAttrs = rule.getAttrs;
        rule.getAttrs = el => {
          let attrs = getAttrs?.(el);
          if ( attrs === false ) return false;
          if ( typeof attrs !== "object" ) attrs = {};
          mergeObject(attrs, rule.attrs);
          mergeObject(attrs, { _preserve: this.#captureAttributes(el, spec.managed) });
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
          domSpec[1] = mergeObject(preserved, attrs, { inplace: false });
          if ( ("style" in preserved) && ("style" in attrs) ) domSpec[1].style = mergeStyle(preserved.style, attrs.style);
          if ( ("class" in preserved) && ("class" in attrs) ) domSpec[1].class = mergeClass(preserved.class, attrs.class);
        }
        else domSpec.splice(1, 0, { ...preserved });
        return domSpec;
      };
    }

    /* -------------------------------------------- */

    /**
     * Capture all allowable attributes present on an HTML element and store them in an object for preservation in the
     * schema.
     * @param {HTMLElement} el                 The element.
     * @param {ManagedAttributesSpec} managed  An object containing the attributes, styles, and classes that are managed
     *                                         by the ProseMirror node and should not be preserved.
     * @returns {Attrs}
     */
    #captureAttributes(el, managed={}) {
      const allowed = this.#allowedAttrs[el.tagName.toLowerCase()] ?? this.#allowedAttrs["*"];
      return Array.from(el.attributes).reduce((obj, attr) => {
        if ( attr.name.startsWith("data-pm-") ) return obj; // Ignore attributes managed by the ProseMirror editor itself.
        if ( managed.attributes?.includes(attr.name) ) return obj; // Ignore attributes managed by the node.
        // Ignore attributes that are not allowed.
        if ( !allowed.wildcards.some(prefix => attr.name.startsWith(prefix)) && !allowed.attrs.has(attr.name) ) {
          return obj;
        }
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

    /* -------------------------------------------- */

    /**
     * Parse the configuration of allowed attributes into a more performant structure.
     * @param {Record<string, string[]>} config  The allowed attributes configuration.
     */
    #parseAllowedAttributesConfig(config) {
      const all = this.#allowedAttrs["*"] = this.#parseAllowedAttributes(config["*"] ?? []);
      for ( const [tag, attrs] of Object.entries(config ?? {}) ) {
        if ( tag === "*" ) continue;
        const allowed = this.#allowedAttrs[tag] = this.#parseAllowedAttributes(attrs);
        all.attrs.forEach(allowed.attrs.add, allowed.attrs);
        allowed.wildcards.push(...all.wildcards);
      }
    }

    /* -------------------------------------------- */

    /**
     * Parse an allowed attributes configuration into a more efficient structure.
     * @param {string[]} attrs  The list of allowed attributes.
     * @returns {AllowedAttributeConfiguration}
     */
    #parseAllowedAttributes(attrs) {
      const allowed = { wildcards: [], attrs: new Set() };
      for ( const attr of attrs ) {
        const wildcard = attr.indexOf("*");
        if ( wildcard < 0 ) allowed.attrs.add(attr);
        else allowed.wildcards.push(attr.substring(0, wildcard));
      }
      return allowed;
    }
  }

  const doc = {
    content: "block+"
  };

  const text = {
    group: "inline"
  };

  const secret = SecretNode.make();
  const link = LinkMark.make();
  const image = ImageNode.make();
  const imageLink = ImageLinkNode.make();

  const nodes = {
    // Core Nodes.
    doc, text, paragraph, blockquote, secret, horizontal_rule: hr, heading, code_block: pre, image_link: imageLink, image,
    hard_break: br,

    // Lists.
    ordered_list: ol, bullet_list: ul, list_item: li, list_item_text: liText,

    // Tables
    table_complex: tableComplex, tbody, thead, tfoot, caption, caption_block: captionBlock, colgroup, col, table_row_complex: tableRowComplex, table_cell_complex: tableCellComplex,
    table_header_complex: tableHeaderComplex, table_cell_complex_block: tableCellComplexBlock, table_header_complex_block: tableHeaderComplexBlock,
    ...builtInTableNodes,

    // Misc.
    details, summary, summary_block: summaryBlock, dl, dt, dd, fieldset, legend, picture, audio, video, track, source, object, figure,
    figcaption, small, ruby, rp, rt, iframe
  };

  const marks = {superscript, subscript, span, font, link, em, strong, underline, strikethrough, code};

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

  const all = Object.values(nodes).concat(Object.values(marks));
  const capture = new AttributeCapture();
  all.forEach(capture.attributeCapture.bind(capture));

  const schema = new Schema({nodes, marks});

  /* -------------------------------------------- */
  /*  Handlers                                    */
  /* -------------------------------------------- */

  schema.nodes.list_item.split = splitListItem(schema.nodes.list_item);
  schema.nodes.secret.split = SecretNode.split;
  schema.marks.link.onClick = LinkMark.onClick;
  schema.nodes.image_link.onClick = ImageLinkNode.onClick;

  /** @module validators */

  /**
   * Test whether a file path has an extension in a list of provided extensions
   * @param {string} path
   * @param {string[]} extensions
   * @return {boolean}
   */
  function hasFileExtension(path, extensions) {
    const xts = extensions.map(ext => `\\.${ext}`).join("|");
    const rgx = new RegExp(`(${xts})(\\?.*)?$`, "i");
    return !!path && rgx.test(path);
  }

  /**
   * Test whether a string data blob contains base64 data, optionally of a specific type or types
   * @param {string} data       The candidate string data
   * @param {string[]} [types]  An array of allowed mime types to test
   * @return {boolean}
   */
  function isBase64Data(data, types) {
    if ( types === undefined ) return /^data:([a-z]+)\/([a-z0-9]+);base64,/.test(data);
    return types.some(type => data.startsWith(`data:${type};base64,`))
  }

  /**
   * A class responsible for handle drag-and-drop and pasting of image content. Ensuring no base64 data is injected
   * directly into the journal content and it is instead uploaded to the user's data directory.
   * @extends {ProseMirrorPlugin}
   */
  class ProseMirrorImagePlugin extends ProseMirrorPlugin {
    /**
     * @param {Schema} schema                    The ProseMirror schema.
     * @param {object} options                   Additional options to configure the plugin's behaviour.
     * @param {ClientDocument} options.document  A related Document to store extract base64 images for.
     */
    constructor(schema, {document}={}) {
      super(schema);

      if ( !document ) {
        throw new Error("The image drop and pasting plugin requires a reference to a related Document to function.");
      }

      /**
       * The related Document to store extracted base64 images for.
       * @type {ClientDocument}
       */
      Object.defineProperty(this, "document", {value: document, writable: false});
    }

    /* -------------------------------------------- */

    /** @inheritdoc */
    static build(schema, options={}) {
      const plugin = new ProseMirrorImagePlugin(schema, options);
      return new Plugin({
        props: {
          handleDrop: plugin._onDrop.bind(plugin),
          handlePaste: plugin._onPaste.bind(plugin)
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
      // This is a drag-drop of internal editor content which we do not need to handle specially.
      if ( moved ) return;
      const pos = view.posAtCoords({left: event.clientX, top: event.clientY});
      if ( !pos ) return; // This was somehow dropped outside the editor content.

      if ( event.dataTransfer.types.some(t => t === "text/uri-list") ) {
        const uri = event.dataTransfer.getData("text/uri-list");
        if ( !isBase64Data(uri) ) return; // This is a direct URL hotlink which we can just embed without issue.
      }

      // Handle image drops.
      if ( event.dataTransfer.files.length ) {
        this._uploadImages(view, event.dataTransfer.files, pos.pos);
        return true;
      }
    }

    /* -------------------------------------------- */

    /**
     * Handle a paste into the editor.
     * @param {EditorView} view       The ProseMirror editor view.
     * @param {ClipboardEvent} event  The paste event.
     * @protected
     */
    _onPaste(view, event) {
      if ( event.clipboardData.files.length ) {
        this._uploadImages(view, event.clipboardData.files);
        return true;
      }
      const html = event.clipboardData.getData("text/html");
      if ( !html ) return; // We only care about handling rich content.
      const images = this._extractBase64Images(html);
      if ( !images.length ) return; // If there were no base64 images, defer to the default paste handler.
      this._replaceBase64Images(view, html, images);
      return true;
    }

    /* -------------------------------------------- */

    /**
     * Upload any image files encountered in the drop.
     * @param {EditorView} view  The ProseMirror editor view.
     * @param {FileList} files   The files to upload.
     * @param {number} [pos]     The position in the document to insert at. If not provided, the current selection will be
     *                           replaced instead.
     * @protected
     */
    async _uploadImages(view, files, pos) {
      const image = this.schema.nodes.image;
      const imageExtensions = Object.keys(CONST.IMAGE_FILE_EXTENSIONS);
      for ( const file of files ) {
        if ( !hasFileExtension(file.name, imageExtensions) ) continue;
        const src = await TextEditor._uploadImage(this.document.uuid, file);
        if ( !src ) continue;
        const node = image.create({src});
        if ( pos === undefined ) {
          pos = view.state.selection.from;
          view.dispatch(view.state.tr.replaceSelectionWith(node));
        } else view.dispatch(view.state.tr.insert(pos, node));
        pos += 2; // Advance the position past the just-inserted image so the next image is inserted below it.
      }
    }

    /* -------------------------------------------- */

    /**
     * Capture any base64-encoded images embedded in the rich text paste and upload them.
     * @param {EditorView} view                                      The ProseMirror editor view.
     * @param {string} html                                          The HTML data as a string.
     * @param {[full: string, mime: string, data: string][]} images  An array of extracted base64 image data.
     * @protected
     */
    async _replaceBase64Images(view, html, images) {
      const byMimetype = Object.fromEntries(Object.entries(CONST.IMAGE_FILE_EXTENSIONS).map(([k, v]) => [v, k]));
      let cleaned = html;
      for ( const [full, mime, data] of images ) {
        const file = this.constructor.base64ToFile(data, `pasted-image.${byMimetype[mime]}`, mime);
        const path = await TextEditor._uploadImage(this.document.uuid, file) ?? "";
        cleaned = cleaned.replace(full, path);
      }
      const doc = dom.parseString(cleaned);
      view.dispatch(view.state.tr.replaceSelectionWith(doc));
    }

    /* -------------------------------------------- */

    /**
     * Detect base64 image data embedded in an HTML string and extract it.
     * @param {string} html  The HTML data as a string.
     * @returns {[full: string, mime: string, data: string][]}
     * @protected
     */
    _extractBase64Images(html) {
      const images = Object.values(CONST.IMAGE_FILE_EXTENSIONS);
      const rgx = new RegExp(`data:(${images.join("|")});base64,([^"']+)`, "g");
      return [...html.matchAll(rgx)];
    }

    /* -------------------------------------------- */

    /**
     * Convert a base64 string into a File object.
     * @param {string} data      Base64 encoded data.
     * @param {string} filename  The filename.
     * @param {string} mimetype  The file's mimetype.
     * @returns {File}
     */
    static base64ToFile(data, filename, mimetype) {
      const bin = atob(data);
      let n = bin.length;
      const buf = new ArrayBuffer(n);
      const bytes = new Uint8Array(buf);
      while ( n-- ) bytes[n] = bin.charCodeAt(n);
      return new File([bytes], filename, {type: mimetype});
    }
  }

  /**
   * A simple plugin that records the dirty state of the editor.
   * @extends {ProseMirrorPlugin}
   */
  class ProseMirrorDirtyPlugin extends ProseMirrorPlugin {
    /** @inheritdoc */
    static build(schema, options={}) {
      return new Plugin({
        state: {
          init() {
            return false;
          },
          apply() {
            return true; // If any transaction is applied to the state, we mark the editor as dirty.
          }
        }
      });
    }
  }

  /**
   * A class responsible for handling the dropping of Documents onto the editor and creating content links for them.
   * @extends {ProseMirrorPlugin}
   */
  class ProseMirrorContentLinkPlugin extends ProseMirrorPlugin {
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

  /**
   * A class responsible for handling the display of automated link recommendations when a user highlights text in a
   * ProseMirror editor.
   * @param {EditorView} view   The editor view.
   */
  class PossibleMatchesTooltip {

    /**
     * @param {EditorView} view   The editor view.
     */
    constructor(view) {
      this.update(view, null);
    }

    /* -------------------------------------------- */

    /**
     * A reference to any existing tooltip that has been generated as part of a highlight match.
     * @type {HTMLElement}
     */
    tooltip;

    /* -------------------------------------------- */

    /**
     * Update the tooltip based on changes to the selected text.
     * @param {EditorView} view   The editor view.
     * @param {State} lastState   The previous state of the document.
     */
    async update(view, lastState) {
      if ( !game.settings.get("core", "pmHighlightDocumentMatches") ) return;
      const state = view.state;

      // Deactivate tooltip if the document/selection didn't change or is empty
      const stateUnchanged = lastState && (lastState.doc.eq(state.doc) && lastState.selection.eq(state.selection));
      if ( stateUnchanged || state.selection.empty ) return this._deactivateTooltip();

      const selection = state.selection.content().content;
      const highlighted = selection.textBetween(0, selection.size);

      // If the user selected fewer than a certain amount of characters appropriate for the language, we bail out.
      if ( highlighted.length < CONFIG.i18n.searchMinimumCharacterLength ) return this._deactivateTooltip();

      // Look for any matches based on the contents of the selection
      let html = this._findMatches(highlighted);

      // If html is an empty string bail out and deactivate tooltip
      if ( !html ) return this._deactivateTooltip();

      // Enrich the matches HTML to get proper content links
      html = await TextEditor.enrichHTML(html, {async: true});
      html = html.replace(/data-tooltip="[^"]+"/g, "");
      const {from, to} = state.selection;

      // In-screen coordinates
      const start = view.coordsAtPos(from);
      view.coordsAtPos(to);

      // Position the tooltip. This needs to be very close to the user's cursor, otherwise the locked tooltip will be
      // immediately dismissed for being too far from the tooltip.
      // TODO: We use the selection endpoints here which works fine for single-line selections, but not multi-line.
      const left = (start.left + 3) + "px";
      const bottom = window.innerHeight - start.bottom + 25 + "px";
      const position = {bottom, left};

      if ( this.tooltip ) this._updateTooltip(html);
      else this._createTooltip(position, html, {cssClass: "link-matches"});
    }

    /* -------------------------------------------- */

    /**
     * Create a locked tooltip at the given position.
     * @param {object} position             A position object with coordinates for where the tooltip should be placed
     * @param {string} position.top         Explicit top position for the tooltip
     * @param {string} position.right       Explicit right position for the tooltip
     * @param {string} position.bottom      Explicit bottom position for the tooltip
     * @param {string} position.left        Explicit left position for the tooltip
     * @param {string} text                 Explicit tooltip text or HTML to display.
     * @param {object} [options={}]         Additional options which can override tooltip behavior.
     * @param {array} [options.cssClass]    An optional, space-separated list of CSS classes to apply to the activated
     *                                      tooltip.
     */
    _createTooltip(position, text, options) {
      this.tooltip = game.tooltip.createLockedTooltip(position, text, options);
    }

    /* -------------------------------------------- */

    /**
     * Update the tooltip with new HTML
     * @param {string} html      The HTML to be included in the tooltip
     */
    _updateTooltip(html) {
      this.tooltip.innerHTML = html;
    }

    /* -------------------------------------------- */

    /**
     * Dismiss all locked tooltips and set this tooltip to undefined.
     */
    _deactivateTooltip() {
      if ( !this.tooltip ) return;
      game.tooltip.dismissLockedTooltip(this.tooltip);
      this.tooltip = undefined;
    }

    /* -------------------------------------------- */

    /**
     * Find all Documents in the world/compendia with names that match the selection insensitive to case.
     * @param {string} text      A string which will be matched against document names
     * @returns {string}
     */
    _findMatches(text) {
      let html = "";
      const matches = game.documentIndex.lookup(text);
      for ( const [type, collection] of Object.entries(matches) ) {
        if ( collection.length === 0 ) continue;
        html += `<section><h4>${type}</h4><p>`;
        for ( const document of collection ) {
          html += document.entry?.link ? document.entry.link : `@UUID[${document.uuid}]{${document.entry.name}}`;
        }
        html += "</p></section>";
      }
      return html;
    }
  }

  /**
   * A ProseMirrorPlugin wrapper around the {@link PossibleMatchesTooltip} class.
   * @extends {ProseMirrorPlugin}
   */
  class ProseMirrorHighlightMatchesPlugin extends ProseMirrorPlugin {
    /**
     * @param {Schema} schema                     The ProseMirror schema.
     * @param {ProseMirrorMenuOptions} [options]  Additional options to configure the plugin's behaviour.
     */
    constructor(schema, options={}) {
      super(schema);
      this.options = options;
    }

    /* -------------------------------------------- */

    /** @inheritdoc */
    static build(schema, options={}) {
      return new Plugin({
        view(editorView) {
          return new PossibleMatchesTooltip(editorView);
        },
        isHighlightMatchesPlugin: true
      });
    }
  }

  /**
   * A class responsible for managing click events inside a ProseMirror editor.
   * @extends {ProseMirrorPlugin}
   */
  class ProseMirrorClickHandler extends ProseMirrorPlugin {
    /** @override */
    static build(schema, options={}) {
      const plugin = new ProseMirrorClickHandler(schema);
      return new Plugin({
        props: {
          handleClickOn: plugin._onClick.bind(plugin)
        }
      });
    }

    /* -------------------------------------------- */

    /**
     * Handle a click on the editor.
     * @param {EditorView} view     The ProseMirror editor view.
     * @param {number} pos          The position in the ProseMirror document that the click occurred at.
     * @param {Node} node           The current ProseMirror Node that the click has bubbled to.
     * @param {number} nodePos      The position of the click within this Node.
     * @param {PointerEvent} event  The click event.
     * @param {boolean} direct      Whether this Node is the one that was directly clicked on.
     * @returns {boolean|void}      A return value of true indicates the event has been handled, it will not propagate to
     *                              other plugins, and ProseMirror will call preventDefault on it.
     * @protected
     */
    _onClick(view, pos, node, nodePos, event, direct) {
      // If this is the inner-most click bubble, check marks for onClick handlers.
      if ( direct ) {
        const $pos = view.state.doc.resolve(pos);
        for ( const mark of $pos.marks() ) {
          if ( mark.type.onClick?.(view, pos, event, mark) === true ) return true;
        }
      }

      // Check the current Node for onClick handlers.
      return node.type.onClick?.(view, pos, event, node);
    }
  }

  /**
   * A class responsible for applying transformations to content pasted inside the editor.
   */
  class ProseMirrorPasteTransformer extends ProseMirrorPlugin {
    /** @override */
    static build(schema, options={}) {
      const plugin = new ProseMirrorPasteTransformer(schema);
      return new Plugin({
        props: {
          transformPasted: plugin._onPaste.bind(plugin)
        }
      });
    }

    /* -------------------------------------------- */

    /**
     * Transform content before it is injected into the ProseMirror document.
     * @param {Slice} slice      The content slice.
     * @param {EditorView} view  The ProseMirror editor view.
     * @returns {Slice}          The transformed content.
     */
    _onPaste(slice, view) {
      // Give pasted secret blocks new IDs.
      const secret = view.state.schema.nodes.secret;
      return transformSlice(slice, node => {
        if ( node.type === secret ) {
          return secret.create({ ...node.attrs, id: `secret-${randomID()}` }, node.content, node.marks);
        }
      });
    }
  }

  /** @module prosemirror */

  const dom = {
    parser: DOMParser.fromSchema(schema),
    serializer: DOMSerializer.fromSchema(schema),
    parseString: parseHTMLString,
    serializeString: serializeHTMLString
  };

  const defaultPlugins = {
    inputRules: ProseMirrorInputRules.build(schema),
    keyMaps: ProseMirrorKeyMaps.build(schema),
    menu: ProseMirrorMenu.build(schema),
    isDirty: ProseMirrorDirtyPlugin.build(schema),
    clickHandler: ProseMirrorClickHandler.build(schema),
    pasteTransformer: ProseMirrorPasteTransformer.build(schema),
    baseKeyMap: keymap(baseKeymap),
    dropCursor: dropCursor(),
    gapCursor: gapCursor(),
    history: history(),
    columnResizing: columnResizing(),
    tables: tableEditing()
  };

  exports.AllSelection = AllSelection;
  exports.DOMParser = DOMParser;
  exports.DOMSerializer = DOMSerializer;
  exports.EditorState = EditorState;
  exports.EditorView = EditorView;
  exports.Plugin = Plugin;
  exports.PluginKey = PluginKey;
  exports.ProseMirrorClickHandler = ProseMirrorClickHandler;
  exports.ProseMirrorContentLinkPlugin = ProseMirrorContentLinkPlugin;
  exports.ProseMirrorDirtyPlugin = ProseMirrorDirtyPlugin;
  exports.ProseMirrorHighlightMatchesPlugin = ProseMirrorHighlightMatchesPlugin;
  exports.ProseMirrorImagePlugin = ProseMirrorImagePlugin;
  exports.ProseMirrorInputRules = ProseMirrorInputRules;
  exports.ProseMirrorKeyMaps = ProseMirrorKeyMaps;
  exports.ProseMirrorMenu = ProseMirrorMenu;
  exports.ProseMirrorPlugin = ProseMirrorPlugin;
  exports.Schema = Schema;
  exports.Step = Step;
  exports.TextSelection = TextSelection;
  exports.collab = index;
  exports.commands = index$3;
  exports.defaultPlugins = defaultPlugins;
  exports.defaultSchema = schema;
  exports.dom = dom;
  exports.input = index$4;
  exports.keymap = keymap;
  exports.list = index$2;
  exports.state = index$5;
  exports.tables = index$1;
  exports.transform = index$6;

  return exports;

})({});
