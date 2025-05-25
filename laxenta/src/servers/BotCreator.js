const express = require('express');
const fs = require('fs').promises;
const path = require('path');
const { spawn } = require('child_process');
const { createTemplateData } = require('./templateRouter');

class BotManager {
    constructor() {
        this.botsDir = path.join(__dirname, 'bots');
        this.memoryDir = path.join(__dirname, 'bots', 'memory');
        this.runningBots = new Map();
        this.init();
    }

    async init() {
        try {
            await fs.mkdir(this.botsDir, { recursive: true });
            await fs.mkdir(this.memoryDir, { recursive: true });
        } catch (err) {
            console.error('Error creating directories:', err);
        }
    }

    async createBot(config, userId) {
        if (!config.name) {
            throw new Error('Bot name is required');
        }

        const botId = Date.now().toString(36) + Math.random().toString(36).substr(2);
        const botFileName = `${config.name.toLowerCase().replace(/[^a-z0-9-]/g, '-')}-${botId}.js`;
        const botFilePath = path.join(this.botsDir, botFileName);

        const botConfig = {
            id: botId,
            fileName: botFileName,
            name: config.name,
            token: config.token,
            model: config.model || 'anubis-pro-105b-v1',
            instruction: config.instruction,
            userId: userId,
            settings: {
                temperature: parseFloat(config.settings?.temperature || 0.9),
                presence_penalty: parseFloat(config.settings?.presence_penalty || 0.6),
                frequency_penalty: parseFloat(config.settings?.frequency_penalty || 0.7),
                limit: parseInt(config.settings?.limit || 10),
                maxLength: parseInt(config.settings?.maxLength || 4000),
                typingInterval: parseInt(config.settings?.typingInterval || 5000),
                requestTimeout: parseInt(config.settings?.requestTimeout || 30000),
                maxRetries: parseInt(config.settings?.maxRetries || 3),
                cooldown: parseInt(config.settings?.cooldown || 3000)
            },
            presence: {
                status: config.presence?.status || 'online',
                activity: config.presence?.activity || 'with humans',
                activityType: config.presence?.activityType || 'PLAYING'
            },
            createdAt: new Date().toISOString(),
            isRunning: true // Changed to true by default
        };

        // Generate and save bot code
        await this.generateBotCode(botFilePath, botConfig);
        await this.saveBotConfig(botFilePath, botConfig);

        // Start the bot immediately
        await this.startBot(botId, userId);

        return botConfig;
    }

