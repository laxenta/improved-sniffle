const fs = require("fs");
const path = require("path");

const storagePath = path.join(__dirname, "verification_storage.json");

let storage = {};
if (fs.existsSync(storagePath)) {
  storage = JSON.parse(fs.readFileSync(storagePath, "utf-8"));
}

function saveStorage() {
  fs.writeFileSync(storagePath, JSON.stringify(storage, null, 2));
}

function getGuildData(guildId) {
  if (!storage[guildId]) {
    storage[guildId] = {
      verificationEnabled: false,
      accessChannelId: null, // Store the ID of the access-server channel :>
    };
  }
  return storage[guildId];
}

function setGuildData(guildId, data) {
  storage[guildId] = { ...storage[guildId], ...data };
  saveStorage();
}

module.exports = { getGuildData, setGuildData };
