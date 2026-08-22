const router = require('express').Router();
const Transaction = require('../models/Transaction');
const User = require('../models/User');

const DEFAULT_CATEGORIES = [
  'Food', 'Transport', 'Bills & Utilities', 'Shopping', 'Groceries',
  'Entertainment', 'Health', 'Transfer', 'Salary/Income', 'Other',
];

// Helper to save a new unique category to user.settings.expenseCategories
async function syncUserCategory(userId, category) {
  if (category) {
    await User.findByIdAndUpdate(
      userId,
      { $addToSet: { 'settings.expenseCategories': category } },
      { new: true }
    );
  }
}

// Get user categories (seeds defaults on first fetch)
router.get('/user-categories', async (req, res) => {
  try {
    let user = await User.findById(req.userId);
    if (!user?.settings?.expenseCategories || user.settings.expenseCategories.length === 0) {
      user = await User.findByIdAndUpdate(
        req.userId,
        { $set: { 'settings.expenseCategories': DEFAULT_CATEGORIES } },
        { new: true }
      );
    }
    res.json({ categories: user.settings.expenseCategories });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch categories' });
  }
});

// Get all transactions
router.get('/', async (req, res) => {
  try {
    const transactions = await Transaction.find({ userId: req.userId }).sort({ occurredAt: -1 });
    res.json(transactions);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch transactions' });
  }
});

// Create a transaction
router.post('/', async (req, res) => {
  const { amount, counterparty, notes, type, category, bankAccountId, occurredAt, source, sourceRef } = req.body;
  if (!amount || !type || !occurredAt) {
    return res.status(400).json({ error: 'Amount, type, and occurredAt are required' });
  }

  try {
    const newTransaction = new Transaction({
      userId: req.userId,
      amount,
      counterparty,
      notes,
      type,
      category: category || null,
      bankAccountId: bankAccountId || null,
      occurredAt,
      source: source || 'manual',
      sourceRef: sourceRef || null,
      status: category ? 'categorized' : 'needs_review',
    });
    const saved = await newTransaction.save();
    await syncUserCategory(req.userId, category);
    res.status(201).json(saved);
  } catch (err) {
    if (err.code === 11000) {
      return res.status(409).json({ error: 'Transaction already exists' });
    }
    res.status(500).json({ error: 'Failed to save transaction' });
  }
});

// Update a transaction (full edit)
router.put('/:id', async (req, res) => {
  const { id } = req.params;
  const { amount, counterparty, notes, type, category, bankAccountId, occurredAt } = req.body;
  try {
    const updated = await Transaction.findOneAndUpdate(
      { _id: id, userId: req.userId },
      {
        amount, counterparty, notes, type,
        category: category || null,
        bankAccountId: bankAccountId || null,
        occurredAt,
        status: category ? 'categorized' : 'needs_review',
      },
      { new: true }
    );
    if (!updated) return res.status(404).json({ error: 'Transaction not found' });
    await syncUserCategory(req.userId, category);
    res.json(updated);
  } catch (err) {
    res.status(500).json({ error: 'Failed to update transaction' });
  }
});

// Quick category/notes update (used by the review-inbox flow)
router.put('/:id/category', async (req, res) => {
  const { id } = req.params;
  const { category, notes } = req.body;
  try {
    const updated = await Transaction.findOneAndUpdate(
      { _id: id, userId: req.userId },
      { category: category || null, notes, status: category ? 'categorized' : 'needs_review' },
      { new: true }
    );
    if (!updated) return res.status(404).json({ error: 'Transaction not found' });
    await syncUserCategory(req.userId, category);
    res.json(updated);
  } catch (err) {
    res.status(500).json({ error: 'Failed to update transaction category' });
  }
});

// Delete a transaction
router.delete('/:id', async (req, res) => {
  const { id } = req.params;
  try {
    const deleted = await Transaction.findOneAndDelete({ _id: id, userId: req.userId });
    if (!deleted) return res.status(404).json({ error: 'Transaction not found' });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Failed to delete transaction' });
  }
});

module.exports = router;
