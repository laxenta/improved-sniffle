// path: commands/bonk.js
const { EmbedBuilder } = require('discord.js');
const HMtai = require('hmtai');
const hmtai = new HMtai();

module.exports = {
  name: 'bonk',
  description: 'Bonk someone for being naughty!',
  async execute(message, args) {
    const userToBonk = message.mentions.users.first();

    if (!userToBonk) {
      return message.channel.send('Mention someone to bonk them!');
    }

    try {
      const bonkGif = await hmtai.sfw.bonk();
      const embed = new EmbedBuilder()
        .setTitle('<:heh:1328691788546048065> Bonk!')
        .setDescription(`${message.author.username} bonks <:bonk:1328691744094552064> ${userToBonk.username} to horni jail!`)
        .setImage(bonkGif)
        .setColor(0xff4500)

      await message.channel.send({ embeds: [embed] });
    } catch (error) {
      console.error(`Error fetching bonk GIF: ${error.message}`);
      message.channel.send('Couldn\'t fetch the bonk GIF. Try again later!');
    }
  },
};