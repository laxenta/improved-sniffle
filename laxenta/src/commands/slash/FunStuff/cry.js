const { SlashCommandBuilder, EmbedBuilder, MessageFlags, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const HMtai = require('hmtai');
const hmtai = new HMtai();

module.exports = {
  data: new SlashCommandBuilder()
    .setName('cry')
    .setDescription('Bite bite biting :3')
    .setIntegrationTypes(0, 1) // Guild and DM integrations
    .setContexts(0, 1, 2)
    .addUserOption(option =>
      option.setName('target')
        .setDescription('The user to cry to (optional)')
        .setRequired(false)
    ),
    
  async execute(interaction) {
    // Get the target user, if provided
    const targetUser = interaction.options.getUser('target');
    let description;
    let components = [];
    
    // Create response buttons if there's a target that isn't the user themselves
    if (targetUser && targetUser.id !== interaction.user.id) {
      description = `${interaction.user.username} is crying to ${targetUser.username}... comfort them pls 🥺`;
      
      // Create buttons for target to respond with
      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId('hug_back')
          .setLabel('Hug 🤗')
          .setStyle(ButtonStyle.Primary),
        new ButtonBuilder()
          .setCustomId('pat_back')
          .setLabel('Pat 🐾')
          .setStyle(ButtonStyle.Success),
        new ButtonBuilder()
          .setCustomId('smile_back')
          .setLabel('Smile 😄')
          .setStyle(ButtonStyle.Secondary)
      );
      
      components.push(row);
    } else {
      // No target or self-target
      description = `${interaction.user.username} cries into the void... echo echo 😭`;
    }
    
    try {
      // Fetch the cry GIF from HMtai
      const cryGif = await hmtai.sfw.cry();
      if (!cryGif) {
        return interaction.reply({
          content: 'Failed to find a cry GIF!',
          flags: MessageFlags.Ephemeral,
        });
      }
      
      // Build the embed
      const embed = new EmbedBuilder()
        .setTitle('Crying Time 😢')
        .setDescription(description)
        .setImage(cryGif)
        .setColor(0x87CEEB)
        .setFooter({
          text: 'Bite bite biting :3',
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
          hug_back: 'hug',
          pat_back: 'pat',
          smile_back: 'smile'
        };
        
        const func = actions[i.customId];
        const actionGif = await hmtai.sfw[func]();
        
        const responseEmbed = new EmbedBuilder()
          .setTitle(`${targetUser.username} responds to ${interaction.user.username}`)
          .setDescription(`They chose to **${func}** them!`)
          .setImage(actionGif)
          .setColor(0x87CEEB);
        
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
      console.error(`Error executing cry command: ${error.message}`);
      return interaction.reply({
        content: 'Failed to cry!',
        flags: MessageFlags.Ephemeral,
      });
    }
  },
};