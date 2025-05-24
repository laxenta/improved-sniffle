const express = require('express');
const session = require('express-session');
const passport = require('passport');
const path = require('path');
const FileStore = require('session-file-store')(session);
const crypto = require('crypto');
const SpotifyAuthManager = require('../auth/spotifyAuth');
const DiscordAuthManager = require('../auth/discordAuth');
const MongoStore = require('connect-mongo');
const User = require('../models/User');
const cookieParser = require('cookie-parser');

class WebServer {
    constructor(client) {
        this.client = client;
        this.app = express();
        this.userVoiceMap = new Map(); // Add this line
        this.setupVoiceStateTracking(); // Add this line

 
        // Initialize auth handlers
        this.spotifyAuthHandler = new SpotifyAuthManager({
            spotify: {
                clientId: process.env.SPOTIFY_CLIENT_ID,
                clientSecret: process.env.SPOTIFY_CLIENT_SECRET
            },
            baseUrl: process.env.NGROK_URL
        });

        this.discordAuthHandler = new DiscordAuthManager({
            clientId: process.env.CLIENT_ID,
            clientSecret: process.env.CLIENT_SECRET,
            baseUrl: process.env.NGROK_URL
        });

        // Set up view engine early
        this.app.set('view engine', 'ejs');
        this.app.set('views', path.join(__dirname, '..', 'templates'));

        // Setup order matters
        this.setupMiddleware();
        this.setupAuth();
        this.setupAuthRoutes(); // Add this line - it was missing
        this.setupTemplateRoutes();
        this.setup();

        // Setup hourly session cleanup
        setInterval(async () => {
            try {
                const users = await User.find({});
                let totalCleaned = 0;
                for (const user of users) {
                    const beforeCount = user.sessions.length;
                    await user.cleanupSessions();
                    totalCleaned += beforeCount - user.sessions.length;
                }
                console.log('Session cleanup completed:', {
                    usersProcessed: users.length,
                    sessionsRemoved: totalCleaned
                });
            } catch (error) {
                console.error('Session cleanup error:', error);
            }
        }, 15 * 60 * 1000); // Run every 15 mns
    }



    setupVoiceStateTracking() {
    // Track initial voice states when bot is ready
    this.client.on('ready', () => {
        // Clear existing voice map
        this.userVoiceMap.clear();
        
        // Get all guild members' voice states
        this.client.guilds.cache.forEach(guild => {
            guild.members.cache.forEach(member => {
                if (member.voice.channelId) {
                    this.userVoiceMap.set(member.user.id, {
                        guildId: guild.id,
                        channelId: member.voice.channelId,
                        timestamp: Date.now()
                    });
                }
            });
        });
    });

    // Track voice state changes
    this.client.on('voiceStateUpdate', (oldState, newState) => {
        const userId = newState.member.user.id;
        
        if (newState.channelId) {
            // User joined or moved to a voice channel
            this.userVoiceMap.set(userId, {
                guildId: newState.guild.id,
                channelId: newState.channelId,
                timestamp: Date.now(),
                guildName: newState.guild.name,
                channelName: newState.channel?.name
            });
        } else {
            // User left voice channel
            this.userVoiceMap.delete(userId);
        }
        
        // Debug log
        console.log('Voice State Update:', {
            userId,
            inChannel: !!newState.channelId,
            guildId: newState.guild.id,
            channelId: newState.channelId,
            mapSize: this.userVoiceMap.size
        });
    });
}
//above is new codeWEEEEEEEEEEEEEEEEEEEE 
    setupMiddleware() {
        // 1. Basic middleware
        this.app.use(express.json());
        this.app.use(express.urlencoded({ extended: true }));
        this.app.use(cookieParser());

        const fs = require('fs');
        const sessionDir = './sessions';
        if (!fs.existsSync(sessionDir)){
            fs.mkdirSync(sessionDir, { recursive: true });
        }
    
        // 2. Session setup with proper store initialization
        const sessionConfig = {
            store: MongoStore.create({
                mongoUrl: process.env.MONGODB_URI,
                ttl: 24 * 60 * 60, // 1 day
                autoRemove: 'interval',
                autoRemoveInterval: 15, // minutes
                touchAfter: 24 * 3600 // 24 hours
            }),
            secret: process.env.SESSION_SECRET,
            resave: false,
            saveUninitialized: false,
            cookie: {
                secure: process.env.NODE_ENV === 'production',
                maxAge: 24 * 60 * 60 * 1000, // 1 day
                httpOnly: true,
                sameSite: 'lax'
            },
            name: 'sid'
        };

        this.app.use(session(sessionConfig)); 

        // 3. Initialize Passport AFTER the session
        this.app.use(passport.initialize());
        this.app.use(passport.session());

        // 4. Now the recovery middleware will have access to req.login
        this.app.use(async (req, res, next) => {
            if (!req.user && req.cookies.uid) {
                console.log('Attempting session recovery:', {
                    sessionId: req.sessionID,
                    userId: req.cookies.uid
                });
                
                try {
                    const user = await User.findOne({ discordId: req.cookies.uid });
                    if (user) {
                        // Create new session
                        user.findOrCreateSession(req.sessionID, req.ip);
                        await user.save();
                        
                        req.login(user, (err) => {
                            if (err) {
                                console.error('Session recovery failed:', err);
                                res.clearCookie('uid');
                            }
                            next();
                        });
                        return;
                    }
                } catch (err) {
                    console.error('Session recovery error:', err);
                    res.clearCookie('uid');
                }
            }
            next();
        });

        // Debug middleware
        if (process.env.NODE_ENV !== 'production') {
            this.app.use((req, res, next) => {
                console.log('Session Debug:', {
                    id: req.sessionID,
                    isAuth: req.isAuthenticated?.(),
                    user: req.user?.username
                });
                next();
            });
        }
    }
    // Set up template routes
    // This method generates routes for each EJS template in the templates directory    

