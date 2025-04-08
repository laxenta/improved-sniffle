const { 
  SlashCommandBuilder, 
  EmbedBuilder, 
  ButtonBuilder, 
  ActionRowBuilder, 
  StringSelectMenuBuilder,
  ComponentType 
} = require('discord.js');
const axios = require('axios');
const mongoose = require('mongoose');
const economy = require('../../../utils/economyUtil');

// -------------------- Custom Emoji IDs for Fates ---------------------
const ACQUAINT_FATE_ID = "1338048280336273493";      // Emoji ID for Acquaint Fate
const INTERTWINED_FATE_ID = "1338048277605646366";   // Emoji ID for Intertwined Fate

// -------------------- Fate Prices -------------------------------------
const ACQUAINT_FATE_PRICE = 30000;
const INTERTWINED_FATE_PRICE = 50000;

// -------------------- Banner & Wishing Image URLs ---------------------
const STANDARD_BANNER_IMAGE = "https://media.discordapp.net/attachments/1338050055034245140/1338056453671489650/Genshin-Impact-Wanderlust-Invocation-Banner.png";
const LIMITED_BANNER_ONE_IMAGE = "https://media.discordapp.net/attachments/1338050055034245140/1338056402513694720/1713838175667APZCatMSvT.png";
const LIMITED_BANNER_TWO_IMAGE = "https://media.discordapp.net/attachments/1338050055034245140/1338056510646779984/Genshin-Impact-5.png";

// -------------------- Wishing Screen Images --------------------------
const WISHING_SCREEN_IMAGE = "https://media.tenor.com/-0gPdn6GMVAAAAAM/genshin3star-wish.gif";
const FIVE_STAR_WISH_GIF = "https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcSI1CvZs9yjx8_cwe_WwcX9MrMaAihxcsiVv0PhZHQhZFE7zYqB6its8a4uFX-VN0ITDSI&usqp=CAU";
const FOUR_STAR_WISH_GIF = "https://media.tenor.com/-0gPdn6GMVAAAAAM/genshin3star-wish.gif";

// -------------------- MongoDB Schema & Model ---------------------------
const GenshinInventorySchema = new mongoose.Schema({
  userId: { type: String, required: true },
  username: { type: String, required: true },
  fates: {
    acquaint: { type: Number, default: 0 },
    intertwined: { type: Number, default: 0 }
  },
  currentBanner: { type: String, default: 'limited1' },
  pity: {
    standard: { type: Number, default: 0 },
    limited: { type: Number, default: 0 }
  },
  inventory: [{
    name: String,
    type: String,          // "character" or "weapon"
    rarity: Number,        // 3, 4, or 5
    image: String,
    sellPrice: Number
  }]
});
const GenshinInventory = mongoose.models.GenshinInventory || mongoose.model('GenshinInventory', GenshinInventorySchema);

// Cache for Genshin data
let charactersCache = null;
let weaponsCache = null;

// -------------------- Helper Functions -------------------------------

// Fetch all characters from API
async function fetchAllCharacters() {
  if (charactersCache) return charactersCache;
  
  try {
    const response = await axios.get('https://genshin.jmp.blue/characters/all?lang=en');
    charactersCache = response.data;
    return charactersCache;
  } catch (error) {
    console.error('Error fetching characters:', error);
    return [];
  }
}

// Fetch all weapons from API
async function fetchAllWeapons() {
  if (weaponsCache) return weaponsCache;
  
  try {
    const response = await axios.get('https://genshin.jmp.blue/weapons/all?lang=en');
    weaponsCache = response.data;
    return weaponsCache;
  } catch (error) {
    console.error('Error fetching weapons:', error);
    return [];
  }
}

// Get character image URL
function getCharacterImageUrl(characterName) {
  // Replace spaces with dashes and convert to lowercase for URL
  const formattedName = characterName.toLowerCase().replace(/ /g, '-');
  return `https://genshin.jmp.blue/characters/${formattedName}/icon`;
}

// Get weapon image URL
function getWeaponImageUrl(weaponName) {
  // Replace spaces with dashes and convert to lowercase for URL
  const formattedName = weaponName.toLowerCase().replace(/ /g, '-');
  return `https://genshin.jmp.blue/weapons/${formattedName}/icon`;
}

