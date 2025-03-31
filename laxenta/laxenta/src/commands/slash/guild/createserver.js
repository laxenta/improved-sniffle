const { SlashCommandBuilder, ChannelType } = require('discord.js');
const path = require('path');
const fs = require('fs');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('create-server')
    .setDescription('Creates a beautiful server using predefined templates (Server owners only).')
    .addStringOption(option => {
      // Load the JSON templates from the "./templates" folder.
      const templatesPath = path.join(__dirname, '../../../templates/templates.json');
      let templates = {};
      try {
        templates = require(templatesPath);
      } catch (err) {
        console.error('Error loading templates:', err);
      }
      const choices = Object.keys(templates).map(key => ({
        name: `${templates[key].name} (${key})`,
        value: key,
      }));
      return option
        .setName('template')
        .setDescription('Select a server template')
        .setRequired(true)
        .addChoices(...choices);
    }),
  async execute(interaction) {
    // Ensure the command is used in a guild.
    if (!interaction.guild) {
      return interaction.reply({ content: 'This command can only be used in a server.', ephemeral: true });
    }
    // Only allow the server owner to use this command.
    if (interaction.user.id !== interaction.guild.ownerId) {
      return interaction.reply({ content: 'Only the server owner can use this command.', ephemeral: true });
    }

    // Load the templates JSON.
    const templatesPath = path.join(__dirname, '../../../templates/templates.json');
    let templates;
    try {
      templates = require(templatesPath);
    } catch (err) {
      console.error('Error loading templates:', err);
      return interaction.reply({ content: 'Failed to load server templates.', ephemeral: true });
    }

    const selectedTemplateKey = interaction.options.getString('template');
    const template = templates[selectedTemplateKey];
    if (!template) {
      return interaction.reply({ content: 'Template not found.', ephemeral: true });
    }

    await interaction.reply({ content: 'Creating your server… please wait!', ephemeral: true });

    try {
      // Loop through each category defined in the template.
      for (const category of template.categories) {
        // Create the category channel.
        const createdCategory = await interaction.guild.channels.create({
          name: category.name,
          type: ChannelType.GuildCategory,
          reason: 'Server template creation',
        });

        // Create each child channel under the category.
        for (const channelData of category.channels) {
          let channelType;
          if (channelData.type === 'text') {
            channelType = ChannelType.GuildText;
          } else if (channelData.type === 'voice') {
            channelType = ChannelType.GuildVoice;
          } else {
            continue;
          }

          await interaction.guild.channels.create({
            name: channelData.name,
            type: channelType,
            parent: createdCategory.id,
            reason: 'Server template creation',
          });
        }
      }
      return interaction.editReply({ content: 'Server template created successfully!' });
    } catch (error) {
      console.error('Error creating server template:', error);
      return interaction.editReply({ content: 'There was an error creating the server template.' });
    }
  },
};