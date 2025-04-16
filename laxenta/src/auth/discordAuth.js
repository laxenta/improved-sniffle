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
            let user = await User.findOne({ discordId: profile.id });
    
            if (!user) {
                user = new User({
                    discordId: profile.id,
                    username: profile.username,
                    email: profile.email,
                    avatar: profile.avatar
                });
            }
    
            // Update basic info
            user.username = profile.username;
            user.email = profile.email;
            user.avatar = profile.avatar;
            user.lastActive = new Date();

               // Force cleanup if too many sessions
        if (user.sessions?.length > 3) {
            await user.cleanupSessions();
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