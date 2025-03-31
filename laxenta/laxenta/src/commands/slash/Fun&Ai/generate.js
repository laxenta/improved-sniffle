"use strict";
const { 
    SlashCommandBuilder, 
    EmbedBuilder, 
    ActionRowBuilder, 
    ButtonBuilder, 
    ButtonStyle,
    ChannelType,
    MessageFlags
} = require('discord.js');
const axios = require('axios');
const { registerButton } = require('../../../handlers/buttonHandler.js');
const { v4: uuidv4 } = require('uuid');

const API_KEY = process.env.APEXIFY_API_KEY || "YOUR_API_KEY_HERE";

// Constants
const STYLE_PRESETS = {
    'anime': 'anime style, detailed, vibrant colors',
    'realistic': 'photorealistic, highly detailed, 8k quality',
    'artistic': 'digital art, concept art, trending on artstation',
    'cinematic': 'cinematic lighting, dramatic composition, movie still',
    'fantasy': 'fantasy art style, magical atmosphere, ethereal lighting'
};

const CONSTANTS = {
    DEFAULT_MODEL: 'flux-pro',
    COOLDOWN_TIME: 15000,
    MAX_PROMPT_LENGTH: 1000,
    IMAGE_OPTIONS: {
        negative_prompt: 'ugly, blurry, low quality, distorted, deformed'
    },
    INITIAL_MESSAGE: '<a:loading:1333357988953460807> **Generating your masterpiece!** This might take time depending on what model u select...',
    MESSAGES: {
        REGENERATING: 'Regenerating your image...',
        WAIT: '*Please wait ~10-30s...*',
        SUCCESS: '<a:ehe:1333359136037011568> Generated',
        ERROR: 'do !info, report to the developer @me_straight',
        DELETED: '🗑️ Message deleted'
    },
    MAX_CONCURRENT: 3,
    MAX_RETRIES: 3
};

// Cache management
const cooldowns = new Map();
const imageQueue = new Map();

// Constant array of models
const MODELS = [
    'sdxl',
    'sdxl-turbo',
    'sdxl-lightning',
    'stable-diffusion-3',
    'stable-diffusion-3-2b',
    'stable-diffusion-3.5-large',
    'stable-diffusion-3.5-turbo',
    'dall-e-3',
    'midjourney-v6.1',
    'midjourney-v6',
    'midjourney-v5.2',
    'midjourney-v5.1',
    'midjourney-v5',
    'midjourney-v4',
    'playground-v3',
    'playground-v2.5',
    'animaginexl-3.1',
    'realvisxl-4.0',
    'imagen',
    'imagen-3-fast',
    'imagen-3',
    'luma-photon',
    'luma-photon-flash',
    'recraft-20b',
    'recraft-20b-svg',
    'recraft-v3',
    'recraft-v3-svg',
    'grok-2-aurora',
    'flux-schnell',
    'flux-dev',
    'flux-pro',
    'flux-1.1-pro',
    'flux-1.1-pro-ultra',
    'flux-1.1-pro-ultra-raw',
    'flux-realism',
    'flux-half-illustration',
    'flux-cinestill',
    'flux-black-light',
    'ideogram-v2-turbo',
    'ideogram-v2',
    'amazon-titan',
    'amazon-titan-v2',
    'nova-canvas',
    'omni-gen',
    'aura-flow',
    'sana',
    'kandinsky-3',
    'niji-v6',
    'niji-v5',
    'niji-v4',
    't2v-turbo'
];

// Utility Functions
class ImageGenUtils {
    static createEmbed(options) {
        const { title, description, imageUrl, color, isError } = options;
        const embed = new EmbedBuilder()
            .setTitle(title)
            .setDescription(description)
            .setColor(color || '#3498DB')
            .setTimestamp();
        if (imageUrl && !isError) embed.setImage(imageUrl);
        return embed;
    }

