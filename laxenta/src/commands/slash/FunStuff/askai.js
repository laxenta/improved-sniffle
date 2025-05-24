const { SlashCommandBuilder } = require('discord.js');
const axios = require('axios');

const API_KEY = process.env.APEXIFY_API_KEY || "nuuh no api here";
const DEFAULT_MODEL = "gemini-1.5-flash-online";

async function getReply(userId, query, model, instruction) {
  try {
    const messages = [];
    if (instruction) {
      messages.push({ role: "system", content: instruction });
    }
    messages.push({ role: "user", content: query });

    const response = await axios.post(
      "https://api.electronhub.top/v1/chat/completions",
      {
        model: model,
        messages: messages
      },
      {
        headers: {
          "Authorization": `Bearer ${API_KEY}`,
          "Content-Type": "application/json"
        }
      }
    );

    return response.data.choices[0]?.message?.content || "No response generated.";
  } catch (error) {
    throw new Error(`API Error: ${error.message}`);
  }
}

const models = [
  "c4ai-aya-expanse-8b",
  "c4ai-aya-expanse-32b",
  "reka-flash",
  "reka-core",
  "grok-2",
  "grok-2-mini",
  "grok-beta",
  "grok-vision-beta",
  "grok-2-1212",
  "grok-2-vision-1212",
  "grok-3-early",
  "r1-1776",
  "sonar-reasoning-pro",
  "sonar-reasoning",
  "sonar-pro",
  "sonar",
  "gpt-4",
  "gpt-4-turbo",
  "claude-3-7-sonnet-20250219-thinking",
  "gpt-4o",
  "o1-mini",
  "sonar-deep-research",
  "o1",
  "o1-high",
  "o3-mini",
  "o3-mini-high",
  "o3-mini-online",
  "deepseek-r1",
  "deepseek-r1-nitro",
  "deepseek-r1-distill-llama-8b",
  "deepseek-r1-distill-llama-70b",
  "deepseek-r1-distill-qwen-1.5b",
  "deepseek-r1-distill-qwen-7b",
  "deepseek-r1-distill-qwen-14b",
  "deepseek-r1-distill-qwen-32b",
  "deepseek-v3",
  "deepseek-coder",
  "deepseek-v2.5",
  "deepseek-vl2",
  "deepseek-llm-67b-chat",
  "deepseek-math-7b-instruct",
  "deepseek-coder-6.7b-base-awq",
  "deepseek-coder-6.7b-instruct-awq",
  "claude-2",
  "claude-2.1",
  "claude-3-opus-20240229",
  "claude-3-sonnet-20240229",
  "claude-3-haiku-20240307",
  "claude-3-5-sonnet-20240620",
  "claude-3-5-sonnet-20241022",
  "claude-3-5-haiku-20241022",
  "gemini-1.5-pro",
  "gemini-1.5-pro-latest",
  "gemini-1.5-flash",
  "gemini-1.5-flash-latest",
  "gemini-1.5-flash-exp",
  "gemini-1.5-flash-online",
  "gemini-exp-1206",
  "learnlm-1.5-pro-experimental",
  "gemini-2.0-flash-001",
  "gemini-2.0-flash-exp",
  "gemini-2.0-flash-thinking-exp",
  "gemini-2.0-flash-thinking-exp-1219",
  "gemini-2.0-flash-thinking-exp-01-21",
  "gemini-2.0-flash-lite-preview-02-05",
  "gemini-2.0-pro-exp-02-05",
  "gemma-7b-it",
  "gemma-2-9b-it",
  "gemma-2-27b-it",
  "palm-2-chat-bison",
  "palm-2-codechat-bison",
  "palm-2-chat-bison-32k",
  "palm-2-codechat-bison-32k",
  "llama-2-13b-chat",
  "llama-2-70b-chat",
  "llama-guard-3-8b",
  "code-llama-34b-instruct",
  "llama-3-8b",
  "llama-3-70b",
  "llama-3.1-8b",
  "llama-3.1-70b",
  "llama-3.1-405b",
  "llama-3.2-1b",
  "llama-3.2-3b",
  "llama-3.2-11b",
  "llama-3.2-90b",
  "llama-3.3-70b-instruct",
  "llama-3.1-nemotron-70b-instruct",
  "nemotron-4-340b",
  "llama-3.1-tulu-3-8b",
  "llama-3.1-tulu-3-70b",
  "llama-3.1-tulu-3-405b",
  "pixtral-large-2411",
  "pixtral-12b",
  "mixtral-8x7b",
  "mixtral-8x22b",
  "mistral-7b-instruct",
  "mistral-tiny-latest",
  "mistral-tiny",
  "mistral-tiny-2312",
  "mistral-tiny-2407",
  "mistral-small-24b-instruct-2501",
  "mistral-small-latest",
  "mistral-small",
  "mistral-small-2312",
  "mistral-small-2402",
  "mistral-small-2409",
  "mistral-medium-latest",
  "mistral-medium",
  "mistral-medium-2312",
  "mistral-large-latest",
  "mistral-large-2411",
  "mistral-large-2407",
  "mistral-large-2402",
  "open-mistral-nemo",
  "open-mistral-nemo-2407",
  "open-mixtral-8x22b-2404",
  "open-mixtral-8x7b",
  "codestral-mamba",
  "codestral-latest",
  "codestral-2405",
  "codestral-2412",
  "codestral-2501",
  "codestral-2411-rc5",
  "ministral-3b",
  "ministral-3b-2410",
  "ministral-8b",
  "ministral-8b-2410",
  "mistral-saba-latest",
  "mistral-saba-2502",
  "f1-mini-preview",
  "f1-preview",
  "dolphin-mixtral-8x7b",
  "dolphin-mixtral-8x22b",
  "dolphin3.0-mistral-24b",
  "dolphin3.0-r1-mistral-24b",
  "dbrx-instruct",
  "command",
  "command-light",
  "command-nightly",
  "command-light-nightly",
  "command-r",
  "command-r-03-2024",
  "command-r-08-2024",
  "command-r-plus",
  "command-r-plus-04-2024",
  "command-r-plus-08-2024",
  "command-r7b-12-2024",
  "llama-3.1-sonar-small-128k-online",
  "llama-3.1-sonar-large-128k-online",
  "llama-3.1-sonar-huge-128k-online",
  "llama-3.1-sonar-small-128k-chat",
  "llama-3.1-sonar-large-128k-chat",
  "phi-4",
  "phi-3.5-mini-128k-instruct",
  "phi-3-medium-128k-instruct",
  "phi-3-mini-128k-instruct",
  "phi-2",
  "wizardlm-2-7b",
  "wizardlm-2-8x22b",
  "minimax-01",
  "jamba-1.5-large",
  "jamba-1.5-mini",
  "jamba-instruct",
  "openchat-3.5-7b",
  "openchat-3.6-8b",
  "qwen-1.5-0.5b-chat",
  "qwen-1.5-1.8b-chat",
  "qwen-1.5-14b-chat-awq",
  "qwen-1.5-7b-chat-awq",
  "qwen-2-7b-instruct",
  "qwen-2-72b-instruct",
  "qwen-2-vl-7b-instruct",
  "qwen-2-vl-72b-instruct",
  "qwen-2.5-7b-instruct",
  "qwen-2.5-72b-instruct",
  "qwen-2.5-coder-32b-instruct",
  "qwq-32b-preview",
  "qvq-72b-preview",
  "qwen-vl-plus",
  "qwen2.5-vl-72b-instruct",
  "qwen-turbo",
  "qwen-plus",
  "qwen-max",
  "aion-1.0",
  "aion-1.0-mini",
  "aion-rp-llama-3.1-8b",
  "nova-lite-v1",
  "nova-micro-v1",
  "nova-pro-v1",
  "inflection-3-pi",
  "inflection-3-productivity",
  "mytho-max-l2-13b",
  "nous-hermes-llama2-13b",
  "hermes-3-llama-3.1-8b",
  "hermes-3-llama-3.1-405b",
  "hermes-2-pro-llama-3-8b",
  "nous-hermes-2-mixtral-8x7b-dpo",
  "doubao-lite-4k",
  "doubao-lite-32k",
  "doubao-pro-4k",
  "doubao-pro-32k",
  "ernie-lite-8k",
  "ernie-tiny-8k",
  "ernie-speed-8k",
  "ernie-speed-128k",
  "hunyuan-lite",
  "hunyuan-standard-2025-02-10",
  "hunyuan-large-2025-02-10",
  "glm-3-130b",
  "glm-4-flash",
  "glm-4-long",
  "glm-4-airx",
  "glm-4-air",
  "glm-4-plus",
  "glm-4-alltools",
  "yi-vl-plus",
  "yi-large",
  "yi-large-turbo",
  "yi-large-rag",
  "yi-medium",
  "yi-34b-chat-200k",
  "spark-desk-v1.5",
  "step-2-16k-exp-202412",
  "granite-3.1-2b-instruct",
  "granite-3.1-8b-instruct",
  "solar-0-70b-16bit",
  "mistral-nemo-inferor-12b",
  "unslopnemo-12b",
  "rocinante-12b-v1.1",
  "rocinante-12b-v1",
  "sky-t1-32b-preview",
  "lfm-3b",
  "lfm-7b",
  "lfm-40b",
  "rogue-rose-103b-v0.2",
  "eva-llama-3.33-70b-v0.0",
  "eva-llama-3.33-70b-v0.1",
  "eva-qwen2.5-72b",
  "eva-qwen2.5-32b-v0.2",
  "sorcererlm-8x22b",
  "mythalion-13b",
  "zephyr-7b-beta",
  "zephyr-7b-alpha",
  "toppy-m-7b",
  "openhermes-2.5-mistral-7b",
  "l3-lunaris-8b",
  "llama-3.1-lumimaid-8b",
  "llama-3.1-lumimaid-70b",
  "llama-3-lumimaid-8b",
  "llama-3-lumimaid-70b",
  "llama3-openbiollm-70b",
  "l3.1-70b-hanami-x1",
  "magnum-v4-72b",
  "magnum-v2-72b",
  "magnum-72b",
  "mini-magnum-12b-v1.1",
  "remm-slerp-l2-13b",
  "midnight-rose-70b",
  "athene-v2-chat",
  "airoboros-l2-70b",
  "xwin-lm-70b",
  "noromaid-20b",
  "violet-twilight-v0.2",
  "saiga-nemo-12b",
  "l3-8b-stheno-v3.2",
  "llama-3.1-8b-lexi-uncensored-v2",
  "l3.3-70b-euryale-v2.3",
  "l3.3-ms-evayale-70b",
  "l31-70b-euryale-v2.2",
  "l3-70b-euryale-v2.1",
  "fimbulvetr-11b-v2",
  "goliath-120b"
];