async function getUserInventory(userId, username) {
  let inv = await GenshinInventory.findOne({ userId });
  if (!inv) {
    inv = new GenshinInventory({ userId, username });
    await inv.save();
  }
  return inv;
}

function getBannerImage(bannerType) {
  switch (bannerType) {
    case 'limited1': return LIMITED_BANNER_ONE_IMAGE;
    case 'limited2': return LIMITED_BANNER_TWO_IMAGE;
    case 'standard': return STANDARD_BANNER_IMAGE;
    default: return STANDARD_BANNER_IMAGE;
  }
}

function getFateTypeAndEmoji(bannerType) {
  if (bannerType === 'standard') {
    return { fateType: 'acquaint', emoji: `<:acquaint:${ACQUAINT_FATE_ID}>` };
  } else {
    return { fateType: 'intertwined', emoji: `<:intertwined:${INTERTWINED_FATE_ID}>` };
  }
}

function getFatePriceByType(fateType) {
  return fateType === 'acquaint' ? ACQUAINT_FATE_PRICE : INTERTWINED_FATE_PRICE;
}

async function performWishes(bannerType, count, startingPity) {
  const allCharacters = await fetchAllCharacters();
  const allWeapons = await fetchAllWeapons();
  
  // Filter by rarity
  const fiveStarCharacters = allCharacters.filter(char => char.rarity === 5);
  const fourStarCharacters = allCharacters.filter(char => char.rarity === 4);
  const fourStarWeapons = allWeapons.filter(weapon => weapon.rarity === 4);
  const threeStarWeapons = allWeapons.filter(weapon => weapon.rarity === 3);
  
  // Featured characters for limited banners (you can customize these)
  const featured5StarCharacters = {
    limited1: ["Neuvillette", "Hu Tao", "Zhongli"].filter(name => 
      fiveStarCharacters.some(char => char.name === name)),
    limited2: ["Furina", "Raiden Shogun", "Yelan"].filter(name => 
      fiveStarCharacters.some(char => char.name === name)),
    standard: []
  };
  
  const featured4StarCharacters = {
    limited1: ["Bennett", "Fischl", "Xingqiu", "Xiangling"].filter(name => 
      fourStarCharacters.some(char => char.name === name)),
    limited2: ["Beidou", "Ningguang", "Noelle", "Barbara"].filter(name => 
      fourStarCharacters.some(char => char.name === name)),
    standard: []
  };
  
  let pity = startingPity;
  const results = [];
  let totalCommonCoins = 0;
  
  for (let i = 0; i < count; i++) {
    let result;
    
    // Implement 5★ pity at 90 pulls
    if (pity >= 89) {
      // Guaranteed 5★
      if (bannerType === 'standard') {
        // 50/50 character or weapon on standard banner
        const is5StarCharacter = Math.random() < 0.5;
        if (is5StarCharacter) {
          const randomChar = fiveStarCharacters[Math.floor(Math.random() * fiveStarCharacters.length)];
          result = { 
            rarity: 5, 
            type: 'character', 
            name: randomChar.name, 
            image: getCharacterImageUrl(randomChar.name) 
          };
        } else {
          const fiveStarWeapons = allWeapons.filter(weapon => weapon.rarity === 5);
          const randomWeapon = fiveStarWeapons[Math.floor(Math.random() * fiveStarWeapons.length)];
          result = { 
            rarity: 5, 
            type: 'weapon', 
            name: randomWeapon.name, 
            image: getWeaponImageUrl(randomWeapon.name) 
          };
        }
      } else {
        // Limited banner guaranteed featured 5★ character
        const featuredChars = featured5StarCharacters[bannerType];
        const randomFeaturedChar = featuredChars[Math.floor(Math.random() * featuredChars.length)];
        if (randomFeaturedChar) {
          result = { 
            rarity: 5, 
            type: 'character', 
            name: randomFeaturedChar, 
            image: getCharacterImageUrl(randomFeaturedChar) 
          };
        } else {
          // Fallback if no featured characters defined
          const randomChar = fiveStarCharacters[Math.floor(Math.random() * fiveStarCharacters.length)];
          result = { 
            rarity: 5, 
            type: 'character', 
            name: randomChar.name, 
            image: getCharacterImageUrl(randomChar.name) 
          };
        }
      }
      pity = 0;
    } else {
      // Normal wish rates: 0.6% for 5★, 5.1% for 4★, 94.3% for 3★
      const roll = Math.random() * 100;
      
      if (roll < 0.6) {
        // 5★ roll
        if (bannerType === 'standard') {
          // 50/50 character or weapon
          const is5StarCharacter = Math.random() < 0.5;
          if (is5StarCharacter) {
            const randomChar = fiveStarCharacters[Math.floor(Math.random() * fiveStarCharacters.length)];
            result = { 
              rarity: 5, 
              type: 'character', 
              name: randomChar.name, 
              image: getCharacterImageUrl(randomChar.name) 
            };
          } else {
            const fiveStarWeapons = allWeapons.filter(weapon => weapon.rarity === 5);
            const randomWeapon = fiveStarWeapons[Math.floor(Math.random() * fiveStarWeapons.length)];
            result = { 
              rarity: 5, 
              type: 'weapon', 
              name: randomWeapon.name, 
              image: getWeaponImageUrl(randomWeapon.name) 
            };
          }
        } else {
          // Limited banner featured 5★ (50% chance) or standard 5★
          const isFeatureBanner = Math.random() < 0.5;
          if (isFeatureBanner) {
            const featuredChars = featured5StarCharacters[bannerType];
            const randomFeaturedChar = featuredChars[Math.floor(Math.random() * featuredChars.length)];
            if (randomFeaturedChar) {
              result = { 
                rarity: 5, 
                type: 'character', 
                name: randomFeaturedChar, 
                image: getCharacterImageUrl(randomFeaturedChar) 
              };
            } else {
              const randomChar = fiveStarCharacters[Math.floor(Math.random() * fiveStarCharacters.length)];
              result = { 
                rarity: 5, 
                type: 'character', 
                name: randomChar.name, 
                image: getCharacterImageUrl(randomChar.name) 
              };
            }
          } else {
            // Standard 5★ (non-featured)
            const randomChar = fiveStarCharacters[Math.floor(Math.random() * fiveStarCharacters.length)];
            result = { 
              rarity: 5, 
              type: 'character', 
              name: randomChar.name, 
              image: getCharacterImageUrl(randomChar.name) 
            };
          }
        }
        pity = 0;
      } else if (roll < 5.7) {
        // 4★ roll
        // 50/50 chance for character or weapon
        const is4StarCharacter = Math.random() < 0.5;
        
        if (is4StarCharacter) {
          // 50% chance to get featured 4★ on limited banners
          if (bannerType !== 'standard' && Math.random() < 0.5) {
            const featuredChars = featured4StarCharacters[bannerType];
            if (featuredChars && featuredChars.length > 0) {
              const randomFeaturedChar = featuredChars[Math.floor(Math.random() * featuredChars.length)];
              result = { 
                rarity: 4, 
                type: 'character', 
                name: randomFeaturedChar, 
                image: getCharacterImageUrl(randomFeaturedChar) 
              };
            } else {
              // Fallback
              const randomChar = fourStarCharacters[Math.floor(Math.random() * fourStarCharacters.length)];
              result = { 
                rarity: 4, 
                type: 'character', 
                name: randomChar.name, 
                image: getCharacterImageUrl(randomChar.name) 
              };
            }
          } else {
            // Standard 4★ character
            const randomChar = fourStarCharacters[Math.floor(Math.random() * fourStarCharacters.length)];
            result = { 
              rarity: 4, 
              type: 'character', 
              name: randomChar.name, 
              image: getCharacterImageUrl(randomChar.name) 
            };
          }
        } else {
          // 4★ weapon
          const randomWeapon = fourStarWeapons[Math.floor(Math.random() * fourStarWeapons.length)];
          result = { 
            rarity: 4, 
            type: 'weapon', 
            name: randomWeapon.name, 
            image: getWeaponImageUrl(randomWeapon.name) 
          };
        }
        pity++;
      } else {
        // 3★ weapon (always)
        //check here for errors
        
        // Continuing from where the code left off...
        const randomWeapon = threeStarWeapons[Math.floor(Math.random() * threeStarWeapons.length)];
        result = { 
          rarity: 3, 
          type: 'weapon', 
          name: randomWeapon.name, 
          image: getWeaponImageUrl(randomWeapon.name) 
        };
        pity++;
        
        // Award common coins for 3★ weapons
        totalCommonCoins += 15;
      }
    }
    
    // Add sell price based on rarity
    if (result) {
      result.sellPrice = result.rarity === 5 ? 10000 : 
                          result.rarity === 4 ? 2000 : 
                          result.rarity === 3 ? 150 : 0;
      results.push(result);
    }
  }
  
  return { results, updatedPity: pity, commonCoins: totalCommonCoins };
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('wish')
    .setDescription('Genshin Impact wishing system')
    .addSubcommand(subcommand =>
      subcommand
        .setName('shop')
        .setDescription('Buy Acquaint or Intertwined Fates'))
    .addSubcommand(subcommand =>
      subcommand
        .setName('banner')
        .setDescription('Select which banner to wish on'))
    .addSubcommand(subcommand =>
      subcommand
        .setName('pull')
        .setDescription('Make wishes on the current banner')
        .addIntegerOption(option =>
          option.setName('count')
            .setDescription('Number of wishes to make (1 or 10)')
            .setRequired(true)
            .addChoices(
              { name: 'Single Pull', value: 1 },
              { name: '10 Pull', value: 10 }
            )))
    .addSubcommand(subcommand =>
      subcommand
        .setName('inventory')
        .setDescription('View your character and weapon inventory')),
        
  async execute(interaction) {
    const subcommand = interaction.options.getSubcommand();
    const userId = interaction.user.id;
    const username = interaction.user.username;
    
    try {
      switch (subcommand) {
        case 'shop':
          await handleShop(interaction, userId, username);
          break;
        case 'banner':
          await handleBannerSelection(interaction, userId, username);
          break;
        case 'pull':
          await handleWishPull(interaction, userId, username);
          break;
        case 'inventory':
          await handleInventory(interaction, userId, username);
          break;
      }
    } catch (error) {
      console.error('Error in wish command:', error);
      await interaction.reply({ 
        content: 'An error occurred while processing your request. Please try again later.', 
        ephemeral: true 
      });
    }
  }
};

