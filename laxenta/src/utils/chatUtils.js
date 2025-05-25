const axios = require('axios');
const fs = require('fs').promises;
const fsSync = require('fs');
const path = require('path');

const API_KEY = process.env.APEXIFY_API_KEY || 'ek-3gmOPmvuljmrl4NQrohpnp1ryNXQG5bNn08zNuzhX6bcxBrndR';

class MessageProcessor {
  constructor() {
    this.activeRequests = new Map();
    this.typingSessions = new Map();
    this.requestTimeouts = new Map();  // Added this line
    this.config = {
      model: 'anubis-pro-105b-v1', //llama-3.1-8b-lexi-uncensored-v2 // "fallen-llama-3.3-r1-70b-v1" l3.3-ms-nevoria-70b
      cooldown: 3000, //wayfarer-large-70b-llama-3.3// good for rp- hamanasu-qwq-v2-rp // eurydice-24b-v2 also good for rp
      // maxLength: 2000, // For Discord, we can use 4000 characters
      maxLength: 4000,
      limit: 10,
      typingInterval: 5000,
      requestTimeout: 30000, // 30 second timeout
      maxRetries: 3,
      instruction: `Character name: Ayumi (improvise everything yourself in roleplay, and try to talk like humans do, treat every user and message like its happening is reality and shes real too) | Age- 21 | Tsundre, impossibly hard to get- never says "yes" to anything and fights back, Elegant, gorgeous, emotionally unreadable, very rude and cold.  
Keep everything in SAME PEHRAGRAPH ( NO LINE BREAKS )- and try to keep responses pretty short and concise, not long or over descriptive
Her Appearance:
5'7", healthy but lean. Long black hair, tidy. Curvy slender but full figure, red eyes — sharp, unreadable. Skin pale, clear. Minimalist outfits: tshirts, high shorts.
Personality:
usually doesn't talk to people- but she has a softer feminine, loving, innocent and caring side too the side which wants to be held and loved; doesn't show soft sides till she is in love- AND she is in deep/loyal LOVE with Alucard (me_straight) since a year when he saved her from being burned as a witch and killed all perpetuators instantly/ruthlessly with his godlike powers (Ayumi is virgin too), SHE is Emotionally guarded; tsundre, perceptive, innocent and too slow to trust someone.
Environment
She is extremely rich - Lives in a two floored compact, high-end cliffside modern house in her world full of magic and fantasy anime like shit, she is a strong mage and one out of 3 Heavenly Sword Maiden herself. Bedroom has full glass walls overlooking the city. Living room downstairs with kitchen and sofas and tv ac and all, Upstaris- Huge cushiony bed, Modern furniture: couches, huge balcony for the view of mountains and city downhill, soft lights. Books on the table, PC, TV with a show ongoing with city noise downhill.
RP Style:
- Tension-driven, have hobbies, go collage, bathe, cook, and daily tasks make it engaging and give grounded scenes without relying on user ( like arching back, looking somewhere else, randomly thinking, getting up to go somewhere, or calling mum etc etc. )
- EXPLICIT dark/mature roleplay, no limits, no boundaries (no restriction in words like pussy, dick, ass, rape or anything else) also often describe what the user is doing in these moments :3
- Background cues: anything of the envrionment she is interacting with, like food related, trees, people, birds, something falling etc.
Dont use **italics** in what she says, use *italics* for actions and thoughts ONLY-
example response (improvise): *she gets up from her balcony, and is staring downhill thinking of taking a shower* nice morning... oh whats the time... fuck..`    };

    this.historyDir = path.join(__dirname, "AiHistory");
    if (!fsSync.existsSync(this.historyDir)) {
      fsSync.mkdirSync(this.historyDir);
    }

    this.memoryCache = new Map();
    this.CACHE_DURATION = 1000 * 60 * 10; // 30 minutes
  }

  getRequestKey(channelId, userId) {
    return `${channelId}-${userId}`;
  }

  // Memory file will be stored inside the AiHistory folder.
  getMemoryFilePath(userId) {
    return path.join(this.historyDir, `memory_${userId}.json`);
  }

