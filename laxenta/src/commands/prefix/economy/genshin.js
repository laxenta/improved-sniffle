/********************************************************************
 * Genshin Impact-Style Wishing Command with Inventory & Auto-Purchase
 * 
 * Features:
 *  - Banner selection (Limited 1, Limited 2, Standard) via a dropdown.
 *  - “Inventory” option in the dropdown to view your current characters,
 *    fate counts, and sell prices (paginated).
 *  - 1 Wish and 10 Wishes with pity logic and auto‐purchase of missing fates.
 *  - Fate purchasing via a button (with economy balance check).
 *  - All interactions (dropdowns and buttons) use deferred responses.
 *  - Data (inventory, pity, banner) is stored in MongoDB.
 ********************************************************************/

const { 
  EmbedBuilder, 
  ButtonBuilder, 
  ActionRowBuilder, 
  StringSelectMenuBuilder,
  ComponentType 
} = require('discord.js');
const mongoose = require('mongoose');
const { registerButton } = require('../../../handlers/buttonHandler');
const economy = require('../../../utils/economyUtil');

// -------------------- Custom Emoji IDs for Fates ---------------------
const ACQUAINT_FATE_ID = "1338048280336273493";      // Emoji ID for Acquaint Fate
const INTERTWINED_FATE_ID = "1338048277605646366";    // Emoji ID for Intertwined Fate

// -------------------- Fate Prices -------------------------------------
const ACQUAINT_FATE_PRICE = 30000;
const INTERTWINED_FATE_PRICE = 50000;

// -------------------- Banner & Wishing Image URLs ---------------------
// Replace these links with your actual URLs (ideally Discord attachments)
const CURRENT_BANNER_IMAGE = "https://media.discordapp.net/attachments/1338050055034245140/1338056402513694720/1713838175667APZCatMSvT.png";
const MAIN_BANNER_IMAGE = "https://media.discordapp.net/attachments/1338050055034245140/1338056402513694720/1713838175667APZCatMSvT.png";
const STANDARD_BANNER_IMAGE = "https://media.discordapp.net/attachments/1338050055034245140/1338056453671489650/Genshin-Impact-Wanderlust-Invocation-Banner.png";

// -------------------- Additional Limited Banner Images ----------------
const CHAR_LIMITED_ONE_IMAGE = "https://media.discordapp.net/attachments/1338050055034245140/1338056402513694720/1713838175667APZCatMSvT.png";
const CHAR_LIMITED_TWO_IMAGE = "https://media.discordapp.net/attachments/1338050055034245140/1338056510646779984/Genshin-Impact-5.png";

// -------------------- Wishing Screen Images --------------------------
const WISHING_SCREEN_IMAGE = "https://media.tenor.com/-0gPdn6GMVAAAAAM/genshin3star-wish.gif";
const WISHING_SCREEN_WIN_IMAGE = "https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcSI1CvZs9yjx8_cwe_WwcX9MrMaAihxcsiVv0PhZHQhZFE7zYqB6its8a4uFX-VN0ITDSI&usqp=CAU";
const WISHING_SCREEN_FOUR_STAR_IMAGE = "https://media.tenor.com/-0gPdn6GMVAAAAAM/genshin3star-wish.gif";

