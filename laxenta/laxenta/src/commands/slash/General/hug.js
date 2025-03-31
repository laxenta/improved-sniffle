// path: commands/hug.js
const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const HMtai = require('hmtai');
const hmtai = new HMtai();

module.exports = {
  data: new SlashCommandBuilder()
    .setName('hug')
    .setDescription('Hug someone warmly!')
    .addUserOption(option =>
      option
        .setName('target')
        .setDescription('The user you want to hug')
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
    const userToHug = interaction.options.getUser('target');
    const isEphemeral = interaction.options.getBoolean('ephemeral') || false;

    try {
      const hugGif = await hmtai.sfw.hug();
      const embed = new EmbedBuilder()
        .setTitle('<a:cool:1332327251253133383> why nu one hugs me!')
        .setDescription(`**${interaction.user.username}** gives **${userToHug.username}** a warm hug! Awww!`)
        .setImage(hugGif)
        .setColor(`#${Math.floor(Math.random() * 16777215).toString(16).padStart(6, '0')}`)

      await interaction.reply({
        embeds: [embed],
        ephemeral: isEphemeral,
      });
    } catch (error) {
      console.error(`Error fetching hug GIF: ${error.message}`);
      await interaction.reply({
        content: 'Couldn\'t fetch the hug GIF. Try again later!',
        ephemeral: isEphemeral,
      });
    }
  },
};