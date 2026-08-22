const mongoose = require('mongoose');

const UserSchema = new mongoose.Schema({
  username: { type: String, required: true, unique: true, index: true },
  passwordHash: { type: String, required: true },
  pinHash: { type: String, default: null },
  settings: {
    linkTags: { type: [String], default: [] },
  },
}, { timestamps: true });

module.exports = mongoose.model('User', UserSchema);
