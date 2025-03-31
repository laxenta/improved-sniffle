// const { GuildMember, EmbedBuilder } = require('discord.js');
// const fs = require('fs');
// const path = require('path');
// const { ApexPainter } = require('apexify.js');

// // Load the welcomer config from the root.
// const configFilePath = path.join(process.cwd(), "welcomer.json");
// function loadConfig() {
//   if (fs.existsSync(configFilePath)) {
//     try {
//       return JSON.parse(fs.readFileSync(configFilePath, 'utf8'));
//     } catch (e) {
//       console.error("Error reading welcomer config:", e);
//       return {};
//     }
//   }
//   return {};
// }
// const DEFAULT_BACKGROUND = "https://64.media.tumblr.com/6db816acea825773b9b6f02a33b64e2d/tumblr_pn4cci84cl1xn6dnko1_540.gif"; 

// module.exports = {
//   name: 'guildMemberAdd',
//   /**
//    * @param {GuildMember} member 
//    */
//   async execute(member) {
//     const config = loadConfig();
//     const guildConfig = config[member.guild.id];
//     if (!guildConfig || !guildConfig.enabled) return;

//     const channel = member.guild.channels.cache.get(guildConfig.channelId);
//     if (!channel) return;
//     const bgURL = guildConfig.background || DEFAULT_BACKGROUND;
//     const painter = new ApexPainter();
//     const canvasConfig = {
//       width: 800,
//       height: 400,
//       customBg: bgURL
//     };

//     let baseCanvas;
//     try {
//       baseCanvas = await painter.createCanvas(canvasConfig);
//     } catch (error) {
//       console.error('error in canvas:', error);
//       return;
//     }

//     // Configure the member's avatar overlay.
//     const avatarURL = member.user.displayAvatarURL({ format: "png", size: 512 });
//     const avatarOptions = {
//       source: avatarURL,
//       width: 150,
//       height: 150,
//       x: (800 - 150) / 2, // Center horizontally.
//       y: 30,
//       borderRadius: "circular"
//     };

//     let canvasWithAvatar;
//     try {
//       canvasWithAvatar = await painter.createImage([avatarOptions], baseCanvas.buffer);
//     } catch (error) {
//       console.error('Error overlaying avatar:', error);
//       return;
//     }

//     //fixed here
//     const canvasText = `Welcome, ${member.user.username} to ${member.guild.name}! Enjoy your stay!`;
//     const textOptions = [{
//       text: canvasText,
//       fontSize: 36,
//       color: "#17dbf2",
//       x: 400, // center horizontally (800/2)
//       y: 320, // position near the bottom
//       textAlign: "center",
//       maxWidth: 750
//     }];

//     let finalImage;
//     try {
//       finalImage = await painter.createText(textOptions, canvasWithAvatar);
//     } catch (error) {
//       console.error('Error overlaying text:', error);
//       return;
//     }

//     const randomColor = Math.floor(Math.random() * 0xffffff);
//     const embed = new EmbedBuilder()
//       .setImage("attachment://welcome.png")
//       .setColor(randomColor);
//     const plainText = `<@${member.id}> Welcome to **${member.guild.name}**! Enjoy your stay!`;

//     try {
//       await channel.send({ content: plainText });
//       await channel.send({ embeds: [embed], files: [{ attachment: finalImage, name: 'welcome.png' }] });
//     } catch (error) {
//       console.error('Error sending welcome message:', error);
//     }
//   }
// };