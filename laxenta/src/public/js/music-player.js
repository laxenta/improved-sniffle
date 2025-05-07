class MusicPlayer {
    constructor() {
        this.isPlaying = false;
        this.currentTrack = null;
        this.queue = [];
        this.volume = 100;
        this.retryAttempts = 3;
        this.retryDelay = 1000;
        this.isProcessing = false;
        this.setupEventListeners();
    }

    setupEventListeners() {
        // Listen for visibility change to update player state
        document.addEventListener('visibilitychange', () => {
            if (!document.hidden) {
                this.syncPlayerState();
            }
        });

        // Listen for window focus to update state
        window.addEventListener('focus', () => {
            this.syncPlayerState();
        });
    }

    async syncPlayerState() {
        try {
            if (this.currentTrack) {
                const data = await this.getQueue(this.currentTrack.guildId);
                this.updatePlayerState(data);
            }
        } catch (error) {
            console.error('Failed to sync player state:', error);
        }
    }

    updatePlayerState(data) {
        this.isPlaying = data.playing;
        this.currentTrack = data.currentTrack;
        this.queue = data.queue;
        this.volume = data.volume;
        this.updateUI();
    }

    updateUI() {
        // Update play/pause buttons
        document.querySelectorAll('.player-controls').forEach(controls => {
            const playBtn = controls.querySelector('.play-btn');
            if (playBtn) {
                playBtn.innerHTML = this.isPlaying ? 
                    '<i class="fas fa-pause"></i>' : 
                    '<i class="fas fa-play"></i>';
            }
        });

        // Update volume display
        document.querySelectorAll('.volume-display').forEach(display => {
            if (display) {
                display.textContent = `${this.volume}%`;
            }
        });
    }

    async checkVoiceStatus() {
        try {
            const response = await fetch('/api/voice/status');
            if (!response.ok) {
                throw new Error('Failed to check voice status');
            }
            
            const data = await response.json();
            
            if (!data.inChannel) {
                this.showToast({
                    title: 'Not in a Voice Channel',
                    message: 'Join a voice channel in any server where I\'m present to play music!',
                    type: 'error',
                    icon: 'fa-microphone-slash'
                });
                throw new Error('voice_not_found');
            }

            this.showToast({
                title: 'Connected',
                message: `Connected to ${data.guildName} • ${data.channelName}`,
                type: 'success',
                icon: 'fa-microphone'
            });
            
            return data;
        } catch (error) {
            if (error.message !== 'voice_not_found') {
                this.showToast({
                    title: 'Connection Error',
                    message: 'Failed to check voice status',
                    type: 'error',
                    icon: 'fa-exclamation-circle'
                });
            }
            throw error;
        }
    }

    async retryOperation(operation, maxAttempts = this.retryAttempts) {
        for (let attempt = 1; attempt <= maxAttempts; attempt++) {
            try {
                return await operation();
            } catch (error) {
                if (attempt === maxAttempts) throw error;
                await new Promise(resolve => setTimeout(resolve, this.retryDelay * attempt));
            }
        }
    }

    setLoadingState(loading) {
        this.isProcessing = loading;
        document.body.classList.toggle('music-loading', loading);
        
        // Disable all play buttons
        document.querySelectorAll('.play-btn').forEach(btn => {
            btn.disabled = loading;
            btn.innerHTML = loading ? 
                '<i class="fas fa-spinner fa-spin"></i>' :
                '<i class="fas fa-play"></i> Play';
        });
    }

    async play(uri, guildId) {
        if (this.isProcessing) return; // Prevent multiple calls
        
        try {
            this.setLoadingState(true);
            
            const voiceStatus = await this.checkVoiceStatus();
            
            this.showToast({
                title: 'Loading',
                message: 'Starting playback...',
                type: 'info',
                icon: 'fa-spinner fa-spin'
            });
            
            const playOperation = async () => {
                const response = await fetch('/api/music/play', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        uri,
                        guildId: guildId || voiceStatus.guildId,
                        channelId: voiceStatus.channelId
                    })
                });

                if (!response.ok) {
                    const data = await response.json();
                    throw new Error(data.error || 'Failed to play track');
                }

                return await response.json();
            };

            const data = await this.retryOperation(playOperation);
            
            this.isPlaying = true;
            this.currentTrack = data.track;
            this.updateUI();

            this.showToast({
                title: 'Now Playing',
                message: data.track.title,
                type: 'success',
                icon: 'fa-music'
            });

            return data;
        } catch (error) {
            if (error.message !== 'voice_not_found') {
                this.showToast({
                    title: 'Playback Failed',
                    message: error.message,
                    type: 'error',
                    icon: 'fa-exclamation-circle'
                });
            }
            throw error;
        } finally {
            this.setLoadingState(false);
        }
    }

    async pause(guildId) {
        const response = await fetch(`/api/music/pause/${guildId}`, {
            method: 'POST'
        });
        const data = await response.json();
        this.isPlaying = false;
        return data;
    }

    async resume(guildId) {
        const response = await fetch(`/api/music/resume/${guildId}`, {
            method: 'POST'
        });
        const data = await response.json();
        this.isPlaying = true;
        return data;
    }

    async stop(guildId) {
        const response = await fetch(`/api/music/stop/${guildId}`, {
            method: 'POST'
        });
        const data = await response.json();
        this.isPlaying = false;
        this.currentTrack = null;
        return data;
    }

    async skip(guildId) {
        const response = await fetch(`/api/music/skip/${guildId}`, {
            method: 'POST'
        });
        return await response.json();
    }

    async setVolume(guildId, volume) {
        const response = await fetch(`/api/music/volume/${guildId}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ volume })
        });
        const data = await response.json();
        this.volume = volume;
        return data;
    }

    async getQueue(guildId) {
        const response = await fetch(`/api/music/queue/${guildId}`);
        const data = await response.json();
        this.queue = data.queue;
        return data;
    }

    async updateLatency() {
        try {
            const start = Date.now();
            await fetch('/api/ping');
            const latency = Date.now() - start;
            document.getElementById('latency').textContent = `Latency: ${latency}ms`;
            return latency;
        } catch (error) {
            console.error('Latency check failed:', error);
            throw error;
        }
    }

    showToast({ title, message, type = 'info', icon, duration = 3000 }) {
        const toast = document.createElement('div');
        toast.className = `toast ${type} animate__animated animate__fadeInRight`;
        toast.innerHTML = `
            <div class="toast-content">
                <i class="fas ${icon}"></i>
                <div class="toast-message">
                    <h4>${title}</h4>
                    <p>${message}</p>
                </div>
                <button class="toast-close" onclick="this.parentElement.parentElement.remove()">
                    <i class="fas fa-times"></i>
                </button>
            </div>
        `;

        const container = document.getElementById('toast-container') || (() => {
            const cont = document.createElement('div');
            cont.id = 'toast-container';
            document.body.appendChild(cont);
            return cont;
        })();

        container.appendChild(toast);

        setTimeout(() => {
            toast.classList.replace('animate__fadeInRight', 'animate__fadeOutRight');
            setTimeout(() => toast.remove(), 300);
        }, duration);
    }
}

// Initialize the music player
window.musicPlayer = new MusicPlayer();