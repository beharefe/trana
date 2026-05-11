#!/usr/bin/env bash
# Copyright 2026 Trana, Inc.
# SPDX-License-Identifier: Apache-2.0
#
# Submit programs for on-chain verification via OtterSec's solana-verify tool.
# Verified programs appear with a checkmark badge on Solscan and explorer.
#
# Prerequisites:
#   cargo install solana-verify
#   Docker running (for reproducible builds)
#   ANCHOR_WALLET set to upgrade authority keypair
#
# Usage:
#   ./scripts/verify-programs.sh --repo https://github.com/trana-so/trana-guard

set -euo pipefail

REPO=""
RPC="https://api.devnet.solana.com"

while [[ $# -gt 0 ]]; do
  case "$1" in
    --repo) REPO="$2"; shift 2 ;;
    --rpc)  RPC="$2";  shift 2 ;;
    *) echo "Unknown flag: $1"; exit 1 ;;
  esac
done

if [[ -z "$REPO" ]]; then
  echo "Error: --repo <github-url> is required"
  exit 1
fi

if ! command -v solana-verify &>/dev/null; then
  echo "Error: solana-verify not found. Install with:"
  echo "  cargo install solana-verify"
  exit 1
fi

GUARD_ID="TRAqChewX8boPDuBbVXjS7iCQAnh9gDThfBRwXauwsG"
AUTH_ID="TRNA8iyPm9AuBGiTeSirJm6F4jsxvq66LqfFeU7G4AN"

echo "=== Verifying trana_guard ==="
solana-verify verify-from-repo \
  --program-id "$GUARD_ID" \
  -u "$RPC" \
  --library-name trana_guard \
  -- --features devnet \
  "$REPO"

echo ""
echo "=== Verifying trana_authority ==="
solana-verify verify-from-repo \
  --program-id "$AUTH_ID" \
  -u "$RPC" \
  --library-name trana_authority \
  -- --features devnet \
  "$REPO"

echo ""
echo "=== Verification submitted ==="
echo "  trana_guard:     https://solscan.io/account/$GUARD_ID?cluster=devnet"
echo "  trana_authority: https://solscan.io/account/$AUTH_ID?cluster=devnet"
echo ""
echo "OtterSec indexes verification within a few minutes."
echo "Solscan will show the verified checkmark once indexed."
