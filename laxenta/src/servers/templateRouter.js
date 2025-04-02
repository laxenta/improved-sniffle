const fs = require('fs');
const path = require('path');
const ejs = require('ejs');
const { validateHeaderValue } = require('http');
const { url } = require('inspector');

/**
 * Validates an EJS template file
 * @param {string} templatePath Path to template file
 * @param {Object} sampleData Test data for validation
 * @returns {Promise<{valid: boolean, errors: Array}>}
 */
async function validateTemplate(templatePath, sampleData) {
    try {
        const template = await fs.promises.readFile(templatePath, 'utf-8');
        await ejs.render(template, sampleData, { async: true });
        return { valid: true, errors: [] };
    } catch (error) {
        return {
            valid: false,
            errors: [{
                type: 'TEMPLATE_ERROR',
                message: error.message,
                line: error.line,
                column: error.column
            }]
        };
    }
}

/**
 * Creates sample data for template validation
 */
function createSampleData() {
    return {
        isAuthenticated: true,
        user: {
            id: 'test_user',
            username: 'Test User',
            discordId: 'test_discord_id',
            avatar: 'test_avatar_hash',
            sessions: [{
                sessionId: 'test_session',
                spotify: {
                    accessToken: 'test_token',
                    expiresAt: new Date(Date.now() + 3600000).toISOString()
                }
            }]
        },
        botAvatar: 'https://cdn.discordapp.com/avatars/bot_id/bot_avatar.png',
        sessionID: 'test_session',
        botName: 'Test Bot',
        avatar: 'test_avatar_url',
        clientId: 'test_client_id',
        clientIp: '127.0.0.1',
        originalUrl: "https://example.com/test",
        // Add these new properties for template validation
        error: null,
        nowPlaying: [], // Empty array for index.ejs
        page: 'test',
        stats: {
            online: true,
            servers: 0,
            users: 0,
            uptime: 0,
            songsPlayed: 0
        },
        hasSpotify: false,
        baseUrl: 'https://logically-inspired-chipmunk.ngrok-free.app0',
        // Additional properties that might be needed
        mutualGuilds: [],
        spotifyPlaylists: [],
        commands: []
    };
}

/**
 * Automatically generates routes for all EJS templates in a directory
 * @param {Object} app Express app
 * @param {string} templatesDir Path to templates directory
 * @param {Object} client Discord.js client
 * @param {Function} authMiddleware Optional authentication middleware
 */
