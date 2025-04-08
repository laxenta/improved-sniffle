const { 
    SlashCommandBuilder, 
    EmbedBuilder, 
    ActionRowBuilder, 
    ButtonBuilder, 
    ButtonStyle,
    StringSelectMenuBuilder,
    ModalBuilder,
    TextInputBuilder,
    TextInputStyle
} = require('discord.js');
const SpotifyWebApi = require('spotify-web-api-node');
const User = require('../../../models/User');
const crypto = require('crypto');
const ytsr = require('ytsr');

// Add global cooldown manager
const guildCooldowns = new Map();

// Cooldown configuration
const COOLDOWN_CONFIG = {
    QUEUE_ADD: { time: 10000, limit: 5 }, // 5 songs per 10 secondsd
    BUTTON_CLICK: { time: 2000, limit: 1 } // 1 click per 2 seconds
};

// Cooldown check function
function isOnCooldown(guildId, type) {
    const now = Date.now();
    const cooldown = guildCooldowns.get(guildId) || {};
    const typeCooldown = cooldown[type] || { count: 0, timestamp: 0 };

    if (now - typeCooldown.timestamp < COOLDOWN_CONFIG[type].time) {
        if (typeCooldown.count >= COOLDOWN_CONFIG[type].limit) {
            return true;
        }
    } else {
        typeCooldown.count = 0;
        typeCooldown.timestamp = now;
    }

    typeCooldown.count++;
    cooldown[type] = typeCooldown;
    guildCooldowns.set(guildId, cooldown);
    return false;
}

// Helper function to get queue from Lavalink
function getQueue(client, guildId) {
    return client.manager.players.get(guildId);
}

// Safe track loading function
async function loadTrack(client, query, requester) {
    try {
        const cleanQuery = query.replace(/[^\w\s-]/g, '').trim();
        if (!cleanQuery) throw new Error('Invalid query');

        const res = await client.manager.search(cleanQuery, requester);
        return res.tracks[0];
    } catch (error) {
        console.error('Track load error:', error);
        return null;
    }
}

// Update playSong function to use Lavalink instead of DisTube
async function playSong(client, voiceChannel, textChannel, song) {
    try {
        const player = client.manager.create({
            guild: voiceChannel.guild.id,
            voiceChannel: voiceChannel.id,
            textChannel: textChannel.id,
        });

        // Connect to voice channel if not connected
        if (!player.connected) {
            player.connect();
        }

        const cleanQuery = `${song.name} ${song.artists}`.replace(/[^\w\s]/g, '');
        const res = await client.manager.search(cleanQuery, textChannel.guild.members.cache.get(client.user.id));

        if (res.loadType === 'LOAD_FAILED') {
            throw new Error('Error loading track');
        }

        if (res.loadType === 'NO_MATCHES') {
            throw new Error('No matches found');
        }

        const track = res.tracks[0];
        player.queue.add(track);

        if (!player.playing) {
            player.play();
        }

        return true;
    } catch (error) {
        console.error('Error playing song:', error);
        return false;
    }
}

// Helper function to create song embeds with pagination
async function createSongEmbed(songs, page = 0, type = 'Liked Songs') {
    const songsPerPage = 6; // Reduced to 6 songs per page
    const totalPages = Math.ceil(songs.length / songsPerPage);
    const start = page * songsPerPage;
    const end = start + songsPerPage;
    const currentSongs = songs.slice(start, end);

    const embed = new EmbedBuilder()
        .setColor('#1DB954')
        .setTitle(`🎵 ${type} (Page ${page + 1}/${totalPages})`)
        .setDescription(currentSongs.map((song, i) => 
            `${start + i + 1}. ${song.name} - ${song.artists}`
        ).join('\n'))
        .setFooter({ text: `Total songs: ${songs.length}` });

    return {
        embed,
        totalPages,
        currentPage: page,
        currentSongs
    };
}

