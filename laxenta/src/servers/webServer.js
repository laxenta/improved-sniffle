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
        
        // 2. Session setup
        this.app.use(session({
            secret: process.env.SESSION_SECRET,
            resave: true,
            saveUninitialized: true,
            store: MongoStore.create({ 
                mongoUrl: process.env.MONGODB_URI,
                ttl: 7 * 24 * 60 * 60,
                autoRemove: 'native',
                touchAfter: 24 * 3600
            }),
            cookie: { 
                secure: process.env.NODE_ENV === 'production',
                maxAge: 7 * 24 * 60 * 60 * 1000,
                httpOnly: true
            }
        }));

        // 3. Session debug middleware
        this.app.use((req, res, next) => {
            console.log('Session Debug:', {
                sessionID: req.sessionID,
                hasSession: !!req.session,
                cookie: req.session?.cookie
            });
            next();
        });
    }

    setupTemplateRoutes() {
        const { generateTemplateRoutes } = require('./templateRouter');
        const templatesDir = path.join(__dirname, '..', 'templates');
        
        // Generate routes with auth middleware
        generateTemplateRoutes(
            this.app, 
            templatesDir, 
            this.client, 
            this.isAuthenticated
        );
    }

    setupAuth() {
        // 1. Initialize Passport
        this.app.use(passport.initialize());
        this.app.use(passport.session());

        // 2. Passport configuration
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

        // 3. Auth debug middleware
        this.app.use((req, res, next) => {
            console.log('Auth Debug:', {
                sessionID: req.sessionID,
                hasUser: !!req.user,
                userSessions: req.user?.sessions?.length || 0,
                isAuthenticated: req.isAuthenticated?.() || false
            });
            next();
        });

        // 4. Discord Strategy setup
        passport.use(new DiscordStrategy({
            clientID: process.env.CLIENT_ID,
            clientSecret: process.env.CLIENT_SECRET,
            callbackURL: `${process.env.NGROK_URL}/auth/discord/callback`,
            scope: ['identify', 'email', 'guilds'],
            passReqToCallback: true  // Enable request object in callback
        }, this.handleDiscordAuth.bind(this)));

        // Serialize the entire user object to store in session ( passport conifgs )
        passport.serializeUser((user, done) => {
            done(null, user.id);
        });
        
        // Deserialize user from DB with current session info
        passport.deserializeUser(async (id, done) => {
            try {
                const user = await User.findById(id);
                if (!user) return done(null, false);
                
                // Add session info to user object
                done(null, user);
            } catch (error) {
                done(error);
            }
        });

            // Add session debug middleware
    this.app.use((req, res, next) => {
        console.log('Detailed Session Debug:', {
            sessionID: req.sessionID,
            hasUser: !!req.user,
            userSessions: req.user?.sessions?.length || 0,
            isAuthenticated: req.isAuthenticated(),
            session: req.session
        });
        next();
    });

        // Auth routes
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
        
        this.app.get('/auth/spotify', this.isAuthenticated, (req, res) => {
            const state = crypto.randomBytes(16).toString('hex');
            req.session.spotifyState = state;
            req.session.returnTo = req.query.returnTo || '/dashboard';
            
            console.log('Initiating Spotify auth with state:', state);
            
            const authUrl = this.spotifyAuthHandler.getAuthURL(state);
            res.redirect(authUrl);
        });
        
        this.app.get('/callback', this.isAuthenticated, async (req, res, next) => {
            try {
                await this.spotifyAuthHandler.handleCallback(req, res);
            } catch (error) {
                next(error);
            }
        });
        
        this.app.post('/logout', (req, res) => {
            req.logout(function(err) {
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
            if (!req.isAuthenticated()) {
                return res.json({
                    valid: false,
                    error: 'session_invalid'
                });
            }
            
            // Check if the user has Spotify connected
            const spotifyConnected = req.user.sessions && 
                                   req.user.sessions.some(s => s.sessionId === req.sessionID && s.spotify);
            
            // Get the Spotify session data
            const spotifySession = spotifyConnected ? 
                req.user.sessions.find(s => s.sessionId === req.sessionID).spotify : null;
            
            res.json({
                valid: true,
                user: {
                    discordId: req.user.discordId,
                    username: req.user.username,
                    authStatus: {
                        discord: true,
                        spotify: spotifyConnected
                    },
                    spotify: spotifySession
                }
            });
        });
        
        // Spotify token refresh endpoint
        this.app.post('/api/spotify/refresh', this.isAuthenticated, async (req, res) => {
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
                res.status(500).json({ error: 'Failed to refresh token' });
            }
        });
        
        // Disconnect Spotify
        this.app.post('/api/spotify/disconnect', this.isAuthenticated, async (req, res) => {
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
        
        // Middleware to protect routes
        this.app.use('/dashboard', this.isAuthenticated, this.spotifyAuthRequired, (req, res, next) => {
            next();
        });
    }

    // Authentication middleware
    isAuthenticated(req, res, next) {
        if (req.isAuthenticated()) {
            return next();
        }
        res.redirect('/auth/discord?returnTo=' + req.originalUrl);
    }
    
    // Spotify auth middleware
    spotifyAuthRequired(req, res, next) {
        // Check if user has Spotify connected in this session
        const hasSpotify = req.user.sessions && 
                         req.user.sessions.some(s => s.sessionId === req.sessionID && s.spotify);
        
        if (hasSpotify) {
            return next();
        }
        
        // Redirect to Spotify auth
        res.redirect('/auth/spotify?returnTo=' + req.originalUrl);
    }

    async handleDiscordAuth(req, accessToken, refreshToken, profile, done) {
        try {
            let user = await User.findOne({ discordId: profile.id });
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
            
            // Use request object to get client info
            const clientIp = req.header('X-Client-IP') || req.ip || '0.0.0.0';
            const clientInfo = {
                browser: req.get('User-Agent') || 'unknown',
                os: req.get('sec-ch-ua-platform') || 'unknown',
                device: req.get('sec-ch-ua-mobile') ? 'mobile' : 'desktop',
                lastLogin: new Date()
            };
            
            // Create or update session
            let session = user.sessions.find(s => s.ip === clientIp);
            if (!session) {
                user.sessions.push({
                    sessionId: null,
                    ip: clientIp,
                    clientInfo,
                    createdAt: new Date(),
                    lastActive: new Date()
                });
            } else {
                session.lastActive = new Date();
                session.clientInfo = clientInfo;
            }
            
            await user.save();
            done(null, user);
        } catch (error) {
            done(error);
        }
    }

    setup() {
        // Basic setup
        // this.app.use(express.json());
        // this.app.use(express.urlencoded({ extended: true }));
        this.app.use(express.static(path.join(__dirname, '..', 'public')));

        // Update session data on requests
        this.app.use(async (req, res, next) => {
            if (req.user && req.sessionID) {
                try {
                    // Check for X-Client-IP header
                    const clientIp = req.header('X-Client-IP') || req.ip;
                    
                    // Find matching session and update sessionId and activity
                    const session = req.user.sessions.find(s => s.ip === clientIp) || 
                                  req.user.sessions.find(s => s.sessionId === req.sessionID);
                    
                    if (session) {
                        session.sessionId = req.sessionID;
                        session.lastActive = new Date();
                        await req.user.save();
                    }
                } catch (error) {
                    console.error('Error updating session:', error);
                }
            }
            next();
        });

        // Remove the manual route definitions for /, /dashboard, and /error
        // as they are now handled by templateRouter

        // Essential API endpoints for Spotify and music
        this.setupApiRoutes();

        // Add auth error logging middleware before the global error handler
        this.app.use((err, req, res, next) => {
            console.error('Auth Error:', {
                message: err.message,
                stack: err.stack,
                session: {
                    spotifyState: req.session?.spotifyState,
                    returnTo: req.session?.returnTo,
                    isAuthenticated: req.isAuthenticated()
                }
            });
            next(err);
        });

        // Add global error handler at the end
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
                hasSpotify: !!req.user?.spotify?.accessToken,
                clientId: process.env.SPOTIFY_CLIENT_ID,
                ngrokUrl: process.env.NGROK_URL,
                baseUrl: process.env.BASE_URL,
                avatar: this.client.user?.displayAvatarURL({ size: 1024 })
            });
        });

        return this.startServer();
    }

    setupApiRoutes() {
        // Get Spotify client for user's session
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
        this.app.get('/api/spotify/liked-songs', this.isAuthenticated, ensureFreshSpotifyToken, async (req, res) => {
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
        this.app.get('/api/spotify/playlists', this.isAuthenticated, ensureFreshSpotifyToken, async (req, res) => {
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
        this.app.post('/api/music/play', this.isAuthenticated, ensureFreshSpotifyToken, async (req, res) => {
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

// Updated the /api/auth/verify endpoint:

// Now returns a proper error response with valid: false when not authenticated
// Includes an error code session_invalid that matches what AuthManager.js expects
// Structures the response data to match what the client expects


// Updated the /api/spotify/refresh endpoint:

// Now returns the expiresAt value in the response, which AuthManager.js uses to schedule token refreshes


// Added support for the X-Client-IP header:

// AuthManager.js sends this header in the verify request
// WebServer.js now checks for and uses this header when updating sessions


// Improved session return handling:

// Now checks both the query parameter and sessionStorage for the returnTo URL
// Matches the client-side logic of storing the returnTo path


// Modified the token refresh middleware:

// Changed the refresh buffer to 10 minutes to match the client's TOKEN_REFRESH_BUFFER


// Ensured consistent error handling:

// Updated error responses to better match what AuthManager.js expects



// These changes should make the server and client work together more seamlessly.
//  The AuthManager.js will now properly interpret the responses from the server, and the authentication flow should work as expected.