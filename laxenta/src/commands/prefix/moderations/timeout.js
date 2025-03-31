const { PermissionsBitField, EmbedBuilder } = require("discord.js");

function parseDuration(duration) {
  const match = duration.match(/^(\d+)(s|m|h|d)$/);
  if (!match) return null;
  const value = parseInt(match[1], 10);
  const unit = match[2];
  switch (unit) {
    case 's': return value * 1000;       // seconds
    case 'm': return value * 60 * 1000;    // minutes
    case 'h': return value * 60 * 60 * 1000; // hours
    case 'd': return value * 24 * 60 * 60 * 1000; // days
    default: return null;
  }
}

module.exports = {
  name: 'timeout',
  aliases: ['mute'],
  description: 'Temporarily time out a user in the server for a specified duration. Usage: !timeout @user/id 5m [reason]',
  async execute(message, args) {
    try {
      if (!message.member.permissions.has(PermissionsBitField.Flags.ModerateMembers)) {
        return message.reply({
          content: '<a:Noo:1326464297080983655> You do not have permission to use this command.',
          ephemeral: true
        });
      }

      // Support both mentions and IDs.
      let targetUser = message.mentions.members.first();
      if (!targetUser) {
        targetUser = await message.guild.members.fetch(args[0]).catch(() => null);
      }
      if (!targetUser) {
        return message.reply({
          content: '<:q:1326464001793855531> Please mention or provide a valid member ID.',
          ephemeral: true
        });
      }

      // Prevent timing out the server owner
      if (targetUser.id === message.guild.ownerId) {
        return message.reply({
          content: '<:q:1326464001793855531> I cannot timeout the server owner.',
          ephemeral: true
        });
      }

      // Check if the bot's highest role is higher than the target's role
      if (targetUser.roles.highest.position >= message.guild.members.me.roles.highest.position) {
        return message.reply({
          content: '<:q:1326464001793855531> I cannot timeout this user because their role is equal to or higher than mine.',
          ephemeral: true
        });
      }

      // The duration should be in args[1]
      const durationInput = args[1];
      const durationMs = parseDuration(durationInput);
      if (!durationMs || durationMs > 25 * 24 * 60 * 60 * 1000) {
        return message.reply({
          content: '<:Warning:1326464001793855531> Specify a valid duration up to 25 days (e.g., 10s, 1m, 1h, 1d).',
          ephemeral: true
        });
      }

      const reason = args.slice(2).join(' ') || 'No reason provided <:c:1326464001793855531>';

      // Use Discord's built-in timeout functionality
      await targetUser.timeout(durationMs, reason);
      const timeoutEndDate = new Date(Date.now() + durationMs);

      message.channel.send({
        embeds: [
          new EmbedBuilder()
            .setColor("#ff0000")
            .setTitle("Timeout Issued")
            .setDescription(`**${targetUser.user.tag}** has been timed out.`)
            .addFields(
              { name: "Duration <a:w:1326464173361856524>", value: durationInput, inline: true },
              { name: "Reason <:r:1326464001793855531>", value: reason, inline: true },
              { name: "Ends At <a:Warning:1326464273467179130>", value: `<t:${Math.floor(timeoutEndDate.getTime() / 1000)}:F>`, inline: true }
            )
            .setTimestamp()
            .setFooter({ text: "Moderation Action", iconURL: message.guild.iconURL() })
        ]
      });
    } catch (error) {
      console.error('Error executing the timeout command:', error);
      message.reply({
        content: '<a:block:1326464261953818664> There was an error executing the timeout command. Please try again.',
        ephemeral: true
      });
    }
  },
};