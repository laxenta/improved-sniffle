const { SlashCommandBuilder, EmbedBuilder, MessageFlags, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const HMtai = require('hmtai');
const hmtai = new HMtai();

module.exports = {
  data: new SlashCommandBuilder()
    .setName('blush')
    .setDescription('E-to... ////')
    .setIntegrationTypes(0, 1) // Guild and DM integrations
    .setContexts(0, 1, 2)
    .addUserOption(option =>
      option.setName('aw')
        .setDescription('The user making you blush :3')
        .setRequired(false)
    ),
    
  async execute(interaction) {
    // Get the target user, if provided
    const targetUser = interaction.options.getUser('aw');
    let description;
    let components = [];
    
    // Create response buttons if there's a target that isn't the user themselves
    if (targetUser && targetUser.id !== interaction.user.id) {
      description = `${interaction.user.username} blushes at ${targetUser.username}... E-to... ////`;
      
      // Create buttons for target to respond with
      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId('blush_back')
          .setLabel('Blush Back? Awkward much?')
          .setStyle(ButtonStyle.Primary),
        new ButtonBuilder()
          .setCustomId('wink_back')
          .setLabel('Wink :3')
          .setStyle(ButtonStyle.Success),
        new ButtonBuilder()
          .setCustomId('smug_back')
          .setLabel('Smug!?')
          .setStyle(ButtonStyle.Secondary)
      );
      
      components.push(row);
    } else {
      // No target or self-target
      description = `${interaction.user.username} is blushing... how cute!`;
    }
    
    try {
      // Fetch the blush GIF from HMtai
      const blushGif = await hmtai.sfw.blush();
      if (!blushGif) {
        return interaction.reply({
          content: 'dont blush :3 that shit kills you!',
          flags: MessageFlags.Ephemeral,
        });
      }
      
      // Build the embed
      const embed = new EmbedBuilder()
        .setTitle('blushing hm!?')
        .setDescription(description)
        .setImage(blushGif)
        .setColor(0xFFC0CB)
        .setFooter({
          text: 'E-to... ////',
          iconURL: interaction.user.displayAvatarURL({ dynamic: true, size: 2048 }),
        });
      
      // Reply with the embed and any components
      const reply = await interaction.reply({ 
        embeds: [embed], 
        components, 
        fetchReply: true 
      });
      
      // If there's no target, we don't need to set up a collector
      if (!targetUser || targetUser.id === interaction.user.id) return;
      
      // Create a collector for button interactions
      const collector = reply.createMessageComponentCollector({
        time: 30000, // 30 seconds
        filter: i => i.user.id === targetUser.id,
      });
      
      collector.on('collect', async i => {
        const actions = {
          blush_back: 'blush',
          wink_back: 'wink',
          smug_back: 'smug'
        };
        
        const func = actions[i.customId];
        const actionGif = await hmtai.sfw[func]();
        
        const responseEmbed = new EmbedBuilder()
          .setTitle(`${targetUser.username} responds to ${interaction.user.username}`)
          .setDescription(`They... well chose to **${func}** back!`)
          .setImage(actionGif)
          .setColor(0xFFC0CB);
        
        // Disable all buttons
        components[0].components.forEach(btn => btn.setDisabled(true));
        
        await i.update({ components });
        await interaction.followUp({ embeds: [responseEmbed] });
        collector.stop();
      });
      
      collector.on('end', async (collected, reason) => {
        if (reason === 'time' && collected.size === 0) {
          // If no buttons were clicked, disable them after timeout
          components[0].components.forEach(btn => btn.setDisabled(true));
          try {
            await reply.edit({ components });
          } catch (error) {
            console.error('Failed to update message after collector ended:', error);
          }
        }
      });
      
    } catch (error) {
      console.error(`Error executing blush command: ${error.message}`);
      return interaction.reply({
        content: 'Failed to blush!',
        flags: MessageFlags.Ephemeral,
      });
    }
  },
};