const { SlashCommandBuilder, EmbedBuilder, MessageFlags, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const HMtai = require('hmtai');
const hmtai = new HMtai();

module.exports = {
  data: new SlashCommandBuilder()
    .setName('punch')
    .setDescription('Punch someone! Show them who\'s boss!')
    .setIntegrationTypes(0, 1) // Guild and DM integrations
    .setContexts(0, 1, 2)
    .addUserOption(option =>
      option.setName('target')
        .setDescription('The user to punch')
        .setRequired(false)
    ),
    
  async execute(interaction) {
    // Get the target user, if provided
    const targetUser = interaction.options.getUser('target');
    let description;
    let components = [];
    
    // Create response buttons if there's a target that isn't the user themselves
    if (targetUser && targetUser.id !== interaction.user.id) {
      description = `${interaction.user.username} punches ${targetUser.username}! Ouch!`;
      
      // Create buttons for target to respond with
      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId('punch_back')
          .setLabel('Punch Back! 👊')
          .setStyle(ButtonStyle.Danger),
        new ButtonBuilder()
          .setCustomId('cry_back')
          .setLabel('Cry 😭')
          .setStyle(ButtonStyle.Primary),
        new ButtonBuilder()
          .setCustomId('run_back')
          .setLabel('Run Away! 🏃')
          .setStyle(ButtonStyle.Secondary)
      );
      
      components.push(row);
    } else {
      // No target or self-target
      description = `${interaction.user.username} punches the air! Training hard!`;
    }
    
    try {
      // Fetch the punch GIF from HMtai
      const punchGif = await hmtai.sfw.punch();
      if (!punchGif) {
        return interaction.reply({
          content: 'Failed to find a punch animation!',
          flags: MessageFlags.Ephemeral,
        });
      }
      
      // Build the embed
      const embed = new EmbedBuilder()
        .setTitle('PUNCH! 👊')
        .setDescription(description)
        .setImage(punchGif)
        .setColor(0xFF4500)
        .setFooter({
          text: 'POW! Right in the kisser!',
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
        if (i.customId === 'punch_back') {
          actionGif = await hmtai.sfw.punch();
          responseTitle = 'COUNTER-ATTACK!';
          responseDesc = `${targetUser.username} punches ${interaction.user.username} back! It's a brawl!`;
        } else if (i.customId === 'cry_back') {
          actionGif = await hmtai.sfw.cry();
          responseTitle = 'That hurt!';
          responseDesc = `${targetUser.username} cries after being punched by ${interaction.user.username}!`;
        } else {
          // Run away - use pat as a substitute for running
          actionGif = await hmtai.sfw.pat();
          responseTitle = 'Running away!';
          responseDesc = `${targetUser.username} runs away from ${interaction.user.username}!`;
        }
        
        const responseEmbed = new EmbedBuilder()
          .setTitle(responseTitle)
          .setDescription(responseDesc)
          .setImage(actionGif)
          .setColor(0xFF4500);
        
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
      console.error(`Error executing punch command: ${error.message}`);
      return interaction.reply({
        content: 'Failed to punch!',
        flags: MessageFlags.Ephemeral,
      });
    }
  },
};