    setupTemplateRoutes() {
        const { generateTemplateRoutes } = require('./templateRouter');
        const templatesDir = path.join(__dirname, '..', 'templates');

        // Generate routes with auth middleware
        generateTemplateRoutes(
            this.app,
            templatesDir,
            this.client,
            this.isAuthenticated.bind(this) // Bind 'this' to ensure correct context
        );
    }

    setupAuth() {
        // Initialize passport
        this.app.use(passport.initialize());
        this.app.use(passport.session());

        // Let auth handlers set up their routes
        this.discordAuthHandler.setupRoutes(this.app);
       // this.spotifyAuthHandler.setupRoutes(this.app, this.discordAuthHandler.isAuthenticated);

           // Use the bound version of isAuthenticated
    const boundIsAuthenticated = this.isAuthenticated.bind(this);
    this.spotifyAuthHandler.setupRoutes(this.app, boundIsAuthenticated);

        // Add auth debug middleware for development
        if (process.env.NODE_ENV !== 'production') {
            this.app.use((req, res, next) => {
                console.log('Auth Debug:', {
                    sessionID: req.sessionID,
                    hasUser: !!req.user,
                    userSessions: req.user?.sessions?.length || 0,
                    isAuthenticated: req.isAuthenticated?.() || false
                });
                next();
            });
        }
    }