// -------------------- Common Roll Images (3★) --------------------------
const COMMON_ROLLS = [
  "https://media.discordapp.net/attachments/1338050055034245140/1338054653375676427/show.png",
  "https://media.discordapp.net/attachments/1338050055034245140/1338054644089356318/show.png",
  "https://media.discordapp.net/attachments/1338050055034245140/1338052453009981470/show.png?ex=67a9adf4&is=67a85c74&hm=1c1e05ff2c13dc26e743ec7f680e0f283b16eb10baa2bd0ed767f8a29f48271c&=&format=webp&quality=lossless&width=79&height=79",
"https://media.discordapp.net/attachments/1338050055034245140/1338052420005269545/show.png?ex=67a9adec&is=67a85c6c&hm=40e6f859772d428b8492c9ee7a203faba950d43716c83db3a86aca838a7531a1&=&format=webp&quality=lossless&width=79&height=79",
   "https://media.discordapp.net/attachments/1338050055034245140/1338054869076017174/show.png?ex=67a9b034&is=67a85eb4&hm=654e485f85b317e51ead80d34b3fa8e318745894a38ff9b232cbfb4955262550&=&format=webp&quality=lossless&width=79&height=79",
"https://media.discordapp.net/attachments/1338050055034245140/1338054843863924767/show.png?ex=67a9b02e&is=67a85eae&hm=d82c67e8a01cc32ac1ca43e0ac54feb1e9ff23f9f42449548e27444a9006719d&=&format=webp&quality=lossless&width=79&height=79",
"https://media.discordapp.net/attachments/1338050055034245140/1338054815561023528/show.png?ex=67a9b027&is=67a85ea7&hm=65099a12709beb6ba28e901ea817a52d0c28fba66ae9976101d801e8324a623a&=&format=webp&quality=lossless&width=79&height=79",
"https://media.discordapp.net/attachments/1338050055034245140/1338054788780265522/show.png?ex=67a9b021&is=67a85ea1&hm=40f209a4e16d322df4aeac3c6861a98132110eb97e8f86715258f2de6afa208e&=&format=webp&quality=lossless&width=79&height=79",
"https://media.discordapp.net/attachments/1338050055034245140/1338054773664120932/show.png?ex=67a9b01d&is=67a85e9d&hm=080445ae5aebfa8c454748de5140049613e43fce109cd3cfa2555cd84f564402&=&format=webp&quality=lossless&width=79&height=79",
"https://media.discordapp.net/attachments/1338050055034245140/1338054757981360201/show.png?ex=67a9b01a&is=67a85e9a&hm=1df791746b1512442faf870ec73a127d7d086b20b463b1232592df1502ebe0cb&=&format=webp&quality=lossless&width=79&height=79",
"https://media.discordapp.net/attachments/1338050055034245140/1338054735588229141/show.png?ex=67a9b014&is=67a85e94&hm=0a7456a3d8fa5cef25be35a845124bde68629af00fa882e81b3e720bf7413653&=&format=webp&quality=lossless&width=79&height=79",
"https://media.discordapp.net/attachments/1338050055034245140/1338054709919088690/show.png?ex=67a9b00e&is=67a85e8e&hm=711d85b1ed96915a00a371757466bb86027a53bfcd0f1e22aa92642808848f25&=&format=webp&quality=lossless&width=79&height=79",
"https://media.discordapp.net/attachments/1338050055034245140/1338054693389340783/show.png?ex=67a9b00a&is=67a85e8a&hm=016ebe06b409fc19e2377d5a9c5a0a56207d10a1382ce9ee39a2790924e9a8ee&=&format=webp&quality=lossless&width=79&height=79",
"https://media.discordapp.net/attachments/1338050055034245140/1338054672417558528/show.png?ex=67a9b005&is=67a85e85&hm=a71d2543c20f2047b416af5969826ec07d35ce2d4d0c76e9782a4bbdd6dc6243&=&format=webp&quality=lossless&width=72&height=72",


];

// -------------------- MongoDB Schema & Model ---------------------------
const GenshinInventorySchema = new mongoose.Schema({
  userId: { type: String, required: true },
  username: { type: String, required: true },
  fates: {
    acquaint: { type: Number, default: 0 },
    intertwined: { type: Number, default: 0 }
  },
  currentBanner: { type: String, default: 'limited1' },
  pity: { type: Number, default: 0 },
  characters: [{
    name: String,
    rarity: Number,    // e.g., 5, 4, or 3 (common items auto-sold)
    image: String,
    sellPrice: Number
  }]
});
const GenshinInventory = mongoose.models.GenshinInventory || mongoose.model('GenshinInventory', GenshinInventorySchema);

