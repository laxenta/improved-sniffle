// path: commands/slap.js
const { EmbedBuilder } = require('discord.js');
const HMtai = require('hmtai');
const hmtai = new HMtai();

module.exports = {
  name: 'slap',
  description: 'Slap someone playfully!',
  async execute(message, args) {
    const userToSlap = message.mentions.users.first();

    if (!userToSlap) {
      return message.channel.send('Mention someone to slap, c\'mon!');
    }

    try {
      const slapGif = await hmtai.sfw.slap();
      const embed = new EmbedBuilder()
        .setTitle('<:ehhehhe:1327965184425332756> Slap Fest!')
        .setDescription(`${message.author.username} gives ${userToSlap.username} a big slap!`)
        .setImage(slapGif)
        .setColor(0xff0000)
        //.setTimestamp();

      await message.channel.send({ embeds: [embed] });
    } catch (error) {
      console.error(`Error fetching slap GIF: ${error.message}`);
      message.channel.send('Couldn\'t :c u cant slap');
    }
  },
};