// Add this helper function after the existing helper functions
function createSpotifyConnectEmbed(client, sessionToken) {
    const dashboardUrl = `${process.env.NGROK_URL}/dashboard?token=${sessionToken}`;
    
    const connectEmbed = new EmbedBuilder()
        .setColor('#1DB954')
        .setTitle('Connect Your Spotify')
        .setDescription('Please reconnect your Spotify account to continue!')
        .addFields(
            { name: 'How to Connect', value: '1. Click the button below\n2. Login with Spotify\n3. Try the command again' }
        )
        .setThumbnail('https://cdn.discordapp.com/emojis/1106364752646209577.webp?size=96&quality=lossless');

    const row = new ActionRowBuilder()
        .addComponents(
            new ButtonBuilder()
                .setLabel('Connect Spotify')
                .setStyle(ButtonStyle.Link)
                .setURL(dashboardUrl)
        );

    return { embeds: [connectEmbed], components: [row], ephemeral: true };
}

// Add formatTime helper function
function formatTime(ms) {
    const seconds = Math.floor((ms / 1000) % 60);
    const minutes = Math.floor((ms / (1000 * 60)) % 60);
    const hours = Math.floor(ms / (1000 * 60 * 60));

    return hours > 0 
        ? `${hours}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`
        : `${minutes}:${seconds.toString().padStart(2, '0')}`;
}

// Update Spotify token refresh
async function refreshSpotifyToken(spotifyApi, user) {
    try {
        if (!user.spotify?.refreshToken) {
            throw new Error('No refresh token available');
        }

        spotifyApi.setRefreshToken(user.spotify.refreshToken);
        const data = await spotifyApi.refreshAccessToken();
        
        // Update user document
        user.spotify = {
            ...user.spotify,
            accessToken: data.body.access_token,
            expiresAt: new Date(Date.now() + (data.body.expires_in * 1000))
        };
        await user.save();

        return true;
    } catch (error) {
        console.error('Token refresh error:', error);
        // Clear invalid tokens
        user.spotify = undefined;
        await user.save();
        return false;
    }
}

// Enhanced play handler
async function handleSpotifyPlay(interaction, tracks, type = 'playlist') {
    const { client, guildId, member } = interaction;
    
    if (isOnCooldown(guildId, 'QUEUE_ADD')) {
        return interaction.editReply('⚠️ Please wait a few seconds before adding more tracks.');
    }

    let player = client.manager.players.get(guildId);
    if (!player) {
        player = client.manager.create({
            guild: guildId,
            voiceChannel: member.voice.channel.id,
            textChannel: interaction.channelId,
            selfDeafen: true
        });
    }

    if (!player.connected) await player.connect();

    const loadingEmbed = new EmbedBuilder()
        .setColor('#1DB954')
        .setTitle('Loading Tracks')
        .setDescription(`🎵 Loading ${type === 'playlist' ? 'playlist' : 'tracks'}...`);

    await interaction.editReply({ embeds: [loadingEmbed] });

    // Queue processor with rate limiting
    const queueProcessor = async () => {
        for (const track of tracks) {
            if (!player.connected) break;

            const cleanQuery = `${track.name} ${track.artists}`;
            const loadedTrack = await loadTrack(client, cleanQuery, interaction.user);
            
            if (loadedTrack) {
                player.queue.add(loadedTrack);
                if (!player.playing && !player.paused && player.queue.size === 1) {
                    player.play();
                }
            }

            // Rate limiting delay
            await new Promise(resolve => setTimeout(resolve, 800));
        }

        const successEmbed = new EmbedBuilder()
            .setColor('#1DB954')
            .setTitle('✅ Queue Updated')
            .setDescription(`Added ${tracks.length} tracks to the queue`);

        await interaction.editReply({ embeds: [successEmbed] });
    };

    queueProcessor().catch(console.error);
}

