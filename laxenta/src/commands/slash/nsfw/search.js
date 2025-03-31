const {
  SlashCommandBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  MessageFlags,
} = require('discord.js');
const Booru = require('booru');
const { registerButton } = require('../../../handlers/buttonHandler.js');
const { v4: uuidv4 } = require('uuid');
const { logger } = require('../../../utils/logger');

// Function for tag suggestions (fuzzy, case-insensitive search)
async function suggestTags(site, partialTag, allSites) {
  try {
    let allTags = new Set();
    const sitesToCheck = site ? [site] : [...allSites];

    for (const site of sitesToCheck) {
      const posts = await Booru.search(site, [partialTag], { limit: 50, random: false });
      if (posts && posts.length > 0) {
        posts.forEach(post => {
          post.tags.forEach(tag => {
            if (tag.toLowerCase().includes(partialTag.toLowerCase())) {
              allTags.add(tag);
            }
          });
        });
        // Break early if any tags found
        if (allTags.size > 0) break;
      }
    }
    
    return Array.from(allTags).slice(0, 25); // Return up to 25 suggestions
  } catch (error) {
    logger.error('Error suggesting tags:', error);
    return [];
  }
}

// Helper to create buttons with consistent styling
function createButtons(refreshId, deleteId, disabled = false) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(refreshId)
      .setLabel('next')
      .setEmoji('<a:next1:1333357974751678524>')
      .setStyle(ButtonStyle.Primary)
      .setDisabled(disabled),
    new ButtonBuilder()
      .setCustomId(deleteId)
      .setLabel('delete')
      .setEmoji('<a:enddd:1326464297080983655>')
      .setStyle(ButtonStyle.Danger)
      .setDisabled(disabled)
  );
}

// Search all sites for matching content
async function searchAllSites(sites, tags, videosOnly = false) {
  const randomStart = Math.floor(Math.random() * sites.length);
  for (let i = 0; i < sites.length; i++) {
    const siteIndex = (randomStart + i) % sites.length;
    const site = sites[siteIndex];
    // Try twice per site
    for (let attempt = 1; attempt <= 2; attempt++) {
      try {
        let validPost = null;
        // Try up to 5 times to find a valid post
        for (let imageAttempt = 1; imageAttempt <= 5; imageAttempt++) {
          const posts = await Booru.search(site, tags, { limit: 100, random: true });
          if (posts && posts.length) {
            if (videosOnly) {
              const videoPost = posts.find((post) => post.fileUrl?.endsWith('.mp4'));
              if (videoPost) {
                validPost = [videoPost];
                break;
              }
            } else if (posts[0].fileUrl) {
              validPost = [posts[0]];
              break;
            }
          }
        }
        if (validPost) {
          return { posts: validPost, site };
        }
      } catch (error) {
        if (error.message.includes("Unexpected token '<'")) {
          logger.warn(`Search failed on ${site} (attempt ${attempt}): Invalid response format, skipping site.`);
          break;
        }
        logger.warn(`Search failed on ${site} (attempt ${attempt}): ${error.message}`);
      }
    }
  }
  return null;
}

