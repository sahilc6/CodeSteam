const request = require('supertest')
const mongoose = require('mongoose')

process.env.JWT_SECRET = process.env.JWT_SECRET || 'test_secret'

jest.mock('../../utils/mailer', () => ({
  sendVerificationEmail: jest.fn().mockResolvedValue({ messageId: 'test-message' }),
}))

const { sendVerificationEmail } = require('../../utils/mailer')
const User = require('../../models/User')
const app = require('../../app')

// Use a separate test DB
const TEST_DB = process.env.MONGODB_URI_TEST || 'mongodb://localhost:27017/codesteam_test'

beforeAll(async () => {
  await mongoose.connect(TEST_DB)
})

afterAll(async () => {
  await mongoose.connection.dropDatabase()
  await mongoose.disconnect()
})

// ── Health ──────────────────────────────────────────────────────────────
describe('GET /api/health', () => {
  it('returns ok', async () => {
    const res = await request(app).get('/api/health')
    expect(res.status).toBe(200)
    expect(res.body.status).toBe('ok')
  })
})

// ── Auth ────────────────────────────────────────────────────────────────
describe('Auth endpoints', () => {
  const user = { username: 'testuser', email: 'test@example.com', password: 'secret123' }
  let token
  let verificationToken

  describe('POST /api/auth/register', () => {
    it('registers a new user', async () => {
      const res = await request(app).post('/api/auth/register').send(user)
      expect(res.status).toBe(201)
      expect(res.body.message).toContain('verify your email')
      expect(sendVerificationEmail).toHaveBeenCalledWith(
        expect.objectContaining({
          to: user.email,
          username: user.username,
          verificationUrl: expect.stringContaining('/verify-email?token='),
        }),
      )

      const createdUser = await User.findOne({ email: user.email }).select(
        '+verificationToken +verificationTokenExpires',
      )
      verificationToken = createdUser.verificationToken
      expect(verificationToken).toBeTruthy()
      expect(createdUser.isVerified).toBe(false)
    })

    it('rejects duplicate email', async () => {
      const res = await request(app).post('/api/auth/register').send(user)
      expect(res.status).toBe(409)
    })

    it('validates required fields', async () => {
      const res = await request(app).post('/api/auth/register').send({ email: 'x@x.com' })
      expect(res.status).toBe(400)
    })

    it('rejects short password', async () => {
      const res = await request(app).post('/api/auth/register').send({
        username: 'newuser', email: 'new@example.com', password: '123',
      })
      expect(res.status).toBe(400)
    })
  })

  describe('POST /api/auth/login', () => {
    it('rejects login before email verification', async () => {
      const res = await request(app).post('/api/auth/login').send({
        email: user.email, password: user.password,
      })
      expect(res.status).toBe(403)
      expect(res.body.needsVerification).toBe(true)
    })

    it('verifies email with a valid token', async () => {
      const res = await request(app)
        .get('/api/auth/verify-email')
        .query({ token: verificationToken })
      expect(res.status).toBe(200)
      expect(res.body.message).toContain('Email verified successfully')
    })

    it('logs in with correct credentials', async () => {
      const res = await request(app).post('/api/auth/login').send({
        email: user.email, password: user.password,
      })
      expect(res.status).toBe(200)
      expect(res.body.token).toBeTruthy()
      token = res.body.token
    })

    it('rejects wrong password', async () => {
      const res = await request(app).post('/api/auth/login').send({
        email: user.email, password: 'wrongpass',
      })
      expect(res.status).toBe(401)
    })

    it('rejects unknown email', async () => {
      const res = await request(app).post('/api/auth/login').send({
        email: 'nobody@example.com', password: 'pass',
      })
      expect(res.status).toBe(401)
    })
  })

  describe('GET /api/auth/me', () => {
    it('returns current user with valid token', async () => {
      const res = await request(app)
        .get('/api/auth/me')
        .set('Authorization', `Bearer ${token}`)
      expect(res.status).toBe(200)
      expect(res.body.username).toBe('testuser')
    })

    it('rejects missing token', async () => {
      const res = await request(app).get('/api/auth/me')
      expect(res.status).toBe(401)
    })

    it('rejects invalid token', async () => {
      const res = await request(app)
        .get('/api/auth/me')
        .set('Authorization', 'Bearer badtoken')
      expect(res.status).toBe(401)
    })
  })
})

