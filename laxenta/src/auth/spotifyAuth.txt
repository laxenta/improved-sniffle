const SpotifyWebApi = require('spotify-web-api-node');

class SpotifyAuthManager {
    constructor(config) {
        this.clientId = config.spotify.clientId;
        this.clientSecret = config.spotify.clientSecret;
        this.baseUrl = config.baseUrl;
        this.redirectUri = `${this.baseUrl}/callback`;
        
        // Initialize Spotify API wrapper
        this.spotifyApi = new SpotifyWebApi({
            clientId: this.clientId,
            clientSecret: this.clientSecret,
            redirectUri: this.redirectUri
        });
    }

    setupRoutes(app, isAuthenticated) {
        // Routes are set up in the WebServer class
    }

    getAuthURL(state) {
        const scopes = [
            'user-read-private',
            'user-read-email',
            'user-library-read',
            'playlist-read-private',
            'playlist-read-collaborative',
            'user-top-read',
            'user-read-recently-played'
        ];

        return this.spotifyApi.createAuthorizeURL(scopes, state);
    }

    async handleCallback(code, user) {
        if (!code) {
            throw new Error('Authorization code is required');
        }
        
        if (!user) {
            throw new Error('User object is required for Spotify authentication');
        }
    
        try {
            console.log('Handling Spotify callback:', {
                hasCode: !!code,
                hasUser: !!user,
                userId: user?._id
            });
    
            const data = await this.spotifyApi.authorizationCodeGrant(code);
            const profile = await this.getUserProfile(data.body.access_token);
            
            // Create the session's Spotify data
            const spotifyData = {
                accessToken: data.body.access_token,
                refreshToken: data.body.refresh_token,
                expiresAt: new Date(Date.now() + (data.body.expires_in * 1000)),
                profile: profile,
                needsReconnect: false
            };
    
            // Find or create user's current session
            let session = user.sessions?.find(s => s.sessionId === user.currentSessionId);
            if (!session) {
                if (!Array.isArray(user.sessions)) {
                    user.sessions = [];
                }
                session = {
                    sessionId: user.currentSessionId,
                    createdAt: new Date(),
                    lastActive: new Date(),
                    isActive: true
                };
                user.sessions.push(session);
            }
    
            // Only store in session, not in user document
            session.spotify = spotifyData;
            
            await user.save();
            
            console.log('Spotify auth successful:', {
                userId: user._id,
                sessionId: session.sessionId,
                expiresAt: spotifyData.expiresAt
            });
    
            return {
                success: true,
                expiresAt: spotifyData.expiresAt
            };
        } catch (error) {
            console.error('Spotify auth error:', error);
            throw error;
        }
    }

    async getUserProfile(accessToken) {
        try {
            this.spotifyApi.setAccessToken(accessToken);
            const response = await this.spotifyApi.getMe();
            return response.body;
        } catch (error) {
            console.error('Error getting Spotify user profile:', error);
            throw error;
        }
    }

    async refreshToken(user, sessionData) {
        if (!sessionData.spotify || !sessionData.spotify.refreshToken) {
            throw new Error('No refresh token available');
        }

        try {
            // Create a new instance with just the necessary credentials
            const spotifyApi = new SpotifyWebApi({
                clientId: this.clientId,
                clientSecret: this.clientSecret,
                refreshToken: sessionData.spotify.refreshToken
            });

            const data = await spotifyApi.refreshAccessToken();
            
            // Update the session with new tokens
            sessionData.spotify.accessToken = data.body.access_token;
            
            // If a new refresh token was provided (rare but possible)
            if (data.body.refresh_token) {
                sessionData.spotify.refreshToken = data.body.refresh_token;
            }
            
            // Update expiration time
            const expiresIn = data.body.expires_in || 3600; // default to 1 hour if not specified
            sessionData.spotify.expiresAt = new Date(Date.now() + expiresIn * 1000);
            
            // Save user with updated session
            await user.save();
            
            return data.body.access_token;
        } catch (error) {
            console.error('Token refresh error:', error);
            
            // If refresh fails, mark the session as needing reconnection
            sessionData.spotify.needsReconnect = true;
            await user.save();
            
            throw error;
        }
    }

    async ensureFreshToken(req, res, next) {
        try {
            if (!req.isAuthenticated() || !req.user) {
                return res.status(401).json({ error: 'Not authenticated' });
            }

            const session = req.user.sessions.find(s => s.sessionId === req.sessionID);
            
            // Check if Spotify is connected
            if (!session || !session.spotify) {
                return res.status(401).json({ error: 'Spotify not connected' });
            }

            // Check if token is expired or about to expire (within 5 minutes)
            const tokenExpiresAt = new Date(session.spotify.expiresAt);
            const isExpired = tokenExpiresAt <= new Date(Date.now() + 5 * 60 * 1000);
            
            if (isExpired) {
                try {
                    await this.refreshToken(req.user, session);
                } catch (refreshError) {
                    console.error('Token refresh failed:', refreshError);
                    return res.status(401).json({ error: 'Failed to refresh token', needsReconnect: true });
                }
            }
            
            next();
        } catch (error) {
            console.error('Error in ensureFreshToken middleware:', error);
            res.status(500).json({ error: 'Internal server error' });
        }
    }

    createClientForUser(session) {
        if (!session || !session.spotify || !session.spotify.accessToken) {
            throw new Error('No valid Spotify session');
        }

        const api = new SpotifyWebApi({
            clientId: this.clientId,
            clientSecret: this.clientSecret
        });

        api.setAccessToken(session.spotify.accessToken);
        return api;
    }
}

module.exports = SpotifyAuthManager;