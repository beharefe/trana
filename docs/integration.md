# Integration Guide — Making Trana Widely Adoptable

The design goal is that integrating Trana should feel like adding a line of code, not a system.

This document walks through every integration pattern: from the minimal onchain addition to the full React SDK.

---

## Philosophy: The Integration Cost

Here is the full integration cost for a Solana program author:

**1. Add three accounts to your instruction struct:**
```rust
pub trana_guard_program: Program<'info, Guard>,
pub trana_registry:    Account<'info, guard::TwoFactorRegistry>,
pub trana_instructions: UncheckedAccount<'info>,
```

**2. Add one CPI call when your policy triggers:**
```rust
if policy_requires_passkey {
    trana::cpi::enforce(ctx.accounts.trana_cpi_ctx())?;
}
```

**3. Add one helper (copy-paste):**
```rust
impl<'info> YourAccounts<'info> {
    pub fn trana_cpi_ctx(&self) -> CpiContext<'_, '_, '_, 'info, Enforce<'info>> {
        CpiContext::new(
            self.trana_guard_program.to_account_info(),
            Enforce {
                registry:     self.trana_registry.to_account_info(),
                owner:        self.owner.to_account_info(),
                instructions: self.trana_instructions.to_account_info(),
            },
        )
    }
}
```

That's it. The SDK handles everything else.

---

## Onchain Integration (Rust / Anchor)

### Step 1: Add the guard dependency

`Cargo.toml`:
```toml
[dependencies]
anchor-lang = { version = "0.32.0", features = ["init-if-needed"] }
guard = { path = "../guard", features = ["cpi"] }
# or from crates.io once published:
# trana-guard = { version = "0.1", features = ["cpi"] }
```

### Step 2: Import

```rust
use guard::cpi::accounts::Enforce;
use guard::program::Guard;
```

### Step 3: Add accounts to your instruction

```rust
#[derive(Accounts)]
pub struct YourProtectedAction<'info> {
    // --- your existing accounts ---
    #[account(mut, has_one = owner)]
    pub your_state: Account<'info, YourState>,
    pub owner: Signer<'info>,

    // --- Trana (3 accounts) ---
    pub trana_guard_program: Program<'info, Guard>,

    #[account(
        mut,
        seeds  = [b"2fa", owner.key().as_ref()],
        bump,
        seeds::program = trana_guard_program.key(),
        constraint = trana_registry.enabled @ YourError::PasskeyNotRegistered,
    )]
    pub trana_registry: Account<'info, guard::TwoFactorRegistry>,

    /// CHECK: Instructions sysvar
    #[account(address = anchor_lang::solana_program::sysvar::instructions::ID)]
    pub trana_instructions: UncheckedAccount<'info>,
}
```

### Step 4: Define your policy

```rust
fn requires_passkey(amount: u64, user_opt_in: bool) -> bool {
    user_opt_in || amount >= 1_000_000_000  // 1 SOL
}
```

### Step 5: Call enforce

```rust
pub fn your_protected_action(ctx: Context<YourProtectedAction>, amount: u64) -> Result<()> {
    if requires_passkey(amount, ctx.accounts.your_state.opt_in) {
        trana::cpi::enforce(ctx.accounts.trana_cpi_ctx())?;
    }

    // ... your normal logic
    Ok(())
}
```

### Step 6: CPI context helper

```rust
impl<'info> YourProtectedAction<'info> {
    pub fn trana_cpi_ctx(&self) -> CpiContext<'_, '_, '_, 'info, Enforce<'info>> {
        CpiContext::new(
            self.trana_guard_program.to_account_info(),
            Enforce {
                registry:     self.trana_registry.to_account_info(),
                owner:        self.owner.to_account_info(),
                instructions: self.trana_instructions.to_account_info(),
            },
        )
    }
}
```

### Step 7: Add policy errors

```rust
#[error_code]
pub enum YourError {
    #[msg("Register a passkey before performing this action")]
    PasskeyNotRegistered,
    // ... your other errors
}
```

---

## Client-Side Integration (TypeScript / SDK)

### Installation

```bash
npm install @trana-guard/sdk @solana/web3.js
```

### Option A: useTrana() hook (simplest)

Wrap your app with `TranaProvider`, then call `authorizeAndSend()`. The SDK handles everything: passkey prompt, proof building, instruction injection.

```tsx
// app layout or root
import { TranaProvider, TranaModal } from "@trana-guard/sdk"
import { PublicKey } from "@solana/web3.js"

const TRANA_GUARD_PROGRAM_ID = new PublicKey("572t8Ctxx1nrHgxJZ1EHSNZTLcMH4oxV1R6g2pRAqba6")
// or: new PublicKey(process.env.NEXT_PUBLIC_TRANA_GUARD_PROGRAM_ID!)

export default function Layout({ children }) {
  return (
    <SolanaProviders>
      <TranaProvider config={{
        tranaGuardProgramId: TRANA_GUARD_PROGRAM_ID,
        policy: "transfer.large",
        expiryTtlSec: 120,
      }}>
        {children}
        <TranaModal />
      </TranaProvider>
    </SolanaProviders>
  )
}
```

