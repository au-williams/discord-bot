import { ActionRowBuilder, ButtonBuilder, ButtonStyle, TextInputBuilder, TextInputStyle, ModalBuilder, MessageType } from "discord.js";
import { filterChannelMessages, findChannelMessage } from "../index.js";
import { getUniqueFilename, splitJsonStringByLength, tryParseJsonObject } from "./helpers/utilities.js";
import { tryDeleteThread } from "./helpers/discord.js";
import fs from "fs-extra";
import Logger from "./logger.js";

const { discord_config_channel_id } = fs.readJsonSync("./config.json");

const CONFIG_INSTANCES = {};

const logger = new Logger("config.js");

// todo: broken if thread with no content
// todo: updating config from plugin, reload config thread

// ------------------------------------------------------------------------- //
// >> INTERACTION DEFINITIONS                                             << //
// ------------------------------------------------------------------------- //

export const COMPONENT_CUSTOM_IDS = {
  CONFIG_EDIT_CONFIG_BUTTON: "CONFIG_EDIT_CONFIG_BUTTON",
  CONFIG_EDIT_CONFIG_MODAL: "CONFIG_EDIT_CONFIG_MODAL",
  CONFIG_EDIT_CONFIG_VALUE: "CONFIG_EDIT_CONFIG_VALUE",
  CONFIG_USE_CLOUD_HOST_BUTTON: "CONFIG_USE_CLOUD_HOST_BUTTON",
  CONFIG_USE_LOCAL_HOST_BUTTON: "CONFIG_USE_LOCAL_HOST_BUTTON"
}

export const COMPONENT_INTERACTIONS = [
  {
    customId: COMPONENT_CUSTOM_IDS.CONFIG_EDIT_CONFIG_BUTTON,
    onInteractionCreate: ({ interaction }) => onEditConfigButton({ interaction })
  },
  {
    customId: COMPONENT_CUSTOM_IDS.CONFIG_EDIT_CONFIG_MODAL,
    onInteractionCreate: ({ client, interaction }) => onEditConfigModal({ client, interaction })
  },
  {
    customId: COMPONENT_CUSTOM_IDS.CONFIG_USE_CLOUD_HOST_BUTTON,
    onInteractionCreate: ({ interaction }) => onCloudHostButton({ interaction })
  },
  {
    customId: COMPONENT_CUSTOM_IDS.CONFIG_USE_LOCAL_HOST_BUTTON,
    onInteractionCreate: ({ interaction }) => onLocalHostButton({ interaction })
  },
]

export const onMessageDelete = ({ message }) => tryDeleteThread({
  allowedChannelIds: [discord_config_channel_id],
  logger, starterMessage: message
});

export default class Config {
  constructor(configFilename) {
    const rootConfig = fs.readJsonSync("config.json");
    Object.assign(this, rootConfig);

    this.filename = configFilename;
    this.filepath = `./plugins/${configFilename}`;

    this.jsonObject = {};
    this.starterMessage = null;
    this.threadChannel = null;

    this.getIsCloudHosted = () => this.starterMessage?.content.includes("☁️");
    this.getIsEditable = () => this.toString().length <= 4000;
    this.toString = () => getJsonFormattedString(this.jsonObject);

    CONFIG_INSTANCES[this.filename] = this;
  }

  /**
   * @param {Client} client
   */
  async initialize(client) {
    try {
      this.starterMessage = await findChannelMessage(discord_config_channel_id, ({ thread }) => thread?.name === this.filename);
      this.threadChannel = this.starterMessage?.thread;

      if (!this.starterMessage) {
        // create the starter message on the first run of a new plugin
        const channel = await client.channels.fetch(discord_config_channel_id);
        this.starterMessage = await channel.send({ content: "🟥 🖥️ `Syncing with local host`" });
      }

      if (!this.threadChannel) {
        // create the thread channel on the first run of a new plugin (or if it was deleted)
        this.threadChannel = await this.starterMessage.startThread({ name: this.filename });
      }

      const threadChannelJsonAsString = (await filterChannelMessages(this.threadChannel.id, ({ content }) => content.startsWith("```json")))
        .map(message => message?.content?.replaceAll("```json", "").replaceAll("\n```", ""))
        .reverse().join("").trim();

      if (!fs.existsSync(this.filepath)) {
        await fs.writeFile(this.filepath, threadChannelJsonAsString || "{}");
        logger.info(`Created new config for "${this.filename}"`);
        this.jsonObject = fs.readJsonSync(this.filepath);
        Object.assign(this, this.jsonObject);
        return this;
      }

      const existingJsonAsObject = fs.readJsonSync(this.filepath);
      const existingJsonAsString = getJsonFormattedString(existingJsonAsObject);

      const backupFilename = getUniqueFilename(this.filepath);
      const backupFilepath = this.filepath.replace(this.filename, backupFilename);
      const isConfigUpdate = existingJsonAsString !== threadChannelJsonAsString;

      if (!isConfigUpdate) {
        this.jsonObject = existingJsonAsObject;
      }

      else if (this.getIsCloudHosted()) {
        // save cloud contents to local file
        this.jsonObject = tryParseJsonObject(threadChannelJsonAsString);
        await fs.rename(this.filepath, backupFilepath);
        logger.info(`Renamed "${this.filename}" to "${backupFilename}"`);
        await fs.writeFile(this.filepath, threadChannelJsonAsString);
        logger.info(`Restored cloud config for "${this.filename}"`);
      }

      else {
        // save local file contents to cloud
        this.jsonObject = existingJsonAsObject;
        // only back up the thread channel if it has string contents to save!
        if (threadChannelJsonAsString) await fs.writeFile(backupFilepath, threadChannelJsonAsString);
        if (threadChannelJsonAsString) logger.info(`Saved obsolete cloud config "${backupFilename}"`);
        await updateThreadChannelJsonMessages(this);
      }

      Object.assign(this, this.jsonObject);
      return this;
    }
    catch(e) {
      logger.error(e);
    }
  }
}

