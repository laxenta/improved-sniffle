const { SlashCommandBuilder, EmbedBuilder, MessageFlags } = require('discord.js');
const HMtai = require('hmtai');
const hmtai = new HMtai();

module.exports = {
  data: new SlashCommandBuilder()
    .setName('happy')
    .setDescription("Because I'm happy...")
        .setIntegrationTypes(0, 1) // Guild and DM integrations
    .setContexts(0, 1, 2)
    .addUserOption(option =>
      option.setName('target')
        .setDescription('The user to share your happiness with (optional)')
        .setRequired(false)
    ),
  async execute(interaction) {
    const targetUser = interaction.options.getUser('target');
    let description;
    if (targetUser && targetUser.id !== interaction.user.id) {
      description = `${interaction.user.username} shares sum happiness with ${targetUser.username} xd`;
    } else {
      description = `${interaction.user.username} is happy! Because I'm happy...`;
    }
    try {
      const happyGif = await hmtai.sfw.happy();
      if (!happyGif) {
        return interaction.reply({
          content: 'u cant be happy',
          flags: MessageFlags.Ephemeral,
        });
      }
      const embed = new EmbedBuilder()
        .setTitle('Happy Vibes!')
        .setDescription(description)
        .setImage(happyGif)
        .setColor(0xffff00)
        .setFooter({
          text: 'spread your le- ahem i mean joy!',
          iconURL: interaction.user.displayAvatarURL({ dynamic: true, size: 2048 }),
        });
      await interaction.reply({ embeds: [embed] });
    } catch (error) {
      console.error(`Error executing happy command: ${error.message}`);
      return interaction.reply({
        content: 'damn error came! not like anyone gaf',
        flags: MessageFlags.Ephemeral,
      });
    }
  },
};