// Track selection menu creator
async function createTrackSelectionMenu(interaction, tracks) {
    const row = new ActionRowBuilder().addComponents(
        tracks.slice(0, 5).map((_, i) => 
            new ButtonBuilder()
                .setCustomId(`select_${i}`)
                .setLabel(`${i + 1}`)
                .setStyle(ButtonStyle.Primary)
        )
    );

    const embed = new EmbedBuilder()
        .setColor('#1DB954')
        .setTitle('🔍 Search Results')
        .setDescription(
            tracks.slice(0, 5).map((t, i) => 
                `**${i + 1}.** ${t.name}\n└ ${t.artists} - \`${t.duration}\``
            ).join('\n\n')
        );

    return { embeds: [embed], components: [row], ephemeral: true };
}

// Add constants for pagination
const SONGS_PER_PAGE = 8;
const MAX_BUTTONS = 8;

async function handlePlaylistDisplay(interaction, tracks, type) {
    let currentPage = 0;
    const itemsPerPage = SONGS_PER_PAGE;
    const pages = Math.ceil(tracks.length / itemsPerPage);

    const getEmbed = (page) => {
        const start = page * itemsPerPage;
        const pageItems = tracks.slice(start, start + itemsPerPage);

        return new EmbedBuilder()
            .setColor('#1DB954')
            .setTitle(`🎵 ${type}`)
            .setDescription(
                pageItems.map((t, i) => 
                    `**${start + i + 1}.** ${t.name}\n└ ${t.artists} - ${t.duration}`
                ).join('\n\n')
            )
            .setFooter({ text: `Page ${page + 1}/${pages} • Total: ${tracks.length} tracks` });
    };

    const getComponents = (page) => {
        const rows = [];
        const start = page * itemsPerPage;
        const pageItems = tracks.slice(start, start + itemsPerPage);

        // Track selection buttons
        const selectionButtons = pageItems.map((_, i) => 
            new ButtonBuilder()
                .setCustomId(`select_${start + i}`)
                .setLabel(`${start + i + 1}`)
                .setStyle(ButtonStyle.Primary)
        );

        // Split buttons into rows of 4
        for (let i = 0; i < selectionButtons.length; i += 4) {
            rows.push(new ActionRowBuilder().addComponents(selectionButtons.slice(i, i + 4)));
        }

        // Navigation row
        const navigationRow = new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setCustomId('prev')
                .setLabel('◀')
                .setStyle(ButtonStyle.Secondary)
                .setDisabled(page === 0),
            new ButtonBuilder()
                .setCustomId('next')
                .setLabel('▶')
                .setStyle(ButtonStyle.Secondary)
                .setDisabled(page >= pages - 1),
            new ButtonBuilder()
                .setCustomId('play_all')
                .setLabel('Play All')
                .setStyle(ButtonStyle.Success)
        );
        rows.push(navigationRow);

        return rows;
    };

    const msg = await interaction.editReply({
        embeds: [getEmbed(currentPage)],
        components: getComponents(currentPage)
    });

    const collector = msg.createMessageComponentCollector({ time: 300000 });

    collector.on('collect', async (i) => {
        if (i.user.id !== interaction.user.id) {
            return i.reply({ content: 'This menu is not for you!', ephemeral: true });
        }

        await i.deferUpdate();

        if (i.customId === 'prev') {
            currentPage = Math.max(0, currentPage - 1);
            await msg.edit({
                embeds: [getEmbed(currentPage)],
                components: getComponents(currentPage)
            });
        } else if (i.customId === 'next') {
            currentPage = Math.min(pages - 1, currentPage + 1);
            await msg.edit({
                embeds: [getEmbed(currentPage)],
                components: getComponents(currentPage)
            });
        } else if (i.customId === 'play_all') {
            await handleSpotifyPlay(interaction, tracks);
        } else if (i.customId.startsWith('select_')) {
            const index = parseInt(i.customId.split('_')[1]);
            const selectedTrack = tracks[index];
            await showTrackOptions(interaction, selectedTrack);
        }
    });

    collector.on('end', () => {
        msg.edit({ components: [] }).catch(() => {});
    });
}

