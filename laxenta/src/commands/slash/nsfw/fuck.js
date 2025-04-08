const {
  SlashCommandBuilder,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle
} = require('discord.js');
const HMtai = require('hmtai');
const hmtai = new HMtai();

module.exports = {
  data: new SlashCommandBuilder()
    .setName('fuck')
    .setDescription('It starts with holding hands.... WE Hold hands? Nah. We going all in')
        .setIntegrationTypes(0, 1) // Guild and DM integrations
    .setContexts(0, 1, 2) // Guild, DM, and Voice contexts
    .setNSFW(true) // For Discord to auto-tag the command
    .setDMPermission(true)
    .addUserOption(option =>
      option.setName('partner')
        .setDescription('Who you tryna "hold hands" with?')
        .setRequired(false)
    ),

  async execute(interaction) {
    // NSFW channel check
    if (interaction.guild && !interaction.channel.nsfw) {
      return interaction.reply({
        content: 'You can only use this command in **NSFW** channels 👀',
        ephemeral: true
      });
    }

    const targetUser = interaction.options.getUser('partner');
    let description;
    let components = [];

    if (targetUser && targetUser.id !== interaction.user.id) {
      description = `${interaction.user.username} is getting real close with ${targetUser.username}...`;

      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId('kiss_back')
          .setLabel('Kiss?')
          .setStyle(ButtonStyle.Danger),
        new ButtonBuilder()
          .setCustomId('blowjob_back')
          .setLabel('...Blowjob?')
          .setStyle(ButtonStyle.Secondary),
        new ButtonBuilder()
          .setCustomId('hug_back')
          .setLabel('Hug and stop.. ah~')
          .setStyle(ButtonStyle.Success)
      );

      components.push(row);
    } else {
      description = `${interaction.user.username} is... with themselves. Yikes.`;
    }

    try {
      const nsfwGif = await hmtai.nsfw.hentai(); // Swap with hmtai.nsfw.blowjob() or .creampie() for spicier vibes

      const embed = new EmbedBuilder()
        .setTitle('but~.. ah *Things are heating up..* 🔥')
        .setDescription(description)
        .setImage(nsfwGif)
        .setColor(0xFF3366)
        .setFooter({
          text: 'cuddling!?...romantic isn’t it?',
          iconURL: interaction.user.displayAvatarURL({ dynamic: true, size: 2048 })
        });

      const reply = await interaction.reply({
        embeds: [embed],
        components,
        fetchReply: true
      });

      if (!targetUser || targetUser.id === interaction.user.id) return;

      const collector = reply.createMessageComponentCollector({
        time: 30000,
        filter: i => i.user.id === targetUser.id
      });

      collector.on('collect', async i => {
        let actionGif, responseTitle, responseDesc;

        if (i.customId === 'kiss_back') {
          actionGif = await hmtai.sfw.kiss();
          responseTitle = 'nngh.. nom~';
          responseDesc = `${targetUser.username} kisses ${interaction.user.username}.`;
        } else if (i.customId === 'blowjob_back') {
          actionGif = await hmtai.nsfw.blowjob();
          responseTitle = 'Wait.. W-what are you doing?! *slurps* dam-';
          responseDesc = `${targetUser.username}... goes down on ${interaction.user.username}.`;
        } else {
          actionGif = await hmtai.sfw.hug();
          responseTitle = 'oh god... it was.. Ahh~.. *pulls out*';
          responseDesc = `${targetUser.username} decides a good cuddling is best after this.. and we should stop...`;
        }

        const responseEmbed = new EmbedBuilder()
          .setTitle(responseTitle)
          .setDescription(responseDesc)
          .setImage(actionGif)
          .setColor(0xFF3366);

        // Disable buttons after use
        components[0].components.forEach(btn => btn.setDisabled(true));
        await i.update({ components });
        await interaction.followUp({ embeds: [responseEmbed] });
        collector.stop();
      });

      collector.on('end', async (collected, reason) => {
        if (reason === 'time' && collected.size === 0) {
          components[0].components.forEach(btn => btn.setDisabled(true));
          try {
            await reply.edit({ components });
          } catch (error) {
            console.error('Failed to update buttons:', error);
          }
        }
      });

    } catch (error) {
      console.error(`Error in /fuck command: ${error.message}`);
      return interaction.reply({
        content: 'Failed to "hold hands"... if you catch my drift.',
        ephemeral: true
      });
    }
  }
};