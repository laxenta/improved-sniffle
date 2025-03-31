//sppotify auth.js
// 
// 
const SpotifyWebApi = require('spotify-web-api-node');
const User = require('../models/User');

class SpotifyAuthHandler {
    constructor(config) {
        this.config = config;
        this.spotifyApi = new SpotifyWebApi({
            clientId: config.spotify.clientId,
            clientSecret: config.spotify.clientSecret,
            redirectUri: `${config.baseUrl}/callback`
        });
    }

    getAuthURL(state) {
        const scopes = [
            'user-library-read',
            'playlist-read-private',
            'streaming',
            'user-read-private',
            'user-read-email'
        ];
        
        // Force authorization dialog with show_dialog=true
        return this.spotifyApi.createAuthorizeURL(scopes, state) + '&show_dialog=true';
    }

    async handleCallback(req, res) {
        try {
            console.log('Spotify callback received:', { 
                state: req.query.state, 
                sessionState: req.session.spotifyState,
                code: !!req.query.code,
                sessionID: req.sessionID,
                hasUser: !!req.user
            });
    
            if (req.query.state !== req.session.spotifyState) {
                throw new Error('State mismatch');
            }
    
            // Get tokens from code
            const data = await this.spotifyApi.authorizationCodeGrant(req.query.code);
            console.log('Token exchange successful');
    
            // Set the access token before making any API calls
            this.spotifyApi.setAccessToken(data.body.access_token);
            
            // Now get user info with the token set
            const spotifyUser = await this.spotifyApi.getMe();
            console.log('Got Spotify user info:', spotifyUser.body.id);
    
            // Find or create session
            let session = req.user.sessions.find(s => s.sessionId === req.sessionID);
            if (!session) {
                session = {
                    sessionId: req.sessionID,
                    ip: req.ip,
                    clientInfo: {
                        browser: req.get('User-Agent') || 'unknown',
                        os: req.get('sec-ch-ua-platform') || 'unknown',
                        device: req.get('sec-ch-ua-mobile') ? 'mobile' : 'desktop',
                        lastLogin: new Date()
                    },
                    createdAt: new Date(),
                    lastActive: new Date()
                };
                req.user.sessions.push(session);
            }
    
            // Update session with Spotify data
            session.spotify = {
                accessToken: data.body.access_token,
                refreshToken: data.body.refresh_token,
                expiresAt: new Date(Date.now() + data.body.expires_in * 1000),
                userId: spotifyUser.body.id
            };
    
            await req.user.save();
            console.log('User saved with Spotify data');
    
            // Clear state and redirect
            delete req.session.spotifyState;
            res.redirect(req.session.returnTo || '/dashboard');
        } catch (error) {
            console.error('Spotify callback error:', error);
            res.redirect('/error?message=' + encodeURIComponent(error.message));
        }
    }

    async refreshToken(user, session) {
        try {
            this.spotifyApi.setRefreshToken(session.spotify.refreshToken);
            const data = await this.spotifyApi.refreshAccessToken();
            
            session.spotify.accessToken = data.body.access_token;
            session.spotify.expiresAt = new Date(Date.now() + data.body.expires_in * 1000);
            await user.save();
            
            return data.body.access_token;
        } catch (error) {
            console.error('Token refresh failed:', error);
            throw error;
        }
    }
}

module.exports = SpotifyAuthHandler;