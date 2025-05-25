const fs = require('fs');
const path = require('path');
const { loadAllCommands } = require('../handlers/commandHandler'); // Fix import
const BotManager = require('./BotCreator');

// Create standard template data for any route
async function createTemplateData(req, client, botManager) {
    // Get slash commands
    const slashCommands = client?.slashCommands ? Array.from(client.slashCommands.values()).map(cmd => ({
        name: cmd.data.name,
        description: cmd.data.description,
        type: 'slash',
        usage: `/${cmd.data.name}`,
        category: cmd.category || 'General'
    })) : [];

    // Get prefix commands - Fixed to use prefixCommands collection
    const prefixCommands = client?.prefixCommands ? Array.from(client.prefixCommands.values()).map(cmd => ({
        name: cmd.name,
        description: cmd.description || 'No description available',
        type: 'prefix',
        usage: `!${cmd.name}`,
        aliases: cmd.aliases || [],
        category: cmd.category || 'General'
    })) : [];

    // Check if user is authenticated and has Spotify
    const isAuth = req.isAuthenticated?.() || false;
    const currentSession = isAuth && req.user?.sessions?.find(s => s.sessionId === req.sessionID);
    const hasSpotify = !!(currentSession?.spotify?.accessToken);

    // Combine both command types
    const allCommands = [...slashCommands, ...prefixCommands];

    // Base data object with error handling
    const baseData = {
        botName: client?.user?.username || 'Discord Bot',
        user: req.user,
        isAuthenticated: isAuth,
        hasSpotify: hasSpotify,
        spotifyProfile: hasSpotify ? currentSession.spotify.profile : null,
        error: null, // Add this line
        avatar: client?.user?.displayAvatarURL?.({ size: 1024 }),
        avatarURL: 'https://static0.anpoimages.com/wordpress/wp-content/uploads/2024/05/discord-3-ap24-hero.jpg',
        clientId: process.env.CLIENT_ID,
        clientSecret: process.env.CLIENT_SECRET,
        SPOTIFY_CLIENT_ID: process.env.SPOTIFY_CLIENT_ID,
        SPOTIFY_CLIENT_SECRET: process.env.SPOTIFY_CLIENT_SECRET,
        commands: allCommands,
        stats: {
            online: client?.ws?.ping < 100 || false,
            servers: client?.guilds?.cache?.size || 0,
            users: client?.users?.cache?.size || 0,
            uptime: process.uptime(),
            activePlayers: client?.manager?.players?.size || 0,
            totalTracks: client?.manager?.players?.reduce((acc, player) => 
                acc + (player.queue?.size || 0), 0) || 0,
            ping: client?.ws?.ping || 0
        },
        botAvatar: client?.user?.displayAvatarURL?.({ size: 1024 }) || 'https://images-ext-1.discordapp.net/external/Vj5XAuCV3kpUCA121vpFLT_8Xo-EonGppjyCNaCd6Pw/%3Fsize%3D1024/https/cdn.discordapp.com/avatars/1107155830274523136/e84dd5b59ab14bcf7685a582db0a920e.webp?format=webp&width=374&height=374',
    };

    // Add bot-specific data if botManager exists
    if (botManager && req.user) {
        try {
            const userBots = await botManager.getUserBots(req.user.discordId);
            const publicBots = await botManager.getAllBots();
            
            return {
                ...baseData,
                userBots: userBots || [],
                publicBots: publicBots?.filter(bot => bot.isPublic) || [],
                stats: {
                    totalBots: userBots?.length || 0,
                    activeBots: userBots?.filter(bot => bot.isRunning)?.length || 0,
                    // ... other stats
                }
            };
        } catch (error) {
            console.error('Error loading bot data:', error);
            return {
                ...baseData,
                error: 'Failed to load bot data',
                userBots: [],
                publicBots: [],
                stats: {
                    totalBots: 0,
                    activeBots: 0,
                    servers: 0,
                    users: 0
                }
            };
        }
    }

    return baseData;
}

function generateTemplateRoutes(app, templatesDir, client, isAuthenticated) {
    // Initialize BotManager
    const botManager = new BotManager();
    
    const ejsFiles = fs.readdirSync(templatesDir)
        .filter(file => {
            const filePath = path.join(templatesDir, file);
            return fs.statSync(filePath).isFile() && path.extname(file) === '.ejs';
        });

    console.log(`Found ${ejsFiles.length} EJS templates to create routes for`);

    const specialRoutes = {
        'index': { path: '/', auth: false },
        'dashboard': { path: '/dashboard', auth: true },
        'music': { path: '/profile', auth: true, requireSpotify: true },
        'error': { path: '/error', auth: false },
        // Add bot template as special route
        'bot': { path: '/bots', auth: true, requireBotData: true }
    };

    const commands = Array.from(client.slashCommands.values()).map(cmd => ({
        name: cmd.data.name,
        description: cmd.data.description,
        category: cmd.category || 'General'
    }));
    ejsFiles.forEach(file => {
        const templateName = path.basename(file, '.ejs');
        const routeConfig = specialRoutes[templateName] || {
            path: `/${templateName === 'index' ? '' : templateName}`,
            auth: false
        };

        const routeHandler = async (req, res) => {
            try {
                const templateData = await createTemplateData(
                    req, 
                    client, 
                    routeConfig.requireBotData ? botManager : null
                );
                
                res.render(templateName, {
                    ...templateData,
                    error: req.query.error || templateData.error || null
                });
            } catch (error) {
                console.error(`Error rendering ${templateName}:`, error);
                res.status(500).render(templateName, {
                    user: req.user,
                    isAuthenticated: req.isAuthenticated?.(),
                    error: 'An error occurred while loading the page',
                    userBots: [],
                    publicBots: [],
                    stats: {
                        totalBots: 0,
                        activeBots: 0,
                        servers: 0,
                        users: 0
                    }
                });
            }
        };

        if (routeConfig.auth) {
            if (routeConfig.requireSpotify) {
                app.get(routeConfig.path, isAuthenticated, (req, res, next) => {
                    const session = req.user.sessions.find(s => s.sessionId === req.sessionID);
                    if (!session || !session.spotify) {
                        req.session.returnTo = req.originalUrl;
                        return res.redirect('/auth/spotify');
                    }
                    next();
                }, routeHandler);
            } else {
                app.get(routeConfig.path, isAuthenticated, routeHandler);
            }
        } else {
            app.get(routeConfig.path, routeHandler);
        }

        console.log(`Created route for ${templateName} at ${routeConfig.path}`);
    });
}

module.exports = { generateTemplateRoutes };