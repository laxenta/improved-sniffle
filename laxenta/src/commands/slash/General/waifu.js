const { SlashCommandBuilder, MessageFlags } = require('discord.js');
const axios = require('axios');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('waifu')
    .setDescription('Sends a random SFW anime image.')
    .setIntegrationTypes(0, 1)
    .setContexts(0, 1, 2),
  
  async execute(interaction) {
    // Always public replies (0)
    const replyFlags = 0;
    
    try {
      const response = await axios.get('https://api.waifu.pics/sfw/waifu');
      const imageUrl = response.data.url;

      await interaction.reply({
        content: imageUrl,
        flags: replyFlags,
      });
    } catch (error) {
      console.error('Error fetching waifu image:', error);
      await interaction.reply({
        content: 'Failed to catch a waifu xd',
        flags: replyFlags,
      });
    }
  },
};