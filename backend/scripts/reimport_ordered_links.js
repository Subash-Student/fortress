require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const fs = require('fs');
const path = require('path');
const axios = require('axios');
const cheerio = require('cheerio');
const CryptoJS = require('crypto-js');
const mongoose = require('mongoose');

const User = require('../src/models/User');
const Link = require('../src/models/Link');

const USERNAME = process.env.VAULT_USER || 'Logan';
const PASSWORD = process.env.VAULT_PASS || 'fortress@1983';

function deriveKey(password, username) {
  return CryptoJS.PBKDF2(password, username.toLowerCase(), {
    keySize: 256 / 32,
    iterations: 1000,
  }).toString(CryptoJS.enc.Hex);
}

function encrypt(plaintext, keyHex) {
  if (!plaintext) plaintext = '';
  const iv = CryptoJS.lib.WordArray.random(16);
  const keyWords = CryptoJS.enc.Hex.parse(keyHex);

  const encrypted = CryptoJS.AES.encrypt(plaintext, keyWords, {
    iv,
    mode: CryptoJS.mode.CBC,
    padding: CryptoJS.pad.Pkcs7,
  });

  return {
    ciphertext: encrypted.ciphertext.toString(CryptoJS.enc.Base64),
    iv: iv.toString(CryptoJS.enc.Hex),
  };
}

async function fetchMetadata(url) {
  let title = '';
  let thumbnail = '';

  const ytMatch = url.match(/(?:youtube\.com\/(?:[^\/]+\/.+\/|(?:v|e(?:mbed)?)\/|.*[?&]v=)|youtu\.be\/)([^"&?\/\s]{11})/i);
  if (ytMatch && ytMatch[1]) {
    thumbnail = `https://img.youtube.com/vi/${ytMatch[1]}/maxresdefault.jpg`;
  }

  try {
    const response = await axios.get(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36 facebookexternalhit/1.1'
      },
      timeout: 4000,
      maxRedirects: 5,
    });
    const $ = cheerio.load(response.data);
    title = $('meta[property="og:title"]').attr('content') ||
            $('meta[name="twitter:title"]').attr('content') ||
            $('title').text() || '';
    if (!thumbnail) {
      thumbnail = $('meta[property="og:image"]').attr('content') ||
                  $('meta[name="twitter:image"]').attr('content') || '';
    }
  } catch (e) {
    try {
      const res = await axios.get('https://api.microlink.io', {
        params: { url },
        timeout: 4000,
      });
      const data = res.data?.data || {};
      if (!title) title = data.title || '';
      if (!thumbnail) thumbnail = data.image?.url || data.logo?.url || '';
    } catch (_) {}
  }

  title = title.replace(/\s*[\-\|]\s*(Eporner|Pornhub|XVIDEOS|xHamster|SpankBang|HQPorner|DefineBabe|FPO|Pornhat).*$/i, '').trim();

  if (!title || title.length < 4 || /just a moment|access denied|robot check/i.test(title)) {
    title = parseTitleFromUrl(url);
  }

  return { title, thumbnail };
}

function parseTitleFromUrl(rawUrl) {
  try {
    const u = new URL(rawUrl);
    const pathname = u.pathname;
    const parts = pathname.split('/').filter(Boolean);
    let slug = parts[parts.length - 1] || '';
    
    slug = slug.replace(/\.html?$/i, '')
               .replace(/-(?:xh|f89|f61|e2b)[a-zA-Z0-9]+$/i, '')
               .replace(/^(?:video-|v-)/i, '')
               .replace(/_[0-9]+$/i, '')
               .replace(/^[0-9]+-/i, '');

    const words = slug.split(/[\-_\s]+/)
                      .filter(w => w.length > 0 && !/^[0-9a-f]{10,}$/i.test(w))
                      .map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase());
    
    if (words.length > 0) {
      return words.join(' ');
    }
  } catch (_) {}
  return 'Saved Private Link';
}

