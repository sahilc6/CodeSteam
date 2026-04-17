#!/bin/bash
# ─────────────────────────────────────────────────────────────────────────────
#  CodeSteam — AWS EC2 Ubuntu 22.04 deployment script
#  Idempotent: safe to re-run on updates
#
#  Usage:
#    1. SSH into your EC2 instance
#    2. git clone https://github.com/YOUR/codesteam
#    3. cd codesteam && bash scripts/deploy.sh
# ─────────────────────────────────────────────────────────────────────────────
set -euo pipefail

# ── Config — edit these ───────────────────────────────────────────────────
REPO_URL="https://github.com/YOUR_USERNAME/codesteam.git"
APP_DIR="/opt/codesteam"
NODE_VERSION="20"
DEPLOY_MODE="${DEPLOY_MODE:-pm2}"   # "pm2" or "docker"
DOMAIN="${DOMAIN:-}"                 # Set to enable SSL e.g. "myapp.com"
# ──────────────────────────────────────────────────────────────────────────

RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; BLUE='\033[0;34m'; NC='\033[0m'
log()  { echo -e "\n${GREEN}[+]${NC} $*"; }
warn() { echo -e "${YELLOW}[!]${NC} $*"; }
err()  { echo -e "${RED}[✗]${NC} $*"; exit 1; }
step() { echo -e "\n${BLUE}━━━ $* ━━━${NC}"; }

require_root() { [ "$EUID" -eq 0 ] || err "Run as root or with sudo"; }

# ─────────────────────────────────────────────────────────────────────────────
step "1 · System update"
# ─────────────────────────────────────────────────────────────────────────────
apt-get update -qq
apt-get upgrade -y -qq
apt-get install -y -qq curl git wget unzip bc nginx

# ─────────────────────────────────────────────────────────────────────────────
step "2 · Node.js $NODE_VERSION"
# ─────────────────────────────────────────────────────────────────────────────
if ! command -v node &>/dev/null || [[ "$(node -v)" != v${NODE_VERSION}* ]]; then
  curl -fsSL https://deb.nodesource.com/setup_${NODE_VERSION}.x | bash -
  apt-get install -y nodejs
  log "Node.js $(node -v) installed"
else
  log "Node.js $(node -v) already installed"
fi

# ─────────────────────────────────────────────────────────────────────────────
step "3 · MongoDB 7"
# ─────────────────────────────────────────────────────────────────────────────
if ! command -v mongod &>/dev/null; then
  curl -fsSL https://www.mongodb.org/static/pgp/server-7.0.asc \
    | gpg -o /usr/share/keyrings/mongodb-server-7.0.gpg --dearmor
  echo "deb [ arch=amd64,arm64 signed-by=/usr/share/keyrings/mongodb-server-7.0.gpg ] \
https://repo.mongodb.org/apt/ubuntu jammy/mongodb-org/7.0 multiverse" \
    | tee /etc/apt/sources.list.d/mongodb-org-7.0.list
  apt-get update -qq && apt-get install -y mongodb-org
  systemctl enable mongod && systemctl start mongod
  # Wait for MongoDB to be ready
  for i in $(seq 1 10); do
    mongosh --eval "db.adminCommand('ping')" --quiet && break
    sleep 2
  done
  log "MongoDB $(mongod --version | head -1) started"
else
  log "MongoDB already installed"
  systemctl start mongod 2>/dev/null || true
fi

# ─────────────────────────────────────────────────────────────────────────────
step "4 · Language runtimes (for code execution sandbox)"
# ─────────────────────────────────────────────────────────────────────────────
apt-get install -y -qq \
  python3 python3-pip \
  gcc g++ make \
  default-jdk \
  golang-go \
  ruby \
  php \
  rustc \
  bash
log "Runtimes installed"

# ─────────────────────────────────────────────────────────────────────────────
step "5 · PM2"
# ─────────────────────────────────────────────────────────────────────────────
if ! command -v pm2 &>/dev/null; then
  npm install -g pm2
  # Set up PM2 to auto-start on reboot
  PM2_STARTUP=$(pm2 startup systemd -u "$SUDO_USER" --hp "/home/$SUDO_USER" 2>/dev/null | grep "sudo env")
  [ -n "$PM2_STARTUP" ] && eval "$PM2_STARTUP" || true
  log "PM2 installed"
else
  log "PM2 already installed ($(pm2 -v))"
fi

# ─────────────────────────────────────────────────────────────────────────────
step "6 · Clone / update repo"
# ─────────────────────────────────────────────────────────────────────────────
if [ -d "$APP_DIR/.git" ]; then
  log "Pulling latest code..."
  cd "$APP_DIR"
  sudo -u "$SUDO_USER" git pull origin main
else
  log "Cloning repository..."
  mkdir -p "$(dirname "$APP_DIR")"
  git clone "$REPO_URL" "$APP_DIR"
  chown -R "$SUDO_USER:$SUDO_USER" "$APP_DIR"
fi
cd "$APP_DIR"

