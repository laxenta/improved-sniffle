const express = require('express');
const session = require('express-session');
const passport = require('passport');
const path = require('path');
const { Strategy: DiscordStrategy } = require('passport-discord');
const SpotifyAuthHandler = require('../auth/spotifyAuth');
const User = require('../models/User');
const MongoStore = require('connect-mongo');
const crypto = require('crypto');

class WebServer {
    constructor(client) {
        this.client = client;
        this.app = express();

        // Initialize SpotifyAuthHandler
        this.spotifyAuthHandler = new SpotifyAuthHandler({
            spotify: {
                clientId: process.env.SPOTIFY_CLIENT_ID,
                clientSecret: process.env.SPOTIFY_CLIENT_SECRET
            },
            baseUrl: process.env.NGROK_URL
        });

        // Set up view engine early
        this.app.set('view engine', 'ejs');
        this.app.set('views', path.join(__dirname, '..', 'templates'));

        // Set up middleware and auth first
        this.setupMiddleware();
        this.setupAuth();
        this.setupTemplateRoutes();
        this.setup();
    }

    setupMiddleware() {
        // 1. Basic middleware first
        this.app.use(express.json());
        this.app.use(express.urlencoded({ extended: true }));

        // 2. Session setup with consistent settings
        this.app.use(session({
            secret: process.env.SESSION_SECRET,
            resave: false, // Changed to false to prevent unnecessary rewrites
            saveUninitialized: false, // Changed to false for better session handling
            store: MongoStore.create({
                mongoUrl: process.env.MONGODB_URI,
                ttl: 14 * 24 * 60 * 60, // 14 days
                autoRemove: 'native',
                touchAfter: 24 * 3600
            }),
            cookie: {
                secure: process.env.NODE_ENV === 'production',
                maxAge: 14 * 24 * 60 * 60 * 1000, // 14 days
                httpOnly: true
            }
        }));

        // 3. Debug middleware (optional, for development only)
        if (process.env.NODE_ENV !== 'production') {
            this.app.use((req, res, next) => {
                console.log('Session Debug:', {
                    sessionID: req.sessionID,
                    hasSession: !!req.session,
                    cookie: req.session?.cookie
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
        // 1. Initialize Passport
        this.app.use(passport.initialize());
        this.app.use(passport.session());

        // 2. Passport configuration - Only configure once
        passport.serializeUser((user, done) => {
            done(null, user.id);
        });

        passport.deserializeUser(async (id, done) => {
            try {
                const user = await User.findById(id);
                if (!user) return done(null, false);
                done(null, user);
            } catch (error) {
                done(error);
            }
        });

        // 3. Auth debug middleware (for development only)
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

        // 4. Discord Strategy setup
        passport.use(new DiscordStrategy({
            clientID: process.env.CLIENT_ID,
            clientSecret: process.env.CLIENT_SECRET,
            callbackURL: `${process.env.NGROK_URL}/auth/discord/callback`,
            scope: ['identify', 'email', 'guilds'],
            passReqToCallback: true  // Enable request object in callback
        }, this.handleDiscordAuth.bind(this)));

        // 5. Set up auth routes
        this.setupAuthRoutes();
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
            const state = crypto.randomBytes(16).toString('hex');
            req.session.spotifyState = state;
            req.session.returnTo = req.query.returnTo || '/dashboard';
            req.session.save((err) => {
                if (err) {
                    console.error('Session save error before Spotify auth:', err);
                    return res.redirect('/error?message=session_error');
                }
                
                console.log('Initiating Spotify auth with state:', state);
                const authUrl = this.spotifyAuthHandler.getAuthURL(state);
                res.redirect(authUrl);
            });
        });

        // Spotify callback - completely refactored for reliability
        this.app.get('/callback', async (req, res, next) => {
            try {
                const { code, state } = req.query;
                
                // 1. Basic validation
                if (!req.isAuthenticated() || !req.user) {
                    console.error('No authenticated user for Spotify callback');
                    return res.redirect('/auth/discord');
                }
                
                if (!state || !req.session.spotifyState) {
                    console.error('Missing state parameters:', {
                        queryState: state,
                        sessionState: req.session.spotifyState
                    });
                    return res.redirect('/dashboard');
                }
                
                // 2. State validation
                if (state !== req.session.spotifyState) {
                    console.error('State mismatch:', {
                        queryState: state,
                        sessionState: req.session.spotifyState
                    });
                    return res.redirect('/dashboard?error=state_mismatch');
                }
                
                // 3. Get Spotify tokens
                const data = await this.spotifyAuthHandler.spotifyApi.authorizationCodeGrant(code);
                const accessToken = data.body.access_token;
                const refreshToken = data.body.refresh_token;
                const expiresIn = data.body.expires_in;
                
                // 4. Get Spotify user profile
                this.spotifyAuthHandler.spotifyApi.setAccessToken(accessToken);
                const spotifyUser = await this.spotifyAuthHandler.spotifyApi.getMe();
                
                // 5. Find the user's current session
                let userSession = req.user.sessions.find(s => s.sessionId === req.sessionID);
                
                // 6. If no session exists for this sessionId, create one
                if (!userSession) {
                    console.log('Creating new session for user:', {
                        userId: req.user.id,
                        sessionId: req.sessionID
                    });
                    
                    userSession = {
                        sessionId: req.sessionID,
                        ip: req.header('X-Client-IP') || req.ip,
                        clientInfo: {
                            browser: req.get('User-Agent') || 'unknown',
                            lastActive: new Date()
                        },
                        createdAt: new Date(),
                        lastActive: new Date()
                    };
                    
                    req.user.sessions.push(userSession);
                }
                
                // 7. Update session with Spotify data
                userSession.spotify = {
                    accessToken: accessToken,
                    refreshToken: refreshToken,
                    expiresAt: new Date(Date.now() + expiresIn * 1000),
                    userId: spotifyUser.body.id,
                    profile: {
                        id: spotifyUser.body.id,
                        displayName: spotifyUser.body.display_name,
                        email: spotifyUser.body.email
                    }
                };
                userSession.lastActive = new Date();
                
                // 8. Save user with updated session
                await req.user.save();
                
                // 9. Update template data
                req.app.locals.currentSession = {
                    id: req.sessionID,
                    hasSpotify: true
                };
                
                // 10. Clean up session and redirect
                const returnTo = req.session.returnTo || '/dashboard';
                delete req.session.spotifyState;
                delete req.session.returnTo;
                req.session.spotifySuccess = true;
                
                req.session.save((err) => {
                    if (err) {
                        console.error('Session save error after Spotify auth:', err);
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

    // Authentication middleware
    isAuthenticated(req, res, next) {
        if (req.isAuthenticated()) {
            return next();
        }
        res.redirect('/auth/discord?returnTo=' + encodeURIComponent(req.originalUrl));
    }

    // Spotify auth middleware - checks if Spotify is connected for this session
    spotifyAuthMiddleware(req, res, next) {
        if (!req.user) {
            return res.redirect('/auth/discord?returnTo=' + encodeURIComponent(req.originalUrl));
        }

        // Get the current session
        const currentSession = req.user.sessions.find(s => s.sessionId === req.sessionID);
        
        // Check if Spotify is connected for this session
        if (currentSession && currentSession.spotify) {
            // Session has Spotify connected, proceed
            return next();
        }
        
        // Store current URL for redirect after auth
        req.session.returnTo = req.originalUrl;
        
        // Redirect to Spotify auth
        res.redirect('/auth/spotify?returnTo=' + encodeURIComponent(req.originalUrl));
    }

    async handleDiscordAuth(req, accessToken, refreshToken, profile, done) {
        try {
            // Find or create user
            let user = await User.findOne({ discordId: profile.id });
            
            // Get client info for session tracking
            const clientIp = req.header('X-Client-IP') || req.ip || '0.0.0.0';
            const clientInfo = {
                browser: req.get('User-Agent') || 'unknown',
                os: req.get('sec-ch-ua-platform') || 'unknown',
                device: req.get('sec-ch-ua-mobile') ? 'mobile' : 'desktop',
                lastLogin: new Date()
            };

            // Create user if not exists
            if (!user) {
                user = new User({
                    discordId: profile.id,
                    username: profile.username,
                    email: profile.email,
                    avatar: profile.avatar ?
                        `https://cdn.discordapp.com/avatars/${profile.id}/${profile.avatar}.png` :
                        null,
                    sessions: []
                });
            }

            // Update basic user info
            user.username = profile.username;
            user.email = profile.email;
            user.avatar = profile.avatar ?
                `https://cdn.discordapp.com/avatars/${profile.id}/${profile.avatar}.png` :
                null;

            // Find existing session by sessionID or IP
            let session = user.sessions.find(s => s.sessionId === req.sessionID || s.ip === clientIp);
            
            if (session) {
                // Update existing session
                session.sessionId = req.sessionID; // Always update with current sessionID
                session.ip = clientIp;
                session.clientInfo = clientInfo;
                session.lastActive = new Date();
                session.isActive = true;
            } else {
                // Create new session
                session = {
                    sessionId: req.sessionID,
                    ip: clientIp,
                    clientInfo,
                    isActive: true,
                    createdAt: new Date(),
                    lastActive: new Date()
                };
                user.sessions.push(session);
            }
            
            // Clean up old/inactive sessions - keep only active ones and those less than 2 weeks old
            const twoWeeksAgo = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000);
            user.sessions = user.sessions.filter(s => 
                s.isActive || (s.lastActive && new Date(s.lastActive) > twoWeeksAgo)
            );

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
            if (!req.user || !req.sessionID) {
                throw new Error('User not authenticated');
            }

            const session = req.user.sessions.find(s => s.sessionId === req.sessionID);
            if (!session || !session.spotify || !session.spotify.accessToken) {
                throw new Error('Spotify not connected for this session');
            }

            const spotifyApi = new this.spotifyAuthHandler.spotifyApi.constructor({
                clientId: process.env.SPOTIFY_CLIENT_ID,
                clientSecret: process.env.SPOTIFY_CLIENT_SECRET,
                redirectUri: `${process.env.NGROK_URL}/callback`
            });

            spotifyApi.setAccessToken(session.spotify.accessToken);
            return spotifyApi;
        };

        // Middleware to ensure Spotify tokens are fresh
        const ensureFreshSpotifyToken = async (req, res, next) => {
            if (!req.user || !req.sessionID) {
                return res.status(401).json({ error: 'Not authenticated' });
            }

            try {
                const session = req.user.sessions.find(s => s.sessionId === req.sessionID);
                if (!session || !session.spotify) {
                    return res.status(401).json({ error: 'Spotify not connected' });
                }

                // Check if token is expired or about to expire (within 10 minutes)
                const expiresAt = new Date(session.spotify.expiresAt);
                if (expiresAt < new Date(Date.now() + 10 * 60 * 1000)) {
                    await this.spotifyAuthHandler.refreshToken(req.user, session);
                }

                next();
            } catch (error) {
                res.status(401).json({ error: 'Failed to refresh Spotify token' });
            }
        };

        // Liked songs with fresh token check
        this.app.get('/api/spotify/liked-songs', this.isAuthenticated.bind(this), ensureFreshSpotifyToken, async (req, res) => {
            try {
                const spotifyApi = getSpotifyClientForUser(req);
                const data = await spotifyApi.getMySavedTracks({ limit: 50 });
                res.json(data.body.items);
            } catch (error) {
                console.error('Failed to fetch liked songs:', error);
                res.status(500).json({ error: 'Failed to fetch liked songs' });
            }
        });

        // Playlists with fresh token check
        this.app.get('/api/spotify/playlists', this.isAuthenticated.bind(this), ensureFreshSpotifyToken, async (req, res) => {
            try {
                const spotifyApi = getSpotifyClientForUser(req);
                const data = await spotifyApi.getUserPlaylists();
                res.json(data.body.items);
            } catch (error) {
                console.error('Failed to fetch playlists:', error);
                res.status(500).json({ error: 'Failed to fetch playlists' });
            }
        });

        // Play in Discord
        this.app.post('/api/music/play', this.isAuthenticated.bind(this), ensureFreshSpotifyToken, async (req, res) => {
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
        this.app.listen(port, () => console.log(`Server running on port ${port}`));
    }
}

module.exports = WebServer;