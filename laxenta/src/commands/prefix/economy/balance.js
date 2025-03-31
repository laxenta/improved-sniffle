const economy = require('../../../utils/economyUtil');

// Helper to format a number with commas
function formatCurrency(num) {
  return num.toLocaleString('en-US');
}

module.exports = {
  name: 'balance',
  aliases: ['bal', 'cash', 'money'],
  description: 'Displays your current balance.',
  async execute(message) {
    const userId = message.author.id;
    const balance = await economy.getBalance(userId);

    message.channel.send(`Your balance is ⏣\`${formatCurrency(balance)}\`.`);
  },
};
