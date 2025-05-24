const { 
  SlashCommandBuilder, 
  ActionRowBuilder, 
  ButtonBuilder, 
  ButtonStyle, 
  EmbedBuilder 
} = require("discord.js");
const axios = require("axios");

// Cache for video details (keyed by baseId)
const videoCache = new Map();
// Per-user cache to track shown video IDs.
const userShownVideos = new Map();

function setUserCacheTimeout(userId) {
  if (userShownVideos.has(userId)) {
    const entry = userShownVideos.get(userId);
    if (entry.timer) clearTimeout(entry.timer);
    entry.timer = setTimeout(() => userShownVideos.delete(userId), 5 * 60 * 1000); // 5 minutes timeout (comment says 10 mins but using 5 mins)
  } else {
    const timer = setTimeout(() => userShownVideos.delete(userId), 2 * 60 * 1000);
    userShownVideos.set(userId, { videos: new Set(), timer });
  }
}

async function getAuthToken() {
  try {
    const res = await axios.get("https://api.redgifs.com/v2/auth/temporary");
    return res.data.token;
  } catch (error) {
    console.error("Couldn't grab the token:", error);
    return null;
  }
}

async function fetchMedia(tag) {
  const token = await getAuthToken();
  if (!token) return null;
  try {
    const res = await axios.get("https://api.redgifs.com/v2/gifs/search", {
      headers: { Authorization: `Bearer ${token}` },
      params: { search_text: tag, count: 100, order: "trending" }
    });
    const gifs = res.data.gifs;
    if (!gifs || gifs.length === 0) return null;
    return gifs;
  } catch (error) {
    console.error("Error fetching media:", error);
    return null;
  }
}

async function updateReply(interaction, data) {
  if (interaction.guild) {
    return await interaction.editReply(data).then(res => res);
  } else {
    const reply = await interaction.fetchReply();
    return await interaction.webhook.editMessage(reply.id, data);
  }
}

/**
 * Sends (or updates) the reply with the video link and interactive buttons.
 * We use a simple hyperlink ([<a:ehh:1342442813648011266>](videoUrl)) instead of an embed.
 */
async function sendMedia(interaction, tag, isPublic) {
  // Update cache for this user
  setUserCacheTimeout(interaction.user.id);
  const videos = await fetchMedia(tag);
  if (!videos) {
    await interaction.followUp({ 
      content: "Oops! Couldn't find any results for that tag, try something simple.", 
      ephemeral: !isPublic
    });
    return null;
  }

  // Filter out videos already shown to this user.
  const userEntry = userShownVideos.get(interaction.user.id) || { videos: new Set() };
  const available = videos.filter(video => !userEntry.videos.has(video.id));
  let selectedVideo;
  if (available.length > 0) {
    selectedVideo = available[Math.floor(Math.random() * available.length)];
  } else {
    // Reset if all videos have been seen (sharing is caring, right?)
    userEntry.videos.clear();
    selectedVideo = videos[Math.floor(Math.random() * videos.length)];
  }
  userEntry.videos.add(selectedVideo.id);
  userShownVideos.set(interaction.user.id, userEntry);

  // Pick HD if available, else SD.
  const videoUrl = selectedVideo.urls.hd || selectedVideo.urls.sd;
  const baseId = `${tag}_${interaction.id}`;
  videoCache.set(baseId, selectedVideo);

  // Use a simple hyperlink for the video URL.
  const content = `[<a:ehh:1342442813648011266>](${videoUrl})`;

  // Create our buttons: Next, Details, Share, and Delete.
  const buttons = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`next_${baseId}`)
      .setLabel("Next")
      .setStyle(ButtonStyle.Primary),
    new ButtonBuilder()
      .setCustomId(`details_${baseId}`)
      .setLabel("Details")
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId(`share_${baseId}`)
      .setLabel("Share")
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId(`delete_${baseId}`)
      .setLabel("Delete")
      .setStyle(ButtonStyle.Danger)
  );

  await updateReply(interaction, { content, components: [buttons] });
  return await interaction.fetchReply();
}

/**
 * Registers a collector for the interactive buttons.
 * Handles Next, Details, Delete, and Share with custom logic.
 */