async function showTrackOptions(interaction, track) {
    const query = `${track.name} ${track.artists}`;
    const results = await interaction.client.manager.search(query);

    if (!results || results.tracks.length === 0) {
        return interaction.followUp({
            content: '❌ No matches found!',
            ephemeral: true
        });
    }

    const tracks = results.tracks.slice(0, 5); // Limit to 5 tracks to stay within button limit
    const row = new ActionRowBuilder().addComponents(
        tracks.map((_, i) => 
            new ButtonBuilder()
                .setCustomId(`play_${i}`)
                .setLabel(`${i + 1}`)
                .setStyle(ButtonStyle.Primary)
        )
    );

    const embed = new EmbedBuilder()
        .setColor('#1DB954')
        .setTitle('🔍 Select a Track')
        .setDescription(
            tracks.map((t, i) => 
                `**${i + 1}.** ${t.title}\n└ ${t.author} - \`${formatTime(t.duration)}\``
            ).join('\n\n')
        );

    const msg = await interaction.followUp({
        embeds: [embed],
        components: [row],
        ephemeral: true
    });

    const collector = msg.createMessageComponentCollector({ time: 15000 });
    collector.on('collect', async i => {
        if (i.user.id !== interaction.user.id) return;

        const index = parseInt(i.customId.split('_')[1]);
        const selectedTrack = tracks[index];

        const player = interaction.client.manager.players.get(interaction.guildId) || 
            interaction.client.manager.create({
                guild: interaction.guildId,
                voiceChannel: interaction.member.voice.channel.id,
                textChannel: interaction.channelId,
            });

        if (!player.connected) {
            await player.connect();
        }

        player.queue.add(selectedTrack);
        if (!player.playing && !player.paused) {
            player.play();
        }

        await i.update({
            content: `✅ Added to queue: ${selectedTrack.title}`,
            embeds: [],
            components: []
        });
    });
}

async function handleSpotifyCommand(interaction, spotifyApi) {
    try {
        // 1. Get user and validate voice channel
        const member = await interaction.guild.members.fetch(interaction.user.id);
        if (!member.voice.channel) {
            return await interaction.editReply('❌ You must be in a voice channel!');
        }

        // 2. Verify and refresh Spotify token
        const user = await User.findOne({ discordId: interaction.user.id });
        if (!user?.spotify?.accessToken) {
            return await interaction.editReply(createSpotifyConnectEmbed(interaction.client));
        }

        spotifyApi.setAccessToken(user.spotify.accessToken);
        spotifyApi.setRefreshToken(user.spotify.refreshToken);

        if (new Date(user.spotify.expiresAt) <= new Date()) {
            try {
                const data = await spotifyApi.refreshAccessToken();
                user.spotify.accessToken = data.body.access_token;
                user.spotify.expiresAt = new Date(Date.now() + data.body.expires_in * 1000);
                await user.save();
                spotifyApi.setAccessToken(data.body.access_token);
            } catch (refreshError) {
                console.error('Token refresh failed:', refreshError);
                return await interaction.editReply('❌ Failed to refresh Spotify access. Please reconnect your account.');
            }
        }

        // 3. Handle command types
        const type = interaction.options.getString('type');
        if (type === 'liked') {
            await interaction.editReply('🎵 Loading your liked songs...');
            const response = await spotifyApi.getMySavedTracks({ limit: 50 });
                
            if (!response?.body?.items?.length) {
                return await interaction.editReply('❌ No liked songs found in your Spotify.');
            }

            // Format tracks for display
            const tracks = response.body.items.map(item => ({
                name: item.track.name,
                artists: item.track.artists[0].name,
                duration: formatTime(item.track.duration_ms)
            }));

            // Show paginated display with buttons
            await handlePlaylistDisplay(interaction, tracks, 'Liked Songs');

        } else if (type === 'playlist') {
            await handlePlaylists(interaction, user);
        }

    } catch (error) {
        console.error('Command error:', error);
        if (error.statusCode === 403) {
            await interaction.editReply('❌ Spotify access denied. Please reconnect your account.');
        } else {
            await interaction.editReply('❌ An error occurred while processing your request.');
        }
    }
}

