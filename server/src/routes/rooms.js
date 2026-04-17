const router = require('express').Router()
const { createRoom, getRoom, listRooms, getMyRooms, deleteRoom } = require('../controllers/roomController')
const { authMiddleware, optionalAuth } = require('../utils/auth')

router.post('/', authMiddleware, createRoom)
router.get('/', listRooms)
router.get('/my', authMiddleware, getMyRooms)
router.get('/:roomId', optionalAuth, getRoom)
router.delete('/:roomId', authMiddleware, deleteRoom)

module.exports = router
