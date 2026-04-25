# Trana Guard — Pitch Outline
## Kraków "Roast My Solana Startup" · 5 minutes

---

## Judging weights (what to front-load)

| Criterion | Weight | Slide |
|---|---|---|
| Founder + Market Fit | 20% | 2, 11 |
| Insight | 20% | 3, 4 |
| Product + Execution | 15% | 5, 6, 7 |
| Potential Market Size | 15% | 9 |
| Founder Communication | 15% | all |
| Viability | 15% | 10 |

---

## Slide-by-slide script

### Slide 1 — Title (10s)
**Trana Guard**
Execution-time passkey enforcement for Solana. No server. No custodian. Pure onchain.

*Visual:* Logo + tagline + "devnet live tonight →"

---

### Slide 2 — The Problem (40s)
**Every Solana exploit follows the same pattern**

1. Attacker gets the private key
2. Attacker sends raw transactions directly
3. Protocol is drained

Existing "protections":
- UI warnings → bypassed with raw tx
- Multisig → high operational overhead, still software keys
- Custodians → you're trusting *them*

**None of them protect at execution time.**

*Key line:* "If you can craft a raw transaction, you can bypass every UI-level security check on Solana today."

---

### Slide 3 — The Insight (40s)
**February 2025: Solana ships SIMD-0075**

The secp256r1 precompile — native P-256 signature verification on every Solana validator.

Why this matters:
- WebAuthn (Touch ID, Face ID, YubiKey) uses **P-256 by default**
- For the first time: passkey signatures can be **verified natively onchain**
- No server. No bridge. No trusted third party.

**This is the unlock. Nobody has built the authorization layer on top of it yet.**

*Key line:* "SIMD-0075 shipped over a year ago. We're the first to build a production-grade authorization primitive on it."

---

### Slide 4 — The Solution (30s)
**Trana Guard**

An onchain authorization primitive. One CPI call that enforces a passkey proof atomically with your instruction.

The guarantee:
> "This instruction cannot execute unless the registered passkey signed an intent hash that exactly describes this transaction."

Enforced by the Solana runtime. Not by a server. Not by a UI check.

---

### Slide 5 — How It Works (45s)
**Transaction shape:**

```
[N-2]  secp256r1 precompile   ← P-256 sig verify (SIMD-0075)
[N-1]  guard::record_proof    ← carries WebAuthn binding data
[N]    your_program::action   → calls guard::cpi::enforce()
```

**What guard::enforce() verifies:**
1. secp256r1 is present at ix[N-2] ← correct key, correct sig
2. Sig challenge = SHA-256(policy|program|accounts|params|nonce|expiry)
3. Nonce consumed → replay impossible
4. Atomic: proof + action succeed or both fail

*Visual:* Transaction diagram with 3 instructions highlighted

---

### Slide 6 — The Integration (30s)
**For a Solana program author — entire integration:**

```rust
// 3 extra accounts
pub guard_program:      Program<'info, Guard>,
pub trana_registry:     Account<'info, TwoFactorRegistry>,
pub trana_instructions: UncheckedAccount<'info>,

// 1 CPI call when your policy triggers
guard::cpi::enforce(ctx.accounts.trana_cpi_ctx())?;
```

That's it. The SDK prepends secp256r1 + record_proof automatically.

*Key line:* "Three lines of Rust. One line of integration. Everything else is handled."

---

### Slide 7 — Demo: 3 Onchain Policies (45s)
**Running live on localnet tonight**

```
transfer.large       ≥ 1 SOL withdrawal        → passkey required
transfer.rapid_drain withdrawal within 5 min    → passkey required
                     of ≥ 5 SOL deposit
transfer.always      user opt-in mode           → always passkey
```

**The attack demo:**
Send 1 SOL withdrawal with NO proof → `MissingProof (0x1770)` — immediately, atomically, onchain.

Can't be bypassed. Not a UI check. Not a simulation. Enforced by the program.

*[Live demo if possible — show attack fail, then successful passkey approval]*

---

### Slide 8 — Security Properties (20s)
**What Trana blocks:**

| Attack | Error |
|---|---|
| No proof | `MissingProof` |
| Replay old proof | `PayloadMismatch` |
| Tamper amount | `PayloadMismatch` |
| Swap recipient | `PayloadMismatch` |
| Wrong passkey | `WrongSigner` |
| Expired proof | `ProofExpired` |

