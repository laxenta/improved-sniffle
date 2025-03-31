const fs = require('fs');
const { DisTube } = require('distube');
const { SpotifyPlugin } = require('@distube/spotify');
const { YouTubePlugin } = require('@distube/youtube');
const path = require('path');
const { EmbedBuilder } = require('discord.js');

function setupDistube(client) {
  client.distube = new DisTube(client, {
    //searchCooldown: 30,
    //leaveOnEmpty: true,
    //leaveOnFinish: false,
    //leaveOnStop: false,
    plugins: [
      new SpotifyPlugin(),
      new YouTubePlugin(),
    ],
    emitNewSongOnly: true,
    emitAddSongWhenCreatingQueue: false,
    emitAddListWhenCreatingQueue: false
  });

  client.distube
    .on('playSong', (queue, song) => {
      const embed = new EmbedBuilder()
        .setTitle('🎵 Now Playing')
        .setDescription(`[${song.name}](${song.url})`)
        .addFields(
          { name: '👤 Requested By', value: song.user.tag, inline: true },
          { name: '⏱️ Duration', value: song.formattedDuration, inline: true },
          { name: '🔊 Volume', value: `${queue.volume}%`, inline: true }
        )
        .setThumbnail(song.thumbnail)
        .setColor('#1DB954')
        .setTimestamp();

      queue.textChannel.send({ embeds: [embed] });
    })
    .on('addSong', (queue, song) => {
      queue.textChannel.send({
        embeds: [
          new EmbedBuilder()
            .setDescription(`✅ Added **[${song.name}](${song.url})** to queue`)
            .setColor('#1DB954')
        ]
      });
    })
    .on('error', (channel, error) => {
      channel.send({
        embeds: [
          new EmbedBuilder()
            .setDescription(`❌ Error: ${error.message}`)
            .setColor('#FF0000')
        ]
      });
      console.error(error);
    });
}

module.exports = setupDistube;