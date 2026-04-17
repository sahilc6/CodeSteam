const { Server } = require('socket.io')
const jwt = require('jsonwebtoken')
const { v4: uuidv4 } = require('uuid')
const Room = require('../models/Room')
const Chat = require('../models/Chat')
const OTEngine = require('../utils/ot')
const logger = require('../utils/logger')

let io = null

// In-memory OT engines per room (keyed by roomId)
const engines = new Map()

// Active users per room: roomId -> Map(socketId -> userInfo)
const roomUsers = new Map()

async function logActivity(roomId, type, message, user) {
  try {
    await Room.findOneAndUpdate(
      { roomId },
      { $push: { activity: { type, message, user } } }
    )
  } catch (err) {
    logger.error('logActivity error:', err)
  }
}

const CURSOR_COLORS = [
  '#89b4fa','#a6e3a1','#f38ba8','#f9e2af',
  '#cba6f7','#94e2d5','#fab387','#eba0ac',
]

function getOrCreateEngine(roomId, content, revision) {
  if (!engines.has(roomId)) {
    engines.set(roomId, new OTEngine(content, revision))
  }
  return engines.get(roomId)
}

function initSocket(server) {
  io = new Server(server, {
    cors: {
      origin: (process.env.CORS_ORIGINS || 'http://localhost:5173').split(','),
      credentials: true,
    },
    pingTimeout: 60000,
    pingInterval: 25000,
    transports: ['websocket', 'polling'],
  })

  // Optional JWT auth middleware (guest users allowed)
  io.use((socket, next) => {
    const token = socket.handshake.auth.token
    if (token) {
      try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET)
        socket.userId = decoded.id
        socket.isAuthenticated = true
      } catch (err) {
        logger.warn('Socket token verification failed:', err.message)
      }
    }
    socket.userId = socket.userId || `guest_${uuidv4().slice(0, 8)}`
    socket.isAuthenticated = socket.isAuthenticated || false
    socket.username = socket.handshake.auth.username || `Guest_${socket.userId.slice(-4)}`
    socket.cursorColor = CURSOR_COLORS[Math.floor(Math.random() * CURSOR_COLORS.length)]
    next()
  })

  io.on('connection', (socket) => {
    logger.debug(`Socket connected: ${socket.id} (${socket.username})`)

    // ── JOIN ROOM ──────────────────────────────────────────────────────
    socket.on('join-room', async ({ roomId }) => {
      try {
        const room = await Room.findOne({ roomId })
        if (!room) return socket.emit('error', { message: 'Room not found' })

        socket.join(roomId)
        socket.roomId = roomId

        // Initialise OT engine for this room if needed
        const engine = getOrCreateEngine(roomId, room.snapshot.content, room.snapshot.revision)

        // Track user in room
        if (!roomUsers.has(roomId)) roomUsers.set(roomId, new Map())
        const roomUserMap = roomUsers.get(roomId)

        // Check if this userId already exists in the room (e.g., from another tab)
        // If so, remove the old socket entry
        for (const [oldSocketId, user] of roomUserMap.entries()) {
          if (user.userId === socket.userId && oldSocketId !== socket.id) {
            roomUserMap.delete(oldSocketId)
            // Notify others about the old socket being replaced
            socket.to(roomId).emit('user-left', {
              socketId: oldSocketId,
              userId: socket.userId,
              username: socket.username,
            })
          }
        }

        // Add/update the new socket entry
        roomUserMap.set(socket.id, {
          socketId: socket.id,
          userId: socket.userId,
          username: socket.username,
          color: socket.cursorColor,
        })

        // Send current state to joining user
        socket.emit('room-state', {
          content: engine.content,
          revision: engine.revision,
          language: room.language,
          users: Array.from(roomUsers.get(roomId).values()),
        })

        // Notify others
        socket.to(roomId).emit('user-joined', {
          socketId: socket.id,
          userId: socket.userId,
          username: socket.username,
          color: socket.cursorColor,
        })

        // Log activity
        await logActivity(roomId, 'joined', `${socket.username} joined the room`, socket.username)

        logger.debug(`${socket.username} joined room ${roomId}`)
      } catch (err) {
        logger.error('join-room error:', err)
        socket.emit('error', { message: 'Failed to join room' })
      }
    })

    // ── OT OPERATION ──────────────────────────────────────────────────
    socket.on('op', ({ op, roomId: rid }) => {
      const roomId = rid || socket.roomId
      if (!roomId) return

      const engine = engines.get(roomId)
      if (!engine) return

      const transformed = engine.applyOp(op, op.revision)
      if (!transformed) return // op was rejected (no-op after transform)

      // Acknowledge to sender with the server revision
      socket.emit('op-ack', { revision: transformed.revision })

      // Broadcast transformed op to everyone else in the room
      socket.to(roomId).emit('op', { op: transformed })

      // Persist to DB every 50 revisions
      if (engine.revision % 50 === 0) {
        Room.findOneAndUpdate(
          { roomId },
          { content: engine.content, snapshot: engine.getSnapshot(), updatedAt: new Date() },
          { new: false }
        ).catch(err => logger.error('persist error:', err))
      }
    })

    // ── CURSOR MOVE ───────────────────────────────────────────────────
    socket.on('cursor', ({ position, selection }) => {
      if (!socket.roomId) return
      socket.to(socket.roomId).emit('cursor', {
        socketId: socket.id,
        userId: socket.userId,
        username: socket.username,
        color: socket.cursorColor,
        position,
        selection,
      })
    })

    // ── LANGUAGE CHANGE ───────────────────────────────────────────────
    socket.on('language-change', async ({ language }) => {
      if (!socket.roomId) return
      await Room.findOneAndUpdate({ roomId: socket.roomId }, { language })
      io.to(socket.roomId).emit('language-change', { language, changedBy: socket.username })

      // Log activity
      await logActivity(socket.roomId, 'language-changed', `Language changed to ${language} by ${socket.username}`, socket.username)
    })

    // ── CHAT HISTORY ──────────────────────────────────────────────────
    socket.on('chat-history', async ({ roomId }, callback) => {
      try {
        const messages = await Chat.find({ roomId }).sort({ timestamp: 1 }).limit(100).lean()
        callback(messages || [])
      } catch (err) {
        logger.error('chat-history error:', err)
        callback([])
      }
    })

    // ── CHAT MESSAGE ──────────────────────────────────────────────────
    socket.on('chat-message', async ({ roomId, message }, callback) => {
      try {
        if (!roomId || !message.text || !message.text.trim()) {
          return callback({ ok: false, error: 'Invalid message' })
        }

        const chatMsg = await Chat.create({
          roomId,
          username: socket.username,
          text: message.text.trim(),
          timestamp: new Date(),
        })

        // Broadcast to all users in the room
        io.to(roomId).emit('chat-message', {
          username: socket.username,
          text: chatMsg.text,
          timestamp: chatMsg.timestamp,
        })

        callback({ ok: true })
      } catch (err) {
        logger.error('chat-message error:', err)
        callback({ ok: false, error: 'Failed to save message' })
      }
    })

    // ── END ROOM ─────────────────────────────────────────────────────────
    socket.on('end-room', async () => {
      const roomId = socket.roomId
      if (!roomId) {
        return socket.emit('room-error', { message: 'You are not in a room' })
      }

      if (!socket.isAuthenticated) {
        return socket.emit('room-error', { message: 'You must be logged in to end a room' })
      }

      try {
        const room = await Room.findOne({ roomId })
        if (!room) {
          return socket.emit('room-error', { message: 'Room not found' })
        }

        if (room.createdBy !== socket.userId) {
          return socket.emit('room-error', { message: 'Only the room creator can end the room' })
        }

        await Room.findOneAndUpdate(
          { roomId, createdBy: socket.userId },
          { isEnded: true, $push: { activity: { type: 'ended', message: `Room ended by ${socket.username}`, user: socket.username } } }
        )
        io.to(roomId).emit('room-ended', { message: `${socket.username} ended the room` })
        await io.in(roomId).socketsLeave(roomId)
        roomUsers.delete(roomId)
        engines.delete(roomId)
      } catch (err) {
        logger.error('end-room error:', err)
        socket.emit('room-error', { message: 'Failed to end room' })
      }
    })

    // ── DISCONNECT ────────────────────────────────────────────────────
    socket.on('disconnect', async () => {
      const roomId = socket.roomId
      if (!roomId) return

      const users = roomUsers.get(roomId)
      if (users) {
        users.delete(socket.id)
        if (users.size === 0) {
          roomUsers.delete(roomId)
          // Final persist when last user leaves
          const engine = engines.get(roomId)
          if (engine) {
            await Room.findOneAndUpdate(
              { roomId },
              { content: engine.content, snapshot: engine.getSnapshot(), $set: { users: [] } }
            ).catch(err => logger.error('final persist error:', err))
            engines.delete(roomId)
          }
        }
      }

      socket.to(roomId).emit('user-left', {
        socketId: socket.id,
        userId: socket.userId,
        username: socket.username,
      })

      // Log activity
      await logActivity(roomId, 'left', `${socket.username} left the room`, socket.username)

      logger.debug(`${socket.username} left room ${roomId}`)
    })
  })

  return io
}

module.exports = { initSocket }
