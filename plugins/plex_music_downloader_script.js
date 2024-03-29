import { ActionRowBuilder, AttachmentBuilder, ButtonBuilder, ButtonStyle, ComponentType, MessageType, ModalBuilder, TextInputBuilder, TextInputStyle } from "discord.js";
import { Cron } from "croner";
import { extname, resolve } from "path";
import { findChannelMessage, getChannelMessages } from "../index.js";
import { getCronOptions } from "../shared/helpers/object.js";
import { getPluginFilename } from "../shared/helpers/string.js";
import { tryDeleteThread } from "../shared/helpers/discord.js";
import * as oembed from "@extractus/oembed-extractor";
import AFHConvert from "ascii-fullwidth-halfwidth-convert";
import ComponentOperation from "../shared/models/ComponentOperation.js"
import fs from "fs-extra";
import LinkData from "../shared/models/LinkData.js"
import Logger from "../shared/logger.js";
import sanitize from "sanitize-filename";
import youtubedl from "youtube-dl-exec";
import ytpl from "@distube/ytpl";

const {
  temp_directory
} = fs.readJsonSync("config.json");

const {
  cron_job_announcement_pattern,
  discord_admin_role_id, discord_allowed_channel_id, discord_plex_emoji, discord_youtube_emoji,
  plex_authentication_token, plex_download_directory, plex_library_section_id, plex_server_ip_address
} = fs.readJsonSync("plugins/plex_music_downloader_config.json");

const PLUGIN_FILENAME = getPluginFilename(import.meta.url);

// ------------------------------------------------------------------------- //
// >> INTERACTION DEFINITIONS                                             << //
// ------------------------------------------------------------------------- //

/**
 * Discord, in their infinite wisdom and investment money, requires
 *   modals to resolve in <= 3 seconds which obviously causes a lot
 *   of issues with external dependencies with unknown fetch times.
 *   Work around this dumpster API design by caching these outbound
 *   requests before the client requests them. Yay, waste! Remember
 *   to thank a Discord developer for their high quality API if you
 *   see one inside its zoo exhibit or leaving their moms basement.
 */
const CACHED_LINK_DATA = {};

const COMPONENT_CUSTOM_IDS = {
  DELETE_FROM_PLEX_BUTTON: "DELETE_FROM_PLEX_BUTTON",
  DELETE_FROM_PLEX_MODAL: "DELETE_FROM_PLEX_MODAL",
  DOWNLOAD_MP3_BUTTON: "DOWNLOAD_MP3_BUTTON",
  DOWNLOAD_MP3_MODAL: "DOWNLOAD_MP3_MODAL",
  FOLLOW_UPDATES_BUTTON: "FOLLOW_UPDATES_BUTTON",
  IMPORT_INTO_PLEX_BUTTON: "IMPORT_INTO_PLEX_BUTTON",
  IMPORT_INTO_PLEX_MODAL: "IMPORT_INTO_PLEX_MODAL",
  SEARCHING_PLEX_BUTTON: "SEARCHING_PLEX_BUTTON",
  SHOW_ALL_YOUTUBE_SONGS: "SHOW_ALL_YOUTUBE_SONGS",
  SHOW_BUTTON_DOCUMENTATION: "SHOW_BUTTON_DOCUMENTATION",
}

/**
 * Define what functions and restrictions are invoked when a discord component interaction is made
 */
export const COMPONENT_INTERACTIONS = [
  {
    customId: COMPONENT_CUSTOM_IDS.DOWNLOAD_MP3_BUTTON,
    description: "Extracts the audio from a link and uploads it to Discord as an MP3 file for users to stream or download.",
    onInteractionCreate: ({ interaction }) => showMetadataModal(interaction, COMPONENT_CUSTOM_IDS.DOWNLOAD_MP3_MODAL, "Download MP3")
  },
  {
    customId: COMPONENT_CUSTOM_IDS.DOWNLOAD_MP3_MODAL,
    onInteractionCreate: ({ interaction }) => downloadLinkAndExecute(interaction, COMPONENT_CUSTOM_IDS.DOWNLOAD_MP3_MODAL, callbackUploadDiscordFile, "mp3")
  },
  {
    customId: COMPONENT_CUSTOM_IDS.FOLLOW_UPDATES_BUTTON,
    description: "Monitors the YouTube playlist for new videos and publicly posts those links to the Discord channel.",
    onInteractionCreate: ({ interaction }) => { followYouTubePlaylistUpdates(interaction) }, // { throw "Not implemented" },
    requiredRoleIds: [discord_admin_role_id]
  },
  {
    customId: COMPONENT_CUSTOM_IDS.IMPORT_INTO_PLEX_BUTTON,
    description: "Extracts the audio from a link and imports it into the bot's Plex library for secured long-term storage.",
    onInteractionCreate: ({ interaction }) => showMetadataModal(interaction, COMPONENT_CUSTOM_IDS.IMPORT_INTO_PLEX_MODAL, "Import into Plex"),
    requiredRoleIds: [discord_admin_role_id]
  },
  {
    customId: COMPONENT_CUSTOM_IDS.IMPORT_INTO_PLEX_MODAL,
    onInteractionCreate: ({ interaction }) => downloadLinkAndExecute(interaction, COMPONENT_CUSTOM_IDS.IMPORT_INTO_PLEX_MODAL, callbackImportPlexFile),
    requiredRoleIds: [discord_admin_role_id]
  },
  {
    customId: COMPONENT_CUSTOM_IDS.DELETE_FROM_PLEX_BUTTON,
    description: "Removes the previously imported audio file from the bot's Plex library and deletes it from the filesystem.",
    onInteractionCreate: ({ interaction }) => showDeletionModal(interaction, COMPONENT_CUSTOM_IDS.DELETE_FROM_PLEX_MODAL, "Delete from Plex"),
    requiredRoleIds: [discord_admin_role_id]
  },
  {
    customId: COMPONENT_CUSTOM_IDS.DELETE_FROM_PLEX_MODAL,
    onInteractionCreate: ({ interaction }) => deleteLinkFromPlex(interaction),
    requiredRoleIds: [discord_admin_role_id]
  },
  {
    customId: COMPONENT_CUSTOM_IDS.SHOW_ALL_YOUTUBE_SONGS,
    description: "Privately sends every video in the YouTube playlist to the Discord thread for easier downloading.",
    onInteractionCreate: ({ interaction }) => showAllYouTubePlaylistSongs(interaction)
  },
  {
    customId: COMPONENT_CUSTOM_IDS.SHOW_BUTTON_DOCUMENTATION,
    onInteractionCreate: ({ interaction }) => showButtonDocumentation(interaction)
  }
]

