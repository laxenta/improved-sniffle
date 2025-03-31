const economy = require('../../../utils/economyUtil');
const MAX_BET = 500000;
const ROLLING_EMOJI = "<a:ef:1335267236906143807>";

const symbols = [
  { emoji: '🍆', multiplier: 1, weight: 7 },
  { emoji: '🍒', multiplier: 1.5, weight: 5 },
  { emoji: '❤️', multiplier: 2, weight: 3 },
  { emoji: '💎', multiplier: 2.5, weight: 2 },
  { emoji: '<a:e:1325374132182847528>', multiplier: 4, weight: 1 }
];

// Randomly pick a symbol based on weight.
function pickSymbol() {
  const totalWeight = symbols.reduce((sum, sym) => sum + sym.weight, 0);
  let rand = Math.random() * totalWeight;
  // Give a 50% chance to favor the higher tier symbols (index 2 to 4).
  if (Math.random() < 0.5) {
    return symbols[Math.floor(Math.random() * 3) + 2];
  }
  for (const sym of symbols) {
    if (rand < sym.weight) return sym;
    rand -= sym.weight;
  }
  return symbols[0];
}

// Parse bet amount: removes commas and non-digit characters.
function parseBetArg(betArg) {
  if (!betArg) return NaN;
  const cleaned = betArg.replace(/[^\d]/g, '');
  return parseInt(cleaned, 10);
}

// Animate the roll: sends a "Rolling..." message, waits a bit, then shows final symbols.
async function animateRoll(message, finalSymbols, delay = 1200) {
  const rollMsg = await message.channel.send(
    `🎰 Rolling...\n\n${ROLLING_EMOJI} | ${ROLLING_EMOJI} | ${ROLLING_EMOJI}`
  );
  await new Promise(resolve => setTimeout(resolve, delay));
  const finalDisplay = finalSymbols.map(sym => sym.emoji).join(' | ');
  await rollMsg.edit(`🎰 Rolling...\n\n${finalDisplay}`);
  return rollMsg;
}

module.exports = {
  name: 'slots',
  cooldown: 5,
  aliases: ['stonk', 'stonks'],
  description: 'Play the slots machine! Usage: `!slots <bet amount | max | all>`',
  async execute(message, args) {
    const userId = message.author.id;
    let balance = await economy.getBalance(userId);

    if (!args[0]) {
      return message.channel.send(`Please provide a bet amount. Your balance: ⏣ ${balance}`);
    }

    const betArg = args[0].toLowerCase();
    let bet;

    // Check for max/all keywords.
    if (betArg === "max" || betArg === "all") {
      bet = Math.min(balance, MAX_BET);
    } else {
      // Parse bet removing commas and any non-digit characters.
      bet = parseBetArg(betArg);
    }

    if (isNaN(bet) || bet <= 0 || bet > MAX_BET || bet > balance) {
      return message.channel.send(
        `Invalid bet! Your balance: ⏣ ${balance}, Max bet: ⏣ ${MAX_BET}`
      );
    }

    // Deduct the bet from the user's balance.
    await economy.updateBalance(userId, -bet);

    // Spin the reels.
    const reels = [pickSymbol(), pickSymbol(), pickSymbol()];

    // Animate the roll.
    const rollMsg = await animateRoll(message, reels, 1200);

    // Determine win type and calculate multiplier.
    let winType = null, winMultiplier = 0;
    if (reels[0].emoji === reels[1].emoji && reels[1].emoji === reels[2].emoji) {
      winType = 'full';
      winMultiplier = reels[0].multiplier * 1.2;
    } else if (reels[0].emoji === reels[1].emoji || reels[1].emoji === reels[2].emoji) {
      winType = 'consolation';
      winMultiplier = (reels[0].emoji === reels[1].emoji ? reels[0] : reels[1]).multiplier * 0.7;
    }

    // Apply a 5% bonus multiplier chance.
    if (Math.random() < 0.05 && winMultiplier > 0) {
      winMultiplier *= 1.5;
    }

    let winnings = winMultiplier > 0 ? Math.floor(bet * winMultiplier) : 0;
    if (winnings > 0) {
      await economy.updateBalance(userId, winnings);
    }
    balance = await economy.getBalance(userId);
    const net = winnings - bet;

    // Build the result message.
    let resultText = `🎰 **Stonk Machine Results** 🎰\n\n`;
    resultText += `**${message.author.username}'s Spin**\n\n`;
    resultText += `Bet: ⏣ ${bet}\nWinnings: ⏣ ${winnings}\nNet: ⏣ ${net >= 0 ? `+${net}` : net}\n`;
    resultText += `Rolls: [ ${reels.map(r => r.emoji).join(' | ')} ]\n\n`;

    if (winType === 'full') {
      resultText += `🔥 JACKPOT! Three ${reels[0].emoji}'s! You won ⏣ ${winnings}!`;
    } else if (winType === 'consolation') {
      resultText += `🙂 Nice! Two matching symbols win you ⏣ ${winnings} as a consolation prize.`;
    } else {
      resultText += `😢 No Luck: You bet ⏣ ${bet} and didn’t win this time.`;
    }

    resultText += `\n\nNew Balance: ⏣ ${balance} | Good luck next time! 🍀`;

    // Update the rolling message with the final results.
    await rollMsg.edit(resultText);
  },
};