const { EmbedBuilder, ButtonBuilder, ActionRowBuilder } = require('discord.js');
const mongoose = require('mongoose');
const { logger } = require('../../../utils/logger');
const { registerButton } = require('../../../handlers/buttonHandler');

// Precompiled Marriage model (waifus are stored per user)
const marriageSchema = new mongoose.Schema({
  userId: { type: String, required: true },
  username: { type: String },
  waifus: [
    {
      id: { type: String, required: true },
      url: { type: String, required: true },
      marriedAt: { type: Date, default: Date.now },
      cost: { type: Number, required: true },
    },
  ],
});
const Marriage = mongoose.models.Marriage || mongoose.model('Marriage', marriageSchema);

// Utility: Safely defer interaction
async function deferSafe(interaction) {
  if (!interaction.deferred && !interaction.replied) {
    await interaction.deferUpdate().catch(() => {
      console.warn('Interaction already deferred or expired.');
    });
  }
}

// Utility: Safely edit an interaction reply
async function editSafe(interaction, options) {
  try {
    await interaction.editReply(options);
  } catch (error) {
    logger.warn('Failed to edit interaction reply. Interaction may have expired or already been handled.');
  }
}

module.exports = {
  name: 'harem',
  description: "View your harem (the waifus you've married) with pagination.",
  async execute(message, args, client) {
    const userId = message.author.id;

    // Fetch the user's marriage document.
    const marriageData = await Marriage.findOne({ userId });
    if (!marriageData || !marriageData.waifus.length) {
      return message.channel.send("You haven't married any waifus yet!");
    }

    const waifus = marriageData.waifus;
    let currentPage = 0;

    // Generate an embed for the current waifu page.
    function generateEmbed(page) {
      const waifu = waifus[page];
      // Fallback for older entries that don't have cost
      const costText = (typeof waifu.cost === 'number') ? waifu.cost.toLocaleString() : "N/A";

      const embed = new EmbedBuilder()
        .setTitle(`${message.author.username}'s Harem`)
        .setDescription(`Displaying waifu ${page + 1} of ${waifus.length}`)
        .setImage(waifu.url)
        .setColor(0xffa6c9)
        .addFields(
          { name: 'Cost', value: `${costText} coins`, inline: true },
          { 
            name: 'Married At', 
            value: `<t:${Math.floor(new Date(waifu.marriedAt).getTime() / 1000)}:F>`, 
            inline: true 
          }
        )
        .setFooter({ text: `Page ${page + 1} / ${waifus.length}` });
      return embed;
    }

    // Generate the action row with Previous and Next buttons.
    function generateActionRow(page) {
      const prevDisabled = page === 0;
      const nextDisabled = page === waifus.length - 1;

      // Custom IDs unique for this message instance.
      const prevCustomId = `harem_prev_${message.id}`;
      const nextCustomId = `harem_next_${message.id}`;

      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId(prevCustomId)
          .setLabel('Previous')
          .setStyle('Primary')
          .setDisabled(prevDisabled),
        new ButtonBuilder()
          .setCustomId(nextCustomId)
          .setLabel('Next')
          .setStyle('Primary')
          .setDisabled(nextDisabled)
      );

      return { row, prevCustomId, nextCustomId };
    }

    // Send the initial embed and buttons.
    const { row, prevCustomId, nextCustomId } = generateActionRow(currentPage);
    const initialEmbed = generateEmbed(currentPage);
    const sentMessage = await message.channel.send({ embeds: [initialEmbed], components: [row] });

    // Register the Previous button handler.
    registerButton(prevCustomId, [userId], async (interaction) => {
      // Defer the update first to prevent multiple replies.
      await deferSafe(interaction);

      // Adjust the page
      if (currentPage > 0) currentPage--;
      const newEmbed = generateEmbed(currentPage);
      const { row: newRow } = generateActionRow(currentPage);
      try {
        // Use editReply since we already deferred the interaction
        await editSafe(interaction, { embeds: [newEmbed], components: [newRow] });
      } catch (error) {
        logger.error('Failed to update harem pagination (prev):', error);
        // Do not attempt to reply again here since the interaction is already handled.
      }
    });

    // Register the Next button handler.
    registerButton(nextCustomId, [userId], async (interaction) => {
      await deferSafe(interaction);

      if (currentPage < waifus.length - 1) currentPage++;
      const newEmbed = generateEmbed(currentPage);
      const { row: newRow } = generateActionRow(currentPage);
      try {
        await editSafe(interaction, { embeds: [newEmbed], components: [newRow] });
      } catch (error) {
        logger.error('Failed to update harem pagination (next):', error);
        // Do not attempt to reply again here.
      }
    });
  },
};