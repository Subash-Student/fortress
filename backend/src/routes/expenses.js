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

// Get/set the fallback pay-cycle anchor day (used only until enough salary history exists to auto-detect cycles)
router.get('/pay-cycle-anchor', async (req, res) => {
  try {
    const user = await User.findById(req.userId);
    res.json({ payCycleAnchorDay: user?.settings?.payCycleAnchorDay ?? 1 });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch pay cycle anchor' });
  }
});

router.put('/pay-cycle-anchor', async (req, res) => {
  const { payCycleAnchorDay } = req.body;
  if (!Number.isInteger(payCycleAnchorDay) || payCycleAnchorDay < 1 || payCycleAnchorDay > 31) {
    return res.status(400).json({ error: 'payCycleAnchorDay must be an integer between 1 and 31' });
  }
  try {
    await User.findByIdAndUpdate(req.userId, { $set: { 'settings.payCycleAnchorDay': payCycleAnchorDay } });
    res.json({ payCycleAnchorDay });
  } catch (err) {
    res.status(500).json({ error: 'Failed to update pay cycle anchor' });
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

// Bulk create/backfill transactions (used by the SMS sync pipeline).
// Items with a sourceRef are upserted keyed on (userId, sourceRef): an existing
// transaction only gets bankAccountId updated (e.g. backfilling a bank match on a
// re-scan) without touching category/status the user may have already set; a new
// sourceRef inserts the full document. This replaces a loop of N sequential POSTs
// with a single bulkWrite.
router.post('/bulk', async (req, res) => {
  const { transactions } = req.body;
  if (!Array.isArray(transactions) || transactions.length === 0) {
    return res.status(400).json({ error: 'transactions array is required' });
  }

  const categoriesToSync = new Set();
  const ops = transactions.map((t) => {
    const { amount, counterparty, notes, type, category, bankAccountId, occurredAt, source, sourceRef } = t;
    if (category) categoriesToSync.add(category);

    if (sourceRef) {
      return {
        updateOne: {
          filter: { userId: req.userId, sourceRef },
          update: {
            $set: { bankAccountId: bankAccountId || null },
            $setOnInsert: {
              userId: req.userId,
              amount,
              counterparty,
              notes,
              type,
              category: category || null,
              occurredAt,
              source: source || 'sms',
              sourceRef,
              status: category ? 'categorized' : 'needs_review',
            },
          },
          upsert: true,
        },
      };
    }

    return {
      insertOne: {
        document: {
          userId: req.userId,
          amount,
          counterparty,
          notes,
          type,
          category: category || null,
          bankAccountId: bankAccountId || null,
          occurredAt,
          source: source || 'manual',
          sourceRef: null,
          status: category ? 'categorized' : 'needs_review',
        },
      },
    };
  });

  try {
    const result = await Transaction.bulkWrite(ops, { ordered: false });
    for (const category of categoriesToSync) {
      await syncUserCategory(req.userId, category);
    }
    res.json({
      inserted: (result.insertedCount || 0) + (result.upsertedCount || 0),
      updated: result.modifiedCount || 0,
    });
  } catch (err) {
    res.status(500).json({ error: 'Failed to bulk-save transactions' });
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
