const {
    SlashCommandBuilder,
    PermissionsBitField,
    EmbedBuilder,
    MessageFlags,
} = require("discord.js");

module.exports = {
    data: new SlashCommandBuilder()
        .setName("echo")
        .setDescription("Repeats the input message and optionally sends it as an embed.")
        .setContexts(0, 1) // 0 = Guild, 1 = User, 2 = DM (Excluded)
        .addStringOption((option) =>
            option
                .setName("message")
                .setDescription("The message to echo.")
                .setRequired(true),
        )
        .addBooleanOption((option) =>
            option
                .setName("embed")
                .setDescription("Send the message as an embed.")
                .setRequired(false),
        )
        .addStringOption((option) =>
            option
                .setName("title")
                .setDescription("Title of the embed (optional)."),
        )
        .addStringOption((option) =>
            option
                .setName("footer")
                .setDescription("Footer text of the embed (optional)."),
        )
        .addStringOption((option) =>
            option
                .setName("thumbnail")
                .setDescription("URL of the thumbnail image for the embed (optional)."),
        ),

    async execute(interaction) {
        // Defer the reply to ensure a response can be sent later
        await interaction.deferReply({ flags: MessageFlags.Ephemeral });

        // Check required permissions
        const requiredPermissions = [
            PermissionsBitField.Flags.Administrator |
            PermissionsBitField.Flags.ManageChannels |
            PermissionsBitField.Flags.ManageGuild
        ];

        if (!interaction.member.permissions.has(requiredPermissions)) {
            return interaction.followUp({
                content: "You need **Administrator**, **Manage Channels**, or **Manage Server** permission to use this command!",
                flags: MessageFlags.Ephemeral,
            });
        }

        // Retrieve command options
        const message = interaction.options.getString("message");
        const sendAsEmbed = interaction.options.getBoolean("embed") || false;
        const title = interaction.options.getString("title") || `${interaction.guild.name}`;
        const footer = interaction.options.getString("footer") || "Ayumi — echo 🌐✨";
        const thumbnail = interaction.options.getString("thumbnail");

        // Prepare the response
        let echoResponse;
        if (sendAsEmbed) {
            const embed = new EmbedBuilder()
                .setTitle(title)
                .setDescription(message)
                .setFooter({ text: footer })
                .setColor(`#${(Math.floor(Math.random() * 80) + 50).toString(16).padStart(2, '0')}${(Math.random() < 0.7 ? (Math.floor(Math.random() * 30) + 10) : (Math.floor(Math.random() * 80) + 50)).toString(16).padStart(2, '0')}${(Math.floor(Math.random() * 120) + 80).toString(16).padStart(2, '0')}`)

            if (thumbnail) {
                embed.setThumbnail(thumbnail);
            }

            echoResponse = { embeds: [embed] };
        } else {
            echoResponse = { content: message };
        }

        // Send the message in the channel
        try {
            await interaction.channel.send(echoResponse);
            await interaction.followUp({ content: "Message sent successfully!", flags: MessageFlags.Ephemeral });
        } catch (error) {
            console.error("Failed to send the message:", error);
            await interaction.followUp({
                content: "An error occurred while sending the message. Please try again later.",
                flags: MessageFlags.Ephemeral,
            });
        }
    },
};