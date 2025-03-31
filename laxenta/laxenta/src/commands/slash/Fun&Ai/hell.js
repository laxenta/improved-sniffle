"use strict";
const { SlashCommandBuilder } = require("discord.js");
const axios = require("axios");

const API_KEY = process.env.APEXIFY_API_KEY || "YOUR_API_KEY_HERE";

async function callLLM(systemInstruction, userMessage) {
  const conversation = [
    { role: "system", content: systemInstruction },
    { role: "user", content: userMessage }
  ];
  try {
    const response = await axios.post(
      "https://api.electronhub.top/v1/chat/completions",
      {
        model: "llama-3.1-lumimaid-70b",
        messages: conversation
      },
      {
        headers: {
          "Authorization": `Bearer ${API_KEY}`,
          "Content-Type": "application/json"
        }
      }
    );
    return response.data.choices[0]?.message?.content;
  } catch (error) {
    console.error("LLM API call error in hell command:", error);
    throw error;
  }
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName("hell")
    .setDescription("Get your assigned hell punishment.")
    .setIntegrationTypes(0, 1)
    .setContexts(0, 1, 2)
    .addUserOption(option =>
      option.setName("target")
        .setDescription("The user to assign hell to (defaults to you)")
        .setRequired(false)
    ),
  async execute(interaction) {
    const target = interaction.options.getUser("target") || interaction.user;
    const systemInstruction = "You are a devilish adjudicator. Provide a humorous and absurd hell punishment for the given user, use at max 2 sentences long stuff, humor, modern humor or anything, like ex- your punishment is to kiss your dik or talk to a girl without exploding";
    const userMessage = `Assign a hell punishment for ${target.username}.`;

    try {
      await interaction.deferReply({ content: "Consulting the underworld... 🔥👹", ephemeral: false });
      const reply = await callLLM(systemInstruction, userMessage);
      await interaction.editReply(reply || "No punishment for you, too bad");
    } catch (error) {
      await interaction.editReply("Error generating hell punishment. Please try again later.");
    }
  }
};