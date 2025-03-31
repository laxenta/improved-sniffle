const { ApexChat } = require('apexify.js');

const CONFIG = {
  MAX_MESSAGE_LENGTH: 1000000,
  DEFAULT_MODEL: 'o3-mini-online',
};

const activeRequests = new Set();

async function getReply(userId, message, model = CONFIG.DEFAULT_MODEL, instruction = '') {
  if (!message?.trim()) {
    throw new Error('Message cannot be empty');
  }

  if (message.length > CONFIG.MAX_MESSAGE_LENGTH) {
    throw new Error(`Message exceeds maximum length of ${CONFIG.MAX_MESSAGE_LENGTH} characters`);
  }

  if (activeRequests.has(userId)) {
    throw new Error('Please wait for your previous request to complete');
  }

  activeRequests.add(userId);

  let usedModel = model;
  try {
    let response;
    try {
      // Try with the provided model
      response = await ApexChat(usedModel, message, {
        userId,
        memory: false,
        limit: 25,
        instruction: instruction.trim()
      });
    } catch (error) {
      // If the provided model fails and it's not already the default,
      // fallback to the default model and inform the user.
      if (usedModel !== CONFIG.DEFAULT_MODEL) {
        console.warn(`Model **${usedModel}** failed. Falling back to default model: ${CONFIG.DEFAULT_MODEL}`);
        usedModel = CONFIG.DEFAULT_MODEL;
        response = await ApexChat(usedModel, message, {
          userId,
          memory: false,
          limit: 5,
          instruction: instruction.trim()
        });
      } else {
        // If even the default fails, then just throw the error.
        throw error;
      }
    }

    if (!response) {
      throw new Error('Empty response from AI');
    }

    // Prefix the response with the model that replied
    return `**${usedModel}**: ${response}`;
  } catch (error) {
    console.error('AI Error:', error.message);
    throw error;
  } finally {
    activeRequests.delete(userId);
  }
}

async function initialize() {
  // No model validation here, so initialization is simple.
  console.log('✅ AI module initialized without model validation');
  return true;
}

async function getAvailableModels() {
  // Since we aren't validating, we'll just return the default model.
  // You can modify this to include more models if needed.
  return [CONFIG.DEFAULT_MODEL];
}

module.exports = {
  getReply,
  initialize,
  CONFIG,
  getAvailableModels
};