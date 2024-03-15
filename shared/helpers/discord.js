import { getLinkFromString, getLinkWithoutParametersFromString, getTruncatedString } from "./string.js";
import { ChannelType } from "discord.js";

/**
 * Try deleting a child thread if one exists when a starter message is deleted
 * TODO: change pluginFilename to logger instance
 * @param {Object} param
 * @param {string[]} param.allowedChannelIds
 * @param {Logger} param.logger
 * @param {Message} param.starterMessage
 * @returns {bool}
 */
export async function tryDeleteThread({ allowedChannelIds, logger, starterMessage }) {
  try {
    const isAllowedChannel = allowedChannelIds.includes(starterMessage.channel.id);
    const isValidOperation = isAllowedChannel && starterMessage.thread;
    if (isValidOperation) await starterMessage.thread.delete();
    if (isValidOperation) logger.info(`Deleted thread with starter message "${starterMessage.id}"`);
    return isValidOperation;
  }
  catch(e) {
    logger.error(e);
    return false;
  }
}

/**
 * Get the existing thread or create one if it doesn't exist
 * @param {Object} param
 * @param {Message} param.starterMessage
 * @param {Object} param.clientOptions
 * @param {Object} param.threadOptions
 * @returns {ThreadChannel}
 */
export async function getOrCreateThreadChannel({ starterMessage, clientOptions, threadOptions }) {
  if (starterMessage.hasThread && starterMessage.thread) return starterMessage.thread;

  threadOptions.name = getTruncatedString(threadOptions.name, 100); // maximum thread name size
  const thread = await starterMessage.startThread(threadOptions);

  if (clientOptions.removeMembers) {
    const fetchedMembers = await thread.members.fetch();
    const removedMemberIds = fetchedMembers.filter(({ user }) => !user.bot).map(({ id }) => id);
    for(const id of removedMemberIds) await thread.members.remove(id);
  }

  return thread;
}