    static async validatePrompt(prompt, style) {
        if (!prompt?.trim() || prompt.length > CONSTANTS.MAX_PROMPT_LENGTH) {
            throw new Error(`Prompt must be between 1 and ${CONSTANTS.MAX_PROMPT_LENGTH} characters.`);
        }

        if (style && STYLE_PRESETS[style]) {
            prompt = `${prompt} + ${STYLE_PRESETS[style]}`;
        }

        const bannedWords = ['gay', 'furry']; // Customize banned words as needed
        if (bannedWords.some(word => prompt.toLowerCase().includes(word))) {
            throw new Error('Prompt contains inappropriate content.');
        }

        return prompt;
    }

    static createComponents(imageUrl, regenerateId, deleteId, variationId) {
        return [new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setCustomId(regenerateId)
                .setLabel('Regenerate')
                .setEmoji('<a:next:1333357974751678524>')
                .setStyle(ButtonStyle.Primary),
            new ButtonBuilder()
                .setCustomId(deleteId)
                .setLabel('Del')
                .setEmoji('🗑️')
                .setStyle(ButtonStyle.Danger),
            new ButtonBuilder()
                .setLabel('Open')
                .setEmoji('🌐')
                .setStyle(ButtonStyle.Link)
                .setURL(imageUrl),
            new ButtonBuilder()
                .setCustomId(variationId)
                .setLabel('Variation')
                .setEmoji('🎨')
                .setStyle(ButtonStyle.Secondary)
        )];
    }
}

// Model Management
class ModelManager {
    static async getModels() {
        return MODELS;
    }
}

// Helper function to check if a channel is DM or Group DM.
const isDMBased = (channelType) => {
    const { ChannelType } = require('discord.js');
    return channelType === ChannelType.DM || channelType === ChannelType.GroupDM;
};

// Add permission check helper after the isDMBased function
function checkPermissions(interaction) {
    if (!interaction.channel) return true; // DM channels
    
    const permissions = interaction.channel.permissionsFor(interaction.client.user);
    const requiredPermissions = [
        'ViewChannel',
        'SendMessages',
        'EmbedLinks',
        'AttachFiles'
    ];

    const missingPermissions = requiredPermissions.filter(perm => !permissions?.has(perm));
    
    if (missingPermissions.length > 0) {
        interaction.reply({
            content: `❌ I need the following permissions: ${missingPermissions.join(', ')}`,
            ephemeral: true
        });
        return false;
    }
    
    return true;
}

// Replace the existing generateImage function
async function generateImage(model, prompt, interaction) {
    try {
        if (!API_KEY || API_KEY === "YOUR_API_KEY_HERE") {
            throw new Error('API key not configured');
        }

        if (interaction?.deferred) {
            await interaction.editReply({
                content: '🎨 Starting generation...'
            });
        }

        const response = await axios({
            method: 'post',
            url: 'https://api.electronhub.top/v1/images/generations',
            data: {
                model,
                prompt
            },
            headers: {
                'Authorization': `Bearer ${API_KEY}`,
                'Content-Type': 'application/json',
                'Accept': 'application/json'
            }
        });

        // Check if response has the expected data structure
        if (!response.data?.data?.[0]?.url) {
            throw new Error('Invalid response format from API');
        }

        // Return array of URLs to maintain compatibility
        return [response.data.data[0].url];

    } catch (error) {
        console.error('Generation error:', error.response?.data || error.message);
        throw new Error(error.response?.data?.error || error.message);
    }
}

