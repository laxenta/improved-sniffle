// Add these helper functions at the top of the file
function escapeHtml(unsafe) {
    if (!unsafe) return '';
    return unsafe
        .toString()
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}

function formatDuration(ms) {
    if (!ms) return '0:00';
    const minutes = Math.floor(ms / 60000);
    const seconds = Math.floor((ms % 60000) / 1000);
    return `${minutes}:${seconds.toString().padStart(2, '0')}`;
}

class MusicPlayer {
    constructor() {
        this.isPlaying = false;
        this.currentTrack = null;
        this.queue = [];
        this.volume = 100;
        this.retryAttempts = 3;
        this.retryDelay = 1000;
        this.isProcessing = false;
        this.queues = new Map(); // Store queues per guild
        this.activeGuildId = null;
        
        // New cache-related properties
        this.queueCache = new Map();
        this.queueFetchTimers = new Map();
        this.queueCacheTTL = 2000; // 2 seconds cache time
        
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

    async checkVoiceStatus(showToast = true) {
        try {
            const response = await fetch('/api/voice/status');
            if (!response.ok) throw new Error('Failed to check voice status');
            
            const data = await response.json();
            
            if (!data.inChannel) {
                // Only show toast if requested
                if (showToast) {
                    const toast = document.createElement('div');
                    toast.className = 'toast error';
                    toast.innerHTML = `
                        <div class="toast-content">
                            <i class="fas fa-microphone-slash"></i>
                            <div class="toast-message">
                                <h4>Not in a Voice Channel</h4>
                                <p>To play music:</p>
                                <ol style="margin: 5px 0 0 20px; font-size: 0.9em;">
                                    <li>Join a Discord voice channel</li>
                                    <li>Make sure the bot is in your server</li>
                                    <li>Try playing again</li>
                                </ol>
                            </div>
                        </div>
                    `;
    
                    const container = document.getElementById('toast-container');
                    container.appendChild(toast);
    
                    // Remove toast after 6 seconds
                    setTimeout(() => {
                        toast.classList.add('fade-out');
                        setTimeout(() => toast.remove(), 300);
                    }, 6000);
                }
    
                throw new Error('voice_not_found');
            }
    
            return data;
        } catch (error) {
            if (error.message === 'voice_not_found') throw error;
            console.error('Voice status check failed:', error);
            throw new Error('Failed to check voice status');
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
                '<i class="fas fa-play"></i>';
        });
    }

