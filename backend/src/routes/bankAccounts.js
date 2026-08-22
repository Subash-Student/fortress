const router = require('express').Router();
const BankAccount = require('../models/BankAccount');

// Get all bank accounts
router.get('/', async (req, res) => {
  try {
    const accounts = await BankAccount.find({ userId: req.userId }).sort({ createdAt: 1 });
    res.json(accounts);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch bank accounts' });
  }
});

// Create a bank account
router.post('/', async (req, res) => {
  const { nickname, bankName, last4, color, purpose, targetAmount } = req.body;
  if (!nickname) return res.status(400).json({ error: 'Nickname is required' });

  try {
    const newAccount = new BankAccount({
      userId: req.userId,
      nickname,
      bankName: bankName || '',
      last4: last4 || '',
      color: color || '#3B82F6',
      purpose: purpose || 'other',
      targetAmount: targetAmount ?? null,
    });
    const saved = await newAccount.save();
    res.status(201).json(saved);
  } catch (err) {
    res.status(500).json({ error: 'Failed to save bank account' });
  }
});

// Update a bank account
router.put('/:id', async (req, res) => {
  const { id } = req.params;
  const { nickname, bankName, last4, color, purpose, targetAmount } = req.body;
  try {
    const updated = await BankAccount.findOneAndUpdate(
      { _id: id, userId: req.userId },
      { nickname, bankName, last4, color, purpose, targetAmount },
      { new: true }
    );
    if (!updated) return res.status(404).json({ error: 'Bank account not found' });
    res.json(updated);
  } catch (err) {
    res.status(500).json({ error: 'Failed to update bank account' });
  }
});

// Delete a bank account
router.delete('/:id', async (req, res) => {
  const { id } = req.params;
  try {
    const deleted = await BankAccount.findOneAndDelete({ _id: id, userId: req.userId });
    if (!deleted) return res.status(404).json({ error: 'Bank account not found' });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Failed to delete bank account' });
  }
});

module.exports = router;
