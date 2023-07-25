import { ActionRowBuilder, AttachmentBuilder, ButtonBuilder, ButtonStyle, ModalBuilder, TextInputBuilder, TextInputStyle } from "discord.js";
import { basename, parse, resolve } from "path";
import { Logger } from "../logger.js";
import * as oembed from "@extractus/oembed-extractor";
import config from "./plex_music_downloader_config.json" assert { type: "json" };
import fs from "fs-extra";
import youtubedl from "youtube-dl-exec";

const INTERACTION_ACTIONS = Object.freeze({
  DOWNLOAD_BUTTON: "music_download_script_download_button",
  DOWNLOAD_MODAL: "music_download_script_download_modal",
  PLEX_IMPORT_BUTTON: "music_download_script_plex_import_button",
  PLEX_IMPORT_MODAL: "music_download_script_plex_import_modal",
  PLEX_REMOVE_BUTTON: "music_download_script_plex_remove_button",
  PLEX_REMOVE_MODAL: "music_download_script_plex_remove_modal"
});

export const OnMessageCreate = async ({ message }) => {
  const { author, channel, content } = message;

  const isConfigChannel = config.channel_ids.includes(channel.id);
  if (!isConfigChannel) return;

  const url = getUrlFromString(content);
  if (!url) return;

  const oEmbedData = await oembed.extract(url).catch(() => null);
  if (!oEmbedData) return;

  // create a new thread under the message containing an oembedded media url
  // send a message to the thread with buttons to download or import to plex

  const { author_name, title } = oEmbedData;

  await message
    .startThread({ name: getCleanTitle(author_name, title) })
    .then(({ members }) => members.remove(author.id));

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(INTERACTION_ACTIONS.DOWNLOAD_BUTTON)
      .setEmoji("📲")
      .setLabel("Download MP3")
      .setStyle(ButtonStyle.Primary),
    new ButtonBuilder()
      .setCustomId("NULL")
      .setDisabled(true)
      .setEmoji("⏳")
      .setLabel("Searching in Plex")
      .setStyle(ButtonStyle.Secondary)
  );

  const threadMessage = await message.thread.send({
    components: [row],
    content: "You can download this music with the button below."
  });

  // check if the file exists in plex and update the plex button to reflect the result
  // we do this check last so the thread reply is instant and not delayed using yt-dlp

  const updatePlexButton = isPlexFile => {
    const { PLEX_IMPORT_BUTTON, PLEX_REMOVE_BUTTON } = INTERACTION_ACTIONS;
    row.components[1].setCustomId(isPlexFile ? PLEX_REMOVE_BUTTON : PLEX_IMPORT_BUTTON);
    row.components[1].setDisabled(false);
    row.components[1].setEmoji("<:plex:1093751472522543214>");
    row.components[1].setLabel(isPlexFile ? "Remove from Plex" : "Import into Plex")
    threadMessage.edit({ components: [row] }).catch(Logger.Error);
  }

  download({ id: message.id + author.id, url })
    .then(({ directory, filename }) => {
      const isPlexFile = fs.existsSync(`${config.plex_directory}/${filename}`);
      updatePlexButton(isPlexFile);
      fs.remove(directory);
    })
    .catch(error => {
      Logger.Error(`A yt-dlp error ocurred when checking Plex file existence`, error);
      updatePlexButton(false);
    })
}

// when a message is updated, delete the existing thread and create a new thread for valid links
// this prevents the message being updated as an invalid link and the user trying to download it
export const OnMessageUpdate = async ({ oldMessage, newMessage }) => {
  const { channel, hasThread, thread } = newMessage;

  const isConfigChannel = config.channel_ids.includes(channel.id);
  if (!isConfigChannel) return;

  const isContentUpdate = oldMessage?.content != newMessage.content;
  if (!isContentUpdate) return;

  if (hasThread) await thread.delete();
  OnMessageCreate({ message: newMessage });
}

const pendingInteractions = new Set(); // interaction.customId + interaction.user.id

