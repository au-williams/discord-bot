import { Cron } from "croner";
import { findChannelMessage, getChannelMessages } from "../index.js";
import { getCronOptions, getLeastFrequentlyOccurringStrings } from "../shared/helpers/utilities.js"
import { PluginSlashCommand } from "../shared/models/PluginHandler.js";
import Config from "../shared/config.js";
import Logger from "../shared/logger.js";
import randomItem from 'random-item';

const config = new Config("cat_facts_scheduler_config.json");
const logger = new Logger("cat_facts_scheduler_script.js");

// ------------------------------------------------------------------------- //
// >> PLUGIN HANDLERS                                                     << //
// ------------------------------------------------------------------------- //

export const PLUGIN_HANDLERS = [
  new PluginSlashCommand({
    commandName: "catfact",
    description: "Publicly sends a message with a random cat fact 🐱",
    onInteractionCreate: ({ interaction }) => onCatfactSlashCommand({ interaction })
  })
]

// ------------------------------------------------------------------------- //
// >> DISCORD HANDLERS                                                    << //
// ------------------------------------------------------------------------- //

/**
 * Send a new cat fact on a regular time interval
 * @param {Object} param
 * @param {Client} param.client The Discord.js client
 */
export const onClientReady = async ({ client }) => {
  await config.initialize(client);
  await logger.initialize(client);

  const cronJob = async () => {
    const channelMessages = await getChannelMessages(config.discord_announcement_channel_id);
    const channelCatFacts = channelMessages.map(({ content }) => content);

    // --------------------------------------------------------------------------- //
    // get a collection of cat facts that have been sent the least amount of times //
    // --------------------------------------------------------------------------- //

    let potentialCatFacts = config.sanitized_catfact_api_responses.filter(fact => !channelCatFacts.includes(fact));
    if (!potentialCatFacts.length) potentialCatFacts = getLeastFrequentlyOccurringStrings(channelCatFacts);

    // -------------------------------------------------------------------- //
    // get a random collection item and send it to the announcement channel //
    // -------------------------------------------------------------------- //

    const randomCatFact = randomItem(potentialCatFacts);
    const channel = await client.channels.fetch(config.discord_announcement_channel_id);
    await channel.send(randomCatFact);

    logger.info(`Sent a cat fact to ${channel.guild.name} #${channel.name}`);
  }

  const cronPattern = config.cron_job_announcement_pattern;
  const cronOptions = getCronOptions(logger);
  const cronEntrypoint = Cron(cronPattern, cronOptions, cronJob);

  logger.info(`Queued Cron job with pattern "${config.cron_job_announcement_pattern}"`);

  // ---------------------------------------------------------------------------- //
  // send a cat fact if the schedule was missed and one was not sent today at 9am //
  // ---------------------------------------------------------------------------- //

  const now = new Date();
  const today9am = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 9, 0, 0);
  const lastChannelMessage = await findChannelMessage(config.discord_announcement_channel_id, () => true);
  const isMissedJob = now > today9am && (lastChannelMessage?.createdAt < today9am ?? true);
  if (isMissedJob) cronEntrypoint.trigger();
};

// ------------------------------------------------------------------------- //
// >> PLUGIN FUNCTIONS                                                    << //
// ------------------------------------------------------------------------- //

/**
 * Send a random cat fact to the interaction channel
 * @param {Object} param
 * @param {Interaction} param.interaction
 */
async function onCatfactSlashCommand({ interaction }) {
  try {
    await interaction.deferReply();
    await interaction.editReply(randomItem(config.sanitized_catfact_api_responses));
    logger.info(`Sent a cat fact to ${interaction.channel.guild.name} #${interaction.channel.name}`);
  }
  catch(e) {
    logger.error(e);
  }
}
