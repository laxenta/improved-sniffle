const {
    SlashCommandBuilder,
    EmbedBuilder,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    ComponentType
} = require('discord.js');

// Add cooldown map for queue additions
const queueCooldowns = new Map();

module.exports = {
    data: new SlashCommandBuilder()
        .setName('music')
        .setDescription('Music commands powered by Lavalink')
        .addSubcommand(subcommand =>
            subcommand
                .setName('play')
                .setDescription('Play a song from various sources')
                .addStringOption(option =>
                    option.setName('query')
                        .setDescription('Song name or URL (supports many sources)')
                        .setRequired(true)
                )
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('filter')
                .setDescription('Apply audio filters')
                .addStringOption(option =>
                    option.setName('type')
                        .setDescription('Filter to apply')
                        .setRequired(true)
                        .addChoices(
                            { name: 'Equalizer', value: 'equalizer' },
                            { name: 'Karaoke', value: 'karaoke' },
                            { name: 'Timescale', value: 'timescale' },
                            { name: 'Tremolo', value: 'tremolo' },
                            { name: 'Vibrato', value: 'vibrato' },
                            { name: 'Distortion', value: 'distortion' },
                            { name: 'Rotation', value: 'rotation' },
                            { name: 'Channel Mix', value: 'channelMix' },
                            { name: 'Low Pass', value: 'lowPass' },
                            { name: 'Dolby Spatial', value: 'dolbySpatial' },
                            { name: '8D Audio', value: '8d' },
                            { name: 'Clear Filters', value: 'clear' }
                        )
                )
        )
        .addSubcommand(subcommand =>
            subcommand.setName('skip').setDescription('Skip the current song')
        )
        .addSubcommand(subcommand =>
            subcommand.setName('stop').setDescription('Stop the music and clear the queue')
        )
        .addSubcommand(subcommand =>
            subcommand.setName('queue').setDescription('Display the current queue')
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('loop')
                .setDescription('Set loop mode')
                .addStringOption(option =>
                    option
                        .setName('mode')
                        .setDescription('Loop mode: Off, Song, or Queue')
                        .setRequired(true)
                        .addChoices(
                            { name: 'Off', value: '0' },
                            { name: 'Song', value: '1' },
                            { name: 'Queue', value: '2' }
                        )
                )
        )
        .addSubcommand(subcommand =>
            subcommand.setName('shuffle').setDescription('Shuffle the queue')
        )
        .addSubcommand(subcommand =>
            subcommand.setName('nowplaying').setDescription('Display the currently playing song')
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('volume')
                .setDescription('Set the volume')
                .addIntegerOption(option =>
                    option
                        .setName('percent')
                        .setDescription('Volume percentage (0-100)')
                        .setRequired(true)
                )
        ),

    async execute(interaction) {
        const sub = interaction.options.getSubcommand();
        const { client } = interaction;

        if (!client.manager) {
            return interaction.reply({ content: 'Lavalink system is not configured!', ephemeral: true });
        }

        const member = interaction.member;
        const voiceChannel = member.voice?.channel;
        if (!voiceChannel) {
            return interaction.reply({ content: 'You need to be in a voice channel!', ephemeral: true });
        }

        try {
            let player = client.manager.players.get(interaction.guildId);
            const guildId = interaction.guildId;
            const now = Date.now();

            if (sub === 'play') {
                const query = interaction.options.getString('query');
                await interaction.deferReply({ ephemeral: true });

                // Cooldown handling: limit to 5 additions every 10 seconds per guild
                const cooldown = queueCooldowns.get(guildId) || { count: 0, timestamp: now };
                if (now - cooldown.timestamp < 10000 && cooldown.count >= 5) {
                    return interaction.editReply({ content: '⚠️ Queue addition rate limit reached! Please wait a few seconds.' });
                }

                // Create player if not exists
                if (!player) {
                    player = client.manager.create({
                        guild: guildId,
                        voiceChannel: voiceChannel.id,
                        textChannel: interaction.channelId,
                        selfDeafen: true,
                    });
                }
                if (!player.connected) await player.connect();

                // Search for track(s)
                const res = await client.manager.search(query, interaction.user);
                if (res.loadType === "LOAD_FAILED") {
                    return interaction.editReply({ content: "❌ Error loading track!" });
                }

                if (res.loadType === "SEARCH_RESULT") {
                    const tracks = res.tracks.slice(0, 5);
                    const row = new ActionRowBuilder().addComponents(
                        tracks.map((_, i) =>
                            new ButtonBuilder()
                                .setCustomId(`select_${i}`)
                                .setLabel(`${i + 1}`)
                                .setStyle(ButtonStyle.Primary)
                        )
                    );

                    const embed = new EmbedBuilder()
                        .setTitle('🔍 Search Results')
                        .setDescription(
                            tracks.map((t, i) =>
                                `**${i + 1}.** [${t.title}](${t.uri})\n└ ${t.author} - \`${formatTime(t.duration)}\``
                            ).join('\n\n')
                        )
                        .setColor('#5865F2')
                        .setFooter({ text: 'Select a track by clicking one of the buttons below. (Expires in 15 seconds)' });

                    const msg = await interaction.editReply({ embeds: [embed], components: [row] });
                    const collector = msg.createMessageComponentCollector({
                        componentType: ComponentType.Button,
                        time: 15000
                    });

                    collector.on('collect', async i => {
                        if (i.user.id !== interaction.user.id) return;
                        const index = parseInt(i.customId.split('_')[1]);
                        const track = tracks[index];

                        // Update cooldown
                        cooldown.count = (cooldown.count || 0) + 1;
                        cooldown.timestamp = now;
                        queueCooldowns.set(guildId, cooldown);

                        player.queue.add(track);
                        await i.update({ content: `🎵 Added to queue: \`${track.title}\``, embeds: [], components: [] });
                        if (!player.playing && !player.paused) player.play();
                        collector.stop();
                    });

                    collector.on('end', collected => {
                        if (!collected.size && !msg.deleted) {
                            interaction.editReply({ content: '⏱️ Search results expired.', components: [] });
                        }
                    });
                    return;
                }

                // Handle other load types
                switch (res.loadType) {
                    case "NO_MATCHES":
                        return interaction.editReply({ content: "❌ No matches found!" });
                    case "TRACK_LOADED":
                        player.queue.add(res.tracks[0]);
                        await interaction.editReply({ content: `🎵 Queued: \`${res.tracks[0].title}\`` });
                        break;
                    case "PLAYLIST_LOADED":
                        player.queue.add(res.tracks);
                        await interaction.editReply({ content: `📜 Queued ${res.tracks.length} tracks from playlist \`${res.playlist.name}\`` });
                        break;
                }
                if (!player.playing && !player.paused) player.play();
            }

            else if (sub === 'filter') {
                if (!player) {
                    return interaction.reply({ content: 'Nothing is playing!', ephemeral: true });
                }

                const filterType = interaction.options.getString('type');

                // Clear all filters
                if (filterType === 'clear') {
                    player.clearEQ();
                    player.node.send({
                        op: 'filters',
                        guildId: player.guild,
                        ...getDefaultFilters()
                    });
                    return interaction.reply({ content: '🎛️ Cleared all filters!', ephemeral: true });
                }

                try {
                    // Get filter settings
                    const filterSettings = getFilterSettings(filterType);

                    // Handle special cases that need multiple filter settings at once
                    if (filterType === '8d') {
                        const settings = filterSettings;
                        player.setEQ(settings.equalizer);
                        player.node.send({
                            op: 'filters',
                            guildId: player.guild,
                            rotation: settings.rotation,
                            timescale: settings.timescale,
                            channelMix: settings.channelMix,
                            tremolo: settings.tremolo
                        });
                        return interaction.reply({ content: '🎧 Applied enhanced 8D Audio effect!', ephemeral: true });
                    }

                    if (filterType === 'dolbySpatial') {
                        const settings = filterSettings;
                        player.setEQ(settings.equalizer);
                        player.node.send({
                            op: 'filters',
                            guildId: player.guild,
                            rotation: settings.rotation,
                            timescale: settings.timescale,
                            channelMix: settings.channelMix,
                            reverb: settings.reverb // Adding reverb support
                        });
                        return interaction.reply({ content: '🎧 Applied Dolby Spatial audio effect!', ephemeral: true });
                    }

                    // Apply the filter based on type
                    switch (filterType) {
                        case 'equalizer':
                            player.setEQ(filterSettings);
                            break;
                        default:
                            // For all other filter types
                            player.node.send({
                                op: 'filters',
                                guildId: player.guild,
                                [filterType]: filterSettings
                            });
                            break;
                    }

                    return interaction.reply({ content: `🎛️ Applied ${filterType} filter!`, ephemeral: true });
                } catch (error) {
                    console.error('Filter error:', error);
                    return interaction.reply({ content: `❌ Failed to apply filter: ${error.message}`, ephemeral: true });
                }
            }
            else if (sub === 'skip') {
                if (!player || !player.queue.current) {
                    return interaction.reply({ content: 'There is nothing playing!', ephemeral: true });
                }
                player.stop();
                return interaction.reply({ content: '⏩ Skipped the current song!', ephemeral: true });
            }
            else if (sub === 'stop') {
                if (!player) {
                    return interaction.reply({ content: '❌ There is nothing playing!', ephemeral: true });
                }
                player.destroy();
                return interaction.reply({ content: '⏹️ Stopped the music and cleared the queue.', ephemeral: true });
            }
            else if (sub === 'queue') {
                if (!player || !player.queue.size) {
                    return interaction.reply({ content: '❌ The queue is empty!', ephemeral: true });
                }
                const queueEmbed = new EmbedBuilder()
                    .setTitle('🎵 Music Queue')
                    .setDescription(
                        player.queue.map((track, index) =>
                            `**${index + 1}.** ${track.title} - \`${track.duration}\``
                        ).join('\n')
                    )
                    .setFooter({ text: `Now playing: ${player.queue.current.title}` })
                    .setColor('#5865F2');
                return interaction.reply({ embeds: [queueEmbed], ephemeral: true });
            }
            else if (sub === 'loop') {
                if (!player) {
                    return interaction.reply({ content: '❌ There is nothing playing!', ephemeral: true });
                }
                const mode = parseInt(interaction.options.getString('mode'));
                const modeNames = ['Off', 'Repeat Song', 'Repeat Queue'];

                // Fix: Use the correct method and enum for loop modes
                switch (mode) {
                    case 0: // Off
                        player.setQueueRepeat(false);
                        player.setTrackRepeat(false);
                        break;
                    case 1: // Song
                        player.setQueueRepeat(false);
                        player.setTrackRepeat(true);
                        break;
                    case 2: // Queue
                        player.setTrackRepeat(false);
                        player.setQueueRepeat(true);
                        break;
                }

                return interaction.reply({ content: `🔁 Loop mode set to **${modeNames[mode]}**.`, ephemeral: true });
            }
            else if (sub === 'shuffle') {
                if (!player || !player.queue.size) {
                    return interaction.reply({ content: '❌ There is nothing playing!', ephemeral: true });
                }
                player.queue.shuffle();
                return interaction.reply({ content: '🔀 Shuffled the queue!', ephemeral: true });
            }
            else if (sub === 'nowplaying') {
                if (!player || !player.queue.current) {
                    return interaction.reply({ content: '❌ There is nothing playing!', ephemeral: true });
                }
                const currentTrack = player.queue.current;
                const npEmbed = new EmbedBuilder()
                    .setTitle('🎵 Now Playing')
                    .setDescription(`[${currentTrack.title}](${currentTrack.uri})\n**Duration:** \`${currentTrack.duration}\``)
                    .setThumbnail(currentTrack.thumbnail || '')
                    .setColor('#5865F2');
                return interaction.reply({ embeds: [npEmbed], ephemeral: true });
            }
            else if (sub === 'volume') {
                if (!player) {
                    return interaction.reply({ content: '❌ There is nothing playing!', ephemeral: true });
                }
                const volume = interaction.options.getInteger('percent');
                if (volume < 0 || volume > 100) {
                    return interaction.reply({ content: 'Volume must be between 0 and 100.', ephemeral: true });
                }
                player.setVolume(volume);
                return interaction.reply({ content: `🔊 Volume set to ${volume}%!`, ephemeral: true });
            }
        } catch (error) {
            console.error('Music command error:', error);
            const reply = { content: `❌ Error: ${error.message}`, ephemeral: true };
            if (interaction.deferred) {
                interaction.editReply(reply);
            } else {
                interaction.reply(reply);
            }
        }
    }
};

