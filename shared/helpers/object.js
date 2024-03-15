import { getAverageColor } from 'fast-average-color-node';
import { getIsNumeric } from "./string.js";
import { nanoid } from 'nanoid'
import { scheduledJobs } from "croner";
import download from "download";
import fs from "fs-extra";

const { temp_directory } = fs.readJsonSync("config.json");

/**
 * The retry policy for the `fetch-retry` NPM package
 */
export const fetchRetryPolicy = {
  retries: 10,
  retryDelay: 1000,
  retryOn: [501, 502, 503]
}

/**
 * Create a temporary download of the destination file to process with getAverageColor
 * @param {string} url
 */
export const getAverageColorFromUrl = async url => {
  const tempDownloadDirectory = `${temp_directory}\\${nanoid()}`;
  await download(url, tempDownloadDirectory);
  const tempDownloadFilename = fs.readdirSync(tempDownloadDirectory)[0];
  const tempDownloadFilepath = `${tempDownloadDirectory}\\${tempDownloadFilename}`;
  // setTimeout(5000).then(() => fs.removeSync(tempDownloadDirectory));
  return await getAverageColor(tempDownloadFilepath);
}

/**
 * The options for the `croner` NPM package
 * @param {Logger} logger
 * @param {string} appendedJobName
 */
export const getCronOptions = (logger, appendedJobName = "") => {
  let name = `${logger.filename}${(appendedJobName ? " ":"")}${appendedJobName}`;
  let isDuplicateName = scheduledJobs.find(job => job.name === name);

  while (isDuplicateName) {
    const split = name.split(" ");
    const counter = split.pop().replace("(", "").replace(")", "");
    name = getIsNumeric(counter) ? `${split.join(" ")} (${parseInt(counter) + 1})` : `${name} (1)`;
    isDuplicateName = scheduledJobs.find(job => job.name === name);
  }

  return {
    catch: e => logger.error(e),
    name,
    protect: true
  }
}

/**
 * Amazing how there's not a better way of determining if a string is valid JSON or not. Try/catch here we come!
 *   Btw the "is-json" NPM package doesn't work. It's not trash because with trash you know what you're getting.
 *   It's worse than trash because it makes you think it works until it doesn't and causes a ton of file issues.
 *   https://stackoverflow.com/a/20392392 thanks I hate it but at least I'm not gaslit by an NPM package anymore
 * @param {string} jsonString
 * @returns {string?}
 */
export function tryParseJsonObject(jsonString){
  try {
      const o = JSON.parse(jsonString);
      // Handle non-exception-throwing cases:
      // Neither JSON.parse(false) or JSON.parse(1234) throw errors, hence the type-checking,
      // but... JSON.parse(null) returns null, and typeof null === "object",
      // so we must check for that, too. Thankfully, null is falsey, so this suffices:
      if (o && typeof o === "object") return o;
  }
  // eslint-disable-next-line no-empty
  catch (e) { }
}