    setupAuthRoutes() {
        // Discord OAuth routes
        this.app.get('/auth/discord', (req, res, next) => {
            // Only use query parameter for return URL
            const returnTo = req.query.returnTo || '/dashboard';
            req.session.returnTo = returnTo;
            passport.authenticate('discord')(req, res, next);
        });

        this.app.get('/auth/discord/callback',
            passport.authenticate('discord', { failureRedirect: '/error' }),
            async (req, res) => {
                try {
                    if (!req.user) {
                        throw new Error('Authentication failed');
                    }
        
                    // Create/update session
                    const session = req.user.findOrCreateSession(req.sessionID, req.ip);
                    await req.user.save();
        
                    // Set persistent cookie
                    res.cookie('uid', req.user.discordId, {
                        maxAge: 30 * 24 * 60 * 60 * 1000, // 30 days
                        httpOnly: true,
                        secure: process.env.NODE_ENV === 'production',
                        sameSite: 'lax'
                    });
        
                    const returnTo = req.session.returnTo || '/dashboard';
                    delete req.session.returnTo;
                    res.redirect(returnTo);
                } catch (error) {
                    console.error('Discord callback error:', error);
                    res.redirect('/error');
                }
            }
        );

        // Spotify OAuth routes
        this.app.get('/auth/spotify', this.isAuthenticated.bind(this), (req, res) => {
            // Generate state and ensure session is saved before redirect
            const state = crypto.randomBytes(16).toString('hex');
            req.session.spotifyState = state;
            req.session.returnTo = req.query.returnTo || '/dashboard';
            
            console.log('Starting Spotify auth with state:', {
                state: state,
                sessionId: req.sessionID,
                hasSession: !!req.session
            });
            
            // Force session save before redirect
            req.session.save((err) => {
                if (err) {
                    console.error('Session save error:', err);
                    return res.redirect('/error?message=session_error');
                }
                
                const authUrl = this.spotifyAuthHandler.getAuthURL(state);
                res.redirect(authUrl);
            });
        });

//CALLBACKKKKKK of spotify
this.app.get('/callback', this.isAuthenticated.bind(this), async (req, res) => {
    try {
        console.log('Callback received:', {
            hasState: !!req.query.state,
            sessionState: req.session?.spotifyState,
            sessionID: req.sessionID,
            hasUser: !!req.user
        });

        if (!req.user) {
            throw new Error('No authenticated user found');
        }

        // Store current session ID for reference
        req.user.currentSessionId = req.sessionID;

        const result = await this.spotifyAuthHandler.handleCallback(
            req.query.code,
            req.user
        );

        if (result.success) {
            const returnTo = req.session.returnTo || '/dashboard';
            delete req.session.returnTo;
            res.redirect(returnTo);
        } else {
            res.redirect('/error?message=spotify_auth_failed');
        }
    } catch (error) {
        console.error('Spotify callback error:', error);
        res.redirect('/error?message=spotify_auth_error');
    }
});


        // Logout route
        this.app.post('/logout', async (req, res, next) => {
            try {
                if (req.user) {
                    const userId = req.user._id;
                    const sessionId = req.sessionID;
        
                    try {
                        // 1. Clear ALL user sessions and spotify data
                        await User.findByIdAndUpdate(userId, {
                            $set: { sessions: [] },
                            $unset: { spotifyAuth: "" }
                        });
        
                        // 2. Clear all cookies
                        Object.keys(req.cookies).forEach(cookie => {
                            res.clearCookie(cookie, {
                                path: '/',
                                httpOnly: true,
                                secure: process.env.NODE_ENV === 'production',
                                sameSite: 'lax'
                            });
                        });
        
                        // 3. Destroy session
                        await new Promise((resolve) => {
                            req.session.destroy((err) => {
                                if (err) console.error('Session destruction error:', err);
                                resolve();
                            });
                        });
        
                        // 4. Logout from passport
                        await new Promise((resolve) => req.logout(resolve));
        
                        res.json({ 
                            success: true, 
                            redirect: '/',
                            message: 'Logged out successfully' 
                        });
        
                    } catch (error) {
                        console.error('Session cleanup error:', error);
                        throw error;
                    }
                } else {
                    res.json({ 
                        success: true, 
                        redirect: '/',
                        message: 'Already logged out uwu' 
                    });
                }
            } catch (error) {
                console.error('Logout error:', error);
                res.status(500).json({ 
                    success: false, 
                    redirect: '/',
                    error: 'Logout failed but redirecting anyway'
                });
            }
        });

        // API auth verification endpoint
        this.app.get('/api/auth/verify', (req, res) => {
            // Check if user is authenticated
            if (!req.isAuthenticated() || !req.user) {
                return res.json({
                    valid: false,
                    error: 'session_invalid'
                });
            }

            // Find the current session
            const currentSession = req.user.sessions.find(s => s.sessionId === req.sessionID);
            
            // Check if the session exists and has Spotify connected
            const spotifyConnected = currentSession && currentSession.spotify;

            res.json({
                valid: true,
                user: {
                    discordId: req.user.discordId,
                    username: req.user.username,
                    authStatus: {
                        discord: true,
                        spotify: !!spotifyConnected
                    },
                    spotify: spotifyConnected ? currentSession.spotify : null
                }
            });
        });

        // Spotify token refresh endpoint
        this.app.post('/api/spotify/refresh', this.isAuthenticated.bind(this), async (req, res) => {
            try {
                const sessionData = req.user.sessions.find(s => s.sessionId === req.sessionID);
                if (!sessionData || !sessionData.spotify) {
                    return res.status(401).json({ error: 'No Spotify connection found' });
                }

                const newToken = await this.spotifyAuthHandler.refreshToken(req.user, sessionData);

                res.json({
                    success: true,
                    expiresAt: sessionData.spotify.expiresAt
                });
            } catch (error) {
                console.error('Token refresh error:', error);
                res.status(500).json({ error: 'Failed to refresh token' });
            }
        });

        // Disconnect Spotify
        this.app.post('/api/spotify/disconnect', this.isAuthenticated.bind(this), async (req, res) => {
            try {
                const session = req.user.sessions.find(s => s.sessionId === req.sessionID);
                if (session && session.spotify) {
                    session.spotify = null;
                    await req.user.save();
                }
                res.json({ success: true });
            } catch (error) {
                res.status(500).json({ error: 'Failed to disconnect Spotify' });
            }
        });

        // Middleware to protect routes that require both Discord and Spotify
        this.app.use('/dashboard', this.isAuthenticated.bind(this), this.spotifyAuthMiddleware.bind(this));
    }

