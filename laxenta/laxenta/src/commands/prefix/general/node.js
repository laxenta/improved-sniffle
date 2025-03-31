const { EmbedBuilder } = require('discord.js');
const { execSync } = require('child_process');

module.exports = {
   name: 'node',
   description: 'Get Node.js, Discord.js versions, and a list of installed packages',
   async execute(message) {
      const ownerId = '953527567808356404'; // Replace with your Discord user ID
      if (message.author.id !== ownerId) {
         return message.channel.send('You do not have permission to use this command.');
      }

      try {
         // Fetch Node.js and Discord.js versions
         const nodeVersion = process.version;
         const discordJsVersion = require('discord.js').version;

         // Fetch list of installed packages and versions, ignoring optional dependencies and sub-packages
         const installedPackages = execSync('npm ls --depth=0 --json').toString();
         const packageJson = JSON.parse(installedPackages);
         const packageList = Object.entries(packageJson.dependencies)
            .map(([pkg, info]) => `${pkg}: ${info.version}`)
            .join('\n');

         const embed = new EmbedBuilder()
            .setTitle('Bot Info and Installed Packages')
            .setColor('#0099ff')
            .addFields(
               { name: 'Node.js Version', value: nodeVersion, inline: true },
               { name: 'Discord.js Version', value: discordJsVersion, inline: true }
            )
            .setDescription(`\`\`\`${packageList}\`\`\``);

         message.channel.send({ embeds: [embed] });
      } catch (error) {
         console.error('Error fetching versions or packages:', error);
         message.channel.send('An error occurred while fetching version information.');
      }
   },
};
