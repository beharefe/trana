use anchor_lang::prelude::*;
use anchor_lang::solana_program::{
    ed25519_program,
    sysvar::instructions::{load_instruction_at_checked, ID as INSTRUCTIONS_ID},
};
use sha2::{Digest, Sha256};

declare_id!("Fg6PaFpoGXkYsidMpWTK6W2BeZ7FEfcYkg476zPFsLnS");

// ── Program ───────────────────────────────────────────────────────────────────

#[program]
pub mod guard {
    use super::*;

    /// Initialize the guard config (deployer / authority only).
    ///
    /// `server_key` is the Ed25519 public key of the bridge signer. The program
    /// trusts signatures from this key alone — it never interacts with passkeys
    /// or WebAuthn metadata directly.
    pub fn initialize(
        ctx: Context<Initialize>,
        threshold: u64,
        enabled: bool,
    ) -> Result<()> {
        let config = &mut ctx.accounts.config;
        config.authority = ctx.accounts.authority.key();
        config.server_key = ctx.accounts.server_key.key();
        config.threshold = threshold;
        config.enabled = enabled;
        config.bump = ctx.bumps.config;
        Ok(())
    }

    /// Protected transfer — the built-in standard policy is:
    ///
    ///   Any([
    ///     HighValueTransfer { threshold },
    ///     UserOptIn,
    ///   ])
    ///
    /// When 2FA is required the transaction MUST include an Ed25519 verify
    /// instruction at index 0 whose signer == server_key and whose message ==
    /// sha256(canonical ProofPayload).  Any mismatch causes an immediate error.
    ///
    /// Parameters
    /// ----------
    /// amount       — lamports to transfer
    /// nonce        — 32-byte random value; stored onchain to prevent replay
    /// payload_hash — sha256 of the canonical ProofPayload JSON sent to the bridge
    /// expiry       — unix timestamp after which the proof is invalid
    /// user_opt_in  — client passes the flag it received from /api/status;
    ///                the program uses it only for policy evaluation (not trusted storage)
    pub fn protected_transfer(
        ctx: Context<ProtectedTransfer>,
        amount: u64,
        nonce: [u8; 32],
        payload_hash: [u8; 32],
        expiry: i64,
        user_opt_in: bool,
    ) -> Result<()> {
        let config = &ctx.accounts.config;

        // ── Built-in standard policy evaluation ───────────────────────────────
        // Any([HighValueTransfer { threshold }, UserOptIn])
        let requires_2fa =
            config.enabled && (amount >= config.threshold || user_opt_in);

        if requires_2fa {
            // 1. Verify the Ed25519 bridge-signature proof.
            //    Trust model: passkey proves to bridge → bridge proves to chain.
            verify_ed25519_proof(
                &ctx.accounts.instructions,
                &config.server_key,
                &payload_hash,
                expiry,
            )?;

            // 2. Consume the nonce PDA to prevent replay attacks.
            let nonce_account = &mut ctx.accounts.nonce_account;
            require!(!nonce_account.used, GuardError::NonceAlreadyUsed);
            nonce_account.used = true;
            nonce_account.bump = ctx.bumps.nonce_account;

            // 3. Verify that the payload_hash in the Ed25519 ix matches the
            //    one we would produce from the instruction arguments.  This
            //    prevents a valid proof for a different amount being reused.
            let expected_hash = compute_payload_hash(
                &ctx.program_id.to_string(),
                amount,
                &nonce,
                expiry,
            );
            require!(
                expected_hash == payload_hash,
                GuardError::PayloadMismatch
            );
        }

        // ── Execute the SOL transfer ──────────────────────────────────────────
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
            from: ctx.accounts.from.key(),
            to: ctx.accounts.to.key(),
            amount,
            required_2fa: requires_2fa,
        });

        Ok(())
    }

    /// Update the guard config (authority only).
    pub fn update_config(
        ctx: Context<UpdateConfig>,
        threshold: u64,
        enabled: bool,
    ) -> Result<()> {
        let config = &mut ctx.accounts.config;
        config.threshold = threshold;
        config.enabled = enabled;
        Ok(())
    }
}

// ── Internal helpers ──────────────────────────────────────────────────────────