    // Authentication middleware - use Discord handler's method
    isAuthenticated(req, res, next) {
        return this.discordAuthHandler.isAuthenticated(req, res, next);
    }

 // spotifyAuthMiddleware method
 spotifyAuthMiddleware(req, res, next) {
    // Add more detailed debug logging
    console.log('Spotify Auth Check:', {
        isAuthenticated: req.isAuthenticated(),
        hasUser: !!req.user,
        sessionID: req.sessionID,
        path: req.path,
        cookies: Object.keys(req.cookies)
    });

    if (!req.isAuthenticated() || !req.user) {
        console.log('User not authenticated, redirecting to Discord auth');
        return res.redirect('/auth/discord');
    }

    const session = req.user.sessions.find(s => s.sessionId === req.sessionID);
    
    console.log('Session found:', {
        hasSession: !!session,
        hasSpotify: !!session?.spotify,
        hasSpotify: !!(session?.spotify?.accessToken),  // Only true if we have an actual token
        isTokenValid: session?.spotify?.expiresAt ? new Date(session.spotify.expiresAt) > new Date() : false,
        sessionId: req.sessionID
    });

    // Check if session exists
    if (!session) {
        console.log('No valid session found, creating new session');
        req.user.findOrCreateSession(req.sessionID, req.ip);
        req.user.save().then(() => {
            // Redirect to Spotify auth after creating session
            req.session.returnTo = req.originalUrl;
            return req.session.save(() => {
                res.redirect('/auth/spotify');
            });
        });
        return;
    }

    // Check if valid Spotify token exists
    if (session?.spotify?.accessToken && 
        new Date(session.spotify.expiresAt) > new Date()) {
        return next();
    }

    // Only redirect if not already on auth path
    if (req.path !== '/auth/spotify') {
        req.session.returnTo = req.originalUrl;
        return req.session.save(() => {
            res.redirect('/auth/spotify');
        });
    }
    
    next();
}

async handleDiscordAuth(req, accessToken, refreshToken, profile, done) {
    try {
        let user = await User.findOne({ discordId: profile.id });

            // Set a persistent cookie with user ID
            res.cookie('uid', profile.id, {
                maxAge: 30 * 24 * 60 * 60 * 1000, // 30 days
                httpOnly: true,
                secure: process.env.NODE_ENV === 'production',
                sameSite: 'lax'
            });
    
        if (!user) {
            user = new User({
                discordId: profile.id,
                username: profile.username,
                email: profile.email,
                avatar: profile.avatar,
                // Create a simpler sessions array
                sessions: [{
                    sessionId: req.sessionID,
                    createdAt: new Date(),
                    lastActive: new Date(),
                    clientIp: req.get('X-Client-IP') || req.ip,
                    isActive: true
                }]
            });
        } else {
            // Update user info
            user.username = profile.username;
            user.email = profile.email;
            user.avatar = profile.avatar;
            
            // Simple session handling - just check if exists then update or add
            const existingSession = user.sessions.find(s => s.sessionId === req.sessionID);
            if (existingSession) {
                existingSession.lastActive = new Date();
                existingSession.isActive = true;
            } else {
                // Push directly to avoid validation issues
                user.sessions.push({
                    sessionId: req.sessionID,
                    createdAt: new Date(),
                    lastActive: new Date(),
                    clientIp: req.get('X-Client-IP') || req.ip,
                    isActive: true
                });
            }
        }
        
        await user.save();
        
        // Keep session cleanup but simplify it
        if (user.sessions.length > 5) {
            // Only keep the 5 most recent sessions
            user.sessions.sort((a, b) => b.lastActive - a.lastActive);
            user.sessions = user.sessions.slice(0, 5);
            await user.save();
        }
        
        done(null, user);
    } catch (error) {
        console.error('Discord auth error:', error);
        done(error);
    }
}