// ------------------------------------------------------------------------- //
// >> DISCORD EVENT HANDLERS                                              << //
// ------------------------------------------------------------------------- //

/**
 * Starts a cron job that validates and repairs channel messages
 */
export const onClientReady = async () => {
  const cronJob = async () => {
    for (const message of await getChannelMessages(discord_allowed_channel_id)) {
      const link = getLinkFromMessage(message);
      const cachedLinkData = link && await getOrInitializeLinkData(link);
      if (!cachedLinkData) continue;

      // ------------------------------------------------------- //
      // delete threads with obsolete metadata and recreate them //
      //   (this is typically links edited for different videos) //
      // ------------------------------------------------------- //

      let threadChannel = message.hasThread && message.thread;

      const isThreadChannelObsolete =
        threadChannel && threadChannel.name !== await getThreadChannelName(cachedLinkData);

      if (isThreadChannelObsolete) {
        await threadChannel.delete();
        Logger.info(`Deleted obsolete thread for message id "${message.id}"`);
        threadChannel = false;
      }

      // ------------------------------------------------------- //
      // create the thread if it doesn't exist, then validate it //
      // ------------------------------------------------------- //

      if (!threadChannel) threadChannel = await createThreadChannel(cachedLinkData, message);

      const messageWithPlexButton = await findChannelMessage(threadChannel.id, getIsMessageWithPlexButtonComponent);
      if (messageWithPlexButton) await validateMessageWithPlexButton({ cachedLinkData, messageWithPlexButton });
    }
  }

  Cron(cron_job_announcement_pattern, getCronOptions(PLUGIN_FILENAME), cronJob).trigger();
  Logger.info(`Started Cron job with pattern "${cron_job_announcement_pattern}"`);
};

/**
 * Create the thread channel for the message with a music link and verify their status in the Plex library
 * @param {Object} param
 * @param {string} param.message
 */
export const onMessageCreate = async ({ message }) => {
  try {
    const isAllowedDiscordChannel = message.channel.id === discord_allowed_channel_id;
    if (!isAllowedDiscordChannel) return;

    const link = getLinkFromMessage(message);
    const cachedLinkData = link && await getOrInitializeLinkData(link);
    if (!cachedLinkData) return;

    const threadChannel = await createThreadChannel(cachedLinkData, message);
    const messageWithPlexButton = await findChannelMessage(threadChannel.id, getIsMessageWithPlexButtonComponent);
    await validateMessageWithPlexButton({ cachedLinkData, messageWithPlexButton });
  }
  catch({ stack }) {
    Logger.error(stack);
  }
}

/**
 * Delete the child thread when its message parent is deleted
 * @param {Object} param
 * @param {Client} param.client The Discord.js client
 * @param {Message} param.message The deleted message
 */
export const onMessageDelete = ({ message }) => tryDeleteThread({
  allowedChannelIds: [discord_allowed_channel_id],
  pluginFilename: PLUGIN_FILENAME,
  starterMessage: message
});

// ------------------------------------------------------------------------- //
// >> PLUGIN FUNCTIONS                                                    << //
// ------------------------------------------------------------------------- //

/**
 * Import the link into the Plex library after it was downloaded
 * @param {Interaction} interaction
 * @param {string} outputFilename
 * @param {string} outputFilepath
 */
