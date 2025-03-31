const fs = require('fs');
const path = require('path');
const { handleChat } = require('../utils/chatUtils');

// Define the JSON file path where active channels are saved.
const filePath = path.join(__dirname, '../data/activeChannels.json');

// Load active channels from the file.
function loadActiveChannelsFromFile() {
  if (fs.existsSync(filePath)) {
    try {
      return JSON.parse(fs.readFileSync(filePath, 'utf8'));
    } catch (err) {
      console.error('❌ Error reading activeChannels JSON file:', err);
    }
  }
  return {};
}

/**
 * Checks if a channel is active for AI chat.
 * For DM channels, it auto-enables them and writes the entry to the JSON file.
 */
function isActiveChannel(channelId, guildId, client) {
  if (!client.activeChannels) client.activeChannels = new Map();

  // Use "DM" as the guild ID for direct messages.
  const key = `${guildId || "DM"}-${channelId}`;

  if (client.activeChannels.has(key)) {
    return client.activeChannels.get(key);
  }

  const fileData = loadActiveChannelsFromFile();
  let isActive;
  if (guildId === "DM") {
    isActive = true; // Always active for DMs.
    // Ensure the DM section exists in the file data.
    if (!fileData["DM"]) {
      fileData["DM"] = {};
    }
    // If this DM channel isn't already saved, add it.
    if (!fileData["DM"][channelId]) {
      fileData["DM"][channelId] = true;
      fs.writeFileSync(filePath, JSON.stringify(fileData, null, 2));
    }
  } else {
    isActive = Boolean(fileData[guildId]?.[channelId]);
  }

  client.activeChannels.set(key, isActive);
  return isActive;
}

module.exports = {
  name: 'messageCreate',
  async execute(message, client) {
    // Ignore bot messages.
    if (message.author.bot) return;

    // For DMs, message.guild is undefined, so we default guildId to "DM".
    const guildId = message.guild?.id || "DM";
    const channelId = message.channel.id;

    // Check if the message is in an active AI channel or it's a DM.
    if (isActiveChannel(channelId, guildId, client)) {
      await handleChat(message);
    }
  },
};