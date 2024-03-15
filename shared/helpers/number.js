/**
 * Get the total seconds from a HH:MM:SS formatted timestamp
 * @param {string} timestamp HH:MM:SS timestamp
 */
export function getTimestampAsTotalSeconds(timestamp) {
  const time = timestamp.split(":");
  return (+time[0]) * 60 * 60 + (+time[1]) * 60 + (+time[2]);
}