/// Verify that a Solana Ed25519Program instruction exists at index 0 of the
/// current transaction, signed by `expected_signer`, over `expected_message`.
///
/// Layout of Ed25519Program instruction data (per Solana docs):
///
///   [0]      num_signatures (u8)
///   [1]      padding
///   per-sig header (14 bytes starting at [2]):
///     [2..4]   signature_offset  (u16 LE) → 64 bytes
///     [4..6]   signature_ix_idx  (u16 LE)
///     [6..8]   public_key_offset (u16 LE) → 32 bytes
///     [8..10]  public_key_ix_idx (u16 LE)
///     [10..12] message_offset    (u16 LE) → message bytes
///     [12..14] message_size      (u16 LE)
///     [14..16] message_ix_idx    (u16 LE)
fn verify_ed25519_proof(
    ix_sysvar: &AccountInfo,
    expected_signer: &Pubkey,
    expected_message: &[u8; 32],
    expiry: i64,
) -> Result<()> {
    // Check expiry before anything else.
    let clock = Clock::get()?;
    require!(clock.unix_timestamp < expiry, GuardError::ProofExpired);

    // The Ed25519 verify instruction MUST be at index 0.
    let verify_ix =
        load_instruction_at_checked(0, ix_sysvar).map_err(|_| error!(GuardError::MissingProof))?;

    require!(
        verify_ix.program_id == ed25519_program::id(),
        GuardError::MissingProof
    );

    let data = &verify_ix.data;

    // Need at least 2 header bytes + 14 per-sig offset bytes + payload.
    require!(data.len() >= 16, GuardError::InvalidProof);

    // We only validate the first (and expected only) signature entry.
    let pk_offset = u16::from_le_bytes([data[6], data[7]]) as usize;
    let msg_offset = u16::from_le_bytes([data[10], data[11]]) as usize;
    let msg_size = u16::from_le_bytes([data[12], data[13]]) as usize;

    require!(
        data.len() >= pk_offset + 32,
        GuardError::InvalidProof
    );
    require!(
        data.len() >= msg_offset + msg_size,
        GuardError::InvalidProof
    );

    let pubkey_bytes = &data[pk_offset..pk_offset + 32];
    let message_bytes = &data[msg_offset..msg_offset + msg_size];

    // Signer must be the trusted bridge server key stored in Config.
    require!(
        pubkey_bytes == expected_signer.as_ref(),
        GuardError::WrongSigner
    );

    // Message must match the expected payload hash.
    require!(
        message_bytes == expected_message.as_ref(),
        GuardError::PayloadMismatch
    );

    Ok(())
}

/// Reproduce the sha256 hash of the canonical ProofPayload.
///
/// Must be byte-for-byte identical to what the SDK produces:
///   sha256(JSON.stringify({ programId, instruction:"transfer", amount, nonce, expiry }))
/// with keys in that exact order.
fn compute_payload_hash(
    program_id: &str,
    amount: u64,
    nonce: &[u8; 32],
    expiry: i64,
) -> [u8; 32] {
    let nonce_hex = hex_encode(nonce);
    let payload = format!(
        r#"{{"programId":"{}","instruction":"transfer","amount":{},"nonce":"{}","expiry":{}}}"#,
        program_id, amount, nonce_hex, expiry
    );
    let mut hasher = Sha256::new();
    hasher.update(payload.as_bytes());
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

    /// The Ed25519 public key of the bridge signer.
    /// CHECK: we only store its public key — no data is read from this account.
    pub server_key: UncheckedAccount<'info>,

    #[account(mut)]
    pub authority: Signer<'info>,

    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
#[instruction(amount: u64, nonce: [u8; 32])]
pub struct ProtectedTransfer<'info> {
    #[account(
        seeds = [b"config"],
        bump = config.bump
    )]
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

    /// CHECK: destination wallet — any valid account.
    #[account(mut)]
    pub to: UncheckedAccount<'info>,

    /// CHECK: Solana instructions sysvar.
    #[account(address = INSTRUCTIONS_ID)]
    pub instructions: UncheckedAccount<'info>,

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
}

// ── State ─────────────────────────────────────────────────────────────────────

#[account]
#[derive(InitSpace)]
pub struct Config {
    /// Deployer / admin.
    pub authority: Pubkey,   // 32
    /// Ed25519 pubkey of the trusted bridge signer.
    pub server_key: Pubkey,  // 32
    /// Transfer threshold in lamports; amounts >= this require 2FA.
    pub threshold: u64,      // 8
    /// Master kill-switch for the guard.
    pub enabled: bool,       // 1
    pub bump: u8,            // 1
}                            // 74 + 8 discriminator = 82

#[account]
#[derive(InitSpace)]
pub struct NonceAccount {
    /// True once the nonce has been consumed; replay is rejected.
    pub used: bool, // 1
    pub bump: u8,   // 1
}                   // 2 + 8 discriminator = 10

// ── Events ────────────────────────────────────────────────────────────────────

#[event]
pub struct TransferEvent {
    pub from: Pubkey,
    pub to: Pubkey,
    pub amount: u64,
    pub required_2fa: bool,
}

// ── Errors ────────────────────────────────────────────────────────────────────

#[error_code]
pub enum GuardError {
    #[msg("2FA proof is required but no Ed25519 verify instruction was found")]
    MissingProof,

    #[msg("Ed25519 verify instruction has an invalid format")]
    InvalidProof,

    #[msg("Proof was signed by an unknown key — expected the bridge server key")]
    WrongSigner,

    #[msg("Proof message does not match the expected payload hash")]
    PayloadMismatch,

    #[msg("Proof has expired")]
    ProofExpired,

    #[msg("This nonce has already been used — replay rejected")]
    NonceAlreadyUsed,
}
