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
        }, 60 * 60 * 1000); // Run every hour
    }


    setupMiddleware() {
        // 1. Basic middleware
        this.app.use(express.json());
        this.app.use(express.urlencoded({ extended: true }));
        this.app.use(cookieParser());

        // 2. Session setup with FileStore for persistence
        this.app.use(session({
            store: new FileStore({
                path: './sessions',
                ttl: 86400, // 24 hours
                retries: 0,
                secret: process.env.SESSION_SECRET,
                reapInterval: 3600, // Cleanup every hour
                compress: true,
                encoding: 'utf8',
                fileExtension: '.sess'
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
        })); 

        // 3. Initialize Passport BEFORE the recovery middleware
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
            (req, res) => {
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
                if (req.user && req.sessionID) {
                    // Find and clear Spotify data from session
                    const session = req.user.sessions.find(s => s.sessionId === req.sessionID);
                    if (session) {
                        session.isActive = false;
                        session.spotify = null; // Clear Spotify data
                        await req.user.save();
                    }
                }
                
                // Clear all cookies
                res.clearCookie('sid');
                res.clearCookie('uid');
                
                // Proper passport logout
                req.logout((err) => {
                    if (err) { return next(err); }
                    req.session.destroy(() => {
                        res.redirect('/');
                    });
                });
            } catch (error) {
                console.error('Logout error:', error);
                next(error);
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

 // Replace the spotifyAuthMiddleware method
 spotifyAuthMiddleware(req, res, next) {
    // Add debug logging
    console.log('Spotify Auth Check:', {
        isAuthenticated: req.isAuthenticated(),
        hasUser: !!req.user,
        sessionID: req.sessionID,
        path: req.path
    });

    if (!req.isAuthenticated() || !req.user) {
        return res.redirect('/auth/discord');
    }

    const session = req.user.sessions.find(s => s.sessionId === req.sessionID);
    console.log('Session found:', {
        hasSession: !!session,
        hasSpotify: !!session?.spotify,
        isTokenValid: session?.spotify?.expiresAt ? new Date(session.spotify.expiresAt) > new Date() : false
    });

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

    // Routes with bound middleware
    this.app.get('/api/spotify/liked-songs', 
        boundIsAuthenticated,
        ensureFreshSpotifyToken,
        async (req, res) => {
            try {
                const spotifyApi = getSpotifyClientForUser(req);
                const data = await spotifyApi.getMySavedTracks({ limit: 50 });
                res.json(data.body.items);
            } catch (error) {
                console.error('Failed to fetch liked songs:', error);
                res.status(500).json({ error: 'Failed to fetch liked songs' });
            }
        }
    );

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


        // Play in Discord
        this.app.post('/api/music/play', 
            boundIsAuthenticated, 
            ensureFreshSpotifyToken, 
            async (req, res) => {
            try {
                const { query } = req.body;
                const user = await this.client.users.fetch(req.user.discordId);
                let voiceChannel;

                // Find user's voice channel
                for (const guild of this.client.guilds.cache.values()) {
                    const member = await guild.members.fetch(user.id).catch(() => null);
                    if (member?.voice.channel) {
                        voiceChannel = member.voice.channel;
                        break;
                    }
                }

                if (!voiceChannel) {
                    return res.json({ error: 'Join a voice channel first!' });
                }

                const player = this.client.manager.create({
                    guild: voiceChannel.guild.id,
                    voiceChannel: voiceChannel.id,
                    textChannel: voiceChannel.guild.systemChannel?.id
                });

                await player.connect();
                const result = await this.client.manager.search(query, user);
                if (!result.tracks[0]) return res.json({ error: 'No tracks found' });

                player.queue.add(result.tracks[0]);
                if (!player.playing) player.play();

                res.json({ success: true });
            } catch (error) {
                console.error('Failed to play track:', error);
                res.status(500).json({ error: 'Failed to play track' });
            }
        });
    }

    async startServer() {
        const port = process.env.PORT || 3000;
        const server = process.env.BASE_URL;
        this.app.listen(port, () => console.log(`Server running on url ${server} ${port}`));
    }
}

module.exports = WebServer;