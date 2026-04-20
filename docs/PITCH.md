# Trana Guard — 3-Minute Pitch

**Core positioning:** Trana adds a second factor to onchain execution.

---

## Slide 1 — Hook (15–20s)

**Title:** "A signature is not enough anymore."

Every major crypto exploit today uses valid signatures.

Not bugs. Not broken code.

Valid transactions — executed exactly as designed.

*[pause]*

If a key is compromised, the protocol cannot say no.

---

## Slide 2 — The Problem (30s)

**Title:** Protocols trust signatures blindly

On Solana today:
- If a transaction is signed → it executes
- No second check. No final approval.

That means:
- Admin keys get compromised → funds drained
- Program upgrades → malicious code deployed
- Treasury → gone in seconds

Multisig helps… but it still relies on signatures only.

**Key line:** "There is no second factor at execution."

---

## Slide 3 — The Insight (30s)

**Title:** We're missing a second factor onchain

In Web2, every critical action has:
- a password
- a second factor

In crypto? Just a private key. That's it.

**Key line:** "Crypto has authentication. It doesn't have authorization."

---

## Slide 4 — The Solution (30s)

**Title:** Trana Guard

Trana adds a second factor at execution time.

A program can now say: *"This action cannot execute unless a second device approves it."*

That second factor can be:
- Face ID
- a hardware key
- any secure device

**Key line:** "We are not replacing wallets. We are adding a second layer of approval."

---

## Slide 5 — How It Works (30–40s)

**Title:** One line for developers

From a protocol's perspective — they add one line:

```rust
guard::cpi::enforce(...)
```

That's it.

Now:
- Normal transactions → work as usual
- High-risk actions → require second approval

From the user side: approve with device → confirm transaction. Done.

**Key line:** "No new wallets. No custody. No friction for everyday use."

---

## Slide 6 — Demo / Attack (30s)

**Title:** Compromised key → blocked

We simulate a real attack:
- Attacker has the private key
- Tries to withdraw funds

Without second factor: ❌ transaction fails onchain

With second factor: ✅ succeeds

**Key line:** "Even with the key, you still can't execute."

---

## Slide 7 — Where This Matters (25s)

**Title:** Protecting what actually breaks

This is not for every transaction. It's for:
- Protocol upgrades
- Treasury withdrawals
- Admin actions
- Vault releases

The exact places where hacks happen.

**Key line:** "We protect the most expensive mistakes."

---

## Slide 8 — Close (10–15s)

**Title:** Execution needs a second factor

Wallets made signing easier.

Trana makes execution safer.

**Final line (slow):** "We're adding the missing second factor to crypto."

---

## Q&A Answers

**"How is this different from multisig?"**
Multisig adds more signatures. We add a different *type* of approval.

**"How is this different from Para / passkey wallets?"**
They protect wallet access. We protect what actually executes.

**"Why is this needed?"**
Because most exploits today happen after a valid signature.

---

## Delivery Notes

- Slow down after key lines
- Pause after "protocol cannot say no"
- Don't rush the demo explanation
- Speak like it's obvious, not experimental
