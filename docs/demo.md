# Demo — Architecture and Implementation

The demo has two components: the `demo_vault` Solana program (the integration reference) and the `apps/web` Next.js UI. Together they make the security model tangible — you can see it fail in the right ways and succeed in the right ways.

---

## Purpose

The demo is not a product. It is a teaching tool that answers three questions:

1. **What does Trana integration look like in a real Solana program?** (`programs/demo_vault`)
2. **What does Trana integration look like in a real dApp?** (`apps/web`)
3. **Why can't an attacker bypass it?** (the attack simulation button)

The demo vault is deliberately simple so the integration pattern is visible. Copy the pattern, not the vault.

---

## demo_vault — The Integration Reference Program

**Program ID:** `Cm2jPgn1ipUAFarS7DpF2Y1X1HofKZgDKLmH65DtCNrZ`

### State

One account per user. Seeds: `["vault", owner_pubkey]`.

```rust
pub struct VaultState {
    pub owner:                  Pubkey,  // who owns this vault
    pub balance:                u64,     // SOL held (lamports)
    pub opt_in:                 bool,    // user elected to always require passkey
    pub last_large_deposit_at:  i64,     // unix ts of last large deposit
    pub last_large_deposit_amount: u64,  // amount of that deposit
}
```

### Instructions

**`init_vault`** — Creates the VaultState PDA. Call once per user.

**`deposit(amount: u64)`** — Transfers SOL from user to vault PDA.
- If `amount >= LARGE_THRESHOLD` (1 SOL): calls `guard::cpi::enforce()` (large deposit protection, records deposit timestamp for rapid-drain detection).
- Otherwise: no passkey required.

**`withdraw(amount: u64)`** — Transfers SOL from vault PDA to destination.
- Evaluates policy. If any policy matches: calls `guard::cpi::enforce()`.
- Otherwise: transfers directly.

**`set_opt_in(enabled: bool)`** — Toggle opt-in mode. When true, ALL withdrawals require a passkey regardless of amount.

### Three Policies

The `evaluate_policy()` function is pure — it takes vault state and amount, returns a policy string or None. No state side effects. This makes it trivially unit testable (12 tests, no Solana runtime needed).

**Policy 1: `transfer.always` (opt-in)**
```rust
if vault.opt_in {
    return Some("transfer.always")
}
```
The user has explicitly opted in to always-require-passkey. Even a 1 lamport withdrawal requires approval. This models custodial flows where the user wants maximum security.

**Policy 2: `transfer.rapid_drain`**
```rust
if vault.last_large_deposit_amount >= RAPID_DEPOSIT_THRESHOLD {  // 5 SOL
    let elapsed = now - vault.last_large_deposit_at;
    if elapsed < RAPID_WINDOW {  // 300 seconds / 5 minutes
        return Some("transfer.rapid_drain")
    }
}
```
Detects the common exploit pattern: attacker compromises wallet, immediately deposits a large amount to demonstrate access, then withdraws. A withdrawal within 5 minutes of a ≥5 SOL deposit is flagged. This blocks "drain immediately after deposit" attacks even for small withdrawals.

**Policy 3: `transfer.large`**
```rust
if amount >= LARGE_THRESHOLD {  // 1 SOL (1_000_000_000 lamports)
    return Some("transfer.large")
}
```
Any withdrawal of 1 SOL or more requires passkey approval. The simplest and most common policy.

**Priority:** opt_in > rapid_drain > large. First match wins. A proof signed for `"transfer.always"` cannot satisfy a check that expected `"transfer.large"` — the policy string is embedded in the intent hash.

### What Makes This a Good Integration Pattern

The total Trana-specific code in demo_vault:

```rust
// accounts (3 lines)
pub guard_program:      Program<'info, Guard>,
pub trana_registry:     Account<'info, guard::TwoFactorRegistry>,
pub trana_instructions: UncheckedAccount<'info>,

// enforcement (1 line)
guard::cpi::enforce(ctx.accounts.trana_cpi_ctx())?;

// CPI context helper (copy-paste, 10 lines)
pub fn trana_cpi_ctx(&self) -> CpiContext<...> { ... }
```

