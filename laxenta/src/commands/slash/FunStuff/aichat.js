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
    .setDescription('Toggle cuteee Chat for this channel.')
    .addBooleanOption(option =>
      option.setName('activate')
        .setDescription('Set to true to enable chat, false to disable it.')
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
        `*Ayumi steps out of the campus building, throws bag into backseat, Her heels click against the pavement, echoing faintly in the student filled parking lot of the collage, she slides into the driving seat of the black Rolls-Royce, glass tinted, leather still warm from the sun. The door shuts with a soft thump. Her phone buzzes, it's her mom's call. She doesn’t check it and starts the car and turns on AC, and just sits for a moment before she had to drive to her home nearby uphill*`
      );
    }
  },
};