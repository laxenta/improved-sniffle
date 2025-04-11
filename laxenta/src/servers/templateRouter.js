const fs = require('fs');
const path = require('path');

// Function to generate routes for EJS templates
function generateTemplateRoutes(app, templatesDir, client, isAuthenticated) {
    // Index/landing page route - public
    app.get('/', (req, res) => {
        res.render('index', {
            botName: client.user?.username || 'Discord Bot',
            user: req.user,
            isAuthenticated: req.isAuthenticated(),
            hasSpotify: req.user && req.user.sessions && 
                req.user.sessions.some(s => s.sessionId === req.sessionID && s.spotify),
            avatar: client.user?.displayAvatarURL({ size: 1024 })
        });
    });
    
    // Dashboard route - protected, requires authentication
    app.get('/dashboard', isAuthenticated, (req, res) => {
        // Find the current session
        const currentSession = req.user.sessions.find(s => s.sessionId === req.sessionID);
        const hasSpotify = currentSession && currentSession.spotify;
        
        res.render('dashboard', {
            botName: client.user?.username || 'Discord Bot',
            user: req.user,
            isAuthenticated: true, // Already confirmed by middleware
            hasSpotify: !!hasSpotify,
            spotifyProfile: hasSpotify ? currentSession.spotify.profile : null,
            avatar: client.user?.displayAvatarURL({ size: 1024 })
        });
    });
    
    // Music player route - protected, requires authentication and Spotify
    app.get('/music', isAuthenticated, (req, res, next) => {
        // Check if user has Spotify connected
        const currentSession = req.user.sessions.find(s => s.sessionId === req.sessionID);
        const hasSpotify = currentSession && currentSession.spotify;
        
        if (!hasSpotify) {
            // If not connected, redirect to Spotify auth
            req.session.returnTo = req.originalUrl;
            return res.redirect('/auth/spotify');
        }
        
        res.render('music', {
            botName: client.user?.username || 'Discord Bot',
            user: req.user,
            isAuthenticated: true,
            hasSpotify: true,
            spotifyProfile: currentSession.spotify.profile,
            avatar: client.user?.displayAvatarURL({ size: 1024 })
        });
    });
    
    // Error page route - public
    app.get('/error', (req, res) => {
        res.render('error', {
            botName: client.user?.username || 'Discord Bot',
            user: req.user,
            isAuthenticated: req.isAuthenticated(),
            hasSpotify: req.user && req.user.sessions && 
                req.user.sessions.some(s => s.sessionId === req.sessionID && s.spotify),
            error: req.query.message || 'An unknown error occurred',
            avatar: client.user?.displayAvatarURL({ size: 1024 })
        });
    });
}

module.exports = { generateTemplateRoutes };