    setup() {
        // Serve static files
        this.app.use(express.static(path.join(__dirname, '..', 'public')));

        // Update session data on requests
        this.app.use(async (req, res, next) => {
            if (req.user && req.sessionID) {
                try {
                    // Find session by sessionID
                    const session = req.user.sessions.find(s => s.sessionId === req.sessionID);
                    
                    if (session) {
                        // Update last active timestamp
                        session.lastActive = new Date();
                        
                        // Only save if we found and updated a session
                        await req.user.save();
                    }
                } catch (error) {
                    console.error('Error updating session activity:', error);
                }
            }
            next();
        });

        // Set up API routes
        this.setupApiRoutes();

        // Add auth error logging middleware
        this.app.use((err, req, res, next) => {
            console.error('Auth Error:', {
                message: err.message,
                stack: err.stack,
                session: {
                    spotifyState: req.session?.spotifyState,
                    returnTo: req.session?.returnTo,
                    isAuthenticated: req.isAuthenticated?.()
                }
            });
            next(err);
        });

        // Add global error handler
        this.app.use((err, req, res, next) => {
            console.error('Global error:', err);

            // Check if headers are already sent
            if (res.headersSent) {
                return next(err);
            }

            // Try to render error page, fall back to JSON if that fails
            try {
                res.status(err.status || 500).render('error', {
                    error: process.env.NODE_ENV === 'production'
                        ? 'An unexpected error occurred'
                        : {
                            message: err.message,
                            stack: err.stack,
                            path: req.path
                        },
                    botName: this.client.user?.username || 'Discord Bot',
                    user: req.user,
                    isAuthenticated: !!req.user,
                    hasSpotify: req.user && req.user.sessions && 
                        req.user.sessions.some(s => s.sessionId === req.sessionID && s.spotify),
                    clientId: process.env.SPOTIFY_CLIENT_ID,
                    ngrokUrl: process.env.NGROK_URL,
                    baseUrl: process.env.BASE_URL,
                    avatar: this.client.user?.displayAvatarURL({ size: 1024 })
                });
            } catch (renderError) {
                // If rendering fails, send JSON response
                res.status(500).json({
                    error: 'Internal Server Error',
                    details: process.env.NODE_ENV === 'production' ? undefined : err.message
                });
            }
        });

        return this.startServer();
    }