// -------------------- Helper Functions -------------------------------

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
    case 'limited1': return CHAR_LIMITED_ONE_IMAGE;
    case 'limited2': return CHAR_LIMITED_TWO_IMAGE;
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

function rollWish() {
  const roll = Math.random() * 100;
  if (roll < 1) {
    return { rarity: 5, type: 'limited', image: WISHING_SCREEN_WIN_IMAGE, name: "5★ Character" };
  } else if (roll < 11) {
    return { rarity: 4, type: 'character', image: WISHING_SCREEN_FOUR_STAR_IMAGE, name: "4★ Character" };
  } else {
    const commonImage = COMMON_ROLLS[Math.floor(Math.random() * COMMON_ROLLS.length)];
    return { rarity: 3, type: 'common', image: commonImage, name: "Common Item" };
  }
}

async function performWishes(bannerType, count, startingPity) {
  let pity = startingPity;
  const results = [];
  let totalCommonCoins = 0;
  for (let i = 0; i < count; i++) {
    let result;
    if (pity >= 89) {
      result = { rarity: 5, type: 'limited', image: WISHING_SCREEN_WIN_IMAGE, name: "5★ Character (Pity Guaranteed)" };
      pity = 0;
    } else {
      result = rollWish();
      if (result.rarity === 5) {
        pity = 0;
      } else {
        pity++;
      }
    }
    results.push(result);
    if (result.rarity === 3) {
      totalCommonCoins += Math.floor(Math.random() * (3000 - 1000 + 1)) + 1000;
    }
  }
  return { results, totalCommonCoins, newPity: pity };
}

function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// -------------------- Inventory Embed & Pagination Helpers --------------
function getInventoryEmbed(inventory, page) {
  const charactersPerPage = 5;
  const startIndex = page * charactersPerPage;
  const endIndex = startIndex + charactersPerPage;
  const totalPages = Math.ceil(inventory.characters.length / charactersPerPage) || 1;
  const pageCharacters = inventory.characters.slice(startIndex, endIndex);
  
  const embed = new EmbedBuilder()
    .setTitle("Genshin Inventory")
    .setDescription(`**Fates:**\nAcquaint: ${inventory.fates.acquaint}\nIntertwined: ${inventory.fates.intertwined}\n**Pity:** ${inventory.pity}\n\n**Characters (Page ${page+1} of ${totalPages}):**`)
    .setColor(0x00AE86);
  
  if (pageCharacters.length === 0) {
    embed.addFields({ name: "No Characters", value: "You haven't obtained any characters yet!" });
  } else {
    for (const char of pageCharacters) {
      embed.addFields({ name: `${char.name} (${char.rarity}★)`, value: `Sell Price: ⏣ ${char.sellPrice.toLocaleString()}` });
    }
  }
  
  return embed;
}

function createInventoryComponents(userId, inventory, page) {
  const charactersPerPage = 5;
  const totalPages = Math.ceil(inventory.characters.length / charactersPerPage) || 1;
  const prevBtn = new ButtonBuilder()
    .setCustomId(`genshin_inv_prev_${userId}`)
    .setLabel("Previous")
    .setStyle("Primary")
    .setDisabled(page <= 0);
  const nextBtn = new ButtonBuilder()
    .setCustomId(`genshin_inv_next_${userId}`)
    .setLabel("Next")
    .setStyle("Primary")
    .setDisabled(page >= totalPages - 1);
  const paginationRow = new ActionRowBuilder().addComponents(prevBtn, nextBtn);
  
  const backBtn = new ButtonBuilder()
    .setCustomId(`genshin_inv_back_${userId}`)
    .setLabel("Back")
    .setStyle("Secondary");
  const backRow = new ActionRowBuilder().addComponents(backBtn);
  
  return [paginationRow, backRow];
}