function registerButtonHandlers(interaction, tag, message, isPublic) {
  const baseId = `${tag}_${interaction.id}`;
  const filter = (i) =>
    (i.customId === `next_${baseId}` ||
     i.customId === `details_${baseId}` ||
     i.customId === `share_${baseId}` ||
     i.customId === `delete_${baseId}`) &&
    i.user.id === interaction.user.id;

  const collector = message.createMessageComponentCollector({ filter, time: 260000 });

  collector.on("collect", async (i) => {
    if (i.customId.startsWith("delete_")) {
      await i.deferUpdate();
      try {
        if (!isPublic) {
          await interaction.deleteReply();
        } else {
          await message.delete();
        }
      } catch (err) {
        console.error("Error deleting message:", err);
      }
      collector.stop("delete");
    } else if (i.customId.startsWith("share_")) {
      await i.deferUpdate();
      const video = videoCache.get(baseId);
      if (video) {
        const videoUrl = video.urls.hd || video.urls.sd;
        // Shared link formatted as a hyperlink
        const formattedLink = `[<a:ehh:1342442813648011266>](${videoUrl})`;
        if (isPublic) {
          // NSFW channel: share directly with a public follow-up.
          await interaction.followUp({ content: formattedLink, ephemeral: false });
        } else {
          // Non-NSFW: send a public warning embed with a "View Content" button.
          const warningEmbed = new EmbedBuilder()
            .setColor(0xff0000)
            .setTitle('Content Warning')
            .setDescription("Umm this shared content won't be auto-embedded in here.\nSo whoever is interested- click below to view it :3\nON your own risk btw :3")
            .setFooter({ text: `Shared by ${interaction.user.username}` });
          
          const viewButton = new ActionRowBuilder().addComponents(
            new ButtonBuilder()
              .setCustomId(`view_${baseId}`)
              .setLabel("View Content")
              .setStyle(ButtonStyle.Primary)
          );
          const warningMessage = await interaction.followUp({ 
            embeds: [warningEmbed],
            components: [viewButton], 
            ephemeral: false 
          });
          
          // Set up collector for the "View Content" button (allowing any user to click).
          const viewFilter = (btn) => btn.customId === `view_${baseId}`;
          const viewCollector = warningMessage.createMessageComponentCollector({ filter: viewFilter, time: 260000 });
          
          viewCollector.on("collect", async (btn) => {
            // Reply ephemerally to the user who clicked the button, with the formatted link.
            try {
              await btn.reply({ content: formattedLink, ephemeral: true });
            } catch (err) {
              console.error("Error replying to view button click:", err);
            }
          });
          
          viewCollector.on("end", async () => {
            // Once the collector times out, disable the view button.
            const disabledViewButton = new ActionRowBuilder().addComponents(
              new ButtonBuilder()
                .setCustomId(`view_${baseId}`)
                .setLabel("View Content")
                .setStyle(ButtonStyle.Primary)
                .setDisabled(true)
            );
            try {
              await warningMessage.edit({ components: [disabledViewButton] });
            } catch (err) {
              console.error("Error disabling view button on end:", err);
            }
          });
        }
      }
    } else if (i.customId.startsWith("details_")) {
      await i.deferUpdate();
      const video = videoCache.get(baseId);
      if (video) {
        const details = `**Video Details:**\nID: ${video.id}\nResolution: ${video.urls.hd ? "HD" : "SD"}`;
        await interaction.followUp({ content: details, ephemeral: true });
      }
    } else if (i.customId.startsWith("next_")) {
      await i.deferUpdate();
      const newMessage = await sendMedia(interaction, tag, isPublic);
      if (newMessage) registerButtonHandlers(interaction, tag, newMessage, isPublic);
      collector.stop("next");
    }
  });

  collector.on("end", async (_collected, reason) => {
    if (reason !== "next") {
      const disabledButtons = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId("disabled_next")
          .setLabel("Next")
          .setStyle(ButtonStyle.Primary)
          .setDisabled(true),
        new ButtonBuilder()
          .setCustomId("disabled_details")
          .setLabel("Details")
          .setStyle(ButtonStyle.Secondary)
          .setDisabled(true),
        new ButtonBuilder()
          .setCustomId("disabled_share")
          .setLabel("Share")
          .setStyle(ButtonStyle.Secondary)
          .setDisabled(true),
        new ButtonBuilder()
          .setCustomId("disabled_delete")
          .setLabel("Delete")
          .setStyle(ButtonStyle.Danger)
          .setDisabled(true)
      );
      try {
        await updateReply(interaction, { components: [disabledButtons] });
      } catch (err) {
        console.error("Error disabling buttons:", err);
      }
    }
  });
}

/**
 * Get tag suggestions from RedGIFs using the /v2/tags/suggest endpoint.
 */
async function getTagSuggestions(query, count = 10) {
  const token = await getAuthToken();
  if (!token) {
    console.error("Couldn't get auth token for tag suggestions.");
    return [];
  }
  try {
    const res = await axios.get("https://api.redgifs.com/v2/tags/suggest", {
      headers: { Authorization: `Bearer ${token}` },
      params: { query, count }
    });
    return res.data;
  } catch (error) {
    console.error("Error fetching tag suggestions:", error);
    return [];
  }
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName("porn")
    .setDescription("Search for NSFW content, on your own risk.")
    .addStringOption(option =>
      option.setName("tag")
        .setDescription("Enter search query")
        .setRequired(true)
        .setAutocomplete(true)
    )
    .setIntegrationTypes(0, 1)
    .setContexts(0, 1, 2),
  async execute(interaction) {
    const tag = interaction.options.getString("tag");
    const isPublic = interaction.channel && interaction.channel.nsfw;
    // NSFW channels: public reply; non-NSFW: ephemeral reply.
    await interaction.deferReply({ ephemeral: !isPublic }).then(res => res);
    const message = await sendMedia(interaction, tag, isPublic);
    if (message) registerButtonHandlers(interaction, tag, message, isPublic);
  },
  async autocomplete(interaction) {
    const focusedValue = interaction.options.getFocused();
    const suggestions = await getTagSuggestions(focusedValue, 10);
    const choices = suggestions.map(tag => ({ name: tag, value: tag }));
    await interaction.respond(choices);
  }
};