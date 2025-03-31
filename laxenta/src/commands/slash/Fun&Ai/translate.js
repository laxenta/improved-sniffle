"use strict";
const { SlashCommandBuilder, EmbedBuilder } = require("discord.js");
// Make sure to run: npm install translate-google-api
const translate = require('translate-google-api');

module.exports = {
  data: new SlashCommandBuilder()
    .setName("translate")
    .setDescription("Translate text from one language to another")
    .addStringOption(option =>
      option.setName("text")
        .setDescription("Text to translate")
        .setRequired(true)
    )
    .addStringOption(option =>
      option.setName("to")
        .setDescription("Target language (e.g., en, es, fr, ja). Defaults to English if not provided.")
        .setRequired(false)
    )
    .addStringOption(option =>
      option.setName("from")
        .setDescription("Source language (optional, leave blank for auto-detect)")
        .setRequired(false)
    )
    .addBooleanOption(option =>
      option.setName("ephemeral")
        .setDescription("Should the reply be ephemeral? (default: false)")
        .setRequired(false)
    )
    .setIntegrationTypes(0, 1)
    .setContexts(0, 1, 2),
  
  async execute(interaction) {
    const text = interaction.options.getString("text");
    const to = interaction.options.getString("to") || "en"; // defaults to English if not provided
    const from = interaction.options.getString("from");
    const ephemeral = interaction.options.getBoolean("ephemeral") || false;
    
    try {
      await interaction.deferReply({ ephemeral });
      
      // Configure options for the translate package
      const options = { tld: "com", to };
      if (from) options.from = from;
      
      // Perform translation
      const result = await translate(text, options);
      // result might be a string or an array; we check and use accordingly.
      const translatedText = Array.isArray(result) ? result[0] : result;
      
      // Create a beautiful embed with the translation details
      const embed = new EmbedBuilder()
        .setColor(0x0099ff)
        .setTitle("Translation Result")
        .addFields(
          { name: "Original Text", value: text.length > 1024 ? text.slice(0, 1021) + "..." : text },
          { name: "Translated Text", value: translatedText.length > 1024 ? translatedText.slice(0, 1021) + "..." : translatedText },
          { name: "Target Language", value: to, inline: true },
          { name: "Source Language", value: from || "Auto-detected", inline: true }
        )
        .setTimestamp()
        .setFooter({ text: "Using Google Translate" });
      
      await interaction.editReply({ embeds: [embed] });
    } catch (error) {
      console.error("Translation error:", error);
      await interaction.editReply("Error translating text. Please check language codes and try again.");
    }
  }
};