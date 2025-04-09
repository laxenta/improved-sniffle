const mongoose = require('mongoose');
const crypto = require('crypto');

const SpotifySchema = new mongoose.Schema({
    accessToken: String,
    refreshToken: String,
    expiresAt: Date,
    userId: String
}, { _id: false });

const SessionSchema = new mongoose.Schema({
    token: String,
    clientIp: String,
    clientInfo: {
        browser: String,
        os: String,
        device: String,
        lastLogin: { type: Date, default: Date.now }
    },
    spotify: SpotifySchema,
    createdAt: { type: Date, default: Date.now },
    lastActive: { type: Date, default: Date.now },
    isActive: { type: Boolean, default: true }
}, { _id: false });

const UserSchema = new mongoose.Schema({
    discordId: { type: String, required: true, unique: true },
    username: String,
    avatar: String,
    email: String,
    authStatus: {
        discord: { type: Boolean, default: false },
        spotify: { type: Boolean, default: false }
    },
    sessions: [SessionSchema],
    activeVoiceChannel: {
        guildId: String,
        channelId: String,
        lastActive: Date
    }
}, { timestamps: true });

// Generate new session token
UserSchema.methods.createSession = async function(clientIp, clientInfo) {
    const token = crypto
        .createHash('sha256')
        .update(`${this.discordId}${Date.now()}${Math.random()}`)
        .digest('hex');

    // Deactivate other sessions from same IP
    this.sessions.forEach(session => {
        if (session.clientIp === clientIp) {
            session.isActive = false;
        }
    });

    // Add new session
    this.sessions.push({
        token,
        clientIp,
        clientInfo: {
            ...clientInfo,
            lastLogin: new Date()
        },
        isActive: true
    });

    // Cleanup old sessions (keep last 5 active)
    const activeSessions = this.sessions
        .filter(s => s.isActive)
        .sort((a, b) => b.lastActive - a.lastActive);

    if (activeSessions.length > 5) {
        activeSessions
            .slice(5)
            .forEach(s => s.isActive = false);
    }

    await this.save();
    return token;
};

// Validate session
UserSchema.methods.validateSession = async function(token, clientIp) {
    const session = this.sessions.find(s => 
        s.token === token && 
        s.isActive && 
        s.clientIp === clientIp
    );

    if (!session) return null;

    session.lastActive = new Date();
    await this.save();
    
    return session;
};

// Connect Spotify
UserSchema.methods.connectSpotify = async function(token, spotifyData) {
    const session = this.sessions.find(s => s.token === token && s.isActive);
    if (!session) return false;

    session.spotify = spotifyData;
    session.lastActive = new Date();
    this.authStatus.spotify = true;
    
    await this.save();
    return true;
};

// Disconnect Spotify
UserSchema.methods.disconnectSpotify = async function(token) {
    const session = this.sessions.find(s => s.token === token && s.isActive);
    if (!session) return false;

    session.spotify = null;
    this.authStatus.spotify = false;
    
    await this.save();
    return true;
};

// Clean up expired sessions
UserSchema.methods.cleanupSessions = async function() {
    const ONE_DAY = 24 * 60 * 60 * 1000; // 1 day in milliseconds
    const now = Date.now();

    // Keep sessions that are either:
    // 1. Active in the last 24 hours
    // 2. Have valid Spotify connection
    // 3. Are the current session
    this.sessions = this.sessions.filter(session => {
        const age = now - session.lastActive.getTime();
        const hasSpotify = session.spotify && session.spotify.accessToken;
        const isRecent = age < ONE_DAY;
        
        return isRecent || hasSpotify || session.isActive;
    });

    // Remove duplicate sessions (keep most recent)
    const uniqueSessions = new Map();
    this.sessions.forEach(session => {
        if (!uniqueSessions.has(session.sessionId) || 
            session.lastActive > uniqueSessions.get(session.sessionId).lastActive) {
            uniqueSessions.set(session.sessionId, session);
        }
    });

    this.sessions = Array.from(uniqueSessions.values());
    await this.save();
};

module.exports = mongoose.model('User', UserSchema);