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

// Key derivation (matches frontend deriveKey)
function deriveKey(password, username) {
  return CryptoJS.PBKDF2(password, username.toLowerCase(), {
    keySize: 256 / 32,
    iterations: 1000,
  }).toString(CryptoJS.enc.Hex);
}

// AES-256-CBC Encryption (matches frontend encrypt)
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

// Metadata Preview Scraper
async function fetchMetadata(url) {
  let title = '';
  let thumbnail = '';

  // Quick regex shortcut for YouTube
  const ytMatch = url.match(/(?:youtube\.com\/(?:[^\/]+\/.+\/|(?:v|e(?:mbed)?)\/|.*[?&]v=)|youtu\.be\/)([^"&?\/\s]{11})/i);
  if (ytMatch && ytMatch[1]) {
    thumbnail = `https://img.youtube.com/vi/${ytMatch[1]}/maxresdefault.jpg`;
  }

  // Tier 1: Direct scrape
  try {
    const response = await axios.get(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36 facebookexternalhit/1.1'
      },
      timeout: 5000,
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
    // Tier 2: Microlink cloud fallback
    try {
      const res = await axios.get('https://api.microlink.io', {
        params: { url },
        timeout: 5000,
      });
      const data = res.data?.data || {};
      if (!title) title = data.title || '';
      if (!thumbnail) thumbnail = data.image?.url || data.logo?.url || '';
    } catch (_) {}
  }

  // Clean title string
  title = title.replace(/\s*[\-\|]\s*(Eporner|Pornhub|XVIDEOS|xHamster|SpankBang|HQPorner|DefineBabe|FPO|Pornhat).*$/i, '').trim();

  // Fallback to URL path parsing if metadata title is generic/missing
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
    
    // Clean extensions and hex hashes
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

// Intelligent Reusable Tag Generator
function generateTags(url, title) {
  const tags = new Set();
  const text = `${url} ${title}`.toLowerCase();

  // Desi / Indian
  if (/desi|indian|bhabhi|devar|malayalam|yessma|bangali|hindi|amateur/.test(text)) {
    tags.add('Desi');
    if (/bhabhi|devar/.test(text)) tags.add('Bhabhi');
  }

  // Taboo / Family
  if (/stepmom|madrastra|stepson|step-son|step-mother|mother|mom/.test(text)) {
    tags.add('Taboo');
    tags.add('Stepmom');
  } else if (/stepsister|sister|stepbrother|brother|devar/.test(text)) {
    tags.add('Taboo');
    tags.add('Stepsister');
  } else if (/family|vacation/.test(text)) {
    tags.add('Taboo');
  }

  // Live / Cam
  if (/stripchat|cam|ticket|shower|live/.test(text)) {
    tags.add('Cam');
    if (/stripchat/.test(text)) tags.add('Stripchat');
  }

  // Studios & Brands
  if (/brazzers/.test(text)) tags.add('Brazzers');
  if (/pure-taboo|puretaboo|pure taboo/.test(text)) tags.add('PureTaboo');
  if (/reality-kings|realitykings/.test(text)) tags.add('RealityKings');
  if (/teenfidelity/.test(text)) tags.add('TeenFidelity');
  if (/tushy/.test(text)) tags.add('Tushy');

  // Categories & Attributes
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

  // Default fallback tag
  if (tags.size === 0) {
    tags.add('Video');
  }

  return Array.from(tags);
}

// Main Execution
async function startImport() {
  console.log('====================================================');
  console.log('🚀 FORTRESS BULK LINK IMPORT SCRIPT');
  console.log('====================================================');

  // Connect to MongoDB
  if (!process.env.MONGO_URI) {
    console.error('❌ MONGO_URI not found in backend/.env');
    process.exit(1);
  }

  try {
    console.log('[DB] Connecting to MongoDB...');
    await mongoose.connect(process.env.MONGO_URI);
    console.log('✅ MongoDB connected!');
  } catch (err) {
    console.error('❌ DB connection failed:', err.message);
    process.exit(1);
  }

  // Find target user
  const user = await User.findOne({ username: new RegExp(`^${USERNAME}$`, 'i') });
  if (!user) {
    console.error(`❌ User "${USERNAME}" not found in database.`);
    process.exit(1);
  }

  const vaultKey = deriveKey(PASSWORD, USERNAME);
  console.log(`✅ Target User: ${user.username} (ID: ${user._id})`);
  console.log(`🔑 Vault Key Derived Successfully.`);

  // Read links.md
  const filePath = path.join(__dirname, '../../links.md');
  if (!fs.existsSync(filePath)) {
    console.error(`❌ File not found: ${filePath}`);
    process.exit(1);
  }

  const rawContent = fs.readFileSync(filePath, 'utf8');
  // Strip hidden zero-width unicode characters (\u200b, \u200c, \u200d, \ufeff)
  const cleanContent = rawContent.replace(/[\u200B-\u200D\uFEFF]/g, '');
  const lines = cleanContent.split('\n')
                             .map(l => l.trim())
                             .filter(l => l.startsWith('http'));

  console.log(`\n📋 Found ${lines.length} unique links in links.md to import.\n`);

  let successCount = 0;
  let skipCount = 0;
  let failCount = 0;
  const allNewTags = new Set(user.settings?.linkTags || []);

  for (let i = 0; i < lines.length; i++) {
    const rawUrl = lines[i];

    try {
      // Scrape Title & Thumbnail
      const { title, thumbnail } = await fetchMetadata(rawUrl);
      const tags = generateTags(rawUrl, title);

      // Collect tags for user settings
      tags.forEach(t => allNewTags.add(t));

      // Encrypt sensitive link fields
      const encryptedUrl = encrypt(rawUrl, vaultKey);
      const encryptedTitle = encrypt(title, vaultKey);
      const encryptedThumbnail = encrypt(thumbnail, vaultKey);

      // Save Link document
      const newLink = new Link({
        userId: user._id,
        url: encryptedUrl,
        title: encryptedTitle,
        thumbnail: encryptedThumbnail,
        tags,
        isFavorite: false, // 0 favorites
        isHidden: true,    // mark all links as hidden
      });

      await newLink.save();
      console.log(`[${i + 1}/${lines.length}] ✅ Saved: "${title}"`);
      console.log(`         🏷️  Tags: [ ${tags.join(', ')} ]`);
      successCount++;
    } catch (err) {
      console.error(`[${i + 1}/${lines.length}] ❌ Failed to save ${rawUrl}:`, err.message);
      failCount++;
    }

    // Short delay to avoid rate limits
    await new Promise(r => setTimeout(r, 150));
  }

  // Update user.settings.linkTags
  try {
    user.settings = user.settings || {};
    user.settings.linkTags = Array.from(allNewTags);
    await user.save();
    console.log(`\n🏷️  Updated User Tags Catalog: [ ${Array.from(allNewTags).join(', ')} ]`);
  } catch (err) {
    console.error('Failed to update user tags catalog:', err.message);
  }

  console.log('\n====================================================');
  console.log(`🎉 BULK IMPORT COMPLETE!`);
  console.log(`   Success: ${successCount} links imported as Hidden`);
  console.log(`   Failed:  ${failCount} links`);
  console.log('====================================================');

  await mongoose.disconnect();
  process.exit(0);
}

startImport();
