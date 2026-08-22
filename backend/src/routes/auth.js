const router = require('express').Router();
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const User = require('../models/User');
const auth = require('../middleware/auth');

function verifyPassword(password, storedValue) {
  const [salt, originalHash] = storedValue.split(':');
  const hash = crypto.pbkdf2Sync(password, salt, 1000, 64, 'sha512').toString('hex');
  return hash === originalHash;
}

function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.pbkdf2Sync(password, salt, 1000, 64, 'sha512').toString('hex');
  return `${salt}:${hash}`;
}

// Token validation endpoint
router.get('/session', auth, async (req, res) => {
  try {
    const user = await User.findById(req.userId);
    res.json({ valid: true, userId: req.userId, hasPin: !!(user && user.pinHash) });
  } catch (err) {
    res.json({ valid: true, userId: req.userId, hasPin: false });
  }
});

// Check if user has PIN set
router.get('/pin-status', auth, async (req, res) => {
  try {
    const user = await User.findById(req.userId);
    if (!user) return res.status(404).json({ error: 'User not found' });
    res.json({ hasPin: !!user.pinHash });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch PIN status' });
  }
});

// Set or update 4-digit PIN
router.post('/set-pin', auth, async (req, res) => {
  const { pin } = req.body;
  if (!pin || typeof pin !== 'string' || !/^\d{4}$/.test(pin)) {
    return res.status(400).json({ error: 'PIN must be exactly 4 digits' });
  }

  try {
    const user = await User.findById(req.userId);
    if (!user) return res.status(404).json({ error: 'User not found' });

    user.pinHash = hashPassword(pin);
    await user.save();

    res.json({ success: true, message: 'Security PIN set successfully' });
  } catch (err) {
    console.error('Error setting PIN:', err);
    res.status(500).json({ error: 'Failed to save security PIN' });
  }
});

// Verify 4-digit PIN
router.post('/verify-pin', auth, async (req, res) => {
  const { pin } = req.body;
  if (!pin || typeof pin !== 'string') {
    return res.status(400).json({ error: 'PIN is required' });
  }

  try {
    const user = await User.findById(req.userId);
    if (!user || !user.pinHash) {
      return res.status(400).json({ valid: false, error: 'No PIN set yet' });
    }

    const matches = verifyPassword(pin, user.pinHash);
    if (!matches) {
      return res.status(401).json({ valid: false, error: 'Incorrect PIN' });
    }

    res.json({ valid: true });
  } catch (err) {
    console.error('Error verifying PIN:', err);
    res.status(500).json({ error: 'Failed to verify PIN' });
  }
});

// Login endpoint
router.post('/login', async (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) {
    return res.status(400).json({ error: 'Username and password required' });
  }

  try {
    const user = await User.findOne({ username: username.trim() });
    if (!user) {
      return res.status(401).json({ error: 'Invalid username or password' });
    }

    const matches = verifyPassword(password, user.passwordHash);
    if (!matches) {
      return res.status(401).json({ error: 'Invalid username or password' });
    }

    // Generate JWT token
    const token = jwt.sign({ userId: user._id }, process.env.JWT_SECRET, {
      expiresIn: '30d',
    });

    res.json({ token, username: user.username });
  } catch (err) {
    console.error('Login error:', err);
    res.status(500).json({ error: 'Server error during login' });
  }
});

module.exports = router;
