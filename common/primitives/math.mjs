/**
 * Bound a number between some minimum and maximum value, inclusively.
 * @param {number} num    The current value
 * @param {number} min    The minimum allowed value
 * @param {number} max    The maximum allowed value
 * @return {number}       The clamped number
 */
export function clamped(num, min, max) {
  return Math.min(max, Math.max(num, min));
}

/**
 * Linear interpolation function
 * @param {number} a   An initial value when weight is 0.
 * @param {number} b   A terminal value when weight is 1.
 * @param {number} w   A weight between 0 and 1.
 * @return {number}    The interpolated value between a and b with weight w.
 */
export function mix(a, b, w) {
  return a * (1 - w) + b * w;
}

/**
 * Transform an angle in degrees to be bounded within the domain [0, 360]
 * @param {number} degrees  An angle in degrees
 * @param {number} [base=0] The base angle to normalize to, either 0 for [0, 360) or 360 for (0, 360]
 * @return {number}         The same angle on the range [0, 360) or (0, 360]
 */
export function normalizeDegrees(degrees, base=0) {
  const d = degrees % 360;
  if ( base === 360 ) return d <= 0 ? d + 360 : d;
  else return d < 0 ? d + 360 : d;
}

/**
 * Transform an angle in radians to be bounded within the domain [-PI, PI]
 * @param {number} radians  An angle in degrees
 * @return {number}         The same angle on the range [-PI, PI]
 */
export function normalizeRadians(radians) {
  let pi2 = 2 * Math.PI;
  while ( radians < -Math.PI ) radians += pi2;
  while ( radians > Math.PI ) radians -= pi2;
  return radians;
}

/**
 * Round a floating point number to a certain number of decimal places
 * @param {number} number  A floating point number
 * @param {number} places  An integer number of decimal places
 */
export function roundDecimals(number, places) {
  places = Math.max(Math.trunc(places), 0);
  let scl = Math.pow(10, places);
  return Math.round(number * scl) / scl;
}

/**
 * To keep compatibility with previous implementation.
 * roundFast was bugged and the performance advantage was not there.
 * @deprecated since v10
 */
export const roundFast = value => {
  const msg = "roundFast is deprecated in favor of Math.round";
  foundry.utils.logCompatibilityWarning(msg, {since: 10, until: 12});
  return Math.round(value);
}

/**
 * Transform an angle in radians to a number in degrees
 * @param {number} angle    An angle in radians
 * @return {number}         An angle in degrees
 */
export function toDegrees(angle) {
  return angle * (180 / Math.PI);
}

/**
 * Transform an angle in degrees to an angle in radians
 * @param {number} angle    An angle in degrees
 * @return {number}         An angle in radians
 */
export function toRadians(angle) {
  return (angle % 360) * (Math.PI / 180);
}

/**
 * Get an oscillation between lVal and hVal according to t
 * @param {number} minVal             The minimal value of the oscillation.
 * @param {number} maxVal             The maximum value of the oscillation.
 * @param {number} t                  The time value.
 * @param {number} [p=1]              The period (can't be equal to 0).
 * @param {Function} [func=Math.cos]  The optional math function to use for oscillation.
 * @return {number}                   The oscillation according to t.
 */
export function oscillation(minVal, maxVal, t, p = 1, func = Math.cos) {
  return ((maxVal - minVal) * (func((2 * Math.PI * t) / p) + 1) / 2) + minVal;
}

// Define properties on the Math environment
Object.defineProperties(Math, {
  clamped: {value: clamped},
  mix: {value: mix},
  normalizeDegrees: {value: normalizeDegrees},
  normalizeRadians: {value: normalizeRadians},
  roundDecimals: {value: roundDecimals},
  roundFast: {value: roundFast},
  toDegrees: {value: toDegrees},
  toRadians: {value: toRadians},
  oscillation: {value: oscillation}
});

