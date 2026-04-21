# Trana — Speaker Notes
## Kraków "Roast My Solana Startup" · 5 minutes

---

### Slide 1 — Title `[10s]`

Let the headline land in silence.

> *"Onchain execution should require approval."*

Then: "trana enforces a second factor at execution time — no server, no custodian, pure onchain." Advance immediately.

---

### Slide 2 — The Problem `[40s]`

"Every Solana exploit follows the same pattern."

Walk through the three cards: key stolen → attacker signs directly → protocol drained.

Call out each fake protection:
- UI warnings? Bypassed by raw transaction.
- Multisig? High overhead, still software keys.
- Custodians? You're trusting *them*.

**KEY LINE:**
> *"If you can craft a raw transaction, you can bypass every UI-level security check on Solana today."*

---

### Slide 3 — The Insight `[40s]`

"February 2025 — SIMD-0075 ships."

Native P-256 on every Solana validator. Why does this matter?
- WebAuthn — Touch ID, Face ID, YubiKey — uses P-256 by default.
- First time passkey signatures are verifiable **natively onchain**. No server. No bridge.

**KEY LINE:**
> *"SIMD-0075 is 3 months old. We're the first to build production-grade authorization on top of it."*

---

### Slide 4 — The Solution `[30s]`

"trana Guard — an onchain authorization primitive."

One CPI call that enforces a passkey proof atomically with your instruction.

Read the guarantee **slowly**:
> *"This instruction cannot execute unless the registered passkey signed an intent hash that exactly describes this transaction."*

Close: "Enforced by the Solana runtime — not a UI check, not a simulation."

---

### Slide 5 — Why Trana (Animation) `[45s]`

Let the animation run, narrate live.

- **Phases 1–3:** Key stolen → attacker sends raw tx → wallet guard bypassed → *"Bypassed"* stamp.
- **Phases 4–5:** trana moves the guard onchain → attacker sends again → blocked at program level → *"Rejected"* stamp.

Closing narration: *"No client-side component to bypass. A stolen key alone cannot execute."*

---

### Slide 6 — Integration `[30s]`

Point to the code blocks.

"For a Solana program author — this is the entire integration."
- Three extra accounts.
- One CPI call when your policy triggers.
- The SDK prepends secp256r1 + record_proof automatically.

**KEY LINE:**
> *"Three lines of Rust. One line of TypeScript. Everything else is handled."*

---

### Slide 7 — Policies / Demo `[45s]`

Walk the three policies: `::Threshold`, `::Admin`, `::Always`.

"Declared in the program, stored onchain — auditable by anyone. When a policy triggers, execution is blocked until a passkey approves."

**Demo moment:** "Send 1 SOL withdrawal with NO proof → `MissingProof (0x1770)`."

"Can't bypass it in the frontend. Can't bypass it at the RPC. It fails in the program. That's the guarantee."

---

### Slide 8 — Where This Matters `[20s]`

"Not every transaction — the ones that count."

Name each use case: protocol upgrades, treasury transfers, vault withdrawals, admin actions.

"These are exactly where hacks happen. With trana: a stolen key alone cannot execute any of them. It needs a live passkey approval tied to this exact action."

---

### Slide 9 — Market `[20s]`

Hit the numbers:
- Solana TVL: **$7B+**
- TAM: **$200B** as P-256 spreads cross-chain

Segments: DeFi protocols, DAO treasury managers, protocol admin key holders, fintech / custodians.

"Why now: SIMD-0075 is live. We have a first-mover window before anyone else ships a production primitive."

---

### Slide 10 — Business Model `[15s]`

Three paths:
1. **Open core** — primitive is free, managed registry + SLA is paid.
2. **Protocol fee** — micro-fee per guarded execution (like Pyth oracle fees).
3. **Enterprise SDK** — audited builds + SLA.

**KEY LINE:**
> *"We don't hold keys. We don't hold custody. Integrate once, the safety layer is permanently onchain."*

---

### Slide 11 — Close / Ask `[10s]`

Deliver with a pause between the two lines.

> *"Wallets made signing easier."* [pause]
> *"trana makes execution safer."*

Invite: protocol partners (DM tonight), early builders, devnet next week.

**Optional mic-drop closer:**
> *"We built execution-time authorization for Solana in 3 months. Tonight you can try to hack it. You won't."*

---

### Slide 12 — About `[5s]`

"Senior Engineer. Colosseum Breakout Infra track winner — Action Codes. Solana Foundation grantee. Now building the authorization layer Solana was missing."

Point to contact: **X / Telegram @beharefe**

Thank the judges and exit confidently.

---

## Timing Cheatsheet

| # | Slide | Time | Cumulative |
|---|---|---|---|
| 1 | Title | 0:10 | 0:10 |
| 2 | Problem | 0:40 | 0:50 |
| 3 | Insight | 0:40 | 1:30 |
| 4 | Solution | 0:30 | 2:00 |
| 5 | Why Trana (animation) | 0:45 | 2:45 |
| 6 | Integration | 0:30 | 3:15 |
| 7 | Policies / Demo | 0:45 | 4:00 |
| 8 | Where it matters | 0:20 | 4:20 |
| 9 | Market | 0:20 | 4:40 |
| 10 | Business model | 0:15 | 4:55 |
| 11 | Close | 0:05 | 5:00 |
| 12 | About | leave-behind | — |

---

## 5 Lines to Memorize

1. *"Every Solana exploit: attacker gets the key, sends raw transactions, UI checks are irrelevant."*
2. *"SIMD-0075 is 3 months old. Passkeys are now natively verifiable on Solana. We built the authorization layer."*
3. *"Three accounts. One CPI call. That's the entire integration."*
4. *"Send a raw transaction without proof — MissingProof. You can't bypass this in a frontend. You can't bypass this at the RPC. It fails in the program."*
5. *"We don't hold custody. We don't hold keys. We own the safety layer."*

---

## Q&A Pocket Answers

**"Can't someone just not use your guard?"**
Yes — the protocol decides what to protect. Once they integrate, it's enforced. Like asking if someone can not use a seatbelt.

**"What's the moat?"**
First audit, first production deployment, SDK adoption. Same moat as Anchor — once protocols integrate, switching cost is high.

**"How is this different from multisig?"**
Multisig = N signers online, coordinating. trana = single-user, device-bound, instant, single transaction. No coordination overhead.

**"Why Solana and not EVM?"**
EIP-7212 (secp256r1 on EVM) is still being adopted. SIMD-0075 is already in production on Solana. Multi-chain is the roadmap.

**"Business model details?"**
Most defensible: managed registry (we run the relay/recovery infrastructure) + enterprise SLA. Primitive stays open source.