async function updateThreadChannelJsonMessages(config) {
  let updatedMessageContents = splitJsonStringByLength(config.toString(), 1986);
  if (!updatedMessageContents.length) updatedMessageContents.push(`{}`);
  updatedMessageContents = updatedMessageContents.map(str => `\`\`\`json\n${str}\n\`\`\``);

  const editButton = getEditButtonComponent();
  const lockButton = getCloudButtonComponent();
  const components = [new ActionRowBuilder().addComponents(editButton, lockButton)];

  const filter = ({ type }) => type === MessageType.Default;
  const threadChannelMessages = await filterChannelMessages(config.threadChannel.id, filter);
  for(const threadChannelMessage of threadChannelMessages) await threadChannelMessage.delete();

  for(let i = 0; i < updatedMessageContents.length; i++) {
    const options = { components: [], content: updatedMessageContents[i] };
    if (i === updatedMessageContents.length - 1) options.components = components;
    await config.threadChannel.send(options);
  }

  logger.info(`Saved updated cloud config for "${config.filename}"`);
}

function getCloudButtonComponent() {
  const button = new ButtonBuilder();
  button.setCustomId(COMPONENT_CUSTOM_IDS.CONFIG_USE_CLOUD_HOST_BUTTON);
  button.setEmoji("☁️");
  button.setLabel("Use Cloud Host");
  button.setStyle(ButtonStyle.Success);
  return button;
}

function getEditButtonComponent() {
  const button = new ButtonBuilder();
  button.setCustomId(COMPONENT_CUSTOM_IDS.CONFIG_EDIT_CONFIG_BUTTON);
  button.setEmoji("📝");
  button.setLabel("Edit Config");
  button.setStyle(ButtonStyle.Primary);
  return button;
}

function getJsonFormattedString(jsonObject) {
  return JSON.stringify(jsonObject, null, 2)
}

function getLocalButtonComponent() {
  const button = new ButtonBuilder();
  button.setCustomId(COMPONENT_CUSTOM_IDS.CONFIG_USE_LOCAL_HOST_BUTTON);
  button.setEmoji("🖥️");
  button.setLabel("Use Local Host");
  button.setStyle(ButtonStyle.Danger);
  return button;
}

async function onEditConfigButton({ interaction }) {
  try {
    const config = CONFIG_INSTANCES[interaction.channel.name];

    if (!fs.existsSync(config.filepath)) {
      // this shouldn't run unless there is an oops deleting the config file after startup
      const content = `This config can't be edited because it doesn't exist on the host.`;
      await interaction.reply({ content, ephemeral: true });
      return;
    }

    if (!config.getIsEditable()) {
      // this shouldn't run unless there is an oops enabling a button that should be disabled
      const content = `This config can't be edited because it exceeds Discord's size limit.`;
      await interaction.reply({ content, ephemeral: true });
      return;
    }

    const textInput = new TextInputBuilder();
    textInput.setCustomId(COMPONENT_CUSTOM_IDS.CONFIG_EDIT_CONFIG_VALUE);
    textInput.setLabel(interaction.channel.name);
    textInput.setRequired(true);
    textInput.setStyle(TextInputStyle.Paragraph);
    textInput.setValue(config.toString());

    await interaction.showModal(new ModalBuilder()
      .addComponents(new ActionRowBuilder().addComponents(textInput))
      .setCustomId(COMPONENT_CUSTOM_IDS.CONFIG_EDIT_CONFIG_MODAL)
      .setTitle("Edit JSON")
    );
  }
  catch(e) {
    logger.error(e);
  }
}

