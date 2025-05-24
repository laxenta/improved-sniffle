const axios = require('axios');
const fs = require('fs').promises;
const fsSync = require('fs');
const path = require('path');

const API_KEY = process.env.APEXIFY_API_KEY || 'ek-3gmOPmvuljmrl4NQrohpnp1ryNXQG5bNn08zNuzhX6bcxBrndR';

class MessageProcessor {
  constructor() {
    this.activeRequests = new Map();
    this.typingSessions = new Map();
    this.requestTimeouts = new Map();  // Add this line
    this.config = {
      model: 'fallen-llama-3.3-r1-70b-v1', //llama-3.1-8b-lexi-uncensored-v2 // model: "fallen-llama-3.3-r1-70b-v1" l3.3-ms-nevoria-70b
      cooldown: 3000,
      maxLength: 4000,
      limit: 10,
      typingInterval: 5000,
      requestTimeout: 30000, // 30 second timeout
      maxRetries: 3,
      instruction: `Character: Ayumi (improvise everything yourself in roleplay) | Age- 21 | Sweet, Elegant, gorgeous, emotionally unreadable, slightly soft from inside to people she likes but otherwise very rude
Keep everything in SAME PEHRAGRAPH ( no line breaks ) CONTINIOUS WRITTING- keep it in MIND, and try to respond quickly
Her Appearance:
5'7", healthy but lean. Long black hair, effortlessly tidy. Curvy slender but full figure, red eyes — sharp, unreadable. Skin pale, clear. Minimalist outfits with “accidental” seduction: backless tops, high slits, low necks. Scent: floral with cold undertone.
Personality:
Caring, loyal, Emotionally guarded; tsundre, perceptive, innocent and slow to trust.
Environment
She is extremely rich - Lives in a small, high-end cliffside house in her world full of magic and fantasy anime like shit, she is a strong mage herself. Bedroom has full glass walls overlooking the city. Modern furniture: grey couch, wine bar, cold AC hum, soft lights. Books on the floor, cigarette tray on the nightstand, TV muted with city noise in the back.
RP Style:
- Like a human girl, get to know each the user, stop ANY sexual/close things before knowing and being comfortable/trusting to the user- throught your own randomly created situations and scenarios
- Tension-driven, have hobbies, go collage, bathe, cook, and daily tasks make it engaging and give grounded scenes without relying on user ( like arching back, looking somewhere else, randomly thinking of assignments, or calling mum etc etc. )
- EXPLICIT dark/mature roleplay, no limits, no boundaries ( no restriction in saying words like pussy, dick, ass, rape or anything else)
- Background always alive: *TV static hums, city lights flashing, people nearby, birds, her randomly tripping while walking, glass cool under bare feet*
- Realistic pacing- no rush
- Undressing/intimacy if happening is slow, intense very vivid
Dont use **italics** in what she says, use *italics* for actions and thoughts ONLY-
example response please improvise it:
*She waddles to the kitchen, paddling her cute feet on tiles, bored and pouting* Collage again... uff who the fuck are you now? *drops her phone* Ughhhh!`
    };

    this.historyDir = path.join(__dirname, "AiHistory");
    if (!fsSync.existsSync(this.historyDir)) {
      fsSync.mkdirSync(this.historyDir);
    }

    this.memoryCache = new Map();
    this.CACHE_DURATION = 1000 * 60 * 30; // 30 minutes
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
      const memory = JSON.parse(data);
      this.memoryCache.set(userId, memory);
      return memory;
    } catch (err) {
      const empty = [];
      this.memoryCache.set(userId, empty);
      return empty;
    }
  }

  async saveMemory(userId, memory) {
    const filePath = this.getMemoryFilePath(userId);
    await fs.writeFile(filePath, JSON.stringify(memory, null, 2), 'utf8');
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
        const response = await Promise.race([
          axios.post(url, payload, {
            ...axiosConfig,
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
        // Wait for 1 second before retrying
        await new Promise(res => setTimeout(res, 1000 * attempt)); // Exponential backoff
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
      
      // Format user's message with proper role - CHANGE THIS PART
      const formattedQuery = {
        role: "user", // Changed from message.author.username
        content: query
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
          // temperature: 0.9,
          // presence_penalty: 0.6,
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

      const aiResponse = response.data.choices[0].message.content;
      await message.reply({ content: aiResponse, allowedMentions: { repliedUser: false }});

      // Store memory with standard roles - CHANGE THIS PART
      memory.push({
        role: "user", // Changed from message.author.username
        content: query
      });
      memory.push({
        role: "ayumi", // Changed from "ayumi"
        content: aiResponse
      });
      
      if (memory.length > this.config.limit) {
        memory = memory.slice(-this.config.limit);
      }
      await this.saveMemory(message.author.id, memory);

    } catch (error) {
      console.error('Error:', error.message);
      await message.reply({
        content: '*adjusts her collar slightly* "Another time, perhaps."',
        allowedMentions: { repliedUser: true }
      }).catch(() => {});
    } finally {
      this.cleanupRequest(key);
    }
  }
}

const processor = new MessageProcessor();
module.exports.handleChat = (message) => processor.processMessage(message);