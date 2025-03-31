const { SlashCommandBuilder, EmbedBuilder, MessageFlags } = require('discord.js');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('avatar')
    .setDescription('Displays the avatar of the mentioned user or your own')
    .setIntegrationTypes(0, 1)
    .setContexts(0, 1, 2)
    .addUserOption(option =>
      option.setName('target')
        .setDescription('The user whose avatar you want to see')
    ),
  async execute(interaction) {
    try {
      const user = interaction.options.getUser('target') || interaction.user;
      const avatarUrl = user.displayAvatarURL({ format: 'png', size: 1024, dynamic: true });
      
      const embed = new EmbedBuilder()
        .setColor(0x5865F2)
        .setTitle(`Avatar of ${user.username}`)
        .setURL(avatarUrl)
        .setImage(avatarUrl)
        .setFooter({ 
          text: `Requested by ${interaction.user.tag}`, 
          iconURL: interaction.user.displayAvatarURL({ dynamic: true })
        })
        .setTimestamp();
      
      await interaction.reply({
        embeds: [embed],
        //flags: MessageFlags.Ephemeral,
      });
    } catch (error) {
      console.error('Error displaying avatar:', error);
      await interaction.reply({
        content: 'There was an error fetching the avatar, maybe they’re looking a bit off today!',
        flags: MessageFlags.Ephemeral,
      });
    }
  },
};