export const OnInteractionCreate = async ({ interaction }) => {
  const { customId, member: { roles }, message: { channel }, user, user: { username } } = interaction;

  if (pendingInteractions.has(customId + user.id)) {
    interaction.deferUpdate();
    return;
  }

  const isAction = Object.values(INTERACTION_ACTIONS).includes(customId);
  if (!isAction) return;

  const { channelId } = await channel.fetchStarterMessage();
  const isChannel = config.channel_ids.includes(channelId);
  if (!isChannel) return;

  Logger.Info(`${username} interacted with "${customId}"`);

  const replyUnauthorized = ({ interaction, appendedErrorText }) => {
    Logger.Info(`${username} was unauthorized to ${appendedErrorText}`);
    const content = `You aren't authorized to ${appendedErrorText}!`;
    const files = [{ attachment: "assets\\you_are_arrested.png" }];
    interaction.reply({ content, ephemeral: true, files });
  }

  switch (customId) {
    case INTERACTION_ACTIONS.DOWNLOAD_BUTTON:
      return showMetadataModal({ customId: INTERACTION_ACTIONS.DOWNLOAD_MODAL, interaction, modalTitle: "Download MP3" });
    case INTERACTION_ACTIONS.DOWNLOAD_MODAL:
      return uploadUrlToThread({ interaction });
    case INTERACTION_ACTIONS.PLEX_IMPORT_BUTTON:
      return roles.cache.has(config.plex_user_role_id)
        ? showMetadataModal({ interaction, customId: INTERACTION_ACTIONS.PLEX_IMPORT_MODAL, modalTitle: "Import into Plex" })
        : replyUnauthorized({ interaction, appendedErrorText: "import into Plex" });
    case INTERACTION_ACTIONS.PLEX_IMPORT_MODAL:
      return roles.cache.has(config.plex_user_role_id)
        ? importUrlIntoPlex({ interaction })
        : replyUnauthorized({ interaction, appendedErrorText: "import into Plex" });
    case INTERACTION_ACTIONS.PLEX_REMOVE_BUTTON:
      return roles.cache.has(config.plex_user_role_id)
        ? showRemovalModal({ interaction, customId: INTERACTION_ACTIONS.PLEX_REMOVE_MODAL, modalTitle: "Remove from Plex" })
        : replyUnauthorized({ interaction, appendedErrorText: "remove from Plex" })
    case INTERACTION_ACTIONS.PLEX_REMOVE_MODAL:
      return roles.cache.has(config.plex_user_role_id)
        ? removeUrlFromPlex({ interaction })
        : replyUnauthorized({ interaction, appendedErrorText: "remove from Plex" })
  }

  function showRemovalModal({ customId, interaction, modalTitle }) {
    const components = new ActionRowBuilder().addComponents(
      new TextInputBuilder()
        .setCustomId("reason")
        .setLabel("Reason for removal")
        .setRequired(true)
        .setStyle(TextInputStyle.Paragraph)
    );

    const modal = new ModalBuilder()
      .addComponents(components)
      .setCustomId(customId)
      .setTitle(modalTitle);

    interaction.showModal(modal);
  }

  async function showMetadataModal({ customId, interaction, modalTitle }) {
    const { message: { channel }, user: { username } } = interaction;

    const { content } = await channel.fetchStarterMessage();
    const url = getUrlFromString(content);
    if (!url) return;

    const { author_name, title } = await oembed.extract(url).catch(error => {
      Logger.Error(`${username} couldn't fetch metadata modal oEmbed data because an error ocurred`, error);
      // if we pass undefined to Discord their API may explode so we will pass the API empty strings instead
      return { author_name: "", title: "" };
    });

    const components = [
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId("title")
          .setLabel("Track Title")
          .setRequired(true)
          .setStyle(TextInputStyle.Short)
          .setValue(getCleanTitle(author_name, title))
      ),
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId("artist")
          .setLabel("Track Artist")
          .setRequired(true)
          .setStyle(TextInputStyle.Short)
          .setValue(getCleanArtist(author_name, title))
      ),
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId("genre")
          .setLabel("Track Genre")
          .setPlaceholder("Genre (Optional)")
          .setRequired(false)
          .setStyle(TextInputStyle.Short)
      )
    ]

    const modal = new ModalBuilder()
      .addComponents(...components)
      .setCustomId(customId)
      .setTitle(modalTitle);

    interaction.showModal(modal);
  }

  async function importUrlIntoPlex({ interaction }) {
    await interaction.deferReply({ ephemeral: true });

    const { fields, message, message: { channel, components }, user, user: { username } } = interaction;

    const row = ActionRowBuilder.from(components[0]);
    row.components[1].setDisabled(true);
    message.edit({ components: [row] });

    const starterMessage = await channel.fetchStarterMessage();
    const url = getUrlFromString(starterMessage.content);

    const metadata = {
      artist: fields.getTextInputValue("artist"),
      genre: fields.getTextInputValue("genre"),
      title: fields.getTextInputValue("title")
    }

    download({ id: starterMessage.id + user.id, metadata, url })
      .then(({ directory, filename, filepath }) => {
        const plexFilepath = `${config.plex_directory}/${filename}`;
        const isPlexFile = fs.existsSync(plexFilepath);

        if (isPlexFile) {
          fs.remove(directory);
          interaction.editReply(`Your file couldn't be imported into Plex because it already exists.`);
          Logger.Warn(`${username} couldn't import "${filename}" into Plex because it already exists`);
        } else {
          fs.move(filepath, plexFilepath).then(() => fs.remove(directory) && startPlexLibraryScan(username));
          interaction.editReply("Success! Your file was imported into Plex.");
          Logger.Info(`${username} imported "${filename}" into Plex`);
        }

        row.components[1]
          .setCustomId(INTERACTION_ACTIONS.PLEX_REMOVE_BUTTON)
          .setLabel("Remove from Plex");
      })
      .catch(error => {
        interaction.editReply(getErrorReply(error));
        Logger.Error(`${username} couldn't import their music into Plex`, error);
      })
      .finally(() => {
        row.components[1].setDisabled(false);
        message.edit({ components: [row] });
      })
  }

  async function removeUrlFromPlex({ interaction }) {
    await interaction.deferReply({ ephemeral: true });

    const { fields, message, message: { channel, components }, user, user: { username } } = interaction;

    const row = ActionRowBuilder.from(components[0]);
    row.components[1].setDisabled(true);
    message.edit({ components: [row] });

    // --get-filename returns the pre-processed filename, which is NOT the resulting filename
    // download the file again for an exact value and silently weep over our performance loss

    const starterMessage = await channel.fetchStarterMessage();
    const url = getUrlFromString(starterMessage.content);

    download({ id: starterMessage.id + user.id, url })
      .then(({ directory, filename }) => {
        const plexFilepath = `${config.plex_directory}/${filename}`;
        const isPlexFile = fs.existsSync(plexFilepath);
        fs.remove(directory);

        if (isPlexFile) {
          const reason = fields.getTextInputValue("reason");
          fs.remove(plexFilepath).then(() => startPlexLibraryScan(username));
          interaction.editReply("Your file was successfully removed from Plex.");
          Logger.Info(`${username} removed "${filename}" from Plex`, `${username} removal reason: "${reason}"`);
        } else {
          interaction.editReply(`Your file couldn't be removed from Plex because it wasn't found.`);
          Logger.Warn(`${username} couldn't remove "${filename}" from Plex because it wasn't found`);
        }

        row.components[1]
          .setCustomId(INTERACTION_ACTIONS.PLEX_IMPORT_BUTTON)
          .setLabel("Import into Plex");
      })
      .catch(error => {
        interaction.editReply(getErrorReply(error));
        Logger.Error(`${username} couldn't remove their music from Plex`, error);
      })
      .finally(() => {
        row.components[1].setDisabled(false);
        message.edit({ components: [row] });
      })
  }

  function startPlexLibraryScan(username) {
    const { plex_section_id, plex_server_ip, plex_x_token } = config;
    const fetchAddress = `http://${plex_server_ip}:32400/library/sections/${plex_section_id}/refresh`;
    const fetchOptions = { method: "GET", headers: { "X-Plex-Token": plex_x_token } };
    fetch(fetchAddress, fetchOptions)
      .then(() => Logger.Info(`${username} started a Plex media library scan`))
      .catch((error) => Logger.Error(`${username} couldn't start a Plex media library scan`, error));
  }

  async function uploadUrlToThread({ interaction }) {
    await interaction.deferReply({ ephemeral: true });

    const { fields, message: { channel }, user, user: { username } } = interaction;
    pendingInteractions.add(INTERACTION_ACTIONS.DOWNLOAD_BUTTON + user.id);

    const starterMessage = await channel.fetchStarterMessage();
    const url = getUrlFromString(starterMessage.content);

    const metadata = {
      audioFormat: "mp3",
      artist: fields.getTextInputValue("artist"),
      genre: fields.getTextInputValue("genre"),
      title: fields.getTextInputValue("title"),
      updateFilename: true
    }

    const onReject = error => {
      const content = getErrorReply(error);
      interaction.editReply(content).catch(Logger.Error);
      Logger.Error(`${username} couldn't upload their music to Discord`, error);
    };

    download({ id: starterMessage.id + user.id, metadata, url })
      .then(({ directory, filename, filepath }) => {
        const files = [new AttachmentBuilder(filepath, { name: filename })];
        interaction.editReply({ files })
          .then(() => Logger.Info(`${username} uploaded "${filename}" to Discord`))
          .catch(onReject)
          .finally(() => fs.remove(directory));
      })
      .catch(onReject)
      .finally(() => pendingInteractions.delete(INTERACTION_ACTIONS.DOWNLOAD_BUTTON + user.id));
  }
};

