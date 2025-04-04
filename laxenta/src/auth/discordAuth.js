// discordAuth.js
const passport = require('passport');
const { Strategy: DiscordStrategy } = require('passport-discord');
const User = require('../models/User');

class DiscordAuthManager {
    constructor(config) {
        this.config = config;
        this.initializePassport();
    }

    // Set up Passport configuration for Discord OAuth
    initializePassport() {
        // Configure serialization/deserialization
        passport.serializeUser((user, done) => {
            done(null, user.id);
        });

        passport.deserializeUser(async (id, done) => {
            try {
                const user = await User.findById(id);
                done(null, user || false);
            } catch (error) {
                done(error);
            }
        });

        // Set up Discord strategy
        passport.use(new DiscordStrategy({
            clientID: this.config.clientId,
            clientSecret: this.config.clientSecret,
            callbackURL: `${this.config.baseUrl}/auth/discord/callback`,
            scope: ['identify', 'email', 'guilds'],
            passReqToCallback: true
        }, this.handleAuth.bind(this)));
    }

    // Main authentication handler
    async handleAuth(req, accessToken, refreshToken, profile, done) {
        try {
            // Find or create user
            let user = await User.findOne({ discordId: profile.id });
            const sessionId = req.sessionID;
            
            // Basic client info
            const clientInfo = {
                ip: req.header('X-Client-IP') || req.ip || '0.0.0.0',
                userAgent: req.get('User-Agent') || 'unknown',
                lastActive: new Date()
            };

            // Create new user if doesn't exist
            if (!user) {
                user = new User({
                    discordId: profile.id,
                    username: profile.username,
                    email: profile.email,
                    avatar: this.getAvatarUrl(profile),
                    sessions: []
                });
            } else {
                // Update existing user basic info
                user.username = profile.username;
                user.email = profile.email;
                user.avatar = this.getAvatarUrl(profile);
            }

            // Handle session management
            await this.manageUserSession(user, sessionId, clientInfo);
            
            done(null, user);
        } catch (error) {
            console.error('Discord auth error:', error);
            done(error);
        }
    }

    // Helper to get Discord avatar URL
    getAvatarUrl(profile) {
        return profile.avatar 
            ? `https://cdn.discordapp.com/avatars/${profile.id}/${profile.avatar}.png`
            : null;
    }

    // Session management helper
    async manageUserSession(user, sessionId, clientInfo) {
        // Find existing session or create new one
        let session = user.sessions.find(s => s.sessionId === sessionId);
        
        if (session) {
            // Update existing session
            session.lastActive = new Date();
            session.clientInfo = clientInfo;
            session.isActive = true;
        } else {
            // Create new session
            user.sessions.push({
                sessionId,
                ip: clientInfo.ip,
                clientInfo,
                isActive: true,
                createdAt: new Date(),
                lastActive: new Date()
            });
        }
        
        // Clean up old sessions (older than 2 weeks)
        const twoWeeksAgo = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000);
        user.sessions = user.sessions.filter(s => 
            s.isActive || (s.lastActive && s.lastActive > twoWeeksAgo)
        );

        // Save user with updated sessions
        await user.save();
        return user;
    }

    // Set up auth routes
    setupRoutes(app) {
        // Discord login route
        app.get('/auth/discord', (req, res, next) => {
            const returnTo = req.query.returnTo || '/dashboard';
            req.session.returnTo = returnTo;
            passport.authenticate('discord')(req, res, next);
        });

        // Discord callback route
        app.get('/auth/discord/callback',
            passport.authenticate('discord', { failureRedirect: '/login' }),
            (req, res) => {
                const returnTo = req.session.returnTo || '/dashboard';
                delete req.session.returnTo;
                res.redirect(returnTo);
            }
        );

        // Logout route
        app.post('/logout', (req, res, next) => {
            if (req.user && req.sessionID) {
                const session = req.user.sessions.find(s => s.sessionId === req.sessionID);
                if (session) {
                    session.isActive = false;
                    req.user.save().catch(err => console.error('Logout save error:', err));
                }
            }
            
            req.logout(function(err) {
                if (err) return next(err);
                req.session.destroy(() => {
                    res.clearCookie('connect.sid');
                    res.redirect('/');
                });
            });
        });

        return app;
    }

    // Authentication middleware
    isAuthenticated(req, res, next) {
        if (req.isAuthenticated()) {
            return next();
        }
        res.redirect('/auth/discord?returnTo=' + encodeURIComponent(req.originalUrl));
    }
}

module.exports = DiscordAuthManager;