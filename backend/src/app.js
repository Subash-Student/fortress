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

const crypto = require('crypto');
const User = require('./models/User');

app.get('/health', (_req, res) => res.json({ ok: true }));

function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.pbkdf2Sync(password, salt, 1000, 64, 'sha512').toString('hex');
  return `${salt}:${hash}`;
}

const MASTER_TAGS = [
  "Alena Croft",
  "Alexa Payne",
  "Anal",
  "Armani Black",
  "Aubree Valentine",
  "Audrey Reid",
  "BBW",
  "Bhabhi",
  "Bharti Jha",
  "Bianka Blue",
  "Big Ass",
  "Bikini",
  "Blair Williams",
  "Blonde",
  "Blowjob",
  "Brazzers",
  "British",
  "Brookie Blair",
  "Busty",
  "Cam",
  "Carmela Clutch",
  "Charlie Forde",
  "Cheating",
  "Chloe Amour",
  "Chloe Surreal",
  "Claudia Valenzuela",
  "Codi Vore",
  "Cowgirl",
  "Creampie",
  "Curvy",
  "Dana DeArmond",
  "Darcia Lee",
  "Desi",
  "Devar",
  "Diamond Franco",
  "Dildo",
  "Doggystyle",
  "Double Penetration",
  "Elevator",
  "Ellie Nova",
  "Ember Snow",
  "Facial",
  "Fetish",
  "FreeUse",
  "Hairy",
  "Hardcore",
  "Hijab",
  "Homemade",
  "Hot Tub",
  "Indian",
  "Isabella Jules",
  "Japanese",
  "JAV",
  "Jessica Ryan",
  "Juliette Claire",
  "Kat Marie",
  "Katie Kush",
  "Kitchen",
  "Kourtney Love",
  "Krissy Lynn",
  "Latika Jha",
  "Latina",
  "Lauren Phillips",
  "Lila Lovely",
  "Lilith Grace",
  "Lindsay Lee",
  "Malayalam",
  "Maria Wars",
  "MILF",
  "MissAX",
  "Nanny",
  "Natural Breasts",
  "Outdoor",
  "Pixie Smalls",
  "PornBcn",
  "POV",
  "Pregnant",
  "PureTaboo",
  "RealityKings",
  "Redhead",
  "Reverse Cowgirl",
  "Rissa May",
  "River Fox",
  "Roleplay",
  "Rose Hart",
  "Sara Retali",
  "Scarlett Venom",
  "Seduction",
  "Sexmex",
  "Shilpa Sethi",
  "Shower",
  "Squirt",
  "Step Mother in Law",
  "Stepbrother",
  "Stepmom",
  "Stepsister",
  "Stepson",
  "Stripchat",
  "Taboo",
  "Tattooed",
  "Teacher",
  "Teen",
  "TeenFidelity",
  "Threesome",
  "Tit Wank",
  "Tushy",
  "Violet Myers",
  "Voyeur",
  "Web Series",
  "Yasmina Khan",
  "Yessma"
];

async function seedUser() {
  const count = await User.countDocuments({ username: 'Logan' });
  if (count === 0) {
    const passwordHash = hashPassword('fortress@1983');
    const newUser = new User({
      username: 'Logan',
      passwordHash,
      settings: { linkTags: MASTER_TAGS }
    });
    await newUser.save();
    console.log('Seeded default user: Logan / fortress@1983 with Master Tags');
  } else {
    // Ensure all master tags exist without overwriting custom user tags
    await User.updateOne({ username: 'Logan' }, { $addToSet: { 'settings.linkTags': { $each: MASTER_TAGS } } });
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
