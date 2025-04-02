//spotifyOAUTH
// const SpotifyWebApi = require('spotify-web-api-node');
const User = require('../models/User');

class SpotifyAuthHandler {
    constructor(config) {
        this.config = config;
        this.spotifyApi = new SpotifyWebApi({
            clientId: config.spotify.clientId,
            clientSecret: config.spotify.clientSecret,
            redirectUri: `${config.baseUrl}/callback`
        });
        this.TOKEN_REFRESH_BUFFER = 5 * 60 * 1000; // Refresh 5 minutes before expiry
    }

    getAuthURL(state) {
        const scopes = [
            'user-library-read',
            'playlist-read-private',
            'streaming',
            'user-read-private',
            'user-read-email'
        ];
        return this.spotifyApi.createAuthorizeURL(scopes, state) + '&show_dialog=false'; // Prevents unnecessary re-auth popups
    }

    async handleCallback(req, res) {
        try {
            console.log('Spotify callback received:', {
                state: req.query.state,
                expectedState: req.session.spotifyState,
                sessionID: req.sessionID,
                hasUser: !!req.user
            });

            if (!req.sessionID || !req.session.userToken) {
                throw new Error('Invalid session state');
            }

            if (req.query.state !== req.session.spotifyState) {
                throw new Error('State mismatch');
            }

            const data = await this.spotifyApi.authorizationCodeGrant(req.query.code);
            this.spotifyApi.setAccessToken(data.body.access_token);
            const spotifyUser = await this.spotifyApi.getMe();

            let session = req.user.sessions.find(s => 
                s.sessionId === req.sessionID && 
                s.token === req.session.userToken
            );

            if (!session) {
                console.error('No matching session found:', {
                    sessionId: req.sessionID,
                    userSessions: req.user.sessions.map(s => ({
                        id: s.sessionId,
                        ip: s.ip
                    }))
                });
                throw new Error('Session not found');
            }

            session.spotify = {
                accessToken: data.body.access_token,
                refreshToken: data.body.refresh_token,
                expiresAt: new Date(Date.now() + data.body.expires_in * 1000),
                userId: spotifyUser.body.id,
                profile: {
                    id: spotifyUser.body.id,
                    email: spotifyUser.body.email,
                    displayName: spotifyUser.body.display_name
                }
            };
            session.lastActive = new Date();

            await req.user.save();
            
            console.log('Spotify auth success:', {
                userId: req.user.id,
                sessionId: session.sessionId,
                spotifyId: spotifyUser.body.id
            });

            delete req.session.spotifyState;
            res.redirect(req.session.returnTo || '/dashboard');
        } catch (error) {
            console.error('Spotify callback error:', error);
            res.redirect('/error?message=' + encodeURIComponent(error.message));
        }
    }

    async refreshToken(user, session) {
        try {
            const now = Date.now();
            const expiresAt = new Date(session.spotify.expiresAt).getTime();

            if (expiresAt > now + this.TOKEN_REFRESH_BUFFER) {
                console.log('Token is still valid, skipping refresh.');
                return session.spotify.accessToken;
            }

            console.log('Refreshing Spotify access token...');
            this.spotifyApi.setRefreshToken(session.spotify.refreshToken);
            const data = await this.spotifyApi.refreshAccessToken();

            session.spotify.accessToken = data.body.access_token;
            session.spotify.expiresAt = new Date(Date.now() + data.body.expires_in * 1000);
            await user.save();

            console.log('Token refreshed successfully.');
            return session.spotify.accessToken;
        } catch (error) {
            console.error('Token refresh failed:', error);
            throw error;
        }
    }

    async ensureValidToken(user, session) {
        try {
            const now = Date.now();
            const expiresAt = new Date(session.spotify.expiresAt).getTime();

            if (expiresAt > now + this.TOKEN_REFRESH_BUFFER) {
                console.log('Token is still valid.');
                return session.spotify.accessToken;
            }

            return await this.refreshToken(user, session);
        } catch (error) {
            console.error('Failed to ensure valid token:', error);
            throw error;
        }
    }
}

module.exports = SpotifyAuthHandler;
