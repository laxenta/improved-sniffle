const { PermissionsBitField } = require("discord.js");
const { getGuildData, setGuildData } = require("../../../utils/Storage");
const {
  disableVerificationSystem,
  createAccessChannel,
  lockAllChannels,
  adjustAccessChannelPermissions,
} = require("../../../utils/verification");

module.exports = {
  name: "toggleverify",
  description: "Toggle verification process for new users.",
  usage: "!toggleverify",
  async execute(message) {
    try {
      if (
        !message.member.permissions.has(PermissionsBitField.Flags.Administrator)
      ) {
        return message.reply("You do not have permission to use this command.");
      }

      const guildData = await getGuildData(message.guild.id);
      console.log(
        `Current verification state for ${message.guild.id}: ${guildData.verificationEnabled}`,
      );

      const verificationEnabled = !guildData.verificationEnabled;

      if (verificationEnabled) {
        await setGuildData(message.guild.id, { verificationEnabled });
        await createAccessChannel(message.guild);
        await lockAllChannels(message.guild);
        await adjustAccessChannelPermissions(message.guild);
        await message.reply("Verification system has been enabled <a:BlackHeart:1138688928216522832>");
      } else {
        await disableVerificationSystem(message.guild);
        await setGuildData(message.guild.id, { verificationEnabled });
        await message.reply("Verification system has been disabled <a:BlackHeart:1138688928216522832>");
      }

      console.log(
        `Updated verification state for ${message.guild.id}: ${verificationEnabled}`,
      );
    } catch (error) {
      console.error(
        `Error executing command toggleverify by ${message.author.tag}:`,
        error.message,
      );
      await message.reply(
        "There was an error executing the toggleverify command.",
      );
    }
  },
};
