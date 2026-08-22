const mongoose = require('mongoose');

const bankAccountSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
  },
  nickname: {
    type: String,
    required: true,
  },
  bankName: {
    type: String,
    default: '',
  },
  last4: {
    type: String,
    default: '',
  },
  color: {
    type: String,
    default: '#3B82F6',
  },
  purpose: {
    type: String,
    enum: ['monthly_expense', 'savings', 'bills_reserve', 'salary_source', 'other'],
    default: 'other',
  },
  targetAmount: {
    type: Number,
    default: null,
  },
}, { timestamps: true });

module.exports = mongoose.model('BankAccount', bankAccountSchema);
