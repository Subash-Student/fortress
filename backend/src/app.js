require('dotenv').config();
const express = require('express');
const cors = require('cors');
const mongoose = require('mongoose');

const app = express();

app.use(cors());
app.use(express.json());

// Incoming request logging middleware
app.use((req, res, next) => {
  const start = Date.now();
  console.log(`[BACKEND REQUEST] [${new Date().toISOString()}] ${req.method} ${req.url}`);
  if (req.body && Object.keys(req.body).length > 0) {
    console.log(`[BACKEND REQUEST BODY]`, JSON.stringify(req.body, null, 2));
  }

  res.on('finish', () => {
    const duration = Date.now() - start;
    console.log(`[BACKEND RESPONSE] ${req.method} ${req.url} -> ${res.statusCode} (${duration}ms)`);
  });

  next();
});

const auth = require('./middleware/auth');

// Routes
app.use('/auth', require('./routes/auth'));
app.use('/vault', auth, require('./routes/vault'));
app.use('/links', auth, require('./routes/links'));
app.use('/expenses', auth, require('./routes/expenses'));
app.use('/bank-accounts', auth, require('./routes/bankAccounts'));

const crypto = require('crypto');
const User = require('./models/User');

app.get('/health', (_req, res) => res.json({ ok: true }));

function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.pbkdf2Sync(password, salt, 1000, 64, 'sha512').toString('hex');
  return `${salt}:${hash}`;
}

async function seedUser() {
  const count = await User.countDocuments({ username: 'Logan' });
  if (count === 0) {
    const passwordHash = hashPassword('fortress@1983');
    const newUser = new User({
      username: 'Logan',
      passwordHash,
    });
    await newUser.save();
    console.log('Seeded default user: Logan / fortress@1983');
  } else {
    console.log('User Logan already seeded.');
  }
}

async function start() {
  await mongoose.connect(process.env.MONGO_URI);
  console.log('MongoDB connected');

  // Seed default user profile
  await seedUser();

  const port = process.env.PORT ?? 3000;
  app.listen(port, () => console.log(`Vault backend running on :${port}`));
}

start().catch((err) => {
  console.error('Failed to start:', err);
  process.exit(1);
});

module.exports = app;
