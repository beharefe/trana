use anchor_lang::prelude::*;
use anchor_lang::solana_program::sysvar::instructions::{
    load_instruction_at_checked, ID as INSTRUCTIONS_ID,
};
use sha2::{Digest, Sha256};

/// The Ed25519 signature-verification precompile program ID.
const ED25519_PROGRAM_ID: &str = "Ed25519SigVerify111111111111111111111111111";

/// The secp256r1 (P-256) signature-verification precompile program ID.
/// Used for native passkey / WebAuthn onchain verification.
const SECP256R1_PROGRAM_ID: &str = "Secp256r1SigVerify1111111111111111111111111";

declare_id!("572t8Ctxx1nrHgxJZ1EHSNZTLcMH4oxV1R6g2pRAqba6");

// ────────────────────────────────────────────────────────────────────────────
//  Transaction Authorization Guard — Onchain Authorization Primitive
//
//  Core guarantee:
//    "This instruction cannot execute unless a valid second-factor
//     authorization proof is present in the same transaction."
//
//  Trust model:
//    Passkey proves approval to the bridge.
//    Bridge proves approval to the chain.
//    The program trusts the bridge's Ed25519 signature, not WebAuthn directly.
//
//  Enforcement:
//    A protected instruction reads the Instructions sysvar, locates the
//    Ed25519 precompile verify instruction at index 0, and validates:
//      - signer  == config.server_key
//      - message == sha256(canonical ProofPayload bound to this tx's params)
//      - clock   < expiry
//    If absent or invalid → tx fails.  Period.
//    Crafting a raw transaction without the proof does not help the attacker.
// ────────────────────────────────────────────────────────────────────────────

#[program]
pub mod guard {
    use super::*;

    // ── Configuration ─────────────────────────────────────────────────────────

    /// Initialise the global guard config.  Called once by the deployer.
    ///
    /// `server_key` — Ed25519 pubkey of the trusted bridge signer.
    /// `threshold`  — lamports above which transfers require a proof.
    /// `enabled`    — master kill-switch.
    pub fn initialize(
        ctx: Context<Initialize>,
        threshold: u64,
        enabled: bool,
    ) -> Result<()> {
        let cfg = &mut ctx.accounts.config;
        cfg.authority  = ctx.accounts.authority.key();
        cfg.server_key = ctx.accounts.server_key.key();
        cfg.threshold  = threshold;
        cfg.enabled    = enabled;
        cfg.bump       = ctx.bumps.config;
        Ok(())
    }

    /// Update threshold / enabled flag.  Authority only.
    pub fn update_config(
        ctx: Context<UpdateConfig>,
        threshold: u64,
        enabled: bool,
    ) -> Result<()> {
        let cfg = &mut ctx.accounts.config;
        cfg.server_key = ctx.accounts.server_key.key();
        cfg.threshold  = threshold;
        cfg.enabled    = enabled;
        Ok(())
    }

    // ── Vault ─────────────────────────────────────────────────────────────────

    /// Create a personal vault PDA for `owner`.
    ///
    /// Once funded, the owner's wallet key alone is insufficient to withdraw.
    /// Every withdrawal is protected by the built-in policy.
    pub fn init_vault(ctx: Context<InitVault>, opt_in: bool) -> Result<()> {
        let vault = &mut ctx.accounts.vault;
        vault.owner      = ctx.accounts.owner.key();
        vault.next_nonce = 0;
        vault.opt_in     = opt_in;
        vault.bump       = ctx.bumps.vault;
        Ok(())
    }

    /// Deposit SOL into the vault.
    ///
    /// No proof required — anyone can add funds.
    /// The vault PDA accumulates lamports.
    pub fn deposit(ctx: Context<Deposit>, amount: u64) -> Result<()> {
        require!(amount > 0, GuardError::ZeroAmount);
        anchor_lang::solana_program::program::invoke(
            &anchor_lang::solana_program::system_instruction::transfer(
                &ctx.accounts.owner.key(),
                &ctx.accounts.vault.key(),
                amount,
            ),
            &[
                ctx.accounts.owner.to_account_info(),
                ctx.accounts.vault.to_account_info(),
            ],
        )?;
        emit!(DepositEvent {
            vault: ctx.accounts.vault.key(),
            owner: ctx.accounts.owner.key(),
            amount,
        });
        Ok(())
    }

