class AuthManager {
    constructor() {
        this.initialized = false;
        this.userId = null;
        this.discordConnected = false;
        this.spotifyConnected = false;
        this.lastTokenCheck = null;
        this.sessionCheckIntervalId = null;
        this.tokenCheckIntervalId = null;
        this.SESSION_CHECK_INTERVAL = 10 * 60 * 1000; // Check every 10 minutes instead of 2
        this.TOKEN_REFRESH_BUFFER = 5 * 60 * 1000;  // 5 minutes buffer for refresh
        
        // Try to restore state from localStorage
        this.restoreFromStorage();
    }

    restoreFromStorage() {
        try {
            const savedAuth = localStorage.getItem('authState');
            if (savedAuth) {
                const authState = JSON.parse(savedAuth);
                this.initialized = true;
                this.userId = authState.userId;
                this.discordConnected = authState.discordConnected;
                this.spotifyConnected = authState.spotifyConnected;
                this.lastTokenCheck = authState.lastTokenCheck;
            }
        } catch (error) {
            console.error('Failed to restore auth state:', error);
            // Continue with default values if restore fails
        }
    }

    saveToStorage() {
        try {
            const authState = {
                userId: this.userId,
                discordConnected: this.discordConnected,
                spotifyConnected: this.spotifyConnected,
                lastTokenCheck: this.lastTokenCheck
            };
            localStorage.setItem('authState', JSON.stringify(authState));
        } catch (error) {
            console.error('Failed to save auth state:', error);
        }
    }

    async checkAuth() {
        // First check if we have a valid session from previous init
        if (this.initialized && this.userId && !this.isSessionStale()) {
            // We have a valid session, start checks and return
            this.startSessionChecks();
            return true;
        }

        try {
            const session = await this.verifySession();
            
            if (!session.valid) {
                this.handleAuthError('session_invalid');
                return false;
            }

            // Update local state
            this.initialized = true;
            this.userId = session.user.discordId;
            this.discordConnected = session.user.authStatus.discord;
            this.spotifyConnected = session.user.authStatus.spotify;
            this.lastTokenCheck = Date.now();
            
            // Save to storage
            this.saveToStorage();

            // Only redirect to Spotify if on protected route and not connected
            if (window.location.pathname.startsWith('/dashboard') && !this.spotifyConnected) {
                // Check if we've already attempted Spotify auth to prevent loops
                const spotifyAttempted = sessionStorage.getItem('spotifyAuthAttempted');
                if (!spotifyAttempted) {
                    sessionStorage.setItem('spotifyAuthAttempted', 'true');
                    sessionStorage.setItem('returnTo', window.location.pathname);
                    window.location.href = '/auth/spotify';
                    return false;
                }
            }

            // Handle token refresh if Spotify connected
            if (this.spotifyConnected && session.user.spotify?.expiresAt) {
                await this.handleTokenRefresh(session.user.spotify.expiresAt);
            }

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
        if (this.tokenCheckIntervalId) {
            clearInterval(this.tokenCheckIntervalId);
            this.tokenCheckIntervalId = null;
        }

        // If token expires soon, refresh now
        if (timeUntilExpiry < this.TOKEN_REFRESH_BUFFER) {
            await this.refreshSpotifyToken();
            return;
        }

        // Schedule next check at 80% of remaining time
        const checkDelay = Math.max(60000, timeUntilExpiry * 0.8);
        this.tokenCheckIntervalId = setTimeout(
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
            // Don't automatically redirect on token check failure
            // Just log the error and retry later
        }
    }

    startSessionChecks() {
        // Clear any existing interval first
        if (this.sessionCheckIntervalId) {
            clearInterval(this.sessionCheckIntervalId);
        }
        
        this.sessionCheckIntervalId = setInterval(async () => {
            try {
                const session = await this.verifySession();
                if (!session.valid) {
                    this.handleAuthError('session_expired');
                }
            } catch (error) {
                console.error('Session check failed:', error);
                // Don't automatically redirect on session check failure
                // Just log the error and retry later
            }
        }, this.SESSION_CHECK_INTERVAL);
    }

    handleAuthError(code) {
        console.log(`Auth error: ${code}`);
        
        // Don't clear auth in all cases - be more selective
        switch (code) {
            case 'session_invalid':
            case 'session_expired':
                // Only redirect if we haven't tried recently
                const lastAuthAttempt = sessionStorage.getItem('lastAuthAttempt');
                const now = Date.now();
                if (!lastAuthAttempt || (now - parseInt(lastAuthAttempt)) > 60000) {
                    sessionStorage.setItem('lastAuthAttempt', now.toString());
                    sessionStorage.setItem('returnTo', window.location.pathname);
                    this.redirectToDiscordAuth();
                } else {
                    console.log('Skipping auth redirect - attempted recently');
                }
                break;
            case 'spotify_token_invalid':
                // Only redirect if we haven't tried recently
                const lastSpotifyAttempt = sessionStorage.getItem('lastSpotifyAttempt');
                const nowSpotify = Date.now();
                if (!lastSpotifyAttempt || (nowSpotify - parseInt(lastSpotifyAttempt)) > 60000) {
                    sessionStorage.setItem('lastSpotifyAttempt', nowSpotify.toString());
                    sessionStorage.setItem('returnTo', window.location.pathname);
                    window.location.href = '/auth/spotify';
                } else {
                    console.log('Skipping Spotify redirect - attempted recently');
                }
                break;
            default:
                console.error(`Unhandled auth error: ${code}`);
                // Don't redirect for unknown errors
        }
    }

    async verifySession() {
        try {
            const response = await fetch('/api/auth/verify', {
                credentials: 'same-origin',
                headers: {
                    'Cache-Control': 'no-cache'
                }
            });
            
            if (!response.ok) throw new Error('Session verification failed');
            
            const data = await response.json();
            
            // Update local state based on server response
            if (data.valid) {
                this.userId = data.user.discordId;
                this.discordConnected = data.user.authStatus.discord;
                this.spotifyConnected = data.user.authStatus.spotify;
                this.lastTokenCheck = Date.now();
                this.saveToStorage();
            }

            return data;
        } catch (error) {
            console.error('Session verify error:', error);
            throw error;
        }
    }

    isSessionStale() {
        return !this.lastTokenCheck || 
               (Date.now() - this.lastTokenCheck) > this.SESSION_CHECK_INTERVAL;
    }

    async refreshSpotifyToken() {
        try {
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
        } catch (error) {
            console.error('Failed to refresh Spotify token:', error);
            // Don't immediately redirect, just log the error
            // The regular check will handle it next time
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
        if (this.tokenCheckIntervalId) {
            clearInterval(this.tokenCheckIntervalId);
            this.tokenCheckIntervalId = null;
        }
        
        if (this.sessionCheckIntervalId) {
            clearInterval(this.sessionCheckIntervalId);
            this.sessionCheckIntervalId = null;
        }

        localStorage.removeItem('authState');
        sessionStorage.removeItem('spotifyAuthAttempted');
        sessionStorage.removeItem('lastAuthAttempt');
        sessionStorage.removeItem('lastSpotifyAttempt');
        
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