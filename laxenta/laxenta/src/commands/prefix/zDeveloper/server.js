const {
    getServer,
    startServer,
    stopServer,
    restartServer,
    addToList,
    removeFromList,
    executeCommand, // Added for console commands
    getCredits // Added for credit info
} = require('../../../utils/exaroton');
const { isTrusted } = require('../../../utils/permissions');
const { EmbedBuilder } = require('discord.js');
require('dotenv').config();

const STATUS_CODES = {
    0: "Offline",
    1: "Online",
    2: "Preparing",
    3: "Starting",
    4: "Saving",
    5: "Stopping",
    6: "Restarting",
    7: "Queued",
    8: "Loading",
    10: "Crashed",
};

const subscriptionStates = new Map();

module.exports = {
    name: "mcserver",
    description: "Server management commands",
    async execute(message, args) {
        const userId = message.author.id;
        const guildId = message.guild.id;
        const command = args[0]?.toLowerCase();
        const serverId = process.env.SERVER_ID;

        const isAllowedToStart = guildId === "967716005835075644" || isTrusted(userId);

        if (command === "start" && isAllowedToStart) {
            await handleStartServer(await getServer(serverId), message);
            return;
        }

        if (!isTrusted(userId)) {
            return message.reply({
                embeds: [
                    new EmbedBuilder()
                        .setTitle("Access Denied ❌")
                        .setDescription("You are not authorized to use this command.")
                        .setColor(0xff0000),
                ],
            });
        }

        let server;
        try {
            server = await getServer(serverId);
            
            switch (command) {
                case "stop":
                    await handleStopServer(server, message);
                    break;

                case "restart":
                    await handleRestartServer(server, message);
                    break;

                case "whitelist":
                    await handleWhitelistCommand(server, args, message);
                    break;

                case "console":
                    await handleConsoleCommand(server, args, message);
                    break;
                
                case "credits":
                    await handleCredits(message);
                    break;

                case "subscribe":
                    await handleSubscribe(server, message);
                    break;

                case "unsubscribe":
                    await handleUnsubscribe(server, message);
                    break;

                case "help":
                case undefined:
                    await sendHelpMessage(message);
                    break;

                default:
                    await sendInvalidCommandMessage(message);
                    break;
            }
        } catch (e) {
            console.error(e);
            await message.channel.send({
                embeds: [
                    new EmbedBuilder()
                        .setTitle("Error ❗")
                        .setDescription("An error occurred: " + e.message)
                        .setColor(0xff0000),
                ],
            });
        }
    },
};

// Handle executing console commands
async function handleConsoleCommand(server, args, message) {
    const command = args.slice(1).join(" ");
    if (!command) {
        return await message.channel.send({
            embeds: [
                new EmbedBuilder()
                    .setTitle("Console Command Error")
                    .setDescription("You must provide a command to execute.")
                    .setColor(0xff0000),
            ],
        });
    }

    await message.channel.send({
        embeds: [
            new EmbedBuilder()
                .setTitle("Executing Console Command ⌨️")
                .setDescription(`\`${command}\``)
                .setColor(0x00ff00),
        ],
    });

    const response = await executeCommand(server, command);
    await message.channel.send({
        embeds: [
            new EmbedBuilder()
                .setTitle("Console Output")
                .setDescription(response || "No output returned.")
                .setColor(0x00ffff),
        ],
    });
}

// Handle retrieving credit balance
async function handleCredits(message) {
    const credits = await getCredits();
    await message.channel.send({
        embeds: [
            new EmbedBuilder()
                .setTitle("Exaroton Credits 💰")
                .setDescription(`Remaining credits: **${credits}**`)
                .setColor(0x00ff00),
        ],
    });
}

// Send help message
async function sendHelpMessage(message) {
    await message.channel.send({
        embeds: [
            new EmbedBuilder()
                .setTitle("Minecraft Server Commands <a:e:1310498098107387974>")
                .setDescription("Manage your server with these commands:")
                .addFields(
                    { name: "`start`", value: "Start the server." },
                    { name: "`stop`", value: "Stop the server." },
                    { name: "`restart`", value: "Restart the server." },
                    { name: "`whitelist add <player>`", value: "Add players to the whitelist." },
                    { name: "`whitelist remove <player>`", value: "Remove players from the whitelist." },
                    { name: "`console <command>`", value: "Execute a command in the server console." },
                    { name: "`credits`", value: "Check the remaining Exaroton credits." },
                    { name: "`subscribe status`", value: "Subscribe to server status updates." },
                    { name: "`unsubscribe status`", value: "Unsubscribe from server status updates." }
                )
                .setColor(0x00ffff),
        ],
    });
}

// Send invalid command message
async function sendInvalidCommandMessage(message) {
    await message.channel.send({
        embeds: [
            new EmbedBuilder()
                .setTitle("Invalid Command")
                .setDescription("Use `!mcserver help` for a list of commands.")
                .setColor(0xff0000),
        ],
    });
}