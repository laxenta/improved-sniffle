const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const HMtai = require('hmtai');
const hmtai = new HMtai();

module.exports = {
  data: new SlashCommandBuilder()
    .setName('bonk')
    .setDescription('Bonk someone : 3 for being naughti!')
    .addUserOption(option =>
      option
        .setName('target')
        .setDescription('The user you want to bonk')
        .setRequired(true)
    )
    .addBooleanOption(option =>
      option
        .setName('ephemeral')
        .setDescription('Whether to make the response visible only to you (default: false)')
    )
    .setIntegrationTypes(0, 1) // Guild and DM integrations
    .setContexts(0, 1, 2), // Guild, DM, and Voice contexts
  async execute(interaction) {
    const userToBonk = interaction.options.getUser('target');
    const isEphemeral = interaction.options.getBoolean('ephemeral') || false;

    try {
      const bonkGif = await hmtai.sfw.bonk();
      const customEmoji = '<a:heh:1332327203106717736>'; // Replace with your emoji  1332327203106717736
      const animatedEmoji = '<a:wack:1332327335201869884>'; 
      const fallbackEmoji = '🔨'; // Fallback if custom emoji fails

      const embed = new EmbedBuilder()
        .setTitle(`${customEmoji || fallbackEmoji} Bonk!`)
        .setDescription(
          `**${interaction.user.username}** bonks ${animatedEmoji || fallbackEmoji} **${userToBonk.username}**!`
        )
        .setImage(bonkGif)
        .setColor(0xff4500);

      await interaction.reply({
        embeds: [embed],
        ephemeral: isEphemeral,
      });
    } catch (error) {
      console.error(`Error fetching bonk GIF: ${error.message}`);
      await interaction.reply({
        content: 'Couldn\'t fetch the bonk GIF. Try again later!',
        ephemeral: isEphemeral,
      });
    }
  },
};