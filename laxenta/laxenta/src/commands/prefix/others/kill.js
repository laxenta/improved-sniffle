// path: commands/kill.js
const { EmbedBuilder } = require('discord.js');
const HMtai = require('hmtai');
const hmtai = new HMtai();

module.exports = {
  name: 'kill',
  description: 'Kill.em.all.',
  async execute(message, args) {
    const userToKill = message.mentions.users.first();

    // Validate that a user was mentioned
    if (!userToKill) {
      return message.channel.send('Please mention a user to "kill".');
    }

    try {
      // Fetch the kill GIF
      const killGif = await hmtai.sfw.kill();      // Create an embed with the GIF
      const embed = new EmbedBuilder()
        .setTitle('nu nuh, you die')
        .setDescription(`${message.author} is "killing" ${userToKill}!`)
        .setImage(killGif)
        .setColor(0xff0000)

      // Send the embed to the channel
      await message.channel.send({ embeds: [embed] });
    } catch (error) {
      console.error(`Error fetching kill GIF: ${error.message}`);
      message.channel.send('Failed to fetch the kill GIF. Please try again later.');
    }
  },
};