Everything else is normal vault logic. The Trana integration is additive — it doesn't restructure the program.

---

## apps/web — The Demo UI

**Stack:** Next.js 16, React 19, TypeScript, Tailwind CSS, Solana wallet-adapter.

**RPC:** Devnet by default (`NEXT_PUBLIC_SOLANA_RPC` env var).

### Components

The UI is a single page (`apps/web/app/page.tsx`) with no server-side logic, no API routes, no database. Everything runs in the browser.

**Setup Panel**
Walks through three setup steps:
1. Connect wallet (Phantom, via `@solana/wallet-adapter-react`)
2. Register passkey (calls `doRegistration()` → `register_two_fa`)
3. Initialize vault (calls `init_vault`)

Each step shows a checkmark when done, with an action button when needed. Designed to make the setup flow obvious for a demo.

**Vault Panel**
Shows current vault balance and opt-in status. Deposit buttons (0.5 SOL, 2 SOL). Opt-in toggle. Refreshes after every transaction.

**Policy Panel**
Displays the three active policies with their conditions. Policies become visually active/inactive based on current vault state. Shows the policy ID string (the same string that appears in transaction logs).

**Attack Panel**
Single button: "Attack without passkey". Sends a 1 SOL withdrawal without any proof instructions. Expected result: `MissingProof` error from the guard program. The UI shows this as a success (the system worked correctly by rejecting it).

This is the most important demo element: showing that the rejection happens at execution time, not just in the UI, and showing the exact error code.

**Withdraw Panel**
Three withdrawal amounts:
- 0.1 SOL — no policy triggered, instant (no passkey)
- 1.5 SOL — triggers `transfer.large`, requires passkey
- 2.5 SOL — triggers `transfer.large`, requires passkey

Each button shows whether a passkey will be required (labeled with the policy name). When a passkey is required, clicking triggers the native browser WebAuthn prompt (Touch ID / Face ID / security key — whatever the device supports).

**Activity Feed**
Scrolling list of recent transactions with status, label, and Solana Explorer link (devnet). Clickable signatures go to the explorer showing the full transaction and `ProofVerified` event.

### What's Not in the UI

- No API routes. No `/api/*` directory.
- No Supabase, no database, no session management.
- No custom modal components for passkey prompts — uses native browser WebAuthn.
- No custom signature verification — the secp256r1 precompile handles that.

The browser does the WebAuthn. The Solana runtime does the verification. The UI is just the coordination layer.

---

## Transaction Flow in the Demo

When the user clicks "Withdraw 1.5 SOL":

```
1. SDK fetches registry PDA
   → nonce=7, credentialId=[...], pubkey=[33 bytes]

2. SDK builds TranaIntent
   → version=1, domain="trana:v1", cluster="devnet"
   → wallet=<user>, guard=<guard_id>, target=<vault_id>
   → policy="transfer.large"
   → discriminator=[0xb7, 0x12, ...]
   → accountsHash=SHA256(vault||owner||dest||guard||registry||sysvar)
   → paramsHash=SHA256(1500000000 as u64-LE)
   → nonce=7, expiryUnix=<now + 120>

3. SDK computes hashIntent → 32-byte challenge

4. Browser calls navigator.credentials.get(challenge=intentHash)
   → OS shows Touch ID / Face ID / PIN prompt
   → User approves
   → Returns { sig (DER), authenticatorData, clientDataJSON }

5. SDK converts DER → compact + lowS → 64-byte r‖s

6. SDK builds transaction:
   ix[0] secp256r1: pubkey=registry.pubkey | sig=compact | msg=SHA256(authData‖SHA256(cdJSON))
   ix[1] record_proof: 1 | expiry | "devnet" | "transfer.large" | authData | cdJSON
   ix[2] demo_vault::withdraw: vault, owner, dest, guard, registry, sysvar, amount=1500000000

7. Phantom signs the entire transaction (wallet signature)

8. Transaction submitted

9. Runtime executes:
   - secp256r1: P-256 sig verified natively
   - record_proof: version check only
   - demo_vault::withdraw:
       → evaluatePolicy → returns "transfer.large"
       → guard::cpi::enforce()
           → verify_via_sysvar()
               → reads record_proof from ix[1]
               → reads withdraw from ix[2]
               → checks expiry: ok
               → computes intent hash: matches challenge in cdJSON
               → checks secp256r1 ix[0]: pubkey matches registry, msg matches e_value
               → increments nonce: 7 → 8
               → emits ProofVerified{policy="transfer.large", nonce=7, ...}
               → ok
       → transfers 1.5 SOL from vault to destination
       → emits WithdrawEvent

10. UI shows confirmation + Explorer link
```