class ButtonHandlers {
    static async createActionRows(imageUrl, userId, prompt, model) {
        const regenerateId = uuidv4();
        const deleteId = uuidv4();
        const variationId = uuidv4();

        // Register the regenerate button
        registerButton(regenerateId, [userId], async (btnInteraction) => {
            try {
                await btnInteraction.deferUpdate();
                const isDM = isDMBased(btnInteraction.channel?.type);

                // Create loading embed
                const loadingEmbed = ImageGenUtils.createEmbed({
                    title: CONSTANTS.MESSAGES.REGENERATING,
                    description: `**Prompt:** \`${prompt}\`\n**Model:** \`${model}\`\n\n${CONSTANTS.MESSAGES.WAIT}`,
                    color: '#FFA500'
                });

                // Update message with loading state
                if (isDM) {
                    await btnInteraction.message.edit({
                        embeds: [loadingEmbed],
                        components: btnInteraction.message.components
                    });
                } else {
                    await btnInteraction.editReply({
                        embeds: [loadingEmbed],
                        components: btnInteraction.message.components
                    });
                }

                // Generate new image
                const startTime = Date.now();
                const newImageUrls = await generateImage(model, prompt, btnInteraction);
                const generationTime = Date.now() - startTime;

                if (!newImageUrls?.[0]) throw new Error('Generation failed');

                // Create success embed and components
                const successEmbed = ImageGenUtils.createEmbed({
                    title: CONSTANTS.MESSAGES.SUCCESS,
                    description: `<a:eh:1332327251253133383> **Prompt:** \`${prompt}\`\n<a:eh:1333357940341735464> **Model:** \`${model}\`\n<a:eh:1333357988953460807> **Time:** \`${generationTime}ms\``,
                    imageUrl: newImageUrls[0]
                });

                const newComponents = ImageGenUtils.createComponents(
                    newImageUrls[0],
                    regenerateId,
                    deleteId,
                    variationId
                );

                // Update with final result
                if (isDM) {
                    await btnInteraction.message.edit({
                        embeds: [successEmbed],
                        components: newComponents
                    });
                } else {
                    await btnInteraction.editReply({
                        embeds: [successEmbed],
                        components: newComponents
                    });
                }

            } catch (error) {
                console.error('Regeneration error:', error);
                const errorEmbed = ImageGenUtils.createEmbed({
                    title: CONSTANTS.MESSAGES.ERROR,
                    description: 'Change your prompt; the image models can be overly sensitive.',
                    color: '#FF0000',
                    isError: true
                });

                const updateOptions = {
                    embeds: [errorEmbed],
                    components: btnInteraction.message.components
                };

                if (isDMBased(btnInteraction.channel?.type)) {
                    await btnInteraction.message.edit(updateOptions).catch(console.error);
                } else {
                    await btnInteraction.editReply(updateOptions).catch(console.error);
                }
            }
        });

        // Register the delete button
        registerButton(deleteId, [userId], async (btnInteraction) => {
            try {
                await btnInteraction.deferUpdate();
                await btnInteraction.message.delete();
            } catch (error) {
                console.error('Delete error:', error);
            }
        });

        // Register the variation button
        registerButton(variationId, [userId], async (btnInteraction) => {
            try {
                await btnInteraction.deferUpdate();
                // ... variation logic (similar to regenerate) ...
            } catch (error) {
                console.error('Variation error:', error);
            }
        });

        return ImageGenUtils.createComponents(imageUrl, regenerateId, deleteId, variationId);
    }
}