// ── Rooms ────────────────────────────────────────────────────────────────
describe('Room endpoints', () => {
  let token
  let joinerToken
  let joinerId
  let roomId

  beforeAll(async () => {
    const credentials = {
      username: 'roomowner', email: 'owner@example.com', password: 'secret123',
    }

    await request(app).post('/api/auth/register').send(credentials)

    const owner = await User.findOne({ email: credentials.email }).select(
      '+verificationToken',
    )
    await request(app)
      .get('/api/auth/verify-email')
      .query({ token: owner.verificationToken })

    const loginRes = await request(app).post('/api/auth/login').send({
      email: credentials.email,
      password: credentials.password,
    })
    token = loginRes.body.token

    const joinerCredentials = {
      username: 'joiner', email: 'joiner@example.com', password: 'secret123',
    }
    await request(app).post('/api/auth/register').send(joinerCredentials)

    const joiner = await User.findOne({ email: joinerCredentials.email }).select(
      '+verificationToken',
    )
    joinerId = joiner._id.toString()
    await request(app)
      .get('/api/auth/verify-email')
      .query({ token: joiner.verificationToken })

    const joinerLoginRes = await request(app).post('/api/auth/login').send({
      email: joinerCredentials.email,
      password: joinerCredentials.password,
    })
    joinerToken = joinerLoginRes.body.token
  })

  describe('POST /api/rooms', () => {
    it('creates a room (authenticated)', async () => {
      const res = await request(app)
        .post('/api/rooms')
        .set('Authorization', `Bearer ${token}`)
        .send({ name: 'Test Room', language: 'python' })
      expect(res.status).toBe(201)
      expect(res.body.roomId).toBeTruthy()
      expect(res.body.language).toBe('python')
      roomId = res.body.roomId
    })

    it('rejects unauthenticated room creation', async () => {
      const res = await request(app).post('/api/rooms').send({ name: 'No Auth' })
      expect(res.status).toBe(401)
    })

    it('rejects invalid language', async () => {
      const res = await request(app)
        .post('/api/rooms')
        .set('Authorization', `Bearer ${token}`)
        .send({ name: 'Bad Lang', language: 'cobol' })
      expect(res.status).toBe(400)
    })

    it('rejects missing name', async () => {
      const res = await request(app)
        .post('/api/rooms')
        .set('Authorization', `Bearer ${token}`)
        .send({ language: 'javascript' })
      expect(res.status).toBe(400)
    })
  })

  describe('GET /api/rooms/:roomId', () => {
    it('rejects unauthenticated room access', async () => {
      const res = await request(app).get(`/api/rooms/${roomId}`)
      expect(res.status).toBe(401)
    })

    it('returns room by id for the creator', async () => {
      const res = await request(app)
        .get(`/api/rooms/${roomId}`)
        .set('Authorization', `Bearer ${token}`)
      expect(res.status).toBe(200)
      expect(res.body.roomId).toBe(roomId)
      expect(res.body.language).toBe('python')
      expect(res.body.role).toBe('creator')
    })

    it('returns 404 for unknown room', async () => {
      const res = await request(app)
        .get('/api/rooms/does-not-exist')
        .set('Authorization', `Bearer ${token}`)
      expect(res.status).toBe(404)
    })

    it('requires creator approval before a joiner can access', async () => {
      const denied = await request(app)
        .get(`/api/rooms/${roomId}`)
        .set('Authorization', `Bearer ${joinerToken}`)
      expect(denied.status).toBe(403)
      expect(denied.body.accessStatus).toBe('request-needed')

      const requested = await request(app)
        .post(`/api/rooms/${roomId}/request`)
        .set('Authorization', `Bearer ${joinerToken}`)
      expect(requested.status).toBe(201)
      expect(requested.body.accessStatus).toBe('pending')

      const pending = await request(app)
        .get(`/api/rooms/${roomId}`)
        .set('Authorization', `Bearer ${joinerToken}`)
      expect(pending.status).toBe(403)
      expect(pending.body.accessStatus).toBe('pending')

      const allowed = await request(app)
        .post(`/api/rooms/${roomId}/requests/${joinerId}/allow`)
        .set('Authorization', `Bearer ${token}`)
      expect(allowed.status).toBe(200)

      const joined = await request(app)
        .get(`/api/rooms/${roomId}`)
        .set('Authorization', `Bearer ${joinerToken}`)
      expect(joined.status).toBe(200)
      expect(joined.body.role).toBe('joiner')

      const removed = await request(app)
        .delete(`/api/rooms/${roomId}/joiners/${joinerId}`)
        .set('Authorization', `Bearer ${token}`)
      expect(removed.status).toBe(200)

      const removedAccess = await request(app)
        .get(`/api/rooms/${roomId}`)
        .set('Authorization', `Bearer ${joinerToken}`)
      expect(removedAccess.status).toBe(403)
      expect(removedAccess.body.accessStatus).toBe('request-needed')
    })
  })

  describe('GET /api/rooms', () => {
    it('does not list live private rooms publicly', async () => {
      const res = await request(app).get('/api/rooms')
      expect(res.status).toBe(200)
      expect(Array.isArray(res.body)).toBe(true)
      expect(res.body.length).toBe(0)
    })
  })

  describe('DELETE /api/rooms/:roomId', () => {
    it('deletes own room', async () => {
      const res = await request(app)
        .delete(`/api/rooms/${roomId}`)
        .set('Authorization', `Bearer ${token}`)
      expect(res.status).toBe(200)
    })

    it('returns 404 after deletion', async () => {
      const res = await request(app)
        .get(`/api/rooms/${roomId}`)
        .set('Authorization', `Bearer ${token}`)
      expect(res.status).toBe(404)
    })
  })
})

// ── Execute ──────────────────────────────────────────────────────────────
describe('POST /api/execute', () => {
  it('runs JavaScript and returns output', async () => {
    const res = await request(app).post('/api/execute').send({
      language: 'javascript',
      code: 'console.log("integration test")',
    })
    expect(res.status).toBe(200)
    expect(res.body.stdout.trim()).toBe('integration test')
    expect(res.body.exitCode).toBe(0)
  }, 15000)

  it('runs Python', async () => {
    const res = await request(app).post('/api/execute').send({
      language: 'python',
      code: 'print(40 + 2)',
    })
    expect(res.status).toBe(200)
    expect(res.body.stdout.trim()).toBe('42')
  }, 15000)

  it('returns stderr for broken code', async () => {
    const res = await request(app).post('/api/execute').send({
      language: 'javascript',
      code: 'undefined.property',
    })
    expect(res.status).toBe(200)
    expect(res.body.exitCode).not.toBe(0)
    expect(res.body.stderr.length).toBeGreaterThan(0)
  }, 15000)

  it('rejects unsupported language', async () => {
    const res = await request(app).post('/api/execute').send({
      language: 'fortran',
      code: 'PRINT *, "hi"',
    })
    expect(res.status).toBe(400)
  })

  it('rejects missing code', async () => {
    const res = await request(app).post('/api/execute').send({ language: 'python' })
    expect(res.status).toBe(400)
  })
})
