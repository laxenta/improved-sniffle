const { EmbedBuilder } = require('discord.js');

module.exports = {
    name: 'server',
    description: 'Displays server information.',
    execute(message) {
        try {
            const serverName = message.guild.name;
            const memberCount = message.guild.memberCount;
            const serverID = message.guild.id;
            const serverBoostLevel = message.guild.premiumTier;
            const serverLogoURL = message.guild.iconURL({ format: "png", dynamic: true, size: 1024 });

            const embed = new EmbedBuilder()
                .setTitle("Server Info <a:server:1310498065328898108>")
                .setColor("#7289DA")
                .addFields(
                    { name: "<a:srv:1310498083980709951> **Server:**", value: serverName, inline: true },
                    { name: "<a:id:1310498098107387974> **Guild ID:**", value: serverID, inline: true },
                    { name: "<a:boost:1310498077538258966> **Members:**", value: memberCount.toString(), inline: true },
                    { name: "<a:boost:1326464202822520853> **Boost Level:**", value: serverBoostLevel.toString(), inline: false }
                )
                .setImage(serverLogoURL)
                .setTimestamp()
                .setFooter({ text: message.guild.name, iconURL: serverLogoURL });

            message.channel.send({ embeds: [embed] });
        } catch (error) {
            console.error('An error occurred while executing the server command:', error);
            message.channel.send('Sorry, I could not fetch the server information.');
        }
    },
};