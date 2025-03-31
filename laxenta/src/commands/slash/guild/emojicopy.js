const {
  SlashCommandBuilder,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  PermissionFlagsBits
} = require('discord.js');
const { registerButton } = require('../../../handlers/buttonHandler');

// Safe deferral and edit helpers
async function deferSafe(interaction) {
  if (!interaction.deferred && !interaction.replied) {
    try {
      await interaction.deferUpdate();
    } catch (err) {
      console.warn("Interaction already deferred or expired.");
    }
  }
}

async function editSafe(interaction, options) {
  try {
    await interaction.editReply(options);
  } catch (error) {
    console.warn("Failed to edit interaction reply. It may have expired or already been handled.");
  }
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('emojicopy')
    .setDescription('Lists and copies emojis from a specified server that the bot is in.')
    .addStringOption(option =>
      option
        .setName('server_id')
        .setDescription('The ID of the server from which to copy emojis.')
        .setRequired(true)
    ),
  async execute(interaction) {
    try {
      const serverId = interaction.options.getString('server_id');
      if (!serverId) {
        return interaction.reply({ content: 'Please provide a server ID!', ephemeral: true });
      }

      // Fetch the target server
      const targetGuild = await interaction.client.guilds.fetch(serverId).catch(() => null);
      if (!targetGuild) {
        return interaction.reply({ content: '❌ Invalid server ID or I\'m not in that server!', ephemeral: true });
      }

      // Fetch all emojis from the target server
      const emojis = await targetGuild.emojis.fetch();
      if (!emojis.size) {
        return interaction.reply({ content: '❌ No emojis found in that server!', ephemeral: true });
      }

      // Create categories for different emoji types
      const categories = {
        animated: Array.from(emojis.filter(emoji => emoji.animated).values()),
        static: Array.from(emojis.filter(emoji => !emoji.animated).values())
      };

      // Function to chunk emoji arrays
      function chunkEmojis(emojiArray, maxLength = 1024) {
        const chunks = [];
        let currentChunk = [];
        let currentLength = 0;

        for (const emoji of emojiArray) {
          const emojiString = `\`${emoji.name}\` ${emoji}`;
          if (currentLength + emojiString.length + 1 > maxLength) {
            chunks.push(currentChunk);
            currentChunk = [];
            currentLength = 0;
          }
          currentChunk.push(emojiString);
          currentLength += emojiString.length + 1;
        }
        if (currentChunk.length) {
          chunks.push(currentChunk);
        }
        return chunks;
      }

      // Chunk the emojis
      const animatedChunks = chunkEmojis(categories.animated);
      const staticChunks = chunkEmojis(categories.static);

      // Create embeds
      const embeds = [];
      let embedIndex = 1;
      const totalPages = animatedChunks.length + staticChunks.length;

      // Initialize the first embed
      let currentEmbed = new EmbedBuilder()
        .setColor(0x3498db)
        .setTitle(`📋 Emojis from ${targetGuild.name}`)
        .setTimestamp()
        .setFooter({ text: `Total Emojis: ${emojis.size} • Server ID: ${targetGuild.id}` });

      // Add animated emoji chunks to embeds
      for (let i = 0; i < animatedChunks.length; i++) {
        const chunk = animatedChunks[i];
        
        // If the current embed already has 2 fields, finalize it and create a new one
        if (currentEmbed.data.fields && currentEmbed.data.fields.length >= 2) {
          currentEmbed.setDescription(`Page ${embedIndex}/${totalPages}`);
          embeds.push(currentEmbed);
          
          // Create a new embed for the next page
          currentEmbed = new EmbedBuilder()
            .setColor(0x3498db)
            .setTitle(`📋 Emojis from ${targetGuild.name} (Continued)`)
            .setTimestamp()
            .setFooter({ text: `Total Emojis: ${emojis.size} • Server ID: ${targetGuild.id}` });
          
          embedIndex++;
        }
        
        // Add the current chunk to the embed
        currentEmbed.addFields({
          name: `Animated Emojis (${categories.animated.length}) - Part ${i + 1}`,
          value: chunk.join(' ') || 'No animated emojis',
          inline: false
        });
      }

      // Add static emoji chunks to embeds
      for (let i = 0; i < staticChunks.length; i++) {
        const chunk = staticChunks[i];
        
        // If the current embed already has 2 fields, finalize it and create a new one
        if (currentEmbed.data.fields && currentEmbed.data.fields.length >= 2) {
          currentEmbed.setDescription(`Page ${embedIndex}/${totalPages}`);
          embeds.push(currentEmbed);
          
          // Create a new embed for the next page
          currentEmbed = new EmbedBuilder()
            .setColor(0x3498db)
            .setTitle(`📋 Emojis from ${targetGuild.name} (Continued)`)
            .setTimestamp()
            .setFooter({ text: `Total Emojis: ${emojis.size} • Server ID: ${targetGuild.id}` });
          
          embedIndex++;
        }
        
        // Add the current chunk to the embed
        currentEmbed.addFields({
          name: `Static Emojis (${categories.static.length}) - Part ${i + 1}`,
          value: chunk.join(' ') || 'No static emojis',
          inline: false
        });
      }

      // Add the last embed if it has any fields
      if (currentEmbed.data.fields && currentEmbed.data.fields.length > 0) {
        currentEmbed.setDescription(`Page ${embedIndex}/${totalPages}`);
        embeds.push(currentEmbed);
      }

      // Initialize variables for pagination
      let currentPage = 0;
      const uniqueId = interaction.id;

      // Store the current page in a Map to ensure it's properly tracked across button interactions
      const pageTracker = new Map();
      pageTracker.set(uniqueId, 0); // Initialize at page 0

      // Function to create pagination buttons with proper states
      function createButtonRow(page, totalPages) {
        return new ActionRowBuilder().addComponents(
          new ButtonBuilder()
            .setCustomId(`emojicopy_prev_${uniqueId}`)
            .setLabel('Previous')
            .setStyle(ButtonStyle.Secondary)
            .setEmoji('⬅️')
            .setDisabled(page <= 0),  // Changed to <= for clarity
          new ButtonBuilder()
            .setCustomId(`emojicopy_next_${uniqueId}`)
            .setLabel('Next')
            .setStyle(ButtonStyle.Secondary)
            .setEmoji('➡️')
            .setDisabled(page >= totalPages) // This allows access to all pages          new ButtonBuilder()
            .setCustomId(`emojicopy_copy_${uniqueId}`)
            .setLabel('Add All Emojis')
            .setStyle(ButtonStyle.Primary)
            .setEmoji('➕'),
          new ButtonBuilder()
            .setCustomId(`emojicopy_delete_${uniqueId}`)
            .setLabel('Delete All')
            .setStyle(ButtonStyle.Danger)
            .setEmoji('🗑️')
        );
      }

      // Send initial embed with buttons
      const buttonRow = createButtonRow(currentPage, embeds.length);
      await interaction.reply({
        embeds: [embeds[currentPage]],
        components: [buttonRow]
      });

      // For later editing
      const reply = await interaction.fetchReply();

      // Register previous button
      registerButton(
        `emojicopy_prev_${uniqueId}`,
        [interaction.user.id],
        async (btnInteraction) => {
          try {
            await deferSafe(btnInteraction);
            
            // Get current page from our tracker
            let curPage = pageTracker.get(uniqueId) || 0;
            
            if (curPage > 0) {
              curPage--;
              // Update tracker
              pageTracker.set(uniqueId, curPage);
              
              // Create fresh buttons with correct states
              const updatedRow = createButtonRow(curPage, embeds.length);

              await editSafe(btnInteraction, {
                embeds: [embeds[curPage]],
                components: [updatedRow]
              });
            }
          } catch (error) {
            console.error('Previous page error:', error);
          }
        },
        { globalCooldown: true }
      );

      // Register next button
      registerButton(
        `emojicopy_next_${uniqueId}`,
        [interaction.user.id],
        async (btnInteraction) => {
          try {
            await deferSafe(btnInteraction);
            
            // Get current page from our tracker
            let curPage = pageTracker.get(uniqueId) || 0;
            
            if (curPage < embeds.length - 1) {
              curPage++;
              // Update tracker
              pageTracker.set(uniqueId, curPage);
              
              // Create fresh buttons with correct states
              const updatedRow = createButtonRow(curPage, embeds.length);

              await editSafe(btnInteraction, {
                embeds: [embeds[curPage]],
                components: [updatedRow]
              });
            }
          } catch (error) {
            console.error('Next page error:', error);
          }
        },
        { globalCooldown: true }
      );

      // Register copy button (admin only)
      registerButton(
        `emojicopy_copy_${uniqueId}`,
        [interaction.user.id],
        async (btnInteraction) => {
          try {
            await deferSafe(btnInteraction);
            // Check permissions
            if (!btnInteraction.member.permissions.has(PermissionFlagsBits.ManageGuild)) {
              await btnInteraction.followUp({
                content: '❌ You need "Manage Server" permission to add emojis!',
                ephemeral: true
              });
              return;
            }

            const maxEmojis = {
              NONE: 50,
              TIER_1: 100,
              TIER_2: 150,
              TIER_3: 250
            }[btnInteraction.guild.premiumTier] || 50;

            const currentEmojis = await btnInteraction.guild.emojis.fetch();
            const availableSlots = maxEmojis - currentEmojis.size;

            if (availableSlots <= 0) {
              await btnInteraction.followUp({
                content: '❌ No emoji slots available in this server!',
                ephemeral: true
              });
              return;
            }

            // Get current page from tracker
            const curPage = pageTracker.get(uniqueId) || 0;
            
            // Use a temporary embed to show progress.
            let progressEmbed = EmbedBuilder.from(embeds[curPage])
              .setDescription(`Processing emojis...`);
            await editSafe(btnInteraction, { embeds: [progressEmbed], components: [createButtonRow(curPage, embeds.length)] });

            const addedEmojis = [];
            const failedEmojis = [];
            let skippedEmojis = 0;
            const totalEmojis = Math.min(emojis.size, availableSlots);

            let processedCount = 0;
            // Loop through emojis
            for (const [, emoji] of emojis.entries()) {
              if (addedEmojis.length >= availableSlots) {
                skippedEmojis = emojis.size - addedEmojis.length - failedEmojis.length;
                break;
              }
              processedCount++;
              if (processedCount % 5 === 0) {
                progressEmbed.setDescription(`Processing emojis... ${processedCount}/${totalEmojis}`);
                await editSafe(btnInteraction, { 
                  embeds: [progressEmbed], 
                  components: [createButtonRow(curPage, embeds.length)]
                });
              }
              try {
                await btnInteraction.guild.emojis.create({
                  attachment: emoji.url,
                  name: emoji.name
                });
                addedEmojis.push(emoji.name);
              } catch (error) {
                console.error(`Failed to add emoji ${emoji.name}:`, error);
                failedEmojis.push(emoji.name);
              }
            }

            // Prepare result embed
            let resultEmbed = new EmbedBuilder()
              .setColor(addedEmojis.length > 0 ? 0x2ecc71 : 0xe74c3c)
              .setTitle('Emoji Addition Results')
              .setDescription(`Process completed! ${addedEmojis.length}/${totalEmojis} emojis added.`)
              .setTimestamp();

            if (addedEmojis.length > 0) {
              resultEmbed.addFields({
                name: `Added Emojis`,
                value: addedEmojis.length > 0 
                  ? addedEmojis.join(', ').slice(0, 1024) 
                  : 'None',
                inline: false
              });
            }
            if (failedEmojis.length > 0) {
              resultEmbed.addFields({
                name: '❌ Failed to Add',
                value: failedEmojis.length > 0 
                  ? failedEmojis.join(', ').slice(0, 1024)
                  : 'None',
                inline: false
              });
            }
            if (skippedEmojis > 0) {
              resultEmbed.addFields({
                name: '⏭️ Skipped',
                value: `${skippedEmojis} emojis skipped due to slot limit`,
                inline: false
              });
            }

            await editSafe(btnInteraction, {
              embeds: [resultEmbed],
              components: [createButtonRow(curPage, embeds.length)],
              content: null
            });
          } catch (error) {
            console.error('Emoji copy error:', error);
            await btnInteraction.followUp({
              content: '❌ An error occurred while adding emojis.',
              ephemeral: true
            });
          }
        },
        { globalCooldown: true }
      );

      // Register delete button (admin only)
      registerButton(
        `emojicopy_delete_${uniqueId}`,
        [interaction.user.id],
        async (btnInteraction) => {
          try {
            await deferSafe(btnInteraction);
            // Check permissions
            if (!btnInteraction.member.permissions.has(PermissionFlagsBits.ManageGuild)) {
              await btnInteraction.followUp({
                content: '❌ You need "Manage Server" permission to delete emojis!',
                ephemeral: true
              });
              return;
            }

            // Get current page from tracker
            const curPage = pageTracker.get(uniqueId) || 0;

            // Build confirmation buttons
            const confirmRow = new ActionRowBuilder().addComponents(
              new ButtonBuilder()
                .setCustomId(`emojicopy_delete_confirm_${uniqueId}`)
                .setLabel('Confirm Delete')
                .setStyle(ButtonStyle.Danger)
                .setEmoji('⚠️'),
              new ButtonBuilder()
                .setCustomId(`emojicopy_delete_cancel_${uniqueId}`)
                .setLabel('Cancel')
                .setStyle(ButtonStyle.Secondary)
            );

            // Update embed for deletion confirmation
            let deletionEmbed = EmbedBuilder.from(embeds[curPage])
              .setColor(0xff0000)
              .setTitle('⚠️ Confirm Deletion')
              .setDescription(`Are you sure you want to delete all ${emojis.size} emojis from this server?`);

            await editSafe(btnInteraction, {
              embeds: [deletionEmbed],
              components: [confirmRow],
            });

            // Register confirmation buttons
            registerButton(
              `emojicopy_delete_confirm_${uniqueId}`,
              [btnInteraction.user.id],
              async (confirmInteraction) => {
                try {
                  await deferSafe(confirmInteraction);
                  let deletedCount = 0;
                  let failedCount = 0;

                  const totalCount = emojis.size;
                  for (const [, emoji] of emojis.entries()) {
                    try {
                      await emoji.delete();
                      deletedCount++;
                      if (deletedCount % 5 === 0 || deletedCount === totalCount) {
                        await editSafe(confirmInteraction, {
                          content: `Deleting emojis... ${deletedCount}/${totalCount}`,
                        });
                      }
                    } catch (error) {
                      console.error(`Failed to delete emoji ${emoji.name}:`, error);
                      failedCount++;
                    }
                  }

                  const resultEmbed = new EmbedBuilder()
                    .setColor(0xff0000)
                    .setTitle('Emoji Deletion Results')
                    .setDescription(`Process completed!`)
                    .addFields(
                      { name: '🗑️ Deleted', value: `${deletedCount} emojis`, inline: true },
                      { name: '❌ Failed', value: `${failedCount} emojis`, inline: true }
                    )
                    .setTimestamp();

                  await editSafe(confirmInteraction, {
                    embeds: [resultEmbed],
                    components: [],
                    content: null
                  });
                } catch (error) {
                  console.error('Emoji deletion error:', error);
                  await confirmInteraction.followUp({
                    content: '❌ An error occurred while deleting emojis.',
                    ephemeral: true
                  });
                }
              },
              { globalCooldown: true }
            );

            registerButton(
              `emojicopy_delete_cancel_${uniqueId}`,
              [btnInteraction.user.id],
              async (cancelInteraction) => {
                await deferSafe(cancelInteraction);
                await editSafe(cancelInteraction, {
                  embeds: [embeds[curPage]],
                  components: [createButtonRow(curPage, embeds.length)],
                  content: null
                });
              },
              { globalCooldown: true }
            );
          } catch (error) {
            console.error('Delete button error:', error);
            await btnInteraction.followUp({
              content: '❌ An error occurred while processing your request.',
              ephemeral: true
            });
          }
        },
        { globalCooldown: true }
      );

      // Clean up buttons after 5 minutes
      setTimeout(async () => {
        try {
          await reply.edit({
            components: [],
            content: '⏱️ Emoji copy session expired :3'
          });
        } catch (err) {
          console.error('Error cleaning up emoji copy buttons:', err);
        }
      }, 300000);

    } catch (error) {
      console.error('Error:', error);
      if (!interaction.replied) {
        await interaction.reply({ content: 'An error occurred while processing your request.', ephemeral: true });
      } else {
        await interaction.followUp({ content: 'An error occurred while processing your request.', ephemeral: true });
      }
    }
  }
};