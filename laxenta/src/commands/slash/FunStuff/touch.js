const { SlashCommandBuilder, EmbedBuilder, MessageFlags, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const HMtai = require('hmtai');
const hmtai = new HMtai();

module.exports = {
  data: new SlashCommandBuilder()
    .setName('touch')
    .setDescription('Hold someone! NO touch them! How romantic~')
    .setIntegrationTypes(0, 1) // Guild and DM integrations
    .setContexts(0, 1, 2)
    .addUserOption(option =>
      option.setName('partner')
        .setDescription('The user whose hand you want to TOUCH')
        .setRequired(false)
    ),
    
  async execute(interaction) {
    // Get the target user, if provided
    const targetUser = interaction.options.getUser('partner');
    let description;
    let components = [];
    
    // Create response buttons if there's a target that isn't the user themselves
    if (targetUser && targetUser.id !== interaction.user.id) {
      description = `${interaction.user.username} touches ${targetUser.username}'s! prob sweet~`;
      
      // Create buttons for target to respond with
      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId('blush_back')
          .setLabel('Blush! 😳')
          .setStyle(ButtonStyle.Secondary),
        new ButtonBuilder()
          .setCustomId('kiss_back')
          .setLabel('Kiss!?')
          .setStyle(ButtonStyle.Danger),
        new ButtonBuilder()
          .setCustomId('happy_back')
          .setLabel('TOUCH BACK AGGRESSIVELY! 🥰')
          .setStyle(ButtonStyle.Success)
      );
      
      components.push(row);
    } else {
      // No target or self-target
      description = `${interaction.user.username} touches themselves... Loneliness intensifies.`;
    }
    
    try {
      // Since there's no specific holding hands GIF, we'll use hug as a substitute
      const holdGif = await hmtai.sfw.hug();
      if (!holdGif) {
        return interaction.reply({
          content: 'Failed to find a hand-holding animation!',
          flags: MessageFlags.Ephemeral,
        });
      }
      
      // Build the embed
      const embed = new EmbedBuilder()
        .setTitle('*touches* UwU')
        .setDescription(description)
        .setImage(holdGif)
        .setColor(0xFF69B4)
        .setFooter({
          text: 'So romantic~',
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
        if (i.customId === 'blush_back') {
          actionGif = await hmtai.sfw.blush();
          responseTitle = 'So embarrassing!';
          responseDesc = `${targetUser.username} blushes as ${interaction.user.username} TOUCHES them!`;
        } else if (i.customId === 'kiss_back') {
          actionGif = await hmtai.sfw.kiss();
          responseTitle = 'A Sweet Kiss!';
          responseDesc = `${targetUser.username} gives ${interaction.user.username} a kiss while holding them and being touched!`;
        } else {
          // Happy squeeze
          actionGif = await hmtai.sfw.happy();
          responseTitle = 'Squeeze!';
          responseDesc = `${targetUser.username} agressively *touches* ${interaction.user.username} back, crazyyy LOL!`;
        }
        
        const responseEmbed = new EmbedBuilder()
          .setTitle(responseTitle)
          .setDescription(responseDesc)
          .setImage(actionGif)
          .setColor(0xFF69B4);
        
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
      console.error(`Error executing hold command: ${error.message}`);
      return interaction.reply({
        content: 'Failed to hold hands!',
        flags: MessageFlags.Ephemeral,
      });
    }
  },
};