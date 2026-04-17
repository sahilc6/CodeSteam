#!/bin/bash
# ─────────────────────────────────────────────────────────────────────────────
#  CodeSteam rollback script
#  Usage: bash scripts/rollback.sh [commit-hash]
#         If no hash given, rolls back to the previous commit
# ─────────────────────────────────────────────────────────────────────────────
set -euo pipefail

APP_DIR="/opt/codesteam"
TARGET="${1:-HEAD~1}"

RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; NC='\033[0m'
log()  { echo -e "${GREEN}[+]${NC} $*"; }
warn() { echo -e "${YELLOW}[!]${NC} $*"; }

cd "$APP_DIR"

CURRENT=$(git rev-parse --short HEAD)
warn "Rolling back from $CURRENT to $TARGET"

# Hard reset to target
git fetch origin
git reset --hard "$TARGET"

# Reinstall deps if package.json changed
log "Reinstalling server dependencies..."
cd server && npm ci --omit=dev && cd ..

# Rebuild client
log "Rebuilding frontend..."
cd client && npm ci && npm run build
cp -r dist/. /var/www/codesteam/
cd ..

# Reload PM2
log "Reloading application..."
pm2 reload codesteam --update-env

# Verify
sleep 3
bash scripts/healthcheck.sh localhost

log "Rollback to $(git rev-parse --short HEAD) complete"
