import { ButtonBuilder, ButtonStyle } from "discord.js";

export function getSearchingPlexButton(componentCustomId) {
  const button = new ButtonBuilder();
  button.setCustomId(componentCustomId);
  button.setDisabled(true);
  button.setEmoji("⏳");
  button.setLabel("Searching in Plex");
  button.setStyle(ButtonStyle.Secondary);
  return button;
}

export function getDeleteFromPlexButton(componentCustomId, emojiId) {
  const button = new ButtonBuilder();
  button.setCustomId(componentCustomId);
  button.setDisabled(false);
  button.setEmoji(emojiId);
  button.setLabel("Delete from Plex");
  button.setStyle(ButtonStyle.Secondary);
  return button;
}

export function getImportIntoPlexButton(componentCustomId, emojiId) {
  const button = new ButtonBuilder();
  button.setCustomId(componentCustomId);
  button.setDisabled(false);
  button.setEmoji(emojiId);
  button.setLabel("Import into Plex");
  button.setStyle(ButtonStyle.Secondary);
  return button;
}