async function download({ id, metadata, url }) {
  const format = str => str.trim().replaceAll("'", "'\\''"); // escape single quote for ffmpeg

  const postprocessorArgs =
    "ffmpeg:"
      + " -metadata album='Downloads'"
      + " -metadata album_artist='Various Artists'"
      + " -metadata date=''"
      + " -metadata track=''"
      + (metadata?.artist && ` -metadata artist='${format(metadata.artist)}'`)
      + (metadata?.genre && ` -metadata genre='${format(metadata.genre)}'`)
      + (metadata?.title && ` -metadata title='${format(metadata.title)}'`)

  const outputFilename = metadata?.updateFilename
    ? `${config.temp_directory}/${id}/${metadata.artist} - ${metadata.title}.%(ext)s`
    : `${config.temp_directory}/${id}/%(uploader)s - %(title)s.%(ext)s`;

  const options = {
    audioQuality: 0,
    embedMetadata: true,
    extractAudio: true,
    format: "bestaudio/best",
    output: outputFilename,
    postprocessorArgs
  }

  if (metadata?.audioFormat) options["audioFormat"] = metadata.audioFormat;
  await youtubedl(url, options).catch(error => { throw new Error(error); });

  const oldFilename = fs.readdirSync(`${config.temp_directory}/${id}`)[0];
  const oldFilepath = resolve(`${config.temp_directory}/${id}/${oldFilename}`);
  const newFilename = `${parse(oldFilename).name.replaceAll(".", "")}${parse(oldFilename).ext}`;
  const newFilepath = resolve(`${config.temp_directory}/${id}/${newFilename}`);
  fs.renameSync(oldFilepath, newFilepath);

  return {
    directory: `${config.temp_directory}/${id}`,
    filename: basename(newFilepath),
    filepath: newFilepath
  }
}

const getCleanArtist = (author_name, title) => {
  let result = author_name;
  if (result.endsWith(" - Topic")) result = result.slice(0, -" - Topic".length)
  return result.trim();
}

const getCleanTitle = (author_name, title) => {
  let result = title;
  if (result.startsWith(`${author_name} - `)) result = result.slice(`${author_name} - `.length);
  if (result.endsWith(` by ${author_name}`)) result = result.slice(0, -` by ${author_name}`.length);
  return result.trim();
}

const getErrorReply = error =>
  `I encountered an error and couldn't continue.\n\`\`\`${error}\n\`\`\``;

const getUrlFromString = input => {
  const match = input.match(/(https?:\/\/[^&\s]+)/);
  return match ? match[1] : null;
}