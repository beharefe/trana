#!/usr/bin/env bash
# Copyright 2026 Trana, Inc.
# SPDX-License-Identifier: Apache-2.0
#
# Full devnet deployment: build → deploy programs → init-config → init-vault
#
# Usage:
#   ./scripts/deploy.sh [--skip-build] [--skip-vault] \
#                        --treasury <address>          \
#                        --register-fee <sol>          \
#                        --recovery-fee <sol>
#
# Env (must be set before running):
#   ANCHOR_WALLET          Path to deployer keypair JSON
#   ANCHOR_PROVIDER_URL    Override RPC endpoint (default: devnet)
#
# The script halts on any error (-e) and prints every command (-x in CI).
set -euo pipefail

# ── Defaults ──────────────────────────────────────────────────────────────────

SKIP_BUILD=0
SKIP_VAULT=0
TREASURY=""
REGISTER_FEE="0.005"
RECOVERY_FEE="0.01"

while [[ $# -gt 0 ]]; do
  case "$1" in
    --skip-build)    SKIP_BUILD=1;       shift ;;
    --skip-vault)    SKIP_VAULT=1;       shift ;;
    --treasury)      TREASURY="$2";      shift 2 ;;
    --register-fee)  REGISTER_FEE="$2";  shift 2 ;;
    --recovery-fee)  RECOVERY_FEE="$2";  shift 2 ;;
    *) echo "Unknown flag: $1"; exit 1 ;;
  esac
done

if [[ -z "$TREASURY" ]]; then
  echo "Error: --treasury <address> is required"
  exit 1
fi

if [[ -z "${ANCHOR_WALLET:-}" ]]; then
  echo "Error: ANCHOR_WALLET is not set"
  exit 1
fi

RPC="${ANCHOR_PROVIDER_URL:-https://api.devnet.solana.com}"

# ── Step 1: build ─────────────────────────────────────────────────────────────

if [[ "$SKIP_BUILD" -eq 0 ]]; then
  echo "=== build (devnet feature) ==="
  NO_DNA=1 anchor build -- --features devnet
else
  echo "=== skipping build ==="
fi

# ── Step 2: deploy programs ───────────────────────────────────────────────────

echo
echo "=== deploy trana_guard ==="
NO_DNA=1 anchor deploy \
  --program-name trana_guard \
  --provider.cluster "$RPC" \
  --provider.wallet "$ANCHOR_WALLET"

echo
echo "=== deploy trana_authority ==="
NO_DNA=1 anchor deploy \
  --program-name trana_authority \
  --provider.cluster "$RPC" \
  --provider.wallet "$ANCHOR_WALLET"

echo
echo "=== deploy trana_test_vault ==="
NO_DNA=1 anchor deploy \
  --program-name trana_test_vault \
  --provider.cluster "$RPC" \
  --provider.wallet "$ANCHOR_WALLET"

# ── Step 3: read deployed program IDs from Anchor.toml / keypairs ─────────────

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"

# Anchor writes deploy keypairs to target/deploy/<name>-keypair.json
guard_keypair="$REPO_ROOT/target/deploy/trana_guard-keypair.json"
vault_keypair="$REPO_ROOT/target/deploy/trana_test_vault-keypair.json"

GUARD_ID=$(solana-keygen pubkey "$guard_keypair")
VAULT_ID=$(solana-keygen pubkey "$vault_keypair")

echo
echo "Deployed program IDs"
echo "  trana_guard:      $GUARD_ID"
echo "  trana_test_vault: $VAULT_ID"

# ── Step 4: init-config ───────────────────────────────────────────────────────

echo
echo "=== init_config ==="
ANCHOR_PROVIDER_URL="$RPC" ANCHOR_WALLET="$ANCHOR_WALLET" \
  node "$REPO_ROOT/scripts/init-config.mjs" "$GUARD_ID" "$TREASURY" \
    --register-fee "$REGISTER_FEE" \
    --recovery-fee "$RECOVERY_FEE"

# ── Step 5: init-vault (optional) ─────────────────────────────────────────────

if [[ "$SKIP_VAULT" -eq 0 ]]; then
  echo
  echo "=== initialize_pool (limit) ==="
  ANCHOR_PROVIDER_URL="$RPC" ANCHOR_WALLET="$ANCHOR_WALLET" \
    node "$REPO_ROOT/scripts/init-vault.mjs" "$VAULT_ID" \
      --kind limit \
      --label "Demo Vault"

  echo
  echo "=== initialize_pool (time-locked) ==="
  ANCHOR_PROVIDER_URL="$RPC" ANCHOR_WALLET="$ANCHOR_WALLET" \
    node "$REPO_ROOT/scripts/init-vault.mjs" "$VAULT_ID" \
      --kind time-locked \
      --label "Locked Demo"
fi

# ── Done ──────────────────────────────────────────────────────────────────────

echo
echo "=== deployment complete ==="
echo
echo "Next steps:"
echo "  1. Copy deployed IDs into Anchor.toml [programs.devnet] if they changed"
echo "  2. Re-run SDK build: npm run build -w packages/sdk"
echo "  3. Verify on explorer: https://explorer.solana.com/address/$GUARD_ID?cluster=devnet"
