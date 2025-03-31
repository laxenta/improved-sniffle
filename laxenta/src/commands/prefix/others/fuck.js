const { ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const { NSFW } = require('nsfwhub');
const nsfw = new NSFW();
const { registerButton } = require('../../../handlers/buttonHandler.js');
const { logger } = require('../../../utils/logger');

module.exports = {
  name: 'p',
  aliases: ['fuck', 'porn', 'p'],
  description: 'real NSFW content based on the specified category.',
  async execute(message, args) {
    if (!message.channel.nsfw) {
      return message.reply('This command can only be used in NSFW channels!, you can do /search command, thats usable everywhere...');
    }

    const tags = [
      'ass', 'sixtynine', 'pussy', 'dick', 'anal', 'boobs', 'bdsm', 'black',
      'easter', 'bottomless', 'blowjob', 'collared', 'cum', 'cumsluts',
      'dp', 'dom', 'extreme', 'feet', 'finger', 'fuck', 'futa', 'gay',
      'gif', 'group', 'hentai', 'kiss', 'lesbian', 'lick', 'pegged',
      'phgif', 'puffies', 'real', 'suck', 'tattoo', 'tiny', 'toys', 'xmas',
    ];

    const category = args[0]?.toLowerCase();
    if (!tags.includes(category)) {
      return message.reply(
        `Invalid category. Supported categories: ${tags.join(', ')}.`
      );
    }

    const customIdRefresh = `refresh_${category}_${message.id}`;
    const customIdDelete = `delete_${category}_${message.id}`;

    try {
      const loadingMessage = await message.channel.send('<a:wait:1310498104826396712> please wait :3...');

      const imageUrl = await fetchContent(category);
      const buttons = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId(customIdRefresh)
          .setLabel('Next')
          .setStyle(ButtonStyle.Primary),
        new ButtonBuilder()
          .setCustomId(customIdDelete)
          .setLabel('Exit')
          .setStyle(ButtonStyle.Danger)
      );

      await loadingMessage.edit({ content: imageUrl, components: [buttons] });

      registerButtonHandlers();
    } catch (error) {
      logger.error(`Error executing NSFW command: ${error.message}`);
      message.channel.send('Failed to fetch the content. Please try again later.');
    }

    /**
     * Fetch NSFW content from API
     */
    async function fetchContent(category) {
      const imageData = await nsfw.fetch(category);
      if (!imageData || !imageData.image || !imageData.image.url) {
        throw new Error('Invalid image data');
      }

      return imageData.image.url;
    }

    /**
     * Register button handlers
     */
    function registerButtonHandlers() {
      registerButton(customIdRefresh, [message.author.id], async (interaction) => {
        try {
          if (!interaction.deferred && !interaction.replied) await interaction.deferUpdate();
          const newImageUrl = await fetchContent(category);

          await interaction.editReply({
            content: newImageUrl,
            components: interaction.message.components,
          });
        } catch (error) {
          logger.error(`Error refreshing NSFW content: ${error.message}`);
          interaction.followUp({ content: 'Failed to fetch content. Please try again.', ephemeral: true });
        }
      });

      registerButton(customIdDelete, [message.author.id], async (interaction) => {
        try {
          if (!interaction.deferred && !interaction.replied) await interaction.deferUpdate();
          await interaction.message.delete();
        } catch (error) {
          logger.error(`Error deleting NSFW message: ${error.message}`);
        }
      });
    }
  },
};