const { SlashCommandBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder, MessageFlags, InteractionContextType } = require('discord.js');
const HMtai = require('hmtai');
const hmtai = new HMtai();
const { registerButton } = require('../../../handlers/buttonHandler.js');
const { logger } = require('../../../utils/logger');
const tags = {
  wallpaper: hmtai.nsfw.hentai,
  anal: hmtai.nsfw.anal,
  ass: hmtai.nsfw.ass,
  bdsm: hmtai.nsfw.bdsm,
  cum: hmtai.nsfw.cum,
  classic: hmtai.nsfw.classic,
  creampie: hmtai.nsfw.creampie,
  manga: hmtai.nsfw.manga,
  femdom: hmtai.nsfw.femdom,
  hentai: hmtai.nsfw.hentai,
  incest: hmtai.nsfw.incest,
  masturbation: hmtai.nsfw.masturbation,
  public: hmtai.nsfw.public,
  ero: hmtai.nsfw.ero,
  orgy: hmtai.nsfw.orgy,
  elves: hmtai.nsfw.elves,
  yuri: hmtai.nsfw.yuri,
  pantsu: hmtai.nsfw.pantsu,
  glasses: hmtai.nsfw.glasses,
  cuckold: hmtai.nsfw.cuckold,
  blowjob: hmtai.nsfw.blowjob,
  boobjob: hmtai.nsfw.boobjob,
  footjob: hmtai.nsfw.footjoob,
  handjob: hmtai.nsfw.handjoob,
  boobs: hmtai.nsfw.boobs,
  thighs: hmtai.nsfw.thighs,
  pussy: hmtai.nsfw.pussy,
  ahegao: hmtai.nsfw.ahegao,
  uniform: hmtai.nsfw.uniform,
  gangbang: hmtai.nsfw.gangbang,
  tentacles: hmtai.nsfw.tentacles,
  gif: hmtai.nsfw.gif,
  nsfwNeko: hmtai.nsfw.nsfwNeko,
  nsfwMobileWallpaper: hmtai.nsfw.nsfwMobileWallpaper,
  zettaiRyouiki: hmtai.nsfw.zettaiRyouiki,
};

