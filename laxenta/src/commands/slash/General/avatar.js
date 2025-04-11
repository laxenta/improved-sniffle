const { SlashCommandBuilder, EmbedBuilder, MessageFlags } = require('discord.js');
const { getDiscordAvatarURL } = require('../../../servers/templateRouter');

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
      const avatarUrl = getDiscordAvatarURL(user.id, user.avatar);
      
      const embed = new EmbedBuilder()
        .setColor(0x5865F2)
        .setTitle(`Avatar of ${user.username}`)
        .setURL(avatarUrl)
        .setImage(avatarUrl)
        .setFooter({ 
          text: `Requested by ${interaction.user.tag}`, 
          iconURL: getDiscordAvatarURL(interaction.user.id, interaction.user.avatar)
        })
        .setTimestamp();
      
      await interaction.reply({
        embeds: [embed],
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