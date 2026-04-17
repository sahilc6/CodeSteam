const jwt = require('jsonwebtoken')
const Joi = require('joi')
const User = require('../models/User')
const logger = require('../utils/logger')

const registerSchema = Joi.object({
  username: Joi.string().min(2).max(32).alphanum().required(),
  email: Joi.string().email().required(),
  password: Joi.string().min(6).required(),
})

const loginSchema = Joi.object({
  email: Joi.string().email().required(),
  password: Joi.string().required(),
})

function signToken(userId, username) {
  return jwt.sign({ id: userId, username }, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRES_IN || '7d',
  })
}

async function register(req, res) {
  try {
    const { error, value } = registerSchema.validate(req.body)
    if (error) return res.status(400).json({ error: error.details[0].message })

    const exists = await User.findOne({ $or: [{ email: value.email }, { username: value.username }] })
    if (exists) return res.status(409).json({ error: 'Email or username already taken' })

    const user = await User.create(value)
    const token = signToken(user._id, user.username)

    res.status(201).json({
      token,
      user: { id: user._id, username: user.username, email: user.email, cursorColor: user.cursorColor },
    })
  } catch (err) {
    logger.error('register error:', err)
    res.status(500).json({ error: 'Registration failed' })
  }
}

async function login(req, res) {
  try {
    const { error, value } = loginSchema.validate(req.body)
    if (error) return res.status(400).json({ error: error.details[0].message })

    const user = await User.findOne({ email: value.email }).select('+password')
    if (!user || !(await user.comparePassword(value.password))) {
      return res.status(401).json({ error: 'Invalid email or password' })
    }

    const token = signToken(user._id, user.username)
    res.json({
      token,
      user: { id: user._id, username: user.username, email: user.email, cursorColor: user.cursorColor },
    })
  } catch (err) {
    logger.error('login error:', err)
    res.status(500).json({ error: 'Login failed' })
  }
}

async function me(req, res) {
  const user = await User.findById(req.userId)
  if (!user) return res.status(404).json({ error: 'User not found' })
  res.json({ id: user._id, username: user.username, email: user.email, cursorColor: user.cursorColor })
}

module.exports = { register, login, me }
