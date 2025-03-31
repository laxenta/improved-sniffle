const { 
  SlashCommandBuilder, 
  EmbedBuilder, 
  ActionRowBuilder, 
  ButtonBuilder, 
  ButtonStyle, 
  MessageFlags 
} = require('discord.js');
const axios = require('axios');
const { registerButton } = require('../../../handlers/buttonHandler.js');
const HMtai = require('hmtai');
const hmtai = new HMtai();

// Function to fetch a random kiss GIF from nekos.life
const getKissGif = async () => {
  try {
    const response = await axios.get('https://nekos.life/api/v2/img/kiss');
    return response.data.url;
  } catch (error) {
    console.error('Error fetching kiss GIF:', error);
    return null;
  }
};

module.exports = {
  data: new SlashCommandBuilder()
    .setName('kiss')
    .setDescription('Sends a random kiss to the specified user.')
    .setIntegrationTypes(0, 1) // Works in guilds and DMs
    .setContexts([0, 1, 2])    // Available in Guild, DM, and Voice contexts
    .addUserOption(option =>
      option
        .setName('target')
        .setDescription('The user to kiss')
        .setRequired(true)
    ),
  async execute(interaction) {
    const targetUser = interaction.options.getUser('target');

    // Prevent users from kissing themselves.
    if (targetUser.id === interaction.user.id) {
      return interaction.reply({ 
        content: `**${interaction.user.username}**, you cannot kiss yourself!`, 
        flags: MessageFlags.Ephemeral 
      });
    }

    // Generate unique custom IDs for each action button.
    const customIdKissBack = `kissBack_${interaction.id}`;
    const customIdSlap = `slap_${interaction.id}`;
    const customIdCuddle = `cuddle_${interaction.id}`;

    try {
      const gifUrl = await getKissGif();
      if (!gifUrl) {
        return interaction.reply({ 
          content: 'Failed to fetch a kiss GIF :(', 
          flags: MessageFlags.Ephemeral 
        });
      }

      // Build the initial embed with bold display names (no pings)
      const embed = new EmbedBuilder()
        .setColor('#ff69b4')
        .setTitle(`**${interaction.user.username}** kisses **${targetUser.username}**!`)
        .setImage(gifUrl)
        .setFooter({ 
          text: 'Awaiting response from the recipient :3', 
          iconURL: interaction.user.displayAvatarURL({ dynamic: true, size: 2048 })
        });

      // Create action buttons for "Kiss Back", "Slap", and "Cuddle"
      const buttons = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId(customIdKissBack)
          .setLabel('Kiss Back')
          .setStyle(ButtonStyle.Primary),
        new ButtonBuilder()
          .setCustomId(customIdSlap)
          .setLabel('Slap')
          .setStyle(ButtonStyle.Danger),
        new ButtonBuilder()
          .setCustomId(customIdCuddle)
          .setLabel('Cuddle')
          .setStyle(ButtonStyle.Success)
      );

      // Send the initial public reply with the embed and buttons.
      await interaction.reply({ embeds: [embed], components: [buttons] });

      /* -------------------- Button Handlers -------------------- */
      
      // Helper function to remove buttons via webhook editing (DM) or message editing (Guild)
      const removeButtons = async (btnInteraction) => {
        if (interaction.inGuild()) {
          await btnInteraction.message.edit({ components: [] });
        } else {
          await btnInteraction.editReply({ components: [] });
        }
      };

      // Handler for "Kiss Back" button.
      registerButton(customIdKissBack, [targetUser.id], async (btnInteraction) => {
        try {
          // Acknowledge the button interaction.
          if (!btnInteraction.deferred && !btnInteraction.replied) 
            await btnInteraction.deferUpdate();
          
          // Fetch a new kiss GIF for the kiss back action.
          const kissBackGif = await getKissGif();
          if (!kissBackGif) throw new Error('No kiss back GIF available.');

          // Create an embed reflecting the kiss back action using bold display names.
          const kissBackEmbed = new EmbedBuilder()
            .setColor('#ff69b4')
            .setTitle(`**${targetUser.username}** kisses **${interaction.user.username}** back!`)
            .setImage(kissBackGif)
            .setFooter({ 
              text: 'A sweet smooch has been returned :3!', 
              iconURL: targetUser.displayAvatarURL({ dynamic: true, size: 2048 })
            });
          
          // Remove the action buttons from the original message using appropriate editing.
          await removeButtons(btnInteraction);
          // Send a follow-up message with the kiss back embed.
          await btnInteraction.followUp({ embeds: [kissBackEmbed] });
        } catch (error) {
          console.error('Error in kiss back button:', error);
          await btnInteraction.followUp({ 
            content: 'Failed to process kiss back.', 
            flags: MessageFlags.Ephemeral 
          });
        }
      });

      // Handler for "Slap" button.
      registerButton(customIdSlap, [targetUser.id], async (btnInteraction) => {
        try {
          if (!btnInteraction.deferred && !btnInteraction.replied) 
            await btnInteraction.deferUpdate();
          
          // Fetch a slap GIF using hmtai.
          const slapGif = await hmtai.sfw.slap();
          if (!slapGif) throw new Error('No slap GIF available.');

          // Build an embed to indicate that the target slapped the sender.
          const slapEmbed = new EmbedBuilder()
            .setColor('#ff0000')
            .setTitle(`**${targetUser.username}** slapped **${interaction.user.username}**! Ouch!`)
            .setImage(slapGif)
            .setFooter({ 
              text: 'That must have hurt lmao!', 
              iconURL: targetUser.displayAvatarURL({ dynamic: true, size: 2048 })
            });
          
          await removeButtons(btnInteraction);
          await btnInteraction.followUp({ embeds: [slapEmbed] });
        } catch (error) {
          console.error('Error in slap button:', error);
          await btnInteraction.followUp({ 
            content: 'Failed to process slap.', 
            flags: MessageFlags.Ephemeral 
          });
        }
      });

      // Handler for "Cuddle" button.
      registerButton(customIdCuddle, [targetUser.id], async (btnInteraction) => {
        try {
          if (!btnInteraction.deferred && !btnInteraction.replied) 
            await btnInteraction.deferUpdate();
          
          // Fetch a cuddle GIF using hmtai.
          const cuddleGif = await hmtai.sfw.cuddle();
          if (!cuddleGif) throw new Error('No cuddle GIF available.');

          // Build an embed that reflects the cuddle action.
          const cuddleEmbed = new EmbedBuilder()
            .setColor('#ff69b4')
            .setTitle(`**${targetUser.username}** cuddles with **${interaction.user.username}**! So cozy!`)
            .setImage(cuddleGif)
            .setFooter({ 
              text: 'some cozy cuddles after kissie!', 
              iconURL: targetUser.displayAvatarURL({ dynamic: true, size: 2048 })
            });
          
          await removeButtons(btnInteraction);
          await btnInteraction.followUp({ embeds: [cuddleEmbed] });
        } catch (error) {
          console.error('Error in cuddle button:', error);
          await btnInteraction.followUp({ 
            content: 'Failed to process cuddle.', 
            flags: MessageFlags.Ephemeral 
          });
        }
      });
      /* ------------------ End of Button Handlers ------------------ */

    } catch (error) {
      console.error('Error executing kiss command:', error);
      return interaction.reply({ 
        content: 'No kisses for you.', 
        flags: MessageFlags.Ephemeral 
      });
    }
  }
};