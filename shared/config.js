import { ActionRowBuilder, ButtonBuilder, ButtonStyle, TextInputBuilder, TextInputStyle, ModalBuilder, MessageType } from "discord.js";
import { filterChannelMessages, findChannelMessage } from "../index.js";
import { getUniqueFilename } from "./helpers/string.js";
import { splitJsonStringByLength } from "./helpers/array.js";
import { tryDeleteThread } from "./helpers/discord.js";
import { tryParseJsonObject } from "./helpers/object.js";
import fs from "fs-extra";
import Logger from "./logger.js";

const { discord_config_channel_id } = fs.readJsonSync("./config.json");

const CONFIG_INSTANCES = {};

const logger = new Logger("config.js");

// todo: updating config from plugin, reload config thread

// ------------------------------------------------------------------------- //
// >> INTERACTION DEFINITIONS                                             << //
// ------------------------------------------------------------------------- //

export const COMPONENT_CUSTOM_IDS = {
  CONFIG_EDIT_CONFIG_BUTTON: "CONFIG_EDIT_CONFIG_BUTTON",
  CONFIG_EDIT_CONFIG_MODAL: "CONFIG_EDIT_CONFIG_MODAL",
  CONFIG_EDIT_CONFIG_VALUE: "CONFIG_EDIT_CONFIG_VALUE",
  CONFIG_LOCK_CHANGES_BUTTON: "CONFIG_LOCK_CHANGES_BUTTON",
  CONFIG_UNLOCK_CHANGES_BUTTON: "CONFIG_UNLOCK_CHANGES_BUTTON"
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
    customId: COMPONENT_CUSTOM_IDS.CONFIG_LOCK_CHANGES_BUTTON,
    onInteractionCreate: ({ interaction }) => onLockChangesButton({ interaction })
  },
  {
    customId: COMPONENT_CUSTOM_IDS.CONFIG_UNLOCK_CHANGES_BUTTON,
    onInteractionCreate: ({ interaction }) => onUnlockChangesButton({ interaction })
  },
]

export const onMessageDelete = ({ message }) => tryDeleteThread({
  allowedChannelIds: [discord_config_channel_id],
  logger, starterMessage: message
});

export default class Config {
  constructor(configFilename) {
    const root = fs.readJsonSync("config.json");
    Object.assign(this, root);

    this.filename = configFilename;
    this.filepath = `./plugins/${configFilename}`;

    this.jsonObject = {};
    this.starterMessage = null;
    this.threadChannel = null;

    this.getIsEditable = () => this.toString().length <= 4000;
    this.getIsLocked = () => this.starterMessage?.content.includes("🔒");
    this.toString = () => getJsonFormattedString(this.jsonObject);

    CONFIG_INSTANCES[this.filename] = this;
  }