    /// Withdraw SOL from the vault.
    ///
    /// Built-in policy (Any([HighValueTransfer, UserOptIn])):
    ///   Requires proof when amount >= config.threshold OR vault.opt_in == true.
    ///
    /// When proof is required the transaction MUST include an Ed25519 verify
    /// instruction at index 0 whose:
    ///   - signer  == config.server_key
    ///   - message == sha256(canonical ProofPayload bound to this call's args)
    ///   - expiry  > Clock::unix_timestamp
    ///
    /// Replay prevention: monotonic nonce stored in VaultState.
    pub fn vault_withdraw(
        ctx: Context<VaultWithdraw>,
        amount: u64,
        nonce: u64,
        payload_hash: [u8; 32],
        expiry: i64,
    ) -> Result<()> {
        let config    = &ctx.accounts.config;
        let vault     = &mut ctx.accounts.vault;

        require!(amount > 0, GuardError::ZeroAmount);

        // ── Policy evaluation ─────────────────────────────────────────────────
        // Any([HighValueTransfer { threshold }, UserOptIn])
        let requires_2fa =
            config.enabled && (amount >= config.threshold || vault.opt_in);

        if requires_2fa {
            // ── 1. Verify the Ed25519 bridge-signature proof ──────────────────
            //       (passkey → bridge → chain)
            verify_ed25519_proof(
                &ctx.accounts.instructions,
                &config.server_key,
                &payload_hash,
                expiry,
            )?;

            // ── 2. Enforce monotonic nonce (replay prevention) ────────────────
            require!(
                nonce == vault.next_nonce,
                GuardError::InvalidNonce
            );

            // ── 3. Verify payload is bound to this exact call ─────────────────
            let expected = compute_vault_payload_hash(
                &ctx.program_id.to_string(),
                &vault.key().to_string(),
                amount,
                nonce,
                expiry,
            );
            require!(expected == payload_hash, GuardError::PayloadMismatch);
        }

        // Increment nonce regardless so each call is tracked.
        vault.next_nonce = vault.next_nonce.checked_add(1)
            .ok_or(GuardError::NonceOverflow)?;

        // ── Execute withdrawal via lamport manipulation ───────────────────────
        let vault_info = ctx.accounts.vault.to_account_info();
        let to_info    = ctx.accounts.to.to_account_info();

        // Ensure vault stays rent-exempt after withdrawal.
        let rent = Rent::get()?;
        let min_balance = rent.minimum_balance(vault_info.data_len());
        require!(
            vault_info.lamports() >= amount + min_balance,
            GuardError::InsufficientFunds
        );

        **vault_info.try_borrow_mut_lamports()? -= amount;
        **to_info.try_borrow_mut_lamports()?   += amount;

        emit!(WithdrawEvent {
            vault:        ctx.accounts.vault.key(),
            owner:        ctx.accounts.owner.key(),
            to:           ctx.accounts.to.key(),
            amount,
            required_2fa: requires_2fa,
        });

        Ok(())
    }

    // ── Onchain 2FA Registry ──────────────────────────────────────────────────
    //
    //  Registers a second-factor public key directly onchain.
    //  Supports secp256r1 (P-256) for passkeys and Ed25519 for hardware keys.
    //  The bridge is demoted to a UX transport helper — it never holds secrets
    //  and cannot forge proofs.  Security anchor = this PDA, not any server.

