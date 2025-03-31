const { EmbedBuilder } = require('discord.js');
const mongoose = require('mongoose');

// MongoDB connection
const mongoUri = process.env.MONGO_URI;
if (!mongoUri) throw new Error("MONGO_URI is not defined in the environment variables.");

mongoose.connect(mongoUri)
  .then(() => console.log("Connected to MongoDB for AFK functionality."))
  .catch((err) => console.error("MongoDB connection error:", err));

// AFK Schema (auto-cleanup after 24 hours)
const afkSchema = new mongoose.Schema({
  guildId: String,
  userId: String,
  reason: String,
  timestamp: { type: Date, default: Date.now, expires: 86400 } // 86400 seconds = 24 hours
});
const AFK = mongoose.models.AFK || mongoose.model('AFK', afkSchema);

module.exports = {
  name: 'afk',
  description: 'Set your AFK status (prefix-based)',
  async execute(message, args) {
    try {
      const reason = args.join(' ') || 'AFK';
      const userId = message.author.id;
      const guildId = message.guild.id;

      // Check if the user is already AFK
      const existingAfk = await AFK.findOne({ guildId, userId });
      if (existingAfk) {
        return message.reply({
          embeds: [
            new EmbedBuilder()
              .setColor(0xFF0000)
              .setDescription("<a:E:1327982490144735253> HEY goofy! I thought YOU ARE ALREADY AFK!")
          ]
        });
      }

      // Set the new AFK status
      await AFK.create({ guildId, userId, reason });

      // Update the user's nickname to include [AFK]
      const member = message.guild.members.cache.get(userId);
      if (member && !member.displayName.includes('[AFK]')) {
        try {
          await member.setNickname(`[AFK] ${member.displayName}`);
        } catch (error) {
          console.warn("Unable to update nickname for AFK:", error.message);
        }
      }

      // Send confirmation message
      message.reply({
        embeds: [
          new EmbedBuilder()
            .setColor(0x0000FF)
            .setDescription(`<a:E:1327982490144735253> ${message.author} is now AFK: **${reason}**`)
        ]
      });

      // Note: A global message listener (in your main bot file) should check every message
      // and, if a user with an AFK status sends a message anywhere in the guild,
      // remove their AFK status and reset their nickname.
    } catch (error) {
      console.error("Error handling AFK (prefix):", error);
      message.reply({
        embeds: [
          new EmbedBuilder()
            .setColor(0xFF0000)
            .setDescription("❌ An error occurred while setting your AFK status.")
        ]
      });
    }
  },
};