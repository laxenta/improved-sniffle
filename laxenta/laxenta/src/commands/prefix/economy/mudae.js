const { EmbedBuilder, ButtonBuilder, ActionRowBuilder } = require('discord.js');
const axios = require('axios');
const mongoose = require('mongoose');
const { registerButton } = require('../../../handlers/buttonHandler');
const economy = require('../../../utils/economyUtil');

const RATE_LIMITS = {
  rolls: { max: 8, cooldown: 55 * 60 * 1000 },
  marriages: { max: 5, cooldown: 3 * 60 * 60 * 1000 }
};

function generateCost() {
  return Math.floor(Math.random() * (3000000 - 250000 + 1)) + 250000;
}

const REACTIONS = {
  success: ['💝', '💖', '💕', '❤️', '💓'],
  failure: ['💔', '<a:e:1327965156579217439>', '<a:e:1327965196265721916>', '<:e:1327965208768942144>', '💢']
};

// List of waifu API endpoints
const WAIFU_APIS = [
  {
    name: "waifu.im",
    url: "https://api.waifu.im/search",
    // Use proper headers for authorized routes on waifu.im
    headers: {
      "Accept-Version": "v5",
      "Authorization": "Bearer TppSmBpqGUlpaIS4qefYR7Tr-RFjxB-xixNw6HNmjQMWCm90RpF-XqjOdtbvkYQPPymYoagANerP2Bg5L55ka80JW4gnIrno99KcGhLS6c-EelnvJKJTbJrOD2L2TLRF7ZN-Bm3HGOBMOhAfDe6qxCRWuL3wrJ5k_cS8JKoX24E"
    },
    transform: (data) => {
      // The waifu.im API returns an "images" array
      if (!data || !data.images || !Array.isArray(data.images) || data.images.length === 0) {
        throw new Error("Invalid data from waifu.im API");
      }
      return { image: data.images[0].url };
    }
  },
  {
    name: "waifu.pics",
    url: "https://api.waifu.pics/sfw/waifu",
    transform: (data) => {
      if (!data || !data.url) {
        throw new Error("Invalid data from API");
      }
      return { image: data.url };
    }
  }
];

async function fetchWaifuData() {
  try {
    // Randomly pick one of the APIs
    const api = WAIFU_APIS[Math.floor(Math.random() * WAIFU_APIS.length)];
    const headers = api.headers ? api.headers : {};
    const { data } = await axios.get(api.url, { headers, timeout: 5000 });
    return api.transform(data);
  } catch (error) {
    if (error.response?.status === 429) {
      throw new Error("Rate limit exceeded.. wait a min");
    }
    throw new Error(`API Error: ${error.message}`);
  }
}

const usageMap = {
  rolls: new Map(),
  marriages: new Map()
};

function getRemainingRolls(userId) {
  const usage = usageMap.rolls.get(userId) || { count: 0 };
  return RATE_LIMITS.rolls.max - usage.count;
}

function createWaifuEmbed(waifuData, cost, userId) {
  try {
    const remainingRolls = getRemainingRolls(userId);

    // Simple embed: only the image and marriage cost
    const embed = new EmbedBuilder()
      .setColor('#4169E1')
      .setImage(waifuData.image)
      .setFooter({ text: `${remainingRolls} rolls remaining!` });
      
    embed.addFields({
      name: '<a:eh:1327965154998095973> marriage cost',
      value: `⏣ **${cost.toLocaleString()}**`
    });
    
    return embed;
  } catch (error) {
    throw new Error(`Failed to create embed: ${error.message}`);
  }
}

function checkRateLimit(type, userId) {
  const now = Date.now();
  const limit = RATE_LIMITS[type];
  const usage = usageMap[type];

  if (!usage.has(userId)) {
    usage.set(userId, { count: 1, timestamp: now });
    return { limited: false };
  }

  const data = usage.get(userId);
  if (now - data.timestamp > limit.cooldown) {
    usage.set(userId, { count: 1, timestamp: now });
    return { limited: false };
  }

  if (data.count >= limit.max) {
    return { limited: true, reset: Math.floor((data.timestamp + limit.cooldown) / 1000) };
  }
  data.count++;
  return { limited: false };
}

const pendingMarriages = new Map();
const MARRIAGE_TIMEOUT = 60 * 1000;

const MarriageSchema = new mongoose.Schema({
  userId: String,
  username: String,
  waifus: [{
    id: String,
    url: String,
    marriedAt: { type: Date, default: Date.now },
    cost: Number,
    source: String
  }],
  totalSpent: { type: Number, default: 0 }
});

const Marriage = mongoose.models.Marriage || mongoose.model('Marriage', MarriageSchema);

function getRandomElement(array) {
  return array[Math.floor(Math.random() * array.length)];
}