    /// Register (or update) the caller's 2FA key in their onchain registry PDA.
    ///
    /// `key_kind`      — Secp256r1Passkey | Ed25519
    /// `pubkey_bytes`  — 33-byte compressed P-256 pubkey, or 32-byte Ed25519 pubkey
    /// `credential_id` — optional WebAuthn credential ID (stored for UX lookup)
    pub fn register_two_fa(
        ctx: Context<RegisterTwoFa>,
        key_kind: KeyKind,
        pubkey_bytes: Vec<u8>,
        credential_id: Vec<u8>,
    ) -> Result<()> {
        require!(!pubkey_bytes.is_empty(), GuardError::InvalidPubkeyLen);
        require!(
            pubkey_bytes.len() <= TwoFactorRegistry::MAX_PUBKEY_LEN,
            GuardError::InvalidPubkeyLen
        );
        require!(
            credential_id.len() <= TwoFactorRegistry::MAX_CRED_ID_LEN,
            GuardError::InvalidPubkeyLen
        );
        let reg        = &mut ctx.accounts.registry;
        reg.owner      = ctx.accounts.owner.key();
        reg.key_kind   = key_kind;
        reg.pubkey_bytes  = pubkey_bytes;
        reg.credential_id = credential_id;
        reg.enabled    = true;
        reg.nonce      = 0;
        Ok(())
    }

    /// Withdraw SOL from the vault using the caller's onchain 2FA registry.
    ///
    /// Unlike `vault_withdraw` (which uses a shared bridge server key),
    /// this instruction verifies a proof against the *caller's own* registered
    /// 2FA public key.  No trusted bridge required.
    ///
    /// The proof must be a secp256r1 or Ed25519 precompile instruction at
    /// index 0 of the transaction, signed by the registered key, covering
    /// SHA256(canonical_vault_payload_json).
    ///
    /// Replay prevention: vault's monotonic next_nonce is embedded in the
    /// canonical payload JSON at signing time.
    pub fn registry_vault_withdraw(
        ctx: Context<RegistryVaultWithdraw>,
        amount: u64,
        expiry: i64,
    ) -> Result<()> {
        require!(amount > 0, GuardError::ZeroAmount);

        let nonce     = ctx.accounts.vault.next_nonce;
        let vault_key = ctx.accounts.vault.key();

        let payload_hash = compute_vault_payload_hash(
            &ctx.program_id.to_string(),
            &vault_key.to_string(),
            amount,
            nonce,
            expiry,
        );

        match ctx.accounts.registry.key_kind {
            KeyKind::Secp256r1Passkey => {
                verify_secp256r1_proof(
                    &ctx.accounts.instructions,
                    &ctx.accounts.registry,
                    &payload_hash,
                    expiry,
                )?;
            }
            KeyKind::Ed25519 => {
                let pk: [u8; 32] = ctx.accounts.registry.pubkey_bytes
                    .as_slice()
                    .try_into()
                    .map_err(|_| error!(GuardError::InvalidPubkeyLen))?;
                verify_ed25519_proof(
                    &ctx.accounts.instructions,
                    &Pubkey::from(pk),
                    &payload_hash,
                    expiry,
                )?;
            }
        }

        let vault_info = ctx.accounts.vault.to_account_info();
        let to_info    = ctx.accounts.to.to_account_info();

        let rent        = Rent::get()?;
        let min_balance = rent.minimum_balance(vault_info.data_len());
        require!(
            vault_info.lamports() >= amount + min_balance,
            GuardError::InsufficientFunds
        );

        **vault_info.try_borrow_mut_lamports()? -= amount;
        **to_info.try_borrow_mut_lamports()?   += amount;

        ctx.accounts.vault.next_nonce = nonce
            .checked_add(1)
            .ok_or(GuardError::NonceOverflow)?;
        Ok(())
    }

    // ── Simple protected transfer (no vault, direct SOL) ──────────────────────
    //
    //  Demonstrates the enforcement primitive without vault custody.
    //  Same policy; same proof mechanism.  Useful for threshold-transfer demos.

