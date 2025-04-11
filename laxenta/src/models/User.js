const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
    discordId: String,
    username: String,
    email: String,
    avatar: String,
    // Simplified session storage
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

// Simple method to update activity
userSchema.methods.touch = function() {
    this.lastActive = new Date();
    return this.save();
};

// Simple method to update Spotify tokens
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