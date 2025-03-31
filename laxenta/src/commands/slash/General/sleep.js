const { SlashCommandBuilder, EmbedBuilder, MessageFlags, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const HMtai = require('hmtai');
const hmtai = new HMtai();

module.exports = {
  data: new SlashCommandBuilder()
    .setName('sleep')
    .setDescription('Zzz 💤')
    .setIntegrationTypes(0, 1) // Guild and DM integrations
    .setContexts(0, 1, 2)
    .addUserOption(option =>
      option.setName('target')
        .setDescription('The user to INNOCENTLY ;-; sleep with (optional)')
        .setRequired(false)
    ),
  async execute(interaction) {
    // Get the target user, if provided.
    const targetUser = interaction.options.getUser('target');
    let description;
    let components = [];

    // If a target is selected (and it's not yourself), add extra text and a rickroll button.
    if (targetUser && targetUser.id !== interaction.user.id) {
      description = `${interaction.user.username} is off to sleep with ${targetUser.username}. Zzz 💤 \nDid you really try to sleep with them? someone seems really desperate bro :skull:`;
      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setLabel('Surprise!')
          .setStyle(ButtonStyle.Link)
          .setURL('https://www.youtube.com/watch?v=dQw4w9WgXcQ')
      );
      components.push(row);
    } else {
      // No target or self-target: just show the sleep message.
      description = `${interaction.user.username} is sleeping. Zzz 💤`;
    }

    try {
      // Fetch the sleep GIF from HMtai.
      const sleepGif = await hmtai.sfw.sleep();
      if (!sleepGif) {
        return interaction.reply({
          content: 'dont sleep :3',
          flags: MessageFlags.Ephemeral,
        });
      }

      // Build the embed.
      const embed = new EmbedBuilder()
        .setTitle('Sleepy Time!')
        .setDescription(description)
        .setImage(sleepGif)
        .setColor(0x0000ff)
        .setFooter({
          text: 'sleeeeeepy weepy nilly willy. gn!',
          iconURL: interaction.user.displayAvatarURL({ dynamic: true, size: 2048 }),
        });

      // Reply with the embed (and the button if a target was provided).
      await interaction.reply({ embeds: [embed], components });
    } catch (error) {
      console.error(`Error executing sleep command: ${error.message}`);
      return interaction.reply({
        content: 'dont sleep!',
        flags: MessageFlags.Ephemeral,
      });
    }
  },
};