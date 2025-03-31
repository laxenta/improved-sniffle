const { Client } = require('exaroton');
require('dotenv').config();

const client = new Client(process.env.EXAROTON_TOKEN);

const getServer = async (serverId) => {
    const server = client.server(serverId);
    await server.get(); // Fetch latest data
    return server;
};

const getStatus = async (server) => {
    await server.get();
    return server.status;
};

const startServer = async (server) => {
    try {
        await server.start();
        return "Server is starting...";
    } catch (e) {
        throw new Error("Failed to start the server: " + e.message);
    }
};

const stopServer = async (server) => {
    try {
        await server.stop();
        return "Server is stopping...";
    } catch (e) {
        throw new Error("Failed to stop the server: " + e.message);
    }
};

const restartServer = async (server) => {
    try {
        await server.restart();
        return "Server is restarting...";
    } catch (e) {
        throw new Error("Failed to restart the server: " + e.message);
    }
};

const getLogs = async (server) => {
    try {
        return await server.getLogs();
    } catch (e) {
        throw new Error("Failed to retrieve logs: " + e.message);
    }
};

const addToList = async (server, listName, players) => {
    const list = server.getPlayerList(listName);
    await list.addEntries(players);
    return `Added to ${listName}: ${players.join(", ")}`;
};

const removeFromList = async (server, listName, players) => {
    const list = server.getPlayerList(listName);
    await list.deleteEntries(players);
    return `Removed from ${listName}: ${players.join(", ")}`;
};

const setRAM = async (server, ramAmount) => {
    try {
        await server.setRAM(ramAmount);
        return `Server RAM set to ${ramAmount} GB.`;
    } catch (e) {
        throw new Error("Failed to set RAM: " + e.message);
    }
};

const executeCommand = async (server, command) => {
    try {
        await server.executeCommand(command);
        return `Executed command: ${command}`;
    } catch (e) {
        throw new Error("Failed to execute command: " + e.message);
    }
};

const subscribeToStatus = (server, onUpdate) => {
    server.subscribe();
    server.on("status", (server) => onUpdate(server.status));
};

const unsubscribeFromStatus = (server) => {
    server.unsubscribe("status");
    return "Unsubscribed from server status updates.";
};

module.exports = {
    getServer,
    getStatus,
    startServer,
    stopServer,
    restartServer,
    getLogs,
    addToList,
    removeFromList,
    setRAM,
    executeCommand,
    subscribeToStatus,
    unsubscribeFromStatus,
};