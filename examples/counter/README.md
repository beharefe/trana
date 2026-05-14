# Counter Example

A minimal passkey-gated counter on Solana.

Every call to `increment` requires a WebAuthn passkey touch. The proof is verified on-chain by `trana_guard::cpi::enforce()`.

## Prerequisites

- [Rust](https://rustup.rs) + Solana toolchain (`rustup toolchain install 1.89.0`)
- [Anchor CLI 0.32.1](https://www.anchor-lang.com/docs/installation)
- [Solana CLI](https://docs.solanalabs.com/cli/install) with a keypair at `~/.config/solana/id.json`
- Node 20+ and npm
- A browser with WebAuthn (Touch ID, Windows Hello, or a security key)

## Run

```bash
cd examples/counter
npm install
npm start
```

That's it. `npm start` will:

1. Build `trana_guard` (first time only, ~2 min)
2. Build the counter program and sync its program ID
3. Start `solana-test-validator` with `trana_guard` pre-loaded
4. Deploy the counter program
5. Initialize the `trana_guard` config (fees = 0 for localnet)
6. Start the Vite frontend at `http://localhost:5173`

Open the browser — the app generates an in-browser keypair, airdrops SOL automatically, and guides you through the flow.

## How it works

```
increment ix[0]:  secp256r1 precompile   ← Solana verifies P-256 sig natively
increment ix[1]:  guard::record_proof    ← anchors the proof to this exact tx
increment ix[2]:  counter::increment     → calls guard::cpi::enforce() inside
```

## Program

```rust
pub fn increment(ctx: Context<Increment>) -> Result<()> {
    trana_guard::cpi::enforce(
        CpiContext::new(ctx.accounts.trana_guard_program.to_account_info(), Enforce {
            registry:     ctx.accounts.trana_registry.to_account_info(),
            owner:        ctx.accounts.owner.to_account_info(),
            instructions: ctx.accounts.instructions.to_account_info(),
        }),
        Policy::Require,
    )?;
    ctx.accounts.counter.count += 1;
    Ok(())
}
```

One import, one `enforce()` call.
