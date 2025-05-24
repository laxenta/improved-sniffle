const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const moment = require('moment');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('whois')
    .setDescription('Get detailed information about a user')
    .addUserOption(option => 
      option.setName('target')
        .setDescription('The user to get info about')
        .setRequired(false)
    ),

  async execute(interaction) {
    const target = interaction.options.getUser('target') || interaction.user;
    const member = interaction.guild ? await interaction.guild.members.fetch(target.id).catch(() => null) : null;

    const embed = new EmbedBuilder()
      .setAuthor({ 
        name: target.tag || target.username, 
        iconURL: target.displayAvatarURL({ dynamic: true })
      })
      .setThumbnail(target.displayAvatarURL({ dynamic: true, size: 1024 }))
      .setColor(member?.displayColor || 0x2F3136)
      .addFields([
        {
          name: '📋 Account Info',
          value: [
            `**ID:** ${target.id}`,
            `**Created:** <t:${Math.floor(target.createdTimestamp / 1000)}:R>`,
            `**Bot:** ${target.bot ? 'Yes' : 'No'}`,
            member ? `**Joined Server:** <t:${Math.floor(member.joinedTimestamp / 1000)}:R>` : '',
          ].filter(Boolean).join('\n'),
          inline: false
        }
      ]);

    // Add roles if in a guild and user has roles
    if (member && member.roles.cache.size > 1) { // More than @everyone
      const roles = member.roles.cache
        .sort((a, b) => b.position - a.position)
        .filter(r => r.id !== interaction.guild.id) // Filter @everyone
        .map(r => r.toString());

      // Truncate roles if too many
      const truncatedRoles = roles.length > 15 
        ? roles.slice(0, 15).join(', ') + ` *(+${roles.length - 15} more)*`
        : roles.join(', ');

      if (truncatedRoles) {
        embed.addFields({
          name: `👥 Roles (${roles.length})`,
          value: truncatedRoles.substring(0, 1024), // Discord field value limit
          inline: false
        });
      }
    }

    // Add presence/activity if available
    if (member?.presence) {
      const status = {
        online: '🟢 Online',
        idle: '🟡 Idle',
        dnd: '🔴 Do Not Disturb',
        offline: '⚫ Offline'
      };

      const activities = member.presence.activities
        .filter(a => a.type !== 4) // Filter out custom status
        .map(activity => {
          let value = `${activity.type === 2 ? '🎵' : '🎮'} **${activity.name}**`;
          if (activity.details) value += `\n${activity.details}`;
          return value;
        })
        .slice(0, 2); // Limit to 2 activities

      if (activities.length > 0) {
        embed.addFields({
          name: '🎯 Activity',
          value: activities.join('\n').substring(0, 1024),
          inline: false
        });
      }

      embed.addFields({
        name: '📊 Status',
        value: status[member.presence.status] || '⚫ Offline',
        inline: true
      });
    }

    // Add acknowledgements if any
    const acknowledgements = [];
    if (member) {
      if (member.permissions.has('Administrator')) acknowledgements.push('Server Administrator');
      if (member.permissions.has('ManageGuild')) acknowledgements.push('Server Manager');
      if (member.permissions.has('ModerateMembers')) acknowledgements.push('Moderator');
    }

    if (acknowledgements.length > 0) {
      embed.addFields({
        name: '🏆 Acknowledgements',
        value: acknowledgements.join(', '),
        inline: false
      });
    }

    await interaction.reply({ embeds: [embed] });
  },
};