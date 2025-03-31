const { 
  SlashCommandBuilder, 
  EmbedBuilder, 
  StringSelectMenuBuilder, 
  ActionRowBuilder, 
  ButtonBuilder,
  ChannelType, 
  InteractionContextType, 
  ButtonStyle 
} = require("discord.js");
const fs = require("fs");
const path = require("path");
const { registerButton } = require("../../../handlers/buttonHandler.js");
const { v4: uuidv4 } = require("uuid");

const helpState = {};

// Helper functions
async function deferSafe(interaction) {
  if (!interaction.deferred && !interaction.replied) {
    await interaction.deferUpdate().catch(() => {
      console.warn("Interaction already deferred or expired.");
    });
  }
}

async function editSafe(interaction, options) {
  try {
    await interaction.editReply(options);
  } catch (error) {
    console.warn("Failed to edit interaction reply. It may have expired or already been handled.");
  }
}

function getCategoryDropdown(dropdownOptions, page, categoriesPerPage = 25) {
  const options = dropdownOptions.slice(page * categoriesPerPage, (page + 1) * categoriesPerPage);
  const select = new StringSelectMenuBuilder()
    .setCustomId("help-category-select")
    .setPlaceholder("Select a category...")
    .addOptions(options);
  return new ActionRowBuilder().addComponents(select);
}

function getCategoryCommandEmbed(categoryName, cmds, commandPage, commandsPerPage, client) {
  const totalPages = Math.ceil(cmds.length / commandsPerPage) || 1;
  const embed = new EmbedBuilder()
    .setColor("#0099ff")
    .setTitle(`Help - ${categoryName.charAt(0).toUpperCase() + categoryName.slice(1)} Commands`)
    .setTimestamp()
    // Footer points to prefix help (adjust as needed)
    .setFooter({ text: `Page ${commandPage + 1} of ${totalPages} • do !help to view prefix cmds`, iconURL: client.user.displayAvatarURL() });
  
  const pageCommands = cmds.slice(commandPage * commandsPerPage, (commandPage + 1) * commandsPerPage);
  for (const cmd of pageCommands) {
    embed.addFields({ name: `**${cmd.name}**`, value: cmd.description, inline: false });
  }
  return embed;
}

