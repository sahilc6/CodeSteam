# CodeSteam

Real-time collaborative code editor — Node.js · React · Socket.io · MongoDB ·

---

## Features

- Multi-user live editing with **Operational Transform** sync
- Room-based sessions with shareable links
- **Monaco Editor** with syntax highlighting for 10+ languages
- Sandboxed code execution (JavaScript, Python, Go, Java, C++, Rust, Ruby, PHP, Bash, C, TypeScript)
- Remote user cursors and selections
- Nginx reverse proxy with WebSocket support
- PM2 cluster mode — load tested to **200 concurrent users, sub-100ms latency**

---

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | React 18, Vite, Monaco Editor, Socket.io-client, Tailwind CSS, Zustand |
| Backend | Node.js, Express, Socket.io, Mongoose |
| Database | MongoDB (local) or MongoDB Atlas |
| Deployment | AWS EC2, Nginx, PM2 |
| Containerisation | Docker + Docker Compose (optional) |

---

## Quick Start (Local Development)

### Prerequisites
- Node.js >= 18
- MongoDB running locally (`mongod`) OR Docker

### 1. Clone and install
```bash
git clone https://github.com/YOUR_USERNAME/codesteam
cd codesteam
npm run install:all
```

### 2. Configure environment
```bash
cp server/.env.example server/.env
cp client/.env.example client/.env
# Edit server/.env — set MONGODB_URI and JWT_SECRET
```

### 3. Start development servers
```bash
npm run dev
# Frontend: http://localhost:5173
# Backend:  http://localhost:5000
```

### With Docker (no local MongoDB needed)
```bash
cd client && npm run build && cd ..
docker-compose up -d
# App available at http://localhost:80
```

---

## Project Structure

```
codesteam/
├── server/
│   └── src/
│       ├── index.js              # Entry point
│       ├── app.js                # Express app + middleware
│       ├── controllers/          # Route handlers
│       │   ├── authController.js
│       │   ├── roomController.js
│       │   └── executeController.js
│       ├── models/               # Mongoose schemas
│       │   ├── Room.js
│       │   └── User.js
│       ├── routes/               # Express routers
│       ├── socket/               # Socket.io server + OT sync
│       │   └── index.js
│       ├── sandbox/              # Code execution engine
│       │   └── runner.js
│       └── utils/
│           ├── ot.js             # Operational Transform engine
│           ├── auth.js           # JWT middleware
│           ├── db.js             # MongoDB connection
│           └── logger.js         # Winston logger
├── client/
│   └── src/
│       ├── App.jsx
│       ├── main.jsx
│       ├── components/
│       │   ├── Editor/
│       │   │   └── CollabEditor.jsx   # Monaco + OT client
│       │   ├── Room/
│       │   │   ├── RoomPage.jsx
│       │   │   ├── Toolbar.jsx
│       │   │   ├── UserList.jsx
│       │   │   └── OutputPanel.jsx
│       │   └── UI/
│       │       ├── HomePage.jsx
│       │       └── NotFound.jsx
│       ├── context/
│       │   ├── SocketContext.jsx
│       │   └── authStore.js       # Zustand auth store
│       └── hooks/
│           └── useOT.js           # Client-side OT state machine
├── nginx/
│   └── codesteam.conf            # Nginx reverse proxy config
├── scripts/
│   └── deploy.sh                  # Automated EC2 deployment
├── ecosystem.config.js            # PM2 cluster config
├── docker-compose.yml
├── Dockerfile
└── README.md
```

---

## AWS EC2 Deployment (Step by Step)

### Step 1 — Launch EC2 Instance

1. Go to AWS Console → EC2 → Launch Instance
2. Choose **Ubuntu Server 22.04 LTS (64-bit)**
3. Instance type: **t3.small** (2 vCPU, 2GB RAM) minimum; **t3.medium** recommended for 200 users
4. Key pair: create or select an existing `.pem` key
5. Security Group — allow these inbound rules:

| Type | Protocol | Port | Source |
|---|---|---|---|
| SSH | TCP | 22 | Your IP |
| HTTP | TCP | 80 | 0.0.0.0/0 |
| HTTPS | TCP | 443 | 0.0.0.0/0 |

6. Storage: 20GB gp3 minimum
7. Launch the instance

### Step 2 — SSH into instance
```bash
chmod 400 your-key.pem
ssh -i your-key.pem ubuntu@YOUR_EC2_PUBLIC_IP
```

### Step 3 — Push code to GitHub
```bash
# On your local machine
git init
git add .
git commit -m "initial commit"
git remote add origin https://github.com/YOUR_USERNAME/codesteam
git push -u origin main
```

### Step 4 — Run deployment script
```bash
# On the EC2 instance
# Edit the REPO_URL in scripts/deploy.sh first, then:
curl -fsSL https://raw.githubusercontent.com/YOUR_USERNAME/codesteam/main/scripts/deploy.sh | bash
```

Or manually:
```bash
bash scripts/deploy.sh
```

### Step 5 — Verify
```bash
pm2 status                     # Should show codesteam running
pm2 logs codesteam            # Check for errors
curl http://localhost/api/health  # Should return {"status":"ok"}
```

Visit `http://YOUR_EC2_PUBLIC_IP` — your app is live.

### Step 6 — (Optional) Add SSL with Let's Encrypt
```bash
sudo apt install certbot python3-certbot-nginx -y
sudo certbot --nginx -d yourdomain.com
# Certbot will auto-edit the Nginx config and set up renewal
```

---

## Environment Variables

### Server (`server/.env`)

| Variable | Description | Default |
|---|---|---|
| `PORT` | Server port | `5000` |
| `MONGODB_URI` | MongoDB connection string | `mongodb://localhost:27017/codesteam` |
| `JWT_SECRET` | JWT signing secret (**change in production**) | — |
| `JWT_EXPIRES_IN` | Token expiry | `7d` |
| `CORS_ORIGINS` | Comma-separated allowed origins | `http://localhost:5173` |
| `SANDBOX_TIMEOUT_MS` | Code execution timeout | `10000` |

### Client (`client/.env`)

| Variable | Description |
|---|---|
| `VITE_API_URL` | Backend API base URL (empty = same origin) |
| `VITE_WS_URL` | WebSocket URL (empty = same origin) |

---

## API Reference

| Method | Endpoint | Description |
|---|---|---|
| POST | `/api/auth/register` | Register user |
| POST | `/api/auth/login` | Login |
| GET | `/api/auth/me` | Get current user |
| POST | `/api/rooms` | Create room |
| GET | `/api/rooms` | List public rooms |
| GET | `/api/rooms/:roomId` | Get room details |
| DELETE | `/api/rooms/:roomId` | Delete room |
| POST | `/api/execute` | Execute code |
| GET | `/api/health` | Health check |

## Socket Events

| Event | Direction | Description |
|---|---|---|
| `join-room` | Client → Server | Join a room |
| `room-state` | Server → Client | Initial room content + users |
| `op` | Bidirectional | OT operation (insert/delete) |
| `op-ack` | Server → Client | Acknowledge op with server revision |
| `cursor` | Bidirectional | Cursor position update |
| `language-change` | Bidirectional | Change editor language |
| `user-joined` | Server → Client | Another user joined |
| `user-left` | Server → Client | User disconnected |

---

## Performance Notes

- PM2 cluster mode uses all available CPU cores
- OT engine snapshots every 50 revisions and on last-user-leave
- Rooms auto-expire from MongoDB after 7 days of inactivity
- Code output capped at 100KB, execution timeout 10s
- Nginx rate limits: 20 req/s on API, 5 req/s on WebSocket upgrades
