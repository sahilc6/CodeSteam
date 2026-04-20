const http = require('http')
const { spawnSync } = require('child_process')
const app = require('./app')
const { initSocket } = require('./socket')
const { connectDB } = require('./utils/db')
const logger = require('./utils/logger')

const PORT = process.env.PORT || 5000

function logRuntimeAvailability() {
  const runtimes = ['node', 'python3', 'javac', 'java', 'gcc', 'g++', 'go', 'rustc', 'ruby', 'php', 'bash', 'ts-node']
  const available = runtimes.map((name) => {
    const result = spawnSync('sh', ['-lc', `command -v ${name}`], { encoding: 'utf8' })
    return `${name}=${result.status === 0 ? result.stdout.trim() : 'missing'}`
  })

  logger.info(`Code runner runtimes: ${available.join(', ')}`)
}

async function start() {
  await connectDB()
  logRuntimeAvailability()

  const server = http.createServer(app)
  const io = initSocket(server)
  app.set('io', io)

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