function getFilterSettings(type) {
    const filters = {
        equalizer: [
            { band: 0, gain: 0.25 },
            { band: 1, gain: 0.25 },
            { band: 2, gain: 0.25 },
            { band: 3, gain: 0.25 },
            { band: 4, gain: 0.25 },
            { band: 5, gain: 0.25 },
            { band: 6, gain: 0.25 },
            { band: 7, gain: 0.25 },
            { band: 8, gain: 0.25 },
            { band: 9, gain: 0.25 }
        ],
        karaoke: {
            level: 1.0,
            monoLevel: 1.0,
            filterBand: 220.0,
            filterWidth: 100.0
        },
        timescale: {
            speed: 1.1,
            pitch: 1.1,
            rate: 1.0
        },
        tremolo: {
            frequency: 2.0,
            depth: 0.5
        },
        vibrato: {
            frequency: 2.0,
            depth: 0.5
        },
        distortion: {
            sinOffset: 0,
            sinScale: 1,
            cosOffset: 0,
            cosScale: 1,
            tanOffset: 0,
            tanScale: 1,
            offset: 0,
            scale: 1
        },
        rotation: {
            rotationHz: 0.2
        },
        channelMix: {
            leftToLeft: 1.0,
            leftToRight: 0.0,
            rightToLeft: 0.0,
            rightToRight: 1.0
        },
        lowPass: {
            smoothing: 20.0
        },
        '8d': {
            rotation: {
                rotationHz: 0.25  // Slightly slower rotation for less dizziness
            },
            timescale: {
                pitch: 1.03,  // More subtle pitch increase
                rate: 1.0,    // Normal speed
                speed: 1.0    // Normal speed
            },
            channelMix: {
                leftToLeft: 0.85,    // Still good stereo separation but less extreme
                leftToRight: 0.15,   // Increased crossover for smoother effect
                rightToLeft: 0.15,
                rightToRight: 0.85
            },
            equalizer: [
                // Gentler EQ curve overall
                { band: 0, gain: 0.0 },    // Neutral bass
                { band: 1, gain: 0.05 },
                { band: 2, gain: 0.1 },
                { band: 3, gain: 0.15 },
                { band: 4, gain: 0.2 },    // Less aggressive mids
                { band: 5, gain: 0.2 },
                { band: 6, gain: 0.15 },
                { band: 7, gain: 0.1 },
                { band: 8, gain: 0.05 },   // More restrained highs
                { band: 9, gain: 0.0 }     // Neutral super highs
            ],
            tremolo: {
                frequency: 0.35,  // Smoother wave
                depth: 0.2        // Less intense effect
            }
        },
        dolbySpatial: {
            rotation: {
                rotationHz: 0.1
            },
            timescale: {
                pitch: 1.0,
                rate: 1.0,
                speed: 1.0
            },
            channelMix: {
                leftToLeft: 0.9,
                leftToRight: 0.2,
                rightToLeft: 0.2,
                rightToRight: 0.9
            },
            equalizer: [
                { band: 0, gain: 0.2 },
                { band: 1, gain: 0.1 },
                { band: 2, gain: 0.0 },
                { band: 3, gain: -0.1 },
                { band: 4, gain: -0.1 },
                { band: 5, gain: 0.0 },
                { band: 6, gain: 0.3 },
                { band: 7, gain: 0.4 },
                { band: 8, gain: 0.3 },
                { band: 9, gain: 0.2 }
            ],
            reverb: {
                roomSize: 0.6,
                damping: 0.4,
                wetLevel: 0.25,
                dryLevel: 0.8,
                width: 1.0,
                lowCutoff: 100,
                highCutoff: 12000
            }
        }
    };
    return filters[type];
}

function formatTime(ms) {
    const seconds = Math.floor((ms / 1000) % 60);
    const minutes = Math.floor((ms / (1000 * 60)) % 60);
    const hours = Math.floor(ms / (1000 * 60 * 60));
    return hours > 0
        ? `${hours}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`
        : `${minutes}:${seconds.toString().padStart(2, '0')}`;
}


// Add this function at the bottom of the file
function getDefaultFilters() {
    return {
        volume: 1.0,
        equalizer: [],
        karaoke: null,
        timescale: null,
        tremolo: null,
        vibrato: null,
        rotation: null,
        distortion: null,
        channelMix: null,
        lowPass: null
    };
}