async function createCommandPaginationRow(messageId, commandPage, totalPages, userId) {
  const components = [];
  
  if (commandPage > 0) {
    const prevId = `help-${messageId}-prev-${commandPage}`;
    await registerButton(
      prevId,
      [userId],
      async (interaction) => {
        await deferSafe(interaction);
        const state = helpState[messageId];
        if (!state) return;
        
        state.commandPage--;
        const cmds = state.categories[state.currentCategory];
        const newTotalPages = Math.ceil(cmds.length / state.commandsPerPage) || 1;
        const commandEmbed = getCategoryCommandEmbed(
          state.currentCategory,
          cmds,
          state.commandPage,
          state.commandsPerPage,
          interaction.client
        );
        const newRow = await createCommandPaginationRow(messageId, state.commandPage, newTotalPages, userId);
        
        await editSafe(interaction, {
          embeds: [commandEmbed],
          components: newRow ? [newRow] : []
        });
      },
      { type: 'custom' }
    );
    
    components.push(
      new ButtonBuilder()
        .setCustomId(prevId)
        .setLabel("Previous")
        .setStyle(ButtonStyle.Primary)
    );
  }
  
  if (commandPage < totalPages - 1) {
    const nextId = `help-${messageId}-next-${commandPage}`;
    await registerButton(
      nextId,
      [userId],
      async (interaction) => {
        await deferSafe(interaction);
        const state = helpState[messageId];
        if (!state) return;
        
        state.commandPage++;
        const cmds = state.categories[state.currentCategory];
        const newTotalPages = Math.ceil(cmds.length / state.commandsPerPage) || 1;
        const commandEmbed = getCategoryCommandEmbed(
          state.currentCategory,
          cmds,
          state.commandPage,
          state.commandsPerPage,
          interaction.client
        );
        const newRow = await createCommandPaginationRow(messageId, state.commandPage, newTotalPages, userId);
        
        await editSafe(interaction, {
          embeds: [commandEmbed],
          components: newRow ? [newRow] : []
        });
      },
      { type: 'custom' }
    );
    
    components.push(
      new ButtonBuilder()
        .setCustomId(nextId)
        .setLabel("Next")
        .setStyle(ButtonStyle.Primary)
    );
  }
  
  const backId = `help-${messageId}-back`;
  await registerButton(
    backId,
    [userId],
    async (interaction) => {
      await deferSafe(interaction);
      const state = helpState[messageId];
      if (!state) return;
      
      state.currentCategory = null;
      state.commandPage = 0;
      
      const mainEmbed = new EmbedBuilder()
        .setColor("#0099ff")
        .setTitle("Help Menu")
        .setDescription("Select a category from the dropdown to view its commands.")
        .setTimestamp()
        .setFooter({ text: "do !help to view prefix cmds", iconURL: interaction.client.user.displayAvatarURL() });
        
      const dropdownRow = getCategoryDropdown(state.dropdownOptions, 0);
      
      await editSafe(interaction, {
        embeds: [mainEmbed],
        components: [dropdownRow]
      });
    },
    { type: 'custom' }
  );
  
  components.push(
    new ButtonBuilder()
      .setCustomId(backId)
      .setLabel("Back")
      .setStyle(ButtonStyle.Secondary)
  );
  
  return components.length > 0 ? new ActionRowBuilder().addComponents(components) : null;
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName("help")
    .setContexts([0, 2])
    .setDescription("Lists all available slash commands by category."),
  cooldown: 30,
  async execute(interaction) {
    try {
      // Define the slash commands folder path.
      const slashFolderPath = path.join(__dirname, "../../slash");
      // Get all subdirectories (each representing a category).
      const commandFolders = fs.readdirSync(slashFolderPath).filter(file =>
        fs.statSync(path.join(slashFolderPath, file)).isDirectory()
      );
      
      // Build the categories object by loading each command file.
      const categories = {};
      for (const folder of commandFolders) {
        const commandFiles = fs
          .readdirSync(path.join(slashFolderPath, folder))
          .filter((file) => file.endsWith(".js"));
        const cmds = commandFiles
          .map((file) => {
            try {
              const command = require(path.join(slashFolderPath, folder, file));
              // Expecting command.data.name and command.data.description to be defined.
              return { 
                name: `/${command.data.name}`, 
                description: command.data.description || "No description provided" 
              };
            } catch (error) {
              console.error(`Error loading command file ${file} in folder ${folder}:`, error);
              return null;
            }
          })
          .filter((cmd) => cmd && cmd.name && cmd.description);
        if (cmds.length) categories[folder] = cmds;
      }

      // Build dropdown options from category names.
      const dropdownOptions = Object.keys(categories).map((cat) => ({
        label: cat.charAt(0).toUpperCase() + cat.slice(1),
        description: `View commands in the ${cat} category.`,
        value: cat,
      }));

      if (dropdownOptions.length === 0) {
        return interaction.reply({ content: "No commands available.", ephemeral: true });
      }

      const mainEmbed = new EmbedBuilder()
        .setColor("#0099ff")
        .setTitle("Slash Commands Help Menu")
        .setDescription("Select a category from the dropdown to view its commands.")
        .setTimestamp()
        .setFooter({ text: "do !help to view prefix cmds", iconURL: interaction.client.user.displayAvatarURL() });

      const dropdownRow = getCategoryDropdown(dropdownOptions, 0);

      // Send the initial reply with the embed and dropdown.
      await interaction.reply({
        embeds: [mainEmbed],
        components: [dropdownRow]
      });
      const replyMsg = await interaction.fetchReply();

      helpState[replyMsg.id] = {
        currentCategory: null,
        commandPage: 0,
        categories,
        dropdownOptions,
        commandsPerPage: 20
      };

      const collector = replyMsg.createMessageComponentCollector({ time: 300000 });

      collector.on("collect", async (i) => {
        // Ensure only the command invoker can interact.
        if (i.user.id !== interaction.user.id) {
          return i.reply({ content: "You cannot use this.", ephemeral: true });
        }

        if (i.isStringSelectMenu() && i.customId === "help-category-select") {
          const state = helpState[replyMsg.id];
          const chosenCategory = i.values[0];
          state.currentCategory = chosenCategory;
          state.commandPage = 0;
          
          const cmds = state.categories[chosenCategory];
          const totalPages = Math.ceil(cmds.length / state.commandsPerPage) || 1;
          const commandEmbed = getCategoryCommandEmbed(
            chosenCategory,
            cmds,
            state.commandPage,
            state.commandsPerPage,
            interaction.client
          );
          
          const paginationRow = await createCommandPaginationRow(
            replyMsg.id,
            state.commandPage,
            totalPages,
            interaction.user.id
          );
          
          await i.update({
            embeds: [commandEmbed],
            components: paginationRow ? [paginationRow] : []
          });
        }
      });

      collector.on("end", async () => {
        try {
          await replyMsg.edit({ components: [] });
          delete helpState[replyMsg.id];
        } catch (e) {
          console.error("Error editing reply on collector end:", e);
        }
      });
    } catch (error) {
      console.error("Error executing slash help command:", error);
      if (!interaction.deferred) {
        await interaction.reply({ content: "Something went wrong while executing the help command.", ephemeral: true });
      } else {
        await interaction.editReply({ content: "Something went wrong while executing the help command." });
      }
    }
  }
};