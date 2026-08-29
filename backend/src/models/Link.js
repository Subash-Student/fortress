const mongoose = require('mongoose');

const linkSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
  },
  url: {
    type: mongoose.Schema.Types.Mixed,
    required: true,
  },
  title: {
    type: mongoose.Schema.Types.Mixed,
    required: true,
  },
  thumbnail: {
    type: mongoose.Schema.Types.Mixed,
    required: false,
    default: null,
  },
  tags: {
    type: [String],
    default: [],
  },
  isFavorite: {
    type: Boolean,
    default: false,
  },
  isHidden: {
    type: Boolean,
    default: false,
  },
  status: {
    type: String,
    enum: ['ready', 'processing', 'failed'],
    default: 'ready',
  },
}, { timestamps: true });

module.exports = mongoose.model('Link', linkSchema);
