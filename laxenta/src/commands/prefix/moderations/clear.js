const { logger } = require("../../../utils/logger");

module.exports = {
  name: "clear",
  description: "Clear a specified number of messages from the channel above the command.",
  permissions: ["MANAGE_MESSAGES"],

  async execute(message, args) {
    if (!message.member.permissions.has(this.permissions)) {
      return message.reply("<A:eh:1326464297080983655> you lack permissions... meh").then((msg) =>
        setTimeout(() => msg.delete().catch(console.error), 1000)
      );
    }
    const amount = parseInt(args[0], 10);
    if (isNaN(amount) || amount <= 0 || amount > 100) {
      return message
        .reply("<:eh:1328691788546048065> only a number bw 1-99 will work")
        .then((msg) => setTimeout(() => msg.delete().catch(console.error), 2000));
    }
    try {
      const messagesToDelete = await message.channel.messages.fetch({ limit: amount + 1 });
      const filteredMessages = messagesToDelete.filter((msg) => msg.id !== message.id);
      await message.channel.bulkDelete(filteredMessages, true);
      const confirmationMessage = await message.channel.send(
        `<a:check:1326464291196370974> Successfully deleted ${filteredMessages.size} messages.`
      );
      setTimeout(() => confirmationMessage.delete().catch(console.error), 2000);
      message.delete().catch(console.error);
    } catch (error) {
      logger.error(`Error executing clear command: ${error}`);
      message
        .reply("<:sad:1328691744094552064> There was an error trying to clear messages in this channel.")
        .then((msg) => setTimeout(() => msg.delete().catch(console.error), 2000));
    }
  },
};