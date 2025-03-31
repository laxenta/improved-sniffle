// path: commands/hug.js
const { EmbedBuilder } = require('discord.js');
const HMtai = require('hmtai');
const hmtai = new HMtai();

module.exports = {
  name: 'hug',
  description: 'Hug someone warmly!',
  async execute(message, args) {
    const userToHug = message.mentions.users.first();

    if (!userToHug) {
      return message.channel.send('Mention someone to hug, don’t be shy!');
    }

    try {
      const hugGif = await hmtai.sfw.hug();
      const embed = new EmbedBuilder()
        .setTitle('<a:cool:1327965151781064715> why nu one hugs me ;c')
        .setDescription(`${message.author.username} gives ${userToHug.username} a warm hug! Awww!`)
        .setImage(hugGif)
        .setColor(0xffc0cb)
        //.setTimestamp();

      await message.channel.send({ embeds: [embed] });
    } catch (error) {
      console.error(`Error fetching hug GIF: ${error.message}`);
      message.channel.send('Couldn\'t fetch the hug GIF. Try again later!');
    }
  },
};