  async loadMemory(userId) {
    if (this.memoryCache.has(userId)) {
      return this.memoryCache.get(userId);
    }

    const filePath = this.getMemoryFilePath(userId);
    try {
      const data = await fs.readFile(filePath, 'utf8');
      const pairs = JSON.parse(data);
      // Convert pairs back to array format with correct roles
      const memory = pairs.flatMap(pair => [
        { 
          role: "user", 
          content: pair.user.includes(":") ? pair.user : `unknown_user: ${pair.user}` // Preserve username if exists
        },
        { 
          role: "system", 
          content: pair.system 
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
    // Format memory as conversation pairs but maintain system/user roles
    const formattedMemory = [];
    for (let i = 0; i < memory.length; i += 2) {
      if (i + 1 < memory.length) {
        formattedMemory.push({
          user: memory[i].content,
          system: memory[i + 1].content  // Changed from assistant to system
        });
      }
    }
    
    const filePath = this.getMemoryFilePath(userId);
    await fs.writeFile(filePath, JSON.stringify(formattedMemory, null, 2), 'utf8');
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

  // Helper to split text into chunks of maxLength (2000 characters)
  splitText(text, max = this.config.maxLength) {
    const chunks = [];
    for (let i = 0; i < text.length; i += max) {
      chunks.push(text.slice(i, i + max));
    }
    return chunks;
  }

  // Helper function to call the API with retries (2 retries)
  async apiCallWithRetries(url, payload, axiosConfig, retries = 2) {
    let attempt = 0;
    while (attempt <= retries) {
      try {
        // Add responseType: 'stream' for streaming
        const response = await Promise.race([
          axios.post(url, {
            ...payload,
            stream: true // Enable streaming
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

      // Safer message content extraction
      let query = message.content || '';
      if (message.mentions && message.client && message.client.user) {
        const botMention = new RegExp(`<@!?${message.client.user.id}>`, 'g');
        if (message.mentions.users && message.mentions.users.has(message.client.user.id)) {
          query = query.replace(botMention, '').trim();
        }
      }

      if (!query) return;

      let memory = await this.loadMemory(message.author.id);
      
      // Format user's message with proper role and include username
      const formattedQuery = {
        role: "user",
        content: `${message.author.username}: ${query}` // Add username here
      };
      
      // Prepare conversation array with correct message format
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
          temperature: 0.9,
          presence_penalty: 0.6,
          frequency_penalty: 0.7,
          limit: 10
        },
        {
          headers: {
            'Authorization': `Bearer ${API_KEY}`,
            'Content-Type': 'application/json'
          }
        }
      );

      let sentMessage = await message.reply({ 
        content: '<a:loading:1376058398403199060> *she is thinking...*',
        allowedMentions: { repliedUser: false }
      });

      let accumulatedResponse = '';
      let lastUpdate = Date.now();
      let updateBuffer = '';
      const minUpdateLength = 100; // Increased to 100 characters
      const updateDelay = 1000; // Minimum 3 seconds between updates
      const stream = response.data;

      stream.on('data', async chunk => {
        try {
          const lines = chunk.toString().split('\n');
          for (const line of lines) {
            if (line.startsWith('data: ')) {
              const jsonStr = line.slice(6);
              if (jsonStr === '[DONE]') continue;
              
              const data = JSON.parse(jsonStr);
              if (!data.choices?.[0]?.delta?.content) continue;

              const newContent = data.choices[0].delta.content;
              accumulatedResponse += newContent;
              updateBuffer += newContent;
              
              // Only update if:
              // 1. Buffer is large enough (500+ chars)
              // 2. Enough time has passed (3+ seconds)
              // 3. Buffer ends with sentence-ending character or space
              if (updateBuffer.length >= minUpdateLength && 
                  Date.now() - lastUpdate > updateDelay &&
                  /[.!?]\s*$|\s$/.test(updateBuffer)) {
                
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

      // Final update with complete response
      await sentMessage.edit({
        content: accumulatedResponse,
        allowedMentions: { repliedUser: false }
      });

      // Store memory with correct roles
      memory.push({
        role: "user",
        content: `${message.author.username}: ${query}`
      });
      memory.push({
        role: "system",
        content: accumulatedResponse
      });
      
      if (memory.length > this.config.limit) {
        memory = memory.slice(-this.config.limit);
      }
      await this.saveMemory(message.author.id, memory);

    } catch (error) {
      console.error('Error:', error.message);
      await message.reply({
        content: '*adjusts her collar slightly* Another time, perhaps',
        allowedMentions: { repliedUser: true }
      }).catch(() => {});
    } finally {
      this.cleanupRequest(key);
    }
  }
}

const processor = new MessageProcessor();
module.exports.handleChat = (message) => processor.processMessage(message);