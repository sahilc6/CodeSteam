#!/bin/bash
# ─────────────────────────────────────────────────────────────────────────────
#  CodeSteam health check script
#  Run after deployment to verify all services are up
#  Usage: bash scripts/healthcheck.sh [host]
# ─────────────────────────────────────────────────────────────────────────────

HOST="${1:-localhost}"
PASS=0
FAIL=0

GREEN='\033[0;32m'; RED='\033[0;31m'; YELLOW='\033[1;33m'; NC='\033[0m'
ok()   { echo -e "  ${GREEN}✓${NC} $1"; ((PASS++)); }
fail() { echo -e "  ${RED}✗${NC} $1"; ((FAIL++)); }
info() { echo -e "  ${YELLOW}→${NC} $1"; }

echo ""
echo "CodeSteam Health Check — http://$HOST"
echo "────────────────────────────────────────"

# 1. HTTP reachability
echo ""
echo "[ HTTP ]"
HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" "http://$HOST/" --max-time 5)
if [ "$HTTP_CODE" = "200" ] || [ "$HTTP_CODE" = "301" ]; then
  ok "HTTP root → $HTTP_CODE"
else
  fail "HTTP root → $HTTP_CODE (expected 200 or 301)"
fi

# 2. API health endpoint
echo ""
echo "[ API ]"
HEALTH=$(curl -s "http://$HOST/api/health" --max-time 5)
if echo "$HEALTH" | grep -q '"status":"ok"'; then
  ok "GET /api/health → ok"
else
  fail "GET /api/health → unexpected: $HEALTH"
fi

# 3. API auth endpoint exists
AUTH_CODE=$(curl -s -o /dev/null -w "%{http_code}" -X POST "http://$HOST/api/auth/login" \
  -H "Content-Type: application/json" \
  -d '{"email":"x","password":"x"}' --max-time 5)
if [ "$AUTH_CODE" = "400" ] || [ "$AUTH_CODE" = "401" ]; then
  ok "POST /api/auth/login → $AUTH_CODE (endpoint alive)"
else
  fail "POST /api/auth/login → $AUTH_CODE (unexpected)"
fi

# 4. Static assets served
ASSET_CODE=$(curl -s -o /dev/null -w "%{http_code}" "http://$HOST/favicon.svg" --max-time 5)
if [ "$ASSET_CODE" = "200" ] || [ "$ASSET_CODE" = "404" ]; then
  ok "Static asset route reachable → $ASSET_CODE"
else
  fail "Static asset route → $ASSET_CODE"
fi

# 5. Socket.io handshake
echo ""
echo "[ WebSocket ]"
WS_CODE=$(curl -s -o /dev/null -w "%{http_code}" \
  "http://$HOST/socket.io/?EIO=4&transport=polling" --max-time 5)
if [ "$WS_CODE" = "200" ] || [ "$WS_CODE" = "400" ]; then
  ok "Socket.io polling endpoint → $WS_CODE"
else
  fail "Socket.io polling → $WS_CODE (is Nginx proxying /socket.io/?)"
fi

# 6. PM2 / Docker status (local only)
echo ""
echo "[ Process ]"
if command -v pm2 &>/dev/null; then
  PM2_STATUS=$(pm2 jlist 2>/dev/null | python3 -c "
import sys,json
procs = json.load(sys.stdin)
cc = [p for p in procs if 'codesteam' in p.get('name','')]
if cc:
    s = cc[0]['pm2_env']['status']
    print('online' if s == 'online' else s)
else:
    print('not_found')
" 2>/dev/null)
  if [ "$PM2_STATUS" = "online" ]; then
    ok "PM2 process: online"
  else
    fail "PM2 process: $PM2_STATUS"
  fi
elif command -v docker &>/dev/null; then
  SERVER_HEALTH=$(docker inspect --format='{{.State.Health.Status}}' codesteam-server 2>/dev/null)
  NGINX_HEALTH=$(docker inspect  --format='{{.State.Health.Status}}' codesteam-nginx  2>/dev/null)
  MONGO_HEALTH=$(docker inspect  --format='{{.State.Health.Status}}' codesteam-mongo  2>/dev/null)

  [ "$SERVER_HEALTH" = "healthy" ] && ok "Docker server: healthy" || fail "Docker server: $SERVER_HEALTH"
  [ "$NGINX_HEALTH"  = "healthy" ] && ok "Docker nginx: healthy"  || fail "Docker nginx: $NGINX_HEALTH"
  [ "$MONGO_HEALTH"  = "healthy" ] && ok "Docker mongo: healthy"  || fail "Docker mongo: $MONGO_HEALTH"
else
  info "Neither PM2 nor Docker found — skipping process check"
fi

# 7. Response time
echo ""
echo "[ Performance ]"
RT=$(curl -s -o /dev/null -w "%{time_total}" "http://$HOST/api/health" --max-time 5)
RT_MS=$(echo "$RT * 1000" | bc 2>/dev/null | cut -d. -f1)
if [ -n "$RT_MS" ] && [ "$RT_MS" -lt 200 ]; then
  ok "API response time: ${RT_MS}ms (< 200ms)"
elif [ -n "$RT_MS" ]; then
  fail "API response time: ${RT_MS}ms (slow — expected < 200ms)"
else
  info "Could not measure response time"
fi

# ── Summary ──────────────────────────────────────────────────────────────────
echo ""
echo "────────────────────────────────────────"
TOTAL=$((PASS + FAIL))
if [ "$FAIL" -eq 0 ]; then
  echo -e "${GREEN}All $TOTAL checks passed ✓${NC}"
else
  echo -e "${RED}$FAIL/$TOTAL checks failed${NC}"
  exit 1
fi
echo ""
