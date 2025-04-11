const passport = require('passport');
const { Strategy: DiscordStrategy } = require('passport-discord');
const User = require('../models/User');

class DiscordAuthManager {
    constructor(config) {
        this.clientId = config.clientId;
        this.clientSecret = config.clientSecret;
        this.baseUrl = config.baseUrl;
        this.callbackURL = `${this.baseUrl}/auth/discord/callback`;
        
        // Initialize passport strategy
        this.initializeStrategy();
    }

    initializeStrategy() {
        passport.use(new DiscordStrategy({
            clientID: this.clientId,
            clientSecret: this.clientSecret,
            callbackURL: this.callbackURL,
            scope: ['identify', 'email']
        }, this.handleAuth.bind(this)));

        // Serialize and deserialize user
        passport.serializeUser((user, done) => {
            done(null, user.id);
        });

        passport.deserializeUser(async (id, done) => {
            try {
                const user = await User.findById(id);
                done(null, user);
            } catch (error) {
                done(error);
            }
        });
    }

    async handleAuth(accessToken, refreshToken, profile, done) {
        try {
            // Store IP in session to retrieve in the webserver's handleDiscordAuth
            const req = arguments[3]; // passport-discord passes req as the 4th arg
            
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

            // Clean up inactive sessions
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
            } else {
                session.lastActive = new Date();
            }

            await user.save();
            done(null, user);

        } catch (error) {
            console.error('Discord auth error:', error);
            done(error);
        }
    }

    setupRoutes(app) {
        // Passport middleware already set up in WebServer
    }

    isAuthenticated(req, res, next) {
        if (req.isAuthenticated()) {
            return next();
        }
        
        // Store current URL to redirect back after auth
        if (req.session) {
            req.session.returnTo = req.originalUrl;
        }
        
        res.redirect('/auth/discord');
    }
}

module.exports = DiscordAuthManager;