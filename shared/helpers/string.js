import { basename, extname } from "path";
import { fileURLToPath } from "url";
import { dirname } from "path";
import fs from "fs";

// https://stackoverflow.com/questions/175739/how-can-i-check-if-a-string-is-a-valid-number
export function getIsNumeric(str) {
  if (typeof str != "string") return false; // we only process strings!
  return !isNaN(str) && // use type coercion to parse the _entirety_ of the string (`parseFloat` alone does not do this)...
         !isNaN(parseFloat(str)); // ...and ensure strings of whitespace fail
}

/**
 * Get the filename of where this function is invoked
 * @param {string} importMetaUrl import.meta.url
 * @returns {string} "example_plugin_name.js"
 */
export function getPluginFilename(importMetaUrl) {
  return basename(fileURLToPath(importMetaUrl));
}

/**
 * Gets the first unique filename for a filepath. If the filepath "c:\readme.md" is provided and
 *   the file "readme.md" does not exist in that directory then "readme.md" will be returned. If
 *   the file "readme.md" does exist then "readme (1).md" will be returned unless it too exists,
 *   then "readme (2).md" will be returned and so on until a unique filename is created.
 * @param {string} filepath
 * @returns {string}
 */
export function getUniqueFilename(filepath) {
  const extension = extname(filepath);
  const filename = basename(filepath, extension);
  if (!fs.existsSync(filepath)) return filename + extension;

  const directory = dirname(filepath);
  const nextNumber = fs.readdirSync(directory).filter(fn => fn.includes(filename)).reduce((prev, fn) => {
    const match = fn.match(/\((\d+)\)/);
    return match ? Math.max(prev, match[1]) : prev;
  }, 0) + 1;

  return `${filename} (${nextNumber})${extension}`;
}

/**
 * Extract a link from a string
 * `"foo http://youtu.be/w?v=a&b=c bar"` -> `"http://youtu.be/w?v=a&b=c"`
 * @param {string} string
 * @returns {string}
 */
export function getLinkFromString(string) {
  const match = string.match(/(https?:\/\/[^\s]+)/g);
  return match?.length ? match[0] : null;
}

/**
 * Extract a link from a string with its parameters removed
 * `"foo http://youtu.be/w?v=a&b=c bar"` -> `"http://youtu.be/w?v=a"`
 * @param {string} string
 * @returns {string}
 */
export function getLinkWithoutParametersFromString(string) {
  const match = string.match(/(https?:\/\/[^&\s]+)/g);
  return match?.length ? match[0] : null;
}

/**
 * Truncate a string to the maximum allowed size
 * @param {*} string
 * @param {*} maxLength
 * @returns {*}
 */
export function getTruncatedString(string, maxLength) {
  if (string.length > maxLength) string = string.slice(0, maxLength - 3) + "...";
  return string;
}
