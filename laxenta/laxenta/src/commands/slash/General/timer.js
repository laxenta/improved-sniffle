const {
    SlashCommandBuilder,
    EmbedBuilder,
    MessageFlags,
} = require('discord.js');
const mongoose = require('mongoose');

// Timer Schema
const TimerSchema = new mongoose.Schema({
    userId: String,
    guildId: String,
    channelId: String,
    endTime: Date,
    duration: Number,
    reason: String,
    messageId: String
});

const Timer = mongoose.model('Timer', TimerSchema);

// Format time helper
const formatTime = (ms) => {
    const seconds = Math.floor((ms / 1000) % 60);
    const minutes = Math.floor((ms / (1000 * 60)) % 60);
    const hours = Math.floor((ms / (1000 * 60 * 60)) % 24);
    const days = Math.floor(ms / (1000 * 60 * 60 * 24));

    const parts = [];
    if (days > 0) parts.push(`${days}d`);
    if (hours > 0) parts.push(`${hours}h`);
    if (minutes > 0) parts.push(`${minutes}m`);
    if (seconds > 0) parts.push(`${seconds}s`);

    return parts.join(' ') || '0s';
};

module.exports = {
    data: new SlashCommandBuilder()
        .setName('timer')
        .setDescription('Set a timer with custom duration')
        //.setDMPermission(true)
        .setIntegrationTypes(0, 1)
        .setContexts(0, 1, 2)
        .addNumberOption((option) =>
            option.setName('duration')
                .setDescription('The duration of the timer')
                .setRequired(true)
                .setMinValue(1)
        )
        .addStringOption((option) =>
            option.setName('unit')
                .setDescription('Time unit for the duration')
                .setRequired(true)
                .addChoices(
                    { name: '⏱️ Minutes', value: 'minutes' },
                    { name: '⏰ Hours', value: 'hours' },
                    { name: '📅 Days', value: 'days' },
                    { name: '📆 Months', value: 'months' }
                )
        )
        .addStringOption((option) =>
            option.setName('reason')
                .setDescription('Why are you setting this timer?')
                .setMaxLength(100)
        ),

    async execute(interaction) {
        await interaction.deferReply();

        const duration = interaction.options.getNumber('duration');
        const unit = interaction.options.getString('unit');
        const reason = interaction.options.getString('reason') || 'No reason provided';

        // Calculate duration in ms
        const timeUnits = {
            'minutes': 60 * 1000,
            'hours': 60 * 60 * 1000,
            'days': 24 * 60 * 60 * 1000,
            'months': 30 * 24 * 60 * 60 * 1000
        };

        const ms = duration * timeUnits[unit];
        const maxDuration = 3 * timeUnits['months'];

        // Validate duration
        if (ms > maxDuration) {
            const errorEmbed = new EmbedBuilder()
                .setColor('#ff0000')
                .setTitle('<a:e:1327965196265721916> Invalid Duration')
                .setDescription('Timer cannot exceed 3 months! <a:e:1327982490144735253>')
                .setTimestamp();

            return interaction.editReply({ 
                embeds: [errorEmbed],
                flags: MessageFlags.Ephemeral 
            });
        }

        const endTime = new Date(Date.now() + ms);
        const discordTimestamp = Math.floor(endTime.getTime() / 1000);

        // Create timer document
        const timer = new Timer({
            userId: interaction.user.id,
            guildId: interaction.guildId,
            channelId: interaction.channelId,
            endTime: endTime,
            duration: ms,
            reason: reason
        });

        try {
            await timer.save();

            // Create response embed with Discord timestamps
            const embed = new EmbedBuilder()
                .setColor('#00ff00')
                .setTitle('<a:e:1325374132182847528> Timer Set Successfully!')
                .setDescription(`Your timer will end <t:${discordTimestamp}:R> (<t:${discordTimestamp}:F>)`)
                .addFields(
                    { name: '<a:e:1326464189673508915> Duration', value: formatTime(ms), inline: true },
                    { name: '<a:e:1327982490144735253> Reason', value: reason, inline: true }
                )
                .setFooter({ 
                    text: `Created by ${interaction.user.tag}`,
                    iconURL: interaction.user.displayAvatarURL()
                })
                .setTimestamp();

            const reply = await interaction.editReply({ 
                embeds: [embed]
            });

            timer.messageId = reply.id;
            await timer.save();

            // Set expiration handler
            setTimeout(async () => {
                try {
                    const expiredTimer = await Timer.findById(timer._id);
                    if (!expiredTimer) return;

                    const expirationEmbed = new EmbedBuilder()
                        .setColor('#ffd700')
                        .setTitle('<a:e:1327982490144735253> Timer Expired!')
                        .setDescription(`Your timer for: ${reason}`)
                        .setFooter({ 
                            text: `Set by ${interaction.user.tag}`,
                            iconURL: interaction.user.displayAvatarURL()
                        })
                        .setTimestamp();

                    await interaction.channel.send({
                        content: `<a:e:1327965196265721916> <@${interaction.user.id}>, your timer has expired!`,
                        embeds: [expirationEmbed]
                    });

                    await Timer.findByIdAndDelete(timer._id);
                } catch (error) {
                    console.error('Timer expiration error:', error);
                }
            }, ms);

        } catch (error) {
            console.error('Timer creation error:', error);
            return interaction.editReply({
                embeds: [
                    new EmbedBuilder()
                        .setColor('#ff0000')
                        .setTitle('<a:e:1327965196265721916> Error')
                        .setDescription('Failed to create timer. Please try again.')
                        .setTimestamp()
                ],
                flags: MessageFlags.Ephemeral
            });
        }
    }
};