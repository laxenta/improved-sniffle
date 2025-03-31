const axios = require("axios");

module.exports = {
  name: "spank",
  description: "Sends a random NSFW anime spank image.",
  usage: "!spank @user",
  async execute(message, args) {
    try {
      // Check if the channel is NSFW
      if (!message.channel.nsfw) {
        return message.reply("You can only use this command in NSFW channels.");
      }

      const targetUser = message.mentions.users.first();
      const target = targetUser ? targetUser.toString() : "someone";
      const response = await axios.get("https://nekos.life/api/v2/img/spank");
      const imageUrl = response.data.url;

      // Send spank message and image
      await message.channel.send(`${message.author} spanks ${target}! Get SPANKED!`);
      await message.channel.send(imageUrl);

      console.log("Spank command executed successfully.");
    } catch (error) {
      console.error("Error fetching NSFW anime image:", error);
      message.reply(
        "There was an error trying to fetch the NSFW anime image. Please try again later."
      );
    }
  },
};