// -------------------- Command Module Export ---------------------------

module.exports = {
  name: 'wish',
  aliases: ['wi'],  
  description: 'gamble Impact-style wishing command with banners, pity, fate purchasing, and stff view.',
  async execute(message, args) {
    const userId = message.author.id;
    const username = message.author.username;
    
    // Load (or create) the user's inventory.
    const inventory = await getUserInventory(userId, username);
    const bannerType = inventory.currentBanner;
    const fateData = getFateTypeAndEmoji(bannerType);
    
    // Build the main embed.
    const embed = new EmbedBuilder()
      .setTitle("Genshin Wishing")
      .setImage(getBannerImage(bannerType))
      .setDescription("Select an option from the dropdown below:\n• Change Banner (Limited 1, Limited 2, Standard)\n• View Inventory\nThen choose **1 Wish** or **10 Wishes**!");
      
    // Build the select menu.
    const selectMenu = new StringSelectMenuBuilder()
      .setCustomId(`genshin_select`)
      .setPlaceholder("Choose an option")
      .addOptions([
        { label: "The Hearth's ashen shadow", description: "Featured limited character banner", value: "limited1" },
        { label: "Forge Fire's Blessing", description: "Another limited banner", value: "limited2" },
        { label: "Standard Banner", description: "Standard wishes using Acquaint Fates", value: "standard" },
        { label: "Inventory", description: "View your Genshin inventory", value: "inventory" }
      ]);
    const selectRow = new ActionRowBuilder().addComponents(selectMenu);
    
    // Helper to create main buttons.
    function createMainButtons(userId, emoji) {
      return new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId(`genshin_onewish_${userId}`)
          .setLabel("1 Wish")
          .setEmoji(emoji)
          .setStyle('Primary'),
        new ButtonBuilder()
          .setCustomId(`genshin_tenwish_${userId}`)
          .setLabel("10 Wishes")
          .setEmoji(emoji)
          .setStyle('Primary'),
        new ButtonBuilder()
          .setCustomId(`genshin_buyfates_${userId}`)
          .setLabel("Buy Fates")
          .setEmoji(emoji)
          .setStyle('Secondary')
      );
    }
    const buttonRow = createMainButtons(userId, fateData.emoji);
    
    // Send the initial message.
    const response = await message.channel.send({
      embeds: [embed],
      components: [selectRow, buttonRow]
    });
    
    // Create a collector for the select menu.
    const collector = response.createMessageComponentCollector({
      componentType: ComponentType.StringSelect,
      time: 300000 // 5 minutes
    });
    
    collector.on('collect', async (interaction) => {
      if (interaction.user.id !== userId) {
        await interaction.reply({ content: 'This menu is not for you!', ephemeral: true });
        return;
      }
      
      const selected = interaction.values[0];
      
      if (selected === "inventory") {
        // Inventory view with pagination.
        let currentPage = 0;
        const invEmbed = getInventoryEmbed(inventory, currentPage);
        const invComponents = createInventoryComponents(userId, inventory, currentPage);
        await interaction.update({ embeds: [invEmbed], components: invComponents });
        
        // Register pagination button handlers.
        registerButton(`genshin_inv_prev_${userId}`, [userId], async (i) => {
          await i.deferUpdate();
          currentPage = Math.max(0, currentPage - 1);
          const updatedEmbed = getInventoryEmbed(inventory, currentPage);
          const updatedComponents = createInventoryComponents(userId, inventory, currentPage);
          await i.editReply({ embeds: [updatedEmbed], components: updatedComponents });
        });
        
        registerButton(`genshin_inv_next_${userId}`, [userId], async (i) => {
          await i.deferUpdate();
          const totalPages = Math.ceil(inventory.characters.length / 5) || 1;
          currentPage = Math.min(totalPages - 1, currentPage + 1);
          const updatedEmbed = getInventoryEmbed(inventory, currentPage);
          const updatedComponents = createInventoryComponents(userId, inventory, currentPage);
          await i.editReply({ embeds: [updatedEmbed], components: updatedComponents });
        });
        
        registerButton(`genshin_inv_back_${userId}`, [userId], async (i) => {
          await i.deferUpdate();
          const mainEmbed = new EmbedBuilder()
            .setTitle("Char Wishing")
            .setImage(getBannerImage(inventory.currentBanner))
            .setDescription(embed.data.description);
          const mainFateData = getFateTypeAndEmoji(inventory.currentBanner);
          const mainButtonRow = createMainButtons(userId, mainFateData.emoji);
          await i.editReply({
            embeds: [mainEmbed],
            components: [selectRow, mainButtonRow]
          });
        });
      } else {
        // Banner selection: update banner and reset pity.
        inventory.currentBanner = selected;
        inventory.pity = 0;
        await inventory.save();
        
        const newEmbed = new EmbedBuilder()
          .setTitle("Char Wishing")
          .setImage(getBannerImage(selected))
          .setDescription(embed.data.description);
        const newFateData = getFateTypeAndEmoji(selected);
        const newButtonRow = createMainButtons(userId, newFateData.emoji);
        
        await interaction.update({
          embeds: [newEmbed],
          components: [selectRow, newButtonRow]
        });
      }
    });
    // --- 1 Wish Button Handler (with auto-buy) ---
    registerButton(`genshin_onewish_${userId}`, [userId], async (interaction) => {
      let currentBanner = inventory.currentBanner;
      let currentPity = inventory.pity || 0;
      const fateData = getFateTypeAndEmoji(currentBanner);
      const fateType = (currentBanner === 'standard') ? 'acquaint' : 'intertwined';
      
      // Auto-purchase missing fate if necessary.
      if (inventory.fates[fateType] < 1) {
        const missing = 1 - inventory.fates[fateType];
        const cost = missing * 30000;
        const balance = await economy.getBalance(userId);
        if (balance >= cost) {
          await economy.updateBalance(userId, -cost);
          inventory.fates[fateType] += missing;
          await inventory.save();
        } else {
          return interaction.reply({ 
            content: `You don't have enough coins to auto-buy a ${fateType === 'acquaint' ? 'Acquaint Fate' : 'Intertwined Fate'} (Needed: ⏣ ${cost.toLocaleString()})!`,
            ephemeral: true
          });
        }
      }
      
      // Deduct 1 fate.
      inventory.fates[fateType] -= 1;
      await inventory.save();
      
      // Show "Wishing..." animation.
      const wishingEmbed = new EmbedBuilder()
        .setTitle("Wishing...")
        .setImage(WISHING_SCREEN_IMAGE);
      await interaction.update({ embeds: [wishingEmbed] });
      await delay(1500);
      
      const { results, totalCommonCoins, newPity } = await performWishes(currentBanner, 1, currentPity);
      inventory.pity = newPity;
      await inventory.save();
      
      let resultText = "";
      for (const res of results) {
        if (res.rarity === 3) {
          await economy.updateBalance(userId, totalCommonCoins);
          resultText += `You got a **3★ ${res.name}** and it was auto-sold for ⏣ **${totalCommonCoins.toLocaleString()}**!\n`;
        } else {
          const sellPrice = res.rarity === 5 
            ? (Math.floor(Math.random() * (20000000 - 10000000 + 1)) + 10000000)
            : (Math.floor(Math.random() * (10000000 - 5000000 + 1)) + 5000000);
          inventory.characters.push({
            name: res.name,
            rarity: res.rarity,
            image: res.image,
            sellPrice
          });
          await inventory.save();
          resultText += `You got a **${res.rarity}★ ${res.name}**! (Sell Price: ⏣ **${sellPrice.toLocaleString()}**)\n`;
        }
      }
      
      const resultEmbed = new EmbedBuilder()
        .setTitle("Wish Results")
        .setDescription(resultText)
        .setImage(results[0].image);
      await interaction.editReply({ embeds: [resultEmbed] });
    });
    
    // --- 10 Wishes Button Handler (with auto-buy) ---
    registerButton(`genshin_tenwish_${userId}`, [userId], async (interaction) => {
      let currentBanner = inventory.currentBanner;
      let currentPity = inventory.pity || 0;
      const fateData = getFateTypeAndEmoji(currentBanner);
      const fateType = (currentBanner === 'standard') ? 'acquaint' : 'intertwined';
      
      // Auto-purchase missing fates if needed.
      if (inventory.fates[fateType] < 10) {
        const missing = 10 - inventory.fates[fateType];
        const cost = missing * 30000;
        const balance = await economy.getBalance(userId);
        if (balance >= cost) {
          await economy.updateBalance(userId, -cost);
          inventory.fates[fateType] += missing;
          await inventory.save();
        } else {
          return interaction.reply({ 
            content: `You don't have enough coins to auto-buy the missing ${missing} ${fateType === 'acquaint' ? 'Acquaint Fates' : 'Intertwined Fates'} (Needed: ⏣ ${cost.toLocaleString()})!`,
            ephemeral: true
          });
        }
      }
      
      // Deduct 10 fates.
      inventory.fates[fateType] -= 10;
      await inventory.save();
      
      const wishingEmbed = new EmbedBuilder()
        .setTitle("Wishing...")
        .setImage(WISHING_SCREEN_IMAGE);
      await interaction.update({ embeds: [wishingEmbed] });
      await delay(1500);
      
      const { results, totalCommonCoins, newPity } = await performWishes(currentBanner, 10, currentPity);
      inventory.pity = newPity;
      await inventory.save();
      
      let resultText = "";
      for (const res of results) {
        if (res.rarity === 3) {
          await economy.updateBalance(userId, totalCommonCoins);
          resultText += `**3★ ${res.name}** auto-sold for ⏣ **${totalCommonCoins.toLocaleString()}**\n`;
        } else {
          const sellPrice = res.rarity === 5 
            ? (Math.floor(Math.random() * (20000000 - 10000000 + 1)) + 10000000)
            : (Math.floor(Math.random() * (10000000 - 5000000 + 1)) + 5000000);
          inventory.characters.push({
            name: res.name,
            rarity: res.rarity,
            image: res.image,
            sellPrice
          });
          await inventory.save();
          resultText += `**${res.rarity}★ ${res.name}** (Sell Price: ⏣ **${sellPrice.toLocaleString()}**)\n`;
        }
      }
      
      const resultEmbed = new EmbedBuilder()
        .setTitle("10-Wish Results")
        .setDescription(resultText)
        .setImage(results[0].image);
      await interaction.editReply({ embeds: [resultEmbed] });
    });
    
    // --- Buy Fates Button Handler ---
    registerButton(`genshin_buyfates_${userId}`, [userId], async (interaction) => {
      const currentBanner = inventory.currentBanner;
      const fateData = getFateTypeAndEmoji(currentBanner);
      const fateType = (currentBanner === 'standard') ? 'acquaint' : 'intertwined';
      const balance = await economy.getBalance(userId);
      if (balance < 30000) {
        return interaction.reply({ content: "You don't have enough coins to buy a Fate!", ephemeral: true });
      }
      await economy.updateBalance(userId, -30000);
      inventory.fates[fateType] += 1;
      await inventory.save();
      return interaction.reply({ 
        content: `30k has been deducted and 1 ${fateType === 'acquaint' ? 'Acquaint Fate' : 'Intertwined Fate'} added to your inventory.`,
        ephemeral: true
      });
    });
    
  } // End of execute function.
}; // End of module export

/********************************************************************
 * End of Genshin Impact-Style Wishing Command Module
 ********************************************************************/