async function callbackImportPlexFile(interaction, outputFilename, outputFilepath) {
  try {
    const link = await getLinkFromMessageHierarchy(interaction.message);
    const cachedLinkData = await getOrInitializeLinkData(link);
    const messageWithPlexButton = interaction.message;

    await fs.move(outputFilepath, resolve(`${plex_download_directory}/${outputFilename}`));
    await interaction.editReply("Success! Your file was imported into Plex.");
    await validateMessageWithPlexButton({ cachedLinkData, interaction, messageWithPlexButton });
    await startPlexLibraryScan();
  }
  catch({ stack }) {
    Logger.error(stack);
  }
}

/**
 * Upload the link to the Discord thread after it was downloaded
 * @param {Interaction} interaction
 * @param {string} outputFilename
 * @param {string} outputFilepath
 */
async function callbackUploadDiscordFile(interaction, outputFilename, outputFilepath) {
  const filenameWithoutId = outputFilename.split(" - ").slice(0, -1).join(" - ");
  // todo: if reference is a reference, update the reference? improves usability
  const name = filenameWithoutId + extname(outputFilename);
  const files = [new AttachmentBuilder(outputFilepath, { name })];
  const reply = await interaction.editReply({ files });
  Logger.info(`Uploaded "${reply.attachments.first().name}"`);
}

const asciiWidthConverter = new AFHConvert();

/**
 * Create a cache of potential fetches that we probably won't use because Discord's amazing API can't wait >3 seconds without erroring.
 * There is no way of improving this code smell without Discord's staff taking a shower and taking an intro to comp-sci college course.
 * Unsupported links will return undefined to reduce the number of outbound connections per operation (increasing the operating speed).
 * @param {string} link
 */
async function getOrInitializeLinkData(link) {
  try {
    const linkWithoutParameters = getLinkWithParametersRemoved(link);
    let cachedLinkData = CACHED_LINK_DATA[linkWithoutParameters];
    if (cachedLinkData) return cachedLinkData;

    const getCleanMetadataArtist = (author_name = "") => {
      let result = author_name;
      if (result.endsWith(" - Topic")) result = result.slice(0, -" - Topic".length)
      return asciiWidthConverter.toHalfWidth(result.trim());
    }

    const getCleanMetadataTitle = (author_name = "", title = "") => {
      let result = title;
      if (result.startsWith(`${author_name.replace(" Official", "")} - `)) result = result.slice(`${author_name.replace(" Official", "")} - `.length);
      if (result.endsWith(` by ${author_name}`)) result = result.slice(0, -` by ${author_name}`.length);
      return asciiWidthConverter.toHalfWidth(result.trim());
    }

    const { authorName, title } = await oembed.extract(linkWithoutParameters)
      .then(({ author_name, title }) => ({ authorName: getCleanMetadataArtist(author_name), title: getCleanMetadataTitle(author_name, title) }))
      .catch(() => ({ authorName: undefined, title: undefined }));
    if (!authorName || !title) return; // link is unsupported

    const youtubeDlOptions = {
      output: "%(duration>%H:%M:%S)s,%(id)s",
      print: "%(duration>%H:%M:%S)s,%(id)s",
      simulate: true, skipDownload: true
    }

    // fetch youtubedl data
    const { endTime, id } = await youtubedl(linkWithoutParameters, youtubeDlOptions)
      .then(str => ({ endTime: str.split(",")[0], id: str.split(",")[1] }))
      .catch(() => ({ endTime: undefined, id: undefined }));
    if (!endTime || !id) return; // link is unsupported

    // todo: fetch SponsorBlock data
    //   const isYouTubeLink = linkWithoutParameters.includes("youtu.be") || linkWithoutParameters.includes("youtube.com");
    //   const sponsorBlockUrl = `https://sponsor.ajay.app/api/skipSegments?videoID=${id}&category=sponsor&category=selfpromo&category=interaction&category=intro&category=outro&category=preview&category=music_offtopic`
    //   const test = isYouTubeLink && await fetch().then(async response => await response.json());

    cachedLinkData = new LinkData({ authorName, endTime, id, link, linkWithoutParameters, title });
    CACHED_LINK_DATA[linkWithoutParameters] = cachedLinkData;
    return cachedLinkData;
  }
  catch({ stack }) {
    Logger.error(stack);
    Logger.error(link);
  }
}

/**
 * Create the thread channel for the message with a music link
 * @param {string} link
 * @param {Message} starterMessage
 * @param {Function} callback
 */
