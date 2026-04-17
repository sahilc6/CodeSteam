const { createLogger, format, transports } = require('winston')
const path = require('path')

const logger = createLogger({
  level: process.env.NODE_ENV === 'production' ? 'info' : 'debug',
  format: format.combine(
    format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
    format.errors({ stack: true }),
    format.printf(({ level, message, timestamp, stack }) =>
      stack
        ? `${timestamp} [${level.toUpperCase()}] ${message}\n${stack}`
        : `${timestamp} [${level.toUpperCase()}] ${message}`
    )
  ),
  transports: [
    new transports.Console({
      format: format.combine(format.colorize(), format.simple()),
    }),
    ...(process.env.NODE_ENV === 'production'
      ? [
          new transports.File({ filename: path.join('logs', 'error.log'), level: 'error' }),
          new transports.File({ filename: path.join('logs', 'combined.log') }),
        ]
      : []),
  ],
})

module.exports = logger
