// require('dotenv').config();
// const { REST, Routes } = require('discord.js');
// const path = require('path');
// const fs = require('fs');
// const { logger } = require('../utils/logger');

// async function loadAllCommands(client) {
//     const commands = [];
//     const commandsPath = path.join(__dirname, '..', 'commands', 'slash');

//     // Recursively get all command files
//     function getCommandFiles(dir) {
//         const files = [];
//         const items = fs.readdirSync(dir, { withFileTypes: true });

//         for (const item of items) {
//             if (item.isDirectory()) {
//                 files.push(...getCommandFiles(path.join(dir, item.name)));
//             } else if (item.isFile() && item.name.endsWith('.js')) {
//                 files.push(path.join(dir, item.name));
//             }
//         }

//         return files;
//     }

//     const commandFiles = getCommandFiles(commandsPath);

//     // Load each command
//     for (const file of commandFiles) {
//         try {
//             const command = require(file);
//             if ('data' in command && 'execute' in command) {
//                 client.slashCommands.set(command.data.name, command);
//                 commands.push(command.data.toJSON());
//                 logger.info(`Loaded command: ${command.data.name}`);
//             }
//         } catch (error) {
//             logger.error(`Error loading command from ${file}:`, error);
//         }
//     }

//     // Register commands globally
//     const rest = new REST().setToken(process.env.DISCORD_TOKEN);

//     try {
//         logger.info('Started refreshing application (/) commands...');

//         await rest.put(
//             Routes.applicationCommands(process.env.CLIENT_ID),
//             { body: commands }
//         );

//         logger.info('Successfully registered application commands globally');
//     } catch (error) {
//         logger.error('Error registering commands:', error);
//     }
// }

// module.exports = { loadAllCommands };




//crypto hash one->


require('dotenv').config();
const crypto = require('crypto');
const { REST } = require('@discordjs/rest');
const { Routes } = require('discord-api-types/v9');
const fs = require('fs');
const path = require('path');
const { green, blue, red, yellow } = require('colorette');

const COMMAND_CACHE_FILE = './.commandCache.json';
const environment = process.env.NODE_ENV || 'production';

async function loadCommandsRecursive(directory, commandCollection) {
    if (!fs.existsSync(directory)) {
        console.error(red(`Directory not found: ${directory}`));
        return;
    }

    const files = fs.readdirSync(directory, { withFileTypes: true });
    for (const file of files) {
        const fullPath = path.resolve(directory, file.name);

        if (file.isDirectory()) {
            await loadCommandsRecursive(fullPath, commandCollection);
        } else if (file.name.endsWith('.js')) {
            try {
                delete require.cache[require.resolve(fullPath)]; // Clear cache
                const command = require(fullPath);
                const commandName = command.data?.name || command.name;

                if (!commandName) {
                    console.error(red(`Command name missing in: ${fullPath}. Skipping...`));
                    continue;
                }

                commandCollection.set(commandName.toLowerCase(), command);
                if (!command.data && Array.isArray(command.aliases)) {
                    for (const alias of command.aliases) {
                        commandCollection.set(alias.toLowerCase(), command);
                    }
                }
                console.info(command.data ? blue(`Loaded slash command: ${commandName}`) : green(`Loaded prefix command: ${commandName}`));
            } catch (error) {
                console.error(red(`Failed to load command: ${fullPath}. Skipping...`));
                console.error(red(`Error: ${error.message}`));
            }
        }
    }
}

async function loadAllCommands(client) {
    try {
        console.info(yellow('Loading all commands...'));
        if (!client.slashCommands || !client.prefixCommands) {
            throw new Error('Client is missing slashCommands or prefixCommands properties');
        }

        client.slashCommands.clear();
        client.prefixCommands.clear();

        const prefixBase = path.resolve(__dirname, '../commands/prefix');
        const slashBase = path.resolve(__dirname, '../commands/slash');

        await loadCommandsRecursive(prefixBase, client.prefixCommands);
        await loadCommandsRecursive(slashBase, client.slashCommands);

        console.info(green(`Prefix commands loaded: ${client.prefixCommands.size}`));
        console.info(green(`Slash commands loaded: ${client.slashCommands.size}`));

        if (client.slashCommands.size > 0) {
            await registerSlashCommands(client.slashCommands, process.env.CLIENT_ID, process.env.GUILD_ID);
        }

        console.info(green('All commands loaded successfully.'));
    } catch (error) {
        console.error(red(`Error loading commands: ${error.message}`));
    }
}

async function registerSlashCommands(slashCommands, clientId, guildId) {
    const rest = new REST({ version: '9' }).setToken(process.env.DISCORD_TOKEN);
    const commands = Array.from(slashCommands.values()).map(command => command.data.toJSON());
    const commandHash = crypto.createHash('sha256').update(JSON.stringify(commands)).digest('hex');
    const cachedData = readCommandCache();

    if (cachedData && cachedData.hash === commandHash) {
        console.info(yellow('No changes detected in slash commands. Skipping registration.'));
        return;
    }

    try {
        console.info(yellow('Refreshing slash commands...'));
        if (environment === 'development' && guildId) {
            await rest.put(Routes.applicationGuildCommands(clientId, guildId), { body: commands });
            console.info(green(`Guild-specific slash commands registered for guild: ${guildId}`));
        } else {
            await rest.put(Routes.applicationCommands(clientId), { body: commands });
            console.info(green('Global slash commands registered.'));
        }
        writeCommandCache({ hash: commandHash, commands });
    } catch (error) {
        console.error(red(`Error registering slash commands: ${error.message}`));
    }
}

function readCommandCache() {
    if (fs.existsSync(COMMAND_CACHE_FILE)) {
        try {
            return JSON.parse(fs.readFileSync(COMMAND_CACHE_FILE, 'utf8'));
        } catch (error) {
            console.error(red(`Error reading command cache: ${error.message}`));
        }
    }
    return null;
}

function writeCommandCache(data) {
    try {
        fs.writeFileSync(COMMAND_CACHE_FILE, JSON.stringify(data), 'utf8');
        console.info(green('Command cache updated.'));
    } catch (error) {
        console.error(red(`Error writing command cache: ${error.message}`));
    }
}

async function handleCommand(interaction) {
    try {
        const command = interaction.client.slashCommands.get(interaction.commandName);
        if (!command) {
            throw new Error(`Command "${interaction.commandName}" not found.`);
        }
        await command.execute(interaction);
    } catch (error) {
        console.error(red(`Error in command handler "${interaction.commandName}": ${error.message}`));
        if (!interaction.replied && !interaction.deferred) {
            await interaction.reply({
                content: 'An error occurred while executing this command.',
                ephemeral: true,
            }).catch(() => {
                console.error('Failed to send error reply.');
            });
        }
    }
}

module.exports = {
    loadAllCommands,
    handleCommand,
};