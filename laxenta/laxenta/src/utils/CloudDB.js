const { MongoClient } = require("mongodb");
require("dotenv").config();

const uri = process.env.MONGO_URI;

let client;
let database;

async function connect() {
  if (!client || !database) {
    try {
      client = new MongoClient(uri); 
      await client.connect();
      database = client.db(); 
      console.log("Database connected successfully");
    } catch (error) {
      console.error("Database connection failed", error);
      throw error;
    }
  }
  return database;
}

async function getCollection(name) {
  const db = await connect();
  return db.collection(name);
}

module.exports = {
  connect,
  getCollection,
};
