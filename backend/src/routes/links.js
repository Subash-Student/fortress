const router = require('express').Router();
const axios = require('axios');
const cheerio = require('cheerio');
const Link = require('../models/Link');
const User = require('../models/User');
const auth = require('../middleware/auth');
const { GoogleGenAI } = require('@google/genai');

const ai = new GoogleGenAI({});

// Helper to save new unique tags to user.settings.linkTags
async function syncUserTags(userId, tags) {
  if (Array.isArray(tags) && tags.length > 0) {
    const cleanTags = tags.map(t => String(t).trim()).filter(Boolean);
    if (cleanTags.length > 0) {
      await User.findByIdAndUpdate(
        userId,
        { $addToSet: { 'settings.linkTags': { $each: cleanTags } } },
        { new: true }
      );
    }
  }
}


// Get user saved link tags
router.get('/user-tags', auth, async (req, res) => {
  try {
    const user = await User.findById(req.userId);
    const tags = user?.settings?.linkTags || [];
    console.log(`[USER TAGS] Count: ${tags.length}`, tags);
    res.json({ tags });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch tags' });
  }
});

// ── Tier 1: Direct OG scrape from the target site ──
async function scrapeDirectly(url) {
  const response = await axios.get(url, {
    headers: {
      'User-Agent': 'facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uatext.php)'
    },
    timeout: 8000,
    maxRedirects: 5,
  });
  const $ = cheerio.load(response.data);

  const title = $('meta[property="og:title"]').attr('content') ||
                $('meta[name="twitter:title"]').attr('content') ||
                $('title').text() || '';

  let image = $('meta[property="og:image"]').attr('content') ||
              $('meta[name="twitter:image"]').attr('content') ||
              $('link[rel="image_src"]').attr('href') ||
              $('meta[itemprop="image"]').attr('content') || '';

  // Fix relative URLs
  if (image && image.startsWith('/')) {
    try {
      const u = new URL(url);
      image = `${u.protocol}//${u.host}${image}`;
    } catch (_) {}
  }

  return { title, thumbnail: image };
}

// ── Tier 2: Microlink cloud API (free, no key needed) ──
async function scrapeMicrolink(url) {
  const res = await axios.get('https://api.microlink.io', {
    params: { url },
    timeout: 10000,
  });
  const data = res.data?.data || {};
  return {
    title: data.title || '',
    thumbnail: data.image?.url || data.logo?.url || '',
  };
}

// ── Tier 3: Google cache / web-cache fallback ──
async function scrapeViaGoogleCache(url) {
  const cacheUrl = `https://webcache.googleusercontent.com/search?q=cache:${encodeURIComponent(url)}`;
  const response = await axios.get(cacheUrl, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
    },
    timeout: 8000,
  });
  const $ = cheerio.load(response.data);

  const title = $('meta[property="og:title"]').attr('content') ||
                $('title').text() || '';
  const image = $('meta[property="og:image"]').attr('content') || '';

  return { title, thumbnail: image };
};

let tagEmbeddingsCache = {
  tagsKey: '',
  vectors: [],
};

async function getCachedTagEmbeddings(tags) {
  if (!Array.isArray(tags) || tags.length === 0) return [];
  const key = tags.join('|');
  if (tagEmbeddingsCache.tagsKey === key && tagEmbeddingsCache.vectors.length === tags.length) {
    return tagEmbeddingsCache.vectors;
  }
  const vectors = await getBatchEmbeddings(tags);
  tagEmbeddingsCache = { tagsKey: key, vectors };
  return vectors;
}