  /**
   * @param {Client} client
   */
  async initialize(client) {
    try {
      this.starterMessage ??= await findChannelMessage(discord_config_channel_id, ({ thread }) => thread?.name === this.filename);
      this.threadChannel ??= this.starterMessage?.thread;

      if (!this.starterMessage) {
        // create the starter message on the first run of a new plugin
        const channel = await client.channels.fetch(discord_config_channel_id);
        this.starterMessage = await channel.send({ content: "🟥🔓 `Changes Unlocked`" });
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
        logger.info(`Created new config values from Discord for "${this.filename}"`);
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

      else if (isConfigUpdate && this.getIsLocked()) {
        this.jsonObject = tryParseJsonObject(threadChannelJsonAsString);
        await fs.rename(this.filepath, backupFilepath);
        logger.info(`Renamed "${this.filename}" to "${backupFilename}"`);
        await fs.writeFile(this.filepath, threadChannelJsonAsString);
        logger.info(`Restored locked config from Discord for "${this.filename}"`);
      }

      else if (isConfigUpdate) {
        this.jsonObject = existingJsonAsObject;

        await fs.writeFile(backupFilepath, threadChannelJsonAsString);
        logger.info(`Saved obsolete config from Discord to "${backupFilename}"`);

        const threadChannelFilter = ({ type }) => type === MessageType.Default;
        const threadChannelMessages = await filterChannelMessages(this.threadChannel.id, threadChannelFilter);
        for(const threadMessage of threadChannelMessages) await threadMessage.delete(); // todo: edit not delete
        logger.info(`Deleted obsolete config from Discord for "${this.filename}"`);

        let contents = splitJsonStringByLength(`${this}`, 1986);
        if (!contents.length) contents.push(`{}`);
        contents = contents.map(str => `\`\`\`json\n${str}\n\`\`\``);

        const editButton = getEditButtonComponent({ isDisabled: false });
        const lockButton = getLockButtonComponent();
        const components = [new ActionRowBuilder().addComponents(editButton, lockButton)];

        for(let i = 0; i < contents.length; i++) {
          const data = { content: contents[i] };
          if (i === contents.length - 1) data["components"] = components;
          console.log(data);
          await this.threadChannel.send(data);
        }

        logger.info(`Sent updated config to Discord for "${this.filename}"`);
      }

      Object.assign(this, this.jsonObject);
      return this;
    }
    catch({ stack }) {
      logger.error(stack);
    }
  }
}

function getEditButtonComponent({ isDisabled }) {
  const button = new ButtonBuilder();
  button.setCustomId(COMPONENT_CUSTOM_IDS.CONFIG_EDIT_CONFIG_BUTTON);
  button.setDisabled(isDisabled);
  button.setEmoji("📝");
  button.setLabel("Edit Config");
  button.setStyle(isDisabled ? ButtonStyle.Secondary : ButtonStyle.Primary);
  return button;
}

function getJsonFormattedString(jsonObject) {
  return JSON.stringify(jsonObject, null, 2)
}

function getLockButtonComponent() {
  const button = new ButtonBuilder();
  button.setCustomId(COMPONENT_CUSTOM_IDS.CONFIG_LOCK_CHANGES_BUTTON);
  button.setEmoji("🔒");
  button.setLabel("Lock Changes");
  button.setStyle(ButtonStyle.Success);
  return button;
}

function getUnlockButtonComponent() {
  const button = new ButtonBuilder();
  button.setCustomId(COMPONENT_CUSTOM_IDS.CONFIG_UNLOCK_CHANGES_BUTTON);
  button.setEmoji("🔓");
  button.setLabel("Unlock Changes");
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
  catch({ stack }) {
    logger.error(stack);
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
  const textInputValue = fields.getTextInputValue(CONFIG_EDIT_CONFIG_VALUE);
  const textInputValueAsJson = tryParseJsonObject(textInputValue);

  if (!textInputValueAsJson) {
    await interaction.editReply("Your input was not valid JSON. Try again.");
    return;
  }

  const config = CONFIG_INSTANCES[interaction.channel.name];
  const backupFilename = getUniqueFilename(config.filepath);
  const backupFilepath = config.filepath.replace(config.filename, backupFilename);

  const threadChannelJsonAsString = getJsonFormattedString(textInputValueAsJson);
  const threadChannelJsonAsObject = tryParseJsonObject(threadChannelJsonAsString);

  await fs.rename(config.filepath, backupFilepath);
  logger.info(`Renamed "${config.filename}" to "${backupFilename}"`);
  await fs.writeFile(config.filepath, threadChannelJsonAsString);
  logger.info(`Saved config from Discord for "${config.filename}"`);

  config.jsonObject = threadChannelJsonAsObject;
  Object.assign(config, config.jsonObject);

  await interaction.deleteReply();
  await interaction.followUp({ content: "Success! The config has been updated.", ephemeral: true });
}

/**
 * Update the starter message content with the lock status; disable the edit button and display the unlock button
 * @param {Object} param
 * @param {ButtonInteraction} param.interaction
 */
async function onLockChangesButton({ interaction }) {
  await interaction.deferUpdate();

  const starterMessage = await interaction.channel.fetchStarterMessage();
  await starterMessage.edit("🟩🔒 `Changes Locked`");

  const editButton = getEditButtonComponent({ isDisabled: true });
  const unlockButton = getUnlockButtonComponent();

  const components = [new ActionRowBuilder().addComponents(editButton, unlockButton)];
  await interaction.message.edit({ components });
}

/**
 * Update the starter message content with the unlock status; enable the edit button and display the lock button
 * @param {Object} param
 * @param {ButtonInteraction} param.interaction
 */
async function onUnlockChangesButton({ interaction }) {
  await interaction.deferUpdate();

  const starterMessage = await interaction.channel.fetchStarterMessage();
  await starterMessage.edit("🟥🔓 `Changes Unlocked`");

  const editButton = getEditButtonComponent({ isDisabled: false });
  const lockButton = getLockButtonComponent();

  const components = [new ActionRowBuilder().addComponents(editButton, lockButton)];
  await interaction.message.edit({ components });
}
