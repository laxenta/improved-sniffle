const { getServer, startServer, stopServer, restartServer, getLogs } = require("../utils/exaroton");
const { validatePass } = require("../utils/permissions");

module.exports = {
    name: "server",
    description: "Manage the game server",
    async execute(message, args) {
        if (!validatePass(args[1])) {
            return message.reply("❌ Invalid password. Access denied.");
        }

        const serverId = process.env.SERVER_ID;
        const server = await getServer(serverId);

        switch (args[0]) {
            case "start":
                return message.reply(await startServer(server));
            case "stop":
                return message.reply(await stopServer(server));
            case "restart":
                return message.reply(await restartServer(server));
            case "logs":
                const logs = await getLogs(server);
                return message.reply(`📝 Logs:\n\`\`\`${logs}\`\`\``);
            default:
                return message.reply("⚙️ Commands: start, stop, restart, logs");
        }
    },
};