---

## Running the Demo

### Prerequisites

```bash
# Solana CLI + Anchor
sh -c "$(curl -sSfL https://release.anza.xyz/stable/install)"
cargo install --git https://github.com/coral-xyz/anchor anchor-cli

# Node.js 22+ (see repo engines)
```

### Build and deploy

```bash
# Install deps
npm install

# Build programs
anchor build

# Run all tests (6 core scenarios via demo_vault)
anchor test

# Deploy to devnet
anchor deploy --provider.cluster devnet

# Copy IDLs to web app and SDK
cp target/idl/guard.json apps/web/lib/guard.json
cp target/idl/demo_vault.json apps/web/lib/demo_vault.json
cp target/idl/guard.json packages/sdk/src/guard.json
```

### Run the UI

```bash
cd apps/web
npm run dev
# open http://localhost:3000
```

Connect Phantom (set to devnet), register a passkey, initialize a vault, deposit SOL, try the attack, try a real withdrawal.

---

## Test Coverage

`tests/guard.ts` contains 6 scenarios (R1-R6) that test the guard program via `demo_vault::withdraw`:

| Scenario | What it tests | Expected result |
|---|---|---|
| R1 | Register secp256r1 passkey | Success, registry PDA created |
| R2 | Valid proof, large withdrawal | Success, nonce incremented |
| R3 | Replay old proof (nonce consumed) | PayloadMismatch |
| R4 | Wrong P-256 signing key | WrongSigner |
| R5 | Tampered amount after proof | PayloadMismatch |
| R6 | Missing secp256r1 instruction | MissingProof |

`programs/demo_vault/src/lib.rs` contains 12 unit tests for `evaluate_policy()`:
- opt_in always triggers
- opt_in overrides rapid_drain
- opt_in overrides large
- rapid_drain within window triggers
- rapid_drain outside window doesn't
- rapid_drain only if deposit large enough
- rapid_drain overrides large
- large threshold triggers at exact value
- below threshold: no policy
- no policy for small amounts
- (and more boundary cases)

These test the policy logic in isolation — no Solana runtime, no async, fast.

---

## What to Copy vs What to Ignore

When building your own integration:

**Copy from demo_vault:**
- The three-account pattern for Trana accounts
- The `trana_cpi_ctx()` helper impl block
- The `evaluate_policy()` pure function pattern
- The `if policy.is_some() { guard::cpi::enforce() }` call site
- The account constraints (seeds, constraint = enabled)

**Do not copy:**
- The vault itself (SOL custody is just a demo)
- The specific policies (define your own)
- The specific thresholds (1 SOL, 5 minutes)
- Any of the VaultState fields (not relevant to Trana)

**Copy from the web app:**
- The registration flow (doRegistration → register_two_fa ix)
- The withdraw flow (fetchRegistry → buildIntent → hashIntent → doApproval → tx assembly)
- The error handling for MissingProof/PayloadMismatch

**Do not copy:**
- The specific UI design
- The vault-specific state management
- The demo-specific buttons and scenarios

The patterns are the product. The demo just makes them visible.
