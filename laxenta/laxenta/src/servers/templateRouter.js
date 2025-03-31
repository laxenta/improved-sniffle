const fs = require('fs');
const path = require('path');
const SpotifyWebApi = require('spotify-web-api-node');
const { Player } = require('discord-player');

//THIS GENERATES ROUTES AUTOMATICALLY 
/**
 * Automatically generates routes for all EJS templates in a directory
 * @param {Object} app Express app
 * @param {string} templatesDir Path to templates directory
 * @param {Object} client Discord.js client
 * @param {Function} authMiddleware Optional authentication middleware
 */
function generateTemplateRoutes(app, templatesDir, client, authMiddleware = null) {
    try {
        // Add environment variables to app.locals
        app.locals.clientId = process.env.SPOTIFY_CLIENT_ID;
        app.locals.ngrokUrl = process.env.NGROK_URL;
        app.locals.baseUrl = process.env.BASE_URL;


        // Read all files from the templates directory
        const files = fs.readdirSync(templatesDir);
        
        // Filter out only .ejs files and ignore subdirectories
        const ejsFiles = files.filter(file => {
            const filePath = path.join(templatesDir, file);
            return fs.statSync(filePath).isFile() && path.extname(file) === '.ejs';
        });
        
        console.log(`Found ${ejsFiles.length} EJS templates to create routes for`);
        // Add middleware to set common template variables
        app.use((req, res, next) => {
            // Force these values to be based on actual session
            res.locals = {
                ...res.locals,
                isAuthenticated: req.isAuthenticated(),
                user: req.user || null,
                sessionID: req.sessionID,  // Add this line
                hasSpotify: req.user?.sessions?.some(s => 
                    s.sessionId === req.sessionID && s.spotify?.accessToken
                ),
                botName: client.user?.username || 'Discord Bot',
                avatar: req.user?.avatar 
                ? `https://cdn.discordapp.com/avatars/${req.user.discordId}/${req.user.avatar}`
                : client.user?.displayAvatarURL({ dynamic: true, size: 1024 }),
                clientId: process.env.CLIENT_ID,
                originalUrl: req.originalUrl
            };
            next();
        });
        // Create routes for each template
        ejsFiles.forEach(file => {
            const routeName = path.basename(file, '.ejs');
            const routePath = routeName === 'index' ? '/' : `/${routeName}`;
            
            // Determine if this route should be protected
            const protectedRoutes = ['dashboard', 'profile', 'servers', 'settings'];
            const needsAuth = protectedRoutes.includes(routeName);
            
            // Setup the route
            const routeHandler = async (req, res) => {
                try {
                    // Common data to pass to all templates
                    const templateData = {
                        botName: client.user?.username || 'Music Bot',
                        avatar: client.user?.displayAvatarURL({ dynamic: true, size: 1024 }),
                        user: req.user || null,
                        isAuthenticated: !!req.user,
                        hasSpotify: !!req.user?.sessions?.some(s => 
                            s.sessionId === req.sessionID && s.spotify?.accessToken
                        ),
                        error: null,
                        page: routeName,
                        formatUptime,
                        formatTime,
                        client,
                        clientId: process.env.SPOTIFY_CLIENT_ID,
                        ngrokUrl: process.env.NGROK_URL,
                        baseUrl: process.env.BASE_URL,
                        stats: {
                            online: client.isReady(),
                            servers: client.guilds.cache.size || 0,
                            users: client.users.cache.size || 0,
                            songsPlayed: client.musicServer?.totalSongsPlayed || 0,
                            uptime: client.uptime || 0
                        }
                    };

                    // Add additional template-specific data
                    if (routeName === 'index' || routeName === 'home') {
                        templateData.nowPlaying = Array.from(client.guilds.cache.values())
                            .map(guild => {
                                const queue = getQueue(client, guild.id);
                                if (!queue?.isPlaying) return null;
                                
                                return {
                                    guildId: guild.id,
                                    guildName: guild.name,
                                    title: queue.currentTrack.title,
                                    artist: queue.currentTrack.author,
                                    thumbnail: queue.currentTrack.thumbnail,
                                    progress: queue.getPlayerTimestamp()
                                };
                            })
                            .filter(Boolean);
                    } else if (routeName === 'commands') {
                        // Get commands from all possible collections with fallbacks
                        const commands = [
                            ...(Array.from(client.commands?.values() || [])),
                            ...(Array.from(client.slashCommands?.values() || [])),
                            ...(Array.from(client.prefixCommands?.values() || []))
                        ];
                        
                        // If no commands found, provide default empty array
                        templateData.commands = commands.length > 0 ? commands : [];
                        
                    } else if (routeName === 'dashboard' && req.user) {
                        // Get mutual guilds
                        templateData.mutualGuilds = req.user.guilds?.filter(guild => 
                            client.guilds.cache.has(guild.id)
                        ) || [];

                        // Add Spotify playlists if user has Spotify connected
                        if (req.user.spotify?.accessToken) {
                            try {
                                const spotifyApi = new SpotifyWebApi({
                                    clientId: process.env.SPOTIFY_CLIENT_ID,
                                    clientSecret: process.env.SPOTIFY_CLIENT_SECRET
                                });

                                spotifyApi.setAccessToken(req.user.spotify.accessToken);
                                
                                // Check if token needs refresh
                                if (req.user.isSpotifyTokenExpired()) {
                                    spotifyApi.setRefreshToken(req.user.spotify.refreshToken);
                                    const data = await spotifyApi.refreshAccessToken();
                                    req.user.spotify.accessToken = data.body.access_token;
                                    req.user.spotify.expiresAt = new Date(Date.now() + data.body.expires_in * 1000);
                                    await req.user.save();
                                    spotifyApi.setAccessToken(data.body.access_token);
                                }

                                const playlistsResponse = await spotifyApi.getUserPlaylists();
                                templateData.spotifyPlaylists = playlistsResponse.body.items.map(playlist => ({
                                    id: playlist.id,
                                    name: playlist.name,
                                    trackCount: playlist.tracks.total,
                                    image: playlist.images[0]?.url,
                                    url: playlist.external_urls.spotify
                                }));
                            } catch (error) {
                                console.error('Error fetching Spotify playlists:', error);
                                templateData.spotifyPlaylists = [];
                            }
                        } else {
                            templateData.spotifyPlaylists = [];
                        }

                        // Get commands
                        const prefixCommands = Array.from(client.prefixCommands.values());
                        const slashCommands = Array.from(client.slashCommands.values());
                        templateData.commands = [...prefixCommands, ...slashCommands];
                        templateData.prefix = process.env.PREFIX || '!';

                        // Get active music players
                        templateData.activePlayers = Array.from(client.guilds.cache.values())
                            .map(guild => {
                                const queue = getQueue(client, guild.id);
                                if (!queue) return null;
                                
                                try {
                                    return {
                                        guildId: guild.id,
                                        guildName: guild.name,
                                        guild: {
                                            iconURL: guild.iconURL({ dynamic: true })
                                        },
                                        song: queue.currentTrack ? {
                                            title: queue.currentTrack.title || 'Unknown Title',
                                            url: queue.currentTrack.url || '#',
                                            thumbnail: queue.currentTrack.thumbnail || null
                                        } : null
                                    };
                                } catch (error) {
                                    console.error(`Error getting player data for guild ${guild.id}:`, error);
                                    return null;
                                }
                            })
                            .filter(Boolean);
                    }
                    
                    res.render(routeName, templateData);
                } catch (error) {
                    console.error(`Error in route ${routeName}:`, error);
                    res.status(500).render('error', {
                        error: process.env.NODE_ENV === 'production' 
                            ? 'An error occurred' 
                            : { 
                                message: error.message,
                                stack: error.stack,
                                path: req.path
                            },
                        botName: client.user?.username || 'Discord Bot',
                        user: req.user,
                        isAuthenticated: !!req.user,
                        hasSpotify: !!req.user?.sessions?.some(s => 
                            s.sessionId === req.sessionID && s.spotify?.accessToken
                        ),
                        clientId: process.env.SPOTIFY_CLIENT_ID,
                        ngrokUrl: process.env.NGROK_URL,
                        baseUrl: process.env.BASE_URL,
                        avatar: client.user?.displayAvatarURL({ dynamic: true, size: 1024 })
                    });
                }
            };
            
            // Register the route with or without auth middleware
            if (needsAuth && authMiddleware) {
                app.get(routePath, authMiddleware, routeHandler);
                console.log(`Created protected route: ${routePath} (${file})`);
            } else {
                app.get(routePath, routeHandler);
                console.log(`Created route: ${routePath} (${file})`);
            }
        });
    } catch (error) {
        console.error('Error generating template routes:', error);
    }
}

/**
 * Helper method to format uptime nicely
 * @param {number} ms Uptime in milliseconds
 * @returns {string} Formatted uptime string
 */
function formatUptime(ms) {
    if (!ms) return '0d 0h 0m 0s';
    
    const seconds = Math.floor((ms / 1000) % 60);
    const minutes = Math.floor((ms / (1000 * 60)) % 60);
    const hours = Math.floor((ms / (1000 * 60 * 60)) % 24);
    const days = Math.floor(ms / (1000 * 60 * 60 * 24));
    
    return `${days}d ${hours}h ${minutes}m ${seconds}s`;
}

/**
 * Helper method to format time in MM:SS
 * @param {number} seconds Total seconds
 * @returns {string} Formatted time string
 */
function formatTime(seconds) {
    if (!seconds) return '0:00';
    
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = Math.floor(seconds % 60);
    
    return `${minutes}:${remainingSeconds.toString().padStart(2, '0')}`;
}

function getQueue(client, guildId) {
    const queue = client.player?.nodes?.get(guildId);
    if (!queue || !queue.isPlaying() || !queue.currentTrack) return null;
    return queue;
}

module.exports = { generateTemplateRoutes };