# ─────────────────────────────────────────────────────────────────────────────
step "7 · Install dependencies"
# ─────────────────────────────────────────────────────────────────────────────
log "Server dependencies..."
cd "$APP_DIR/server" && sudo -u "$SUDO_USER" npm ci --omit=dev

log "Client dependencies..."
cd "$APP_DIR/client" && sudo -u "$SUDO_USER" npm ci

# ─────────────────────────────────────────────────────────────────────────────
step "8 · Build React frontend"
# ─────────────────────────────────────────────────────────────────────────────
cd "$APP_DIR/client"

# Write client .env (same-origin API — Nginx handles routing)
cat > .env <<EOF
VITE_API_URL=
VITE_WS_URL=
EOF

sudo -u "$SUDO_USER" npm run build
mkdir -p /var/www/codesteam
cp -r dist/. /var/www/codesteam/
log "React build deployed to /var/www/codesteam"

# ─────────────────────────────────────────────────────────────────────────────
step "9 · Server environment"
# ─────────────────────────────────────────────────────────────────────────────
cd "$APP_DIR"
ENV_FILE="server/.env"

if [ ! -f "$ENV_FILE" ]; then
  warn "Creating $ENV_FILE — review and update before going live!"
  JWT_SECRET=$(openssl rand -hex 32)
  cat > "$ENV_FILE" <<EOF
NODE_ENV=production
PORT=5000
MONGODB_URI=mongodb://localhost:27017/codesteam
JWT_SECRET=$JWT_SECRET
JWT_EXPIRES_IN=7d
CORS_ORIGINS=http://$(curl -s ifconfig.me 2>/dev/null || echo 'YOUR_EC2_IP')
SANDBOX_TIMEOUT_MS=10000
RATE_LIMIT_WINDOW_MS=900000
RATE_LIMIT_MAX_REQUESTS=100
EOF
  chown "$SUDO_USER:$SUDO_USER" "$ENV_FILE"
  chmod 600 "$ENV_FILE"
  warn "JWT_SECRET auto-generated. Check $ENV_FILE before production traffic."
else
  log "$ENV_FILE already exists — skipping"
fi

mkdir -p "$APP_DIR/logs"
chown -R "$SUDO_USER:$SUDO_USER" "$APP_DIR/logs"

# ─────────────────────────────────────────────────────────────────────────────
step "10 · Nginx"
# ─────────────────────────────────────────────────────────────────────────────
cp "$APP_DIR/nginx/nginx.conf"       /etc/nginx/nginx.conf
cp "$APP_DIR/nginx/codesteam.conf"  /etc/nginx/conf.d/codesteam.conf
cp "$APP_DIR/nginx/locations.conf"   /etc/nginx/conf.d/locations.conf
rm -f /etc/nginx/sites-enabled/default /etc/nginx/conf.d/default.conf

nginx -t && systemctl reload nginx
log "Nginx configured and reloaded"

# ─────────────────────────────────────────────────────────────────────────────
step "11 · Start application with PM2"
# ─────────────────────────────────────────────────────────────────────────────
cd "$APP_DIR"
sudo -u "$SUDO_USER" pm2 delete codesteam 2>/dev/null || true
sudo -u "$SUDO_USER" pm2 start ecosystem.config.js --env production
sudo -u "$SUDO_USER" pm2 save
log "PM2 started"

# ─────────────────────────────────────────────────────────────────────────────
step "12 · Optional SSL with Let's Encrypt"
# ─────────────────────────────────────────────────────────────────────────────
if [ -n "$DOMAIN" ]; then
  log "Setting up SSL for $DOMAIN..."
  apt-get install -y certbot python3-certbot-nginx
  certbot --nginx -d "$DOMAIN" --non-interactive --agree-tos -m "admin@$DOMAIN" \
    --redirect || warn "Certbot failed — run manually: certbot --nginx -d $DOMAIN"
else
  warn "DOMAIN not set — skipping SSL. Run when ready:"
  warn "  sudo certbot --nginx -d yourdomain.com"
fi

# ─────────────────────────────────────────────────────────────────────────────
step "Done!"
# ─────────────────────────────────────────────────────────────────────────────
PUBLIC_IP=$(curl -s ifconfig.me 2>/dev/null || echo "YOUR_EC2_IP")
echo ""
echo -e "${GREEN}╔══════════════════════════════════════════╗${NC}"
echo -e "${GREEN}║  CodeSteam is live!                     ║${NC}"
echo -e "${GREEN}╚══════════════════════════════════════════╝${NC}"
echo ""
echo -e "  URL:       ${BLUE}http://$PUBLIC_IP${NC}"
echo -e "  Health:    ${BLUE}http://$PUBLIC_IP/api/health${NC}"
echo ""
echo "  Useful commands:"
echo "    pm2 status                  → process status"
echo "    pm2 logs codesteam         → live logs"
echo "    pm2 reload codesteam       → zero-downtime reload"
echo "    bash scripts/healthcheck.sh → full health check"
echo ""
