const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');

module.exports = {
    name: 'listemoji',
    description: 'Lists all emojis in the server with their details',
    data: new SlashCommandBuilder()
        .setName('listemoji')
        .setDescription('Lists all emojis in the server with their details'),        
    async execute(interaction) {
        try {
            await interaction.deferReply({ ephemeral: true });
            
            // Get all emojis from the server
            const emojis = [...interaction.guild.emojis.cache.values()];
            
            // If no emojis found
            if (emojis.length === 0) {
                return interaction.editReply("This server has no custom emojis!");
            }
            
            // Constants for embedding
            const EMOJIS_PER_EMBED = 15;
            const totalPages = Math.ceil(emojis.length / EMOJIS_PER_EMBED);
            const embeds = [];
            
            for (let i = 0; i < totalPages; i++) {
                const start = i * EMOJIS_PER_EMBED;
                const end = start + EMOJIS_PER_EMBED;
                const pageEmojis = emojis.slice(start, end);
                
                const emojiDetails = pageEmojis.map(emoji => {
                    const animated = emoji.animated ? '(Animated)' : '(Static)';
                    return `${emoji} \`${emoji.name}\` ${animated}\nID: \`${emoji.id}\``;
                }).join('\n');
                
                const embed = new EmbedBuilder()
                    .setColor('#2F3136')
                    .setTitle(`Server Emojis (Page ${i + 1}/${totalPages})`)
                    .setDescription(emojiDetails)
                    .setFooter({
                        text: `Total Emojis: ${emojis.length} • Page ${i + 1}/${totalPages}`
                    })
                    .setTimestamp();
                
                embeds.push(embed);
            }

            // Send initial reply with the first embed (ephemeral)
            await interaction.editReply({ embeds: [embeds[0]] });
            
            // Send remaining embeds as follow-up messages (ephemeral)
            for (let i = 1; i < embeds.length; i++) {
                await interaction.followUp({
                    embeds: [embeds[i]],
                    ephemeral: true
                });
            }
            
        } catch (error) {
            console.error('Error in listemoji command:', error);
            if (!interaction.replied && !interaction.deferred) {
                await interaction.reply({
                    content: 'An error occurred while listing emojis.',
                    ephemeral: true
                });
            } else {
                await interaction.editReply({
                    content: 'An error occurred while listing emojis.',
                    ephemeral: true
                });
            }
        }
    }
};