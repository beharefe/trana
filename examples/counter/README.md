# Counter Example

A minimal passkey-gated counter on Solana.

Every call to `increment` requires a WebAuthn passkey touch — no exceptions, no bypass. The proof is verified on-chain by `trana_guard::cpi::enforce()`.

```
programs/counter/src/lib.rs   ← Anchor program (one CPI call)
app/src/App.tsx               ← React frontend (wallet + passkey UI)
app/src/counter.ts            ← instruction builders + account decoder
```

---

## How it works

```
increment ix[0]:  secp256r1 precompile   ← Solana verifies P-256 sig
increment ix[1]:  guard::record_proof    ← anchors proof to this exact tx
increment ix[2]:  counter::increment     → calls guard::cpi::enforce() inside
```

The guard reads `ix[N-2]` at execution time. A stolen wallet key cannot call `increment` without also controlling the passkey device.

---

## Prerequisites

- [Rust](https://rustup.rs) + `rustup toolchain install 1.89.0`
- [Anchor CLI 0.32.1](https://www.anchor-lang.com/docs/installation) — `cargo install --git https://github.com/coral-xyz/anchor avm && avm install 0.32.1 && avm use 0.32.1`
- [Solana CLI](https://docs.solanalabs.com/cli/install) — `solana --version`
- Node 20+ and npm
- A browser wallet (Phantom, Backpack, Solflare) configured to **localnet** (`http://127.0.0.1:8899`)

---

## Setup

All commands run from the `examples/counter/` directory unless noted.

### 1. Build trana_guard (from repo root)

```bash
cd ../..   # repo root
anchor build -p trana_guard
cd examples/counter
```

### 2. Build the counter program

```bash
anchor build
anchor keys sync   # updates declare_id! to match the generated keypair
anchor build       # rebuild with the correct ID
```

After `anchor keys sync`, copy the printed program ID into `app/src/counter.ts`:

```ts
export const COUNTER_PROGRAM_ID = new PublicKey("<printed ID>")
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

### 5. Fund your local wallet

```bash
solana airdrop 10 --url localhost
```

### 6. Run the frontend

```bash
cd app
npm install
npm run dev
```

Open `http://localhost:5173`. Configure your browser wallet to connect to `http://127.0.0.1:8899` (Custom RPC in Phantom settings).

---

## Usage

1. **Connect wallet** — click the wallet button and select your browser wallet
2. **Initialize Counter** — creates your counter PDA (wallet signature only)
3. **Register Passkey** — triggers your OS passkey dialog (Touch ID / Windows Hello / YubiKey); sends one on-chain transaction
4. **Increment** — triggers passkey prompt, then sends `[secp256r1Ix, recordProofIx, incrementIx]`

The counter only advances if the passkey proof is valid. Calling `increment` without a proof returns `MissingProof`.

---

## Program structure

```rust
// initialize — no passkey, wallet signature only
pub fn initialize(ctx: Context<Initialize>) -> Result<()> { … }

// increment — passkey required on every call
pub fn increment(ctx: Context<Increment>) -> Result<()> {
    trana_guard::cpi::enforce(ctx.accounts.trana_ctx(), Policy::Require)?;
    ctx.accounts.counter.count += 1;
    Ok(())
}
```

The entire Trana integration is one import and one `enforce()` call. The guard reads the secp256r1 proof from `instructions[N-2]` and validates it against the registry PDA for `owner`.

---

## Extending

| Goal | Change |
|---|---|
| Only require passkey above a threshold | `Policy::Limit(1_000_000_000n)` |
| Lock until a slot | `Policy::NotBefore(slot)` |
| Add more instruction params | adjust `param_offset` in `Policy::Limit` |
| Store the counter globally (not per-wallet) | remove `owner` from seeds |
