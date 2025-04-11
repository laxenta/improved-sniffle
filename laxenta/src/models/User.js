const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
    discordId: String,
    username: String,
    email: String,
    avatar: String,
    // Add sessions back
    sessions: [{
        sessionId: String,
        createdAt: Date,
        lastActive: Date,
        ip: String,
        isActive: Boolean,
        spotify: {
            accessToken: String,
            refreshToken: String,
            expiresAt: Date,
            profile: Object,
            needsReconnect: Boolean
        }
    }],
    lastActive: {
        type: Date,
        default: Date.now
    },
    spotifyAuth: {
        accessToken: String,
        refreshToken: String,
        expiresAt: Date,
        profile: Object
    }
});

// Add session management methods
userSchema.methods.findOrCreateSession = function(sessionId, ip) {
    if (!this.sessions) {
        this.sessions = [];
    }

    let session = this.sessions.find(s => s.sessionId === sessionId);
    
    if (!session) {
        session = {
            sessionId: sessionId,
            createdAt: new Date(),
            lastActive: new Date(),
            ip: ip || 'unknown',
            isActive: true
        };
        this.sessions.push(session);
    } else {
        session.lastActive = new Date();
        session.isActive = true;
        if (ip) session.ip = ip;
    }
    
    return session;
};

userSchema.methods.cleanupSessions = function() {
    if (!this.sessions) return;
    
    // Keep only active sessions from last 24 hours or the 5 most recent
    const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
    this.sessions = this.sessions
        .filter(s => s.isActive && (s.lastActive > oneDayAgo))
        .sort((a, b) => b.lastActive - a.lastActive)
        .slice(0, 5);
    
    return this.save();
};

// Existing methods
userSchema.methods.touch = function() {
    this.lastActive = new Date();
    return this.save();
};

userSchema.methods.updateSpotifyTokens = function(tokens) {
    this.spotifyAuth = {
        accessToken: tokens.accessToken,
        refreshToken: tokens.refreshToken,
        expiresAt: new Date(Date.now() + (tokens.expiresIn * 1000)),
        profile: tokens.profile || this.spotifyAuth?.profile
    };
    return this.save();
};

const User = mongoose.model('User', userSchema);
module.exports = User;