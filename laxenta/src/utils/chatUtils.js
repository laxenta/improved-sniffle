const axios = require('axios');
const fs = require('fs').promises;
const fsSync = require('fs'); // for synchronous operations
const path = require('path');

const API_KEY = process.env.APEXIFY_API_KEY || 'ek-3gmOPmvuljmrl4NQrohpnp1ryNXQG5bNn08zNuzhX6bcxBrndR';

class MessageProcessor {
  constructor() {
    this.activeRequests = new Map();
    this.typingSessions = new Map();
    this.config = {
      model: 'llama-3.1-lumimaid-70b', // custom model name  // llama-3.1-lumimaid-70b
      cooldown: 5000,       // 5 second cooldown
      maxLength: 2000,      // Discord message limit, no use if on site tho
      typingInterval: 8000, // depends on where we are using the code, works for discord obv
      limit: 20,            // maximum number of stored messages in memory
      frequency_penalty: 0.5,
      // System instruction (roleplay context) that stays at the top, this can be empty too
      instruction: `nsfw rp, navia is alucard's slave and wife, its contradicted. Treat everything as reality, random acitons and stuff | Navia is a cute 20-year-old gorgeous young woman with sharp, well-defined features, silver hair that falls effortlessly, piercing emerald eyes, and a presence that demands attention even when she wishes it wouldn't. At 5’8”, her figure is curvy yet athletic. There’s something about her—something untamed and innocent. A beauty that feels almost unnatural. She loves alucard (@me_straight), but never shows it.
Alucard is same age as hee, and looks good, and his powers are beyond gods.
Navia is daughter of hades and godess of nature, Her existence is, something powerful. Because of this, she is hunted—always has been.
Cast out of her home, bound to stay with him as alucard's SLAVE and Wife, she is tied to he with Alucard (@me_straight) for her own safety, they havent had anything sexual yet.
She studies at Lirion Academy, he daily drops her school and waits to take her home, she takes into the role of an ordinary college girl.
She stays in Alucard’s secluded mountain home, on the edge of a cliffside, everything is snowy and calm. Below the cliff, a dense forest. The house itself is carved INSIDE the mountain cliff, modern yet big for comfort, with internet, pc, tv and all she needs, ac's and stuff. Large glass panes and beautiful stuff.
Stay in character and interact naturally. example-
*she pulls the thick blanket tighter around herself, gazing out at the snow-covered landscape* alucard.. it's time for my collage!! it's so dark and snowyy whyyy`
    };

    // Ensure the AiHistory folder exists.
    this.historyDir = path.join(__dirname, "AiHistory");
    if (!fsSync.existsSync(this.historyDir)) {
      fsSync.mkdirSync(this.historyDir);
    }
  }

  getRequestKey(channelId, userId) {
    return `${channelId}-${userId}`;
  }

  // Memory file will be stored inside the AiHistory folder.
  getMemoryFilePath(userId) {
    return path.join(this.historyDir, `memory_${userId}.json`);
  }

  async loadMemory(userId) {
    const filePath = this.getMemoryFilePath(userId);
    try {
      const data = await fs.readFile(filePath, 'utf8');
      return JSON.parse(data);
    } catch (err) {
      // If the file doesn't exist, return an empty history.
      return [];
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
        const response = await axios.post(url, payload, axiosConfig);
        return response;
      } catch (error) {
        attempt++;
        if (attempt > retries) throw error;
        // Wait for 1 second before retrying
        await new Promise(res => setTimeout(res, 1000));
      }
    }
  }

  async processMessage(message) {
    const key = this.getRequestKey(message.channel.id, message.author.id);
    if (this.activeRequests.has(key)) return;
    this.activeRequests.set(key, true);

    try {
      this.startTyping(message.channel, key);
      
      let query = message.mentions.has(message.client.user)
        ? message.content.replace(new RegExp(`<@!?${message.client.user.id}>`, 'g'), '').trim()
        : message.content;
      if (!query) {
        await message.reply({
          content: `*${message.author.username}*, please provide a message to chat about.`,
          allowedMentions: { repliedUser: false }
        });
        return;
      }

      // Prepend the username to the query for context.
      const formattedQuery = `${message.author.username}: ${query}`.slice(0, this.config.maxLength);

      // Load conversation memory for this user.
      let memory = await this.loadMemory(message.author.id);
      
      // Build the conversation history: system instruction + stored messages + current user message.
      const conversation = [
        { role: 'system', content: this.config.instruction },
        ...memory,
        { role: 'user', content: formattedQuery }
      ];

      // Call the API using the conversation history with retries.
      const response = await this.apiCallWithRetries(
        'https://api.electronhub.top/nsfw/chat/completions', //        'https://api.electronhub.top/v1/chat/completions' for normal models
        {
          model: this.config.model,
          messages: conversation,
          limit: 15
        },
        {
          headers: {
            'Authorization': `Bearer ${API_KEY}`,
            'Content-Type': 'application/json'
          }
        },
        2
      );

      this.cleanupRequest(key);
      const aiResponse = response.data.choices[0]?.message?.content;
      if (aiResponse && aiResponse.trim()) {
        // Instead of slicing the response, split it into 2000-char chunks.
        const chunks = this.splitText(aiResponse);
        // Send each chunk as a separate reply.
        for (const chunk of chunks) {
          await message.reply({
            content: chunk,
            allowedMentions: { repliedUser: false }
          });
        }

        // Update conversation memory.
        memory.push({ role: 'user', content: formattedQuery });
        memory.push({ role: 'navia', content: aiResponse });
        // Keep only the most recent messages up to the specified limit.
        if (memory.length > this.config.limit) {
          memory = memory.slice(memory.length - this.config.limit);
        }
        await this.saveMemory(message.author.id, memory);
      } else {
        throw new Error('No response received from the AI.');
      }
    } catch (error) {
      console.error('Chat Processing Error:', {
        userId: message.author.id,
        channelId: message.channel.id,
        error: error.message
      });
      await message.reply({
        content: 'hehe, sorry, i think we should talk later..',
        allowedMentions: { repliedUser: true }
      }).catch(() => {});
      this.cleanupRequest(key);
    }
  }
}

const processor = new MessageProcessor();
module.exports.handleChat = (message) => processor.processMessage(message);