const { DisTube } = require('distube');
const { SpotifyPlugin } = require('@distube/spotify');
const { YtDlpPlugin } = require('@distube/yt-dlp');

function setupDistube(client) {
    const distube = new DisTube(client, {
        nsfw: false,
        plugins: [
            new SpotifyPlugin({
                api: {
                    clientId: process.env.SPOTIFY_CLIENT_ID,
                    clientSecret: process.env.SPOTIFY_CLIENT_SECRET,
                },
            }),
            new YtDlpPlugin(),
        ]
    });

    // Event handlers
    distube
        .on('playSong', (queue, song) => {
            queue.textChannel?.send({
                embeds: [{
                    color: 0x1DB954,
                    title: '🎵 Now Playing',
                    description: `[${song.name}](${song.url})`,
                    thumbnail: { url: song.thumbnail },
                    fields: [
                        { name: 'Duration', value: song.formattedDuration, inline: true },
                        { name: 'Requested by', value: `${song.user}`, inline: true },
                    ],
                }],
            });
        })
        .on('addSong', (queue, song) => {
            queue.textChannel?.send(`✅ Added to queue: **${song.name}**`);
        })
        .on('error', (channel, error) => {
            if (channel) {
                channel.send(`❌ An error occurred: ${error.message}`);
            }
            console.error(error);
        });

    return distube;
}

module.exports = setupDistube;
