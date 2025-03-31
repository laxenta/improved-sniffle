"use strict";
const axios = require("axios");
const {
  SlashCommandBuilder,
  AttachmentBuilder,
  EmbedBuilder,
  InteractionContextType,

} = require("discord.js");

const validPersonalities = [
  "will", "maltida", "liam", "jessica", "george", "lily",
  "sana", "wahab", "martin", "darine", "guillaume", "leoni",
  "kurt", "leo", "shakuntala", "maciej", "aneta", "gabriela", "juan"
];

module.exports = {
  data: new SlashCommandBuilder()
    .setName("voice")
    .setDescription("Generates audio speech, premium")
    .setIntegrationTypes(0, 1)
    .setContexts(0, 1, 2)
    .addStringOption((option) =>
      option
        .setName("text")
        .setDescription("The text to convert to speech")
        .setRequired(true)
    )
    .addStringOption((option) =>
      option
        .setName("voice")
        .setDescription("The voice to use for speech generation")
        .setRequired(false)
        .addChoices(
          ...validPersonalities.map(voice => ({ name: voice, value: voice }))
        )
    )
    .addBooleanOption((option) =>
      option
        .setName("ephemeral")
        .setDescription("Make the response visible only to you")
        .setRequired(false)
    ),

  async execute(interaction) {
    // Get options from the interaction
    const text = interaction.options.getString("text");
    const personality = interaction.options.getString("voice") || "sana";
    const isEphemeral = interaction.options.getBoolean("ephemeral") ?? false;

    const ELECTRON_HUB_API_KEY = "ek-3gmOPmvuljmrl4NQrohpnp1ryNXQG5bNn08zNuzhX6bcxBrndR";
    await interaction.deferReply({ ephemeral: isEphemeral });

    try {
      // Validate text length
      if (text.length > 30000) {
        throw new Error("Text length exceeds 300 characters limit, ask @me_straight to get upto 100k letters per m fr, shi aint free ;-;");
      }

      // Send POST request to Electron Hub API
      const response = await axios.post(
        "https://api.electronhub.top/v1/audio/speech",
        {
          model: "elevenlabs",
          voice: personality.toLowerCase(),
          input: text,
        },
        {
          headers: {
            Authorization: `Bearer ${ELECTRON_HUB_API_KEY}`,
          },
          responseType: "arraybuffer",
        }
      );

      // Create an attachment from the audio buffer
      const attachment = new AttachmentBuilder(response.data, {
        name: "speech.wav",
        description: `Speech generated using ${personality} voice`
      });

      // Create embed with file reference
      const embed = new EmbedBuilder()
        .setTitle("🎙️ Speech Generated")
        .setDescription(`**Voice:** ${personality}\n**Text:** ${text}`)
        .setColor(0x00ae86)
        .setTimestamp()
        .setFields([
          {
            name: "Audio File",
            value: "📎 Attached above this..",
            inline: true
          },
             
        ])
        .setFooter({ 
          text: `Requested by ${interaction.user.tag}`,
          iconURL: interaction.user.displayAvatarURL()
        });

      await interaction.editReply({ 
        embeds: [embed],
        files: [attachment]
      });

    } catch (error) {
      console.error("Error generating speech:", error);

      const errorMessages = {
        400: "Invalid request. Please check your input.",
        401: "API key is invalid or expired.",
        403: "Access denied. Please check permissions.",
        429: "Rate limit exceeded. Please try again later.",
        500: "Server error. Please try again later.",
        413: "Text is too long. Please use shorter text.",
        default: "An unexpected error occurred while generating speech."
      };

      const statusCode = error.response?.status;
      const errorEmbed = new EmbedBuilder()
        .setTitle("❌ Error")
        .setDescription(errorMessages[statusCode] || errorMessages.default)
        .setColor(0xff0000)
        .setTimestamp();

      await interaction.editReply({ 
        embeds: [errorEmbed],
        files: [] 
      });
    }
  },
};