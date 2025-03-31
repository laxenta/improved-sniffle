const { SlashCommandBuilder, EmbedBuilder, MessageFlags } = require('discord.js');
const axios = require('axios');

const getKissGif = async () => {
  try {
    const response = await axios.get('https://nekos.life/api/v2/img/kiss');
    return response.data.url;
  } catch (error) {
    console.error('Error fetching kiss gif:', error);
    return null;
  }
};

module.exports = {
  data: new SlashCommandBuilder()
    .setName('kiss')
    .setDescription('Sends a random kiss to the mentioned user.')
    .addUserOption(option =>
      option
        .setName('target')
        .setDescription('The user to kiss')
        .setRequired(true)
    ),
  async execute(interaction) {
    const targetUser = interaction.options.getUser('target');

    // Prevent users from kissing themselves.
    if (targetUser.id === interaction.user.id) {
      return interaction.reply({ 
        content: "<a:Hmmm:1327965196265721916>  w-wait.. you can't..! You might be lonely, but not that lonely..!", 
        flags: MessageFlags.Ephemeral 
      });
    }

    try {
      const gifUrl = await getKissGif();
      if (!gifUrl) {
        return interaction.reply({ 
          content: 'Failed to fetch a kiss gif :(', 
          flags: MessageFlags.Ephemeral 
        });
      }

      const embed = new EmbedBuilder()
        .setColor('#ff69b4')
        .setTitle(`${interaction.user.username} kisses ${targetUser.username} <a:kiss:1266746838363668563>! Cute?`)
        .setImage(gifUrl)
        .setFooter({ 
          text: 'nu uh kissies??!!'
          //iconURL: 'https://cdn.discordapp.com/avatars/953527567808356404/64f103044c017fc09ff94ff8ed0faf0b.png?size=2048' 
        });

      await interaction.reply({ embeds: [embed] });
      //console.log('Kiss command executed successfully.');
    } catch (error) {
      console.error('Error executing the kiss.js command:', error);
      return interaction.reply({ 
        content: 'fuck off, no kisses.', 
        flags: MessageFlags.Ephemeral 
      });
    }
  }
};