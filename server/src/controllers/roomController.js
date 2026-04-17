const { v4: uuidv4 } = require('uuid')
const Joi = require('joi')
const Room = require('../models/Room')
const logger = require('../utils/logger')

const createSchema = Joi.object({
  name: Joi.string().min(1).max(64).required(),
  language: Joi.string().valid(
    'javascript','typescript','python','java','cpp','c',
    'go','rust','ruby','php','swift','kotlin','bash','sql','html','css'
  ).default('javascript'),
  isPrivate: Joi.boolean().default(false),
  password: Joi.string().min(4).optional(),
})

async function createRoom(req, res) {
  try {
    const { error, value } = createSchema.validate(req.body)
    if (error) return res.status(400).json({ error: error.details[0].message })

    const room = await Room.create({
      ...value,
      roomId: uuidv4(),
      createdBy: req.userId,
      activity: [{
        type: 'created',
        message: `Room created by ${req.username}`,
        user: req.username,
      }],
    })

    res.status(201).json({
      roomId: room.roomId,
      name: room.name,
      language: room.language,
      isPrivate: room.isPrivate,
      createdAt: room.createdAt,
    })
  } catch (err) {
    logger.error('createRoom error:', err)
    res.status(500).json({ error: 'Failed to create room' })
  }
}

async function getRoom(req, res) {
  try {
    const room = await Room.findOne({ roomId: req.params.roomId })
    if (!room) return res.status(404).json({ error: 'Room not found' })

    res.json({
      roomId: room.roomId,
      name: room.name,
      language: room.language,
      content: room.content,
      snapshot: room.snapshot,
      isPrivate: room.isPrivate,
      userCount: room.users.length,
      createdAt: room.createdAt,
    })
  } catch (err) {
    logger.error('getRoom error:', err)
    res.status(500).json({ error: 'Failed to fetch room' })
  }
}

async function listRooms(req, res) {
  try {
    const rooms = await Room.find({ isPrivate: false, isEnded: { $ne: true } })
      .sort({ updatedAt: -1 })
      .limit(20)
      .select('roomId name language users updatedAt')

    res.json(rooms.map(r => ({
      roomId: r.roomId,
      name: r.name,
      language: r.language,
      userCount: r.users.length,
      updatedAt: r.updatedAt,
    })))
  } catch (err) {
    logger.error('listRooms error:', err)
    res.status(500).json({ error: 'Failed to list rooms' })
  }
}

async function getMyRooms(req, res) {
  try {
    const rooms = await Room.find({ createdBy: req.userId })
      .sort({ updatedAt: -1 })
      .select('roomId name language users updatedAt createdAt isEnded activity')

    res.json(rooms.map(r => ({
      roomId: r.roomId,
      name: r.name,
      language: r.language,
      userCount: r.users.length,
      updatedAt: r.updatedAt,
      createdAt: r.createdAt,
      isEnded: r.isEnded,
      activity: r.activity || [],
    })))
  } catch (err) {
    logger.error('getMyRooms error:', err)
    res.status(500).json({ error: 'Failed to fetch your rooms' })
  }
}

async function deleteRoom(req, res) {
  try {
    const room = await Room.findOneAndDelete({
      roomId: req.params.roomId,
      createdBy: req.userId,
    })
    if (!room) return res.status(404).json({ error: 'Room not found or not authorized' })
    res.json({ message: 'Room deleted' })
  } catch (err) {
    logger.error('deleteRoom error:', err)
    res.status(500).json({ error: 'Failed to delete room' })
  }
}

module.exports = { createRoom, getRoom, listRooms, getMyRooms, deleteRoom }
