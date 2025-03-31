const playdl = require('play-dl');
const { createAudioResource } = require('@discordjs/voice');

class Song {
    constructor({ url, title, duration, user, thumbnail }) {
        if (!url || typeof url !== 'string') throw new Error('Invalid url');
        if (!title || typeof title !== 'string') throw new Error('Invalid title');
        if (!duration || typeof duration !== 'string') throw new Error('Invalid duration');
        if (!user || typeof user !== 'object') throw new Error('Invalid user');

        this.url = url;
        this.title = title;
        this.duration = duration;
        this.user = user;
        this.thumbnail = thumbnail || 'https://example.com/default-thumbnail.jpg'; // Default thumbnail if none found
    }

    // Fetch song from query (either URL or search term)
    static async from(query, user) {
        try {
            const isURL = playdl.yt_validate(query) === 'video';
            let video;

            if (isURL) {
                // Fetch video details directly from URL
                const info = await playdl.video_info(query);
                video = info.video_details;
            } else {
                // Search and use the first result
                const searchResults = await playdl.search(query, { limit: 1 });
                video = searchResults[0];
            }

            if (!video) throw new Error('No results found.');

            return new this({
                url: video.url,
                title: video.title,
                duration: video.durationRaw,
                user,
                thumbnail: video.thumbnails[0]?.url || 'https://example.com/default-thumbnail.jpg',
            });
        } catch (error) {
            console.error(`Error fetching song: ${error.message}`);
            throw new Error('Failed to get song info. Please check the query or URL.');
        }
    }

    // Create an audio resource (stream) from the song's URL
    async makeResource() {
        try {
            const streamData = await playdl.stream(this.url);
            return createAudioResource(streamData.stream, {
                inputType: streamData.type,
                metadata: {
                    title: this.title,
                },
            });
        } catch (error) {
            console.error(`Error creating audio resource: ${error.message}`);
            throw new Error(`Failed to create audio resource for ${this.title}`);
        }
    }

    // Message when the song starts playing
    startMessage() {
        return `🎵 Now playing: **${this.title}** (${this.url}) requested by ${this.user.tag} \n⏱ Duration: ${this.duration}`;
    }

    // Summary message for queue display
    summaryMessage() {
        return `🎶 **${this.title}** [${this.duration}] - Requested by ${this.user.tag}`;
    }
}

module.exports = Song;