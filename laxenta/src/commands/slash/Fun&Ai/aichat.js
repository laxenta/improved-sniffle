const { SlashCommandBuilder, MessageFlags } = require('discord.js');
const fs = require('fs');
const path = require('path');

// Define the JSON file path for storing active AI chat channels
const filePath = path.join(__dirname, '../../../data/activeChannels.json');

// Ensure the directory exists
const directory = path.dirname(filePath);
if (!fs.existsSync(directory)) {
  fs.mkdirSync(directory, { recursive: true });
}

// Load existing active channels from file
function loadActiveChannels() {
  if (fs.existsSync(filePath)) {
    try {
      return JSON.parse(fs.readFileSync(filePath, 'utf8'));
    } catch (err) {
      console.error('❌ Error reading activeChannels JSON file:', err);
      return {};
    }
  }
  return {};
}

// Save active channels to file
function saveActiveChannels(data) {
  try {
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
  } catch (err) {
    console.error('❌ Error writing activeChannels JSON file:', err);
  }
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('aichat')
    .setDescription('Toggle AI Chat for this channel.')
    .addBooleanOption(option =>
      option.setName('activate')
        .setDescription('Set to true to enable AI chat, false to disable it.')
        .setRequired(true)
    ),
  async execute(interaction) {
    const activate = interaction.options.getBoolean('activate');
    const guildId = interaction.guild?.id || "DM"; // Handle DMs properly
    const channelId = interaction.channel.id;

    // Load and update the file data
    let activeChannels = loadActiveChannels();

    // Ensure the guild exists in the data structure
    if (!activeChannels[guildId]) {
      activeChannels[guildId] = {};
    }

    const wasActive = activeChannels[guildId][channelId] || false;
    activeChannels[guildId][channelId] = activate;
    saveActiveChannels(activeChannels);

    // Update the in-memory map on the client
    if (!interaction.client.activeChannels) {
      interaction.client.activeChannels = new Map();
    }

    // Store with proper guild-channel structure in memory
    if (!interaction.client.activeChannels.has(guildId)) {
      interaction.client.activeChannels.set(guildId, new Map());
    }
    interaction.client.activeChannels.get(guildId).set(channelId, activate);

    await interaction.reply({
      content: `Goofy Navia ${activate ? 'activated' : 'deactivated'} for this channel.`,
      flags: MessageFlags.Ephemeral
    });

    // Send roleplay intro message only if it was just activated
    if (activate && !wasActive) {
      await interaction.channel.send(
        `*she is laying on a plush chaise in the bedroom of of Alucard's mountain place, she looks up from her book, "Poisonous Plants and Their Uses," her emerald eyes meeting Alucard's gaze* ..Oh, hello Alucard, was just brushing up on my botany. It's not like I have much else to do around here.. maybe watch tv i don't know what to do *She sighs, closing the book and swinging her legs around to sit up* I suppose you have something exciting planned for us? Or are you just here to check on your little slave? *mutters* dickhead..`
      );
    }
  },
};