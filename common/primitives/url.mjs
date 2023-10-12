/**
 * Attempt to parse a URL without throwing an error.
 * @param {string} url  The string to parse.
 * @returns {URL|null}  The parsed URL if successful, otherwise null.
 */
export function parseSafe(url) {
  try {
    return new URL(url);
  } catch (err) {}
  return null;
}

Object.assign(URL, {parseSafe});
