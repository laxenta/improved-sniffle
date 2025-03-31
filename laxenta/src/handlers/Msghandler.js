const logger = require('../utils/logger');
const { moderateMessage } = require('../utils/automod');
const { checkForSpam } = require('../utils/antiSpam');
const { PREFIX } = process.env;

const handleMessage = async (message, client) => {
console.log('Handling message:', message.content); // Logging message reception

// Moderate the message for profanities
await moderateMessage(message);

// Check for spamming
checkForSpam(message);

// Helper function to check and execute commands
async function checkAndExecuteCommand(message, client) {
console.log('Checking and executing command...'); // Debug log
if (!message.content.startsWith(PREFIX) || message.author.bot) return;

const args = message.content.slice(PREFIX.length).trim().split(/ +/);
const commandName = args.shift().toLowerCase();
const command = client.prefixCommands.get(commandName);

if (!command) {
logger.warn(`Command ${commandName} not found`);
return message.reply(`Unknown command: \`${commandName}\`. Try using \`${PREFIX}help\` or the slash command **[help]** to see the list of all commands.`);
}

if (command.permissions) {
const authorPerms = message.channel.permissionsFor(message.author);
if (!authorPerms || !authorPerms.has(command.permissions)) {
logger.warn(`User ${message.author.tag} lacks permissions for command ${commandName}`);
return message.reply('You do not have permission to use this command.');
}
}

try {
await command.execute(message, args);
  logger.info(`Executed command ${commandName} by ${message.author.tag}`);
  } catch (error) {
  logger.error(`Error executing command ${commandName} by ${message.author.tag}: ${error.message}`);
  return message.reply('There was an error executing that command!');
  }
  }

  // Check and execute commands if the message passes moderation
  await checkAndExecuteCommand(message, client);
  };

  module.exports = {
  handleMessage,
  };