// path: utils/economyUtil.js

const { MongoClient } = require('mongodb');

const uri = process.env.MONGO_URI;
if (!uri) {
  throw new Error("MONGO_URI not found in environment variables.");
}

const client = new MongoClient(uri, { useNewUrlParser: true, useUnifiedTopology: true });
let db = null;

// The default starting balance for new users.
const DEFAULT_BALANCE = 1000000;

/**
 * Connects to MongoDB and returns the database object.
 */
async function connectDB() {
  if (db) return db;
  try {
    await client.connect();
    db = client.db("botEconomy");
    console.log("Connected to MongoDB for economy management.");
    return db;
  } catch (error) {
    console.error("Error connecting to MongoDB:", error);
    throw error;
  }
}

/**
 * Retrieves the user document from the database.
 * If the user doesn't exist, creates one with a default balance.
 * @param {string} userId - The Discord user ID.
 * @returns {Promise<Object>} The user document.
 */
async function getUser(userId) {
  const database = await connectDB();
  const collection = database.collection("users");
  let user = await collection.findOne({ userId });
  if (!user) {
    user = { userId, balance: DEFAULT_BALANCE };
    await collection.insertOne(user);
  }
  return user;
}

/**
 * Returns the current balance of the user.
 * @param {string} userId - The Discord user ID.
 * @returns {Promise<number>} The user's balance.
 */
async function getBalance(userId) {
  const user = await getUser(userId);
  return user.balance;
}

/**
 * Updates the user's balance by a given amount.
 * If the user doesn't exist, it creates the document first.
 * Amount can be positive (to add money) or negative (to subtract money).
 * @param {string} userId - The Discord user ID.
 * @param {number} amount - The amount to change (can be negative).
 * @returns {Promise<number>} The updated balance.
 */
async function updateBalance(userId, amount) {
  // Ensure the user is registered.
  await getUser(userId);

  const database = await connectDB();
  const collection = database.collection("users");
  // Use findOneAndUpdate with upsert; in some versions, you may need to re-fetch if result.value is null.
  const result = await collection.findOneAndUpdate(
    { userId },
    { $inc: { balance: amount } },
    { returnDocument: "after", upsert: true }
  );

  // Fallback: if for any reason result.value is undefined, re-read the user document.
  if (!result.value) {
    const user = await getUser(userId);
    return user.balance;
  }
  return result.value.balance;
}

/**
 * Sets the user's balance to a specific value.
 * @param {string} userId - The Discord user ID.
 * @param {number} newBalance - The new balance to set.
 * @returns {Promise<number>} The updated balance.
 */
async function setBalance(userId, newBalance) {
  const database = await connectDB();
  const collection = database.collection("users");
  const result = await collection.findOneAndUpdate(
    { userId },
    { $set: { balance: newBalance } },
    { returnDocument: "after", upsert: true }
  );
  if (!result.value) {
    const user = await getUser(userId);
    return user.balance;
  }
  return result.value.balance;
}

module.exports = {
  connectDB,
  getUser,
  getBalance,
  updateBalance,
  setBalance,
};
