const { Manager } = require('erela.js');
const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');

module.exports = (client) => {
    client.manager = new Manager({
        nodes: [
            {
                identifier: "Public Lavalink v3",
                host: "lava-v3.ajieblogs.eu.org",
                port: 443,
                password: "https://dsc.gg/ajidevserver",
                secure: true,
                retryAmount: 5,
                retryDelay: 3000,
                requestTimeout: 10000,
                // Add these options
                options: {
                    youtubeSearchEnabled: true,
                    spotifySearchEnabled: true
                }
            }
        ],
        // Add these options
        autoPlay: true,
        send: (id, payload) => {
            const guild = client.guilds.cache.get(id);
            if (guild) guild.shard.send(payload);
        }
    });

    client.manager.on("nodeConnect", node => {
        console.log(`✅ Node "${node.options.identifier}" connected successfully!`);
    });

    client.manager.on("nodeError", (node, error) => {
        console.log(`❌ Node "${node.options.identifier}" encountered an error: ${error.message}`);
    });

    client.manager.on("trackError", (player, track, payload) => {
        console.error('Track error:', payload);
        const channel = client.channels.cache.get(player.textChannel);
        if (channel?.permissionsFor(client.user)?.has('SendMessages')) {
            channel.send(`❌ Error playing "${track.title}": ${payload.error || 'Unknown error'}`);
        }
    });

    client.manager.on("queueEnd", player => {
        const channel = client.channels.cache.get(player.textChannel);
        if (channel?.permissionsFor(client.user)?.has('SendMessages')) {
            channel.send('✅ Queue finished!');
        }
        player.destroy();
    });

    client.manager.on("trackStart", async (player, track) => {
        try {
            // Update player state first
            player.playing = true;
            
            // Update existing channel embed logic
            const channel = client.channels.cache.get(player.textChannel);
            if (!channel?.permissionsFor(client.user)?.has('SendMessages')) return;

            const embed = new EmbedBuilder()
                .setColor('#1DB954')
                .setTitle('Now Playing')
                .setDescription(`[${track.title}](${track.uri})`)
                .addFields(
                    { name: 'Author', value: track.author, inline: true },
                    { name: 'Duration', value: formatTime(track.duration), inline: true }
                )
                .setThumbnail(track.thumbnail);

            const row = new ActionRowBuilder()
                .addComponents(
                    new ButtonBuilder()
                        .setCustomId('pause')
                        .setLabel(player.playing ? 'Pause' : 'Resume')
                        .setStyle(ButtonStyle.Primary),
                    new ButtonBuilder()
                        .setCustomId('skip')
                        .setLabel('Skip')
                        .setStyle(ButtonStyle.Secondary),
                    new ButtonBuilder()
                        .setCustomId('stop')
                        .setLabel('Stop')
                        .setStyle(ButtonStyle.Danger)
                );

            await channel.send({ embeds: [embed], components: [row] });

            // Emit event for dashboard
            client.emit('playerUpdate', player);
        } catch (error) {
            console.error('TrackStart handler error:', error);
        }
    });

    // Add track update event
    client.manager.on("playerUpdate", (player) => {
        client.emit('playerUpdate', player);
    });

    client.once("ready", () => {
        console.log("🚀 Bot is ready! Initializing Lavalink...");
        client.manager.init(client.user.id);
    });

    client.on("raw", d => client.manager.updateVoiceState(d));
};

function createNowPlayingEmbed(track, player) {
    const { title, uri, duration, author, sourceName, requester, thumbnail } = track;
    const position = player.position;
    const timeLeft = duration - position;

    return new EmbedBuilder()
        .setColor('#1DB954')
        .setTitle('Now Playing')
        .setDescription(
            `[${title}](${uri})\n\n` +
            `Time: \`${formatTime(position)} / ${formatTime(duration)}\`\n` +
            `Ends in: \`${formatTime(timeLeft)}\`\n` +
            `Queue: \`${player.queue.size} tracks\``
        )
        .addFields(
            { name: 'Author', value: author, inline: true },
            { name: 'Source', value: sourceName, inline: true }
        )
        .setThumbnail(thumbnail || null)
        .setFooter({ text: `Requested by ${requester.tag}` });
}

function getActiveFilters(player) {
    if (!player) return [];
    
    const filters = [];
    if (player.volume && player.volume !== 100) filters.push(`Volume: ${player.volume}%`);
    if (player.equalizer && player.equalizer.length > 0) filters.push('EQ');
    
    const filterKeys = [
        'karaoke', 'timescale', 'tremolo', 'vibrato', 
        'distortion', 'rotation', 'channelMix', 'lowPass'
    ];
    
    filterKeys.forEach(key => {
        if (player.filters && player.filters[key]) filters.push(capitalize(key));
    });
    
    return filters;
}

function capitalize(str) {
    return str.charAt(0).toUpperCase() + str.slice(1);
}

function formatTime(ms) {
    const seconds = Math.floor((ms / 1000) % 60);
    const minutes = Math.floor((ms / (1000 * 60)) % 60);
    const hours = Math.floor(ms / (1000 * 60 * 60));

    return hours > 0 
        ? `${hours}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`
        : `${minutes}:${seconds.toString().padStart(2, '0')}`;
}
