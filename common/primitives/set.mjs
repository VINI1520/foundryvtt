/**
 * Return the difference of two sets.
 * @param {Set} other       Some other set to compare against
 * @returns {Set}           The difference defined as objects in this which are not present in other
 */
export function difference(other) {
  if ( !(other instanceof Set) ) throw new Error("Some other Set instance must be provided.");
  const difference = new Set();
  for ( const element of this ) {
    if ( !other.has(element) ) difference.add(element);
  }
  return difference;
}

/**
 * Return the symmetric difference of two sets.
 * @param {Set} other  Another set.
 * @returns {Set}      The set of elements that exist in this or other, but not both.
 */
export function symmetricDifference(other) {
  if ( !(other instanceof Set) ) throw new Error("Some other Set instance must be provided.");
  const difference = new Set(this);
  for ( const element of other ) {
    if ( difference.has(element) ) difference.delete(element);
    else difference.add(element);
  }
  return difference
}

/**
 * Test whether this set is equal to some other set.
 * Sets are equal if they share the same members, independent of order
 * @param {Set} other       Some other set to compare against
 * @returns {boolean}       Are the sets equal?
 */
export function equals(other) {
  if ( !(other instanceof Set ) ) return false;
  if ( other.size !== this.size ) return false;
  for ( let element of this ) {
    if ( !other.has(element) ) return false;
  }
  return true;
}

/**
 * Return the first value from the set.
 * @returns {*}             The first element in the set, or undefined
 */
export function first() {
  return this.values().next().value;
}

/**
 * Return the intersection of two sets.
 * @param {Set} other       Some other set to compare against
 * @returns {Set}           The intersection of both sets
 */
export function intersection(other) {
  const n = new Set();
  for ( let element of this ) {
    if ( other.has(element) ) n.add(element);
  }
  return n;
}

/**
 * Test whether this set has an intersection with another set.
 * @param {Set} other       Another set to compare against
 * @returns {boolean}       Do the sets intersect?
 */
export function intersects(other) {
  for ( let element of this ) {
    if ( other.has(element) ) return true;
  }
  return false;
}

/**
 * Return the union of two sets.
 * @param {Set} other  The other set.
 * @returns {Set}
 */
export function union(other) {
  if ( !(other instanceof Set) ) throw new Error("Some other Set instance must be provided.");
  const union = new Set(this);
  for ( const element of other ) union.add(element);
  return union;
}

/**
 * Test whether this set is a subset of some other set.
 * A set is a subset if all its members are also present in the other set.
 * @param {Set} other       Some other set that may be a subset of this one
 * @returns {boolean}       Is the other set a subset of this one?
 */
export function isSubset(other) {
  if ( !(other instanceof Set ) ) return false;
  if ( other.size < this.size ) return false;
  for ( let element of this ) {
    if ( !other.has(element) ) return false;
  }
  return true;
}

/**
 * Convert a set to a JSON object by mapping its contents to an array
 * @returns {Array}           The set elements as an array.
 */
export function toObject() {
  return Array.from(this);
}

/**
 * Test whether every element in this Set satisfies a certain test criterion.
 * @see Array#every
 * @param {function(*,number,Set): boolean} test   The test criterion to apply. Positional arguments are the value,
 * the index of iteration, and the set being tested.
 * @returns {boolean}  Does every element in the set satisfy the test criterion?
 */
export function every(test) {
  let i = 0;
  for ( const v of this ) {
    if ( !test(v, i, this) ) return false;
    i++;
  }
  return true;
}

/**
 * Filter this set to create a subset of elements which satisfy a certain test criterion.
 * @see Array#filter
 * @param {function(*,number,Set): boolean} test  The test criterion to apply. Positional arguments are the value,
 * the index of iteration, and the set being filtered.
 * @returns {Set}  A new Set containing only elements which satisfy the test criterion.
 */
export function filter(test) {
  const filtered = new Set();
  let i = 0;
  for ( const v of this ) {
    if ( test(v, i, this) ) filtered.add(v);
    i++;
  }
  return filtered;
}

/**
 * Find the first element in this set which satisfies a certain test criterion.
 * @see Array#find
 * @param {function(*,number,Set): boolean} test  The test criterion to apply. Positional arguments are the value,
 * the index of iteration, and the set being searched.
 * @returns {*|undefined}  The first element in the set which satisfies the test criterion, or undefined.
 */
export function find(test) {
  let i = 0;
  for ( const v of this ) {
    if ( test(v, i, this) ) return v;
    i++;
  }
  return undefined;
}

/**
 * Create a new Set where every element is modified by a provided transformation function.
 * @see Array#map
 * @param {function(*,number,Set): boolean} transform  The transformation function to apply.Positional arguments are
 * the value, the index of iteration, and the set being transformed.
 * @returns {Set}  A new Set of equal size containing transformed elements.
 */
export function map(transform) {
  const mapped = new Set();
  let i = 0;
  for ( const v of this ) {
    mapped.add(transform(v, i, this));
    i++;
  }
  if ( mapped.size !== this.size ) {
    throw new Error("The Set#map operation illegally modified the size of the set");
  }
  return mapped;
}

/**
 * Create a new Set with elements that are filtered and transformed by a provided reducer function.
 * @see Array#reduce
 * @param {function(*,*,number,Set): *} reducer  A reducer function applied to each value. Positional
 * arguments are the accumulator, the value, the index of iteration, and the set being reduced.
 * @param {*} accumulator       The initial value of the returned accumulator.
 * @returns {*}                 The final value of the accumulator.
 */
export function reduce(reducer, accumulator) {
  let i = 0;
  for ( const v of this ) {
    accumulator = reducer(accumulator, v, i, this);
    i++;
  }
  return accumulator;
}

/**
 * Test whether any element in this Set satisfies a certain test criterion.
 * @see Array#some
 * @param {function(*,number,Set): boolean} test   The test criterion to apply. Positional arguments are the value,
 * the index of iteration, and the set being tested.
 * @returns {boolean}         Does any element in the set satisfy the test criterion?
 */
export function some(test) {
  let i = 0;
  for ( const v of this ) {
    if ( test(v, i, this) ) return true;
    i++;
  }
  return false;
}

// Assign primitives to Set prototype
Object.defineProperties(Set.prototype, {
  difference: {value: difference},
  symmetricDifference: {value: symmetricDifference},
  equals: {value: equals},
  every: {value: every},
  filter: {value: filter},
  find: {value: find},
  first: {value: first},
  intersection: {value: intersection},
  intersects: {value: intersects},
  union: {value: union},
  isSubset: {value: isSubset},
  map: {value: map},
  reduce: {value: reduce},
  some: {value: some},
  toObject: {value: toObject}
});
