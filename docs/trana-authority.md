# Trana Authority — Architecture

## The Second Primitive

Trana has two programs:

| | `trana_guard` (Program 1) | `trana_authority` (Program 2) |
|---|---|---|
| **What you do** | Add `enforce()` inside your program | Transfer upgrade authority to a Trana PDA |
| **Code changes to target** | 3 accounts + 1 CPI call | **Zero** |
| **Works on programs you didn't write** | No | **Yes** |
| **Best for** | Custom policies, conditional logic | Upgrade authority for any deployed program |

`trana_authority` is a new primitive: **a program's upgrade authority can be secured with a second factor without touching the target program.**

```
Before:
  wallet_keypair  ──►  upgrade_authority  ──►  can upgrade anything, always

After:
  wallet_keypair  ──►  trana_authority::execute_upgrade()
                              │
                              ├── trana_guard::cpi::enforce()   ← Touch ID required
                              │
                              └── bpf_loader::upgrade()          ← PDA signs via CPI
                                        ↑
                              [trana_authority PDA is the real upgrade authority]
```

---

## What This Unlocks

| Scenario | What happens |
|---|---|
| Leaked deploy key | Key alone cannot upgrade — PDA is the authority |
| Supply chain attack on CI | No passkey proof → `execute_upgrade` reverts |
| Social engineering | Wallet sign alone is not enough |
| Reclaiming authority | Even the escape hatch (`reclaim_authority`) requires passkey |

Because `trana_authority` delegates all security to `trana_guard::cpi::enforce()`, it automatically inherits everything the guard supports — today and in future versions. Key recovery, new policy types, multi-device support, hardware keys — all apply without changing `trana_authority`.

---

## Program: `trana_authority`

### State

```rust
#[account]
pub struct AuthorityRecord {
    pub owner:  Pubkey,   // wallet that controls this PDA
    pub target: Pubkey,   // program being protected
    pub bump:   u8,
}
```

### PDA

Seeds: `[b"trana-authority", owner.key().as_ref(), target.key().as_ref()]`

One PDA per (owner, target) pair. One wallet can protect multiple programs independently.

### Instructions

#### `register()`

Creates the `AuthorityRecord` PDA. Called once before the authority transfer.

```
Accounts: owner (signer), target (program ID), authority_record (init), system_program
```

After calling `register`, the user transfers the real upgrade authority externally:
```bash
solana program set-upgrade-authority <PROGRAM_ID> \
  --new-upgrade-authority <AUTHORITY_PDA>
```

---

#### `execute_upgrade`

Requires passkey. CPIs to BPF Loader with PDA signing.

```rust
pub fn execute_upgrade(ctx: Context<ExecuteUpgrade>) -> Result<()> {
    trana_guard::cpi::enforce(ctx.accounts.trana_cpi_ctx(), Policy::Require)?;

    let seeds = &[
        b"trana-authority",
        ctx.accounts.owner.key().as_ref(),
        ctx.accounts.program.key().as_ref(),
        &[ctx.accounts.authority_record.bump],
    ];

    invoke_signed(&bpf_loader_upgradeable::upgrade(...), ..., &[seeds])?;
    Ok(())
}
```

Accounts:
```
owner               Signer
authority_record    AuthorityRecord PDA (has_one = owner, has_one = target)
program             the program being upgraded
program_data        the program's data account
buffer              the uploaded .so buffer
spill               rent reclaim destination
bpf_loader          BPFLoaderUpgradeab1e...
trana_guard_program Trana Guard program
trana_registry      [b"2fa", owner] PDA
trana_instructions  Instructions sysvar
```

---

#### `reclaim_authority(new_authority)`

Returns the upgrade authority from the PDA to a new pubkey. Requires passkey — even the escape hatch is second-factor protected. Closes the `AuthorityRecord` PDA and returns rent to the owner.

```rust
pub fn reclaim_authority(ctx: Context<ReclaimAuthority>, new_authority: Pubkey) -> Result<()> {
    trana_guard::cpi::enforce(ctx.accounts.trana_cpi_ctx(), Policy::Require)?;
    // CPI to bpf_loader_upgradeable::set_upgrade_authority with PDA signing
    // Then close authority_record PDA, return rent to owner
    Ok(())
}
```

---

## Transaction Layout

Same as `trana_guard` — the SDK assembles identically:

```
ix[0]:  secp256r1 precompile
ix[1]:  trana_guard::record_proof
ix[2]:  trana_authority::execute_upgrade  ← calls enforce() → then BPF Loader CPI
```

The guard reads ix[2] via the Instructions sysvar. `execute_upgrade` is the protected instruction. `enforce()` verifies it. Then the BPF Loader CPI executes under PDA authority. All atomic.

---

## Demo Script — "The Leaked Key"

### Setup (pre-demo, done once)
```bash
# 1. Deploy a demo program
# 2. Register the authority PDA
trana_authority::register(owner, demo_program)

# 3. Transfer upgrade authority to the PDA
solana program set-upgrade-authority <DEMO_PROGRAM> --new-upgrade-authority <UPGRADE_PDA>
```

### On Stage

**Show the leaked keypair** (display the pubkey on screen — it's just a test key)

---

**Attempt 1 — Raw upgrade with leaked key**
```bash
solana program deploy --upgrade-authority leaked_key.json new_binary.so
```
```
Error: invalid upgrade authority
```
> "The leaked key is no longer the authority. The PDA is."

---

**Attempt 2 — Call the wrapper, no proof**
```bash
# Submit trana_authority::execute_upgrade without secp256r1 + record_proof ixs
```
```
Error: MissingProof
```
> "The guard blocked it. No second factor, no execution."

---

**Attempt 3 — With second factor**
```
[Touch ID prompt on phone]
[tap]
```
```
✅ Transaction confirmed
Program upgraded successfully
```

**Killer line:**

> "The leaked key can request the action. It cannot authorize execution."

---

## Comparison to Squads / Multisig

| | Squads Multisig | Trana Authority |
|---|---|---|
| Second factor type | More signatures (same kind) | Different factor (biometric) |
| Setup | Create multisig, add members | Register PDA, transfer authority |
| Execution | Collect M-of-N signatures | One Touch ID tap |
| Ceremony | Yes (coordinate signers) | No |
| Compromised member key | Threshold still safe | Leaked key alone is useless |

They are complementary. Squads + Trana = multisig ceremony + biometric for each signer.

---

## Positioning

Two programs. Full stack.

```
User actions   →  trana_guard      →  policy-based, conditional, embedded in your program
Admin actions  →  trana_authority  →  always-on, zero-code, wraps any existing upgrade authority
```