// Export module
module.exports = {
    name: 'gen',
    data: new SlashCommandBuilder()
        .setName('gen')
        .setDescription('Generate stunning images using cool models')
        .setContexts([0, 2])
        .addStringOption(option =>
            option.setName('prompt')
                .setDescription('Image description')
                .setRequired(true))
        .addStringOption(option =>
            option.setName('model')
                .setDescription('Choose an AI model (type to search)')
                .setAutocomplete(true)
                .setRequired(false))
        .addStringOption(option =>
            option.setName('style')
                .setDescription('Apply a preset style to your image')
                .addChoices(
                    ...Object.entries(STYLE_PRESETS).map(([name, value]) => ({
                        name: name.charAt(0).toUpperCase() + name.slice(1),
                        value: name
                    }))
                )
                .setRequired(false))
        .addBooleanOption(option =>
            option.setName('ephemeral')
                .setDescription('Make the response visible only to you')
                .setRequired(false)),

    async execute(interaction) {
        try {
            // Check permissions first
            if (!checkPermissions(interaction)) return;
            
            const prompt = interaction.options.getString('prompt');
            const model = interaction.options.getString('model') || CONSTANTS.DEFAULT_MODEL;
            const userId = interaction.user.id;
            const isEphemeral = interaction.options.getBoolean('ephemeral') ?? false;

            // Cooldown check
            const now = Date.now();
            if (cooldowns.has(userId)) {
                const timeLeft = ((cooldowns.get(userId) + CONSTANTS.COOLDOWN_TIME - now) / 1000).toFixed(1);
                if (timeLeft > 0) {
                    return interaction.reply({
                        content: `⏳ Please wait ${timeLeft}s before using this command again.`,
                        flags: MessageFlags.Ephemeral
                    });
                }
            }

            // Defer the reply immediately
            await interaction.deferReply({
                ephemeral: isEphemeral
            });

            const style = interaction.options.getString('style');
            const enhancedPrompt = await ImageGenUtils.validatePrompt(prompt, style);

            // Queue management
            if (imageQueue.size >= CONSTANTS.MAX_CONCURRENT) {
                const position = imageQueue.size + 1;
                await interaction.editReply({
                    content: `🔄 Queue position: ${position}. Please wait...`
                });
                
                // Wait for queue position
                while (imageQueue.size >= CONSTANTS.MAX_CONCURRENT) {
                    await new Promise(r => setTimeout(r, 1000));
                }
            }

            imageQueue.set(userId, { prompt: enhancedPrompt, timestamp: Date.now() });

            // Update with generation message
            await interaction.editReply({
                content: CONSTANTS.INITIAL_MESSAGE
            });

            let retryCount = 0;
            let imageUrls;
            let generationTime;

            while (retryCount < CONSTANTS.MAX_RETRIES) {
                try {
                    const startTime = Date.now();
                    imageUrls = await generateImage(model, enhancedPrompt, interaction);
                    generationTime = Date.now() - startTime;

                    if (!Array.isArray(imageUrls) || !imageUrls.length) {
                        throw new Error('Failed to generate image');
                    }
                    break;
                } catch (error) {
                    retryCount++;
                    if (retryCount === CONSTANTS.MAX_RETRIES) throw error;
                    
                    await interaction.editReply({
                        content: `Retrying... Attempt ${retryCount}/${CONSTANTS.MAX_RETRIES}`
                    });
                    await new Promise(r => setTimeout(r, 2000));
                }
            }

            const components = await ButtonHandlers.createActionRows(imageUrls[0], userId, prompt, model);

            await interaction.editReply({
                content: null,
                embeds: [ImageGenUtils.createEmbed({
                    title: CONSTANTS.MESSAGES.SUCCESS,
                    description: `<a:eh:1332327251253133383> **Prompt:** \`${prompt}\`\n<a:eh:1333357940341735464> **Model:** \`${model}\`\n<a:eh:1333357988953460807> **Time:** \`${generationTime}ms\``,
                    imageUrl: imageUrls[0]
                })],
                components
            });

            // Set cooldown and cleanup
            cooldowns.set(userId, now);
            setTimeout(() => cooldowns.delete(userId), CONSTANTS.COOLDOWN_TIME);
            imageQueue.delete(userId);

        } catch (error) {
            console.error('Generation error:', error);
            
            try {
                const errorMessage = error.message.includes('Rate limit') ?
                    '⌛ Rate limit exceeded. Please try again in a few minutes.' :
                    error.message || 'Failed to generate image. Please try a different prompt or model.';

                const errorEmbed = ImageGenUtils.createEmbed({
                    title: 'Error',
                    description: errorMessage,
                    color: '#FF0000',
                    isError: true
                });

                if (interaction.deferred) {
                    await interaction.editReply({
                        content: null,
                        embeds: [errorEmbed],
                        components: []
                    });
                } else {
                    await interaction.reply({
                        embeds: [errorEmbed],
                        ephemeral: true,
                        flags: MessageFlags.Ephemeral
                    });
                }
            } catch (replyError) {
                console.error('Error handling error:', replyError);
            }

            // Cleanup on error
            imageQueue.delete(interaction.user.id);
        }
    },

    async autocomplete(interaction) {
        try {
            const focusedValue = interaction.options.getFocused().toLowerCase();
            const models = await ModelManager.getModels();
            const filtered = models
                .filter(model => model.toLowerCase().includes(focusedValue))
                .slice(0, 25);
            await interaction.respond(
                filtered.map(model => ({ name: model, value: model }))
            );
        } catch (error) {
            console.error('Autocomplete error:', error);
            await interaction.respond([]);
        }
    }
};