// -------------------- Command Handlers -------------------------------

async function handleShop(interaction, userId, username) {
  const userBalance = await economy.getBalance(userId);
  
  const acquaintFateEmoji = `<:acquaint:${ACQUAINT_FATE_ID}>`;
  const intertwinedFateEmoji = `<:intertwined:${INTERTWINED_FATE_ID}>`;
  
  // Create shop embed
  const shopEmbed = new EmbedBuilder()
    .setTitle('Genshin Impact Fate Shop')
    .setDescription(`**Your Balance:** ${userBalance.toLocaleString()} coins\n\nSelect a fate to purchase:`)
    .addFields(
      { name: `${acquaintFateEmoji} Acquaint Fate`, value: `Price: ${ACQUAINT_FATE_PRICE.toLocaleString()} coins\nUse on Standard Banner (Wanderlust Invocation)` },
      { name: `${intertwinedFateEmoji} Intertwined Fate`, value: `Price: ${INTERTWINED_FATE_PRICE.toLocaleString()} coins\nUse on Limited Character Event Banners` }
    )
    .setColor('#9370DB')
    .setFooter({ text: 'Paimon\'s Bargains' });
  
  // Create selection menu for purchasing
  const select = new StringSelectMenuBuilder()
    .setCustomId('shop_select')
    .setPlaceholder('Select a Fate to purchase...')
    .addOptions([
      {
        label: 'Acquaint Fate',
        description: `${ACQUAINT_FATE_PRICE.toLocaleString()} coins`,
        value: 'acquaint_1',
        emoji: ACQUAINT_FATE_ID
      },
      {
        label: '10x Acquaint Fate',
        description: `${(ACQUAINT_FATE_PRICE * 10).toLocaleString()} coins`,
        value: 'acquaint_10',
        emoji: ACQUAINT_FATE_ID
      },
      {
        label: 'Intertwined Fate',
        description: `${INTERTWINED_FATE_PRICE.toLocaleString()} coins`,
        value: 'intertwined_1',
        emoji: INTERTWINED_FATE_ID
      },
      {
        label: '10x Intertwined Fate',
        description: `${(INTERTWINED_FATE_PRICE * 10).toLocaleString()} coins`,
        value: 'intertwined_10',
        emoji: INTERTWINED_FATE_ID
      }
    ]);
  
  const row = new ActionRowBuilder().addComponents(select);
  
  const response = await interaction.reply({
    embeds: [shopEmbed],
    components: [row],
    fetchReply: true
  });
  
  // Handle selection interactions
  const collector = response.createMessageComponentCollector({ 
    componentType: ComponentType.StringSelect,
    time: 60000
  });
  
  collector.on('collect', async i => {
    if (i.user.id !== userId) {
      await i.reply({ content: 'This shop menu is not for you!', ephemeral: true });
      return;
    }
    
    const [fateType, countStr] = i.values[0].split('_');
    const count = parseInt(countStr);
    const price = getFatePriceByType(fateType) * count;
    const currentBalance = await economy.getBalance(userId);
    
    if (currentBalance < price) {
      await i.update({ 
        content: `❌ You don't have enough coins! You need ${price.toLocaleString()} coins but only have ${currentBalance.toLocaleString()}.`,
        embeds: [shopEmbed], 
        components: [row]
      });
      return;
    }
    
    // Update user's inventory
    const userInv = await getUserInventory(userId, username);
    userInv.fates[fateType] += count;
    await userInv.save();
    
    // Deduct coins
    await economy.addBalance(userId, -price);
    
    await i.update({ 
      content: `✅ Successfully purchased ${count}x ${fateType === 'acquaint' ? acquaintFateEmoji : intertwinedFateEmoji} ${fateType === 'acquaint' ? 'Acquaint' : 'Intertwined'} ${count > 1 ? 'Fates' : 'Fate'} for ${price.toLocaleString()} coins!`,
      embeds: [shopEmbed], 
      components: [row]
    });
  });
  
  collector.on('end', async () => {
    await interaction.editReply({ components: [] }).catch(console.error);
  });
}

