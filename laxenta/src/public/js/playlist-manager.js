class PlaylistManager {
    constructor() {
        this.itemsPerPage = 50;
        this.loadingMore = false;
        this.activePlaylist = null;
        this.cache = new Map();
    }

    async loadPlaylistTracks(playlistId, offset = 0) {
        try {
            const cacheKey = `${playlistId}-${offset}`;
            if (this.cache.has(cacheKey)) {
                return this.cache.get(cacheKey);
            }

            const response = await fetch(`/api/spotify/playlist/${playlistId}/tracks?offset=${offset}&limit=${this.itemsPerPage}`);
            if (!response.ok) throw new Error('Failed to load tracks');
            
            const data = await response.json();
            this.cache.set(cacheKey, data);
            return data;
        } catch (error) {
            console.error('Failed to load playlist tracks:', error);
            throw error;
        }
    }

    async openPlaylist(playlistId, playlistName) {
        this.activePlaylist = playlistId;
        
        // Hide main content and show playlist view
        document.querySelector('#playlists-tab').style.display = 'none';
        
        // Create or get playlist view container
        let playlistView = document.querySelector('#playlist-view');
        if (!playlistView) {
            playlistView = document.createElement('div');
            playlistView.id = 'playlist-view';
            document.querySelector('main').appendChild(playlistView);
        }

        // Show loading state
        playlistView.innerHTML = `
            <div class="playlist-header">
                <button class="back-btn" onclick="window.playlistManager.closePlaylist()">
                    <i class="fas fa-arrow-left"></i> Back
                </button>
                <h2>${escapeHtml(playlistName)}</h2>
            </div>
            <div class="tracks-container content-grid">
                <div class="loading-spinner">
                    <div class="spinner"></div>
                    <p>Loading tracks...</p>
                </div>
            </div>
        `;

        try {
            const data = await this.loadPlaylistTracks(playlistId);
            const tracksContainer = playlistView.querySelector('.tracks-container');
            tracksContainer.innerHTML = '';
            
            this.renderTracks(data.items, tracksContainer);
            
            // Add intersection observer for infinite scroll
            this.setupInfiniteScroll(playlistId, tracksContainer, data.total);
            
            playlistView.style.display = 'block';
        } catch (error) {
            playlistView.innerHTML = `
                <div class="error-message">
                    <i class="fas fa-exclamation-circle"></i>
                    Failed to load playlist. <button onclick="window.playlistManager.openPlaylist('${playlistId}', '${playlistName}')">Retry</button>
                </div>
            `;
        }
    }

    closePlaylist() {
        const playlistView = document.querySelector('#playlist-view');
        if (playlistView) {
            playlistView.style.display = 'none';
        }
        document.querySelector('#playlists-tab').style.display = 'block';
        this.activePlaylist = null;
    }

    renderTracks(tracks, container) {
        tracks.forEach(item => {
            if (!item.track) return; // Skip any null tracks
            
            const element = document.createElement('div');
            element.className = 'song-card animate__animated animate__fadeIn';
            
            const imageUrl = item.track.album?.images?.[0]?.url || '/images/default-song.png';
            const artistNames = item.track.artists.map(a => a.name).join(', ');
            
            element.innerHTML = `
                <img src="${imageUrl}" alt="${escapeHtml(item.track.name)}" loading="lazy">
                <div class="track-info">
                    <h4>${escapeHtml(item.track.name)}</h4>
                    <p>${escapeHtml(artistNames)}</p>
                    <button onclick="window.musicPlayer.play('${item.track.uri}')" class="play-btn">
                        <i class="fas fa-play"></i> Play
                    </button>
                </div>
            `;
            
            container.appendChild(element);
        });
    }

    setupInfiniteScroll(playlistId, container, totalTracks) {
        // Create sentinel element for intersection observer
        const sentinel = document.createElement('div');
        sentinel.className = 'sentinel';
        container.appendChild(sentinel);

        const observer = new IntersectionObserver(async (entries) => {
            const entry = entries[0];
            if (entry.isIntersecting && !this.loadingMore) {
                const currentCount = container.querySelectorAll('.song-card').length;
                
                if (currentCount >= totalTracks) {
                    observer.unobserve(sentinel);
                    return;
                }

                this.loadingMore = true;
                sentinel.innerHTML = '<div class="spinner"></div>';

                try {
                    const data = await this.loadPlaylistTracks(playlistId, currentCount);
                    this.renderTracks(data.items, container);
                    
                    // Move sentinel to end of new content
                    container.appendChild(sentinel);
                } catch (error) {
                    console.error('Failed to load more tracks:', error);
                    sentinel.innerHTML = `
                        <button onclick="window.playlistManager.loadMore('${playlistId}', ${currentCount})">
                            Load More
                        </button>
                    `;
                }

                this.loadingMore = false;
            }
        });

        observer.observe(sentinel);
    }
}