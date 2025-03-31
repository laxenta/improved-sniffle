const { SlashCommandBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, MessageFlags } = require('discord.js');
const { NSFW } = require('nsfwhub');
const nsfw = new NSFW();
const { registerButton } = require('../../../handlers/buttonHandler.js');
const { logger } = require('../../../utils/logger');

const nsfwTags = [
  'ass', 'sixtynine', 'pussy', 'dick', 'anal', 'boobs', 'bdsm', 'black',
  'easter', 'bottomless', 'blowjob', 'collared', 'cum', 'cumsluts',
  'dp', 'dom', 'extreme', 'feet', 'finger', 'fuck', 'futa', 'gay',
  'gif', 'group', 'hentai', 'kiss', 'lesbian', 'lick', 'pegged',
  'phgif', 'puffies', 'real', 'suck', 'tattoo', 'tiny', 'toys', 'xmas'
];

module.exports = {
  data: new SlashCommandBuilder()
    .setName('realp')
    .setDescription('Get real NSFW content based on the specified category.')
    .setIntegrationTypes(0, 1)

    .setContexts(0, 1, 2)
    .addStringOption(option =>
      option.setName('category')
        .setDescription('NSFW content category')
        .setRequired(true)
        .setAutocomplete(true)
    )
    .addBooleanOption(option =>
      option.setName('video')
        .setDescription('Fetch video content if available (only .mp4 and .gif)')
        .setRequired(false)
    ),

  async execute(interaction) {
    // Determine if we should reply publicly.
    const isPublic = interaction.guild && interaction.channel && interaction.channel.nsfw;
    
    // If in a guild and channel is not NSFW, reject (as error messages are ephemeral).
    if (interaction.guild && interaction.channel && !interaction.channel.nsfw) {
      return interaction.reply({
        content: 'This command can only be used in NSFW channels in guilds. You can still use this command in DMs.',
        flags: MessageFlags.Ephemeral
      });
    }

    // Retrieve and validate the provided category.
    let category = interaction.options.getString('category').toLowerCase();
    const videoOption = interaction.options.getBoolean('video') || false;
    if (!nsfwTags.includes(category)) {
      return interaction.reply({
        content: `Invalid category! Valid categories are: ${nsfwTags.join(', ')}`,
        flags: isPublic ? 0 : MessageFlags.Ephemeral
      });
    }

    // Create unique button IDs.
    const customIdRefresh = `refresh_${category}_${interaction.id}`;
    const customIdDelete = `delete_${category}_${interaction.id}`;

    // Defer the reply. Use a public response if in a NSFW channel, otherwise ephemeral.
    await interaction.deferReply(isPublic ? {} : { flags: MessageFlags.Ephemeral });

    try {
      const contentUrl = await fetchContent(category, videoOption);
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

      await interaction.editReply({ content: contentUrl, components: [buttons] });
      registerButtonHandlers();
    } catch (error) {
      logger.error(`Error executing NSFW command: ${error.message}`);
      return interaction.editReply({ content: 'Failed to fetch the content. Please try again later.' });
    }

    // Fetch NSFW content (with retries for video filtering).
    async function fetchContent(category, videoOption) {
      const validVideoExtensions = ['.mp4', '.gif'];
      let attempt = 0;
      const maxAttempts = 5;
      let imageData;

      do {
        imageData = await nsfw.fetch(category);
        if (!imageData || !imageData.image || !imageData.image.url) {
          throw new Error('Invalid image data from NSFW API.');
        }
        attempt++;
      } while (
        videoOption &&
        !validVideoExtensions.some(ext => imageData.image.url.endsWith(ext)) &&
        attempt < maxAttempts
      );

      if (videoOption && !validVideoExtensions.some(ext => imageData.image.url.endsWith(ext))) {
        throw new Error('Failed to fetch a valid video after multiple attempts.');
      }
      return imageData.image.url;
    }

    // Register handlers for the "Next" and "Exit" buttons.
    function registerButtonHandlers() {
      registerButton(customIdRefresh, [interaction.user.id], async (buttonInteraction) => {
        try {
          if (!buttonInteraction.deferred && !buttonInteraction.replied) {
            await buttonInteraction.deferUpdate();
          }
          // Show a loading message immediately.
          await buttonInteraction.editReply({
            content: 'Loading, please wait...',
            components: buttonInteraction.message.components
          });
          const newContentUrl = await fetchContent(category, videoOption);
          await buttonInteraction.editReply({
            content: newContentUrl,
            components: buttonInteraction.message.components
          });
        } catch (error) {
          logger.error(`Error refreshing NSFW content: ${error.message}`);
          await buttonInteraction.followUp({
            content: 'Failed to fetch content. Please try again.',
            flags: isPublic ? 0 : MessageFlags.Ephemeral
          });
        }
      });

      registerButton(customIdDelete, [interaction.user.id], async (buttonInteraction) => {
        try {
          if (!buttonInteraction.deferred && !buttonInteraction.replied) {
            await buttonInteraction.deferUpdate();
          }
          await buttonInteraction.message.delete();
        } catch (error) {
          logger.error(`Error deleting NSFW message: ${error.message}`);
        }
      });
    }
  },

  // Autocomplete handler for the 'category' option.
  async autocomplete(interaction) {
    const focusedValue = interaction.options.getFocused();
    const filtered = nsfwTags
      .filter(tag => tag.toLowerCase().startsWith(focusedValue.toLowerCase()))
      .slice(0, 25);
    await interaction.respond(filtered.map(tag => ({ name: tag, value: tag })));
  }
};