// Helper to fetch metadata and match tags
async function getMetadataAndTags(url, userId, existingTags = []) {
  let title = 'Unknown Link';
  let thumbnail = '';
  let tags = Array.isArray(existingTags) ? existingTags : [];

  const ytMatch = url.match(/(?:youtube\.com\/(?:[^\/]+\/.+\/|(?:v|e(?:mbed)?)\/|.*[?&]v=)|youtu\.be\/)([^"&?\/\s]{11})/i);
  if (ytMatch && ytMatch[1]) {
    thumbnail = `https://img.youtube.com/vi/${ytMatch[1]}/maxresdefault.jpg`;
    title = 'YouTube Video';
  }

  const tiers = [
    { name: 'Direct scrape', fn: () => scrapeDirectly(url) },
    { name: 'Microlink API', fn: () => scrapeMicrolink(url) },
    { name: 'Google Cache',  fn: () => scrapeViaGoogleCache(url) },
  ];

  for (const tier of tiers) {
    try {
      const result = await tier.fn();
      if (result.title) title = result.title;
      if (result.thumbnail && !thumbnail) thumbnail = result.thumbnail;
      if (title && title !== 'Unknown Link' && thumbnail) break;
    } catch (_) {}
  }

  if (title && title !== 'Unknown Link') {
    try {
      const user = await User.findById(userId);
      const availableTags = user?.settings?.linkTags || [];
      if (availableTags.length > 0) {
        // 1. Direct Keyword Matches
        const lowerTitle = title.toLowerCase();
        const keywordMatches = availableTags.filter((tag) => {
          const clean = tag.trim().toLowerCase();
          if (!clean) return false;
          const escaped = clean.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
          const regex = new RegExp(`\\b${escaped}\\b`, 'i');
          return regex.test(lowerTitle) || lowerTitle.includes(clean);
        });

        // 2. Vector Similarity Matches
        let vectorMatches = [];
        try {
          const tagVectors = await getCachedTagEmbeddings(availableTags);
          const titleVec = extractVector(await ai.models.embedContent({
            model: 'text-embedding-004',
            contents: title,
          }));
          if (titleVec) {
            const scored = availableTags.map((tag, tagIdx) => ({
              tag,
              score: tagVectors[tagIdx] ? cosineSimilarity(titleVec, tagVectors[tagIdx]) : 0
            }));
            scored.sort((a, b) => b.score - a.score);
            vectorMatches = scored.slice(0, 2).map(s => s.tag);
          }
        } catch (vErr) {
          console.warn('[VECTOR MATCH] Warning:', vErr.message);
        }

        const combinedTags = new Set([...tags, ...keywordMatches, ...vectorMatches]);
        tags = Array.from(combinedTags);
      }
    } catch (e) {
      console.warn('[BACKGROUND MATCH] Failed:', e.message);
    }
  }

  return { title, thumbnail, tags };
}

// Fetch metadata preview for a given URL
router.post('/preview', async (req, res) => {
  const { url, availableTags } = req.body;
  if (!url) return res.status(400).json({ error: 'URL is required' });

  try {
    let title = 'Unknown Link';
    let thumbnail = '';
    let suggestedTags = [];

    // Quick regex shortcut for YouTube – always works, no network needed
    const ytMatch = url.match(/(?:youtube\.com\/(?:[^\/]+\/.+\/|(?:v|e(?:mbed)?)\/|.*[?&]v=)|youtu\.be\/)([^"&?\/\s]{11})/i);
    if (ytMatch && ytMatch[1]) {
      thumbnail = `https://img.youtube.com/vi/${ytMatch[1]}/maxresdefault.jpg`;
      title = 'YouTube Video';
    }

    // Run the fallback chain: Direct → Microlink → Google Cache
    const tiers = [
      { name: 'Direct scrape', fn: () => scrapeDirectly(url) },
      { name: 'Microlink API', fn: () => scrapeMicrolink(url) },
      { name: 'Google Cache',  fn: () => scrapeViaGoogleCache(url) },
    ];

    for (const tier of tiers) {
      try {
        console.log(`[PREVIEW] Trying ${tier.name} for: ${url}`);
        const result = await tier.fn();

        if (result.title) title = result.title;
        if (result.thumbnail && !thumbnail) thumbnail = result.thumbnail;

        // If we got both title and thumbnail, stop early
        if (title && title !== 'Unknown Link' && thumbnail) {
          console.log(`[PREVIEW] Success via ${tier.name}`);
          break;
        }
      } catch (e) {
        console.warn(`[PREVIEW] ${tier.name} failed: ${e.message}`);
      }
    }

    // Match tags using Cached Vector Embeddings
    if (title && title !== 'Unknown Link' && Array.isArray(availableTags) && availableTags.length > 0) {
      try {
        const tagVectors = await getCachedTagEmbeddings(availableTags);
        const titleVec = extractVector(await ai.models.embedContent({
          model: 'text-embedding-004',
          contents: title,
        }));

        if (titleVec) {
          const scored = availableTags.map((tag, tagIdx) => ({
            tag,
            score: tagVectors[tagIdx] ? cosineSimilarity(titleVec, tagVectors[tagIdx]) : 0
          }));
          scored.sort((a, b) => b.score - a.score);
          suggestedTags = scored.slice(0, 2).map(s => s.tag);
        }
      } catch (geminiErr) {
        console.error('[PREVIEW] Vector tag suggestion failed:', geminiErr.message);
      }
    }

    console.log(`[PREVIEW] Returning: title="${title}", thumbnail="${thumbnail ? 'YES' : 'NO'}", tags=${JSON.stringify(suggestedTags)}`);
    res.json({ title, thumbnail, suggestedTags });
  } catch (err) {
    console.error('[PREVIEW] All tiers failed:', err.message);
    res.status(500).json({ error: 'Failed to generate preview' });
  }
});

// Get links (filtered by hidden status)
router.get('/', async (req, res) => {
  try {
    const isHidden = req.query.hidden === 'true';
    const links = await Link.find({ userId: req.userId, isHidden }).sort({ createdAt: -1 });
    res.json(links);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch links' });
  }
});

// Save a link (Instant Fast Save + Background Scraping & Vector Tagging)
router.post('/', auth, async (req, res) => {
  const { url, rawUrl, title, thumbnail, isFavorite, isHidden, tags } = req.body;
  if (!url) return res.status(400).json({ error: 'URL is required' });

  try {
    const cleanTags = Array.isArray(tags) ? tags.map(t => String(t).trim()).filter(Boolean) : [];
    const isComplete = Boolean(title && title !== 'Loading preview...' && title !== 'Unknown Link' && thumbnail);
    const initialStatus = isComplete ? 'ready' : 'processing';

    const newLink = new Link({
      userId: req.userId,
      url,
      title: title || 'Loading preview...',
      thumbnail: thumbnail || null,
      tags: cleanTags,
      isFavorite: Boolean(isFavorite),
      isHidden: Boolean(isHidden),
      status: initialStatus,
    });

    const saved = await newLink.save();
    if (cleanTags.length > 0) {
      await syncUserTags(req.userId, cleanTags);
    }

    // Respond to mobile app immediately (~40ms)
    res.status(201).json(saved);

    // If not complete and we have rawUrl or targetUrl, process in background
    if (!isComplete && (rawUrl || (typeof url === 'string' && url.startsWith('http')))) {
      const targetUrl = rawUrl || url;
      setImmediate(async () => {
        try {
          console.log(`[BACKGROUND TASK] Scraping & vector tagging for link ${saved._id}: ${targetUrl}`);
          const meta = await getMetadataAndTags(targetUrl, req.userId, cleanTags);
          await Link.findByIdAndUpdate(saved._id, {
            title: meta.title,
            thumbnail: meta.thumbnail,
            tags: meta.tags,
            status: 'ready',
          });
          if (meta.tags.length > 0) {
            await syncUserTags(req.userId, meta.tags);
          }
          console.log(`[BACKGROUND TASK] Done! Link ${saved._id} -> title: "${meta.title}", tags: [${meta.tags.join(', ')}]`);
        } catch (bgErr) {
          console.error(`[BACKGROUND TASK] Failed for ${saved._id}:`, bgErr.message);
          await Link.findByIdAndUpdate(saved._id, { status: 'failed' }).catch(() => {});
        }
      });
    }
  } catch (err) {
    console.error('[SAVE LINK] Failed:', err.message);
    res.status(500).json({ error: 'Failed to save link' });
  }
});

// Toggle favorite
router.put('/:id/favorite', auth, async (req, res) => {
  const { id } = req.params;
  const { isFavorite } = req.body;
  try {
    const updated = await Link.findOneAndUpdate(
      { _id: id, userId: req.userId },
      { isFavorite },
      { new: true }
    );
    if (!updated) return res.status(404).json({ error: 'Link not found' });
    res.json(updated);
  } catch (err) {
    res.status(500).json({ error: 'Failed to update link' });
  }
});

// Toggle hide
router.put('/:id/hide', auth, async (req, res) => {
  const { id } = req.params;
  const { isHidden } = req.body;
  try {
    const updated = await Link.findOneAndUpdate(
      { _id: id, userId: req.userId },
      { isHidden },
      { new: true }
    );
    if (!updated) return res.status(404).json({ error: 'Link not found' });
    res.json(updated);
  } catch (err) {
    res.status(500).json({ error: 'Failed to update link hidden status' });
  }
});

// Bulk Update Links (Must be before /:id)
router.put('/bulk-update', auth, async (req, res) => {
  const { updates, allTags } = req.body; // updates: [{ id, tags, title, url, thumbnail, isHidden, isFavorite }]
  if (!Array.isArray(updates)) return res.status(400).json({ error: 'Invalid updates payload' });

  try {
    const bulkOps = updates.map(update => {
      const cleanTags = Array.isArray(update.tags) ? update.tags.map(t => String(t).trim()).filter(Boolean) : [];
      return {
        updateOne: {
          filter: { _id: update.id, userId: req.userId },
          update: { $set: { 
            tags: cleanTags,
            title: update.title,
            url: update.url,
            thumbnail: update.thumbnail,
            isHidden: update.isHidden,
            isFavorite: update.isFavorite
          } }
        }
      };
    });

    if (bulkOps.length > 0) {
      await Link.bulkWrite(bulkOps);
    }
    if (Array.isArray(allTags) && allTags.length > 0) {
      await syncUserTags(req.userId, allTags);
    }

    console.log(`[BULK UPDATE] Successfully updated ${bulkOps.length} links!`);
    res.json({ success: true, count: bulkOps.length });
  } catch (err) {
    console.error('[BULK UPDATE] Failed:', err.message);
    res.status(500).json({ error: 'Failed to bulk update links' });
  }
});

// Update link (edit)
router.put('/:id', auth, async (req, res) => {
  const { id } = req.params;
  const { url, title, thumbnail, isFavorite, isHidden, tags } = req.body;
  try {
    const cleanTags = Array.isArray(tags) ? tags.map(t => String(t).trim()).filter(Boolean) : [];
    const updated = await Link.findOneAndUpdate(
      { _id: id, userId: req.userId },
      { url, title, thumbnail, isFavorite, isHidden, tags: cleanTags },
      { new: true }
    );
    if (!updated) return res.status(404).json({ error: 'Link not found' });
    await syncUserTags(req.userId, cleanTags);
    res.json(updated);
  } catch (err) {
    res.status(500).json({ error: 'Failed to update link' });
  }
});

// Delete link
router.delete('/:id', async (req, res) => {
  const { id } = req.params;
  try {
    const deleted = await Link.findOneAndDelete({ _id: id, userId: req.userId });
    if (!deleted) return res.status(404).json({ error: 'Link not found' });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Failed to delete link' });
  }
});

// Vector helper utilities
function extractVector(res) {
  if (!res) return null;
  if (res.embedding?.values && Array.isArray(res.embedding.values)) return res.embedding.values;
  if (res.embeddings?.[0]?.values && Array.isArray(res.embeddings[0].values)) return res.embeddings[0].values;
  if (Array.isArray(res.values)) return res.values;
  if (Array.isArray(res)) return res;
  return null;
}

function cosineSimilarity(vecA, vecB) {
  if (!vecA || !vecB || !Array.isArray(vecA) || !Array.isArray(vecB) || vecA.length !== vecB.length) return 0;
  let dotProduct = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < vecA.length; i++) {
    dotProduct += vecA[i] * vecB[i];
    normA += vecA[i] * vecA[i];
    normB += vecB[i] * vecB[i];
  }
  const denom = Math.sqrt(normA) * Math.sqrt(normB);
  return denom === 0 ? 0 : dotProduct / denom;
}

async function getBatchEmbeddings(texts) {
  const vectors = [];
  const chunkSize = 10;
  for (let i = 0; i < texts.length; i += chunkSize) {
    const chunk = texts.slice(i, i + chunkSize);
    const chunkResults = await Promise.all(
      chunk.map(async (t) => {
        const textStr = String(t || '').trim() || 'video';
        try {
          // Attempt standard format
          const res = await ai.models.embedContent({
            model: 'text-embedding-004',
            contents: textStr,
          });
          const vec = extractVector(res);
          if (!vec) {
            console.warn('[EMBED RES STRUCTURE]', Object.keys(res || {}));
          }
          return vec;
        } catch (e) {
          console.warn('[EMBEDDING] Failed for:', textStr, e.message);
          return null;
        }
      })
    );
    vectors.push(...chunkResults);
  }
  return vectors;
}

// Bulk Tag Migration (Vector Embedding Matching on User's Tags)
router.post('/bulk-tag-migration', auth, async (req, res) => {
  const { links, tags: passedTags } = req.body; // Array of { id, title }
  if (!Array.isArray(links) || links.length === 0) {
    return res.status(400).json({ error: 'No links provided' });
  }

  try {
    const user = await User.findById(req.userId);
    const userTags = Array.isArray(passedTags) && passedTags.length > 0 
      ? passedTags 
      : (user?.settings?.linkTags || []);

    if (userTags.length === 0) {
      return res.status(400).json({ error: 'No tags found in user collection to match against' });
    }

    console.log(`[VECTOR MATCH] Matching ${links.length} links against ${userTags.length} user tags...`);
    const startTime = Date.now();

    // 1. Fetch embeddings for user tags
    const tagVectors = await getBatchEmbeddings(userTags);

    // 2. Fetch embeddings for all video titles
    const titleVectors = await getBatchEmbeddings(links.map(l => l.title));

    // 3. Calculate Cosine Similarity Vector Mapping
    const mapping = {};
    links.forEach((link, idx) => {
      const titleVec = titleVectors[idx];
      if (!titleVec) {
        mapping[link.id] = [];
        return;
      }

      // Score against all tag vectors
      const scored = userTags.map((tag, tagIdx) => {
        const tagVec = tagVectors[tagIdx];
        const score = tagVec ? cosineSimilarity(titleVec, tagVec) : 0;
        return { tag, score };
      });

      // Sort by highest cosine similarity
      scored.sort((a, b) => b.score - a.score);

      // Select top 2 most semantically aligned tags
      const topTags = scored.slice(0, 2).map(s => s.tag);
      mapping[link.id] = topTags;
    });

    console.log(`[VECTOR MATCH] Finished in ${Date.now() - startTime}ms!`);

    res.json({ newTags: userTags, mapping });
  } catch (err) {
    console.error('[VECTOR MATCH] Failed:', err.message);
    res.status(500).json({ error: 'Failed to match tags' });
  }
});

module.exports = router;
