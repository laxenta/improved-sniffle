const fs = require('fs');
const path = require('path');
const { loadAllCommands } = require('../handlers/commandHandler'); // Fix import


// Create standard template data for any route
function createTemplateData(req, client, commands = []) {
    const isAuth = req.isAuthenticated();
    const currentSession = isAuth && req.user ? 
        req.user.sessions.find(s => s.sessionId === req.sessionID) : null;
    const hasSpotify = currentSession && currentSession.spotify;
    
    return {
        botName: client.user?.username || 'Discord Bot',
        user: req.user,
        isAuthenticated: isAuth,
        hasSpotify: !!hasSpotify,
        spotifyProfile: hasSpotify ? currentSession.spotify.profile : null,
        avatar: client.user?.displayAvatarURL({ size: 1024 }),
        avatarURL: client.user?.displayAvatarURL({ size: 1024 }),
        clientId: process.env.CLIENT_ID,
        clientSecret: process.env.CLIENT_SECRET,
        SPOTIFY_CLIENT_ID: process.env.SPOTIFY_CLIENT_ID,
        SPOTIFY_CLIENT_SECRET: process.env.SPOTIFY_CLIENT_SECRET,
        commands: commands,
        stats: {
            online: client.ws.ping < 100,
            servers: client.guilds.cache.size,
            users: client.users.cache.size,
            uptime: process.uptime(),
            activePlayers: client.manager?.players?.size || 0,
            totalTracks: client.manager?.players?.reduce((acc, player) => 
                acc + (player.queue?.size || 0), 0) || 0
        },
        botAvatar: 'https://images-ext-1.discordapp.net/external/Vj5XAuCV3kpUCA121vpFLT_8Xo-EonGppjyCNaCd6Pw/%3Fsize%3D1024/https/cdn.discordapp.com/avatars/1107155830274523136/e84dd5b59ab14bcf7685a582db0a920e.webp?format=webp&width=374&height=374',
    };
}

function generateTemplateRoutes(app, templatesDir, client, isAuthenticated) {
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

        const routeHandler = (req, res) => {
            const templateData = createTemplateData(req, client, commands);

            // Special data injection
            if (templateName === 'error') {
                templateData.error = req.query.message || 'An unknown error occurred';
            }

            if (templateName === 'commands') {
                templateData.commands = commands;
            }

            res.render(templateName, templateData);
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