function generateTemplateRoutes(app, templatesDir, client, authMiddleware = null) {
    try {
        console.log('\n=== Template Router Initialization ===');

        // Set essential app locals
        app.locals = {
            ...app.locals,
            CLIENT_ID: process.env.CLIENT_ID,
            CLIENT_SECRET: process.env.CLIENT_SECRET,
            redirectUri: process.env.REDIRECT_URI,
            // error: null,
            //isAuthenticated: false,
            // user: null,
            // sessionID: null,
            // hasSpotify: false,
            // baseUrl: process.env.BASE_URL
        };

        // Read and filter EJS templates
        const ejsFiles = fs.readdirSync(templatesDir)
            .filter(file => {
                const filePath = path.join(templatesDir, file);
                return fs.statSync(filePath).isFile() && path.extname(file) === '.ejs';
            });

        console.log(`Found ${ejsFiles.length} EJS templates`);

        // Validate all templates first
        const sampleData = createSampleData();

        // Process each template
        ejsFiles.forEach(async file => {
            const templatePath = path.join(templatesDir, file);
            const routeName = path.basename(file, '.ejs');
            const routePath = routeName === 'index' ? '/' : `/${routeName}`;

            // Validate template
            console.log(`\nValidating template: ${file}`);
            const validation = await validateTemplate(templatePath, sampleData);

            if (!validation.valid) {
                console.error(`❌ Template validation failed for ${file}:`);
                validation.errors.forEach(error => {
                    console.error(`   ${error.message}`);
                    if (error.line) console.error(`   Line ${error.line}${error.column ? `, Column ${error.column}` : ''}`);
                });
                return;
            }

            // Define protected routes
            const protectedRoutes = ['dashboard', 'profile', 'settings'];
            const needsAuth = protectedRoutes.includes(routeName);

            // Create route handler with timing
            const routeHandler = async (req, res) => {
                const startTime = process.hrtime();

                try {


                    const nowPlaying = Array.from(client.guilds.cache.values())
                    .map(guild => {
                        const player = client.manager?.players?.get(guild.id);
                        if (!player?.queue?.current) return null;
        
                        return {
                            guildId: guild.id,
                            guildName: guild.name,
                            track: {
                                title: player.queue.current.title,
                                author: player.queue.current.author,
                                duration: player.queue.current.duration,
                                thumbnail: player.queue.current.thumbnail,
                                uri: player.queue.current.uri
                            },
                            position: player.position,
                            volume: player.volume,
                            playing: player.playing,
                            paused: player.paused
                        };
                    })
                    .filter(Boolean);
                    // Base template data to render stuff 
                    // ( important )
                    const templateData = {
                        user: req.user ? {
                            ...req.user,
                            avatarURL: req.user.avatar 
                                ? `https://cdn.discordapp.com/avatars/${req.user.discordId}/${req.user.avatar}`
                                : null
                        } : null,
                        isAuthenticated: req.isAuthenticated(),
                        sessionID: req.sessionID,
                        hasSpotify: req.user?.sessions?.some(s =>
                            s.sessionId === req.sessionID && s.spotify?.accessToken
                        ),
                        botName: client.user?.username || 'Bot',
                        botAvatar: client.user?.displayAvatarURL({ dynamic: true, size: 1024 }),
                        error: null,
                        page: routeName,
                        clientId: process.env.CLIENT_ID,
                        baseUrl: process.env.BASE_URL,
                        clientIp: req.ip || req.headers['x-forwarded-for'] || req.connection.remoteAddress || '127.0.0.1',
                        originalUrl: req.originalUrl,
                        //nowplaying
                        nowPlaying: nowPlaying,
                        stats: {
                            online: client.ws.ping < 100,
                            servers: client.guilds.cache.size,
                            users: client.users.cache.size,
                            uptime: process.uptime(),
                            //music
                        activePlayers: client.manager?.players?.size || 0,
                        totalTracks: client.manager?.players?.reduce((acc, player) => 
                             acc + (player.queue?.size || 0), 0) || 0
                        }
                    };

                    // Render with performance tracking
                    const renderStart = process.hrtime();
                    res.render(routeName, templateData, (err, html) => {
                        if (err) throw err;

                        const [s, ns] = process.hrtime(renderStart);
                        const renderTime = (s * 1000 + ns / 1e6).toFixed(2);

                        console.log(`Rendered ${routePath} in ${renderTime}ms`);
                        res.send(html);
                    });

                    // Inside the catch block of routeHandler
                } catch (error) {
                    console.error(`Error rendering ${file}:`, error);
                    res.status(500).render('error', {
                        error: process.env.NODE_ENV === 'production'
                            ? 'An internal error happened, U dont need to know the details, the dev will, u can retry with discord, ngl its rare that it will fix it'
                            : {
                                message: error.message,
                                stack: error.stack,
                                template: file
                            },
                        user: req.user,
                        isAuthenticated: req.isAuthenticated(),
                        botName: client.user?.username || 'Bot',
                        avatar: client.user?.displayAvatarURL({ dynamic: true, size: 1024 }),
                        clientIp: req.ip || req.headers['x-forwarded-for'] || '127.0.0.1',
                        baseUrl: process.env.BASE_URL,
                        page: 'error'
                    });
                }
            };


            // Register route
            if (needsAuth && authMiddleware) {
                app.get(routePath, authMiddleware, routeHandler);
                console.log(`✓ Created protected route: ${routePath}`);
            } else {
                app.get(routePath, routeHandler);
                console.log(`✓ Created public route: ${routePath}`);
            }
        });


    } catch (error) {
        console.error('Fatal error in template router:', error);
        throw error;
    }
}

module.exports = { generateTemplateRoutes };


//we can use nowplaying and track info in templates directly liek this -;
// <% if (nowPlaying && nowPlaying.length > 0) { %>
//     <section class="now-playing">
//         <% nowPlaying.forEach(player => { %>
//             <div class="player-card">
//                 <img src="<%= player.track.thumbnail %>" alt="<%= player.track.title %>">
//                 <div class="track-info">
//                     <h3><%= player.track.title %></h3>
//                     <p><%= player.track.author %></p>
//                     <p>Playing in <%= player.guildName %></p>
//                 </div>
//             </div>
//         <% }); %>
//     </section>
//  <% } %>

// Fetches active players from Lavalink manager
// Maps them to a clean format for templates
// Includes player state (position, volume, etc.)
// Adds music-specific stats
// Filters out null/inactive players
// Now your templates can access:

// nowPlaying array of currently playing tracks
// stats.activePlayers count of active music players
// stats.totalTracks total tracks in all queues