module.exports = {
  data: new SlashCommandBuilder()
    .setName('hentai')
    .setDescription('Get an image or video from a vast array of hentai tags.')
    .setIntegrationTypes(0, 1)

    .setContexts(0, 1, 2)
    .addStringOption(option =>
      option.setName('tag')
        .setDescription('Hentai tag (leave empty for a random tag)')
        .setRequired(false)
        .setAutocomplete(true)
    ),
    // .addBooleanOption(option =>
    //   option.setName('video')
    //     .setDescription('Only fetch video content (.mp4 or .gif)')
    //     .setRequired(false)
    //  ),

  async execute(interaction) {
    // Determine if the response should be public.
    let isPublic = false;
    if (interaction.guild) {
      if (!interaction.channel.nsfw) {
        return interaction.reply({
          content: 'This command can only be used in NSFW channels in guilds! Try /search for NSFW content in DMs.',
          flags: MessageFlags.Ephemeral
        });
      } else {
        isPublic = true;
      }
    }
    
    // Get tag and video flag.
    let tag = interaction.options.getString('tag');
    const videoOption = interaction.options.getBoolean('video') || false;

    // If no tag is provided, choose one randomly.
    if (!tag) {
      const tagKeys = Object.keys(tags);
      tag = tagKeys[Math.floor(Math.random() * tagKeys.length)];
    } else {
      tag = tag.toLowerCase();
      // Validate tag.
      if (!tags[tag]) {
        return interaction.reply({
          content: `Invalid tag! Available tags: \`${Object.keys(tags).join(', ')}\``,
          flags: isPublic ? 0 : MessageFlags.Ephemeral
        });
      }
    }

    // Create unique button IDs using the interaction ID.
    const customIdRefresh = `refresh_${tag}_${interaction.id}`;
    const customIdDelete = `delete_${tag}_${interaction.id}`;

    // Defer the reply. If public, then send as normal; otherwise, ephemeral.
    await interaction.deferReply(isPublic ? {} : { flags: MessageFlags.Ephemeral });

    try {
      await sendMedia(interaction, false);
      registerButtonHandlers();
    } catch (error) {
      logger.error(`Error executing /hentai command: ${error.message}`);
      return interaction.editReply({ content: 'Failed to fetch the content. Please try again later.' });
    }

    /**
     * Fetch the media URL from HMtai.
     * If videoOption is true, the URL must end with .mp4 or .gif.
     *
     * @param {string} tag - The hentai tag to fetch.
     * @param {boolean} videoOption - Whether only video content should be fetched.
     * @returns {Promise<string>} - The media URL.
     */
    async function fetchMedia(tag, videoOption) {
      const allowedVideoExtensions = ['.mp4', '.gif'];
      let attempt = 0;
      let url;
      do {
        url = await tags[tag]();
        attempt++;
      } while (
        videoOption &&
        !allowedVideoExtensions.some(ext => url.endsWith(ext)) &&
        attempt < 5
      );

      if (videoOption && !allowedVideoExtensions.some(ext => url.endsWith(ext))) {
        throw new Error('Failed to fetch valid video content after multiple attempts.');
      }

      return url;
    }

    /**
     * Sends the hentai media in an embed along with Next and Exit buttons.
     *
     * @param {object} inter - The interaction (or button interaction) instance.
     * @param {boolean} edit - Whether to edit the existing reply or send a new one.
     */
    async function sendMedia(inter, edit = false) {
      try {
        const mediaUrl = await fetchMedia(tag, videoOption);
        const embed = new EmbedBuilder();

        // Use setVideo for .mp4 links; otherwise, setImage works for gifs/images.
        if (mediaUrl.endsWith('.mp4')) {
          embed.setVideo({ url: mediaUrl });
        } else {
          embed.setImage(mediaUrl);
        }

        const buttons = new ActionRowBuilder().addComponents(
          new ButtonBuilder()
            .setCustomId(customIdRefresh)
            .setLabel('Next')
            .setEmoji('<a:next:1326464173361856524>')
            .setStyle(ButtonStyle.Primary),
          new ButtonBuilder()
            .setCustomId(customIdDelete)
            .setEmoji('<a:del:1326464297080983655>')
            .setStyle(ButtonStyle.Danger)
        );

        // Update the same deferred reply.
        await inter.editReply({ embeds: [embed], components: [buttons] });
      } catch (error) {
        logger.error(`Failed to fetch hentai media: ${error.message}`);
        try {
          await inter.followUp({ content: 'Failed to fetch the content. Please try again later.', flags: MessageFlags.Ephemeral });
        } catch {
          logger.warn('Interaction expired or unable to follow up.');
        }
      }
    }

    /**
     * Register button interaction handlers for refreshing and deleting the message.
     */
    function registerButtonHandlers() {
      // Refresh button: fetch a new media URL and update the embed.
      registerButton(customIdRefresh, [interaction.user.id], async (buttonInteraction) => {
        try {
          if (!buttonInteraction.deferred && !buttonInteraction.replied) {
            await buttonInteraction.deferUpdate();
          }
          // Show a loading message immediately.
          await buttonInteraction.editReply({ content: 'Loading, please wait...', components: buttonInteraction.message.components });
          await sendMedia(buttonInteraction, true);
        } catch (error) {
          logger.error(`Error refreshing hentai media: ${error.message}`);
          await buttonInteraction.followUp({
            content: 'Failed to refresh content. Please try again.',
            flags: isPublic ? 0 : MessageFlags.Ephemeral
          });
        }
      });

      // Delete button: remove the message.
      registerButton(customIdDelete, [interaction.user.id], async (buttonInteraction) => {
        try {
          if (!buttonInteraction.deferred && !buttonInteraction.replied) {
            await buttonInteraction.deferUpdate();
          }
          await buttonInteraction.message.delete();
        } catch (error) {
          logger.error(`Error deleting hentai message: ${error.message}`);
        }
      });
    }
  },

  /**
   * Autocomplete handler for the 'tag' option.
   */
  async autocomplete(interaction) {
    const focusedValue = interaction.options.getFocused();
    const tagKeys = Object.keys(tags);
    const filtered = tagKeys.filter(tag => tag.toLowerCase().startsWith(focusedValue.toLowerCase())).slice(0, 25);
    await interaction.respond(filtered.map(tag => ({ name: tag, value: tag })));
  }
};