    setupApiRoutes() {
        // Helper function to get Spotify client for user's session
        const getSpotifyClientForUser = (req) => {
            return this.spotifyAuthHandler.createClientForUser(req.user.sessions.find(s => s.sessionId === req.sessionID));
        };

       
           // Use the handler's middleware for token refresh with proper binding
    const ensureFreshSpotifyToken = this.spotifyAuthHandler.ensureFreshToken.bind(this.spotifyAuthHandler);
    const boundIsAuthenticated = this.isAuthenticated.bind(this);

    // Update the liked songs endpoint
this.app.get('/api/spotify/liked-songs', 
    boundIsAuthenticated,
    ensureFreshSpotifyToken,
    async (req, res) => {
        try {
            const spotifyApi = getSpotifyClientForUser(req);
            const { offset = 0, limit = 50 } = req.query;
            const data = await spotifyApi.getMySavedTracks({ 
                limit: parseInt(limit), 
                offset: parseInt(offset) 
            });
            
            res.json({
                items: data.body.items,
                total: data.body.total,
                limit: data.body.limit,
                offset: data.body.offset
            });
        } catch (error) {
            console.error('Failed to fetch liked songs:', error);
            res.status(500).json({ error: 'Failed to fetch liked songs' });
        }
    }
);

// does it fetch like inside songs of the playlist in pagination ways or idk what it does lol?? 
    this.app.get('/api/spotify/playlists', 
        boundIsAuthenticated,
        ensureFreshSpotifyToken,
        async (req, res) => {
            try {
                const spotifyApi = getSpotifyClientForUser(req);
                const data = await spotifyApi.getUserPlaylists();
                res.json(data.body.items);
            } catch (error) {
                console.error('Failed to fetch playlists:', error);
                res.status(500).json({ error: 'Failed to fetch playlists' });
            }
        }
    );


    //NEW MUSIC RELATED ENDPOINTS FOR SPOTIFY INT DASHBOARD.EJS
    // Add these inside setupApiRoutes() method

// Status and Ping endpoints
this.app.get('/api/status', (req, res) => {
    res.json({
        online: this.client.manager.nodes.some(node => node.connected),
        uptime: this.client.uptime,
        ping: this.client.ws.ping
    });
});

this.app.get('/api/ping', (req, res) => {
    res.json({ latency: this.client.ws.ping });
});

// Voice Channel Status
this.app.get('/api/voice/status', this.isAuthenticated.bind(this), (req, res) => {
    try {
        const userId = req.user.discordId;
        let voiceState = null;

        // Directly check voice state across all guilds
        for (const guild of this.client.guilds.cache.values()) {
            const member = guild.members.cache.get(userId);
            if (member?.voice.channelId) {
                voiceState = {
                    inChannel: true,
                    guildId: guild.id,
                    guildName: guild.name,
                    channelId: member.voice.channelId,
                    channelName: member.voice.channel?.name,
                    timestamp: Date.now()
                };
                break;
            }
        }

        // Debug info
        console.log('Direct Voice Check:', {
            userId,
            foundVoiceState: !!voiceState,
            guildsChecked: this.client.guilds.cache.size
        });

        res.json(voiceState || {
            inChannel: false,
            timestamp: Date.now()
        });
    } catch (error) {
        console.error('Voice status error:', error);
        res.status(500).json({ error: 'Failed to get voice status' });
    }
});

// Music Control endpoints ( UN USED for now )
this.app.post('/api/music/pause/:guildId', this.isAuthenticated.bind(this), (req, res) => {
    try {
        const player = this.client.manager.players.get(req.params.guildId);
        if (!player) return res.status(404).json({ error: 'No player found', code: 404 });
        
        player.pause(true);
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: 'Failed to pause', code: 500 });
    }
});

this.app.post('/api/music/resume/:guildId', this.isAuthenticated.bind(this), (req, res) => {
    try {
        const player = this.client.manager.players.get(req.params.guildId);
        if (!player) return res.status(404).json({ error: 'No player found', code: 404 });
        
        player.pause(false);
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: 'Failed to resume', code: 500 });
    }
});

this.app.post('/api/music/stop/:guildId', this.isAuthenticated.bind(this), (req, res) => {
    try {
        const player = this.client.manager.players.get(req.params.guildId);
        if (!player) return res.status(404).json({ error: 'No player found', code: 404 });
        
        player.destroy();
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: 'Failed to stop', code: 500 });
    }
});

this.app.post('/api/music/skip/:guildId', this.isAuthenticated.bind(this), (req, res) => {
    try {
        const player = this.client.manager.players.get(req.params.guildId);
        if (!player) return res.status(404).json({ error: 'No player found', code: 404 });
        
        player.stop();
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: 'Failed to skip', code: 500 });
    }
});