    pub fn protected_transfer(
        ctx: Context<ProtectedTransfer>,
        amount: u64,
        nonce: [u8; 32],
        payload_hash: [u8; 32],
        expiry: i64,
        user_opt_in: bool,
    ) -> Result<()> {
        let config = &ctx.accounts.config;

        // Any([HighValueTransfer { threshold }, UserOptIn])
        let requires_2fa =
            config.enabled && (amount >= config.threshold || user_opt_in);

        if requires_2fa {
            verify_ed25519_proof(
                &ctx.accounts.instructions,
                &config.server_key,
                &payload_hash,
                expiry,
            )?;

            let nonce_account = &mut ctx.accounts.nonce_account;
            require!(!nonce_account.used, GuardError::NonceAlreadyUsed);
            nonce_account.used = true;
            nonce_account.bump = ctx.bumps.nonce_account;

            let expected = compute_payload_hash(
                &ctx.program_id.to_string(),
                amount,
                &nonce,
                expiry,
            );
            require!(expected == payload_hash, GuardError::PayloadMismatch);
        }

        anchor_lang::solana_program::program::invoke(
            &anchor_lang::solana_program::system_instruction::transfer(
                &ctx.accounts.from.key(),
                &ctx.accounts.to.key(),
                amount,
            ),
            &[
                ctx.accounts.from.to_account_info(),
                ctx.accounts.to.to_account_info(),
            ],
        )?;

        emit!(TransferEvent {
            from:         ctx.accounts.from.key(),
            to:           ctx.accounts.to.key(),
            amount,
            required_2fa: requires_2fa,
        });

        Ok(())
    }
}

// ── Internal helpers ──────────────────────────────────────────────────────────

/// Validate that a successful Ed25519 precompile verify instruction appears at
/// index 0 of the current transaction, signed by `expected_signer`, covering
/// `expected_message`.
///
/// Precompiles are NOT callable via CPI — they must be top-level instructions.
/// The guarded instruction validates the precompile result via the Instructions
/// sysvar (which contains top-level instructions only).
///
/// Ed25519 instruction data layout (Solana spec):
///   [0]      num_signatures (u8)
///   [1]      padding
///   per-sig header starting at [2] (14 bytes each):
///     [2..4]   sig_offset   → 64-byte signature
///     [4..6]   sig_ix_idx
///     [6..8]   pk_offset    → 32-byte pubkey
///     [8..10]  pk_ix_idx
///     [10..12] msg_offset   → message bytes
///     [12..14] msg_size
///     [14..16] msg_ix_idx
fn verify_ed25519_proof(
    ix_sysvar: &AccountInfo,
    expected_signer: &Pubkey,
    expected_message: &[u8; 32],
    expiry: i64,
) -> Result<()> {
    // Expiry check first — cheapest.
    let clock = Clock::get()?;
    require!(clock.unix_timestamp < expiry, GuardError::ProofExpired);

    let verify_ix =
        load_instruction_at_checked(0, ix_sysvar)
            .map_err(|_| error!(GuardError::MissingProof))?;

    let ed25519_id: Pubkey = ED25519_PROGRAM_ID.parse().unwrap();
    require!(
        verify_ix.program_id == ed25519_id,
        GuardError::MissingProof
    );

    let data = &verify_ix.data;
    require!(data.len() >= 16, GuardError::InvalidProof);

    let pk_offset  = u16::from_le_bytes([data[6],  data[7]])  as usize;
    let msg_offset = u16::from_le_bytes([data[10], data[11]]) as usize;
    let msg_size   = u16::from_le_bytes([data[12], data[13]]) as usize;

    require!(data.len() >= pk_offset  + 32,      GuardError::InvalidProof);
    require!(data.len() >= msg_offset + msg_size, GuardError::InvalidProof);

    let pubkey_bytes  = &data[pk_offset..pk_offset + 32];
    let message_bytes = &data[msg_offset..msg_offset + msg_size];

    require!(pubkey_bytes  == expected_signer.as_ref(), GuardError::WrongSigner);
    require!(message_bytes == expected_message.as_ref(), GuardError::PayloadMismatch);

    Ok(())
}

