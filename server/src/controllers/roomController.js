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
})

function sameId(left, right) {
  return Boolean(left && right && String(left) === String(right))
}

function isCreator(room, userId) {
  return sameId(room.createdBy, userId)
}

function isAllowedJoiner(room, userId) {
  return Boolean(
    userId && (room.allowedUsers || []).some(member => sameId(member.userId, userId)),
  )
}

function hasPendingRequest(room, userId) {
  return Boolean(
    userId && (room.joinRequests || []).some(request => sameId(request.userId, userId)),
  )
}

function canAccessRoom(room, userId) {
  return isCreator(room, userId) || isAllowedJoiner(room, userId)
}

function roomSummary(room) {
  return roomSummaryForUser(room, room.createdBy)
}

function roomSummaryForUser(room, userId) {
  const creator = isCreator(room, userId)

  return {
    roomId: room.roomId,
    name: room.name,
    language: room.language,
    userCount: room.users.length,
    updatedAt: room.updatedAt,
    createdAt: room.createdAt,
    isEnded: room.isEnded,
    role: creator ? 'creator' : 'joiner',
    activity: creator ? room.activity || [] : [],
    pendingRequests: creator ? room.joinRequests || [] : [],
    allowedUsers: creator ? room.allowedUsers || [] : [],
  }
}

function roomDetails(room, role) {
  return {
    roomId: room.roomId,
    name: room.name,
    language: room.language,
    content: room.content,
    snapshot: room.snapshot,
    isPrivate: true,
    userCount: room.users.length,
    createdAt: room.createdAt,
    role,
    pendingRequests: role === 'creator' ? room.joinRequests || [] : [],
    allowedUsers: role === 'creator' ? room.allowedUsers || [] : [],
  }
}

