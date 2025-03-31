const { SlashCommandBuilder, EmbedBuilder, MessageFlags } = require('discord.js');
const HMtai = require('hmtai');
const hmtai = new HMtai();

module.exports = {
  data: new SlashCommandBuilder()
    .setName('smile')
    .setDescription(':))))')
        .setIntegrationTypes(0, 1) // Guild and DM integrations
    .setContexts(0, 1, 2)
    .addUserOption(option =>
      option.setName('target')
        .setDescription('The user to smile with (optional)')
        .setRequired(false)
    ),
  async execute(interaction) {
    const targetUser = interaction.options.getUser('target');
    let description;
    if (targetUser && targetUser.id !== interaction.user.id) {
      description = `${interaction.user.username} gives a big smile to ${targetUser.username}! :))))`;
    } else {
      description = `${interaction.user.username} is smiling! :))))`;
    }
    try {
      const smileGif = await hmtai.sfw.smile();
      if (!smileGif) {
        return interaction.reply({
          content: 'stay sad!',
          flags: MessageFlags.Ephemeral,
        });
      }
      const embed = new EmbedBuilder()
        .setTitle('Smiling like my life depends on it!')
        .setDescription(description)
        .setImage(smileGif)
        .setColor(0xffd700)
        .setFooter({
          text: 'Keep smiling!',
          iconURL: interaction.user.displayAvatarURL({ dynamic: true, size: 2048 }),
        });
      await interaction.reply({ embeds: [embed] });
    } catch (error) {
      console.error(`Error executing smile command: ${error.message}`);
      return interaction.reply({
        content: 'no smiles!',
        flags: MessageFlags.Ephemeral,
      });
    }
  },
};