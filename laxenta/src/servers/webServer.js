const express = require('express');
const session = require('express-session');
const passport = require('passport');
const path = require('path');
const crypto = require('crypto');
const SpotifyAuthManager = require('../auth/spotifyAuth');
const DiscordAuthManager = require('../auth/discordAuth');
const MongoStore = require('connect-mongo');
const User = require('../models/User');

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
                for (const user of users) {
                    await user.cleanupSessions();
                }
                console.log('Hourly session cleanup completed');
            } catch (error) {
                console.error('Session cleanup error:', error);
            }
        }, 60 * 60 * 1000); // Run every hour
    }


    setupMiddleware() {
        // 1. Basic middleware first
        this.app.use(express.json());
        this.app.use(express.urlencoded({ extended: true }));
    
        // 2. Session setup with consistent settings
        this.app.use(session({
            secret: process.env.SESSION_SECRET,
            resave: false,  // Changed to false
            saveUninitialized: false, // Changed to false
            store: MongoStore.create({
                mongoUrl: process.env.MONGODB_URI,
                ttl: 14 * 24 * 60 * 60,
                autoRemove: 'native',
                touchAfter: 24 * 3600
            }),
            cookie: {
                secure: process.env.NODE_ENV === 'production',
                maxAge: 14 * 24 * 60 * 60 * 1000,
                httpOnly: true,
                sameSite: 'lax'
            },
            name: 'sid'
        }));

   //Debug middleware (optional, for development only)
   // Added after session middleware
if (process.env.NODE_ENV !== 'production') {
    this.app.use((req, res, next) => {
        console.log('Auth Debug:', {
            url: req.url,
            method: req.method,
            sessionID: req.sessionID,
            hasSpotifyState: !!req.session?.spotifyState,
            isAuthenticated: req.isAuthenticated?.(),
            hasUser: !!req.user
        });
        next();
    });
}
    }

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
                // Redirect to saved return path or dashboard
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

     // Replace the existing /callback route with this implementation
this.app.get('/callback', async (req, res) => {
    const { code, state } = req.query;
    
    console.log('Callback received:', {
        hasState: !!state,
        sessionState: req.session?.spotifyState,
        sessionID: req.sessionID
    });

    try {
        // Basic validation
        if (!req.session) {
            throw new Error('No session found');
        }

        if (!req.isAuthenticated()) {
            return res.redirect('/auth/discord');
        }

        // State validation with detailed logging
        if (!state || !req.session.spotifyState) {
            console.error('Missing state:', {
                queryState: state,
                sessionState: req.session.spotifyState
            });
            return res.redirect('/dashboard?error=invalid_state');
        }

        if (state !== req.session.spotifyState) {
            console.error('State mismatch:', {
                queryState: state,
                sessionState: req.session.spotifyState
            });
            return res.redirect('/dashboard?error=state_mismatch');
        }

        // Get tokens
        const tokens = await this.spotifyAuthHandler.handleCallback(code);
        
        // Get user profile
        this.spotifyAuthHandler.spotifyApi.setAccessToken(tokens.accessToken);
        const profile = await this.spotifyAuthHandler.getUserProfile(tokens.accessToken);

        // Find session in user's sessions array or create it if it doesn't exist
        let session = req.user.sessions.find(s => s.sessionId === req.sessionID);
        
        if (!session) {
            // Create a new session entry if one doesn't exist
            session = {
                sessionId: req.sessionID,
                ip: req.ip || req.header('X-Client-IP') || 'unknown',
                isActive: true,
                createdAt: new Date(),
                lastActive: new Date()
            };
            req.user.sessions.push(session);
            console.log('Created new session for user:', {
                sessionId: req.sessionID,
                username: req.user.username,
                totalSessions: req.user.sessions.length
            });
        }

        // Update session with Spotify data
        session.spotify = {
            accessToken: tokens.accessToken,
            refreshToken: tokens.refreshToken,
            expiresAt: new Date(Date.now() + tokens.expiresIn * 1000),
            profile: profile
        };

        // Save changes
        await req.user.save();

        // Clear state and redirect
        delete req.session.spotifyState;
        
        const returnTo = req.session.returnTo || '/dashboard';
        delete req.session.returnTo;
        
        // Force session save before redirect
        req.session.save((err) => {
            if (err) {
                console.error('Session save error:', err);
                return res.redirect('/error?message=session_error');
            }
            res.redirect(returnTo);
        });

    } catch (error) {
        console.error('Spotify callback error:', error);
        res.redirect('/error?message=' + encodeURIComponent(error.message));
    }
});

        // Logout route
        this.app.post('/logout', (req, res, next) => {
            if (req.user && req.sessionID) {
                // Mark this session as inactive
                const session = req.user.sessions.find(s => s.sessionId === req.sessionID);
                if (session) {
                    session.isActive = false;
                    req.user.save().catch(err => console.error('Error saving user on logout:', err));
                }
            }
            
            req.logout(function (err) {
                if (err) { return next(err); }
                req.session.destroy(() => {
                    res.clearCookie('connect.sid');
                    res.redirect('/');
                });
            });
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
        const clientIp = req.header('X-Client-IP') || req.ip;

        if (!user) {
            user = new User({
                discordId: profile.id,
                username: profile.username,
                email: profile.email,
                avatar: profile.avatar,
                sessions: []
            });
        }

        // Update user info
        user.username = profile.username;
        user.email = profile.email;
        user.avatar = profile.avatar;

        // Clean up duplicate sessions
        user.sessions = user.sessions.filter(s => s.isActive);
        
        // Find or create session
        let session = user.sessions.find(s => s.sessionId === req.sessionID);
        if (!session) {
            session = {
                sessionId: req.sessionID,
                ip: clientIp,
                isActive: true,
                createdAt: new Date(),
                lastActive: new Date()
            };
            user.sessions.push(session);
        }

        await user.save();
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