module.exports = {
  data: new SlashCommandBuilder()
    .setName('AI')
    .setDescription('models like o1, deepssek, claude 3.7 and reasoning available, Ask any available AI a question')
    .setContexts([0, 2])
    .addStringOption(option =>
      option.setName('query')
        .setDescription('Your question for any of the AI default is gemini-1.5-flash-online')
        .setRequired(true)
    )
    .addStringOption(option =>
      option.setName('model')
        .setDescription('Select the AI model to use')
        .setAutocomplete(true)
    )
    .addBooleanOption(option =>
      option.setName('ephemeral')
        .setDescription('Should the reply be ephemeral?')
    )
    .addStringOption(option =>
      option.setName('instruction')
        .setDescription('Additional instructions for the AI')
    ),

  async execute(interaction) {
    const query = interaction.options.getString('query');
    const model = interaction.options.getString('model') || DEFAULT_MODEL;
    const ephemeral = interaction.options.getBoolean('ephemeral') ?? true;
    const instruction = interaction.options.getString('instruction') || '';

    // Custom waiting message
    await interaction.deferReply({ ephemeral });
    await interaction.editReply({ content: "🤔 *Thinking... Give me a moment to process your question...*" });

    try {
      const reply = await getReply(interaction.user.id, query, model, instruction);

      // Discord's max message length is 2000 characters
      if (reply.length > 2000) {
        const messages = [];
        for (let i = 0; i < reply.length; i += 2000) {
          messages.push(reply.substring(i, i + 2000));
        }

        // Send first chunk as main reply
        await interaction.editReply({ content: messages[0] });

        // Send remaining chunks as follow-ups
        for (let i = 1; i < messages.length; i++) {
          await interaction.followUp({ content: messages[i], ephemeral });
        }
      } else {
        await interaction.editReply({ content: reply });
      }
    } catch (error) {
      await interaction.editReply({ content: `❌ Error: ${error.message}` });
    }
  },

  async autocomplete(interaction) {
    const focusedValue = interaction.options.getFocused();
    const choices = models
      .filter(model => model.toLowerCase().includes(focusedValue.toLowerCase()))
      .slice(0, 25);

    await interaction.respond(
      choices.map(choice => ({ name: choice, value: choice }))
    );
  }
};