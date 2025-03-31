// path: commands/cuddle.js
const { EmbedBuilder } = require('discord.js');
const HMtai = require('hmtai');
const hmtai = new HMtai();

module.exports = {
  name: 'cuddle',
  description: 'Cuddle with someone!',
  async execute(message, args) {
    const userToCuddle = message.mentions.users.first();

    if (!userToCuddle) {
      return message.channel.send('Mention someone to cuddle with!');
    }

    try {
      const cuddleGif = await hmtai.sfw.cuddle();
      const embed = new EmbedBuilder()
        .setTitle('<a:eee:1327965154998095973> :3 Cuddle Time!')
        .setDescription(`${message.author.username} cuddles with ${userToCuddle.username}. So cozy!`)
        .setImage(cuddleGif)
        .setColor(0xff69b4)

      await message.channel.send({ embeds: [embed] });
    } catch (error) {
      console.error(`Error fetching cuddle GIF: ${error.message}`);
      message.channel.send('Couldn\'t fetch the cuddle GIF. Try again later!');
    }
  },
};