```tsx
// your component
import { useTrana } from "@trana-guard/sdk"
import { Transaction } from "@solana/web3.js"

function WithdrawButton({ amount, vault, recipient }) {
  const { authorizeAndSend } = useTrana()

  async function handleClick() {
    const sig = await authorizeAndSend({
      buildIntent: () => ({
        targetProgramId: YOUR_PROGRAM_ID,
        instructionDiscriminator: WITHDRAW_DISCRIMINATOR,
        accounts: [vault, wallet.publicKey, recipient, TRANA_GUARD_PROGRAM_ID, registryPda, SYSVAR_INSTRUCTIONS_PUBKEY],
        params: amountToU64LE(amount),
      }),
      buildTransaction: async ({ recentBlockhash }) => {
        const tx = new Transaction({ recentBlockhash, feePayer: wallet.publicKey })
        tx.add(buildWithdrawInstruction(amount, recipient))
        return tx
      },
    })
    console.log("confirmed:", sig)
  }

  return <button onClick={handleClick}>Withdraw</button>
}
```

The `buildTransaction` callback receives a fresh `recentBlockhash` fetched after passkey approval. This ensures the blockhash is not stale by the time the user taps Touch ID.

**What the SDK does automatically:**
1. Fetches registry (nonce, pubkey, credentialId)
2. Builds `TranaIntent` from your `IntentInput`
3. Computes `hashIntent()` → 32-byte challenge
4. Shows passkey prompt (native browser WebAuthn)
5. Converts DER → compact, normalizes low-S
6. Builds `secp256r1` instruction
7. Builds `trana::record_proof` instruction
8. Prepends both before your transaction's instructions
9. Signs (via wallet) and sends

### Option B: Manual control (direct SDK calls)

For teams that want full control over the flow.

```typescript
import {
  fetchRegistry,
  findRegistryPda,
  buildIntent,
  hashIntent,
  doApproval,
  buildSecp256r1Ix,
  buildWebAuthnMessage,
  buildRecordProofIx,
} from "@trana-guard/sdk"
import { Transaction, PublicKey } from "@solana/web3.js"

async function protectedWithdraw(
  connection: Connection,
  wallet: WalletContextState,
  amount: bigint,
) {
  const { publicKey } = wallet
  const guardId = new PublicKey("572t8Ctxx1nrHgxJZ1EHSNZTLcMH4oxV1R6g2pRAqba6")

  // 1. Fetch registry (nonce, pubkey, credentialId)
  const registry = await fetchRegistry(connection, publicKey, guardId)
  if (!registry) throw new Error("Register a passkey first")

  // 2. Derive accounts
  const [vaultPda]    = PublicKey.findProgramAddressSync([Buffer.from("vault"), publicKey.toBuffer()], VAULT_PROGRAM_ID)
  const [registryPda] = PublicKey.findProgramAddressSync([Buffer.from("2fa"), publicKey.toBuffer()], guardId)
  const destination   = publicKey  // withdraw to self

  // 3. Build intent (commits to exact transaction parameters)
  const intent = buildIntent(
    publicKey,
    guardId,
    {
      targetProgramId: VAULT_PROGRAM_ID,
      instructionDiscriminator: WITHDRAW_DISCRIMINATOR,  // 8-byte Uint8Array
      accounts: [vaultPda, publicKey, destination, guardId, registryPda, SYSVAR_INSTRUCTIONS_PUBKEY],
      params: amountBuffer,
      policy: "transfer.large",
    },
    registry.nonce,
    { policy: "transfer.large", expiryTtlSec: 120 },
  )

  // 4. Compute challenge = hashIntent
  const payloadHash = hashIntent(intent)

  // 5. WebAuthn approval (native browser prompt)
  const approval = await doApproval(registry.credentialId, payloadHash)

  // 6. Build proof instructions
  const webAuthnMsg   = buildWebAuthnMessage(approval.authenticatorData, approval.clientDataJSON)
  const secp256r1Ix   = buildSecp256r1Ix(registry.pubkey, approval.sig, webAuthnMsg)
  const recordProofIx = buildRecordProofIx(
    guardId,
    approval.authenticatorData,
    approval.clientDataJSON,
    intent.expiryUnix,
    "devnet",
    "transfer.large",
  )

  // 7. Build your transaction
  const { blockhash } = await connection.getLatestBlockhash("confirmed")
  const tx = new Transaction({ recentBlockhash: blockhash, feePayer: publicKey })

  // 8. Assemble: proof ixs first, then your ix
  tx.add(secp256r1Ix)
  tx.add(recordProofIx)
  tx.add(buildWithdrawInstruction(vaultPda, publicKey, destination, guardId, registryPda, amount))

  // 9. Sign and send
  const signed = await wallet.signTransaction(tx)
  return connection.sendRawTransaction(signed.serialize())
}
```

### Passkey Registration

