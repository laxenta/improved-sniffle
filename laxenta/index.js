// index.js
require('dotenv').config();
const { Client, GatewayIntentBits, ActivityType, Partials } = require('discord.js');
const { loadAllCommands } = require('./src/handlers/commandHandler');
const path = require('path');
const fs = require('fs');
const { logger } = require('./src/utils/logger');
const WebServer = require('./src/servers/webServer');

// Validate the environment variable
if (!process.env.DISCORD_TOKEN) {
    logger.error("DISCORD_TOKEN is not defined. Exiting...");
    process.exit(1);
}

// Initialize the client with needed GatewayIntentBits and partials
const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildVoiceStates,
        GatewayIntentBits.DirectMessages,
        GatewayIntentBits.GuildMembers,
    ],
    partials: [Partials.Channel],
});

// Initialize Lavalink (Erela.js) after client is created
require('./src/handlers/lavalink')(client);

// Set up collections for prefix and slash commands
client.prefixCommands = new Map();
client.slashCommands = new Map();

// Dynamically load events from the src/events folder
fs.readdirSync(path.join(__dirname, 'src/events'))
    .filter(file => file.endsWith('.js'))
    .forEach(file => {
        try {
            const event = require(path.join(__dirname, 'src/events', file));
            if (!event.name || typeof event.execute !== 'function') {
                logger.warn(`Skipping invalid event file: ${file}`);
                return;
            }
            const handler = (...args) => event.execute(...args, client);
            event.once ? client.once(event.name, handler) : client.on(event.name, handler);
            logger.info(`Loaded event: ${event.name}`);
        } catch (err) {
            logger.error(`Failed to load event ${file}: ${err.message}`);
        }
    });

// When the client is ready, set status and load commands
client.once('ready', async () => {
    logger.info(`${client.user.tag} is online.`);
    
    // Set a custom status
    client.user.setPresence({
        activities: [{ 
            type: ActivityType.Custom,
            name: 'uwu', 
            state: 'getting a reboot...'
        }],
        status: 'dnd'
    });

    try {
        await loadAllCommands(client);
        logger.info(`Prefix commands loaded: ${client.prefixCommands.size}`);
        logger.info(`Slash commands loaded: ${client.slashCommands.size}`);

        // Initialize web server after client is ready
        client.webServer = new WebServer(client);
        logger.info('Web server initialized');
    } catch (error) {
        logger.error('Error during initialization:', error.message);
    }
});

// Global error and warning handlers
client.on('error', err => logger.error(`[Client Error] ${err.message}`));
client.on('warn', warning => logger.warn(`[Client Warn] ${warning}`));

process.on('unhandledRejection', (reason, promise) => {
    console.error('Unhandled Rejection at:', promise, 'reason:', reason);
});

client.pendingAuth = new Map();

// Login the bot
client.login(process.env.DISCORD_TOKEN).catch(err => {
    logger.error('Failed to log in:', err.message);
    process.exit(1);
});