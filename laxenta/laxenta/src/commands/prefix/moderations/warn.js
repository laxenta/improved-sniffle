const { PermissionsBitField, EmbedBuilder } = require("discord.js");
const mongoose = require("mongoose");
const { logger, handleError } = require("../../../utils/logger");
require("dotenv").config();

// Mongoose schema for warnings
const warningSchema = new mongoose.Schema({
  userId: String,
  guildId: String,
  warnings: [
    {
      reason: String,
      date: Date,
    },
  ],
});

const Warning = mongoose.model("Warning", warningSchema);

module.exports = {
  name: "warn",
  description: "Issues a warning to a user.",
  permissions: [PermissionsBitField.Flags.ModerateMembers],

  async execute(message, args) {
    try {
      if (!message.guild || !message.member) {
        await message.reply("<a:Noo:1296717159585812531> This command can only be used in a server ;-;");
        logger.warn("Warn command attempted in a non-server context.");
        return;
      }

      if (!message.member.permissions.has(PermissionsBitField.Flags.ModerateMembers)) {
        await message.reply("<a:Noo:1296717159585812531> You do not have permission to use this command ;c");
        logger.warn(
          `User ${message.author.tag} tried to use the warn command without sufficient permissions in ${message.guild.name}.`
        );
        return;
      }

      const targetUser = message.mentions.members.first();
      if (!targetUser || !targetUser.user) {
        await message.reply("<a:q:1296726867759468576> Please mention a valid member of this server.");
        logger.warn(`User ${message.author.tag} provided an invalid target for the warn command.`);
        return;
      }

      if (targetUser.user.bot) {
        await message.reply("<a:Noob:1140133508824715375> You cannot warn bots ;c");
        logger.info(`User ${message.author.tag} attempted to warn a bot.`);
        return;
      }

      const reason = args.slice(1).join(" ") || "No reason provided.";

      const botMember = await message.guild.members.fetch(message.client.user.id);
      if (!botMember.permissions.has(PermissionsBitField.Flags.ModerateMembers)) {
        await message.channel.send("<a:Noo:1296717159585812531> I lack the required permissions to manage members.");
        logger.error(`Bot lacks the required permissions to warn users in ${message.guild.name}.`);
        return;
      }

      let userWarnings = await Warning.findOne({
        userId: targetUser.id,
        guildId: message.guild.id,
      });

      if (!userWarnings) {
        userWarnings = new Warning({
          userId: targetUser.id,
          guildId: message.guild.id,
          warnings: [],
        });
      }

      userWarnings.warnings.push({ reason, date: new Date() });
      await userWarnings.save();
      const warningCount = userWarnings.warnings.length;

      logger.info(`User ${targetUser.user.tag} warned by ${message.author.tag} for reason: ${reason}. Total warnings: ${warningCount}.`);

      const dmEmbed = new EmbedBuilder()
        .setColor("#ffcc00")
        .setTitle("<a:w:1307562058933469265> You have been warned!")
        .setDescription(`You have received a warning in **${message.guild.name}**.`)
        .addFields(
          { name: "Reason <a:q:1296726867759468576>", value: reason },
          { name: "Total Warnings", value: `${warningCount}` }
        )
        .setTimestamp();

      const channelEmbed = new EmbedBuilder()
        .setColor("#ffcc00")
        .setTitle("<a:w:1307562058933469265> User Warned")
        .setDescription(`**${targetUser.user.tag}** has been warned.`)
        .addFields(
          { name: "Reason <a:q:1296726867759468576>", value: reason },
          { name: "Total Warnings", value: `${warningCount}` }
        )
        .setTimestamp();

      await targetUser.send({ embeds: [dmEmbed] }).catch((err) => {
        logger.warn(`Failed to send DM to ${targetUser.user.tag}: ${err.message}`);
      });

      await message.channel.send({ embeds: [channelEmbed] });

      if (warningCount >= 3) {
        let timeoutDuration;
        switch (warningCount) {
          case 3:
            timeoutDuration = 5 * 60 * 1000; // 5 minutes
            break;
          case 4:
            timeoutDuration = 10 * 60 * 1000; // 10 minutes
            break;
          default:
            timeoutDuration = 30 * 60 * 1000; // 30 minutes for 5 or more warnings
        }

        try {
          await targetUser.timeout(timeoutDuration, "Reached warning threshold.");
          await Warning.updateOne(
            { userId: targetUser.id, guildId: message.guild.id },
            { $set: { warnings: [] } }
          );

          logger.info(
            `User ${targetUser.user.tag} timed out for ${timeoutDuration / 60000} minutes due to excessive warnings.`
          );

          await message.channel.send(
            `<a:Timeout:1138688928216522832> **${targetUser.user.tag}** has been timed out for ${timeoutDuration / 60000} minutes due to excessive warnings.`
          );
        } catch (timeoutError) {
          logger.error(`Failed to timeout ${targetUser.user.tag}: ${timeoutError.message}`);
          await message.channel.send(
            `<a:Error:1138688928216522832> Failed to timeout **${targetUser.user.tag}**. Please check my permissions.`
          );
        }
      }
    } catch (error) {
      logger.error("Error executing the warn command:");
      handleError(error);
      await message.reply("<a:block:1084349801346367518> There was an error executing the warn command. Please try again.");
    }
  },
};