Users must register before their first protected action. This writes their P-256 pubkey to the registry PDA.

```typescript
import { doRegistration } from "@trana-guard/sdk"
import { TransactionInstruction } from "@solana/web3.js"

async function registerPasskey(connection, wallet) {
  const { publicKey, signTransaction } = wallet
  const guardId = new PublicKey("572t8Ctxx1nrHgxJZ1EHSNZTLcMH4oxV1R6g2pRAqba6")

  // 1. WebAuthn ceremony — generates P-256 keypair on device
  const { credentialId, pubkey } = await doRegistration()

  // 2. Build register_two_fa instruction
  const [registryPda] = PublicKey.findProgramAddressSync(
    [Buffer.from("2fa"), publicKey.toBuffer()], guardId
  )

  const disc = Buffer.from([208, 119, 132, 246, 251, 236, 119, 54])  // from IDL
  const lenBuf = (n) => { const b = Buffer.alloc(4); b.writeUInt32LE(n); return b }
  const data = Buffer.concat([
    disc,
    Buffer.from([0]),          // key_kind = Secp256r1Passkey
    lenBuf(pubkey.length), Buffer.from(pubkey),
    lenBuf(credentialId.length), Buffer.from(credentialId),
  ])

  const ix = new TransactionInstruction({
    programId: guardId,
    keys: [
      { pubkey: registryPda, isSigner: false, isWritable: true },
      { pubkey: publicKey,   isSigner: true,  isWritable: true },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
    ],
    data,
  })

  // 3. Send
  const { blockhash } = await connection.getLatestBlockhash()
  const tx = new Transaction({ recentBlockhash: blockhash, feePayer: publicKey })
  tx.add(ix)
  const signed = await signTransaction(tx)
  return connection.sendRawTransaction(signed.serialize())
}
```

---

## Accounts Order for Intent

The `accounts` array in `buildIntent` must exactly match the order of accounts in your protected instruction. This is used to compute `accounts_hash = SHA-256(concat(all pubkeys))`.

For a `withdraw` instruction with accounts: `[vault, owner, destination, trana_guard_program, registry, instructions_sysvar]`, the intent must receive them in that exact order.

Check your IDL for the canonical account order.

---

## Policy Design Guide

Policies are strings that appear in transaction logs and the `ProofVerified` event. Design them to be:

**Descriptive:** `"treasury.disbursement"` not `"action_1"`

**Namespaced:** `"protocol_name.policy_name"` to avoid collisions when multiple protocols use the same guard

**Minimal set:** Define policies for categories, not individual transactions. One policy for all large transfers, not one per amount range.

**Example policies by use case:**

```
DeFi vault:
  transfer.large        — single withdrawal above threshold
  transfer.rapid_drain  — withdrawal soon after large deposit
  transfer.always       — user opt-in to always require passkey

DAO treasury:
  governance.disbursement  — all treasury outflows
  governance.emergency     — time-locked emergency withdrawals

Protocol admin:
  admin.upgrade            — program upgrade authority
  admin.param_change       — update protocol parameters
  admin.pause              — emergency pause

Lending:
  borrow.large             — large collateralized borrow
  borrow.uncollateralized  — undercollateralized positions
```

---

## Adoption Checklist

For any protocol team adding Trana:

**Onchain:**
- [ ] Add `guard` as a CPI dependency with `features = ["cpi"]`
- [ ] Add three accounts to relevant instruction structs
- [ ] Implement `trana_cpi_ctx()` helper on each Account struct
- [ ] Define policy function (pure, testable)
- [ ] Call `trana::cpi::enforce(cpi_ctx)?` when policy returns Some
- [ ] Write unit tests for policy evaluation (no chain needed)
- [ ] Write integration tests with the full transaction shape

**Client:**
- [ ] Install `@trana-guard/sdk`
- [ ] Add `TranaProvider` wrapping the app (or use manual SDK calls)
- [ ] Implement passkey registration flow for new users
- [ ] Check `fetchRegistry()` before calling protected actions
- [ ] Provide `buildIntent` with correct accounts/params/discriminator
- [ ] Handle `MissingProof` / `PayloadMismatch` errors gracefully

**Operations:**
- [ ] Index `ProofVerified` events for audit trail
- [ ] Monitor for unexpected policy types in logs
- [ ] Define key rotation procedure (re-register passkey)

---

## Verify Your Integration

Test these scenarios before going live:

1. **Happy path:** Send valid proof → success
2. **No proof:** Send without secp256r1+record_proof → `MissingProof`
3. **Wrong key:** Sign with different P-256 key → `WrongSigner`
4. **Replay:** Resubmit same proof → `PayloadMismatch` (nonce consumed)
5. **Tampered amount:** Change params after proof → `PayloadMismatch`
6. **Tampered recipient:** Change accounts after proof → `PayloadMismatch`
7. **Expired proof:** Wait past expiry → `ProofExpired`
8. **Small transfer, no policy:** Send without proof → success (no enforce called)

All of these are covered in `tests/guard.ts` (R1-R6) as real examples.