async function handleMarriageConfirmation(interaction, marriage, rollId, cost) {
  try {
    const currentBalance = await economy.getBalance(interaction.user.id);
    if (currentBalance < cost) {
      throw new Error(`Insufficient funds! You need ⏣ **${cost.toLocaleString()}**. Use \`!slots\` or \`!eco\` to earn more coins.`);
    }

    const newBalance = await economy.updateBalance(interaction.user.id, -cost);
    let record = await Marriage.findOne({ userId: interaction.user.id });
    
    if (!record) {
      record = new Marriage({
        userId: interaction.user.id,
        username: interaction.user.username,
        waifus: []
      });
    }

    record.waifus.push({
      id: rollId,
      url: marriage.waifuData.image,
      cost,
      source: "waifu API"
    });
    
    record.totalSpent = (record.totalSpent || 0) + cost;
    await record.save();
    
    return {
      success: true,
      balance: newBalance,
      message: `${getRandomElement(REACTIONS.success)} **<@${interaction.user.id}>**, marriage successful! You married your waifu.\nCost: ⏣ **${cost.toLocaleString()}**\nNew balance: ⏣ **${newBalance.toLocaleString()}**\nTry \`!slots\` or \`!cf\` to earn more!`
    };
  } catch (error) {
    if (error.message.includes("Insufficient funds")) {
      throw error;
    }
    throw new Error("Marriage failed, my apologies uwu");
  }
}

module.exports = {
  name: 'wife',
  aliases: ['w', 'mudae'],
  description: 'mudae! find and marry waifus for a harem',
  async execute(message, args) {
    const userId = message.author.id;

    try {
      const rollLimit = checkRateLimit('rolls', userId);
      if (rollLimit.limited) {
        return message.reply({
          content: `${getRandomElement(REACTIONS.failure)} try again <t:${rollLimit.reset}:R> before rolling for waifus again, goofy simp`,
          allowedMentions: { users: [message.author.id] }
        });
      }

      const waifuData = await fetchWaifuData();
      const cost = generateCost();
      const rollId = Date.now().toString(36) + Math.random().toString(36).substr(2);
      
      const embed = createWaifuEmbed(waifuData, cost, userId);
      
      const marryBtn = new ButtonBuilder()
        .setCustomId(`marry_${rollId}`)
        .setEmoji('💖')
        .setStyle('Primary');
      const row = new ActionRowBuilder().addComponents(marryBtn);

      const marriageProposal = {
        waifuData,
        cost,
        userId,
        username: message.author.username
      };

      pendingMarriages.set(rollId, marriageProposal);
      setTimeout(() => pendingMarriages.delete(rollId), MARRIAGE_TIMEOUT);

      await message.channel.send({
        embeds: [embed],
        components: [row]
      });

      registerButton(`marry_${rollId}`, [userId], async (interaction) => {
        try {
          if (!interaction.deferred) await interaction.deferUpdate();
          
          const marriage = pendingMarriages.get(rollId);
          if (!marriage) {
            return interaction.editReply({
              content: `${getRandomElement(REACTIONS.failure)} This waifu is no longer available.`,
              components: []
            });
          }

          const balance = await economy.getBalance(userId);
          
          const confirmBtn = new ButtonBuilder()
            .setCustomId(`confirm_${rollId}`)
            .setEmoji('<a:marry:1327965184425332756>')
            .setStyle('Success')
            .setLabel('Confirm Marriage');
          const cancelBtn = new ButtonBuilder()
            .setCustomId(`cancel_${rollId}`)
            .setStyle('Danger')
            .setLabel('Cancel?');
          const confirmRow = new ActionRowBuilder().addComponents(confirmBtn, cancelBtn);

          await interaction.followUp({
            content: `<a:marry:1327965184425332756> Marriage Proposal for <@${userId}>!\nCost: ⏣ **${cost.toLocaleString()}**\nYour current balance: ⏣ **${balance.toLocaleString()}**\nConfirm marriage? (60s)`,
            components: [confirmRow]
          });

          registerButton(`confirm_${rollId}`, [userId], async (confirm) => {
            try {
              if (!confirm.deferred) await confirm.deferUpdate();
              
              const result = await handleMarriageConfirmation(confirm, marriage, rollId, cost);
              pendingMarriages.delete(rollId);
              
              await confirm.editReply({
                content: result.message,
                components: []
              });
            } catch (error) {
              await confirm.editReply({
                content: `${getRandomElement(REACTIONS.failure)} ${error.message}`,
                components: []
              });
            }
          });

          registerButton(`cancel_${rollId}`, [userId], async (cancel) => {
            try {
              if (!cancel.deferred) await cancel.deferUpdate();
              pendingMarriages.delete(rollId);
              
              await cancel.editReply({
                content: `${getRandomElement(REACTIONS.failure)} Marriage cancelled ;sad`,
                components: []
              });
            } catch (error) {
              console.error('Cancel button error:', error);
            }
          });
        } catch (error) {
          console.error('Marriage button error:', error);
          try {
            await interaction.editReply({
              content: `${getRandomElement(REACTIONS.failure)} sorry! Please try again, if it persists tell @me_straight`,
              components: []
            });
          } catch (replyError) {
            console.error('Reply error:', replyError);
          }
        }
      });
    } catch (error) {
      return message.reply({
        content: `${getRandomElement(REACTIONS.failure)} ${error.message}`,
        allowedMentions: { users: [message.author.id] }
      });
    }
  }
};