// Shuffle array for random site selection
function shuffleArray(array) {
  for (let i = array.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [array[i], array[j]] = [array[j], array[i]];
  }
  return array;
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('search')
    .setDescription('Search sfw/nsfw video/img from tags on the biggest sites')
    .setIntegrationTypes(0, 1)
    .setContexts(0, 1, 2)
    .addStringOption((option) =>
      option
        .setName('tags')
        .setDescription('Tags to search for (e.g. "hutao, raiden shogun, video etc...")')
        .setRequired(true)
        .setAutocomplete(true)
    )
    .addStringOption((option) =>
      option
        .setName('site')
        .setDescription('Select a specific booru site (leave blank for random).')
        .setChoices(
          { name: 'Safe Anime Art', value: 'safebooru.org' },
          { name: 'Gelbooru', value: 'gelbooru.com' },
          { name: 'Danbooru', value: 'danbooru.donmai.us' },
          { name: 'Yande.re', value: 'yande.re' },
          { name: 'Xbooru', value: 'xbooru.com' },
          { name: 'Konchan', value: 'konachan.com' },
          { name: 'KonchanPro', value: 'konachan.net' },
          { name: 'Hypnohub', value: 'hypnohub.net' },
          { name: 'rule34', value: 'rule34.xxx' },
          { name: 'Real NSFW/Videos', value: 'realbooru.com' }
        )
        .setRequired(false)
    )
    .addBooleanOption((option) =>
      option
        .setName('video')
        .setDescription('VIDEOS only. Preferably leave the site selection empty if set to true.')
        .setRequired(false)
    ),

  cooldown: 5,

  // Autocomplete function for tag suggestions
  async autocomplete(interaction) {
    const focusedOption = interaction.options.getFocused(true);
    if (focusedOption.name === 'tags') {
      const partialTag = focusedOption.value;
      const selectedSite = interaction.options.getString('site');
      const allSites = [
        'konachan.net',
        'konachan.com',
        'gelbooru.com',
        'yande.re',
        'danbooru.donmai.us',
        'xbooru.com',
        'hypnohub.net',
        'realbooru.com',
        'safebooru.org',
        'rule34.xxx',
      ];

      try {
        const suggestions = await suggestTags(selectedSite, partialTag, allSites);
        try {
          await interaction.respond(suggestions.map(tag => ({ name: tag, value: tag })));
        } catch (err) {
          logger.error(`[ERROR] Autocomplete error for "search": ${err.message}`);
        }
      } catch (err) {
        logger.error('Error suggesting tags:', err);
        try {
          await interaction.respond([]);
        } catch (err2) {
          logger.error(`[ERROR] Autocomplete error for "search": ${err2.message}`);
        }
      }
    }
  },

  async execute(interaction) {
    const tagsInput = interaction.options.getString('tags') || '';
    const selectedSite = interaction.options.getString('site');
    const videosOnly = interaction.options.getBoolean('video') || false;
    // Split tags by commas, trim them, and replace spaces with underscores.
    const originalTags = tagsInput.split(',')
      .map(tag => tag.trim().replace(/\s+/g, '_'))
      .filter(tag => tag !== '');

    const isNsfwChannel = interaction.channel ? interaction.channel.nsfw : false;
    await interaction.deferReply({ ephemeral: !isNsfwChannel });

    const booruSites = [
      'konachan.net',
      'konachan.com',
      'gelbooru.com',
      'yande.re',
      'danbooru.donmai.us',
      'xbooru.com',
      'hypnohub.net',
      'realbooru.com',
      'safebooru.org',
      'rule34.xxx',
    ];
    const defaultTags = ['girl'];

    try {
      await sendImage(
        interaction,
        isNsfwChannel,
        originalTags,
        defaultTags,
        booruSites,
        selectedSite,
        false,
        videosOnly,
        0,
        false // suggested = false initially
      );
    } catch (error) {
      logger.error(`Error executing /search command: ${error.message}`);
      await interaction.editReply({
        content: 'Report to @me_straight, will be fixed asap..',
      });
    }

    // Main function to send and handle media display
    async function sendImage(
      interactionOrButton,
      isNsfwChannel,
      originalTags,
      defaultTags,
      booruSites,
      selectedSite,
      edit = false,
      videosOnly = false,
      attempt = 0,
      suggested = false
    ) {
      const MAX_ATTEMPTS = 60;
      if (attempt > MAX_ATTEMPTS) {
        try {
          if (interactionOrButton.followUp) {
            await interactionOrButton.followUp({
              content: 'Could not find a matching result after multiple attempts. Try different tags.',
              ephemeral: true,
            });
          }
        } catch (err) {
          logger.error(`Failed to send followUp: ${err.message}`);
        }
        return;
      }

      // Use original tags if available; otherwise, fallback to default tags
      const searchTags = originalTags.length ? originalTags : defaultTags;
      
      // Site selection logic
      const sitesToSearch = selectedSite ? [selectedSite] : shuffleArray([...booruSites]);

      // Search all sites for matching content
      const result = await searchAllSites(sitesToSearch, searchTags, videosOnly);

      // Handle no results found
      if (!result) {
        // Try suggested tags if original search fails
        if (!suggested) {
          const suggestionInput = originalTags.join(' ');
          const suggestedTags = await suggestTags(selectedSite, suggestionInput, booruSites);
          
          if (suggestedTags?.length > 0) {
            const randomTag = suggestedTags[Math.floor(Math.random() * suggestedTags.length)];
            logger.info(`Using suggested tag: ${randomTag} instead of original: ${originalTags.join(', ')}`);
            
            return await sendImage(
              interactionOrButton,
              isNsfwChannel,
              [randomTag],
              defaultTags,
              booruSites,
              selectedSite,
              edit,
              videosOnly,
              attempt + 1,
              true
            );
          }
        }
        
        // No results found notification
        const newRefreshId = uuidv4();
        const newDeleteId = uuidv4();
        
        const notFoundMessage = videosOnly
          ? `No matching video found for **"${searchTags.join(', ')}"**. Try different tags.`
          : `No matching content found for **"${searchTags.join(', ')}"**. Try different tags or sites.`;
        
        try {
          if (interactionOrButton.followUp) {
            await interactionOrButton.followUp({
              content: notFoundMessage,
              components: [createButtons(newRefreshId, newDeleteId)],
              ephemeral: true,
            });
          }
        } catch (err) {
          logger.error(`Failed to send no results message: ${err.message}`);
        }
        return;
      }

      // Get result data
      const { posts, site } = result;
      const post = posts[0];

      // Generate button IDs
      const refreshId = uuidv4();
      const deleteId = uuidv4();

      // Register refresh button handler
      registerButton(
        refreshId,
        [interactionOrButton.user?.id || interactionOrButton.member?.user?.id],
        async (btnInteraction) => {
          // First, defer the update to prevent timeout
          try {
            await btnInteraction.deferUpdate();
          } catch (err) {
            logger.warn(`Could not defer button update: ${err.message}`);
            // Continue anyway
          }
          
          // Disable buttons immediately
          const disabledButtons = createButtons(refreshId, deleteId, true);
          
          try {
            // Update the message with disabled buttons while we're loading new content
            if (btnInteraction.message) {
              await btnInteraction.message.edit({ components: [disabledButtons] })
                .catch(e => logger.warn(`Could not update message components: ${e.message}`));
            } else {
              await btnInteraction.editReply({ components: [disabledButtons] })
                .catch(e => logger.warn(`Could not edit reply components: ${e.message}`));
            }
            
            // Refresh content by calling sendImage again
            await sendImage(
              btnInteraction,
              isNsfwChannel,
              originalTags,
              defaultTags,
              booruSites,
              selectedSite,
              true,
              videosOnly,
              attempt + 1,
              suggested
            );
          } catch (error) {
            logger.error(`Error refreshing content: ${error.message}`);
            // Try to recover
            try {
              if (btnInteraction.replied || btnInteraction.deferred) {
                await btnInteraction.editReply({ 
                  content: "Error refreshing content. Please try again.",
                  components: [createButtons(refreshId, deleteId, false)]
                });
              } else if (btnInteraction.followUp) {
                await btnInteraction.followUp({ 
                  content: "Error refreshing content. Please try again.",
                  ephemeral: true
                });
              }
            } catch (e) {
              logger.error(`Failed to send error message: ${e.message}`);
            }
          }
        }
      );

      // Register delete button handler
      registerButton(
        deleteId,
        [interactionOrButton.user?.id || interactionOrButton.member?.user?.id],
        async (btnInteraction) => {
          // First, defer the update to prevent timeout
          try {
            await btnInteraction.deferUpdate();
          } catch (err) {
            logger.warn(`Could not defer button update: ${err.message}`);
            // Continue anyway
          }
          
          try {
            // Check if this is a regular message that can be deleted
            if (btnInteraction.message) {
              try {
                // Try to delete the message
                await btnInteraction.message.delete();
              } catch (deleteError) {
                logger.warn(`Failed to delete message: ${deleteError.message}`);
                
                // If deletion fails, disable buttons and update content
                const disabledButtons = createButtons(refreshId, deleteId, true);
                await btnInteraction.message.edit({ 
                  content: "Content removed by user.",
                  components: [disabledButtons] 
                }).catch(e => logger.warn(`Could not update message: ${e.message}`));
              }
            } 
            // For ephemeral messages or other contexts
            else {
              // Ephemeral messages can't be deleted, so just update the content
              const disabledButtons = createButtons(refreshId, deleteId, true);
              await btnInteraction.editReply({
                content: "Content removed by user.",
                embeds: [],
                components: [disabledButtons]
              }).catch(e => logger.warn(`Could not update reply: ${e.message}`));
            }
          } catch (error) {
            logger.error(`Error in delete button handler: ${error.message}`);
          }
        }
      );

      // Prepare response content
      let responsePayload;
      
      if (post.fileUrl.endsWith('.mp4')) {
        // Video content
        const messageContent = `[<a:hack:1333357988953460807>](${post.fileUrl}) tag searched: "${searchTags.join(', ')}"`;
        responsePayload = {
          content: messageContent,
          embeds: [],
          components: [createButtons(refreshId, deleteId)]
        };
      } else if (videosOnly) {
        // If only videos requested but image found, try again
        return await sendImage(
          interactionOrButton,
          isNsfwChannel,
          originalTags,
          defaultTags,
          booruSites,
          selectedSite,
          edit,
          videosOnly,
          attempt + 1,
          suggested
        );
      } else {
        // Image content
        const embed = new EmbedBuilder()
          .setColor(
            `#${
              (Math.floor(Math.random() * 80) + 50).toString(16).padStart(2, '0')
            }${
              (Math.random() < 0.7
                ? (Math.floor(Math.random() * 30) + 10)
                : (Math.floor(Math.random() * 80) + 50)
              ).toString(16).padStart(2, '0')
            }${
              (Math.floor(Math.random() * 120) + 80).toString(16).padStart(2, '0')
            }`
          )
          .setDescription(
            `<a:tags:1332327251253133383> **Relevant Tags:** \n${post.tags
              .slice(0, 10)
              .reduce((acc, tag, index, arr) => {
                acc.push(tag);
                if (index < arr.length - 1) acc.push(', ');
                if ((index + 1) % 2 === 0 && index < arr.length - 1) acc.push('\n');
                return acc;
              }, [])
              .join('')}..\n\n<a:cloud:1333359136037011568> **Source site:** ${site}`
          )
          .setImage(post.fullFileUrl || post.fileUrl);

        responsePayload = {
          content: null,
          embeds: [embed],
          components: [createButtons(refreshId, deleteId)]
        };
      }

      // Send response using appropriate method based on context
      try {
        if (interactionOrButton.editReply) {
          await interactionOrButton.editReply(responsePayload);
        } else if (interactionOrButton.update) {
          await interactionOrButton.update(responsePayload);
        } else if (interactionOrButton.message && interactionOrButton.message.edit) {
          await interactionOrButton.message.edit(responsePayload);
        } else {
          logger.warn("Couldn't determine how to respond to the interaction");
        }
      } catch (error) {
        logger.error(`Failed to send response: ${error.message}`);
        try {
          // Attempt to send a fallback message
          if (interactionOrButton.followUp) {
            await interactionOrButton.followUp({
              content: "There was an error displaying the content. Please try again.",
              ephemeral: true
            });
          }
        } catch (e) {
          logger.error(`Failed to send fallback message: ${e.message}`);
        }
      }
    }
  },
};