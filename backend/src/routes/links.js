const router = require('express').Router();
const axios = require('axios');
const cheerio = require('cheerio');
const Link = require('../models/Link');
const User = require('../models/User');
const auth = require('../middleware/auth');

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
    res.json({ tags: user?.settings?.linkTags || [] });
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
}

// Fetch metadata preview for a given URL
router.post('/preview', async (req, res) => {
  const { url } = req.body;
  if (!url) return res.status(400).json({ error: 'URL is required' });

  try {
    let title = 'Unknown Link';
    let thumbnail = '';

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
        // Continue to next tier
      }
    }

    res.json({ title, thumbnail });
  } catch (err) {
    console.error('[PREVIEW] All tiers failed:', err.message);
    res.status(500).json({ error: 'Failed to generate preview' });
  }
});

// Get all links
router.get('/', async (req, res) => {
  try {
    const links = await Link.find({ userId: req.userId }).sort({ createdAt: -1 });
    res.json(links);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch links' });
  }
});

// Save a link
router.post('/', auth, async (req, res) => {
  const { url, title, thumbnail, isFavorite, isHidden, tags } = req.body;
  if (!url || !title) return res.status(400).json({ error: 'URL and title required' });

  try {
    const cleanTags = Array.isArray(tags) ? tags.map(t => String(t).trim()).filter(Boolean) : [];
    const newLink = new Link({
      userId: req.userId,
      url,
      title,
      thumbnail,
      tags: cleanTags,
      isFavorite: Boolean(isFavorite),
      isHidden: Boolean(isHidden),
    });
    const saved = await newLink.save();
    await syncUserTags(req.userId, cleanTags);
    res.status(201).json(saved);
  } catch (err) {
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

module.exports = router;
