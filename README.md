# CodeSteam

CodeSteam is a real-time collaborative code editor built with React, Monaco Editor, Node.js, Socket.IO, and MongoDB.

It supports private coding rooms, approval-based joining, live collaborative editing with Operational Transform, remote cursors, chat, and bounded multi-language code execution.

---

## Features

- Real-time multi-user editing with a custom Operational Transform engine
- Room-based collaboration with shareable room IDs
- Approval flow for joiners before they can enter a room
- Monaco Editor with syntax highlighting for multiple languages
- Remote user cursors and selections
- Room chat with persisted message history
- JWT authentication with email verification
- Bounded code execution with timeouts, output caps, and temporary files
- MongoDB persistence for rooms, users, activity, chat, and per-language file state
- Docker Compose setup with MongoDB, Node.js, and Nginx reverse proxy
- AWS EC2 deployment notes with PM2 and Nginx

> Note: the code runner is suitable for a controlled project/demo environment. For an internet-facing production system, run untrusted code in stronger isolation such as per-run containers or dedicated workers with CPU/memory/network limits.

---

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | React 18, Vite, Monaco Editor, Socket.IO Client, Tailwind CSS, Zustand |
| Backend | Node.js, Express, Socket.IO, Mongoose |
| Database | MongoDB or MongoDB Atlas |
| Auth | JWT, bcrypt, email verification |
| Testing | Jest, Supertest |
| Deployment | Docker, Docker Compose, Nginx, PM2, AWS EC2 |

---

## Project Highlights

This project demonstrates:

- Realtime event-driven backend design with Socket.IO
- Conflict handling for collaborative text editing through Operational Transform
- REST API design with validation, auth middleware, and access control
- MongoDB schema design for users, rooms, join requests, activity, and chat
- Multi-language code execution with runtime limits
- Containerized deployment and reverse proxy configuration
- Integration and unit testing for API, auth, room access, OT, and execution logic

---

## Quick Start

### Prerequisites

- Node.js 18+
- MongoDB running locally, or Docker
- SMTP credentials if you want email verification to send real emails

### 1. Install dependencies

```bash
npm run install:all
```

### 2. Configure environment

Create local environment files from the examples:

```bash
cp server/.env.example server/.env
cp client/.env.example client/.env
```

At minimum, set these server values:

```env
MONGODB_URI=mongodb://localhost:27017/codesteam
JWT_SECRET=replace-with-a-long-random-secret
CORS_ORIGINS=http://localhost:5173
```

### 3. Start development servers

```bash
npm run dev
```

Frontend: `http://localhost:5173`

Backend: `http://localhost:5000`

---

## Render + Vercel Deployment

Use this split for hosted deployment:

- Vercel serves the React frontend.
- Render runs the backend as a Docker web service.
- MongoDB should be hosted separately, for example MongoDB Atlas.

The Render backend image installs all supported language runtimes. That means users can run Python, Java, C++, Rust, Go, and the other supported languages without those runtimes being installed on the host machine.

For Render, use:

```env
CODE_RUNNER_MODE=local
ALLOW_LOCAL_CODE_EXECUTION=true
SANDBOX_RUN_AS_USER=sandbox:sandbox
```

In this mode, "local" means inside the Render Docker container, not on your laptop. The container includes the runtimes and runs submitted code from a temp directory under a separate low-privilege user.

Set these frontend env vars in Vercel:

```env
VITE_API_URL=https://your-render-service.onrender.com
VITE_WS_URL=https://your-render-service.onrender.com
```

Set `CORS_ORIGINS` and `CLIENT_URL` on Render to your Vercel URL.

This repo includes [render.yaml](render.yaml) for a Docker-based Render service. Fill all `sync: false` secrets in the Render Dashboard.

---

## Docker Compose

For a self-hosted/VPS-style local run with Docker-per-execution isolation:

```bash
docker build -f Dockerfile.sandbox -t codesteam-sandbox:latest .
docker compose --env-file .env.compose up -d --build
```

The app will be served through Nginx on:

```text
http://localhost
```

Keep `.env.compose` local. Do not commit real secrets.

In Docker Compose mode, the code runner can use short-lived Docker containers. Each execution runs with network disabled, memory/CPU/PID limits, dropped Linux capabilities, a read-only root filesystem, and a temporary writable `/tmp`.

If you run the app through Docker Compose, the server container needs access to the Docker socket so it can start those isolated execution containers. Treat Docker socket access as privileged infrastructure access and only expose the API behind authentication, rate limiting, and trusted deployment controls.

On Linux, set `DOCKER_GID` in `.env.compose` to the group id of `/var/run/docker.sock` so the non-root server user can access Docker:

```bash
stat -c '%g' /var/run/docker.sock
```

---

## Testing

Build the frontend:

```bash
npm run build
```

Run server tests:

```bash
npm --prefix server test -- --runInBand
```

Some code-execution tests depend on Linux runtime commands such as `python3` and `bash`. For the most reliable results, run the full backend test suite in a Linux/Docker environment where the language runtimes are installed.

Recommended next improvement: add GitHub Actions that runs build, unit tests, API tests, and Docker-based code-runner tests.

---

## Project Structure

