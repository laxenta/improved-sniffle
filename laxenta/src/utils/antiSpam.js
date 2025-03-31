const { Collection, EmbedBuilder, PermissionsBitField, ChannelType } = require('discord.js');
const fs = require('fs');
const path = require('path');

const STORAGE_PATH = path.resolve(__dirname, '../storage.json');
const messageLimit = 5;
const timeFrame = 10000; // 10 seconds
const muteDuration = 60000; // 60 seconds

const defaultSettings = {
  autoModEnabled: true,
  antiSpamEnabled: true,
};

const messageLog = new Collection();
const mutedUsers = new Collection();

/**
 * Utility function to read storage data.
 */
function readStorage() {
  if (!fs.existsSync(STORAGE_PATH)) {
    fs.writeFileSync(STORAGE_PATH, JSON.stringify({}), 'utf8');
  }
  return JSON.parse(fs.readFileSync(STORAGE_PATH, 'utf8'));
}

/**
 * Utility function to write storage data.
 */
function writeStorage(data) {
  fs.writeFileSync(STORAGE_PATH, JSON.stringify(data), 'utf8');
}

/**
 * Get settings for a specific guild
 * @param {string} guildId
 * @returns {object}
 */
function getGuildSettings(guildId) {
  const data = readStorage();
  if (!data[guildId]) {
    data[guildId] = { ...defaultSettings };
    writeStorage(data);
  }
  return data[guildId];
}

/**
 * Set settings for a specific guild
 * @param {string} guildId
 * @param {object} settings
 */
function setGuildSettings(guildId, settings) {
  const data = readStorage();
  data[guildId] = settings;
  writeStorage(data);
}

/**
 * Check if auto-moderation is enabled for a specific guild
 * @param {string} guildId
 * @returns {boolean}
 */
function isAutoModEnabled(guildId) {
  const settings = getGuildSettings(guildId);
  return settings.autoModEnabled;
}

/**
 * Check if anti-spam is enabled for a specific guild
 * @param {string} guildId
 * @returns {boolean}
 */
function isAntiSpamEnabled(guildId) {
  const settings = getGuildSettings(guildId);
  return settings.antiSpamEnabled;
}

function checkForSpam(message) {
  if (!isAntiSpamEnabled(message.guild.id) || message.author.bot) return;

  const userMessages = messageLog.get(message.author.id) || [];
  const currentTime = Date.now();

  userMessages.push({ timestamp: currentTime, message });
  messageLog.set(message.author.id, userMessages);

  const recentMessages = userMessages.filter(
    (msg) => currentTime - msg.timestamp <= timeFrame
  );
  messageLog.set(message.author.id, recentMessages);

  if (recentMessages.length > messageLimit) {
    if (!mutedUsers.has(message.author.id)) {
      spamDetected(message.author.id, recentMessages);
    }
  }
}

async function spamDetected(userId, recentMessages) {
  const guild = recentMessages[0].message.guild;
  const member = guild.members.resolve(userId);
  const botMember = guild.members.resolve(guild.client.user.id); // Bot's member info

  if (!member) return;

  // Check if the bot can manage this member (hierarchy check)
  if (member.roles.highest.position >= botMember.roles.highest.position) {
    console.log(`Cannot timeout ${member.user.tag}: Higher or equal role hierarchy.`);
    return;
  }

  // Check if the member has permissions that would prevent a timeout
  if (member.permissions.has('Administrator') || member.permissions.has('ManageMessages')) {
    console.log(`Cannot timeout ${member.user.tag}: Has special permissions.`);
    return;
  }

  try {
    await member.timeout(muteDuration, 'Spamming messages');
    mutedUsers.set(userId, Date.now());

    for (const msgObj of recentMessages) {
      try {
        await msgObj.message.delete();
      } catch (error) {
        console.error('Error deleting spam message:', error);
      }
    }

    const embed = new EmbedBuilder()
      .setColor('#ff0000')
      .setTitle('Spam Detected')
      .setDescription(`<@${userId}> has been timed out for spamming :clock:`)
      .setTimestamp();

    const notification = await recentMessages[0].message.channel.send({
      embeds: [embed],
    });
    setTimeout(() => notification.delete(), 10000);

    setTimeout(async () => {
      mutedUsers.delete(userId);

      const unmuteEmbed = new EmbedBuilder()
        .setColor('#00ff00')
        .setTitle('Timeout Ended')
      .setDescription(`Timeout on <@${userId}> has been removed! Please make sure to not spam again <:sparkles:1296717153827033119>`)
        .setTimestamp();

      const unmuteNotification = await recentMessages[0].message.channel.send({
        embeds: [unmuteEmbed],
      });
      setTimeout(() => unmuteNotification.delete(), 10000);
    }, muteDuration);
  } catch (error) {
    console.error('Error timing out the user:', error);
  }
}

module.exports = {
  checkForSpam,
  isAutoModEnabled,
  isAntiSpamEnabled,
  getGuildSettings,
  setGuildSettings,
  readStorage,
  writeStorage,
};