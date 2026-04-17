const request = require('supertest')
const mongoose = require('mongoose')
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

  describe('POST /api/auth/register', () => {
    it('registers a new user', async () => {
      const res = await request(app).post('/api/auth/register').send(user)
      expect(res.status).toBe(201)
      expect(res.body.token).toBeTruthy()
      expect(res.body.user.username).toBe('testuser')
      token = res.body.token
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
    it('logs in with correct credentials', async () => {
      const res = await request(app).post('/api/auth/login').send({
        email: user.email, password: user.password,
      })
      expect(res.status).toBe(200)
      expect(res.body.token).toBeTruthy()
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
  let roomId

  beforeAll(async () => {
    const res = await request(app).post('/api/auth/register').send({
      username: 'roomowner', email: 'owner@example.com', password: 'secret123',
    })
    token = res.body.token
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
    it('returns room by id', async () => {
      const res = await request(app).get(`/api/rooms/${roomId}`)
      expect(res.status).toBe(200)
      expect(res.body.roomId).toBe(roomId)
      expect(res.body.language).toBe('python')
    })

    it('returns 404 for unknown room', async () => {
      const res = await request(app).get('/api/rooms/does-not-exist')
      expect(res.status).toBe(404)
    })
  })

  describe('GET /api/rooms', () => {
    it('lists public rooms', async () => {
      const res = await request(app).get('/api/rooms')
      expect(res.status).toBe(200)
      expect(Array.isArray(res.body)).toBe(true)
      expect(res.body.length).toBeGreaterThan(0)
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
      const res = await request(app).get(`/api/rooms/${roomId}`)
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