/// Validate a secp256r1 (P-256) precompile instruction at index 0 of the
/// current transaction.
///
/// Secp256r1 instruction data layout (HAS padding byte, same as Ed25519):
///   [0]      num_signatures (u8)
///   [1]      padding (u8)
///   per-sig header starting at [2] (14 bytes):
///     [2..4]   sig_offset   → 64-byte compact (r‖s) signature
///     [4..6]   sig_ix_idx
///     [6..8]   pk_offset    → 33-byte compressed P-256 pubkey
///     [8..10]  pk_ix_idx
///     [10..12] msg_offset   → message bytes
///     [12..14] msg_size
///     [14..16] msg_ix_idx
///
/// The precompile calls verify_prehash — no internal hashing.
/// We pass the payload hash as the message and sign it directly.
fn verify_secp256r1_proof(
    ix_sysvar: &AccountInfo,
    registry: &TwoFactorRegistry,
    expected_payload_hash: &[u8; 32],
    expiry: i64,
) -> Result<()> {
    let clock = Clock::get()?;
    require!(clock.unix_timestamp < expiry, GuardError::ProofExpired);

    let secp_ix = load_instruction_at_checked(0, ix_sysvar)
        .map_err(|_| error!(GuardError::MissingProof))?;

    let secp_id: Pubkey = SECP256R1_PROGRAM_ID.parse().unwrap();
    require!(secp_ix.program_id == secp_id, GuardError::MissingProof);

    let data = &secp_ix.data;
    require!(data.len() >= 16 && data[0] == 1, GuardError::InvalidProof);

    // Parse SignatureOffsets (starts at byte 2 — byte 1 is padding)
    let pk_offset  = u16::from_le_bytes([data[6],  data[7]])  as usize;
    let msg_offset = u16::from_le_bytes([data[10], data[11]]) as usize;
    let msg_size   = u16::from_le_bytes([data[12], data[13]]) as usize;

    require!(data.len() >= pk_offset + 33,        GuardError::InvalidProof);
    require!(data.len() >= msg_offset + msg_size,  GuardError::InvalidProof);

    let proof_pubkey  = &data[pk_offset..pk_offset + 33];
    let proof_message = &data[msg_offset..msg_offset + msg_size];

    // Pubkey must match the caller's registered 2FA key
    require!(
        proof_pubkey == registry.pubkey_bytes.as_slice(),
        GuardError::WrongSigner
    );

    // Message must be exactly the expected 32-byte payload hash
    require!(
        proof_message == expected_payload_hash.as_ref(),
        GuardError::PayloadMismatch
    );

    Ok(())
}

/// Canonical payload hash for `protected_transfer`.
/// Must match SDK's `canonicalJson` key order exactly.
fn compute_payload_hash(
    program_id: &str,
    amount: u64,
    nonce: &[u8; 32],
    expiry: i64,
) -> [u8; 32] {
    let json = format!(
        r#"{{"programId":"{}","instruction":"transfer","amount":{},"nonce":"{}","expiry":{}}}"#,
        program_id,
        amount,
        hex_encode(nonce),
        expiry
    );
    sha256_str(&json)
}

/// Canonical payload hash for `vault_withdraw`.
/// Must match SDK's `canonicalVaultJson` key order exactly.
fn compute_vault_payload_hash(
    program_id: &str,
    vault_address: &str,
    amount: u64,
    nonce: u64,
    expiry: i64,
) -> [u8; 32] {
    let json = format!(
        r#"{{"programId":"{}","instruction":"vault_withdraw","vault":"{}","amount":{},"nonce":{},"expiry":{}}}"#,
        program_id,
        vault_address,
        amount,
        nonce,
        expiry
    );
    sha256_str(&json)
}

fn sha256_str(s: &str) -> [u8; 32] {
    let mut hasher = Sha256::new();
    hasher.update(s.as_bytes());
    hasher.finalize().into()
}

fn hex_encode(bytes: &[u8]) -> String {
    bytes.iter().map(|b| format!("{:02x}", b)).collect()
}

// ── Accounts ──────────────────────────────────────────────────────────────────

#[derive(Accounts)]
pub struct Initialize<'info> {
    #[account(
        init,
        payer = authority,
        space = 8 + Config::INIT_SPACE,
        seeds = [b"config"],
        bump
    )]
    pub config: Account<'info, Config>,

    /// CHECK: only the public key is stored — no data is read from this account.
    pub server_key: UncheckedAccount<'info>,

    #[account(mut)]
    pub authority: Signer<'info>,

    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct UpdateConfig<'info> {
    #[account(
        mut,
        seeds = [b"config"],
        bump = config.bump,
        has_one = authority
    )]
    pub config: Account<'info, Config>,

    pub authority: Signer<'info>,

    /// CHECK: only the public key is stored.
    pub server_key: UncheckedAccount<'info>,
}

