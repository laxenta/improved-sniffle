const mongoose = require('mongoose');

const sessionSchema = new mongoose.Schema({
    sessionId: String,
    ip: String,
    isActive: { type: Boolean, default: true },
    createdAt: { type: Date, default: Date.now },
    lastActive: { type: Date, default: Date.now },
    spotify: {
        accessToken: String,
        refreshToken: String,
        expiresAt: Date,
        profile: mongoose.Schema.Types.Mixed,
        needsReconnect: { type: Boolean, default: false }
    }
});

const userSchema = new mongoose.Schema({
    discordId: { type: String, required: true, unique: true },
    username: String,
    email: String,
    avatar: String,
    createdAt: { type: Date, default: Date.now },
    sessions: [sessionSchema]
});

// Method to clean up old/inactive sessions
userSchema.methods.cleanupSessions = async function() {
    // Keep sessions active in the last 14 days
    const twoWeeksAgo = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000);
    
    // Filter out sessions that are inactive or haven't been active in 2 weeks
    this.sessions = this.sessions.filter(session => {
        return session.isActive && session.lastActive > twoWeeksAgo;
    });
    
    // Save only if there were sessions removed
    if (this.isModified('sessions')) {
        return this.save();
    }
    
    return this;
};

const User = mongoose.model('User', userSchema);

module.exports = User;