async function createRoom(req, res) {
  try {
    const { error, value } = createSchema.validate(req.body)
    if (error) return res.status(400).json({ error: error.details[0].message })

    const room = await Room.create({
      ...value,
      isPrivate: true,
      roomId: uuidv4(),
      createdBy: String(req.userId),
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
      isPrivate: true,
      role: 'creator',
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

    if (room.isEnded) {
      return res.status(410).json({ error: 'This room has ended', accessStatus: 'ended' })
    }

    if (!req.userId) {
      return res.status(401).json({ error: 'Sign in to join this room', accessStatus: 'login-required' })
    }

    if (!canAccessRoom(room, req.userId)) {
      return res.status(403).json({
        error: hasPendingRequest(room, req.userId)
          ? 'Your request is waiting for approval'
          : 'Request access to join this room',
        accessStatus: hasPendingRequest(room, req.userId) ? 'pending' : 'request-needed',
        roomId: room.roomId,
        name: room.name,
        language: room.language,
      })
    }

    res.json(roomDetails(room, isCreator(room, req.userId) ? 'creator' : 'joiner'))
  } catch (err) {
    logger.error('getRoom error:', err)
    res.status(500).json({ error: 'Failed to fetch room' })
  }
}

async function requestToJoin(req, res) {
  try {
    const room = await Room.findOne({ roomId: req.params.roomId })
    if (!room) return res.status(404).json({ error: 'Room not found' })
    if (room.isEnded) return res.status(410).json({ error: 'This room has ended', accessStatus: 'ended' })
    if (isCreator(room, req.userId) || isAllowedJoiner(room, req.userId)) {
      return res.json({ message: 'Access already granted', accessStatus: 'allowed' })
    }
    if (hasPendingRequest(room, req.userId)) {
      return res.json({ message: 'Request already sent', accessStatus: 'pending' })
    }

    const request = {
      userId: req.userId,
      username: req.username,
      requestedAt: new Date(),
    }

    room.joinRequests.push(request)
    room.activity.push({
      type: 'requested',
      message: `${req.username} requested to join`,
      user: req.username,
    })
    await room.save()

    const socket = req.app.get('io')
    if (socket) {
      socket.to(room.roomId).emit('join-request-created', request)
    }

    res.status(201).json({ message: 'Request sent', accessStatus: 'pending' })
  } catch (err) {
    logger.error('requestToJoin error:', err)
    res.status(500).json({ error: 'Failed to request access' })
  }
}

async function decideJoinRequest(req, res, allow) {
  try {
    const room = await Room.findOne({ roomId: req.params.roomId })
    if (!room) return res.status(404).json({ error: 'Room not found or not authorized' })
    if (!isCreator(room, req.userId)) return res.status(404).json({ error: 'Room not found or not authorized' })
    if (room.isEnded) return res.status(410).json({ error: 'This room has ended' })

    const request = (room.joinRequests || []).find(r => sameId(r.userId, req.params.userId))
    if (!request) return res.status(404).json({ error: 'Join request not found' })

    room.joinRequests = room.joinRequests.filter(r => !sameId(r.userId, req.params.userId))

    if (allow && !isAllowedJoiner(room, req.params.userId)) {
      room.allowedUsers.push({
        userId: request.userId,
        username: request.username,
        allowedAt: new Date(),
      })
    }

    room.activity.push({
      type: allow ? 'approved' : 'denied',
      message: `${request.username} was ${allow ? 'allowed' : 'denied'}`,
      user: req.username,
    })

    await room.save()

    const socket = req.app.get('io')
    if (socket) {
      socket.to(room.roomId).emit('join-request-updated', {
        userId: request.userId,
        allowed: allow,
        username: request.username,
      })
    }

    res.json({
      message: allow ? 'Joiner allowed' : 'Request denied',
      room: roomSummary(room),
    })
  } catch (err) {
    logger.error('decideJoinRequest error:', err)
    res.status(500).json({ error: 'Failed to update request' })
  }
}

async function allowJoinRequest(req, res) {
  return decideJoinRequest(req, res, true)
}

async function denyJoinRequest(req, res) {
  return decideJoinRequest(req, res, false)
}

async function removeJoiner(req, res) {
  try {
    const room = await Room.findOne({ roomId: req.params.roomId })
    if (!room) return res.status(404).json({ error: 'Room not found or not authorized' })
    if (!isCreator(room, req.userId)) return res.status(404).json({ error: 'Room not found or not authorized' })
    if (room.isEnded) return res.status(410).json({ error: 'This room has ended' })

    const removed = (room.allowedUsers || []).find(member => sameId(member.userId, req.params.userId))
    if (!removed) return res.status(404).json({ error: 'Joiner not found' })

    room.allowedUsers = room.allowedUsers.filter(member => !sameId(member.userId, req.params.userId))
    room.joinRequests = room.joinRequests.filter(request => !sameId(request.userId, req.params.userId))
    room.activity.push({
      type: 'removed',
      message: `${removed.username} was removed`,
      user: req.username,
    })
    await room.save()

    const socket = req.app.get('io')
    if (socket) {
      const sockets = await socket.in(room.roomId).fetchSockets()
      for (const memberSocket of sockets) {
        if (sameId(memberSocket.userId, req.params.userId)) {
          memberSocket.emit('room-access-removed', {
            message: 'You were removed from this room',
          })
          memberSocket.leave(room.roomId)
          memberSocket.disconnect(true)
        }
      }
      socket.to(room.roomId).emit('joiner-removed', {
        userId: req.params.userId,
        username: removed.username,
      })
    }

    res.json({ message: 'Joiner removed', room: roomSummary(room) })
  } catch (err) {
    logger.error('removeJoiner error:', err)
    res.status(500).json({ error: 'Failed to remove joiner' })
  }
}

async function listRooms(req, res) {
  try {
    res.json([])
  } catch (err) {
    logger.error('listRooms error:', err)
    res.status(500).json({ error: 'Failed to list rooms' })
  }
}

async function getMyRooms(req, res) {
  try {
    const userId = String(req.userId)
    const rooms = await Room.find({
      $or: [
        { createdBy: userId },
        { 'allowedUsers.userId': userId },
      ],
    })
      .sort({ updatedAt: -1 })
      .select('roomId name language users updatedAt createdAt isEnded activity joinRequests allowedUsers')

    res.json(rooms.map(room => roomSummaryForUser(room, userId)))
  } catch (err) {
    logger.error('getMyRooms error:', err)
    res.status(500).json({ error: 'Failed to fetch your rooms' })
  }
}

async function deleteRoom(req, res) {
  try {
    const room = await Room.findOneAndDelete({
      roomId: req.params.roomId,
      createdBy: String(req.userId),
    })
    if (!room) return res.status(404).json({ error: 'Room not found or not authorized' })
    res.json({ message: 'Room deleted' })
  } catch (err) {
    logger.error('deleteRoom error:', err)
    res.status(500).json({ error: 'Failed to delete room' })
  }
}

module.exports = {
  createRoom,
  getRoom,
  listRooms,
  getMyRooms,
  requestToJoin,
  allowJoinRequest,
  denyJoinRequest,
  removeJoiner,
  deleteRoom,
}