async function createThreadChannel(cachedLinkData, starterMessage) {
  const name = await getThreadChannelName(cachedLinkData);

  const thread = await starterMessage.startThread({ name });
  await thread.members.remove(starterMessage.author.id);

  // --------------------------------------------------- //
  // send buttons to download the message link in thread //
  // --------------------------------------------------- //

  const isLinkYouTubePlaylist = getIsLinkYouTubePlaylist(cachedLinkData.link);
  const isLinkYouTubePlaylistWithoutVideo = isLinkYouTubePlaylist && !cachedLinkData.link.includes("v=");

  if (!isLinkYouTubePlaylistWithoutVideo) {
    const downloadMp3Button = new ButtonBuilder();
    downloadMp3Button.setCustomId(COMPONENT_CUSTOM_IDS.DOWNLOAD_MP3_BUTTON);
    downloadMp3Button.setEmoji("📲");
    downloadMp3Button.setLabel("Download MP3");
    downloadMp3Button.setStyle(ButtonStyle.Secondary);

    const searchingPlexButton = new ButtonBuilder();
    searchingPlexButton.setCustomId(COMPONENT_CUSTOM_IDS.SEARCHING_PLEX_BUTTON);
    searchingPlexButton.setDisabled(true);
    searchingPlexButton.setEmoji("⏳");
    searchingPlexButton.setLabel("Searching in Plex");
    searchingPlexButton.setStyle(ButtonStyle.Secondary);

    await thread.send({
      components: [new ActionRowBuilder().addComponents(downloadMp3Button, searchingPlexButton)],
      content: "Use these to download this music from Discord:"
    });
  }

  // ----------------------------------------------------- //
  // send buttons to manage the YouTube playlist in thread //
  // ----------------------------------------------------- //

  if (isLinkYouTubePlaylist) {
    const showAllSongsButton = new ButtonBuilder();
    showAllSongsButton.setCustomId(COMPONENT_CUSTOM_IDS.SHOW_ALL_YOUTUBE_SONGS);
    showAllSongsButton.setEmoji(discord_youtube_emoji);
    showAllSongsButton.setLabel("Show all videos");
    showAllSongsButton.setStyle(ButtonStyle.Secondary);

    const followInChannelButton = new ButtonBuilder();
    followInChannelButton.setCustomId(COMPONENT_CUSTOM_IDS.FOLLOW_UPDATES_BUTTON);
    followInChannelButton.setEmoji("🔔");
    followInChannelButton.setLabel("Follow updates");
    followInChannelButton.setStyle(ButtonStyle.Secondary);

    await thread.send({
      components: [new ActionRowBuilder().addComponents(showAllSongsButton, followInChannelButton)],
      content: "Use these to manage this YouTube playlist:"
    });
  }

  // ----------------------------------------------------- //
  // send button to get documentation for previous buttons //
  // ----------------------------------------------------- //

  const showDocumentationButton = new ButtonBuilder();
  showDocumentationButton.setCustomId(COMPONENT_CUSTOM_IDS.SHOW_BUTTON_DOCUMENTATION);
  showDocumentationButton.setEmoji("🔖");
  showDocumentationButton.setLabel("Show documentation");
  showDocumentationButton.setStyle(ButtonStyle.Primary);

  await thread.send({
    components: [new ActionRowBuilder().addComponents(showDocumentationButton)],
    content: "Use this for help with these buttons:"
  });

  return thread;
}

/**
 * Delete the link from the Plex music library
 * @param {Interaction} interaction
 */
async function deleteLinkFromPlex(interaction) {
  const operation = new ComponentOperation({
    interactionId: COMPONENT_CUSTOM_IDS.DELETE_FROM_PLEX_MODAL,
    messageId: interaction.message.id,
    userId: interaction.user.id
  });

  if (operation.isBusy) return;
  else operation.setBusy(true);

  try {
    await interaction.deferReply({ ephemeral: true });

    const link = await getLinkFromMessageHierarchy(interaction.message);
    const cachedLinkData = await getOrInitializeLinkData(link);
    const existingPlexFilename = await getExistingPlexFilename(cachedLinkData);

    if (existingPlexFilename) {
      await fs.remove(`${plex_download_directory}/${existingPlexFilename}`);
      Logger.info(`Deleted file from Plex: "${existingPlexFilename}"`);
      await interaction.editReply("Your file was successfully deleted from Plex.");
      await startPlexLibraryScan();
    }
    else {
      await interaction.editReply(`Sorry! Your file wasn't found in Plex.`);
      Logger.warn(`Plex filename does not exist`);
    }
  }
  catch(error) {
    Logger.error(error.stack);
    const content = getFormattedErrorMessage(error);
    await interaction.editReply({ content });
  }
  finally {
    const link = await getLinkFromMessageHierarchy(interaction.message);
    const cachedLinkData = await getOrInitializeLinkData(link);
    const messageWithPlexButton = interaction.message;
    await validateMessageWithPlexButton({ cachedLinkData, interaction, messageWithPlexButton });
    operation.setBusy(false);
  }
}