#[derive(Accounts)]
pub struct InitVault<'info> {
    #[account(
        init,
        payer = owner,
        space = 8 + VaultState::INIT_SPACE,
        seeds = [b"vault", owner.key().as_ref()],
        bump
    )]
    pub vault: Account<'info, VaultState>,

    #[account(mut)]
    pub owner: Signer<'info>,

    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct Deposit<'info> {
    #[account(
        mut,
        seeds = [b"vault", owner.key().as_ref()],
        bump = vault.bump,
        has_one = owner
    )]
    pub vault: Account<'info, VaultState>,

    #[account(mut)]
    pub owner: Signer<'info>,

    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
#[instruction(amount: u64, nonce: u64)]
pub struct VaultWithdraw<'info> {
    #[account(seeds = [b"config"], bump = config.bump)]
    pub config: Account<'info, Config>,

    #[account(
        mut,
        seeds = [b"vault", owner.key().as_ref()],
        bump = vault.bump,
        has_one = owner
    )]
    pub vault: Account<'info, VaultState>,

    pub owner: Signer<'info>,

    /// CHECK: destination wallet — any valid account.
    #[account(mut)]
    pub to: UncheckedAccount<'info>,

    /// CHECK: Solana instructions sysvar.
    #[account(address = INSTRUCTIONS_ID)]
    pub instructions: UncheckedAccount<'info>,
}

#[derive(Accounts)]
#[instruction(amount: u64, nonce: [u8; 32])]
pub struct ProtectedTransfer<'info> {
    #[account(seeds = [b"config"], bump = config.bump)]
    pub config: Account<'info, Config>,

    #[account(
        init_if_needed,
        payer = from,
        space = 8 + NonceAccount::INIT_SPACE,
        seeds = [b"nonce", nonce.as_ref()],
        bump
    )]
    pub nonce_account: Account<'info, NonceAccount>,

    #[account(mut)]
    pub from: Signer<'info>,

    /// CHECK: destination wallet.
    #[account(mut)]
    pub to: UncheckedAccount<'info>,

    /// CHECK: Solana instructions sysvar.
    #[account(address = INSTRUCTIONS_ID)]
    pub instructions: UncheckedAccount<'info>,

    pub system_program: Program<'info, System>,
}

// ── 2FA Registry accounts ─────────────────────────────────────────────────────

#[derive(Accounts)]
pub struct RegisterTwoFa<'info> {
    #[account(
        init_if_needed,
        payer = owner,
        space = TwoFactorRegistry::SPACE,
        seeds = [b"2fa", owner.key().as_ref()],
        bump,
    )]
    pub registry: Account<'info, TwoFactorRegistry>,

    #[account(mut)]
    pub owner: Signer<'info>,

    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct RegistryVaultWithdraw<'info> {
    #[account(
        mut,
        seeds = [b"vault", owner.key().as_ref()],
        bump = vault.bump,
        has_one = owner,
    )]
    pub vault: Account<'info, VaultState>,

    #[account(
        seeds = [b"2fa", owner.key().as_ref()],
        bump,
        constraint = registry.enabled @ GuardError::RegistryDisabled,
    )]
    pub registry: Account<'info, TwoFactorRegistry>,

    pub owner: Signer<'info>,

    /// CHECK: withdrawal destination
    #[account(mut)]
    pub to: UncheckedAccount<'info>,

    /// CHECK: Solana Instructions sysvar
    #[account(address = INSTRUCTIONS_ID)]
    pub instructions: UncheckedAccount<'info>,
}

// ── State ─────────────────────────────────────────────────────────────────────

#[account]
#[derive(InitSpace)]
pub struct Config {
    pub authority:  Pubkey, // 32
    pub server_key: Pubkey, // 32
    pub threshold:  u64,    // 8
    pub enabled:    bool,   // 1
    pub bump:       u8,     // 1
}

