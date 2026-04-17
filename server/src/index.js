const http = require('http')
const app = require('./app')
const { initSocket } = require('./socket')
const { connectDB } = require('./utils/db')
const logger = require('./utils/logger')

const PORT = process.env.PORT || 5000

async function start() {
  await connectDB()

  const server = http.createServer(app)
  initSocket(server)

  server.listen(PORT, () => {
    logger.info(`CodeSteam server running on port ${PORT} [${process.env.NODE_ENV}]`)
  })

  process.on('unhandledRejection', (err) => {
    logger.error('Unhandled rejection:', err)
    process.exit(1)
  })

  process.on('SIGTERM', () => {
    logger.info('SIGTERM received, shutting down gracefully')
    server.close(() => process.exit(0))
  })
}

start()
