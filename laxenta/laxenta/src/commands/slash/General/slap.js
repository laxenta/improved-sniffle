// path: commands/slap.js
const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const HMtai = require('hmtai');
const hmtai = new HMtai();

module.exports = {
  data: new SlashCommandBuilder()
    .setName('slap')
    .setDescription('Slap someone playfully!')
    .addUserOption(option =>
      option
        .setName('target')
        .setDescription('The user you want to slap')
        .setRequired(true)
    )
    .setDMPermission(true) // Allow the command in DMs
    .setIntegrationTypes(0, 1) // Guild and DM integrations
    .setContexts(0, 1, 2), // Guild, DM, and Voice contexts
  async execute(interaction) {
    const userToSlap = interaction.options.getUser('target');

    try {
      const slapGif = await hmtai.sfw.slap();
      const embed = new EmbedBuilder()
        .setTitle('<:a:1332327403867078738> Slapyyyy!')
        .setDescription(`**${interaction.user.username}** gives **${userToSlap.username}** a big slap!`)
        .setImage(slapGif)
        .setColor(0xff0000);

      await interaction.reply({ embeds: [embed] });
    } catch (error) {
      console.error(`Error fetching slap GIF: ${error.message}`);
      await interaction.reply('Couldn\'t fetch a slap GIF. Please try again later!');
    }
  },
};