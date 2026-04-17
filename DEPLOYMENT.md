# CodeSteam — EC2 Deployment Runbook

Complete step-by-step guide to take a fresh AWS account to a live, SSL-secured CodeSteam deployment.

---

## Prerequisites

- AWS account with console access
- A GitHub account (to push code and use CI/CD)
- (Optional) A domain name pointed at Route 53 or your registrar

---

## Part 1 — AWS EC2 Setup

### 1.1 Launch an EC2 instance

1. Go to **AWS Console → EC2 → Launch Instance**
2. Settings:

| Field | Value |
|---|---|
| Name | `codesteam-prod` |
| AMI | **Ubuntu Server 22.04 LTS (64-bit x86)** |
| Instance type | **t3.small** (min) or **t3.medium** (recommended for 200 users) |
| Key pair | Create new → `codesteam-key` → download `.pem` |
| Storage | 20 GB gp3 |

3. **Network settings → Edit → Add rules:**

| Type | Port | Source | Note |
|---|---|---|---|
| SSH | 22 | My IP | Replace with your IP |
| HTTP | 80 | 0.0.0.0/0, ::/0 | Public |
| HTTPS | 443 | 0.0.0.0/0, ::/0 | Public |

4. Click **Launch Instance**. Wait ~60 seconds for it to reach **Running** state.

### 1.2 Allocate and associate an Elastic IP

An Elastic IP ensures your server's public IP never changes (important for DNS).

1. EC2 → **Elastic IPs → Allocate Elastic IP address** → Allocate
2. Select the new IP → **Actions → Associate Elastic IP address**
3. Select your instance → Associate
4. Note the IP — you'll use it everywhere below as `YOUR_EC2_IP`

### 1.3 Connect via SSH

```bash
chmod 400 ~/Downloads/codesteam-key.pem

ssh -i ~/Downloads/codesteam-key.pem ubuntu@YOUR_EC2_IP
```

---

## Part 2 — Automated Deployment

### 2.1 Push your code to GitHub

On your local machine:

```bash
cd codesteam

git init
git add .
git commit -m "feat: initial CodeSteam implementation"

# Create a new repo at github.com/YOUR_USERNAME/codesteam first, then:
git remote add origin https://github.com/YOUR_USERNAME/codesteam.git
git branch -M main
git push -u origin main
```

### 2.2 Edit deploy.sh

Before running the script, update the `REPO_URL` at the top:

```bash
# On your EC2 instance:
git clone https://github.com/YOUR_USERNAME/codesteam.git /opt/codesteam
cd /opt/codesteam

# Edit the repo URL
nano scripts/deploy.sh
# Change: REPO_URL="https://github.com/YOUR_USERNAME/codesteam.git"
```

### 2.3 Run the deployment script

```bash
sudo bash scripts/deploy.sh
```

This single command will:
- Install Node.js 20, MongoDB 7, all language runtimes
- Install PM2 and configure it to start on reboot
- Build the React frontend
- Configure Nginx as reverse proxy
- Start the server in PM2 cluster mode
- Auto-generate a JWT secret

**Expected output (last few lines):**
```
╔══════════════════════════════════════════╗
║  CodeSteam is live!                     ║
╚══════════════════════════════════════════╝

  URL:       http://YOUR_EC2_IP
  Health:    http://YOUR_EC2_IP/api/health
```

### 2.4 Verify the deployment

```bash
# On EC2:
bash scripts/healthcheck.sh localhost

# From your laptop:
bash scripts/healthcheck.sh YOUR_EC2_IP
```

All checks should show ✓.

---

## Part 3 — SSL with Let's Encrypt (requires a domain)

### 3.1 Point your domain to EC2

Add an **A record** in your DNS provider:

| Type | Name | Value | TTL |
|---|---|---|---|
| A | `@` (or `codesteam`) | `YOUR_EC2_IP` | 300 |

Wait for DNS to propagate (2–5 minutes for TTL=300). Verify:

```bash
dig +short yourdomain.com    # Should return YOUR_EC2_IP
```

### 3.2 Run certbot

```bash
sudo apt install -y certbot python3-certbot-nginx
sudo certbot --nginx -d yourdomain.com --redirect
```

Certbot will:
- Issue a free TLS certificate from Let's Encrypt
- Edit your Nginx config to add HTTPS
- Set up auto-renewal (via cron or systemd timer)

### 3.3 Update CORS origins

```bash
nano /opt/codesteam/server/.env
# Update: CORS_ORIGINS=https://yourdomain.com
```

Reload the server:
```bash
pm2 reload codesteam --update-env
```

### 3.4 Test HTTPS

```bash
bash /opt/codesteam/scripts/healthcheck.sh yourdomain.com
curl -I https://yourdomain.com/api/health
# Should show: HTTP/2 200
```

---

## Part 4 — CI/CD with GitHub Actions

### 4.1 Add GitHub Secrets

