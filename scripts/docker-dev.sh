#!/usr/bin/env bash
# Usage:
#   ./scripts/docker-dev.sh           — build if .so missing, start validator + web
#   ./scripts/docker-dev.sh --build   — force anchor build first
#   ./scripts/docker-dev.sh --reset   — kill validator, reset ledger, restart
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

GREEN='\033[0;32m'; YELLOW='\033[1;33m'; RED='\033[0;31m'; NC='\033[0m'
log()  { echo -e "${GREEN}[trana]${NC} $*"; }
warn() { echo -e "${YELLOW}[trana]${NC} $*"; }
die()  { echo -e "${RED}[trana]${NC}  ERROR: $*" >&2; exit 1; }

FORCE_BUILD=0
RESET=0
for arg in "$@"; do
  case "$arg" in
    --build) FORCE_BUILD=1 ;;
    --reset) RESET=1 ;;
  esac
done

# ── Prerequisites ──────────────────────────────────────────────────────────────
command -v docker              &>/dev/null || die "Docker not found."
command -v anchor              &>/dev/null || die "Anchor CLI not found. Run: ./scripts/setup.sh"
command -v solana-keygen       &>/dev/null || die "solana-keygen not found. Run: ./scripts/setup.sh"
command -v solana-test-validator &>/dev/null || die "solana-test-validator not found. Run: ./scripts/setup.sh"

# ── Cleanup on exit ────────────────────────────────────────────────────────────
VALIDATOR_PID=""
cleanup() {
  log "Shutting down..."
  docker compose down 2>/dev/null || true
  [ -n "$VALIDATOR_PID" ] && kill "$VALIDATOR_PID" 2>/dev/null || true
}
trap cleanup EXIT INT TERM

# ── Kill any existing validator ────────────────────────────────────────────────
pkill -f "solana-test-validator" 2>/dev/null || true
sleep 1

# ── Build programs ─────────────────────────────────────────────────────────────
TRANA_GUARD_SO="target/deploy/trana.so"

if [ "$FORCE_BUILD" -eq 1 ] || [ ! -f "$TRANA_GUARD_SO" ]; then
  log "Building Anchor programs..."
  anchor build
else
  log "Programs already built — skipping (use --build to force)"
fi

[ -f "$TRANA_GUARD_SO" ] || die "trana.so not found after build"

# ── Start localnet validator ───────────────────────────────────────────────────
RESET_FLAG=""
[ "$RESET" -eq 1 ] && RESET_FLAG="--reset"

log "Starting solana-test-validator (Agave $(solana --version | awk '{print $2}'))..."
solana-test-validator $RESET_FLAG --quiet --rpc-port 8899 &
VALIDATOR_PID=$!

# Wait for RPC to be ready
log "Waiting for validator..."
for i in $(seq 1 30); do
  if solana cluster-version --url http://localhost:8899 &>/dev/null; then
    break
  fi
  [ "$i" -eq 30 ] && die "Validator did not start in time"
  sleep 1
done
log "Validator ready"

# ── Deploy programs ────────────────────────────────────────────────────────────
WALLET_ADDR=$(solana address)
log "Deploying with wallet: $WALLET_ADDR"

# Airdrop enough for deployment (2x in case of rate limits)
solana airdrop 500 "$WALLET_ADDR" --url http://localhost:8899 >/dev/null 2>&1 || true
solana airdrop 500 "$WALLET_ADDR" --url http://localhost:8899 >/dev/null 2>&1 || true

deploy_program() {
  local name="$1"
  echo "[trana] Deploying $name..." >&2
  solana program deploy "target/deploy/${name}.so" \
    --program-id "target/deploy/${name}-keypair.json" \
    --url http://localhost:8899 \
    --keypair "$(solana config get keypair | awk '{print $3}')" \
    >/dev/null
  echo "$(solana-keygen pubkey "target/deploy/${name}-keypair.json")"
}

TRANA_GUARD_PROGRAM_ID=$(deploy_program trana)
log "trana_guard program → $TRANA_GUARD_PROGRAM_ID"

# ── Initialize guard fee config (required once per validator ledger) ───────────
WALLET_KEYPAIR="$(solana config get keypair | awk '{print $3}')"
TREASURY_ADDR=$(solana address --keypair "$WALLET_KEYPAIR")
log "Initializing trana fee config (fee=0, treasury=$TREASURY_ADDR)..."
ANCHOR_PROVIDER_URL=http://localhost:8899 \
ANCHOR_WALLET="$WALLET_KEYPAIR" \
  node scripts/init-config.mjs "$TRANA_GUARD_PROGRAM_ID" "$TREASURY_ADDR" \
  && log "Fee config initialized" \
  || log "WARN: fee config init failed — registration may fail until init_config is called"

# ── Write .env.docker ──────────────────────────────────────────────────────────
# NEXT_PUBLIC_ vars are used in the browser (hits host's localhost:8899 directly)
# .env.local — read by Next.js natively, baked into client bundle at dev startup
cat > apps/web/.env.local <<EOF
NEXT_PUBLIC_SOLANA_RPC=http://localhost:8899
NEXT_PUBLIC_TRANA_GUARD_PROGRAM_ID=$TRANA_GUARD_PROGRAM_ID
NEXT_PUBLIC_RP_ID=localhost
RP_ORIGIN=http://localhost:3000
RP_NAME=Trana Guard Demo
NEXT_PUBLIC_TRANA_GUARD_THRESHOLD_SOL=20
EOF

# .env.docker — container-level vars (server-side RPC, non-public)
cat > .env.docker <<EOF
SOLANA_RPC=http://host.docker.internal:8899
EOF
log "env files written"

# ── Start web app ─────────────────────────────────────────────────────────────
log "Starting web app..."
log "  validator  → http://localhost:8899"
log "  web app    → http://localhost:3000"
echo ""

if docker compose version &>/dev/null 2>&1; then
  docker compose up --build
elif command -v docker-compose &>/dev/null; then
  docker-compose up --build
else
  warn "docker compose not available — starting Next.js directly (npm run dev)"
  cd "$ROOT/apps/web" && npm run dev
fi
