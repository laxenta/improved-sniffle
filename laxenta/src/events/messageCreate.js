const { SlashCommandBuilder } = require('@discordjs/builders');
const { EmbedBuilder, Collection, MessageFlags, PermissionsBitField } = require('discord.js');
const mongoose = require('mongoose');
const errorHandler = require('../handlers/errorhandler');
const { BOT_ID } = process.env;
const { logger, handleError } = require('../utils/logger');

// Guild prefix schema & model
const guildPrefixSchema = new mongoose.Schema({
  guildId: { type: String, required: true, unique: true },
  prefix: { type: String, required: true },
});
const GuildPrefix = mongoose.model('GuildPrefix', guildPrefixSchema);

// AFK Schema & Model (auto expires after 24h)
const afkSchema = new mongoose.Schema({
  guildId: { type: String, required: true },
  userId: { type: String, required: true },
  reason: String,
  timestamp: { type: Date, default: Date.now, expires: 86400 } // 24h expiration
});
const AFK = mongoose.models.AFK || mongoose.model('AFK', afkSchema);

// Cooldown collection for commands
const cooldowns = new Collection();
const COOLDOWN_DURATION = 30000; // 30 seconds cooldown

// Connect to MongoDB (no deprecated options)
const mongoUri = process.env.MONGO_URI;
if (!mongoUri) throw new Error("MONGO_URI is not defined in the environment variables.");

mongoose.connect(mongoUri)
  .then(() => console.log("Connected to MongoDB for AFK functionality."))
  .catch((err) => console.error("MongoDB connection error:", err));

module.exports = {
  name: 'messageCreate',
  async execute(message, client) {
    try {
      // Ignore messages from bots (except our own) or non-guild messages.
      if (shouldIgnoreMessage(message)) return;
      if (!message.guild) return;

      // Check bot permissions.
      const botPerms = message.channel.permissionsFor(client.user);
      if (
        !botPerms ||
        !botPerms.has(PermissionsBitField.Flags.SendMessages) ||
        !botPerms.has(PermissionsBitField.Flags.EmbedLinks)
      ) {
        logger.warn(`Missing permissions in channel ${message.channel.id}`);
        return;
      }

      // --- Global AFK Check ---
      try {
        const afkStatus = await AFK.findOne({
          guildId: message.guild.id,
          userId: message.author.id,
        });
        if (afkStatus) {
          // Remove AFK status and reset nickname.
          await AFK.deleteOne({
            guildId: message.guild.id,
            userId: message.author.id,
          });
          if (message.member && message.member.displayName.includes('[AFK]')) {
            try {
              await message.member.setNickname(message.member.displayName.replace('[AFK] ', ''));
            } catch (err) {
              logger.warn('Unable to reset nickname:', err.message);
            }
          }
          const timeAFK = getTimeAFK(afkStatus.timestamp);
          message.channel.send({
            embeds: [
              new EmbedBuilder()
                .setColor(0x00FF00)
                .setDescription(`<a:E:1327982490144735253> Welcome back ${message.author}! You were AFK for ${timeAFK}.`)
            ]
          });
        }
      } catch (error) {
        logger.error('AFK check error:', error.message);
      }
      // --- End AFK Check ---

      // Retrieve the guild prefix.
      const guildPrefix = await getPrefix(message.guild.id);

      // Only process messages starting with the prefix or a bot mention.
      if (!message.content.startsWith(guildPrefix)) {
        const mentionRegex = new RegExp(`^<@!?${client.user.id}>`);
        if (mentionRegex.test(message.content)) {
          message.content = message.content.replace(mentionRegex, guildPrefix).trim();
        } else {
          return;
        }
      }

      // Process the command.
      await processCommand(message, client, guildPrefix);
    } catch (error) {
      logger.error(`Error in messageCreate: ${error.message}`, {
        error,
        messageId: message.id,
        channelId: message.channel.id,
        guildId: message.guild?.id
      });
      await errorHandler.handle(error, 'messageCreate');
    }
  },
};

async function getPrefix(guildId) {
  try {
    const guildSettings = await GuildPrefix.findOne({ guildId });
    return guildSettings?.prefix || '!';
  } catch (error) {
    logger.error(`Error retrieving prefix for guild ${guildId}: ${error.message}`);
    return '!';
  }
}

function shouldIgnoreMessage(message) {
  return message.author.bot && message.author.id !== BOT_ID;
}

async function processCommand(message, client, guildPrefix) {
  const args = message.content.slice(guildPrefix.length).trim().split(/ +/);
  const commandName = args.shift().toLowerCase();
  const command = client.prefixCommands.get(commandName);
  if (!command) return;

  // Permission check.
  if (command.permissions) {
    const authorPerms = message.channel.permissionsFor(message.author);
    if (!authorPerms || !authorPerms.has(command.permissions)) {
      await autoDeleteLog(message.channel, 'You do not have permission to use this command.');
      return;
    }
  }

  // Cooldown check.
  if (await isOnCooldown(message.author.id, command.name, command.cooldown || 3)) {
    await autoDeleteLog(message.channel, 'Please wait before using this command again.');
    return;
  }

  try {
    await command.execute(message, args, client);
  } catch (error) {
    logger.error(`Error executing command ${commandName}`, {
      error,
      command: commandName,
      userId: message.author.id,
      guildId: message.guild.id
    });
    await autoDeleteLog(message.channel, 'An error occurred while executing the command.');
    await errorHandler.handle(error, `Command: ${commandName}`);
  }
}

async function isOnCooldown(userId, action, cooldownInSeconds) {
  const key = `${userId}-${action}`;
  const now = Date.now();
  const cooldownAmount = cooldownInSeconds * 1000;

  if (cooldowns.has(key)) {
    const expirationTime = cooldowns.get(key) + cooldownAmount;
    if (now < expirationTime) return true;
  }

  cooldowns.set(key, now);
  setTimeout(() => cooldowns.delete(key), cooldownAmount);
  return false;
}

async function autoDeleteLog(channel, content, deleteAfter = 3000) {
  try {
    const logMessage = await channel.send({
      content,
      allowedMentions: { parse: [] }
    });
    setTimeout(() => logMessage.delete().catch(() => {}), deleteAfter);
  } catch (error) {
    logger.error(`Error sending auto-delete message: ${error.message}`, {
      channelId: channel.id,
      content
    });
  }
}

function getTimeAFK(timestamp) {
  const diff = Date.now() - timestamp;
  const hours = Math.floor(diff / 3600000);
  const minutes = Math.floor((diff % 3600000) / 60000);
  return hours > 0 ? `${hours}h ${minutes}m` : `${minutes}m`;
}