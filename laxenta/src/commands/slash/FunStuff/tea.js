const { SlashCommandBuilder, EmbedBuilder, MessageFlags, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const HMtai = require('hmtai');
const hmtai = new HMtai();

module.exports = {
  data: new SlashCommandBuilder()
    .setName('tea')
    .setDescription('Offer someone a cup of tea! How relaxing~')
    .setIntegrationTypes(0, 1) // Guild and DM integrations
    .setContexts(0, 1, 2)
    .addUserOption(option =>
      option.setName('guest')
        .setDescription('The user to offer tea to')
        .setRequired(false)
    ),
    
  async execute(interaction) {
    // Get the target user, if provided
    const targetUser = interaction.options.getUser('guest');
    let description;
    let components = [];
    
    // Create response buttons if there's a target that isn't the user themselves
    if (targetUser && targetUser.id !== interaction.user.id) {
      description = `${interaction.user.username} offers ${targetUser.username} a cup of tea! How lovely~`;
      
      // Create buttons for target to respond with
      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId('happy_back')
          .setLabel('Accept Happily! 😊')
          .setStyle(ButtonStyle.Success),
        new ButtonBuilder()
          .setCustomId('kiss_back')
          .setLabel('Thank with Kiss! 😘')
          .setStyle(ButtonStyle.Primary),
        new ButtonBuilder()
          .setCustomId('sleep_back')
          .setLabel('Fall Asleep... 😴')
          .setStyle(ButtonStyle.Secondary)
      );
      
      components.push(row);
    } else {
      // No target or self-target
      description = `${interaction.user.username} enjoys a cup of tea alone. So peaceful...`;
    }
    
    try {
      // Since there's no specific tea GIF, we'll use happy as a substitute
      const teaGif = await hmtai.sfw.happy();
      if (!teaGif) {
        return interaction.reply({
          content: 'Failed to find a tea animation!',
          flags: MessageFlags.Ephemeral,
        });
      }
      
      // Build the embed
      const embed = new EmbedBuilder()
        .setTitle('Tea Time! ☕')
        .setDescription(description)
        .setImage(teaGif)
        .setColor(0x8B4513)
        .setFooter({
          text: 'A perfect cup of tea makes everything better~',
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
        let actionGif, responseTitle, responseDesc;
        
        // Handle different button responses
        if (i.customId === 'happy_back') {
          actionGif = await hmtai.sfw.happy();
          responseTitle = 'Delightful Tea!';
          responseDesc = `${targetUser.username} happily accepts the tea from ${interaction.user.username}!`;
        } else if (i.customId === 'kiss_back') {
          actionGif = await hmtai.sfw.kiss();
          responseTitle = 'A Sweet Thank You!';
          responseDesc = `${targetUser.username} thanks ${interaction.user.username} with a gentle kiss!`;
        } else {
          // Fall asleep
          actionGif = await hmtai.sfw.sleep();
          responseTitle = 'So Relaxing...';
          responseDesc = `The tea was so relaxing, ${targetUser.username} fell asleep!`;
        }
        
        const responseEmbed = new EmbedBuilder()
          .setTitle(responseTitle)
          .setDescription(responseDesc)
          .setImage(actionGif)
          .setColor(0x8B4513);
        
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
      console.error(`Error executing tea command: ${error.message}`);
      return interaction.reply({
        content: 'Failed to serve tea!',
        flags: MessageFlags.Ephemeral,
      });
    }
  },
};