// Add this new function to handle dashboard play requests
async function handleDashboardPlay(client, guildId, channelId, query) {
    try {
        const guild = client.guilds.cache.get(guildId);
        const channel = guild.channels.cache.get(channelId);
        
        if (!guild || !channel) {
            return { success: false, error: 'Invalid guild or channel' };
        }

        // Get or create player
        let player = client.manager.players.get(guildId);
        
        if (!player) {
            player = client.manager.create({
                guild: guildId,
                voiceChannel: channel.id,
                textChannel: guild.systemChannel?.id || channel.id,
                selfDeafen: true
            });
        }

        // Connect to voice channel
        if (!player.connected) {
            await player.connect();
        }

        // Search and add track
        const res = await client.manager.search(query, guild.members.me);
        
        if (!res || !res.tracks[0]) {
            return { success: false, error: 'No tracks found' };
        }

        const track = res.tracks[0];
        player.queue.add(track);

        // Start playing if not already playing
        if (!player.playing && !player.paused && !player.queue.size) {
            player.play();
        }

        return {
            success: true,
            player: {
                current: {
                    title: track.title,
                    author: track.author,
                    thumbnail: track.thumbnail,
                    duration: track.duration
                },
                playing: true,
                voiceChannel: {
                    name: channel.name,
                    guild: guild.name
                }
            }
        };
    } catch (error) {
        console.error('Dashboard play error:', error);
        return { success: false, error: 'Failed to play track' };
    }
}

module.exports = {
    data: new SlashCommandBuilder()
        .setName('spotify')
        .setDescription('Control Spotify music playback')
        .addSubcommand(subcommand =>
            subcommand
                .setName('dashboard')
                .setDescription('Open the music dashboard'))
        .addSubcommand(subcommand =>
            subcommand
                .setName('play')
                .setDescription('Play a song or playlist')
                .addStringOption(option =>
                    option
                        .setName('type')
                        .setDescription('What to play')
                        .setRequired(true)
                        .addChoices(
                            { name: 'Liked Songs', value: 'liked' },
                            { name: 'Playlist', value: 'playlist' }
                        )))
        .setDMPermission(false), // Disable DM usage

    async execute(interaction) {
        const subcommand = interaction.options.getSubcommand();
        
        // Check if user is in voice channel
        const voiceChannel = interaction.member.voice.channel;
        if (!voiceChannel) {
            return interaction.reply({
                content: '❌ You must be in a voice channel first!',
                ephemeral: true
            });
        }

        const user = await User.findOne({ discordId: interaction.user.id });
        
        // Check authentication status and redirect if needed
        if (!user || !user.authStatus.discord || !user.authStatus.spotify) {
            const authEmbed = new EmbedBuilder()
                .setColor('#1DB954')
                .setTitle('Authentication Required')
                .setDescription('You need to connect your accounts first!')
                .addFields(
                    { name: 'Step 1', value: 'Connect Discord account' },
                    { name: 'Step 2', value: 'Connect Spotify account' }
                );

            const row = new ActionRowBuilder()
                .addComponents(
                    new ButtonBuilder()
                        .setLabel('Connect Accounts')
                        .setStyle(ButtonStyle.Link)
                        .setURL(`${process.env.NGROK_URL}/auth/discord`)
                );

            return interaction.reply({
                embeds: [authEmbed],
                components: [row],
                ephemeral: true
            });
        }

        if (subcommand === 'dashboard') {
            await interaction.deferReply({ ephemeral: true });
            const dashboardUrl = `${process.env.NGROK_URL}/dashboard?token=${user.permanentToken}`;
            
            const embed = new EmbedBuilder()
                .setColor('#1DB954')
                .setTitle('🎵 Music Dashboard')
                .setDescription('Click below to open your music dashboard!')
                .addFields(
                    { name: 'Voice Channel', value: `🔊 ${voiceChannel.name}`, inline: true },
                    { name: 'Server', value: `🏠 ${interaction.guild.name}`, inline: true }
                );

            const row = new ActionRowBuilder()
                .addComponents(
                    new ButtonBuilder()
                        .setLabel('Open Dashboard')
                        .setStyle(ButtonStyle.Link)
                        .setURL(dashboardUrl)
                );

            return interaction.editReply({
                embeds: [embed],
                components: [row],
                ephemeral: true
            });
        }

        // Only defer reply here, before spotify command handling
        await interaction.deferReply();
            
        try {
            const spotifyApi = new SpotifyWebApi({
                clientId: process.env.SPOTIFY_CLIENT_ID,
                clientSecret: process.env.SPOTIFY_CLIENT_SECRET
            });

            if (!user.spotify?.refreshToken) {
                return interaction.editReply(createSpotifyConnectEmbed(interaction.client));
            }

            if (user.isSpotifyTokenExpired()) {
                const refreshed = await refreshSpotifyToken(spotifyApi, user);
                if (!refreshed) {
                    return interaction.editReply(createSpotifyConnectEmbed(interaction.client));
                }
            }

            spotifyApi.setAccessToken(user.spotify.accessToken);
            await handleSpotifyCommand(interaction, spotifyApi);
        } catch (error) {
            console.error('Spotify play error:', error);
            if (error.message.includes('refresh_token')) {
                await interaction.editReply(createSpotifyConnectEmbed(interaction.client));
            } else {
                await interaction.editReply(`❌ Error: ${error.message}`);
            }
        }
    },
    handleDashboardPlay, // Export for web server use
};