async function downloadLinkAndExecute(interaction, modalCustomId, callback, audioFormat) {
  const operation = new ComponentOperation({
    interactionId: modalCustomId,
    messageId: interaction.message.id,
    userId: interaction.user.id
  });

  if (operation.isBusy) return;
  else operation.setBusy(true);

  try {
    await interaction.deferReply({ ephemeral: true });

    const link = await getLinkFromMessageHierarchy(interaction.message);
    const { endTime, linkWithoutParameters } = await getOrInitializeLinkData(link);
    const endTimeTotalSeconds = getTimestampAsTotalSeconds(endTime);

    const inputArtist = interaction.fields.getTextInputValue("artist");
    const inputTitle = interaction.fields.getTextInputValue("title");
    const inputStartTime = interaction.fields.getTextInputValue("start");
    const inputStartTimeTotalSeconds = getTimestampAsTotalSeconds(inputStartTime);
    const inputEndTime = interaction.fields.getTextInputValue("end");
    const inputEndTimeTotalSeconds = getTimestampAsTotalSeconds(inputEndTime);

    // -------------------------------------------- //
    // validate the user inputted timestamp strings //
    // -------------------------------------------- //

    if (!/^(\d{1,3}:)?\d{2}:\d{2}:\d{2}$/.test(inputStartTime)) {
      const content = `\`${inputStartTime}\` is not a valid timestamp. Please try again.`;
      await interaction.editReply({ content });
      return;
    }

    if (!/^(\d{1,3}:)?\d{2}:\d{2}:\d{2}$/.test(inputEndTime)) {
      const content = `\`${inputEndTime}\` is not a valid timestamp. Please try again.`;
      await interaction.editReply({ content });
      return;
    }

    if (inputEndTimeTotalSeconds > endTimeTotalSeconds) {
      const content = `End time can't exceed \`${endTime}\`. Please try again.`;
      await interaction.editReply({ content });
      return;
    }

    if (inputStartTimeTotalSeconds >= inputEndTimeTotalSeconds) {
      const content = `Start time can't be after end time. Please try again.`;
      await interaction.editReply({ content });
      return;
    }

    // ------------------------------------------------------------------ //
    // compile the options consumed by YoutubeDL with optional parameters //
    // ------------------------------------------------------------------ //

    /**
     * Sanitize a string for use in the command line version of ffmpeg
     * @param {string} str
     */
    const sanitizeFfmpeg = str => str.trim().replaceAll("'", "'\\''");

    /**
     * Sanitize a string for use as a filename in Windows and/or Linux
     * @param {string} str
     */
    const sanitizeFilename = str => sanitize(str.replace(/[/\\]/g, " ").replace(/  +/g, " "));

    const outputDirectory =
      `${temp_directory}/${interaction.customId}${interaction.message.id}${interaction.user.id}`;

    const options = {
      audioQuality: 0,
      embedMetadata: true,
      extractAudio: true,
      format: "bestaudio/best",
      noPlaylist: true,
      output: `${outputDirectory}/${sanitizeFilename(`${inputArtist} - ${inputTitle}`)} - %(id)s.%(ext)s`,
      postprocessorArgs: "ffmpeg:"
        + " -metadata album='Downloads'"
        + " -metadata album_artist='Various Artists'"
        + ` -metadata artist='${sanitizeFfmpeg(inputArtist)}'`
        + " -metadata date=''" // remove unwanted ID3 tag
        + ` -metadata title='${sanitizeFfmpeg(inputTitle)}'`
        + " -metadata track=''" // remove unwanted ID3 tag
    }

    if (audioFormat) options["audioFormat"] = audioFormat;

    // ----------------------------------------------------------------- //
    // compile the post-processor if post-processing should be performed //
    // ----------------------------------------------------------------- //

    const isStartTimeUpdate = inputStartTimeTotalSeconds > 0 && inputStartTimeTotalSeconds < inputEndTimeTotalSeconds;
    const isEndTimeUpdate = endTimeTotalSeconds > inputEndTimeTotalSeconds;

    if (isStartTimeUpdate) {
      options["externalDownloader"] ??= "ffmpeg";
      options["externalDownloaderArgs"] ??= "";
      options["externalDownloaderArgs"] += ` -ss ${inputStartTime}.00`;
    }

    if (isEndTimeUpdate) {
      options["externalDownloader"] ??= "ffmpeg";
      options["externalDownloaderArgs"] ??= "";
      options["externalDownloaderArgs"] += ` -to ${inputEndTime}.00`;
    }

    const postProcessor = (() => {
      const outputTotalSeconds = inputEndTimeTotalSeconds - inputStartTimeTotalSeconds;
      const fadeTotalSeconds = outputTotalSeconds >= 20 ? 5 : outputTotalSeconds / 4;
      const execAudioFilters = []; // exec command sourced from https://redd.it/whqfl6/
      if (isStartTimeUpdate) execAudioFilters.push(`afade=t=in:st=0:d=${fadeTotalSeconds}`);
      if (isEndTimeUpdate) execAudioFilters.push(`afade=t=out:st=${outputTotalSeconds - fadeTotalSeconds}:d=${fadeTotalSeconds}`);
      if (execAudioFilters.length) return `move {} tempfile & ffmpeg -i tempfile -af "${execAudioFilters.join(",")}" {} & del tempfile`;
      return false;
    })();

    if (postProcessor) options["exec"] = postProcessor;

    // -------------------------------------------------------------- //
    // download, execute the callback function, remove temporary file //
    // -------------------------------------------------------------- //

    await youtubedl(linkWithoutParameters, options);
    const outputFilename = fs.readdirSync(outputDirectory)[0];
    const outputFilepath = resolve(`${outputDirectory}/${outputFilename}`);
    await callback(interaction, outputFilename, outputFilepath);
    await fs.remove(outputDirectory);
  }
  catch(error) {
    const content = getFormattedErrorMessage(error);
    await interaction.editReply(content);
    Logger.error(error.stack);
  }
  finally {
    operation.setBusy(false);
  }
}

