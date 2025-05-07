class SongManager {
    constructor() {
        this.itemsPerPage = 50;
        this.loadingMore = false;
        this.cache = new Map();
        this.currentOffset = 0;
        this.totalSongs = 0;
    }

    async loadLikedSongs(offset = 0) {
        try {
            const cacheKey = `liked-${offset}`;
            if (this.cache.has(cacheKey)) {
                return this.cache.get(cacheKey);
            }

            const response = await fetch(`/api/spotify/liked-songs?offset=${offset}&limit=${this.itemsPerPage}`);
            if (!response.ok) throw new Error('Failed to load songs');
            
            const data = await response.json();
            this.cache.set(cacheKey, data);
            this.totalSongs = data.total;
            return data;
        } catch (error) {
            console.error('Failed to load liked songs:', error);
            throw error;
        }
    }

    async renderLikedSongs(container, initialLoad = true) {
        if (initialLoad) {
            container.innerHTML = '<div class="loading-spinner"><div class="spinner"></div><p>Loading songs...</p></div>';
            this.currentOffset = 0;
            this.cache.clear();
        }

        try {
            const data = await this.loadLikedSongs(this.currentOffset);
            
            if (initialLoad) {
                container.innerHTML = '';
            }

            this.renderSongs(data.items, container);
            
            if (initialLoad || !document.querySelector('.sentinel')) {
                this.setupInfiniteScroll(container);
            }
        } catch (error) {
            container.innerHTML = `
                <div class="error-message">
                    <i class="fas fa-exclamation-circle"></i>
                    Failed to load songs. <button onclick="window.songManager.renderLikedSongs(document.querySelector('#liked-songs-container'), true)">Retry</button>
                </div>
            `;
        }
    }

    renderSongs(songs, container) {
        songs.forEach(item => {
            if (!item.track) return;
            
            const element = document.createElement('div');
            element.className = 'song-card animate__animated animate__fadeIn';
            
            const imageUrl = item.track.album?.images?.[0]?.url || '/images/default-song.png';
            const artistNames = item.track.artists?.map(a => a.name).join(', ') || 'Unknown Artist';
            const duration = this.formatDuration(item.track.duration_ms);
            
            element.innerHTML = `
                <img src="${imageUrl}" alt="${escapeHtml(item.track.name)}" loading="lazy">
                <div class="song-info">
                    <h4>${escapeHtml(item.track.name)}</h4>
                    <p>${escapeHtml(artistNames)}</p>
                    <span class="duration">${duration}</span>
                    <button onclick="window.musicPlayer.play('${item.track.uri}')" class="play-btn">
                        <i class="fas fa-play"></i> Play
                    </button>
                </div>
            `;
            
            container.appendChild(element);
        });
    }

    setupInfiniteScroll(container) {
        const sentinel = document.createElement('div');
        sentinel.className = 'sentinel';
        container.appendChild(sentinel);

        const observer = new IntersectionObserver(async (entries) => {
            const entry = entries[0];
            if (entry.isIntersecting && !this.loadingMore && this.currentOffset < this.totalSongs) {
                this.loadingMore = true;
                sentinel.innerHTML = '<div class="spinner"></div>';

                try {
                    this.currentOffset += this.itemsPerPage;
                    const data = await this.loadLikedSongs(this.currentOffset);
                    this.renderSongs(data.items, container);
                    
                    if (this.currentOffset >= this.totalSongs) {
                        observer.unobserve(sentinel);
                        sentinel.remove();
                    } else {
                        container.appendChild(sentinel);
                    }
                } catch (error) {
                    console.error('Failed to load more songs:', error);
                    this.currentOffset -= this.itemsPerPage; // Reset offset on error
                    sentinel.innerHTML = `
                        <button onclick="window.songManager.loadMore(document.querySelector('#liked-songs-container'))">
                            Try Again
                        </button>
                    `;
                }

                this.loadingMore = false;
            }
        });

        observer.observe(sentinel);
    }

    async loadMore(container) {
        const sentinel = container.querySelector('.sentinel');
        if (sentinel) {
            sentinel.innerHTML = '<div class="spinner"></div>';
            this.loadingMore = false; // Reset loading state to allow retry
            await this.renderLikedSongs(container, false);
        }
    }

    formatDuration(ms) {
        const minutes = Math.floor(ms / 60000);
        const seconds = Math.floor((ms % 60000) / 1000);
        return `${minutes}:${seconds.toString().padStart(2, '0')}`;
    }

    clearCache() {
        this.cache.clear();
        this.currentOffset = 0;
    }
}

// Initialize the song manager
window.songManager = new SongManager();