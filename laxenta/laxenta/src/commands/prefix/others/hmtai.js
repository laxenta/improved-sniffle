const { ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder } = require('discord.js');
const HMtai = require('hmtai');
const hmtai = new HMtai();
const { registerButton } = require('../../../handlers/buttonHandler.js');
const { logger } = require('../../../utils/logger');

module.exports = {
  name: 'hentai',
  aliases: ['h'],
  cooldown: 3,
  description: 'Get an image from a vast array of hentai tags. Use !hentai list for available tags.',
  async execute(message, args) {
    const tags = {
      wallpaper: hmtai.sfw.wallpaper,
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
      footjob: hmtai.nsfw.footjob,
      handjob: hmtai.nsfw.handjob,
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

    const query = args[0]?.toLowerCase();

    // Validate the query
    if (!query || !tags[query]) {
      return message.channel.send(
        `**Available Tags:**\n\`${Object.keys(tags).join(', ')}\`\n\nUsage: \`!hentai <tag>\``
      );
    }

    if (!message.channel.nsfw) {
      return message.reply('This command can only be used in NSFW channels! do /search for nsfw thats avialable in dms/any channel in ephemeral..');
    }

    const customIdRefresh = `refresh_${query}_${message.id}`;
    const customIdDelete = `delete_${query}_${message.id}`;

    try {
      await sendImage();
      registerButtonHandlers();
    } catch (error) {
      logger.error(`Error executing !hentai command: ${error.message}`);
      message.channel.send('Failed to fetch the image. Please try again later.');
    }

    /**
     * Send an image with embed and buttons
     */
    async function sendImage(interaction = null, edit = false) {
      try {
        const imageUrl = await tags[query]();

        const embed = new EmbedBuilder()
          .setImage(imageUrl)
          //.setColor('#FF69B4');

        const buttons = new ActionRowBuilder().addComponents(
          new ButtonBuilder()
            .setCustomId(customIdRefresh)
            .setLabel('next') // Optional label
            .setEmoji('<a:next:1326464173361856524>') // Custom emoji for Next            
            .setStyle(ButtonStyle.Primary),
          new ButtonBuilder()
            .setCustomId(customIdDelete)
            //.setLabel('')
            .setEmoji('<a:del:1326464297080983655>')
            .setStyle(ButtonStyle.Danger)
        );

        if (edit && interaction) {
          if (!interaction.deferred) await interaction.deferUpdate();
          await interaction.editReply({ embeds: [embed], components: [buttons] });
        } else {
          await message.channel.send({ embeds: [embed], components: [buttons] });
        }
      } catch (error) {
        logger.error(`Failed to fetch hentai image: ${error.message}`);
        if (interaction) {
          try {
            await interaction.followUp({
              content: 'Failed to fetch the image. Please try again later.',
              ephemeral: true,
            });
          } catch {
            logger.warn('Interaction expired or unknown.');
          }
        } else {
          message.channel.send('Failed to fetch the image. Please try again later.');
        }
      }
    }

    /**
     * Register button handlers
     */
    function registerButtonHandlers() {
      registerButton(customIdRefresh, [message.author.id], async (interaction) => {
        try {
          if (!interaction.deferred && !interaction.replied) await interaction.deferUpdate();
          await sendImage(interaction, true);
        } catch (error) {
          logger.error(`Error refreshing hentai image: ${error.message}`);
        }
      });

      registerButton(customIdDelete, [message.author.id], async (interaction) => {
        try {
          if (!interaction.deferred && !interaction.replied) await interaction.deferUpdate();
          await interaction.message.delete();
        } catch (error) {
          logger.error(`Error deleting hentai message: ${error.message}`);
        }
      });
    }
  },
};