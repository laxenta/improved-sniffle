class AuthManager {
    constructor() {
        this.initialized = false;
        this.userId = null;
        this.discordConnected = false;
        this.spotifyConnected = false;
        this.lastTokenCheck = null;
        this.tokenCheckInterval = null;
        this.SESSION_CHECK_INTERVAL = 5 * 60 * 1000; // 5 minutes
        this.TOKEN_REFRESH_BUFFER = 10 * 60 * 1000; // 10 minutes
    }

    async checkAuth() {
        // Only run auth check for protected routes
        if (!window.location.pathname.startsWith('/dashboard')) {
            return true;
        }

        try {
            // Check if we have a valid session
            const session = await this.verifySession();
            
            if (!session.valid) {
                this.handleAuthError('session_invalid');
                return false;
            }

            // We have Discord auth, check Spotify
            if (!session.user.authStatus.spotify) {
                sessionStorage.setItem('returnTo', window.location.pathname);
                window.location.href = '/auth/spotify';
                return false;
            }

            // Check and schedule Spotify token refresh
            if (session.user.spotify?.expiresAt) {
                await this.handleTokenRefresh(session.user.spotify.expiresAt);
            }

            this.initialized = true;
            this.userId = session.user.discordId;
            this.discordConnected = true;
            this.spotifyConnected = true;
            this.lastTokenCheck = Date.now();

            // Start periodic session checks
            this.startSessionChecks();

            return true;
        } catch (error) {
            console.error('Auth check failed:', error);
            this.handleAuthError(error.code || 'unknown');
            return false;
        }
    }

    async handleTokenRefresh(expiresAt) {
        const expiry = new Date(expiresAt);
        const now = new Date();
        const timeUntilExpiry = expiry - now;

        // Clear existing check interval
        if (this.tokenCheckInterval) {
            clearInterval(this.tokenCheckInterval);
        }

        // If token expires soon, refresh now
        if (timeUntilExpiry < this.TOKEN_REFRESH_BUFFER) {
            await this.refreshSpotifyToken();
            return;
        }

        // Schedule next check at 80% of remaining time
        const checkDelay = Math.max(60000, timeUntilExpiry * 0.8);
        this.tokenCheckInterval = setTimeout(
            () => this.checkTokenExpiry(),
            checkDelay
        );
    }

    async checkTokenExpiry() {
        try {
            const session = await this.verifySession();
            if (session.valid && session.user.spotify?.expiresAt) {
                await this.handleTokenRefresh(session.user.spotify.expiresAt);
            }
        } catch (error) {
            console.error('Token check failed:', error);
            this.handleAuthError('token_check_failed');
        }
    }

    startSessionChecks() {
        setInterval(async () => {
            try {
                const session = await this.verifySession();
                if (!session.valid) {
                    this.handleAuthError('session_expired');
                }
            } catch (error) {
                console.error('Session check failed:', error);
                this.handleAuthError('session_check_failed');
            }
        }, this.SESSION_CHECK_INTERVAL);
    }

    handleAuthError(code) {
        this.clearAllAuth();
        
        switch (code) {
            case 'session_invalid':
            case 'session_expired':
                this.redirectToDiscordAuth();
                break;
            case 'spotify_token_invalid':
                sessionStorage.setItem('returnTo', window.location.pathname);
                window.location.href = '/auth/spotify';
                break;
            default:
                console.error(`Auth error: ${code}`);
                this.redirectToDiscordAuth();
        }
    }

    async verifySession() {
        const response = await fetch('/api/auth/verify', {
            credentials: 'same-origin',
            headers: {
                'Cache-Control': 'no-cache',
                'X-Client-IP': await this.getClientIP()
            }
        });
        
        if (!response.ok) {
            throw new Error('Session verification failed');
        }
        
        return await response.json();
    }

    async refreshSpotifyToken() {
        const response = await fetch('/api/spotify/refresh', {
            method: 'POST',
            credentials: 'same-origin'
        });
        
        if (!response.ok) {
            throw new Error('Failed to refresh Spotify token');
        }

        const data = await response.json();
        if (data.expiresAt) {
            await this.handleTokenRefresh(data.expiresAt);
        }
    }

    redirectToDiscordAuth() {
        sessionStorage.setItem('returnTo', window.location.pathname);
        window.location.href = '/auth/discord';
    }

    async getClientIP() {
        try {
            const response = await fetch('https://api.ipify.org?format=json');
            const data = await response.json();
            return data.ip;
        } catch (error) {
            return null;
        }
    }

    async logout() {
        try {
            if (this.spotifyConnected) {
                await fetch('/api/spotify/disconnect', {
                    method: 'POST',
                    credentials: 'same-origin'
                });
            }

            await fetch('/logout', {
                method: 'POST',
                credentials: 'same-origin'
            });

            this.clearAllAuth();
            window.location.href = '/';
        } catch (error) {
            console.error('Logout failed:', error);
            this.clearAllAuth();
            window.location.href = '/';
        }
    }

    clearAllAuth() {
        // Clear intervals
        if (this.tokenCheckInterval) {
            clearInterval(this.tokenCheckInterval);
            this.tokenCheckInterval = null;
        }

        localStorage.clear();
        sessionStorage.clear();
        this.initialized = false;
        this.userId = null;
        this.discordConnected = false;
        this.spotifyConnected = false;
        this.lastTokenCheck = null;
    }
}

// Make globally available
window.AuthManager = AuthManager;
window.authManager = new AuthManager();

// Check auth only on protected routes
if (window.location.pathname.startsWith('/dashboard')) {
    window.authManager.checkAuth();
}

// laxenta/
// ├── src/
// │   ├── auth/
// │   │   ├── spotifyAuth.js     # Handles server-side Spotify OAuth
// │   │   └── discordAuth.js     # Handles server-side Discord OAuth
// │   ├── public/js/
// │   │   └── authManager.js     # Client-side auth management
// │   └── servers/
// │       └── webServer.js       # Main Express server