async function followYouTubePlaylistUpdates(interaction) {
  try {
    console.log(interaction);
    // await interaction.deferUpdate();

    // const link = await getLinkFromMessageHierarchy(interaction.message);
    // const isLinkYouTubePlaylist = getIsLinkYouTubePlaylist(link);
    // if (!isLinkYouTubePlaylist) return;

    // const youTubePlaylist = await ytpl(link); // todo: show all youtube videos may be broken! cached playlist link?
    // const youTubePlaylistId = ""; // todo:
    // const stateKey = basename(fileURLToPath(import.meta.url));
    // const stateValue = await State.find(stateKey, ({ content }) => content.includes(COMPONENT_CUSTOM_IDS.FOLLOW_UPDATES_BUTTON) && content.includes(playlistId));

    // if (!stateValue) {
    //   State.add(stateKey, { content: `\`${COMPONENT_CUSTOM_IDS.FOLLOW_UPDATES_BUTTON}\` ${youTubePlaylistId}`});
    //   Logger.info(`Added ${COMPONENT_CUSTOM_IDS.FOLLOW_UPDATES_BUTTON} ${youTubePlaylistId} to state`);
    // }
  }
  catch({ stack }) {
    Logger.error(stack);
  }
  finally {
    // todo:
    // validateFollowPlaylistButton();
  }
}

/**
 * Get the filename of the link in the Plex library if it was previously added
 * (this is done by saving the links unique id in the music download filename)
 * @param {string} link
 */
async function getExistingPlexFilename(cachedLinkData) {
  return fs
    .readdirSync(plex_download_directory)
    .find(filename => cachedLinkData.id == filename.split(' - ').slice(-1)[0].split('.')[0]);
}

/**
 * Stringify an error and encapsulate it within the content of a Discord message
 * @param {Error} error
 */
function getFormattedErrorMessage(error) {
  return `I caught an error processing this link:\n\`\`\`${error}\`\`\``;
}

/**
 * Get if the link is a playlist on YouTube
 * @param {string} link
 */
function getIsLinkYouTubePlaylist(link) {
  return (link.includes("youtu.be") || link.includes("youtube.com")) && link.includes("list=");
}

/**
 * Get if the message contains a button for managing the Plex library
 * (custom id: DELETE_FROM_PLEX_BUTTON, IMPORT_INTO_PLEX_BUTTON, etc)
 * @param {Message} message
 */
function getIsMessageWithPlexButtonComponent(message) {
  return message.components?.[0]?.components.some(getIsPlexButtonComponent);
}

/**
 * Get if the component is a button component for managing the Plex library
 * @param {Component} component
 */
function getIsPlexButtonComponent(component) {
  return component.customId.includes("_PLEX_")
    && component.type === ComponentType.Button;
}

/**
 * Get an embedded link from the message content property
 * @param {Message} message
 */
function getLinkFromMessage(message) {
  const match = message.content.match(/(https?:\/\/[^\s]+)/g);
  return match ? match[0] : null;
}

/**
 * Get an embedded link from the entire message hierarchy
 * (if the message has no link then check its parent too)
 * @param {Message} message The channel or thread message
 */
async function getLinkFromMessageHierarchy(message) {
  return getLinkFromMessage(message) ?? await getLinkFromStarterMessage(message);
}

/**
 * Get an embedded link from the thread message parents content property
 * @param {Message} threadMessage
 */
async function getLinkFromStarterMessage(threadMessage) {
  const starterMessage = await threadMessage.channel.fetchStarterMessage();
  return await getLinkFromMessage(starterMessage);
}

/**
 * Remove any parameters from a link
 * @param {string} link
 */
function getLinkWithParametersRemoved(link) {
  return link.match(/(https?:\/\/[^&\s]+)/)[1];
}

/**
 * Get the thread name determined by the type of content in the link
 * @param {string} link
 */
async function getThreadChannelName(cachedLinkData) {
  try {
    const result = (async () => {
      const { link, title } = cachedLinkData;
      // try fetching the YouTube playlist title
      const isLinkYouTubePlaylistWithoutVideo = getIsLinkYouTubePlaylist(link) && !link.includes("v=");
      const youTubePlaylistTitle = isLinkYouTubePlaylistWithoutVideo && (await ytpl(link))?.title;
      if (youTubePlaylistTitle) return `📲 ${youTubePlaylistTitle}`;
      return `📲 ${title}`;
    })();

    if (result.length > 100) return result.slice(0, 97) + "...";
    return result;
  }
  catch({ stack }) {
    Logger.error(stack);
    return "⚠️ Error fetching title"
  }
}

/**
 * Get the total seconds from a HH:MM:SS formatted timestamp
 * @param {string} timestamp HH:MM:SS timestamp
 */
function getTimestampAsTotalSeconds(timestamp) {
  try {
    const time = timestamp.split(":");
    return (+time[0]) * 60 * 60 + (+time[1]) * 60 + (+time[2]);
  }
  catch({ stack }) {
    Logger.error(stack);
  }
}