async function handleBannerSelection(interaction, userId, username) {
  const userInv = await getUserInventory(userId, username);
  
  const bannerEmbed = new EmbedBuilder()
    .setTitle('Genshin Impact Banner Selection')
    .setDescription('Select a banner to wish on:')
    .setColor('#9370DB')
    .setImage(getBannerImage(userInv.currentBanner))
    .addFields(
      { name: 'Your Fates', value: `<:acquaint:${ACQUAINT_FATE_ID}> Acquaint: ${userInv.fates.acquaint}\n<:intertwined:${INTERTWINED_FATE_ID}> Intertwined: ${userInv.fates.intertwined}` },
      { name: 'Pity Counter', value: `Standard Banner: ${userInv.pity.standard}/90\nLimited Banner: ${userInv.pity.limited}/90` }
    );
  
  const select = new StringSelectMenuBuilder()
    .setCustomId('banner_select')
    .setPlaceholder('Select a banner...')
    .addOptions([
      {
        label: 'Limited Banner 1',
        description: 'Featured: Neuvillette, Hu Tao, Zhongli',
        value: 'limited1'
      },
      {
        label: 'Limited Banner 2',
        description: 'Featured: Furina, Raiden Shogun, Yelan',
        value: 'limited2'
      },
      {
        label: 'Standard Banner',
        description: 'Wanderlust Invocation',
        value: 'standard'
      }
    ]);
  
  const row = new ActionRowBuilder().addComponents(select);
  
  const response = await interaction.reply({
    embeds: [bannerEmbed],
    components: [row],
    fetchReply: true
  });
  
  const collector = response.createMessageComponentCollector({ 
    componentType: ComponentType.StringSelect,
    time: 60000
  });
  
  collector.on('collect', async i => {
    if (i.user.id !== userId) {
      await i.reply({ content: 'This banner selection is not for you!', ephemeral: true });
      return;
    }
    
    const selectedBanner = i.values[0];
    
    // Update user's selected banner
    userInv.currentBanner = selectedBanner;
    await userInv.save();
    
    const updatedEmbed = new EmbedBuilder()
      .setTitle('Genshin Impact Banner Selection')
      .setDescription(`You've selected the **${selectedBanner === 'limited1' ? 'Limited Banner 1' : selectedBanner === 'limited2' ? 'Limited Banner 2' : 'Standard Banner'}**!`)
      .setColor('#9370DB')
      .setImage(getBannerImage(selectedBanner))
      .addFields(
        { name: 'Your Fates', value: `<:acquaint:${ACQUAINT_FATE_ID}> Acquaint: ${userInv.fates.acquaint}\n<:intertwined:${INTERTWINED_FATE_ID}> Intertwined: ${userInv.fates.intertwined}` },
        { name: 'Pity Counter', value: `Standard Banner: ${userInv.pity.standard}/90\nLimited Banner: ${userInv.pity.limited}/90` }
      );
    
    await i.update({ 
      embeds: [updatedEmbed], 
      components: []
    });
  });
  
  collector.on('end', async (collected) => {
    if (collected.size === 0) {
      await interaction.editReply({ components: [] }).catch(console.error);
    }
  });
}

