// path: commands/nom.js
const { EmbedBuilder } = require('discord.js');
const HMtai = require('hmtai');
const hmtai = new HMtai();

module.exports = {
  name: 'nom',
  description: 'Nom on someone in a playful way!',
  async execute(message, args) {
    const userToNom = message.mentions.users.first();

    if (!userToNom) {
      return message.channel.send('Mention someone to nom on them, silly!');
    }

    try {
      const nomGif = await hmtai.sfw.nom();
      const embed = new EmbedBuilder()
        .setTitle('<:heh:1328708369175023707> Nom nom!')
        .setDescription(`${message.author.username} noms on ${userToNom.username}. Tasty!`)
        .setImage(nomGif)
        .setColor(0xffc0cb)
       // .setTimestamp();

      await message.channel.send({ embeds: [embed] });
    } catch (error) {
      console.error(`Error fetching nom GIF: ${error.message}`);
      message.channel.send('Couldn\'t fetch the nom GIF. Try again later!');
    }
  },
};