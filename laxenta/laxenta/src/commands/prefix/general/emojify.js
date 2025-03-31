const {
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
        await interaction.deferUpdate().catch(() => {
            console.warn("Interaction already deferred or expired.");
        });
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
    name: 'emojicopy',
    description: 'Lists and copies emojis from a specified server that the bot is in, like ONLY from any server that this bot is in',
    usage: 'emojicopy <server_id>',
    aliases: ['emojis', 'ec'],
    async execute(message, args) {
        try {
            if (!args[0]) {
                return message.reply('Please provide a server ID!');
            }

            // Fetch the target server
            const targetGuild = await message.client.guilds.fetch(args[0]).catch(() => null);
            if (!targetGuild) {
                return message.reply('❌ Invalid server ID or I\'m not in that server!');
            }

            // Fetch all emojis from the target server
            const emojis = await targetGuild.emojis.fetch();
            if (!emojis.size) {
                return message.reply('❌ No emojis found in that server!');
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
            let currentEmbed = new EmbedBuilder()
                .setColor(0x3498db)
                .setTitle(`📋 Emojis from ${targetGuild.name}`)
                .setTimestamp()
                .setFooter({
                    text: `Total Emojis: ${emojis.size} • Server ID: ${targetGuild.id}`,
                });

            // Add animated emoji chunks to embeds
            animatedChunks.forEach((chunk, i) => {
                if (currentEmbed.data.fields?.length >= 2) {
                    currentEmbed.setDescription(`Page ${embedIndex}/${animatedChunks.length + staticChunks.length}`);
                    embeds.push(currentEmbed);
                    currentEmbed = new EmbedBuilder()
                        .setColor(0x3498db)
                        .setTitle(`📋 Emojis from ${targetGuild.name} (Continued)`)
                        .setTimestamp()
                        .setFooter({
                            text: `Total Emojis: ${emojis.size} • Server ID: ${targetGuild.id}`,
                        });
                    embedIndex++;
                }
                currentEmbed.addFields([
                    {
                        name: `Animated Emojis (${categories.animated.length}) - Part ${i + 1}`,
                        value: chunk.join(' ') || 'No animated emojis',
                        inline: false
                    }
                ]);
            });

            // Add static emoji chunks to embeds
            staticChunks.forEach((chunk, i) => {
                if (currentEmbed.data.fields?.length >= 2) {
                    currentEmbed.setDescription(`Page ${embedIndex}/${animatedChunks.length + staticChunks.length}`);
                    embeds.push(currentEmbed);
                    currentEmbed = new EmbedBuilder()
                        .setColor(0x3498db)
                        .setTitle(`📋 Emojis from ${targetGuild.name} (Continued)`)
                        .setTimestamp()
                        .setFooter({
                            text: `Total Emojis: ${emojis.size} • Server ID: ${targetGuild.id}`,
                        });
                    embedIndex++;
                }
                currentEmbed.addFields([
                    {
                        name: `Static Emojis (${categories.static.length}) - Part ${i + 1}`,
                        value: chunk.join(' ') || 'No static emojis',
                        inline: false
                    }
                ]);
            });

            if (currentEmbed.data.fields?.length > 0) {
                currentEmbed.setDescription(`Page ${embedIndex}/${animatedChunks.length + staticChunks.length}`);
                embeds.push(currentEmbed);
            }

            // Create navigation buttons
            let currentPage = 0;
            // We'll also keep a reference to the embed that is currently shown.
            let displayedEmbed = embeds[currentPage];

const buttonRow = new ActionRowBuilder().addComponents([  // Added opening bracket here
    new ButtonBuilder()
        .setCustomId(`emojicopy_prev_${message.id}`)
        .setLabel('Previous')
        .setStyle(ButtonStyle.Secondary)
        .setEmoji('⬅️')
        .setDisabled(true),
    new ButtonBuilder()
        .setCustomId(`emojicopy_next_${message.id}`)
        .setLabel('Next')
        .setStyle(ButtonStyle.Secondary)
        .setEmoji('➡️')
        .setDisabled(currentPage >= embeds.length - 1),
    new ButtonBuilder()
        .setCustomId(`emojicopy_copy_${message.id}`)
        .setLabel('Add All Emojis')
        .setStyle(ButtonStyle.Primary)
        .setEmoji('➕'),
    new ButtonBuilder()
        .setCustomId(`emojicopy_delete_${message.id}`)
        .setLabel('Delete All')
        .setStyle(ButtonStyle.Danger)
        .setEmoji('🗑️')
]); // Added closing bracket here

            // Send initial embed
            const reply = await message.reply({
                embeds: [displayedEmbed],
                components: [buttonRow]
            });

            // Register pagination buttons (accessible to command user)
            registerButton(
                `emojicopy_prev_${message.id}`,
                [message.author.id],
                async (interaction) => {
                    try {
                        await deferSafe(interaction);
                        if (currentPage > 0) {
                            currentPage--;
                            const row = ActionRowBuilder.from(interaction.message.components[0]);
                            row.components[0].setDisabled(currentPage <= 0);
                            row.components[1].setDisabled(currentPage >= embeds.length - 1);
                            displayedEmbed = embeds[currentPage];
                            await editSafe(interaction, {
                                embeds: [displayedEmbed],
                                components: [row]
                            });
                        }
                    } catch (error) {
                        console.error('Previous page error:', error);
                    }
                },
                { globalCooldown: true }
            );

            registerButton(
                `emojicopy_next_${message.id}`,
                [message.author.id],
                async (interaction) => {
                    try {
                        await deferSafe(interaction);
                        if (currentPage < embeds.length - 1) {
                            currentPage++;
                            const row = ActionRowBuilder.from(interaction.message.components[0]);
                            row.components[0].setDisabled(currentPage <= 0);
                            row.components[1].setDisabled(currentPage >= embeds.length - 1);
                            displayedEmbed = embeds[currentPage];
                            await editSafe(interaction, {
                                embeds: [displayedEmbed],
                                components: [row]
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
                `emojicopy_copy_${message.id}`,
                [message.author.id],
                async (interaction) => {
                    try {
                        await deferSafe(interaction);
                        // Check permissions
                        if (!interaction.member.permissions.has(PermissionFlagsBits.ManageGuild)) {
                            await interaction.reply({
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
                        }[interaction.guild.premiumTier] || 50;

                        const currentEmojis = await interaction.guild.emojis.fetch();
                        const availableSlots = maxEmojis - currentEmojis.size;

                        if (availableSlots <= 0) {
                            await interaction.followUp({
                                content: '❌ No emoji slots available in this server!',
                                ephemeral: true
                            });
                            return;
                        }

                        // We'll use a temporary embed to show progress.
                        let progressEmbed = EmbedBuilder.from(displayedEmbed)
                            .setDescription(`Processing emojis...`);
                        await editSafe(interaction, { embeds: [progressEmbed], components: [buttonRow] });
                        
                        const addedEmojis = [];
                        const failedEmojis = [];
                        let skippedEmojis = 0;
                        const totalEmojis = Math.min(emojis.size, availableSlots);

                        let processedCount = 0;
                        // Loop through emojis
                        for (const [, emoji] of emojis.entries()) {
                            if (addedEmojis.length >= availableSlots) {
                                skippedEmojis = emojis.size - addedEmojis.length;
                                break;
                            }
                            processedCount++;
                            if (processedCount % 5 === 0) {
                                progressEmbed.setDescription(`Processing emojis... ${processedCount}/${totalEmojis}`);
                                await editSafe(interaction, { embeds: [progressEmbed], components: [buttonRow] });
                            }
                            try {
                                await interaction.guild.emojis.create({
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
                                value: addedEmojis.join(', ').slice(0, 1024) || 'None',
                                inline: false
                            });
                        }
                        if (failedEmojis.length > 0) {
                            resultEmbed.addFields({
                                name: '❌ Failed to Add',
                                value: failedEmojis.join(', ').slice(0, 1024) || 'None',
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

                        await editSafe(interaction, {
                            embeds: [resultEmbed],
                            components: [buttonRow],
                            content: null
                        });

                    } catch (error) {
                        console.error('Emoji copy error:', error);
                        await interaction.followUp({
                            content: '❌ An error occurred while adding emojis.',
                            ephemeral: true
                        });
                    }
                },
                { globalCooldown: true }
            );

            // Register delete button (admin only)
            registerButton(
                `emojicopy_delete_${message.id}`,
                [message.author.id],
                async (interaction) => {
                    try {
                        await deferSafe(interaction);
                        // Check permissions
                        if (!interaction.member.permissions.has(PermissionFlagsBits.ManageGuild)) {
                            await interaction.reply({
                                content: '❌ You need "Manage Server" permission to delete emojis!',
                                ephemeral: true
                            });
                            return;
                        }

                        // Build confirmation buttons
                        const confirmRow = new ActionRowBuilder().addComponents(
                            new ButtonBuilder()
                                .setCustomId(`emojicopy_delete_confirm_${message.id}`)
                                .setLabel('Confirm Delete')
                                .setStyle(ButtonStyle.Danger)
                                .setEmoji('⚠️'),
                            new ButtonBuilder()
                                .setCustomId(`emojicopy_delete_cancel_${message.id}`)
                                .setLabel('Cancel')
                                .setStyle(ButtonStyle.Secondary)
                        );

                        // Update embed for deletion confirmation
                        let deletionEmbed = EmbedBuilder.from(displayedEmbed)
                            .setColor(0xff0000)
                            .setTitle('⚠️ Confirm Deletion')
                            .setDescription(`Are you sure you want to delete all ${emojis.size} emojis from this server?`);

                        await editSafe(interaction, {
                            embeds: [deletionEmbed],
                            components: [confirmRow],
                        });

                        // Register confirmation buttons
                        registerButton(
                            `emojicopy_delete_confirm_${message.id}`,
                            [interaction.user.id],
                            async (confirmInteraction) => {
                                try {
                                    await deferSafe(confirmInteraction);
                                    let deletedCount = 0;
                                    let failedCount = 0;

                                    for (const [, emoji] of emojis.entries()) {
                                        try {
                                            await emoji.delete();
                                            deletedCount++;
                                            if (deletedCount % 5 === 0) {
                                                await editSafe(confirmInteraction, {
                                                    content: `Deleting emojis... ${deletedCount}/${emojis.size}`,
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
                            `emojicopy_delete_cancel_${message.id}`,
                            [interaction.user.id],
                            async (cancelInteraction) => {
                                await deferSafe(cancelInteraction);
                                await editSafe(cancelInteraction, {
                                    embeds: [embeds[currentPage]],
                                    components: [buttonRow],
                                    content: null
                                });
                            },
                            { globalCooldown: true }
                        );

                    } catch (error) {
                        console.error('Delete button error:', error);
                        await interaction.followUp({
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
            // Since this is a command (not an interaction), use message.reply
            message.reply({ content: 'An error occurred while processing your request.', ephemeral: true });
        }
    }
};