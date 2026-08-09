const router = require('express').Router();
const CredentialPlatform = require('../models/Platform');

// Fetch all platforms for the authenticated user
router.get('/', async (req, res) => {
  try {
    const platforms = await CredentialPlatform.find({ userId: req.userId }).sort({ createdAt: -1 });
    res.json(platforms);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch vault credentials' });
  }
});

// Save a new credential platform (with encrypted accounts)
router.post('/', async (req, res) => {
  const { name, logo, accounts } = req.body;
  if (!name || !logo || !accounts || !Array.isArray(accounts) || accounts.length === 0) {
    return res.status(400).json({ error: 'Missing required platform parameters' });
  }

  try {
    const newPlatform = new CredentialPlatform({
      userId: req.userId,
      name,
      logo,
      accounts,
    });
    const saved = await newPlatform.save();
    res.status(201).json(saved);
  } catch (err) {
    console.error('Save vault error:', err);
    res.status(500).json({ error: 'Failed to save credential' });
  }
});

// Update an existing credential platform
router.put('/:id', async (req, res) => {
  const { id } = req.params;
  const { name, logo, accounts } = req.body;
  
  if (!name || !logo || !accounts || !Array.isArray(accounts) || accounts.length === 0) {
    return res.status(400).json({ error: 'Missing required platform parameters' });
  }

  try {
    const updatedPlatform = await CredentialPlatform.findOneAndUpdate(
      { _id: id, userId: req.userId },
      { name, logo, accounts },
      { new: true }
    );

    if (!updatedPlatform) {
      return res.status(404).json({ error: 'Platform credential not found or unauthorized' });
    }
    
    res.json(updatedPlatform);
  } catch (err) {
    console.error('Update vault error:', err);
    res.status(500).json({ error: 'Failed to update credential' });
  }
});

// Delete a credential platform
router.delete('/:id', async (req, res) => {
  const { id } = req.params;
  try {
    // Restrict deletion to own user credentials for security
    const result = await CredentialPlatform.findOneAndDelete({ _id: id, userId: req.userId });
    if (!result) {
      return res.status(404).json({ error: 'Platform credential not found or unauthorized' });
    }
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Failed to delete credential' });
  }
});

module.exports = router;
