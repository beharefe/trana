# Devnet Deploy — Demo Vault

Sets up `trana_test_vault` as a live passkey-gated pool for the pitch demo.
After completing this guide you can safely publish the seed phrase — the vault
funds are protected by the passkey even if someone has the full wallet key.

## Prerequisites

- Core programs deployed (`deploy-devnet-core.md` completed)
- Passkey device available (phone / laptop with Touch ID / Face ID)
- Frontend running and pointed at devnet (needed for passkey registration)

## Program ID

```
trana_test_vault 8v6hfEZ32JLMJE4kk63zTzow7VbygewhrPhqiVdyxtaa
```

## Step 1 — Deploy the vault program

```bash
anchor deploy --provider.cluster devnet --program-name trana_test_vault
solana program show 8v6hfEZ32JLMJE4kk63zTzow7VbygewhrPhqiVdyxtaa --url devnet
```

## Step 2 — Register your passkey

Use the frontend (or SDK script). This creates the `TwoFactorRegistry` PDA
and stores your P-256 public key on-chain.

After registration the registry is locked:
- `register_two_fa` will return `Unauthorized` for any future attempts
- Replacing the key requires `recover_two_fa` + proof from the existing passkey

**Verify:**
```bash
# Registry PDA = [b"2fa", owner.pubkey]
# Check it exists and pubkey_bytes is non-empty via the frontend or Anchor client
```

## Step 3 — Lock the upgrade authority

This is what prevents `solana program close` or a direct redeploy even if
someone has the wallet key.

```bash
# Derive the trana_authority PDA for (owner, trana_test_vault)
# Seeds: [b"trana-authority", owner.pubkey, trana_test_vault.programId]
# Use the frontend or the script below to get the address.
```

**3a. Register the PDA:**
```typescript
// In your deploy script or frontend:
await authority.methods
  .register({ programUpgrade: {} })
  .accounts({ owner: yourWallet, target: TRANA_TEST_VAULT_ID })
  .rpc()
```

**3b. Compute the PDA address:**
```typescript
import { PublicKey } from "@solana/web3.js"

const TRANA_AUTHORITY_ID = new PublicKey("KoXvrg4DBLKa5U6LCUpWXJE1FHYqwaozqDqDcBXvGEE")
const [pda] = PublicKey.findProgramAddressSync(
  [
    Buffer.from("trana-authority"),
    yourWallet.toBuffer(),
    new PublicKey("8v6hfEZ32JLMJE4kk63zTzow7VbygewhrPhqiVdyxtaa").toBuffer(),
  ],
  TRANA_AUTHORITY_ID,
)
console.log("upgrade authority PDA:", pda.toBase58())
```

**3c. Transfer the upgrade authority to the PDA:**
```bash
solana program set-upgrade-authority 8v6hfEZ32JLMJE4kk63zTzow7VbygewhrPhqiVdyxtaa \
  --new-upgrade-authority <PDA_ADDRESS> \
  --url devnet

# Verify
solana program show 8v6hfEZ32JLMJE4kk63zTzow7VbygewhrPhqiVdyxtaa --url devnet
# "Upgrade authority:" should show the PDA, not your wallet
```

After this step, upgrading the vault program requires:
1. Passkey proof signed by you
2. `trana_authority::execute_upgrade` CPI

Neither is possible with just the wallet key.

## Step 4 — Initialise the pool

Choose a pool kind for the demo:

**Option A — Limit pool** (small pulls free, ≥ 1 SOL requires passkey):
```typescript
await vault.methods
  .initializePool({ limit: {} }, "Trana Demo Vault")
  .accounts({ authority: yourWallet })
  .rpc()
```

**Option B — TimeLocked pool** (1-minute cooldown between withdrawals):
```typescript
await vault.methods
  .initializePool({ timeLocked: {} }, "Trana Demo Vault")
  .accounts({ authority: yourWallet })
  .rpc()
```

Pool PDA seeds: `[b"trana-pool", authority.pubkey]`

## Step 5 — Fund the pool

```bash
# Deposit 1-2 SOL so the balance is visible on the explorer
```

```typescript
await vault.methods
  .deposit(new anchor.BN(1_000_000_000))  // 1 SOL
  .accounts({ pool: poolPda, depositor: yourWallet })
  .rpc()
```

Anyone can call `deposit` — this is intentional. During the pitch you can
invite the audience to top it up.

## Step 6 — Drain the wallet to dust

The pool PDA holds the funds, not the wallet. Leave just enough for gas:

```bash
# Send almost everything out — keep ~0.01 SOL for transaction fees
solana transfer <your_cold_wallet> 0.99 --url devnet
# or use --allow-unfunded-recipient if cold wallet is new
```

Check remaining balance:
```bash
solana balance --url devnet
# should be ~0.01 SOL
```

## Step 7 — Smoke test the attack surface

Before publishing the phrase, confirm every attack fails:

```bash
# 1. Try to withdraw without passkey (expect MissingProof 6000)
# Run via frontend or build a raw tx

# 2. Try to re-register a passkey (expect Unauthorized 6008)
solana program call ... # or via ts-node

# 3. Try to redeploy the vault (expect authority mismatch)
anchor deploy --provider.cluster devnet --program-name trana_test_vault
# Error: Program's authority <PDA> does not match authority provided <wallet>
```

## Step 8 — Publish the phrase

Once steps 1–7 are complete:

```
Seed phrase:  ___ ___ ___ ___ ___ ___ ___ ___ ___ ___ ___ ___
Pool address: <pool_pda>
Pool balance: 1 SOL
```

**What attackers get with the phrase:**
- ~0.01 SOL from the wallet itself (dust, acceptable)
- The ability to call `deposit` (they can add more SOL — fine)

**What attackers cannot do:**
- Withdraw pool funds — `enforce()` blocks it every time
- Change the passkey — `register_two_fa` returns Unauthorized
- Upgrade the program — upgrade authority is the trana_authority PDA
- Close the vault program — same PDA, same passkey requirement

## Pool address helper

```typescript
const VAULT_ID = new PublicKey("8v6hfEZ32JLMJE4kk63zTzow7VbygewhrPhqiVdyxtaa")

const [poolPda] = PublicKey.findProgramAddressSync(
  [Buffer.from("trana-pool"), yourWallet.toBuffer()],
  VAULT_ID,
)

const [userDepositPda] = PublicKey.findProgramAddressSync(
  [Buffer.from("deposit"), poolPda.toBuffer(), yourWallet.toBuffer()],
  VAULT_ID,
)

console.log("pool:        ", poolPda.toBase58())
console.log("userDeposit: ", userDepositPda.toBase58())
```

## Re-deploying after a patch

If you need to patch the vault program after publishing the phrase:

1. Use `trana_authority::execute_upgrade` with your passkey
2. The passkey proof is required — no wallet-only shortcut
3. After upgrade, the upgrade authority is automatically preserved on the PDA

```typescript
// Build buffer via CLI, then:
const buffer = createUpgradeBuffer("target/deploy/trana_test_vault.so", upgradePda)
await buildAndSendProof(tranaGuard, executeUpgradeIx, owner, passkey)
```