this.app.post('/api/music/volume/:guildId', this.isAuthenticated.bind(this), (req, res) => {
    try {
        const player = this.client.manager.players.get(req.params.guildId);
        if (!player) return res.status(404).json({ error: 'No player found', code: 404 });
        
        const volume = Math.max(0, Math.min(100, parseInt(req.body.volume)));
        player.setVolume(volume);
        res.json({ success: true, volume });
    } catch (error) {
        res.status(500).json({ error: 'Failed to set volume', code: 500 });
    }
});
//unused completed here
this.app.get('/api/music/queue/:guildId', this.isAuthenticated.bind(this), (req, res) => {
    try {
        const player = this.client.manager.players.get(req.params.guildId);
        
        // If no player exists, return empty queue state instead of error
        if (!player) {
            return res.json({
                currentTrack: null,
                queue: [],
                paused: false,
                volume: 100,
                playing: false
            });
        }
        
        res.json({
            currentTrack: player.queue.current ? {
                title: player.queue.current.title,
                author: player.queue.current.author,
                duration: player.queue.current.duration,
                thumbnail: player.queue.current.thumbnail,
                uri: player.queue.current.uri,
                requester: player.queue.current.requester
            } : null,
            queue: player.queue.map(track => ({
                title: track.title,
                author: track.author,
                duration: track.duration,
                thumbnail: track.thumbnail,
                uri: track.uri,
                requester: track.requester
            })),
            paused: player.paused,
            volume: player.volume,
            playing: player.playing
        });
    } catch (error) {
        console.error('Queue fetch error:', error);
        // Return empty state on error instead of error response
        res.json({
            currentTrack: null,
            queue: [],
            paused: false,
            volume: 100,
            playing: false
        });
    }
});

this.app.get('/api/music/now-playing', this.isAuthenticated.bind(this), (req, res) => {
    try {
        const players = Array.from(this.client.manager.players.values()).map(player => ({
            guildId: player.guild,
            guildName: this.client.guilds.cache.get(player.guild)?.name || 'Unknown Server',
            playing: player.playing,
            track: player.queue.current ? {
                title: player.queue.current.title,
                author: player.queue.current.author,
                thumbnail: player.queue.current.thumbnail,
                uri: player.queue.current.uri
            } : null
        }));
        
        res.json({ players });
    } catch (error) {
        res.status(500).json({ error: 'Failed to get playing tracks', code: 500 });
    }
});

// Spotify Search endpoint
this.app.get('/api/spotify/search', this.isAuthenticated.bind(this), 
    this.spotifyAuthHandler.ensureFreshToken.bind(this.spotifyAuthHandler),
    async (req, res) => {
    try {
        const spotifyApi = getSpotifyClientForUser(req);
        const data = await spotifyApi.search(req.query.q, ['track'], { limit: 20 });
        res.json(data.body);
    } catch (error) {
        res.status(500).json({ error: 'Failed to search tracks', code: 500 });
    }
});

// Playlist Tracks with Pagination
this.app.get('/api/spotify/playlist/:id/tracks', this.isAuthenticated.bind(this),
    this.spotifyAuthHandler.ensureFreshToken.bind(this.spotifyAuthHandler),
    async (req, res) => {
    try {
        const spotifyApi = getSpotifyClientForUser(req);
        const { offset = 0, limit = 50 } = req.query;
        const data = await spotifyApi.getPlaylistTracks(req.params.id, {
            offset: parseInt(offset),
            limit: parseInt(limit)
        });
        res.json(data.body);
    } catch (error) {
        res.status(500).json({ error: 'failed to get playlist tracks', code: 500 });
    }
});

