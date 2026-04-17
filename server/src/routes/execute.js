const router = require('express').Router()
const rateLimit = require('express-rate-limit')
const { executeCode } = require('../controllers/executeController')

// Stricter rate limit for code execution
const execLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 20,
  message: { error: 'Too many execution requests. Please wait.' },
})

router.post('/', execLimiter, executeCode)

module.exports = router