function generateTags(url, title) {
  const tags = new Set();
  const text = `${url} ${title}`.toLowerCase();

  if (/desi|indian|bhabhi|devar|malayalam|yessma|bangali|hindi|amateur/.test(text)) {
    tags.add('Desi');
    if (/bhabhi|devar/.test(text)) tags.add('Bhabhi');
  }

  if (/stepmom|madrastra|stepson|step-son|step-mother|mother|mom/.test(text)) {
    tags.add('Taboo');
    tags.add('Stepmom');
  } else if (/stepsister|sister|stepbrother|brother|devar/.test(text)) {
    tags.add('Taboo');
    tags.add('Stepsister');
  } else if (/family|vacation/.test(text)) {
    tags.add('Taboo');
  }

  if (/stripchat|cam|ticket|shower|live/.test(text)) {
    tags.add('Cam');
    if (/stripchat/.test(text)) tags.add('Stripchat');
  }

  if (/brazzers/.test(text)) tags.add('Brazzers');
  if (/pure-taboo|puretaboo|pure taboo/.test(text)) tags.add('PureTaboo');
  if (/reality-kings|realitykings/.test(text)) tags.add('RealityKings');
  if (/teenfidelity/.test(text)) tags.add('TeenFidelity');
  if (/tushy/.test(text)) tags.add('Tushy');

  if (/milf|milfy|mature|mom/.test(text)) tags.add('MILF');
  if (/latina|spanish/.test(text)) tags.add('Latina');
  if (/bbw|chubby|fatty/.test(text)) tags.add('BBW');
  if (/blonde/.test(text)) tags.add('Blonde');
  if (/redhead/.test(text)) tags.add('Redhead');
  if (/anal/.test(text)) tags.add('Anal');
  if (/pov/.test(text)) tags.add('POV');
  if (/roleplay/.test(text)) tags.add('Roleplay');
  if (/threesome|3p|4p/.test(text)) tags.add('Threesome');
  if (/creampie/.test(text)) tags.add('Creampie');
  if (/blowjob|deepthroat/.test(text)) tags.add('Blowjob');

  if (tags.size === 0) {
    tags.add('Video');
  }

  return Array.from(tags);
}

async function startOrderedImport() {
  console.log('====================================================');
  console.log('🔄 FORTRESS ORDERED LINK RE-IMPORT SCRIPT');
  console.log('====================================================');

  await mongoose.connect(process.env.MONGO_URI);
  console.log('✅ MongoDB Connected.');

  const user = await User.findOne({ username: new RegExp(`^${USERNAME}$`, 'i') });
  if (!user) {
    console.error(`User ${USERNAME} not found.`);
    process.exit(1);
  }

  const vaultKey = deriveKey(PASSWORD, USERNAME);

  // 1. Delete previous imported links to ensure exact ordering
  const deleteRes = await Link.deleteMany({ userId: user._id });
  console.log(`🗑️ Cleared ${deleteRes.deletedCount} existing links for exact ordering.\n`);

  // 2. Read links.md
  const filePath = path.join(__dirname, '../../links.md');
  const rawContent = fs.readFileSync(filePath, 'utf8');
  const cleanContent = rawContent.replace(/[\u200B-\u200D\uFEFF]/g, '');
  const lines = cleanContent.split('\n')
                             .map(l => l.trim())
                             .filter(l => l.startsWith('http'));

  console.log(`📋 Re-importing ${lines.length} links with strictly ordered timestamps:\n` +
              `   - Link #1 (Line 1): Oldest timestamp (bottom of feed)\n` +
              `   - Link #${lines.length} (Line ${lines.length}): Newest timestamp (top of feed)\n`);

  const now = Date.now();
  const allNewTags = new Set();
  let successCount = 0;

  for (let i = 0; i < lines.length; i++) {
    const rawUrl = lines[i];
    
    // Sequential timestamp: Line 1 = now - 116 seconds, Line 116 = now
    const createdAt = new Date(now - (lines.length - i) * 1000);

    try {
      const { title, thumbnail } = await fetchMetadata(rawUrl);
      const tags = generateTags(rawUrl, title);
      tags.forEach(t => allNewTags.add(t));

      const encryptedUrl = encrypt(rawUrl, vaultKey);
      const encryptedTitle = encrypt(title, vaultKey);
      const encryptedThumbnail = encrypt(thumbnail, vaultKey);

      const newLink = new Link({
        userId: user._id,
        url: encryptedUrl,
        title: encryptedTitle,
        thumbnail: encryptedThumbnail,
        tags,
        isFavorite: false,
        isHidden: true,
        createdAt,
        updatedAt: createdAt,
      });

      await newLink.save();
      console.log(`[${i + 1}/${lines.length}] ✅ Saved (${createdAt.toISOString().slice(11, 19)}): "${title}"`);
      successCount++;
    } catch (err) {
      console.error(`[${i + 1}/${lines.length}] ❌ Error:`, err.message);
    }
  }

  // Sync user tags catalog
  user.settings = user.settings || {};
  user.settings.linkTags = Array.from(allNewTags);
  await user.save();

  console.log('\n====================================================');
  console.log(`🎉 RE-IMPORT COMPLETE!`);
  console.log(`   Successfully ordered ${successCount} links from oldest (#1) to newest (#${lines.length}).`);
  console.log('====================================================');

  await mongoose.disconnect();
  process.exit(0);
}

startOrderedImport();