async function handleWishPull(interaction, userId, username) {
  await interaction.deferReply();
  
  const pullCount = interaction.options.getInteger('count');
  const userInv = await getUserInventory(userId, username);
  const currentBanner = userInv.currentBanner;
  const { fateType, emoji } = getFateTypeAndEmoji(currentBanner);
  
  // Check if user has enough fates
  if (userInv.fates[fateType] < pullCount) {
    await interaction.editReply({
      content: `❌ You don't have enough ${emoji} ${fateType === 'acquaint' ? 'Acquaint' : 'Intertwined'} Fates to make ${pullCount} wishes! You have ${userInv.fates[fateType]} fates.`,
      ephemeral: true
    });
    return;
  }
  
  // Show wishing animation
  const wishingEmbed = new EmbedBuilder()
    .setTitle('Making Wishes...')
    .setColor('#9370DB')
    .setImage(WISHING_SCREEN_IMAGE);
  
  await interaction.editReply({ embeds: [wishingEmbed] });
  
  // Perform the wishes
  const pityType = currentBanner === 'standard' ? 'standard' : 'limited';
  const startingPity = userInv.pity[pityType];
  
  const { results, updatedPity, commonCoins } = await performWishes(currentBanner, pullCount, startingPity);
  
  // Update user's inventory
  userInv.fates[fateType] -= pullCount;
  userInv.pity[pityType] = updatedPity;
  
  // Add obtained items to inventory
  for (const item of results) {
    userInv.inventory.push({
      name: item.name,
      type: item.type,
      rarity: item.rarity,
      image: item.image,
      sellPrice: item.sellPrice
    });
  }
  
  await userInv.save();
  
  // Award common stardust if any
  if (commonCoins > 0) {
    await economy.addBalance(userId, commonCoins);
  }
  
  // Create result embed
  const resultEmbed = new EmbedBuilder()
    .setTitle(`Wish Results (${pullCount} pulls)`)
    .setColor('#9370DB')
    .setDescription(`Banner: **${currentBanner === 'limited1' ? 'Limited Banner 1' : currentBanner === 'limited2' ? 'Limited Banner 2' : 'Standard Banner'}**\nCurrent Pity: ${updatedPity}/90`)
    .setFooter({ text: `You have ${userInv.fates[fateType]} ${fateType === 'acquaint' ? 'Acquaint' : 'Intertwined'} Fates remaining` });
  
  // Add fields for each result grouped by rarity
  const fiveStarResults = results.filter(item => item.rarity === 5);
  const fourStarResults = results.filter(item => item.rarity === 4);
  const threeStarResults = results.filter(item => item.rarity === 3);
  
  if (fiveStarResults.length > 0) {
    resultEmbed.addFields({
      name: '🌟 5★ Results 🌟',
      value: fiveStarResults.map(item => `**${item.name}** (${item.type})`).join('\n')
    });
  }
  
  if (fourStarResults.length > 0) {
    resultEmbed.addFields({
      name: '✨ 4★ Results ✨',
      value: fourStarResults.map(item => `**${item.name}** (${item.type})`).join('\n')
    });
  }
  
  if (threeStarResults.length > 0) {
    resultEmbed.addFields({
      name: '⭐ 3★ Results ⭐',
      value: threeStarResults.length > 0 ? 
        (threeStarResults.length > 5 ? 
          `${threeStarResults.slice(0, 5).map(item => `**${item.name}**`).join(', ')} and ${threeStarResults.length - 5} more...` : 
          threeStarResults.map(item => `**${item.name}**`).join(', ')) : 
        'None'
    });
  }
  
  if (commonCoins > 0) {
    resultEmbed.addFields({
      name: '💰 Bonus',
      value: `You received ${commonCoins} common stardust from your pulls!`
    });
  }
  
  // Create buttons for 'Wish Again' and 'View Inventory'
  const wishAgainButton = new ButtonBuilder()
    .setCustomId(`wish_again_${pullCount}`)
    .setLabel(`Wish Again (${pullCount})`)
    .setStyle(1); // Primary (blue)
  
  const viewInventoryButton = new ButtonBuilder()
    .setCustomId('view_inventory')
    .setLabel('View Inventory')
    .setStyle(2); // Secondary (grey)
  
  const row = new ActionRowBuilder().addComponents(wishAgainButton, viewInventoryButton);
  
  // Show the highest rarity pull as the thumbnail
  let highestRarityItem = null;
  if (fiveStarResults.length > 0) {
    highestRarityItem = fiveStarResults[0];
    resultEmbed.setImage(FIVE_STAR_WISH_GIF);
  } else if (fourStarResults.length > 0) {
    highestRarityItem = fourStarResults[0];
    resultEmbed.setImage(FOUR_STAR_WISH_GIF);
  } else {
    resultEmbed.setImage(WISHING_SCREEN_IMAGE);
  }
  
  if (highestRarityItem) {
    resultEmbed.setThumbnail(highestRarityItem.image);
  }
  
  const reply = await interaction.editReply({
    embeds: [resultEmbed],
    components: [row]
  });
  
  // Handle button interactions
  const collector = reply.createMessageComponentCollector({ 
    componentType: ComponentType.Button,
    time: 60000
  });
  
  collector.on('collect', async i => {
    if (i.user.id !== userId) {
      await i.reply({ content: 'These buttons are not for you!', ephemeral: true });
      return;
    }
    
    if (i.customId === `wish_again_${pullCount}`) {
      // Re-execute the pull command
      await i.deferUpdate();
      await handleWishPull(interaction, userId, username);
    } else if (i.customId === 'view_inventory') {
      await i.deferUpdate();
      await handleInventory(interaction, userId, username);
    }
  });
  
  collector.on('end', async (collected) => {
    if (collected.size === 0) {
      await interaction.editReply({ components: [] }).catch(console.error);
    }
  });
}

