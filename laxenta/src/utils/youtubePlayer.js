const ytdl = require('ytdl-core');
const { search } = require('yt-search');
const { EventEmitter } = require('events');

class YouTubePlayer extends EventEmitter {
    constructor() {
        super();
        this.queue = new Map();
        this.currentTrack = null;
        this.isPlaying = false;
        this.volume = 1;
    }

    async searchTracks(query) {
        try {
            const results = await search(query);
            return results.videos.map(video => ({
                id: video.videoId,
                title: video.title,
                artist: video.author.name,
                duration: video.duration.seconds * 1000,
                thumbnail: video.thumbnail,
                url: video.url
            }));
        } catch (error) {
            console.error('Error searching YouTube:', error);
            return [];
        }
    }

    async getPlaybackUrl(videoId) {
        try {
            const info = await ytdl.getInfo(videoId);
            const format = ytdl.chooseFormat(info.formats, { quality: 'highestaudio' });
            return format.url;
        } catch (error) {
            console.error('Error getting playback URL:', error);
            return null;
        }
    }

    async getVideoDetails(videoId) {
        try {
            const info = await ytdl.getInfo(videoId);
            return {
                id: videoId,
                title: info.videoDetails.title,
                artist: info.videoDetails.author.name,
                duration: parseInt(info.videoDetails.lengthSeconds) * 1000,
                thumbnail: info.videoDetails.thumbnails[0].url,
                url: info.videoDetails.video_url
            };
        } catch (error) {
            console.error('err getting vid details :3 :', error);
            return null;
        }
    }

    async play(videoId) {
        try {
            const details = await this.getVideoDetails(videoId);
            if (!details) throw new Error('Failed to get video details');

            this.currentTrack = details;
            this.isPlaying = true;
            this.emit('trackChange', details);
            this.emit('stateChange', { playing: true });

            return details;
        } catch (error) {
            console.error('Play error:', error);
            throw error;
        }
    }

    pause() {
        this.isPlaying = false;
        this.emit('stateChange', { playing: false });
    }

    resume() {
        this.isPlaying = true;
        this.emit('stateChange', { playing: true });
    }

    // Queue management
    addToQueue(videoId) {
        this.queue.set(videoId, { addedAt: Date.now() });
        this.emit('queueUpdate', Array.from(this.queue.keys()));
    }

    clearQueue() {
        this.queue.clear();
        this.emit('queueUpdate', []);
    }
}

module.exports = new YouTubePlayer();