```text
codesteam/
|-- client/
|   `-- src/
|       |-- components/
|       |   |-- Editor/
|       |   |-- Room/
|       |   `-- UI/
|       |-- context/
|       |-- hooks/
|       `-- utils/
|-- server/
|   `-- src/
|       |-- controllers/
|       |-- models/
|       |-- routes/
|       |-- sandbox/
|       |-- socket/
|       |-- utils/
|       `-- __tests__/
|-- nginx/
|-- scripts/
|-- Dockerfile
|-- docker-compose.yml
`-- package.json
```

---

## Environment Variables

### Server

| Variable | Description | Default |
|---|---|---|
| `PORT` | Backend port | `5000` |
| `MONGODB_URI` | MongoDB connection string | `mongodb://localhost:27017/codesteam` |
| `JWT_SECRET` | JWT signing secret | Required |
| `JWT_EXPIRES_IN` | Token lifetime | `7d` |
| `CORS_ORIGINS` | Comma-separated allowed origins | `http://localhost:5173` |
| `CLIENT_URL` | Public frontend URL for email links | Request host fallback |
| `SMTP_HOST` | SMTP host for verification emails | Required for real email |
| `SMTP_PORT` | SMTP port | `587` |
| `SMTP_USER` | SMTP username | Required for real email |
| `SMTP_PASS` | SMTP password | Required for real email |
| `MAIL_FROM` | Sender email address | SMTP user fallback |
| `SANDBOX_TIMEOUT_MS` | Code execution timeout | `10000` |
| `CODE_RUNNER_MODE` | `local` for Render Docker image, `docker` for self-hosted Docker-per-run | `local` on Render |
| `ALLOW_LOCAL_CODE_EXECUTION` | Required when using `CODE_RUNNER_MODE=local` in production | `false` |
| `SANDBOX_RUN_AS_USER` | Linux user used for local execution inside the backend container | `sandbox:sandbox` on Render |
| `SANDBOX_DOCKER_IMAGE` | Docker image used for code execution | `codesteam-sandbox:latest` |
| `SANDBOX_DOCKER_MEMORY` | Per-execution memory limit | `256m` |
| `SANDBOX_DOCKER_CPUS` | Per-execution CPU limit | `0.5` |
| `SANDBOX_DOCKER_PIDS_LIMIT` | Per-execution process limit | `64` |

### Client

| Variable | Description |
|---|---|
| `VITE_API_URL` | Backend API base URL. Empty means same origin. |
| `VITE_WS_URL` | WebSocket URL. Empty means same origin. |

---

## API Overview

| Method | Endpoint | Description |
|---|---|---|
| `POST` | `/api/auth/register` | Register a user |
| `GET` | `/api/auth/verify-email` | Verify email token |
| `POST` | `/api/auth/login` | Login |
| `GET` | `/api/auth/me` | Current user |
| `POST` | `/api/rooms` | Create a room |
| `GET` | `/api/rooms/my` | List rooms for current user |
| `GET` | `/api/rooms/:roomId` | Get room details/access status |
| `POST` | `/api/rooms/:roomId/request` | Request room access |
| `POST` | `/api/rooms/:roomId/requests/:userId/allow` | Approve join request |
| `POST` | `/api/rooms/:roomId/requests/:userId/deny` | Deny join request |
| `DELETE` | `/api/rooms/:roomId/joiners/:userId` | Remove a joiner |
| `DELETE` | `/api/rooms/:roomId` | Delete a room |
| `POST` | `/api/execute` | Execute code |
| `GET` | `/api/health` | Health check |

---

## Socket Events

| Event | Direction | Description |
|---|---|---|
| `join-room` | Client to Server | Join an approved room |
| `room-state` | Server to Client | Initial room content and user state |
| `op` | Both | Collaborative edit operation |
| `op-ack` | Server to Client | Acknowledge operation revision |
| `cursor` | Both | Cursor and selection updates |
| `language-change` | Both | Change current room language |
| `chat-history` | Client to Server | Fetch room chat history |
| `chat-message` | Both | Send and receive chat messages |
| `user-joined` | Server to Client | User joined notification |
| `user-left` | Server to Client | User left notification |
| `room-ended` | Server to Client | Room ended notification |

---

## Git Hygiene

The repository intentionally ignores:

- Local environment files and secrets
- `node_modules`
- Build output such as `dist`
- Coverage reports
- Logs and runtime temp files
- Local Docker override files
- Private keys and certificates

Before pushing to GitHub, check:

```bash
git status --short
```

Only source code, docs, examples, config templates, and deployment definitions should be committed.

---

## Resume Summary

Suggested resume bullet:

```text
Built CodeSteam, a real-time collaborative code editor using React, Monaco Editor, Node.js, Socket.IO, and MongoDB, with custom Operational Transform sync, JWT auth, approval-based room access, chat, bounded multi-language code execution, and Docker/Nginx deployment.
```

---

## Roadmap

- Add Socket.IO integration tests for room joining, edit broadcasting, chat, and end-room permissions
- Add GitHub Actions CI
- Run code execution in isolated worker containers for stronger sandboxing
- Add benchmark scripts for collaborative editing load tests
- Add a short demo GIF or screenshots to the README
