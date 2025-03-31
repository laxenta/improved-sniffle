// path: commands/coffee_arts.js
const { EmbedBuilder } = require('discord.js');
const HMtai = require('hmtai');
const hmtai = new HMtai();

module.exports = {
  name: 'coffee',
  description: 'Send some beautiful coffee art!',
  async execute(message, args) {
    const userToSendCoffee = message.mentions.users.first();

    if (!userToSendCoffee) {
      return message.channel.send('Mention someone to share coffee art with!');
    }

    try {
      const coffeeGif = await hmtai.sfw.coffee_arts();
      const embed = new EmbedBuilder()
        .setTitle('<a:eh:1327965210295930910> sweettt!')
        .setDescription(`${message.author.username} shares sum art with ${userToSendCoffee.username}. Enjoy!`)
        .setImage(coffeeGif)
        .setColor(0x8b4513)
        //.setTimestamp();

      await message.channel.send({ embeds: [embed] });
    } catch (error) {
      console.error(`Error fetching coffee art GIF: ${error.message}`);
      message.channel.send('Couldn\'t fetch the coffee art GIF. Try again later!');
    }
  },
};