#[account]
#[derive(InitSpace)]
pub struct VaultState {
    /// Wallet that controls this vault.
    pub owner:       Pubkey, // 32
    /// Monotonic nonce — incremented on every withdraw call.
    /// Prevents replay: a proof for nonce N cannot be reused for nonce N+1.
    pub next_nonce:  u64,    // 8
    /// User opted into always requiring 2FA regardless of threshold.
    pub opt_in:      bool,   // 1
    pub bump:        u8,     // 1
}

#[account]
#[derive(InitSpace)]
pub struct NonceAccount {
    pub used: bool, // 1
    pub bump: u8,   // 1
}

/// Which curve / protocol the registered 2FA key uses.
#[derive(AnchorSerialize, AnchorDeserialize, Clone, PartialEq)]
pub enum KeyKind {
    /// P-256 / secp256r1 — the curve used by WebAuthn passkeys and most
    /// hardware authenticators (Touch ID, Face ID, YubiKey P-256 mode).
    Secp256r1Passkey,
    /// Ed25519 — used by hardware signing devices or a dedicated keypair.
    Ed25519,
}

/// Per-user onchain 2FA registry.
///
/// Seeds: `[b"2fa", owner]`
///
/// Stores the user's second-factor public key.  The bridge is only a UX
/// transport — it never holds a secret and cannot forge proofs.
/// The security anchor is this PDA, not any off-chain service.
#[account]
pub struct TwoFactorRegistry {
    pub owner:         Pubkey,    // 32
    pub key_kind:      KeyKind,   // 1
    pub pubkey_bytes:  Vec<u8>,   // 4 + up to 33 (secp256r1 compressed)
    pub credential_id: Vec<u8>,   // 4 + up to 128 (WebAuthn credential ID)
    pub enabled:       bool,      // 1
    pub nonce:         u64,       // 8  (reserved for future registry-level replay)
}

impl TwoFactorRegistry {
    pub const MAX_PUBKEY_LEN:  usize = 33;
    pub const MAX_CRED_ID_LEN: usize = 128;
    /// Discriminator(8) + owner(32) + key_kind(1) + pubkey(4+33) + cred_id(4+128) + enabled(1) + nonce(8)
    pub const SPACE: usize = 8 + 32 + 1 + (4 + 33) + (4 + 128) + 1 + 8; // = 219
}

// ── Events ────────────────────────────────────────────────────────────────────

#[event]
pub struct DepositEvent {
    pub vault:  Pubkey,
    pub owner:  Pubkey,
    pub amount: u64,
}

#[event]
pub struct WithdrawEvent {
    pub vault:        Pubkey,
    pub owner:        Pubkey,
    pub to:           Pubkey,
    pub amount:       u64,
    pub required_2fa: bool,
}

#[event]
pub struct TransferEvent {
    pub from:         Pubkey,
    pub to:           Pubkey,
    pub amount:       u64,
    pub required_2fa: bool,
}

// ── Errors ────────────────────────────────────────────────────────────────────

#[error_code]
pub enum GuardError {
    #[msg("2FA proof required — no Ed25519 verify instruction found at index 0")]
    MissingProof,

    #[msg("Ed25519 verify instruction has an invalid format")]
    InvalidProof,

    #[msg("Proof was not signed by the trusted bridge server key")]
    WrongSigner,

    #[msg("Proof payload does not match this instruction's parameters")]
    PayloadMismatch,

    #[msg("Proof has expired")]
    ProofExpired,

    #[msg("Nonce already used — replay rejected")]
    NonceAlreadyUsed,

    #[msg("Invalid nonce — expected the vault's next_nonce")]
    InvalidNonce,

    #[msg("Nonce overflow")]
    NonceOverflow,

    #[msg("Insufficient vault balance (after maintaining rent-exempt minimum)")]
    InsufficientFunds,

    #[msg("Amount must be greater than zero")]
    ZeroAmount,

    #[msg("2FA registry is disabled for this account")]
    RegistryDisabled,

    #[msg("Public key length is invalid for the specified key kind")]
    InvalidPubkeyLen,
}
