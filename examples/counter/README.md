# Counter Example

A minimal passkey-gated counter on Solana.

Every call to `increment` requires a WebAuthn passkey touch — no exceptions, no bypass. The proof is verified on-chain by `trana_guard::cpi::enforce()`.

```
programs/counter/src/lib.rs   ← Anchor program (one CPI call)
app/src/App.tsx               ← React frontend (auto-funded in-browser wallet)
app/src/counter.ts            ← instruction builders + account decoder
app/src/wallet.ts             ← keypair from localStorage + airdrop
sync-program-id.mjs           ← writes VITE_COUNTER_PROGRAM_ID to app/.env.local
```

No browser wallet extension required. The app generates a keypair in localStorage and airdrops SOL automatically on first load.

---

## How it works

```
increment ix[0]:  secp256r1 precompile   ← Solana verifies P-256 sig
increment ix[1]:  guard::record_proof    ← anchors proof to this exact tx
increment ix[2]:  counter::increment     → calls guard::cpi::enforce() inside
```

The guard reads `ix[N-2]` at execution time. A stolen private key cannot call `increment` without also controlling the passkey device.

---

## Prerequisites

- [Rust](https://rustup.rs) + `rustup toolchain install 1.89.0`
- [Anchor CLI 0.32.1](https://www.anchor-lang.com/docs/installation)
- [Solana CLI](https://docs.solanalabs.com/cli/install)
- Node 20+ and npm
- A browser with WebAuthn support (Touch ID, Windows Hello, or a security key)

---

## Setup

All commands run from `examples/counter/` unless noted.

### 1. Build trana_guard (from repo root)

```bash
cd ../..
anchor build -p trana_guard -- --features=localnet
cd examples/counter
```

### 2. Build the counter program and sync the program ID

```bash
anchor build
anchor keys sync        # updates declare_id! to match the generated keypair
anchor build            # rebuild with the correct ID
npm run sync --prefix app   # writes program ID to app/.env.local
```

### 3. Start a local validator with trana_guard pre-loaded

Open a dedicated terminal and leave it running:

```bash
solana-test-validator \
  --bpf-program GYhng7fbz51319ZwD1uBunBZs777C3KjmS52rYRcKfXn \
    ../../target/deploy/trana_guard.so \
  --reset
```

### 4. Deploy the counter program

```bash
anchor deploy
```

### 5. Run the frontend

```bash
cd app
npm install
npm run dev
```

Open `http://localhost:5173`. No wallet setup needed — the app funds itself via airdrop.

---

## Usage

1. **Initialize Counter** — app auto-airdrops SOL, then creates your counter PDA
2. **Register Passkey** — triggers your OS passkey dialog (Touch ID / Windows Hello / YubiKey)
3. **Increment** — touch your passkey; sends `[secp256r1Ix, recordProofIx, incrementIx]`

The counter only advances if the passkey proof is valid. Calling `increment` without a proof returns `MissingProof`.

The in-browser keypair is stored in `localStorage` and persists across reloads. It is intentionally insecure — this is a localnet example only.

---

## Program structure

```rust
// initialize — no passkey, wallet signature only
pub fn initialize(ctx: Context<Initialize>) -> Result<()> { … }

// increment — passkey required on every call
pub fn increment(ctx: Context<Increment>) -> Result<()> {
    trana_guard::cpi::enforce(
        ctx.accounts.trana_ctx(),
        Policy::Require,
    )?;
    ctx.accounts.counter.count += 1;
    Ok(())
}
```

One import, one `enforce()` call. Everything else is standard Anchor.

---

## Extending

| Goal | Change |
|---|---|
| Only require passkey above a threshold | `Policy::Limit(1_000_000_000n)` |
| Lock until a slot | `Policy::NotBefore(slot)` |
| Adjust which param is the threshold | set `param_offset` in `Policy::Limit` |
| Store the counter globally (not per-wallet) | remove `owner` from PDA seeds |