Every failure is onchain, logged, auditable. `ProofVerified` event on every success.

---

### Slide 9 — Market (30s)
**Who buys this:**

- DeFi protocols with TVL (vaults, DEXes, lending)
- DAO treasury managers
- Protocol upgrade / admin key holders
- Custodial / fintech products built on Solana
- Any team that needs "something smarter than a single private key"

**Size:**
- Solana TVL: $7B+ (2025)
- Total Solana ecosystem wallets: 15M+
- TAM: every protocol that controls user funds

**Why now:** SIMD-0075 ships → window before anyone else ships a production primitive

---

### Slide 10 — Viability (25s)
**Three paths to revenue:**

1. **Open core** — primitive is open source, managed registry + SLA is paid
2. **Protocol fee** — micro-fee per guarded transaction (think: Pyth oracle fees)
3. **SDK licensing** — enterprise support for chains that want Trana deployed

**Why the primitive model wins:**
- We don't hold custody of anything
- Protocols integrate once, we own the safety layer
- More TVL guarded = more credibility = more integrations

**Colosseum angle:** Solana ecosystem needs this. We're building infrastructure, not a dApp.

---

### Slide 11 — Team + Why Us (20s)
**Why we're the right team:**

- Deep understanding of SIMD-0075 and WebAuthn internals
- Built from scratch: Rust program + TypeScript SDK + React provider
- Working demo on localnet tonight — not a slide, a product
- Open source — every line is auditable

*[Founders introduce themselves here]*

---

### Slide 12 — The Ask (15s)
**Ships to mainnet: 2 weeks**

- First protocol partners: DM us tonight
- Colosseum hackathon: this is our submission
- Ecosystem grants: open to Solana Foundation / ecosystem programs

**Repository:** github.com/beharefe/trana-guard
**Demo live:** [your URL]/slides

*Close:* "We built an execution-time authorization layer for Solana in 3 months. Tonight you can try to hack it. You won't."

---

## Timing breakdown (5:00 total)

| Slide | Time | Cumulative |
|---|---|---|
| 1. Title | 0:10 | 0:10 |
| 2. Problem | 0:40 | 0:50 |
| 3. Insight | 0:40 | 1:30 |
| 4. Solution | 0:30 | 2:00 |
| 5. How it works | 0:45 | 2:45 |
| 6. Integration | 0:30 | 3:15 |
| 7. Demo | 0:45 | 4:00 |
| 8. Security | 0:20 | 4:20 |
| 9. Market | 0:20 | 4:40 |
| 10. Viability | 0:15 | 4:55 |
| 11. Team | 0:05 | 5:00 |

*Slides 12 (ask) is a leave-behind — shown after time or during Q&A.*

---

## Key lines to memorize

1. *"Every Solana exploit: attacker gets the key, sends raw transactions, UI checks are irrelevant."*
2. *"SIMD-0075 shipped over a year ago. P-256 is now natively verifiable on Solana. Nobody built the authorization layer — until now."*
3. *"Three accounts. One CPI call. That's the entire integration."*
4. *"Send a raw transaction without proof — MissingProof. You can't bypass this in a frontend. You can't bypass this in the RPC. It fails in the program."*
5. *"We don't hold custody. We don't hold keys. We own the safety layer."*

---

## Q&A prep

**"Can't someone just not use your guard?"**
Yes. That's like saying "can someone not use a seatbelt?" — The protocol decides what to protect. Once they integrate, it's enforced.

**"What's the moat?"**
First audit, first production deployment, SDK adoption. Same moat as Anchor itself — once protocols integrate, switching cost is high.

**"Why Solana and not EVM?"**
EIP-7212 (secp256r1 on EVM) is still being adopted. We're first on Solana, which already has it in production. Multi-chain is the roadmap.

**"How is this different from multisig?"**
Multisig requires N signers to be online and coordinating. Trana is a single-user device-bound second factor, instant, works in a single transaction, no coordination overhead.

**"Business model details?"**
We're still exploring. The most defensible path is managed registry (we run the relay/recovery infrastructure) + enterprise SLA. The primitive itself stays open source.