async function showButtonDocumentation(interaction) {
  try {
    await interaction.deferReply({ ephemeral: true });

    const channelMessages = await getChannelMessages(interaction.channel.id);
    const getIsDocumentationButton = ({ data: custom_id }) => custom_id === COMPONENT_CUSTOM_IDS.SHOW_BUTTON_DOCUMENTATION;
    const documentationButtonIndex = channelMessages.findIndex(m => m.components?.[0]?.components.some(getIsDocumentationButton));
    const documentedButtonMessages = channelMessages.slice(0, documentationButtonIndex - 1);

    const result = [];

    for(const message of documentedButtonMessages) {
      const components = message.components?.[0]?.components;
      if (!components) continue;

      const buttonData = components.map(c => c.data).reverse(); // reverse row items so they're upserted in order
      const interactionData = buttonData.map(b => COMPONENT_INTERACTIONS.find(c => c.customId === b.custom_id));

      for(const { custom_id, emoji, label} of buttonData) {
        const id = interactionData.filter(x => x).find(x => x.customId === custom_id);
        if (!id || custom_id === COMPONENT_CUSTOM_IDS.SHOW_BUTTON_DOCUMENTATION) continue;

        const { description, requiredRoleIds } = id;
        const formattedEmoji = emoji.id ? `<:${emoji.name}:${emoji.id}>` : emoji.name;
        const formattedRoles = requiredRoleIds ? ` \`🔒Locked\` ${requiredRoleIds.map(r => `<@&${r}>`).join(" ")}` : "";
        const stringResult = `${formattedEmoji} **${label}**${formattedRoles}\n\`\`\`${description}\`\`\``;

        if (!result.includes(stringResult)) result.unshift(stringResult);
      }
    }

    await interaction.editReply({ content: `Here's what I know about these buttons:\n\n${result.join("\n")}` });
  }
  catch({ stack }) {
    Logger.error(stack);
  }
}

/**
 * Get all songs within a YouTube playlist and post them as interaction replies
 * @param {Interaction} interaction
 */
async function showAllYouTubePlaylistSongs(interaction) {
  try {
    await interaction.deferReply({ ephemeral: true });

    const link = await getLinkFromMessageHierarchy(interaction.message);
    const cachedLinkData = await getOrInitializeLinkData(link);
    const playlist = await ytpl(cachedLinkData.link);

    const downloadMp3Button = new ButtonBuilder();
    downloadMp3Button.setCustomId(COMPONENT_CUSTOM_IDS.DOWNLOAD_MP3_BUTTON);
    downloadMp3Button.setEmoji("📲");
    downloadMp3Button.setLabel("Download MP3");
    downloadMp3Button.setStyle(ButtonStyle.Secondary);

    const searchingPlexButton = new ButtonBuilder();
    searchingPlexButton.setCustomId(COMPONENT_CUSTOM_IDS.SEARCHING_PLEX_BUTTON);
    searchingPlexButton.setDisabled(true);
    searchingPlexButton.setEmoji("⏳");
    searchingPlexButton.setLabel("Searching in Plex");
    searchingPlexButton.setStyle(ButtonStyle.Secondary);

    const components = [new ActionRowBuilder().addComponents(downloadMp3Button, searchingPlexButton)];

    for(let i = 0; i < playlist.items.length; i++) {
      const cleanTitle = playlist.title.replaceAll("`", "").replaceAll("*", "").replaceAll(" _", "").replaceAll("_ ", "");
      const content = `${discord_youtube_emoji} \`${i + 1}/${playlist.items.length}\` **${cleanTitle}**\n${playlist.items[i].shortUrl}`;
      const messageWithPlexButton = await interaction.followUp({ components, content, ephemeral: true });
      validateMessageWithPlexButton({ interaction, messageWithPlexButton });
      await new Promise(resolve => setTimeout(resolve, 250));
    }
  }
  catch({ stack }) {
    Logger.error(stack);
  }
}

/**
 * Show the popup modal to confirm file deletion from Plex
 * @param {Interaction} interaction
 * @param {string} modalCustomId
 * @param {string} modalTitle
 */
async function showDeletionModal(interaction, modalCustomId, modalTitle) {
  const operation = new ComponentOperation({
    interactionId: modalCustomId,
    messageId: interaction.message.id,
    userId: interaction.user.id
  });

  if (operation.isBusy) {
    await interaction.deferUpdate();
    return;
  }

  // we don't do anything with this data, we just want a confirmation
  //   before the file gets deleted (and Discord has no way besides a
  //   text input because it doesn't have other types of basic input)

  const reasonTextInput = new TextInputBuilder();
  reasonTextInput.setCustomId("reason");
  reasonTextInput.setLabel("Reason for deletion");
  reasonTextInput.setRequired(true);
  reasonTextInput.setStyle(TextInputStyle.Paragraph);

  const actionRow = new ActionRowBuilder().addComponents(reasonTextInput);

  try {
    interaction.showModal(new ModalBuilder()
      .addComponents(actionRow)
      .setCustomId(modalCustomId)
      .setTitle(modalTitle)
    );
  }
  catch({ stack }) {
    Logger.error(stack);
  }
}

/**
 * Show the popup modal to input a links metadata information
 * @param {Interaction} interaction
 * @param {string} modalCustomId
 * @param {string} modalTitle
 */
