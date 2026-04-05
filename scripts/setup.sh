#!/usr/bin/env bash
set -e

echo "=== Trana Guard — Toolchain Setup ==="

# ── Solana CLI ────────────────────────────────────────────────────────────────
if ! command -v solana &> /dev/null; then
  echo "Installing Solana CLI..."
  sh -c "$(curl -sSfL https://release.anza.xyz/stable/install)"
  export PATH="$HOME/.local/share/solana/install/active_release/bin:$PATH"
else
  echo "Solana CLI already installed: $(solana --version)"
fi

# ── Anchor via avm ────────────────────────────────────────────────────────────
if ! command -v avm &> /dev/null; then
  echo "Installing avm (Anchor Version Manager)..."
  cargo install --git https://github.com/coral-xyz/anchor avm --force --locked
fi

if ! command -v anchor &> /dev/null; then
  echo "Installing latest Anchor..."
  avm install latest
  avm use latest
else
  echo "Anchor already installed: $(anchor --version)"
fi

# ── Solana config ─────────────────────────────────────────────────────────────
solana config set --url devnet
if [ ! -f "$HOME/.config/solana/id.json" ]; then
  echo "Generating new Solana keypair..."
  solana-keygen new --no-bip39-passphrase -o "$HOME/.config/solana/id.json"
fi
echo "Wallet: $(solana address)"

# ── pnpm deps ─────────────────────────────────────────────────────────────────
echo "Installing pnpm dependencies..."
pnpm install

echo ""
echo "=== Setup complete ==="
echo "Next steps:"
echo "  1. Fill in apps/web/.env.local (copy from .env.example)"
echo "  2. Run: anchor build  — get program ID"
echo "  3. Update Anchor.toml [programs.devnet].guard with the program ID"
echo "  4. Run: anchor deploy --provider.cluster devnet"
echo "  5. Run: pnpm dev:web"