    async play(uri, guildId) {
        // Don't allow multiple play operations at once
        if (this.isProcessing) return;
        
        try {
            this.setLoadingState(true);
            
            // Use Promise.all to check voice status and prepare play request in parallel
            const [voiceStatus] = await Promise.all([
                this.checkVoiceStatus(false) // Set to false to avoid blocking UI with toast
            ]);
            
            // Use voice status guild ID if none provided
            guildId = guildId || voiceStatus.guildId;
            this.activeGuildId = guildId;
    
            // Send play request - don't wait for queue update before proceeding
            const playPromise = fetch('/api/music/play', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    uri,
                    guildId,
                    channelId: voiceStatus.channelId
                })
            }).then(res => {
                if (!res.ok) return res.json().then(data => Promise.reject(new Error(data.error)));
                return res.json();
            });
    
            // Start queue update in parallel but don't wait for it
            const queueUpdatePromise = playPromise.then(() => this.updateQueueDisplay(guildId, true));
            
            // Only wait for the play response
            const data = await playPromise;
            
            // Show toast immediately after play command succeeds
            this.showToast({
                title: data.track.isPlaying ? 'Now Playing' : 'Added to Queue',
                message: `${data.track.title} (Position: ${data.track.position})`,
                type: 'success',
                icon: data.track.isPlaying ? 'fa-play' : 'fa-list'
            });
    
            // Let queue update continue in background
            queueUpdatePromise.catch(err => console.error('Background queue update failed:', err));
            
            return data;
        } catch (error) {
            if (error.message !== 'voice_not_found') {
                this.showToast({
                    title: 'Error',
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

    async getQueueForGuild(guildId) {
        try {
            const cachedData = this.queueCache?.get(guildId);
            const now = Date.now();
            
            if (cachedData && (now - cachedData.timestamp < this.queueCacheTTL)) {
                return cachedData.data;
            }
            
            if (this.queueFetchTimers.has(guildId)) {
                clearTimeout(this.queueFetchTimers.get(guildId));
            }
            
            return new Promise((resolve, reject) => {
                this.queueFetchTimers.set(guildId, setTimeout(async () => {
                    try {
                        const response = await fetch(`/api/music/queue/${guildId}`);
                        if (!response.ok) throw new Error('Failed to fetch queue');
                        
                        const data = await response.json();
                        this.queueCache.set(guildId, {
                            timestamp: Date.now(),
                            data: data
                        });
                        this.queues.set(guildId, data);
                        resolve(data);
                    } catch (error) {
                        console.error('Failed to fetch queue:', error);
                        reject(error);
                    } finally {
                        this.queueFetchTimers.delete(guildId);
                    }
                }, 50));
            });
        } catch (error) {
            console.error('Failed to get queue:', error);
            throw error;
        }
    }

    async updateQueueDisplay(guildId, force = false) {
        if (!guildId) return;
        
        try {
            // Use cached queue data if available and not forcing refresh
            let queueData;
            if (!force && this.queues.has(guildId)) {
                queueData = this.queues.get(guildId);
            } else {
                queueData = await this.getQueueForGuild(guildId);
            }
            
            if (!queueData) return;
            
            const queueContainer = document.getElementById('queue-container');
            if (!queueContainer) return;
            
            // Use DocumentFragment for better performance

            const fragment = document.createDocumentFragment();
            const container = document.createElement('div');
            fragment.appendChild(container);
            
            if (queueData.current) {
                const currentTrackDiv = document.createElement('div');
                currentTrackDiv.className = 'current-track';
                currentTrackDiv.innerHTML = `
                    <h3>Now Playing</h3>
                    <div class="track-item current">
                        <img src="${queueData.current.thumbnail || '/images/default-song.png'}" alt="thumbnail">
                        <div class="track-info">
                            <h4>${escapeHtml(queueData.current.title || 'Unknown Title')}</h4>
                            <p>${escapeHtml(queueData.current.author || 'Unknown Artist')}</p>
                        </div>
                        <span class="requester">Added by ${escapeHtml(queueData.current.requester?.username || 'Unknown')}</span>
                        <span class="duration">${formatDuration(queueData.current.duration || 0)}</span>
                    </div>
                `;
                container.appendChild(currentTrackDiv);
            } else {
                const noTrackDiv = document.createElement('div');
                noTrackDiv.className = 'no-track';
                noTrackDiv.textContent = 'No track playing';
                container.appendChild(noTrackDiv);
            }
            
            if (queueData.queue && queueData.queue.length > 0) {
                const queueListDiv = document.createElement('div');
                queueListDiv.className = 'queue-list';
                queueListDiv.innerHTML = `<h3>Queue (${queueData.queue.length} tracks)</h3>`;
                
                queueData.queue.forEach((track, index) => {
                    const trackDiv = document.createElement('div');
                    trackDiv.className = 'track-item';
                    trackDiv.innerHTML = `
                        <span class="position">${index + 1}</span>
                        <img src="${track.thumbnail || '/images/default-song.png'}" alt="thumbnail">
                        <div class="track-info">
                            <h4>${escapeHtml(track.title || 'Unknown Title')}</h4>
                            <p>${escapeHtml(track.author || 'Unknown Artist')}</p>
                        </div>
                        <span class="requester">Added by ${escapeHtml(track.requester?.username || 'Unknown')}</span>
                        <span class="duration">${formatDuration(track.duration || 0)}</span>
                    `;
                    queueListDiv.appendChild(trackDiv);
                });
                
                container.appendChild(queueListDiv);
            } else {
                const emptyQueueDiv = document.createElement('div');
                emptyQueueDiv.className = 'empty-queue';
                emptyQueueDiv.textContent = 'Queue is empty';
                container.appendChild(emptyQueueDiv);
            }
            
            // Update DOM once with all changes
            queueContainer.innerHTML = '';
            queueContainer.appendChild(fragment);
            
        } catch (error) {
            console.error('Failed to update queue display:', error);
            const queueContainer = document.getElementById('queue-container');
            if (queueContainer) {
                queueContainer.innerHTML = `
                    <div class="error-message">
                        <i class="fas fa-exclamation-circle"></i>
                        Failed to load queue
                    </div>
                `;
            }
        }
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