//queue
this.app.get('/api/music/queue/:guildId', this.isAuthenticated.bind(this), (req, res) => {
    try {
        const player = this.client.manager.players.get(req.params.guildId);
        
        // If no player exists, return empty queue state instead of error
        if (!player) {
            return res.json({
                currentTrack: null,
                queue: [],
                paused: false,
                volume: 100,
                playing: false
            });
        }
        
        res.json({
            currentTrack: player.queue.current ? {
                title: player.queue.current.title,
                author: player.queue.current.author,
                duration: player.queue.current.duration,
                thumbnail: player.queue.current.thumbnail,
                uri: player.queue.current.uri,
                requester: player.queue.current.requester
            } : null,
            queue: player.queue.map(track => ({
                title: track.title,
                author: track.author,
                duration: track.duration,
                thumbnail: track.thumbnail,
                uri: track.uri,
                requester: track.requester
            })),
            paused: player.paused,
            volume: player.volume,
            playing: player.playing
        });
    } catch (error) {
        console.error('Queue fetch error:', error);
        // Return empty state on error instead of error response
        res.json({
            currentTrack: null,
            queue: [],
            paused: false,
            volume: 100,
            playing: false
        });
    }
});


// playyy in dc
this.app.post('/api/music/play', this.isAuthenticated.bind(this), async (req, res) => {
    try {
        const { uri, guildId, channelId } = req.body;
        
        // Get or create player ( its get obv xd )
        let player = this.client.manager.players.get(guildId);
        
        if (!player) {
            // Create new player without event handling (handled in lavalink.js)
            player = this.client.manager.create({
                guild: guildId,
                voiceChannel: channelId,
                textChannel: channelId,
                selfDeafen: true
            });
        }

        // Connect to voice channel if not connected
        if (!player.connected) {
            try {
                await player.connect();
            } catch (error) {
                console.error("Connection error:", error);
                return res.status(500).json({ error: "Failed to connect to voice channel" });
            }
        }

        // Handle Spotify URI conversion
        let searchQuery = uri;
        if (uri.startsWith('spotify:track:')) {
            try {
                const trackId = uri.split(':').pop();
                const spotifyApi = getSpotifyClientForUser(req);
                const trackData = await spotifyApi.getTrack(trackId);
                searchQuery = `${trackData.body.name} ${trackData.body.artists[0].name}`;
            } catch (error) {
                console.error("Spotify conversion error:", error);
                return res.status(500).json({ error: "Failed to process Spotify track" });
            }
        }

        // Search for track
        const result = await this.client.manager.search(
            searchQuery,
            req.user
        ).catch(error => {
            console.error("Search error:", error);
            throw new Error("Failed to search for track");
        });

        if (!result || !result.tracks || !result.tracks.length) {
            return res.status(404).json({ error: "No playable tracks found" });
        }

        // Try to find a non-age-restricted track
        let track = result.tracks.find(t => 
            !t.title.toLowerCase().includes('age-restricted') && 
            !t.title.toLowerCase().includes('login required')
        );

        if (!track) {
            track = result.tracks[0]; // Fallback to first track if no alternative found
        }

        // Add track info
        track.requester = {
            username: req.user.username,
            id: req.user.discordId
        };

        // Add to queue and play if not playing
        player.queue.add(track);
        
        if (!player.playing && !player.paused && player.queue.size === 1) {
            player.play();
        }

        // Send response with track info and queue position
        res.json({
            success: true,
            track: {
                title: track.title,
                author: track.author,
                duration: track.duration,
                thumbnail: track.thumbnail,
                uri: track.uri,
                position: player.queue.size,
                isPlaying: player.playing && player.queue.current?.uri === track.uri
            },
            queueLength: player.queue.size,
            queuePosition: player.queue.size
        });

    } catch (error) {
        console.error('Play endpoint error:', error);
        res.status(500).json({ 
            error: error.message,
            details: process.env.NODE_ENV === 'development' ? error.stack : undefined
        });
    }
});

this.app.get('/api/commands', (req, res) => {
    const slashCommands = Array.from(req.client.slashCommands.values()).map(cmd => ({
        name: cmd.data.name,
        description: cmd.data.description,
        type: 'slash'
    }));

    const prefixCommands = Array.from(req.client.prefixCommands.values()).map(cmd => ({
        name: cmd.name,
        description: cmd.description,
        type: 'prefix',
        aliases: cmd.aliases
    }));

    res.json([...slashCommands, ...prefixCommands]);
});
    }

    async startServer() {
        const port = process.env.PORT || 3000;
        const server = process.env.BASE_URL;
        this.app.listen(port, () => console.log(`Server running on url ${server} ${port}`));
    }
}

module.exports = WebServer;