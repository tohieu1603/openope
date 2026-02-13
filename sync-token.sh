#!/usr/bin/env bash
# Sync OAuth token from operis-api token vault → auth-profiles.json
# User must login with email/password to fetch the token.
#
# Usage:
#   ./sync-token.sh                          # interactive (prompts for credentials)
#   OPERIS_EMAIL=x OPERIS_PASSWORD=y ./sync-token.sh  # non-interactive

set -euo pipefail

OPERIS_API_URL="${OPERIS_API_URL:-http://127.0.0.1:3025}"
AUTH_PROFILES="${AUTH_PROFILES:-$HOME/.openclaw/agents/main/agent/auth-profiles.json}"

# --- Login ---
if [ -z "${OPERIS_EMAIL:-}" ]; then
  read -rp "Email: " OPERIS_EMAIL
fi
if [ -z "${OPERIS_PASSWORD:-}" ]; then
  read -rsp "Password: " OPERIS_PASSWORD
  echo
fi

LOGIN_RESP=$(curl -sf "$OPERIS_API_URL/api/auth/login" \
  -H 'Content-Type: application/json' \
  -d "{\"email\":\"$OPERIS_EMAIL\",\"password\":\"$OPERIS_PASSWORD\"}" 2>&1) || {
  echo "[sync-token] ERROR: Login failed"
  echo "$LOGIN_RESP"
  exit 1
}

JWT=$(echo "$LOGIN_RESP" | python3 -c "import sys,json; print(json.load(sys.stdin)['accessToken'])" 2>/dev/null) || {
  echo "[sync-token] ERROR: Failed to parse JWT from login response"
  echo "$LOGIN_RESP"
  exit 1
}

echo "[sync-token] Logged in as $OPERIS_EMAIL"

# --- Fetch token from vault ---
RESPONSE=$(curl -sf "$OPERIS_API_URL/api/token-vault" \
  -H "Authorization: Bearer $JWT" 2>&1) || {
  echo "[sync-token] ERROR: Failed to fetch token from vault"
  echo "$RESPONSE"
  exit 1
}

TOKEN=$(echo "$RESPONSE" | python3 -c "import sys,json; print(json.load(sys.stdin)['token'])" 2>/dev/null) || {
  echo "[sync-token] ERROR: Failed to parse token from response"
  echo "$RESPONSE"
  exit 1
}

if [ -z "$TOKEN" ]; then
  echo "[sync-token] ERROR: Empty token received"
  exit 1
fi

# --- Write auth-profiles.json ---
mkdir -p "$(dirname "$AUTH_PROFILES")"

cat > "$AUTH_PROFILES" <<EOF
{
  "version": 1,
  "profiles": {
    "anthropic:manual": {
      "type": "token",
      "provider": "anthropic",
      "token": "$TOKEN"
    },
    "anthropic:default": {
      "type": "token",
      "provider": "anthropic",
      "token": "$TOKEN"
    }
  },
  "lastGood": {
    "anthropic": "anthropic:manual"
  }
}
EOF

echo "[sync-token] OK: auth-profiles.json updated (token prefix: ${TOKEN:0:20}...)"
