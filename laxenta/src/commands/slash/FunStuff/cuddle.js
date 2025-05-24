const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const HMtai = require('hmtai');
const hmtai = new HMtai();

module.exports = {
  data: new SlashCommandBuilder()
    .setName('cuddle')
    .setDescription('Cuddle with someone!')
    .setIntegrationTypes(0, 1) // Guild and DM integrations
    .setContexts(0, 1, 2) // Guild, DM, and Voice contexts
    .addUserOption(option =>
      option.setName('target')
        .setDescription('The user to cuddle with')
        .setRequired(true)
    ),
  async execute(interaction) {
    const targetUser = interaction.options.getUser('target');

    // Prevent users from cuddling themselves.
    if (targetUser.id === interaction.user.id) {
      return interaction.reply({
        content: "You can't cuddle yourself! Try cuddling someone else.",
        // For public messages in a non-NSFW context, no need for ephemeral.
        // If you wish to make it ephemeral, add flags: MessageFlags.Ephemeral
      });
    }

    try {
      const cuddleGif = await hmtai.sfw.cuddle();
      if (!cuddleGif) {
        return interaction.reply({
          content: 'Failed to cuddle. ;c Try again later!',
          ephemeral: true
        });
      }

      const embed = new EmbedBuilder()
        .setTitle('<a:eee:1327965154998095973> 	Cuddle cuddle cuddle xD :3')
        .setDescription(`${interaction.user.username} cuddles with ${targetUser.username}!`)
        .setImage(cuddleGif)
        .setColor(0xff69b4)
        .setFooter({ 
          text: 'imagine having no one to cuddle with!',
          iconURL: interaction.user.displayAvatarURL({ dynamic: true, size: 2048 })
        });

      await interaction.reply({ embeds: [embed] });
    } catch (error) {
      console.error(`Error executing the cuddle command: ${error.message}`);
      return interaction.reply({
        content: 'There was an error executing that command. Please try again later!',
        // Use ephemeral if you want the error to be private:

        ephemeral: true
      });
    }
  }
};