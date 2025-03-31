// const { GuildMember, EmbedBuilder } = require('discord.js');
// const fs = require('fs');
// const path = require('path');
// const { ApexPainter } = require('apexify.js');

// // Load the leaver config from the root.
// const configFilePath = path.join(process.cwd(), "leaver.json");
// function loadConfig() {
//   if (fs.existsSync(configFilePath)) {
//     try {
//       return JSON.parse(fs.readFileSync(configFilePath, 'utf8'));
//     } catch (e) {
//       console.error("Error reading leaver config:", e);
//       return {};
//     }
//   }
//   return {};
// }

// // Set your default background image URL for leaver (if no custom background is set).
// const DEFAULT_BACKGROUND = "https://i.imgur.com/yourDefaultBackground.png"; // Replace with your own URL.

// module.exports = {
//   name: 'guildMemberRemove',
//   /**
//    * @param {GuildMember} member 
//    */
//   async execute(member) {
//     const config = loadConfig();
//     const guildConfig = config[member.guild.id];
//     if (!guildConfig || !guildConfig.enabled) return;

//     const channel = member.guild.channels.cache.get(guildConfig.channelId);
//     if (!channel) return;

//     // Use the configured background image or default.
//     const bgURL = guildConfig.background || DEFAULT_BACKGROUND;

//     // Create an instance of ApexPainter.
//     const painter = new ApexPainter();

//     // Create the base canvas background.
//     const canvasConfig = {
//       width: 800,
//       height: 400,
//       customBg: bgURL
//     };

//     let baseCanvas;
//     try {
//       baseCanvas = await painter.createCanvas(canvasConfig);
//     } catch (error) {
//       console.error('Error creating canvas background:', error);
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

//     // Prepare centered goodbye text.
//     const goodbyeText = `### Goodbye, ${member.user.username}! We'll miss you here in ${member.guild.name}.`;
//     // Configure text options.
//     const textOptions = [{
//       text: goodbyeText,
//       fontSize: 36,
//       color: "#f23636",
//       x: 400, // Center horizontally (800/2)
//       y: 320, // Position near the bottom
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

//     // Generate a random embed color.
//     const randomColor = Math.floor(Math.random() * 0xffffff);

//     // Build an embed containing only the farewell image.
//     const embed = new EmbedBuilder()
//       .setImage("attachment://farewell.png")
//       .setColor(randomColor);
//     const plainText = `Goodbye, ${member.user.username}! We'll miss you here in ${member.guild.name}!`;

//     try {
//       // Send the goodbye message as plain text (this will not ping the user since they've left).
//       await channel.send({ content: plainText });
//       // Then send the embed containing the image.
//       await channel.send({ embeds: [embed], files: [{ attachment: finalImage, name: 'farewell.png' }] });
//     } catch (error) {
//       console.error('Error sending farewell message:', error);
//     }
//   }
// };