async function showMetadataModal(interaction, modalCustomId, modalTitle) {
  const operation = new ComponentOperation({
    interactionId: modalCustomId,
    messageId: interaction.message.id,
    userId: interaction.user.id
  });

  if (operation.isBusy) {
    await interaction.deferUpdate();
    return;
  }

  try {
    const link = await getLinkFromMessageHierarchy(interaction.message);
    const cachedLinkData = await getOrInitializeLinkData(link);
    const { authorName, endTime, title } = cachedLinkData;

    const titleTextInput = new TextInputBuilder();
    titleTextInput.setCustomId("title");
    titleTextInput.setLabel("Track Title");
    titleTextInput.setRequired(true);
    titleTextInput.setStyle(TextInputStyle.Short);
    titleTextInput.setValue(title);

    const artistTextInput = new TextInputBuilder();
    artistTextInput.setCustomId("artist");
    artistTextInput.setLabel("Track Artist");
    artistTextInput.setRequired(true);
    artistTextInput.setStyle(TextInputStyle.Short);
    artistTextInput.setValue(authorName);

    const startTextInput = new TextInputBuilder();
    startTextInput.setCustomId("start");
    startTextInput.setLabel("Track Start");
    startTextInput.setPlaceholder("00:00:00");
    startTextInput.setStyle(TextInputStyle.Short);
    startTextInput.setValue("00:00:00");

    const endTextInput = new TextInputBuilder()
    endTextInput.setCustomId("end");
    endTextInput.setLabel("Track End");
    endTextInput.setPlaceholder(endTime);
    endTextInput.setStyle(TextInputStyle.Short);
    endTextInput.setValue(endTime);

    const actionRows = [];
    actionRows.push(new ActionRowBuilder().addComponents(titleTextInput));
    actionRows.push(new ActionRowBuilder().addComponents(artistTextInput));
    actionRows.push(new ActionRowBuilder().addComponents(startTextInput));
    actionRows.push(new ActionRowBuilder().addComponents(endTextInput));

    await interaction.showModal(new ModalBuilder()
      .addComponents(...actionRows)
      .setCustomId(modalCustomId)
      .setTitle(modalTitle)
    );
  }
  catch({ stack }) {
    Logger.error(stack);
  }
}

/**
 * Fetch the Plex API and request the media library scans for file changes
 */
async function startPlexLibraryScan() {
  try {
    const address = `http://${plex_server_ip_address}:32400/library/sections/${plex_library_section_id}/refresh`;
    const options = { headers: { "X-Plex-Token": plex_authentication_token }, method: "GET" };
    await fetch(address, options).then(() => Logger.info(`Plex library scan started`));
  }
  catch({ stack }) {
    Logger.error(stack);
  }
}

/**
 * Update the Plex button with the status of the links existence in the Plex library download folder
 * @param {Message} message
 */
async function validateMessageWithPlexButton({ cachedLinkData, interaction, messageWithPlexButton }) {
  try {
    const isArchived = messageWithPlexButton.channel.archived;
    if (isArchived) await messageWithPlexButton.channel.setArchived(false);

    const referenceMessage = messageWithPlexButton.reference
      && !getIsMessageWithPlexButtonComponent(messageWithPlexButton)
      && await findChannelMessage(messageWithPlexButton.reference.channelId, ({ id }) => id === messageWithPlexButton.reference.messageId);

    const actualMessageWithPlexButton = referenceMessage || messageWithPlexButton;
    const buttonIndex = actualMessageWithPlexButton.components[0].components.findIndex(getIsPlexButtonComponent);
    const components = [ActionRowBuilder.from(actualMessageWithPlexButton.components[0])];

    components[0].components[buttonIndex].setCustomId(COMPONENT_CUSTOM_IDS.SEARCHING_PLEX_BUTTON);
    components[0].components[buttonIndex].setDisabled(true);
    components[0].components[buttonIndex].setEmoji("⏳");
    components[0].components[buttonIndex].setLabel("Searching in Plex");

    actualMessageWithPlexButton.type === MessageType.Reply
      ? await interaction.editReply({ message: actualMessageWithPlexButton, components })
      : await actualMessageWithPlexButton.edit({ components });

    const isPlexFile = await getExistingPlexFilename(cachedLinkData);
    const customId = isPlexFile ? COMPONENT_CUSTOM_IDS.DELETE_FROM_PLEX_BUTTON : COMPONENT_CUSTOM_IDS.IMPORT_INTO_PLEX_BUTTON;
    const label = isPlexFile ? "Delete from Plex" : "Import into Plex";

    components[0].components[buttonIndex].setCustomId(customId);
    components[0].components[buttonIndex].setDisabled(false)
    components[0].components[buttonIndex].setEmoji(discord_plex_emoji)
    components[0].components[buttonIndex].setLabel(label);

    actualMessageWithPlexButton.type === MessageType.Reply
      ? await interaction.editReply({ message: actualMessageWithPlexButton, components })
      : await actualMessageWithPlexButton.edit({ components });
  }
  catch({ stack }) {
    Logger.error(stack);
  }
}
