"use strict";
const axios = require("axios");
const {
  SlashCommandBuilder,
  EmbedBuilder
} = require("discord.js");

const MAX_RETRIES = 3;
const RETRY_DELAY = 2000; // 2 seconds
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

// List of fallback models (per-request pricing models)
const FALLBACK_MODELS = [
  "t2v-turbo",
  "cogvideox-5b",
  "ltx-video",
  "mochi-1",
  "dream-machine",
  "hailuo-ai",
  "haiper-video-2.5",
  "haiper-video-2",
  "hunyuan-video",
  "kling-video/v1/standard/text-to-video",
  "kling-video/v1/pro/text-to-video",
  "kling-video/v1.6/standard/text-to-video",
  "kling-video/v1.5/pro/text-to-video"
];

module.exports = {
  data: new SlashCommandBuilder()
    .setName("video")
    .setDescription("Generates a video using AI, paid version")
    .addStringOption((option) =>
      option
        .setName("prompt")
        .setDescription("Description of the video you want to generate")
        .setRequired(true)
    )
    .addBooleanOption((option) =>
      option
        .setName("ephemeral")
        .setDescription("Make the response visible only to you")
        .setRequired(false)
    ),

  async execute(interaction) {
    const prompt = interaction.options.getString("prompt");
    const isEphemeral = interaction.options.getBoolean("ephemeral") ?? false;
    
    const ELECTRON_HUB_API_KEY = "ek-3gmOPmvuljmrl4NQrohpnp1ryNXQG5bNn08zNuzhX6bcxBrndR";
    console.log(`[VIDEO] Starting generation for prompt: "${prompt}"`);
    
    const loadingEmbed = new EmbedBuilder()
      .setTitle("🎬 Generating Video")
      .setDescription("```" + prompt + "```")
      .addFields({ name: "Status", value: "🔄 Initializing...", inline: true })
      .setColor(0xffaa00)
      .setTimestamp();

    await interaction.reply({ embeds: [loadingEmbed] });
    
    let overallSuccess = false;
    let usedModel = null;
    let lastError = null;
    
    // Iterate through each model in our fallback list
    for (const model of FALLBACK_MODELS) {
      console.log(`[VIDEO] Trying model: ${model}`);
      let retryCount = 0;
      let modelSuccess = false;
      
      while (retryCount < MAX_RETRIES && !modelSuccess) {
        if (retryCount > 0) {
          console.log(`[VIDEO] Retry ${retryCount} for model ${model}`);
          const retryEmbed = new EmbedBuilder()
            .setTitle("🔄 Retrying Video Generation")
            .setDescription("```" + prompt + "```")
            .addFields({ name: "Status", value: `Model ${model} - Retry ${retryCount}/${MAX_RETRIES}...`, inline: true })
            .setColor(0xffaa00)
            .setTimestamp();
          await interaction.editReply({ embeds: [retryEmbed] });
          await sleep(RETRY_DELAY);
        }
        try {
          console.log(`[VIDEO] Making API request using model ${model}...`);
          const response = await axios.post(
            'https://api.electronhub.top/v1/videos/generations',
            {
              model: model,
              prompt: prompt,
            },
            {
              headers: {
                Authorization: `Bearer ${ELECTRON_HUB_API_KEY}`,
              },
              responseType: 'stream',
            }
          );
          console.log(`[VIDEO] API request successful for model ${model}, handling stream...`);
          
          await new Promise((resolve, reject) => {
            let receivedData = false;
            const timeoutId = setTimeout(() => {
              if (!receivedData) {
                console.log(`[VIDEO] Stream timeout for model ${model}`);
                reject(new Error("Stream timeout"));
              }
            }, 30000); // 30-second timeout

            response.data.on('data', async (chunk) => {
              const line = chunk.toString();
              console.log(`[VIDEO] [${model}] Received chunk: ${line}`);
              receivedData = true;
              try {
                const data = JSON.parse(line);
                if (data.heartbeat) {
                  console.log(`[VIDEO] [${model}] Heartbeat received`);
                  const progressEmbed = new EmbedBuilder()
                    .setTitle("🎬 Generating Video")
                    .setDescription("```" + prompt + "```")
                    .addFields({ name: "Status", value: "🎥 Processing...", inline: true })
                    .setColor(0xffaa00)
                    .setTimestamp();
                  await interaction.editReply({ embeds: [progressEmbed] });
                } else if (data[0]?.url) {
                  console.log(`[VIDEO] [${model}] Generation completed, URL received`);
                  clearTimeout(timeoutId);
                  usedModel = model;
                  modelSuccess = true;
                  overallSuccess = true;
                  const successEmbed = new EmbedBuilder()
                    .setTitle("🎬 Video Generated!")
                    .setDescription("```" + prompt + "```")
                    .addFields([
                      { name: "Status", value: "✅ Completed", inline: true },
                      { name: "Video Link", value: `[Click to view](${data[0].url})`, inline: true }
                    ])
                    .setColor(0x00ae86)
                    .setTimestamp()
                    .setFooter({ text: `Requested by ${interaction.user.tag}`, iconURL: interaction.user.displayAvatarURL() });
                  await interaction.editReply({ embeds: [successEmbed] });
                  resolve();
                }
              } catch (e) {
                console.error(`[VIDEO] [${model}] Error parsing chunk:`, e);
                console.error(`[VIDEO] [${model}] Raw chunk content:`, line);
              }
            });
  
            response.data.on('end', () => {
              console.log(`[VIDEO] [${model}] Stream ended`);
              clearTimeout(timeoutId);
              if (!modelSuccess) {
                reject(new Error("Stream ended without video URL"));
              }
            });
  
            response.data.on('error', (error) => {
              console.error(`[VIDEO] [${model}] Stream error:`, error);
              clearTimeout(timeoutId);
              reject(error);
            });
          });
          // If we reach here, a valid response was received for the current model.
          break;
        } catch (error) {
          console.error(`[VIDEO] [${model}] Error on attempt ${retryCount + 1}:`, error.message);
          lastError = error;
          retryCount++;
        }
      }
      if (modelSuccess) {
        console.log(`[VIDEO] Successfully generated video using model: ${model}`);
        break;
      } else {
        console.log(`[VIDEO] Model ${model} failed after ${MAX_RETRIES} attempts, trying next model...`);
      }
    }
    
    if (!overallSuccess) {
      console.error("[VIDEO] All fallback models failed. Last error:", lastError);
      const finalErrorEmbed = new EmbedBuilder()
        .setTitle("❌ Error")
        .setDescription(`Failed to generate video after trying all models.\nPlease try again later.`)
        .setColor(0xff0000)
        .setTimestamp();
      await interaction.editReply({ embeds: [finalErrorEmbed] });
    }
  },
};