    async generateBotCode(filePath, config) {
        const botCode = `/*
BOT_CONFIG:
${JSON.stringify(config, null, 2)}
*/

const { Client, GatewayIntentBits } = require('discord.js');
const axios = require('axios');
const fs = require('fs').promises;
const path = require('path');

const API_KEY = '${config.settings.apiKey}';
const MEMORY_DIR = path.join(__dirname, 'memory');

class ${config.name.replace(/[^a-zA-Z0-9]/g, '')}Bot {
    constructor() {
        this.botId = '${config.id}';
        this.client = new Client({
            intents: [
                GatewayIntentBits.Guilds,
                GatewayIntentBits.GuildMessages,
                GatewayIntentBits.MessageContent,
                GatewayIntentBits.GuildMembers
            ]
        });

        this.config = {
            model: '${config.model}',
            instruction: ${JSON.stringify(config.instruction)},
            temperature: ${config.settings.temperature},
            presence_penalty: ${config.settings.presence_penalty},
            frequency_penalty: ${config.settings.frequency_penalty},
            limit: ${config.settings.limit},
            maxLength: ${config.settings.maxLength},
            typingInterval: ${config.settings.typingInterval},
            requestTimeout: ${config.settings.requestTimeout},
            maxRetries: ${config.settings.maxRetries},
            cooldown: ${config.settings.cooldown}
        };

        this.activeRequests = new Map();
        this.typingSessions = new Map();
        this.requestTimeouts = new Map();
        this.memoryCache = new Map();
        this.CACHE_DURATION = 1000 * 60 * 10;
        
        this.setupEventHandlers();
    }

    setupEventHandlers() {
        this.client.on('ready', () => {
            console.log(\`\${this.client.user.tag} is online!\`);
            this.client.user.setPresence({
                status: '${config.presence.status}',
                activities: [{
                    name: '${config.presence.activity}',
                    type: '${config.presence.activityType}'
                }]
            });
        });

        this.client.on('messageCreate', async (message) => {
            if (message.author.bot) return;
            if (message.mentions.users.has(this.client.user.id) || message.channel.type === 'DM') {
                await this.processMessage(message);
            }
        });
    }

    getRequestKey(channelId, userId) {
        return \`\${channelId}-\${userId}\`;
    }

    getMemoryFilePath(userId) {
        return path.join(MEMORY_DIR, \`\${this.botId}_\${userId}.json\`);
    }

    async loadMemory(userId) {
        if (this.memoryCache.has(userId)) {
            return this.memoryCache.get(userId);
        }

        const filePath = this.getMemoryFilePath(userId);
        try {
            const data = await fs.readFile(filePath, 'utf8');
            const pairs = JSON.parse(data);
            const memory = pairs.flatMap(pair => [
                { 
                    role: "user", 
                    content: pair.user.includes(":") ? pair.user : \`unknown_user: \${pair.user}\`
                },
                { 
                    role: "assistant", 
                    content: pair.assistant 
                }
            ]);
            this.memoryCache.set(userId, memory);
            return memory;
        } catch (err) {
            const empty = [];
            this.memoryCache.set(userId, empty);
            return empty;
        }
    }

    async saveMemory(userId, memory) {
        const formattedMemory = [];
        for (let i = 0; i < memory.length; i += 2) {
            if (i + 1 < memory.length) {
                formattedMemory.push({
                    user: memory[i].content,
                    assistant: memory[i + 1].content
                });
            }
        }
        
        const filePath = this.getMemoryFilePath(userId);
        await fs.writeFile(filePath, JSON.stringify(formattedMemory, null, 2), 'utf8');
        this.memoryCache.set(userId, memory);
    }

    startTyping(channel, key) {
        if (this.typingSessions.has(key)) return;
        const sendTyping = () => channel.sendTyping().catch(() => {});
        sendTyping();
        const interval = setInterval(sendTyping, this.config.typingInterval);
        this.typingSessions.set(key, interval);
    }

    cleanupRequest(key) {
        if (this.typingSessions.has(key)) {
            clearInterval(this.typingSessions.get(key));
            this.typingSessions.delete(key);
        }
        this.activeRequests.delete(key);

        if (this.requestTimeouts.has(key)) {
            clearTimeout(this.requestTimeouts.get(key));
            this.requestTimeouts.delete(key);
        }
    }

    async apiCallWithRetries(url, payload, axiosConfig, retries = 2) {
        let attempt = 0;
        while (attempt <= retries) {
            try {
                const response = await Promise.race([
                    axios.post(url, {
                        ...payload,
                        stream: true
                    }, {
                        ...axiosConfig,
                        responseType: 'stream',
                        timeout: this.config.requestTimeout
                    }),
                    new Promise((_, reject) => 
                        setTimeout(() => reject(new Error('Request timeout')), this.config.requestTimeout)
                    )
                ]);
                return response;
            } catch (error) {
                attempt++;
                if (attempt > retries) throw error;
                await new Promise(res => setTimeout(res, 1000 * attempt));
            }
        }
    }

    async processMessage(message) {
        const key = this.getRequestKey(message.channel.id, message.author.id);
        if (this.activeRequests.has(key)) return;
        this.activeRequests.set(key, true);

        try {
            this.startTyping(message.channel, key);

            let query = message.content || '';
            if (message.mentions && message.client && message.client.user) {
                const botMention = new RegExp(\`<@!?\${message.client.user.id}>\`, 'g');
                if (message.mentions.users && message.mentions.users.has(message.client.user.id)) {
                    query = query.replace(botMention, '').trim();
                }
            }

            if (!query) return;

            let memory = await this.loadMemory(message.author.id);
            
            const formattedQuery = {
                role: "user",
                content: \`\${message.author.username}: \${query}\`
            };
            
            const conversation = [
                {
                    role: "system",
                    content: this.config.instruction
                },
                ...memory,
                formattedQuery
            ];

            const response = await this.apiCallWithRetries(
                'https://api.electronhub.top/v1/chat/completions',
                {
                    model: this.config.model,
                    messages: conversation,
                    temperature: this.config.temperature,
                    presence_penalty: this.config.presence_penalty,
                    frequency_penalty: this.config.frequency_penalty,
                    limit: this.config.limit
                },
                {
                    headers: {
                        'Authorization': \`Bearer \${API_KEY}\`,
                        'Content-Type': 'application/json'
                    }
                }
            );

            let sentMessage = await message.reply({ 
                content: '*thinking...*',
                allowedMentions: { repliedUser: false }
            });

            let accumulatedResponse = '';
            let lastUpdate = Date.now();
            let updateBuffer = '';
            const minUpdateLength = 100;
            const updateDelay = 1000;
            const stream = response.data;

            stream.on('data', async chunk => {
                try {
                    const lines = chunk.toString().split('\\n');
                    for (const line of lines) {
                        if (line.startsWith('data: ')) {
                            const jsonStr = line.slice(6);
                            if (jsonStr === '[DONE]') continue;
                            
                            const data = JSON.parse(jsonStr);
                            if (!data.choices?.[0]?.delta?.content) continue;

                            const newContent = data.choices[0].delta.content;
                            accumulatedResponse += newContent;
                            updateBuffer += newContent;
                            
                            if (updateBuffer.length >= minUpdateLength && 
                                Date.now() - lastUpdate > updateDelay &&
                                /[.!?]\\s*$|\\s$/.test(updateBuffer)) {
                                
                                await sentMessage.edit({
                                    content: accumulatedResponse,
                                    allowedMentions: { repliedUser: false }
                                });
                                updateBuffer = '';
                                lastUpdate = Date.now();
                            }
                        }
                    }
                } catch (e) {
                    console.error('Streaming error:', e.message);
                }
            });

            await new Promise((resolve, reject) => {
                stream.on('end', resolve);
                stream.on('error', reject);
            });

            await sentMessage.edit({
                content: accumulatedResponse,
                allowedMentions: { repliedUser: false }
            });

            memory.push({
                role: "user",
                content: \`\${message.author.username}: \${query}\`
            });
            memory.push({
                role: "assistant",
                content: accumulatedResponse
            });
            
            if (memory.length > this.config.limit) {
                memory = memory.slice(-this.config.limit);
            }
            await this.saveMemory(message.author.id, memory);

        } catch (error) {
            console.error('Error:', error.message);
            await message.reply({
                content: 'Something went wrong, try again later.',
                allowedMentions: { repliedUser: true }
            }).catch(() => {});
        } finally {
            this.cleanupRequest(key);
        }
    }

    start() {
        this.client.login('${config.token}');
    }
}

const bot = new ${config.name.replace(/[^a-zA-Z0-9]/g, '')}Bot();
bot.start();

process.on('SIGINT', () => {
    console.log('Bot shutting down...');
    bot.client.destroy();
    process.exit(0);
});`;

        await fs.writeFile(filePath, botCode);
    }

