const economy = require('../../../utils/economyUtil');
const MAX_BET = 500000;

// Remove non-digit characters and parse the bet amount.
function parseBetArg(betArg) {
  if (!betArg) return NaN;
  const cleaned = betArg.replace(/[^\d]/g, '');
  return parseInt(cleaned, 10);
}

module.exports = {
  name: 'cf',
  aliases: ['coinflip'],
  description: 'Flip a coin and double your money if you win (Max bet: 500k)',
  async execute(message, args) {
    const userId = message.author.id;
    let balance = await economy.getBalance(userId);

    if (!args[0]) {
      return message.channel.send(`Provide a bet amount. Balance: ⏣ ${balance}`);
    }

    const betArg = args[0].toLowerCase();
    let bet;

    if (betArg === "max" || betArg === "all") {
      bet = Math.min(balance, MAX_BET);
    } else {
      bet = parseBetArg(betArg);
    }

    if (isNaN(bet) || bet <= 0 || bet > MAX_BET || bet > balance) {
      return message.channel.send(`Invalid bet. Balance: ⏣ ${balance}, Max bet: ⏣ ${MAX_BET}`);
    }

    await economy.updateBalance(userId, -bet);

    const isWin = Math.random() < 0.5;
    let winnings = isWin ? bet * 2 : 0;
    if (isWin) {
      await economy.updateBalance(userId, winnings);
    }
    balance = await economy.getBalance(userId);
    const net = winnings - bet;

    let resultMessage = `🪙 Coin Flip Results 🪙\n\n`;
    resultMessage += `Bet: ⏣ ${bet}\n`;
    resultMessage += `Result: ${isWin ? 'Heads! You win!' : 'Tails! You lose!'}\n`;
    resultMessage += `Winnings: ⏣ ${winnings}\n`;
    resultMessage += `Net: ⏣ ${net >= 0 ? `+${net}` : net}\n`;
    resultMessage += `New Balance: ⏣ ${balance}`;

    message.channel.send(resultMessage);
  }
};