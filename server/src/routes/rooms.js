const router = require('express').Router()
const {
  createRoom,
  getRoom,
  listRooms,
  getMyRooms,
  requestToJoin,
  allowJoinRequest,
  denyJoinRequest,
  removeJoiner,
  deleteRoom,
} = require('../controllers/roomController')
const { authMiddleware } = require('../utils/auth')

router.post('/', authMiddleware, createRoom)
router.get('/', listRooms)
router.get('/my', authMiddleware, getMyRooms)
router.get('/:roomId', authMiddleware, getRoom)
router.post('/:roomId/request', authMiddleware, requestToJoin)
router.post('/:roomId/requests/:userId/allow', authMiddleware, allowJoinRequest)
router.post('/:roomId/requests/:userId/deny', authMiddleware, denyJoinRequest)
router.delete('/:roomId/joiners/:userId', authMiddleware, removeJoiner)
router.delete('/:roomId', authMiddleware, deleteRoom)

module.exports = router
