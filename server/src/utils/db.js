const mongoose = require('mongoose')
const logger = require('./logger')

async function connectDB() {
  const uri = process.env.MONGODB_URI || 'mongodb://localhost:27017/codesteam'
  try {
    await mongoose.connect(uri, {
      maxPoolSize: 10,
      serverSelectionTimeoutMS: 5000,
    })
    logger.info(`MongoDB connected: ${mongoose.connection.host}`)
  } catch (err) {
    logger.error('MongoDB connection failed:', err.message)
    process.exit(1)
  }

  mongoose.connection.on('disconnected', () => {
    logger.warn('MongoDB disconnected, reconnecting...')
  })
}

module.exports = { connectDB }