    async saveBotConfig(filePath, config) {
        // Config is already saved as a comment in the file
        // We could also maintain a separate index file if needed
        const indexPath = path.join(this.botsDir, 'bots-index.json');
        
        let botsIndex = {};
        try {
            const data = await fs.readFile(indexPath, 'utf8');
            botsIndex = JSON.parse(data);
        } catch (err) {
            // File doesn't exist, start fresh
        }
        
        botsIndex[config.id] = {
            id: config.id,
            fileName: config.fileName,
            name: config.name,
            userId: config.userId,
            createdAt: config.createdAt,
            updatedAt: config.updatedAt || config.createdAt
        };
        
        await fs.writeFile(indexPath, JSON.stringify(botsIndex, null, 2));
    }

    async getBotConfigFromFile(filePath) {
        try {
            const content = await fs.readFile(filePath, 'utf8');
            const configMatch = content.match(/\/\*\s*BOT_CONFIG:\s*([\s\S]*?)\s*\*\//);
            if (configMatch) {
                return JSON.parse(configMatch[1]);
            }
        } catch (err) {
            console.error('Error reading bot config:', err);
        }
        return null;
    }

    async getUserBots(userId) {
        try {
            const files = await fs.readdir(this.botsDir);
            const botFiles = files.filter(file => file.endsWith('.js'));
            const userBots = [];

            for (const fileName of botFiles) {
                const filePath = path.join(this.botsDir, fileName);
                const config = await this.getBotConfigFromFile(filePath);
                
                if (config && config.userId === userId) {
                    config.isRunning = this.runningBots.has(config.id);
                    config.fileName = fileName;
                    userBots.push(config);
                }
            }

            return userBots;
        } catch (err) {
            console.error('Error getting user bots:', err);
            return [];
        }
    }

    async updateBot(botId, newConfig, userId) {
        const userBots = await this.getUserBots(userId);
        const bot = userBots.find(b => b.id === botId);
        
        if (!bot) {
            throw new Error('Bot not found or access denied');
        }

        const filePath = path.join(this.botsDir, bot.fileName);
        
        // Update config
        const updatedConfig = {
            ...bot,
            name: newConfig.botName,
            model: newConfig.model,
            instruction: newConfig.instruction,
            settings: {
                ...bot.settings,
                temperature: parseFloat(newConfig.temperature || 0.9),
                presence_penalty: parseFloat(newConfig.presence_penalty || 0.6),
                frequency_penalty: parseFloat(newConfig.frequency_penalty || 0.7),
                limit: parseInt(newConfig.limit || 10),
                maxLength: parseInt(newConfig.maxLength || 4000),
                typingInterval: parseInt(newConfig.typingInterval || 5000),
                requestTimeout: parseInt(newConfig.requestTimeout || 30000),
                maxRetries: parseInt(newConfig.maxRetries || 3),
                cooldown: parseInt(newConfig.cooldown || 3000)
            },
            presence: {
                status: newConfig.status || 'online',
                activity: newConfig.activity || 'with humans',
                activityType: newConfig.activityType || 'PLAYING'
            },
            updatedAt: new Date().toISOString()
        };

        await this.generateBotCode(filePath, updatedConfig);
        await this.saveBotConfig(filePath, updatedConfig);

        return updatedConfig;
    }

    async startBot(botId, userId) {
        const userBots = await this.getUserBots(userId);
        const bot = userBots.find(b => b.id === botId);
        
        if (!bot) {
            throw new Error('Bot not found or access denied');
        }

        if (this.runningBots.has(botId)) {
            throw new Error('Bot is already running');
        }

        const botFilePath = path.join(this.botsDir, bot.fileName);
        const botProcess = spawn('node', [botFilePath], { 
            stdio: 'pipe'
        });

        this.runningBots.set(botId, botProcess);

        botProcess.on('exit', () => {
            this.runningBots.delete(botId);
        });

        return true;
    }

    async stopBot(botId, userId) {
        const userBots = await this.getUserBots(userId);
        const bot = userBots.find(b => b.id === botId);
        
        if (!bot) {
            throw new Error('Bot not found or access denied');
        }

        const botProcess = this.runningBots.get(botId);
        if (botProcess) {
            botProcess.kill();
            this.runningBots.delete(botId);
            return true;
        }

        return false;
    }

    async deleteBot(botId, userId) {
        const userBots = await this.getUserBots(userId);
        const bot = userBots.find(b => b.id === botId);
        
        if (!bot) {
            throw new Error('Bot not found or access denied');
        }

        // Stop bot if running
        await this.stopBot(botId, userId).catch(() => {});

        // Delete bot file
        const botFilePath = path.join(this.botsDir, bot.fileName);
        await fs.unlink(botFilePath);

        // Clean up memory files
        try {
            const memoryFiles = await fs.readdir(this.memoryDir);
            const botMemoryFiles = memoryFiles.filter(file => file.startsWith(`${botId}_`));
            for (const file of botMemoryFiles) {
                await fs.unlink(path.join(this.memoryDir, file));
            }
        } catch (err) {
            console.error('Error cleaning up memory files:', err);
        }

        // Update index
        try {
            const indexPath = path.join(this.botsDir, 'bots-index.json');
            const data = await fs.readFile(indexPath, 'utf8');
            const botsIndex = JSON.parse(data);
            delete botsIndex[botId];
            await fs.writeFile(indexPath, JSON.stringify(botsIndex, null, 2));
        } catch (err) {
            console.error('Error updating bots index:', err);
        }

        return true;
    }

    async getAllBots() {
        try {
            const files = await fs.readdir(this.botsDir);
            const botFiles = files.filter(file => file.endsWith('.js'));
            const bots = [];

            for (const fileName of botFiles) {
                const filePath = path.join(this.botsDir, fileName);
                const config = await this.getBotConfigFromFile(filePath);
                
                if (config) {
                    // Only include public info for non-owner view
                    bots.push({
                        id: config.id,
                        name: config.name,
                        description: config.description,
                        isPublic: config.isPublic || false,
                        userId: config.userId,
                        createdAt: config.createdAt
                    });
                }
            }

            return bots;
        } catch (err) {
            console.error('Error getting all bots:', err);
            return [];
        }
    }

    // Add isOwner check method
    async isOwner(botId, userId) {
        const bot = await this.getBotById(botId);
        return bot && bot.userId === userId;
    }

    async getBotById(botId) {
        try {
            const files = await fs.readdir(this.botsDir);
            const botFiles = files.filter(file => file.endsWith('.js'));

            for (const fileName of botFiles) {
                const filePath = path.join(this.botsDir, fileName);
                const config = await this.getBotConfigFromFile(filePath);
                
                if (config && config.id === botId) {
                    return {
                        ...config,
                        isRunning: this.runningBots.has(config.id),
                        fileName: fileName
                    };
                }
            }
        } catch (err) {
            console.error('Error getting bot by ID:', err);
        }
        return null;
    }

    // Instead of setupRoutes(), create a method that returns a router
    getRouter(isAuthenticated) {
        const router = express.Router();
        
        // Bot dashboard route
        router.get('/bots', isAuthenticated, async (req, res) => {
            try {
                // Use createTemplateData to get consistent template data
                const templateData = await createTemplateData(req, req.app.locals.client, this);
                
                res.render('dashboard', templateData);
            } catch (error) {
                console.error('Dashboard error:', error);
                res.status(500).render('error', { 
                    error: 'Failed to load dashboard',
                    ...await createTemplateData(req, req.app.locals.client, this)
                });
            }
        });

        // Create bot route
        router.post('/bots/create', isAuthenticated, async (req, res) => {
            try {
                const bot = await this.createBot(req.body, req.user.discordId);
                res.json(bot);
            } catch (error) {
                console.error('Error creating bot:', error);
                res.status(500).json({ error: error.message });
            }
        });

        // Bot edit route
        router.get('/bots/edit/:id', isAuthenticated, async (req, res) => {
            try {
                const isOwner = await this.isOwner(req.params.id, req.user.discordId);
                
                if (!isOwner) {
                    return res.status(403).render('error', {
                        error: 'You do not have permission to edit this bot',
                        user: req.user,
                        isAuthenticated: true
                    });
                }

                const bot = await this.getBotById(req.params.id);
                if (!bot) {
                    return res.status(404).render('error', {
                        error: 'Bot not found',
                        user: req.user,
                        isAuthenticated: true
                    });
                }

                res.render('edit-bot', {
                    bot,
                    user: req.user,
                    isAuthenticated: true
                });

            } catch (error) {
                console.error('Edit bot error:', error);
                res.status(500).render('error', {
                    error: 'Failed to load bot editor',
                    user: req.user,
                    isAuthenticated: true
                });
            }
        });

        // Get bot details
        router.get('/bots/:id', isAuthenticated, async (req, res) => {
            try {
                const bot = await this.getBotById(req.params.id);
                if (!bot) {
                    return res.status(404).json({ error: 'Bot not found' });
                }
                
                // Only show full details to owner
                const isOwner = await this.isOwner(req.params.id, req.user.discordId);
                const botData = isOwner ? bot : {
                    id: bot.id,
                    name: bot.name,
                    description: bot.description,
                    isPublic: bot.isPublic,
                    createdAt: bot.createdAt
                };
                
                res.json(botData);
            } catch (error) {
                res.status(500).json({ error: error.message });
            }
        });

        // Update bot
        router.put('/bots/:id', isAuthenticated, async (req, res) => {
            try {
                const isOwner = await this.isOwner(req.params.id, req.user.discordId);
                if (!isOwner) {
                    return res.status(403).json({ error: 'Not authorized' });
                }
                
                const updatedBot = await this.updateBot(req.params.id, req.body, req.user.discordId);
                res.json(updatedBot);
            } catch (error) {
                res.status(500).json({ error: error.message });
            }
        });

        // Delete bot
        router.delete('/bots/:id', isAuthenticated, async (req, res) => {
            try {
                const isOwner = await this.isOwner(req.params.id, req.user.discordId);
                if (!isOwner) {
                    return res.status(403).json({ error: 'Not authorized' });
                }
                
                await this.deleteBot(req.params.id, req.user.discordId);
                res.json({ success: true });
            } catch (error) {
                res.status(500).json({ error: error.message });
            }
        });
        return router;
    }

    // Add method to get data for templates
    async getBotTemplateData(userId) {
        const userBots = await this.getUserBots(userId);
        const allBots = await this.getAllBots();
        
        return {
            userBots,
            publicBots: allBots.map(bot => ({
                id: bot.id,
                name: bot.name,
                description: bot.description,
                inviteUrl: `https://discord.com/api/oauth2/authorize?client_id=${bot.id}&permissions=8&scope=bot%20applications.commands`,
                isOwner: bot.userId === userId,
                isPublic: bot.isPublic,
                createdAt: bot.createdAt
            }))
        };
    }
}

module.exports = BotManager;