const passport = require('passport');
const DiscordStrategy = require('passport-discord').Strategy;
const User = require('../models/User');
const fetch = require('node-fetch');

class DiscordAuthHandler {
    constructor(config) {
        this.config = config;
        this.setupStrategy();
    }

    setupStrategy() {
        passport.use(new DiscordStrategy({
            clientID: this.config.discord.clientId,
            clientSecret: this.config.discord.clientSecret,
            callbackURL: `${this.config.baseUrl}/auth/discord/callback`,
            scope: ['identify', 'guilds'],
            passReqToCallback: true
        }, this.handleAuth.bind(this)));

        passport.serializeUser((user, done) => done(null, user.id));
        passport.deserializeUser((id, done) => User.findById(id).then(user => done(null, user)));
    }

    async handleAuth(req, accessToken, refreshToken, profile, done) {
        try {
            let user = await User.findOne({ discordId: profile.id });
            const userData = {
                discordId: profile.id,
                username: profile.username,
                avatar: profile.avatar,
                guilds: profile.guilds,
                discord: { 
                    accessToken, 
                    refreshToken,
                    tokenExpires: Date.now() + 604800000 // Discord tokens expire in 7 days
                },
                authStatus: { discord: true }
            };

            if (!user) {
                user = await User.create(userData);
            } else {
                Object.assign(user, userData);
                await user.save();
            }

            // Generate session token
            const sessionToken = await user.generateSessionToken(
                req.headers['user-agent'] || 'unknown',
                user.discordId
            );

            req.session.userToken = sessionToken;
            req.session.userId = user.id;
            
            return done(null, user);
        } catch (error) {
            console.error('Discord auth error:', error);
            return done(error);
        }
    }

    async refreshDiscordToken(user) {
        try {
            const tokenData = await fetch('https://discord.com/api/oauth2/token', {
                method: 'POST',
                body: new URLSearchParams({
                    client_id: this.config.discord.clientId,
                    client_secret: this.config.discord.clientSecret,
                    grant_type: 'refresh_token',
                    refresh_token: user.discord.refreshToken
                }),
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded'
                }
            });

            const tokens = await tokenData.json();

            if (tokens.error) {
                throw new Error(tokens.error);
            }

            // Update user tokens
            user.discord = {
                accessToken: tokens.access_token,
                refreshToken: tokens.refresh_token,
                tokenExpires: Date.now() + 604800000
            };

            await user.save();
            return tokens.access_token;
        } catch (error) {
            console.error('Token refresh error:', error);
            throw error;
        }
    }

    verifySession(req, res, next) {
        if (!req.isAuthenticated()) {
            req.session.returnTo = req.originalUrl;
            return res.redirect('/auth/discord');
        }

        if (!req.session.userToken) {
            return res.redirect('/auth/discord');
        }

        next();
    }

    async clearSession(req) {
        if (req.user) {
            await User.updateOne(
                { discordId: req.user.discordId },
                { $set: { 'sessions.$[].isActive': false } }
            );
        }
        
        return new Promise((resolve) => req.session.destroy(resolve));
    }

    getRoutes(app) {
        // Add session verification endpoint
        app.get('/api/auth/verify-discord-session', (req, res) => {
            if (!req.session || !req.user) {
                return res.json({
                    valid: false,
                    needsAuth: true,
                    error: 'No Discord session found'
                });
            }
            
            return res.json({
                valid: true,
                user: {
                    discordId: req.user.discordId,
                    username: req.user.username,
                    avatar: req.user.avatar
                }
            });
        });

        // Handle returnTo parameter
        app.get('/auth/discord', (req, res) => {
            if (req.query.returnTo) {
                req.session.returnTo = req.query.returnTo;
            }
            passport.authenticate('discord')(req, res);
        });
        
        app.get('/auth/discord/callback', 
            passport.authenticate('discord', { 
                failureRedirect: '/error'
            }),
            (req, res) => {
                // Always redirect to dashboard first
                const returnTo = '/dashboard';  // Force dashboard as initial landing
                res.redirect(returnTo);
            }
        );

        app.get('/logout', async (req, res) => {
            await this.clearSession(req);
            res.clearCookie('connect.sid');
            res.redirect('/');
        });
    }

    // Middleware factory for protected routes
    protect() {
        return async (req, res, next) => {
            if (!req.isAuthenticated()) {
                req.session.returnTo = req.originalUrl;
                return res.redirect('/auth/discord');
            }

            const token = req.session.userToken;
            if (!token) {
                return res.redirect('/auth/discord');
            }

            try {
                const user = await User.findOne({
                    'sessions.token': token,
                    'sessions.isActive': true
                });

                if (!user) {
                    await this.clearSession(req);
                    return res.redirect('/auth/discord');
                }

                // Check if token needs refresh (24 hours before expiry)
                if (user.discord?.tokenExpires && user.discord.tokenExpires - Date.now() < 86400000) {
                    try {
                        await this.refreshDiscordToken(user);
                    } catch (error) {
                        console.error('Token refresh failed:', error);
                        await this.clearSession(req);
                        return res.redirect('/auth/discord');
                    }
                }

                next();
            } catch (error) {
                console.error('Auth verification error:', error);
                res.redirect('/auth/discord');
            }
        };
    }

    setLocals() {
        return (req, res, next) => {
            res.locals.isAuthenticated = !!req.user;
            res.locals.user = req.user;
            res.locals.hasSpotify = !!req.user?.spotify?.accessToken;
            next();
        };
    }
}

module.exports = DiscordAuthHandler;
