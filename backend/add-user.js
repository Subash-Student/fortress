#!/usr/bin/env node
/**
 * add-user.js — Create a new Fortress user
 * 
 * Usage:
 *   node add-user.js <username> <password>
 * 
 * Example:
 *   node add-user.js alice mySecretPass123
 */

require('dotenv').config();
const mongoose = require('mongoose');
const crypto = require('crypto');
const User = require('./src/models/User');

const MONGO_URI = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/fortressdb';

function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.pbkdf2Sync(password, salt, 1000, 64, 'sha512').toString('hex');
  return `${salt}:${hash}`;
}

async function main() {
  const [,, username, password] = process.argv;

  if (!username || !password) {
    console.error('\n  ❌  Usage: node add-user.js <username> <password>\n');
    process.exit(1);
  }

  console.log(`\n  🔐  Connecting to MongoDB...`);
  await mongoose.connect(MONGO_URI);

  const existing = await User.findOne({ username: username.trim() });
  if (existing) {
    console.error(`\n  ⚠️   User "${username}" already exists. Choose a different username.\n`);
    await mongoose.disconnect();
    process.exit(1);
  }

  const passwordHash = hashPassword(password);
  const user = await User.create({ username: username.trim(), passwordHash });

  console.log(`\n  ✅  User created successfully!`);
  console.log(`      Username : ${user.username}`);
  console.log(`      User ID  : ${user._id}`);
  console.log(`      Created  : ${user.createdAt.toLocaleString()}`);
  console.log(`\n  They can now log into Fortress with these credentials.\n`);

  await mongoose.disconnect();
}

main().catch((err) => {
  console.error('\n  ❌  Error:', err.message, '\n');
  process.exit(1);
});
