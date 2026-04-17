const mongoose = require('mongoose')

const chatSchema = new mongoose.Schema({
  roomId: { type: String, required: true, index: true },
  username: { type: String, required: true },
  text: { type: String, required: true },
  timestamp: { type: Date, default: Date.now },
})

// TTL index: auto-delete chat messages after 30 days of room inactivity
chatSchema.index({ timestamp: 1 }, { expireAfterSeconds: 2592000 })

module.exports = mongoose.model('Chat', chatSchema)