async function handleConnect(interaction) {
    await interaction.deferUpdate();
    
    const authUrl = `${process.env.NGROK_URL}/auth/spotify`;
    
    const embed = new EmbedBuilder()
        .setTitle('Connect your Spotify')
        .setDescription(`Click below to connect your Spotify account to ${interaction.client.user.username}`)
        .setColor('#1DB954');

    await interaction.editReply({
        embeds: [embed],
        components: [
            new ActionRowBuilder()
                .addComponents(
                    new ButtonBuilder()
                        .setLabel('Connect Spotify')
                        .setStyle(ButtonStyle.Link)
                        .setURL(authUrl)
                )
        ]
    });
}

async function handlePlaylists(interaction, user) {
    try {
        const spotifyApi = new SpotifyWebApi({
            clientId: process.env.SPOTIFY_CLIENT_ID,
            clientSecret: process.env.SPOTIFY_CLIENT_SECRET
        });

        spotifyApi.setAccessToken(user.spotify.accessToken);
        
        // Refresh token if needed
        if (user.isSpotifyTokenExpired()) {
            const refreshed = await refreshSpotifyToken(spotifyApi, user);
            if (!refreshed) {
                return await interaction.editReply(createSpotifyConnectEmbed(interaction.client));
            }
        }

        // Get user's playlists
        const playlists = await spotifyApi.getUserPlaylists();
        
        if (!playlists?.body?.items?.length) {
            return await interaction.editReply('❌ No playlists found in your Spotify.');
        }

        // Format playlists for display
        const formattedPlaylists = playlists.body.items.map(playlist => ({
            id: playlist.id,
            name: playlist.name || 'Untitled Playlist',
            trackCount: playlist.tracks.total,
            image: playlist.images[0]?.url
        }));

        // Show playlist selection with pagination
        let currentPage = 0;
        const itemsPerPage = SONGS_PER_PAGE;
        const pages = Math.ceil(formattedPlaylists.length / itemsPerPage);

        const getPlaylistEmbed = (page) => {
            const start = page * itemsPerPage;
            const pageItems = formattedPlaylists.slice(start, start + itemsPerPage);

            return new EmbedBuilder()
                .setColor('#1DB954')
                .setTitle('🎵 Your Spotify Playlists')
                .setDescription(
                    pageItems.map((p, i) => 
                        `**${start + i + 1}.** ${p.name}\n└ ${p.trackCount} tracks`
                    ).join('\n\n')
                )
                .setFooter({ text: `Page ${page + 1}/${pages} • Total: ${formattedPlaylists.length} playlists` });
        };

        const getPlaylistComponents = (page) => {
            const rows = [];
            const start = page * itemsPerPage;
            const pageItems = formattedPlaylists.slice(start, start + itemsPerPage);

            // Playlist selection buttons
            const selectionButtons = pageItems.map((_, i) => 
                new ButtonBuilder()
                    .setCustomId(`playlist_${start + i}`)
                    .setLabel(`${start + i + 1}`)
                    .setStyle(ButtonStyle.Primary)
            );

            // Split buttons into rows of 4
            for (let i = 0; i < selectionButtons.length; i += 4) {
                rows.push(new ActionRowBuilder().addComponents(selectionButtons.slice(i, i + 4)));
            }

            // Navigation row
            rows.push(new ActionRowBuilder().addComponents(
                new ButtonBuilder()
                    .setCustomId('prev')
                    .setLabel('◀')
                    .setStyle(ButtonStyle.Secondary)
                    .setDisabled(page === 0),
                new ButtonBuilder()
                    .setCustomId('next')
                    .setLabel('▶')
                    .setStyle(ButtonStyle.Secondary)
                    .setDisabled(page >= pages - 1)
            ));

            return rows;
        };

        const msg = await interaction.editReply({
            embeds: [getPlaylistEmbed(currentPage)],
            components: getPlaylistComponents(currentPage)
        });

        const collector = msg.createMessageComponentCollector({ time: 300000 });

        collector.on('collect', async (i) => {
            if (i.user.id !== interaction.user.id) {
                return i.reply({ content: 'This menu is not for you!', ephemeral: true });
            }

            await i.deferUpdate();

            if (i.customId === 'prev') {
                currentPage = Math.max(0, currentPage - 1);
                await msg.edit({
                    embeds: [getPlaylistEmbed(currentPage)],
                    components: getPlaylistComponents(currentPage)
                });
            } else if (i.customId === 'next') {
                currentPage = Math.min(pages - 1, currentPage + 1);
                await msg.edit({
                    embeds: [getPlaylistEmbed(currentPage)],
                    components: getPlaylistComponents(currentPage)
                });
            } else if (i.customId.startsWith('playlist_')) {
                const index = parseInt(i.customId.split('_')[1]);
                const selectedPlaylist = formattedPlaylists[index];
                
                // Get playlist tracks
                const playlistTracks = await spotifyApi.getPlaylistTracks(selectedPlaylist.id);
                
                if (!playlistTracks?.body?.items?.length) {
                    return await i.followUp({ 
                        content: '❌ This playlist is empty!',
                        ephemeral: true 
                    });
                }

                // Format tracks for display
                const tracks = playlistTracks.body.items
                    .filter(item => item.track)
                    .map(item => ({
                        name: item.track.name,
                        artists: item.track.artists[0].name,
                        duration: formatTime(item.track.duration_ms)
                    }));

                // Show tracks with pagination
                await handlePlaylistDisplay(interaction, tracks, selectedPlaylist.name);
            }
        });

        collector.on('end', () => {
            msg.edit({ components: [] }).catch(() => {});
        });

    } catch (error) {
        console.error('Error handling playlists:', error);
        await interaction.editReply(`❌ Error: ${error.message}`);
    }
}