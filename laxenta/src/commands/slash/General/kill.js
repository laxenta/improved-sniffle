const { SlashCommandBuilder, EmbedBuilder, MessageFlags } = require('discord.js');
const HMtai = require('hmtai');
const hmtai = new HMtai();

module.exports = {
  data: new SlashCommandBuilder()
    .setName('kill')
    .setDescription('Kill.em.all.')
        .setIntegrationTypes(0, 1) // Guild and DM integrations
    .setContexts(0, 1, 2) // Guild, DM, and Voice contexts
    .addUserOption(option =>
      option.setName('target')
        .setDescription('The user you want to "kill"')
        .setRequired(true)
    ),
  async execute(interaction) {
    // Grab the target user from the options.
    const targetUser = interaction.options.getUser('target');

    // You can't kill yourself, dude! That's just plain weird.
    if (targetUser.id === interaction.user.id) {
      return interaction.reply({
        content: "Yo, you can't kill yourself! Try picking someone else, alright?",
        flags: MessageFlags.Ephemeral,
      });
    }

    try {
      // Fetch a "kill" GIF from HMtai – hope it's as epic as a ONE PUUUUUUUUUUUNCH!
      const killGif = await hmtai.sfw.kill();
      if (!killGif) {
        return interaction.reply({
          content: 'Oops, failed to fetch a kill GIF. Maybe try again later?',
          flags: MessageFlags.Ephemeral,
        });
      }

      // Build an embed with our epic kill action.
      const embed = new EmbedBuilder()
        .setTitle('nu nuh, you die')
        .setDescription(`${interaction.user} is "killing" ${targetUser}! AAAAAA!`)
        .setImage(killGif)
        .setColor(0xff0000);

      // Send the embed publicly so everyone sees the chaos.
      await interaction.reply({ embeds: [embed] });
      //console.log('Kill command executed successfully. Enjoy the mayhem!');
    } catch (error) {
      console.error(`Error fetching kill GIF: ${error.message}`);
      return interaction.reply({
        content: 'Damn, something went wrong while trying to fetch that kill GIF. Try again later!',
        flags: MessageFlags.Ephemeral,
      });
    }
  }
};