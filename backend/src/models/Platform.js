const mongoose = require('mongoose');

const EncryptedFieldSchema = new mongoose.Schema({
  ciphertext: { type: String, required: true },
  iv: { type: String, required: true },
}, { _id: false });

const CredentialAccountSchema = new mongoose.Schema({
  username: { type: EncryptedFieldSchema, required: true },
  password: { type: EncryptedFieldSchema, required: true },
});

const CredentialPlatformSchema = new mongoose.Schema({
  userId: { type: String, required: true, index: true },
  name: { type: String, required: true },
  logo: { type: String, required: true },
  accounts: [CredentialAccountSchema],
}, { 
  timestamps: true,
  // Ensure virtual id is serialized correctly
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

module.exports = mongoose.model('CredentialPlatform', CredentialPlatformSchema);