async function handleInventory(interaction, userId, username) {
  const userInv = await getUserInventory(userId, username);
  
  // Create inventory embed
  const inventoryEmbed = new EmbedBuilder()
    .setTitle(`${username}'s Genshin Inventory`)
    .setColor('#9370DB')
    .addFields(
      { 
        name: 'Fates', 
        value: `<:acquaint:${ACQUAINT_FATE_ID}> Acquaint: ${userInv.fates.acquaint}\n<:intertwined:${INTERTWINED_FATE_ID}> Intertwined: ${userInv.fates.intertwined}`,
        inline: true
      },
      { 
        name: 'Pity Counter', 
        value: `Standard Banner: ${userInv.pity.standard}/90\nLimited Banner: ${userInv.pity.limited}/90`,
        inline: true
      }
    );
  
  // Count items by rarity
  const fiveStarCount = userInv.inventory.filter(item => item.rarity === 5).length;
  const fourStarCount = userInv.inventory.filter(item => item.rarity === 4).length;
  const threeStarCount = userInv.inventory.filter(item => item.rarity === 3).length;
  
  inventoryEmbed.addFields({
    name: 'Inventory Summary',
    value: `🌟 **5★ Items:** ${fiveStarCount}\n✨ **4★ Items:** ${fourStarCount}\n⭐ **3★ Items:** ${threeStarCount}\n📚 **Total Items:** ${userInv.inventory.length}`
  });
  
  // Create select menu for viewing different categories
  const select = new StringSelectMenuBuilder()
    .setCustomId('inventory_select')
    .setPlaceholder('Select what to view...')
    .addOptions([
      {
        label: '5★ Characters',
        description: 'View your 5★ characters',
        value: 'char_5'
      },
      {
        label: '4★ Characters',
        description: 'View your 4★ characters',
        value: 'char_4'
      },
      {
        label: '5★ Weapons',
        description: 'View your 5★ weapons',
        value: 'weapon_5'
      },
      {
        label: '4★ Weapons',
        description: 'View your 4★ weapons',
        value: 'weapon_4'
      },
      {
        label: '3★ Weapons',
        description: 'View your 3★ weapons',
        value: 'weapon_3'
      }
    ]);
  
  const row = new ActionRowBuilder().addComponents(select);
  
  const response = await interaction.editReply({
    embeds: [inventoryEmbed],
    components: [row]
  });
  
  const collector = response.createMessageComponentCollector({ 
    componentType: ComponentType.StringSelect,
    time: 60000
  });
  
  collector.on('collect', async i => {
    if (i.user.id !== userId) {
      await i.reply({ content: 'This inventory is not for you!', ephemeral: true });
      return;
    }
    
    const [itemType, rarityStr] = i.values[0].split('_');
    const rarity = parseInt(rarityStr);
    
    // Filter inventory by type and rarity
    const filteredItems = userInv.inventory.filter(
      item => item.type === itemType && item.rarity === rarity
    );
    
    // Count duplicates
    const itemCounts = {};
    filteredItems.forEach(item => {
      itemCounts[item.name] = (itemCounts[item.name] || 0) + 1;
    });
    
    // Create unique items list
    const uniqueItems = Array.from(new Set(filteredItems.map(item => item.name)))
      .map(name => {
        const item = filteredItems.find(i => i.name === name);
        return {
          name,
          count: itemCounts[name],
          image: item.image,
          sellPrice: item.sellPrice
        };
      });
    
    const categoryEmbed = new EmbedBuilder()
      .setTitle(`${username}'s ${rarity}★ ${itemType === 'char' ? 'Characters' : 'Weapons'}`)
      .setColor('#9370DB')
      .setDescription(
        uniqueItems.length > 0 ? 
          uniqueItems.map(item => `**${item.name}** (x${item.count}) - Sell Value: ${(item.sellPrice * item.count).toLocaleString()} coins`).join('\n') : 
          `You don't have any ${rarity}★ ${itemType === 'char' ? 'characters' : 'weapons'} yet!`
      );
    
    // Add a back button
    const backButton = new ButtonBuilder()
      .setCustomId('back_to_inventory')
      .setLabel('Back to Inventory')
      .setStyle(2); // Secondary (grey)
      
    const backRow = new ActionRowBuilder().addComponents(backButton);
    
    await i.update({
      embeds: [categoryEmbed],
      components: [row, backRow]
    });
    
    // Set up a new collector for the back button
    const buttonCollector = response.createMessageComponentCollector({ 
      componentType: ComponentType.Button,
      time: 60000
    });
    
    buttonCollector.on('collect', async btn => {
      if (btn.user.id !== userId) {
        await btn.reply({ content: 'This button is not for you!', ephemeral: true });
        return;
      }
      
      if (btn.customId === 'back_to_inventory') {
        await btn.update({
          embeds: [inventoryEmbed],
          components: [row]
        });
      }
    });
  });
  
  collector.on('end', async (collected) => {
    if (collected.size === 0) {
      await interaction.editReply({ components: [] }).catch(console.error);
    }
  });
}