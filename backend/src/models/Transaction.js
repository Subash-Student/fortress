const mongoose = require('mongoose');

const EncryptedFieldSchema = new mongoose.Schema({
  ciphertext: { type: String, required: true },
  iv: { type: String, required: true },
}, { _id: false });

const transactionSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
  },
  amount: {
    type: EncryptedFieldSchema,
    required: true,
  },
  counterparty: {
    type: EncryptedFieldSchema,
    required: false,
  },
  notes: {
    type: EncryptedFieldSchema,
    required: false,
  },
  type: {
    type: String,
    enum: ['debit', 'credit'],
    required: true,
  },
  category: {
    type: String,
    default: null,
  },
  bankAccountId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'BankAccount',
    default: null,
  },
  occurredAt: {
    type: Date,
    required: true,
  },
  source: {
    type: String,
    enum: ['manual', 'sms', 'notification'],
    default: 'manual',
  },
  sourceRef: {
    type: String,
    default: null,
  },
  status: {
    type: String,
    enum: ['categorized', 'needs_review'],
    default: 'needs_review',
  },
}, { timestamps: true });

// sparse: manual entries never set sourceRef, so many docs can share a null value
transactionSchema.index({ userId: 1, sourceRef: 1 }, { unique: true, sparse: true });

module.exports = mongoose.model('Transaction', transactionSchema);
