const { SlashCommandBuilder, EmbedBuilder, MessageFlags } = require('discord.js');
const HMtai = require('hmtai');
const hmtai = new HMtai();

module.exports = {
  data: new SlashCommandBuilder()
    .setName('blush')
    .setDescription('Blush freely E-to...') // A cute little description!
        .setIntegrationTypes(0, 1) // Guild and DM integrations
    .setContexts(0, 1, 2) // Guild, DM, and Voice contexts
    // Optional target user: if provided, you'll blush at them; if not, you'll just blush.
    .addUserOption(option =>
      option.setName('target')
        .setDescription('to blush at (optional)')
        .setRequired(false)
    ),
  async execute(interaction) {
    const targetUser = interaction.options.getUser('target');

    try {
      // Fetch a blush GIF from HMtai.
      const blushGif = await hmtai.sfw.blush();
      if (!blushGif) {
        return interaction.reply({
          content: 'Oops, couldn\'t fetch a blushy!',
          flags: MessageFlags.Ephemeral
        });
      }

      // Prepare the description with a bit of personality.
      let description;
      if (targetUser && targetUser.id !== interaction.user.id) {
        description = `${interaction.user.username} blushes at ${targetUser.username}! E-to...`;
      } else {
        description = `${interaction.user.username} is blushing! E-to...`;
      }

      // Build the embed.
      const embed = new EmbedBuilder()
        .setTitle('embarrassing or cute?! maybe depressing! nah nvm')
        .setDescription(description)
        .setImage(blushGif)
        .setColor(0xff69b4)
        .setFooter({
          //text: 'blushing vibes',
          iconURL: interaction.user.displayAvatarURL({ dynamic: true, size: 2048 })
        });

      // Reply publicly with the cute blush embed.
      await interaction.reply({ embeds: [embed] });
    } catch (error) {
      console.error(`Error executing the blush command: ${error.message}`);
      return interaction.reply({
        content: 'tsh!',
        flags: MessageFlags.Ephemeral
      });
    }
  }
};