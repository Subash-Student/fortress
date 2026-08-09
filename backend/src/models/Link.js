const mongoose = require('mongoose');

const EncryptedFieldSchema = new mongoose.Schema({
  ciphertext: { type: String, required: true },
  iv: { type: String, required: true },
}, { _id: false });

const linkSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
  },
  url: {
    type: EncryptedFieldSchema,
    required: true,
  },
  title: {
    type: EncryptedFieldSchema,
    required: true,
  },
  thumbnail: {
    type: EncryptedFieldSchema,
    required: false,
  },
  isFavorite: {
    type: Boolean,
    default: false,
  },
  isHidden: {
    type: Boolean,
    default: false,
  },
}, { timestamps: true });

module.exports = mongoose.model('Link', linkSchema);
