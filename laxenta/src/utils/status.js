const updateBotStatus = async (client, server) => {
    const status = server.hasStatus(server.STATUS.ONLINE) ? "Online" : "Offline";
    const players = await server.getPlayerList("whitelist");
    client.user.setActivity(`🌐 ${server.name}: ${status} | Players: ${players.length}`, { type: "WATCHING" });
};

module.exports = { updateBotStatus };