Go to your repo → **Settings → Secrets and variables → Actions → New repository secret**

| Secret name | Value |
|---|---|
| `EC2_HOST` | Your EC2 Elastic IP or domain |
| `EC2_USER` | `ubuntu` |
| `EC2_SSH_KEY` | Contents of your `.pem` file (the whole file including headers) |
| `EC2_PORT` | `22` |

### 4.2 How the pipeline works

Every push to `main`:

```
push to main
    │
    ├── test-backend     → runs OT unit tests + sandbox tests + API integration tests
    ├── build-frontend   → npm run build (validates no build errors)
    │
    └── (both pass?) ──→ docker-build → deploy
                                            │
                                            └── SSH into EC2
                                                git pull
                                                npm ci
                                                npm run build
                                                pm2 reload (zero-downtime)
                                                healthcheck.sh
```

Pull requests only run `test-backend` and `build-frontend` — no deploy.

### 4.3 Manual deploy

If you need to deploy without going through CI:

```bash
# On EC2:
cd /opt/codesteam
git pull origin main
cd server && npm ci --omit=dev && cd ..
cd client && npm ci && npm run build && sudo cp -r dist/. /var/www/codesteam/ && cd ..
pm2 reload codesteam --update-env
bash scripts/healthcheck.sh localhost
```

---

## Part 5 — Operations

### Logs

```bash
# PM2 live logs
pm2 logs codesteam

# Last 200 lines of errors only
pm2 logs codesteam --err --lines 200

# Nginx access log
sudo tail -f /var/log/nginx/access.log

# Nginx error log
sudo tail -f /var/log/nginx/error.log

# MongoDB log
sudo tail -f /var/log/mongodb/mongod.log
```

### Process management

```bash
pm2 status                          # Overview
pm2 reload codesteam --update-env  # Zero-downtime reload (reads new .env)
pm2 restart codesteam              # Hard restart (brief downtime)
pm2 stop codesteam                 # Stop
pm2 delete codesteam               # Remove from PM2
pm2 start ecosystem.config.js       # Start fresh
pm2 save                            # Persist current PM2 config across reboots
```

### Database

```bash
# Connect to MongoDB
mongosh codesteam

# Useful queries:
db.rooms.find().sort({updatedAt:-1}).limit(10)    # Recent rooms
db.rooms.countDocuments()                          # Total rooms
db.users.countDocuments()                          # Total users

# Backup
mongodump --db codesteam --out /tmp/backup-$(date +%Y%m%d)

# Restore
mongorestore --db codesteam /tmp/backup-20240101/codesteam/
```

### Rollback

```bash
# Roll back to previous commit
sudo bash /opt/codesteam/scripts/rollback.sh

# Roll back to specific commit
sudo bash /opt/codesteam/scripts/rollback.sh abc1234
```

### Scaling

The server runs in PM2 cluster mode using all available CPUs. To scale vertically:

1. Stop the instance in AWS Console
2. Change instance type (e.g. `t3.small` → `t3.medium`)
3. Start the instance
4. PM2 auto-starts via systemd — no action needed

For horizontal scaling (multiple EC2 instances behind a load balancer), Socket.io requires a shared adapter. Add the Redis adapter to `server/src/socket/index.js`:

```javascript
const { createAdapter } = require('@socket.io/redis-adapter')
const { createClient }  = require('redis')

const pubClient = createClient({ url: process.env.REDIS_URL })
const subClient = pubClient.duplicate()
await Promise.all([pubClient.connect(), subClient.connect()])
io.adapter(createAdapter(pubClient, subClient))
```

And add `@socket.io/redis-adapter` and `redis` to `server/package.json`.

---

## Part 6 — Cost estimate

| Resource | Type | Monthly cost (USD) |
|---|---|---|
| EC2 t3.small | Compute | ~$15 |
| EBS 20GB gp3 | Storage | ~$1.60 |
| Elastic IP | Networking | Free (while associated) |
| Data transfer | First 100GB | Free |
| **Total** | | **~$17/month** |

Use **t3.small** for up to ~100 concurrent users. **t3.medium** (~$30/month) for 200+ users comfortably.

---

## Troubleshooting

| Symptom | Likely cause | Fix |
|---|---|---|
| `502 Bad Gateway` | Server not running or crashed | `pm2 status` → `pm2 restart codesteam` |
| WebSocket connects then immediately disconnects | CORS mismatch | Check `CORS_ORIGINS` in `server/.env` |
| `mongod: command not found` | MongoDB not installed | Re-run `scripts/deploy.sh` |
| Frontend loads but API calls fail | Nginx not proxying `/api/` | `nginx -t && sudo nginx -s reload` |
| `EADDRINUSE: port 5000` | Old process still running | `pm2 delete all && pm2 start ecosystem.config.js` |
| SSL certificate expired | Auto-renewal failed | `sudo certbot renew --force-renewal` |
| Code execution always times out | Runtimes not installed | `which python3 node go ruby` — install missing |
