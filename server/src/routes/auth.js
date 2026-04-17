const router = require('express').Router()
const { register, login, me } = require('../controllers/authController')
const { authMiddleware } = require('../utils/auth')

router.post('/register', register)
router.post('/login', login)
router.get('/me', authMiddleware, me)

module.exports = router
