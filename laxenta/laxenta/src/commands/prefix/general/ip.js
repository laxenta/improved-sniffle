const { getServer } = require('../../../utils/exaroton');

module.exports = {
    name: 'ip',
    description: 'Fetch server status and real-time metrics using Exaroton API',
    async execute(message) {
        try {
            // Fetch Exaroton server details
            const server = await getServer(process.env.SERVER_ID);

            // Extract server details from the Exaroton API response
            const serverAddress = server.address || 'N/A';
            const motd = server.motd || 'N/A';
            const software = server.software?.name || 'Unknown';
            const version = server.software?.version || 'N/A';
            const playersOnline = server.players?.count || 0;
            const playersMax = server.players?.max || 'N/A';
            const playerList =
                server.players?.list && server.players.list.length > 0
                    ? server.players.list.join(', ')
                    : 'No players online';

            // Get additional metrics from Exaroton API
            const ram = await server.getRAM();
            const tickTime = server.averageTickTime || "Unavailable";

            // Determine server status from Exaroton's status code
            const statusText = getStatusText(server.status);

            // Construct the final status message with emojis
            let messageContent = `<a:mc:1327965192004304896> **Server IP:** ${serverAddress}:32915\n`;
            messageContent += `<a:mc:1327965179157286973> **Version:** ${version}\n`;
            messageContent += `<a:mc:1327965161050603602> **MOTD:** ${motd}\n`;
            messageContent += `<a:mc:1327965167455305780> **Software:** ${software}\n`;
            messageContent += `<a:server:1327965174535159848> **Status:** ${statusText}\n`;
            messageContent += `<a:mc:1327965151781064715> **Players:** ${playersOnline}/${playersMax}\n`;
            messageContent += `<a:mc:1327965151781064715> **Player List:** ${playerList}\n\n`;
            messageContent += `<a:uwu:1310498104826396712> **Real-Time Metrics:**\n`;
            messageContent += `<a:uwu:1310498098107387974> **RAM:** ${ram} GB\n`;
            messageContent += `<a:uwu:1310498088724729876> **Tick Time:** ${tickTime}ms`;

            await message.channel.send(messageContent);
        } catch (error) {
            console.error('Error fetching server status or metrics:', error);
            await message.channel.send('There was an error fetching the server status or metrics. Please try again later.');
        }
    },
};

// Helper function to convert Exaroton status codes to text
function getStatusText(statusCode) {
    switch (statusCode) {
        case 0: return 'Offline';
        case 1: return 'Online';
        case 2: return 'Preparing';
        case 3: return 'Starting';
        case 4: return 'Saving';
        case 5: return 'Stopping';
        case 6: return 'Restarting';
        case 7: return 'Queued';
        case 8: return 'Loading';
        case 10: return 'Crashed';
        default: return 'Unknown';
    }
}