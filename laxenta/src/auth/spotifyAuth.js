// spotifyAuth.js
const SpotifyWebApi = require('spotify-web-api-node');
const crypto = require('crypto');

class SpotifyAuthManager {
    constructor(config) {
        this.config = config;
        this.spotifyApi = new SpotifyWebApi({
            clientId: config.spotify.clientId,
            clientSecret: config.spotify.clientSecret,
            redirectUri: `${config.baseUrl}/callback`
        });
    }

    // Get authentication URL with state for security
    getAuthURL(state) {
        const scopes = [
            'user-read-private',
            'user-read-email',
            'user-library-read',
            'playlist-read-private',
            'playlist-read-collaborative'
        ];
        
        return this.spotifyApi.createAuthorizeURL(scopes, state);
    }

    // Handle the OAuth callback
    async handleCallback(code) {
        const data = await this.spotifyApi.authorizationCodeGrant(code);
        
        return {
            accessToken: data.body.access_token,
            refreshToken: data.body.refresh_token,
            expiresIn: data.body.expires_in
        };
    }

    // Get user profile once authenticated
    async getUserProfile(accessToken) {
        this.spotifyApi.setAccessToken(accessToken);
        const response = await this.spotifyApi.getMe();
        
        return {
            id: response.body.id,
            displayName: response.body.display_name,
            email: response.body.email
        };
    }

    // Refresh an expired token
    async refreshToken(user, session) {
        if (!session.spotify || !session.spotify.refreshToken) {
            throw new Error('No refresh token available');
        }
        
        this.spotifyApi.setRefreshToken(session.spotify.refreshToken);
        const data = await this.spotifyApi.refreshAccessToken();
        
        // Update session with new token info
        session.spotify.accessToken = data.body.access_token;
        session.spotify.expiresAt = new Date(Date.now() + data.body.expires_in * 1000);
        
        // Save user with updated session
        await user.save();
        
        return {
            accessToken: data.body.access_token,
            expiresAt: session.spotify.expiresAt
        };
    }

    // Create a client for a specific user session
    createClientForUser(session) {
        if (!session || !session.spotify) {
            throw new Error('No Spotify connection in this session');
        }
        
        const spotifyApi = new SpotifyWebApi({
            clientId: this.config.spotify.clientId,
            clientSecret: this.config.spotify.clientSecret,
            redirectUri: `${this.config.baseUrl}/callback`
        });
        
        spotifyApi.setAccessToken(session.spotify.accessToken);
        return spotifyApi;
    }

    // Set up Spotify auth routes
    setupRoutes(app, isAuthenticated) {
        // Spotify auth route
        app.get('/auth/spotify', isAuthenticated, (req, res) => {
            const state = crypto.randomBytes(16).toString('hex');
            req.session.spotifyState = state;
            req.session.returnTo = req.query.returnTo || '/dashboard';
            
            const authUrl = this.getAuthURL(state);
            res.redirect(authUrl);
        });

        // Spotify callback route
        app.get('/callback', async (req, res) => {
            try {
                const { code, state } = req.query;
                
                // Security checks
                if (!req.isAuthenticated() || !req.user) {
                    return res.redirect('/auth/discord');
                }
                
                if (!state || state !== req.session.spotifyState) {
                    return res.redirect('/error?message=state_mismatch');
                }
                
                // Exchange code for tokens
                const tokens = await this.handleCallback(code);
                
                // Get user profile
                const spotifyProfile = await this.getUserProfile(tokens.accessToken);
                
                // Update user session with Spotify data
                await this.updateUserSession(
                    req.user, 
                    req.sessionID, 
                    tokens, 
                    spotifyProfile
                );
                
                // Clean up and redirect
                const returnTo = req.session.returnTo || '/dashboard';
                delete req.session.spotifyState;
                delete req.session.returnTo;
                
                res.redirect(returnTo);
                
            } catch (error) {
                console.error('Spotify callback error:', error);
                res.redirect('/error?message=' + encodeURIComponent(error.message));
            }
        });

        // Token refresh endpoint
        app.post('/api/spotify/refresh', isAuthenticated, async (req, res) => {
            try {
                const session = req.user.sessions.find(s => s.sessionId === req.sessionID);
                if (!session || !session.spotify) {
                    return res.status(401).json({ error: 'No Spotify connection' });
                }

                const result = await this.refreshToken(req.user, session);
                
                res.json({
                    success: true,
                    expiresAt: result.expiresAt
                });
            } catch (error) {
                console.error('Token refresh error:', error);
                res.status(500).json({ error: 'Failed to refresh token' });
            }
        });

        // Disconnect endpoint
        app.post('/api/spotify/disconnect', isAuthenticated, async (req, res) => {
            try {
                const session = req.user.sessions.find(s => s.sessionId === req.sessionID);
                if (session) {
                    session.spotify = null;
                    await req.user.save();
                }
                res.json({ success: true });
            } catch (error) {
                res.status(500).json({ error: 'Failed to disconnect Spotify' });
            }
        });

        return app;
    }

    // Update user session with Spotify data
    async updateUserSession(user, sessionId, tokens, spotifyProfile) {
        // Find the user session
        let session = user.sessions.find(s => s.sessionId === sessionId);
        
        // Create session if it doesn't exist
        if (!session) {
            session = {
                sessionId,
                createdAt: new Date(),
                lastActive: new Date()
            };
            user.sessions.push(session);
        }
        
        // Update session with Spotify data
        session.spotify = {
            accessToken: tokens.accessToken,
            refreshToken: tokens.refreshToken,
            expiresAt: new Date(Date.now() + tokens.expiresIn * 1000),
            profile: spotifyProfile
        };
        
        session.lastActive = new Date();
        
        // Save user
        await user.save();
        return session;
    }

    // Middleware to ensure user has Spotify connected
    ensureSpotifyConnected(req, res, next) {
        if (!req.user) {
            return res.redirect('/auth/discord');
        }

        const session = req.user.sessions.find(s => s.sessionId === req.sessionID);
        
        if (session && session.spotify) {
            return next();
        }
        
        // Store return URL and redirect to Spotify auth
        req.session.returnTo = req.originalUrl;
        res.redirect('/auth/spotify');
    }

    // Middleware to ensure fresh token
    async ensureFreshToken(req, res, next) {
        if (!req.user) {
            return res.status(401).json({ error: 'Not authenticated' });
        }

        try {
            const session = req.user.sessions.find(s => s.sessionId === req.sessionID);
            if (!session || !session.spotify) {
                return res.status(401).json({ error: 'Spotify not connected' });
            }

            // Refresh if token expires in < 10 minutes
            const expiresAt = new Date(session.spotify.expiresAt);
            if (expiresAt < new Date(Date.now() + 10 * 60 * 1000)) {
                await this.refreshToken(req.user, session);
            }

            next();
        } catch (error) {
            res.status(401).json({ error: 'Failed to refresh token' });
        }
    }
}

module.exports = SpotifyAuthManager;