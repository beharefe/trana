# Trana Authority — Architecture

## The Second Primitive

Trana has two programs:

| | `trana_guard` (Program 1) | `trana_authority` (Program 2) |
|---|---|---|
| **What you do** | Add `enforce()` inside your program | Transfer any authority to a Trana PDA |
| **Code changes to target** | 3 accounts + 1 CPI call | **Zero** |
| **Works on programs you didn't write** | No | **Yes** |
| **Best for** | Custom policies, conditional logic | Admin keys, upgrade/mint/freeze authority |

`trana_authority` is a new primitive: **any Solana authority can be secured with a second factor without touching the target program.**

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

Any Solana "authority" field can be transferred to a `trana_authority` PDA:

| Authority type | Protected by | Demo scenario |
|---|---|---|
| `upgrade_authority` (BPF Loader) | `execute_upgrade` | Leaked deploy key → can't upgrade |
| `mint_authority` (SPL Token) | `execute_mint` | Leaked admin key → can't mint |
| `freeze_authority` (SPL Token) | `execute_freeze` / `execute_thaw` | Leaked key → can't freeze holders |
| `reclaim_authority` | `reclaim_authority` | Even escaping requires passkey |

Because `trana_authority` delegates all security to `trana_guard::cpi::enforce()`, it automatically inherits everything the guard supports — today and in future versions. Key recovery, new policy types, multi-device support, hardware keys — all apply without changing `trana_authority`.

---

## Program: `trana_authority`

### State

```rust
pub enum AuthorityKind {
    ProgramUpgrade,   // target = program being protected
    TokenMint,        // target = mint account
    TokenFreeze,      // target = mint account (freeze_authority)
}

#[account]
pub struct AuthorityRecord {
    pub owner:          Pubkey,        // wallet that controls this PDA
    pub target:         Pubkey,        // program ID or mint being protected
    pub authority_kind: AuthorityKind,
    pub bump:           u8,
}
```

### PDA

Seeds: `[b"trana-authority", owner.key().as_ref(), target.key().as_ref()]`

One PDA per (owner, target) pair. One wallet can protect multiple programs/mints independently.

### Instructions

#### `register(authority_kind)`

Creates the `AuthorityRecord` PDA. Called once before the authority transfer.

```
Accounts: owner (signer), target (any pubkey), authority_record (init), system_program
```

After calling `register`, the user transfers the real authority externally:
```bash
# For program upgrade:
solana program set-upgrade-authority <PROGRAM_ID> \
  --new-upgrade-authority <AUTHORITY_PDA>

# For token mint:
spl-token authorize <MINT> mint <AUTHORITY_PDA>
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

    bpf_loader_upgradeable::upgrade(
        CpiContext::new_with_signer(ctx.accounts.bpf_loader.to_account_info(), ..., &[seeds])
    )?;
    Ok(())
}
```

Accounts:
```
owner               Signer
authority_record    AuthorityRecord PDA (has_one = owner, has_one = target)
authority_pda       PDA that holds the actual upgrade authority
program             the program being upgraded
program_data        the program's data account
buffer              the uploaded .so buffer
spill               rent reclaim destination
bpf_loader          BPFLoaderUpgradeab1e...
guard_program       trana_guard program
trana_registry      [b"2fa", owner] PDA
trana_instructions  Instructions sysvar
```

---

#### `execute_mint(amount)`

Requires passkey. CPIs to SPL Token `mint_to` with PDA signing.

```rust
pub fn execute_mint(ctx: Context<ExecuteMint>, amount: u64) -> Result<()> {
    trana_guard::cpi::enforce(ctx.accounts.trana_cpi_ctx(), Policy::Require)?;

    let seeds = &[
        b"trana-authority",
        ctx.accounts.owner.key().as_ref(),
        ctx.accounts.mint.key().as_ref(),
        &[ctx.accounts.authority_record.bump],
    ];

    token::mint_to(
        CpiContext::new_with_signer(ctx.accounts.token_program.to_account_info(), ..., &[seeds]),
        amount,
    )?;
    Ok(())
}
```

---

#### `reclaim_authority(new_authority)`

Returns the authority to a new pubkey. Requires passkey — even the escape hatch is second-factor protected.

```rust
pub fn reclaim_authority(ctx: Context<ReclaimAuthority>, new_authority: Pubkey) -> Result<()> {
    trana_guard::cpi::enforce(ctx.accounts.trana_cpi_ctx(), Policy::Require)?;
    // CPI to set_upgrade_authority or set_authority with PDA signing
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
# 1. Deploy a demo program and a demo mint
# 2. Register authority PDAs
trana_authority::register(owner, demo_program, ProgramUpgrade)
trana_authority::register(owner, demo_mint, TokenMint)

# 3. Transfer real authorities to PDAs
solana program set-upgrade-authority <DEMO_PROGRAM> --new-upgrade-authority <UPGRADE_PDA>
spl-token authorize <DEMO_MINT> mint <MINT_PDA>
```

### On Stage

**Show the leaked keypair** (display the pubkey on screen — it's just a test key)

---

**Attempt 1 — Raw authority call**
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

Repeat for mint: same three attempts, same result.

---

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

## Build Plan

### New files

```
programs/trana_authority/
├── Cargo.toml
└── src/
    ├── lib.rs       — program entry, instructions
    ├── state.rs     — AuthorityRecord, AuthorityKind
    ├── error.rs     — TranaAuthorityError
    └── events.rs    — UpgradeExecuted, MintExecuted, AuthorityReclaimed

tests/
└── trana_authority.ts  — register → transfer → attempt1 → attempt2 → attempt3
```

### Cargo.toml dependencies
```toml
anchor-lang   = { version = "0.32.0", features = ["init-if-needed"] }
anchor-spl    = { version = "0.32.0" }
trana         = { path = "../guard", features = ["cpi"] }
```

### Size estimate
~200 lines of Rust. Structurally identical to `demo_vault` — the CPI pattern is proven. The only new surface is the PDA-signed CPIs to BPF Loader and SPL Token.

---

## Positioning

Two programs. Full stack.

```
User actions   →  trana_guard      →  policy-based, conditional, embedded in your program
Admin actions  →  trana_authority  →  always-on, zero-code, wraps any existing authority
```

Trana is not a library. It is the authorization layer for Solana. Everything that can be authorized — can be Trana-guarded.