/**
 * If the user input is valid JSON then backup the JSON file, save the input, reload the config in memory
 * @param {Object} param
 * @param {ModalSubmitInteraction} param.interaction
 */
async function onEditConfigModal({ interaction }) {
  await interaction.deferReply({ ephemeral: true });

  const { fields } = interaction;
  const { CONFIG_EDIT_CONFIG_VALUE } = COMPONENT_CUSTOM_IDS;
  const textInputJsonAsString = fields.getTextInputValue(CONFIG_EDIT_CONFIG_VALUE);
  const textInputJsonAsObject = tryParseJsonObject(textInputJsonAsString);

  if (!textInputJsonAsObject) {
    await interaction.editReply("Your input was not valid JSON. Please try again.");
    return;
  }

  const config = CONFIG_INSTANCES[interaction.channel.name];
  const backupFilename = getUniqueFilename(config.filepath);
  const backupFilepath = config.filepath.replace(config.filename, backupFilename);

  await fs.rename(config.filepath, backupFilepath);
  logger.info(`Renamed obsolete "${config.filename}" to "${backupFilename}"`);
  await fs.writeFile(config.filepath, getJsonFormattedString(textInputJsonAsObject));
  logger.info(`Saved edited config for "${config.filename}"`);

  config.jsonObject = textInputJsonAsObject;
  Object.assign(config, config.jsonObject);

  await interaction.deleteReply();
  await updateThreadChannelJsonMessages(config);
  await interaction.followUp({ content: "Success! The config has been updated.", ephemeral: true });
}

/**
 * Update the starter message content with the lock status; disable the edit button and display the unlock button
 * @param {Object} param
 * @param {ButtonInteraction} param.interaction
 */
async function onCloudHostButton({ interaction }) {
  await interaction.deferUpdate();
  const starterMessage = await interaction.channel.fetchStarterMessage();
  await starterMessage.edit("🟩 ☁️ `Syncing with cloud host`");
  const editButton = getEditButtonComponent();
  const unlockButton = getLocalButtonComponent();
  const components = [new ActionRowBuilder().addComponents(editButton, unlockButton)];
  await interaction.message.edit({ components });
}

/**
 * Update the starter message content with the unlock status; enable the edit button and display the lock button
 * @param {Object} param
 * @param {ButtonInteraction} param.interaction
 */
async function onLocalHostButton({ interaction }) {
  await interaction.deferUpdate();
  const starterMessage = await interaction.channel.fetchStarterMessage();
  await starterMessage.edit("🟥 🖥️ `Syncing with local host`");
  const editButton = getEditButtonComponent({ isDisabled: false });
  const lockButton = getCloudButtonComponent();
  const components = [new ActionRowBuilder().addComponents(editButton, lockButton)];
  await interaction.message.edit({ components });
}

// ------------------------------------------------------------------------- //
// >> CODE GRAVEYARD                                                      << //
// ------------------------------------------------------------------------- //

/**
 * This code's used to edit thread channel messages instead of lazily deleting them.
 *   Too bad Discord forces the (Edited) tag below each message which creates a huge
 *   gap between messages displaying JSON content that's intended to be seamless ...
 *   To the code graveyard you go! Maybe you'll be useful one day like the old phone
 *   chargers I've had in my closet for over a decade just in case their time comes.
 */

// if (updatedMessageContents.length >= threadChannelMessages.length) {
//   // update all thread channel messages
//   for(let i = 0; i < threadChannelMessages.length; i++) {
//     const options = { components: [], content: updatedMessageContents[i] };
//     if (i === updatedMessageContents.length - 1) options.components = components;
//     await threadChannelMessages[i].edit(options);
//   }

//   // create new thread channel messages
//   for(let i = threadChannelMessages.length; i < updatedMessageContents.length; i++) {
//     const options = { components: [], content: updatedMessageContents[i] };
//     if (i === updatedMessageContents.length - 1) options.components = components;
//     await config.threadChannel.send(options);
//   }
// }

// else {
//   // update first n channel messages
//   for(let i = 0; i < updatedMessageContents.length; i++) {
//     const options = { components: [], content: updatedMessageContents[i] };
//     if (i === updatedMessageContents.length - 1) options.components = components;
//     await config.threadChannel.edit(options);
//   }

//   // delete remaining channel messages
//   for (let i = updatedMessageContents.length; i < threadChannelMessages.length; i++) {
//     const message = threadChannelMessages[i];
//     await message.delete();
//   }
// }
