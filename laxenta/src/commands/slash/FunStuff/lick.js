const { SlashCommandBuilder, EmbedBuilder, MessageFlags, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const HMtai = require('hmtai');
const hmtai = new HMtai();

module.exports = {
  data: new SlashCommandBuilder()
    .setName('lick')
    .setDescription('Lick someone! Tasty or weird?')
    .setIntegrationTypes(0, 1) // Guild and DM integrations
    .setContexts(0, 1, 2)
    .addUserOption(option =>
      option.setName('tasty')
        .setDescription('The user to lick')
        .setRequired(false)
    ),
    
  async execute(interaction) {
    // Get the target user, if provided
    const targetUser = interaction.options.getUser('tasty');
    let description;
    let components = [];
    
    // Create response buttons if there's a target that isn't the user themselves
    if (targetUser && targetUser.id !== interaction.user.id) {
      description = `${interaction.user.username} licks ${targetUser.username}! Tasty?`;
      
      // Create buttons for target to respond with
      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId('lick_back')
          .setLabel('Lick Back! 👅')
          .setStyle(ButtonStyle.Primary),
        new ButtonBuilder()
          .setCustomId('blush_back')
          .setLabel('Blush! 😳')
          .setStyle(ButtonStyle.Secondary),
        new ButtonBuilder()
          .setCustomId('disgust_back')
          .setLabel('Eww! 🤢')
          .setStyle(ButtonStyle.Danger)
      );
      
      components.push(row);
    } else {
      // No target or self-target
      description = `${interaction.user.username} licks... themselves? Like a cat?`;
    }
    
    try {
      // Fetch the lick GIF from HMtai
      const lickGif = await hmtai.sfw.lick();
      if (!lickGif) {
        return interaction.reply({
          content: 'Failed to find a licking animation!',
          flags: MessageFlags.Ephemeral,
        });
      }
      
      // Build the embed
      const embed = new EmbedBuilder()
        .setTitle('*Lick* 👅')
        .setDescription(description)
        .setImage(lickGif)
        .setColor(0xFFA500)
        .setFooter({
          text: 'Mmm... tasty!',
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
        if (i.customId === 'lick_back') {
          actionGif = await hmtai.sfw.lick();
          responseTitle = 'Lick wars!';
          responseDesc = `${targetUser.username} licks ${interaction.user.username} back! It's getting weird...`;
        } else if (i.customId === 'blush_back') {
          actionGif = await hmtai.sfw.blush();
          responseTitle = 'So embarrassing!';
          responseDesc = `${targetUser.username} blushes after being licked by ${interaction.user.username}!`;
        } else {
          // Disgust - use nope/pout as substitute
          actionGif = await hmtai.sfw.pout();
          responseTitle = 'Gross!';
          responseDesc = `${targetUser.username} is disgusted by ${interaction.user.username}'s lick!`;
        }
        
        const responseEmbed = new EmbedBuilder()
          .setTitle(responseTitle)
          .setDescription(responseDesc)
          .setImage(actionGif)
          .setColor(0xFFA500);
        
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
      console.error(`Error executing lick command: ${error.message}`);
      return interaction.reply({
        content: 'Failed to lick!',
        flags: MessageFlags.Ephemeral,
      });
    }
  },
};