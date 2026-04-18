use anchor_lang::prelude::*;
use anchor_lang::solana_program::sysvar::instructions::{
    load_current_index_checked, load_instruction_at_checked, ID as INSTRUCTIONS_ID,
};
use sha2::{Digest, Sha256};

const SECP256R1_PROGRAM_ID: &str = "Secp256r1SigVerify1111111111111111111111111";

/// Domain string embedded in every intent hash.
const INTENT_DOMAIN: &str = "trana:v1";

declare_id!("BmevGCa642U4Zs1462wN1QQ3N921dFUijW52ULtDpqhb");

// ─────────────────────────────────────────────────────────────────────────────
//  Trana Guard — Onchain Authorization Primitive
//
//  The single guarantee:
//    "This instruction cannot execute unless the registered passkey
//     signed an intent hash that exactly describes this transaction."
//
//  Trust anchors (zero trusted backend):
//    1. secp256r1 precompile (SIMD-0075) — native P-256 sig verify
//    2. TwoFactorRegistry PDA — stores the user's P-256 pubkey onchain
//    3. Intent hash — cryptographically binds proof to program/accounts/params
//    4. Nonce — consumed on each proof, prevents replay
//
//  Transaction shape required by the SDK:
//    ix[N-2]: secp256r1 precompile      — native P-256 sig verify
//    ix[N-1]: guard::record_proof       — carries WebAuthn binding data
//    ix[N]:   your protected instruction — calls guard::cpi::enforce()
//
//  Integration (3 lines):
//    1. Add accounts: guard_program, trana_registry (mut), trana_instructions
//    2. Call: guard::cpi::enforce(cpi_ctx)?
//    3. SDK prepends secp256r1 + record_proof automatically
//
// ─────────────────────────────────────────────────────────────────────────────

// ── ProofData ─────────────────────────────────────────────────────────────────
//
// Borsh payload stored in the `record_proof` instruction data.
// Deserialized by verify_via_sysvar from the Instructions sysvar.

#[derive(AnchorDeserialize, AnchorSerialize, Clone)]
pub struct ProofData {
    pub version:            u8,
    pub expiry:             i64,
    pub cluster:            String,
    pub policy:             String,
    pub authenticator_data: Vec<u8>,
    pub client_data_json:   Vec<u8>,
}

#[program]
pub mod guard {
    use super::*;

    // ── Passkey registration ──────────────────────────────────────────────────

    /// Register a P-256 passkey in the caller's onchain registry PDA.
    ///
    /// Idempotent — re-registering updates the key.
    /// The PDA (seeds: ["2fa", owner]) is the onchain source of truth.
    /// No server required.
    pub fn register_two_fa(
        ctx: Context<RegisterTwoFa>,
        key_kind: KeyKind,
        pubkey_bytes: Vec<u8>,
        credential_id: Vec<u8>,
    ) -> Result<()> {
        require!(
            pubkey_bytes.len() <= TwoFactorRegistry::MAX_PUBKEY_LEN,
            GuardError::InvalidProof
        );
        require!(
            credential_id.len() <= TwoFactorRegistry::MAX_CRED_ID_LEN,
            GuardError::InvalidProof
        );

        let r           = &mut ctx.accounts.registry;
        r.owner         = ctx.accounts.owner.key();
        r.key_kind      = key_kind;
        r.pubkey_bytes  = pubkey_bytes;
        r.credential_id = credential_id;
        r.enabled       = true;
        // Preserve nonce — re-registration must not reset replay protection
        // r.nonce stays as-is (already zero on first init_if_needed)
        Ok(())
    }

    // ── Data carrier ─────────────────────────────────────────────────────────

    /// Pure data-carrier instruction. Carries WebAuthn proof data for
    /// verify_via_sysvar to read from the Instructions sysvar.
    ///
    /// This instruction itself does nothing except validate version == 1.
    /// It must be placed at ix[N-1] immediately before the protected instruction.
    pub fn record_proof(
        _ctx: Context<RecordProof>,
        version: u8,
        _expiry: i64,
        _cluster: String,
        _policy: String,
        _authenticator_data: Vec<u8>,
        _client_data_json: Vec<u8>,
    ) -> Result<()> {
        require!(version == 1, GuardError::InvalidProof);
        Ok(())
    }

    // ── Enforcement primitive ─────────────────────────────────────────────────

    /// The core integration point. External programs call this via CPI.
    ///
    /// Reads proof data from the Instructions sysvar (ix[N-1] = record_proof,
    /// ix[N-2] = secp256r1 precompile), verifies the P-256 signature, and
    /// increments the registry nonce to prevent replay.
    ///
    /// On success: emits an event with the policy name (visible in logs).
    /// On failure: returns a specific error code.
    ///
    /// Integration:
    ///   guard::cpi::enforce(cpi_ctx)?;  ← entire integration
    pub fn enforce(ctx: Context<Enforce>) -> Result<()> {
        let owner_key = ctx.accounts.owner.key();
        verify_via_sysvar(
            &ctx.accounts.instructions,
            &mut ctx.accounts.registry,
            &owner_key,
            ctx.program_id,
        )
    }
}

// ── Core: sysvar-based WebAuthn proof verification ────────────────────────────
//
// Called by enforce() — no WebAuthn data passes through instruction params.
//
// Steps:
//   1. Read ProofData from record_proof at ix[N-1]
//   2. Read protected instruction at ix[N] → derive target, accounts_hash, params_hash
//   3. Expiry check
//   4. Compute intent hash (canonical binary encoding)
//   5. Challenge binding: base64url(clientDataJSON.challenge) == intentHash
//   6. WebAuthn e-value: SHA-256(authData ‖ SHA-256(clientDataJSON))
//   7. secp256r1 at ix[N-2]: verify pubkey matches registry, msg == e-value
//   8. Consume nonce (increment — prevents replay)
//   9. Emit ProofVerified event (policy visible in transaction logs)

fn verify_via_sysvar(
    ix_sysvar:        &AccountInfo,
    registry:         &mut TwoFactorRegistry,
    owner:            &Pubkey,
    guard_program_id: &Pubkey,
) -> Result<()> {
    // ── 0. Index bounds ───────────────────────────────────────────────────────
    let current_idx = load_current_index_checked(ix_sysvar)
        .map_err(|_| error!(GuardError::InvalidProof))?;

    require!(current_idx >= 2, GuardError::MissingProof);

    // ── 1. Load ProofData from record_proof at ix[N-1] ────────────────────────
    let proof = load_proof_from_preceding_ix(ix_sysvar, current_idx)?;

    // ── 2. Load protected instruction at ix[N] ────────────────────────────────
    //
    // When called via CPI, load_current_index_checked returns the top-level
    // instruction's index — exactly the protected instruction we need to bind to.
    let protected_ix = load_instruction_at_checked(current_idx as usize, ix_sysvar)
        .map_err(|_| error!(GuardError::InvalidProof))?;

    let target_program_id = protected_ix.program_id;

    require!(protected_ix.data.len() >= 8, GuardError::InvalidProof);
    let mut discriminator = [0u8; 8];
    discriminator.copy_from_slice(&protected_ix.data[..8]);

    let mut acc_bytes: Vec<u8> = Vec::with_capacity(protected_ix.accounts.len() * 32);
    for meta in &protected_ix.accounts {
        acc_bytes.extend_from_slice(meta.pubkey.as_ref());
    }
    let accounts_hash = sha256_bytes(&acc_bytes);
    let params_hash   = sha256_bytes(&protected_ix.data[8..]);

    // ── 3. Expiry ──────────────────────────────────────────────────────────────
    let clock = Clock::get()?;
    require!(clock.unix_timestamp < proof.expiry, GuardError::ProofExpired);

    // ── 4. Intent hash ────────────────────────────────────────────────────────
    let intent_hash = compute_intent_hash(
        INTENT_DOMAIN,
        &proof.cluster,
        owner,
        guard_program_id,
        &target_program_id,
        &proof.policy,
        &discriminator,
        &accounts_hash,
        &params_hash,
        registry.nonce,
        proof.expiry,
    );

    // ── 5. Challenge binding ──────────────────────────────────────────────────
    let challenge_b64 = extract_challenge(&proof.client_data_json)
        .ok_or_else(|| error!(GuardError::InvalidProof))?;
    let challenge_bytes = base64url_decode(challenge_b64)
        .ok_or_else(|| error!(GuardError::InvalidProof))?;
    require!(
        challenge_bytes.as_slice() == intent_hash.as_ref(),
        GuardError::PayloadMismatch
    );

    // ── 6. WebAuthn e-value ───────────────────────────────────────────────────
    let client_data_hash = sha256_bytes(&proof.client_data_json);
    let mut combined = Vec::with_capacity(proof.authenticator_data.len() + 32);
    combined.extend_from_slice(&proof.authenticator_data);
    combined.extend_from_slice(&client_data_hash);
    let expected_e_value = sha256_bytes(&combined);

    // ── 7. secp256r1 precompile at ix[N-2] ───────────────────────────────────
    let secp_idx = (current_idx - 2) as usize;
    let secp_ix  = load_instruction_at_checked(secp_idx, ix_sysvar)
        .map_err(|_| { msg!("TRANA_MISSING_PROOF"); error!(GuardError::MissingProof) })?;

    let secp_id: Pubkey = SECP256R1_PROGRAM_ID.parse().unwrap();
    if secp_ix.program_id != secp_id {
        msg!("TRANA_MISSING_PROOF");
        return Err(error!(GuardError::MissingProof));
    }

    let data = &secp_ix.data;
    require!(data.len() >= 16 && data[0] == 1, GuardError::InvalidProof);

    let pk_offset  = u16::from_le_bytes([data[6],  data[7]])  as usize;
    let msg_offset = u16::from_le_bytes([data[10], data[11]]) as usize;
    let msg_size   = u16::from_le_bytes([data[12], data[13]]) as usize;

    require!(data.len() >= pk_offset  + 33,      GuardError::InvalidProof);
    require!(data.len() >= msg_offset + msg_size, GuardError::InvalidProof);
    require!(msg_size == 32,                      GuardError::InvalidProof);

    let proof_pubkey  = &data[pk_offset..pk_offset + 33];
    let proof_message = &data[msg_offset..msg_offset + 32];

    require!(proof_pubkey  == registry.pubkey_bytes.as_slice(), GuardError::WrongSigner);
    require!(proof_message == expected_e_value.as_ref(),        GuardError::PayloadMismatch);

    // ── 8. Consume nonce ──────────────────────────────────────────────────────
    let old_nonce = registry.nonce;
    registry.nonce = registry.nonce
        .checked_add(1)
        .ok_or(GuardError::NonceOverflow)?;

    // ── 9. Policy log — visible in transaction logs for zero-trust auditing ───
    msg!(
        "TRANA enforce | policy={} | target={} | nonce={}",
        proof.policy,
        target_program_id,
        old_nonce,
    );

    emit!(ProofVerified {
        owner:      *owner,
        policy:     proof.policy.clone(),
        target:     target_program_id,
        nonce:      old_nonce,
        expiry:     proof.expiry,
    });

    Ok(())
}

/// Deserialise the `record_proof` instruction at ix[current_idx - 1].
fn load_proof_from_preceding_ix(
    ix_sysvar:   &AccountInfo,
    current_idx: u16,
) -> Result<ProofData> {
    let idx = (current_idx as usize) - 1;
    let proof_ix = load_instruction_at_checked(idx, ix_sysvar)
        .map_err(|_| error!(GuardError::InvalidProof))?;

    let disc = &sha256_bytes(b"global:record_proof")[..8];
    require!(proof_ix.data.len() >= 8,      GuardError::InvalidProof);
    require!(&proof_ix.data[..8] == disc,   GuardError::InvalidProof);

    ProofData::try_from_slice(&proof_ix.data[8..])
        .map_err(|_| error!(GuardError::InvalidProof))
}

// ── Intent hash ───────────────────────────────────────────────────────────────
//
// Canonical binary encoding — must match TypeScript's hashIntent() exactly.
// Length prefixes are u16 LE. All integers little-endian.
//
//   version (u8 = 1)
//   domain  (u16-LE + UTF-8)
//   cluster (u16-LE + UTF-8)
//   wallet (32), guardProgramId (32), targetProgramId (32)
//   policy  (u16-LE + UTF-8)
//   discriminator (8), accountsHash (32), paramsHash (32)
//   nonce (u64 LE, 8), expiry (i64 LE, 8)

fn compute_intent_hash(
    domain:            &str,
    cluster:           &str,
    wallet:            &Pubkey,
    guard_program_id:  &Pubkey,
    target_program_id: &Pubkey,
    policy_id:         &str,
    discriminator:     &[u8; 8],
    accounts_hash:     &[u8; 32],
    params_hash:       &[u8; 32],
    nonce:             u64,
    expiry:            i64,
) -> [u8; 32] {
    let domain_b  = domain.as_bytes();
    let cluster_b = cluster.as_bytes();
    let policy_b  = policy_id.as_bytes();

    let mut buf = Vec::with_capacity(
        1 + 2 + domain_b.len() + 2 + cluster_b.len()
        + 32 + 32 + 32
        + 2 + policy_b.len() + 8 + 32 + 32 + 8 + 8,
    );

    buf.push(1u8);
    buf.extend_from_slice(&(domain_b.len()  as u16).to_le_bytes()); buf.extend_from_slice(domain_b);
    buf.extend_from_slice(&(cluster_b.len() as u16).to_le_bytes()); buf.extend_from_slice(cluster_b);
    buf.extend_from_slice(wallet.as_ref());
    buf.extend_from_slice(guard_program_id.as_ref());
    buf.extend_from_slice(target_program_id.as_ref());
    buf.extend_from_slice(&(policy_b.len()  as u16).to_le_bytes()); buf.extend_from_slice(policy_b);
    buf.extend_from_slice(discriminator);
    buf.extend_from_slice(accounts_hash);
    buf.extend_from_slice(params_hash);
    buf.extend_from_slice(&nonce.to_le_bytes());
    buf.extend_from_slice(&expiry.to_le_bytes());

    sha256_bytes(&buf)
}

// ── WebAuthn helpers ──────────────────────────────────────────────────────────

fn extract_challenge(client_data_json: &[u8]) -> Option<&[u8]> {
    const KEY: &[u8] = b"\"challenge\":\"";
    let start = client_data_json.windows(KEY.len()).position(|w| w == KEY)? + KEY.len();
    let end   = client_data_json[start..].iter().position(|&b| b == b'"')? + start;
    Some(&client_data_json[start..end])
}

fn base64url_decode(input: &[u8]) -> Option<Vec<u8>> {
    if input.is_empty() { return Some(vec![]); }
    let mut out = Vec::with_capacity((input.len() * 3 + 3) / 4);
    let mut acc: u32 = 0;
    let mut acc_len: u32 = 0;
    for &c in input {
        let val: u32 = match c {
            b'A'..=b'Z' => (c - b'A') as u32,
            b'a'..=b'z' => (c - b'a') as u32 + 26,
            b'0'..=b'9' => (c - b'0') as u32 + 52,
            b'-' | b'+' => 62,
            b'_' | b'/' => 63,
            b'='         => continue,
            _            => return None,
        };
        acc = (acc << 6) | val;
        acc_len += 6;
        if acc_len >= 8 {
            acc_len -= 8;
            out.push((acc >> acc_len) as u8);
            acc &= (1 << acc_len) - 1;
        }
    }
    Some(out)
}

fn sha256_bytes(data: &[u8]) -> [u8; 32] {
    let mut h = Sha256::new();
    h.update(data);
    h.finalize().into()
}

// ── Accounts ──────────────────────────────────────────────────────────────────

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

/// No on-chain accounts — record_proof is a pure data carrier.
/// Instructions sysvar included to satisfy Anchor's 'info lifetime.
#[derive(Accounts)]
pub struct RecordProof<'info> {
    /// CHECK: Solana Instructions sysvar — read-only context
    #[account(address = INSTRUCTIONS_ID)]
    pub instructions: UncheckedAccount<'info>,
}

/// Accounts for the enforce() CPI primitive.
/// External programs supply these when calling guard::cpi::enforce().
#[derive(Accounts)]
pub struct Enforce<'info> {
    /// Registry PDA — nonce is incremented on every successful verification.
    #[account(
        mut,
        seeds = [b"2fa", owner.key().as_ref()],
        bump,
        constraint = registry.enabled @ GuardError::RegistryDisabled,
    )]
    pub registry: Account<'info, TwoFactorRegistry>,

    /// The wallet whose registered passkey must authorize this action.
    pub owner: Signer<'info>,

    /// CHECK: Solana Instructions sysvar — used to read proof + protected ix.
    #[account(address = INSTRUCTIONS_ID)]
    pub instructions: UncheckedAccount<'info>,
}

// ── State ─────────────────────────────────────────────────────────────────────

#[derive(AnchorSerialize, AnchorDeserialize, Clone, PartialEq)]
pub enum KeyKind {
    /// P-256 / secp256r1 — WebAuthn passkeys (Touch ID, Face ID, YubiKey).
    Secp256r1Passkey,
    /// Ed25519 — hardware signing devices or dedicated keypairs.
    Ed25519,
}

/// Per-user onchain 2FA registry.
///
/// Seeds: `[b"2fa", owner]`
///
/// `nonce` is incremented on every successful passkey proof verification —
/// old proofs cannot be replayed even if the signed intent was valid.
#[account]
pub struct TwoFactorRegistry {
    pub owner:         Pubkey,    // 32
    pub key_kind:      KeyKind,   //  1
    pub pubkey_bytes:  Vec<u8>,   //  4 + up to 33  (P-256 compressed)
    pub credential_id: Vec<u8>,   //  4 + up to 128 (WebAuthn credential ID)
    pub enabled:       bool,      //  1
    pub nonce:         u64,       //  8  — replay prevention counter
}

impl TwoFactorRegistry {
    pub const MAX_PUBKEY_LEN:  usize = 33;
    pub const MAX_CRED_ID_LEN: usize = 128;
    /// discriminator(8) + owner(32) + key_kind(1) + pubkey(4+33) + cred_id(4+128) + enabled(1) + nonce(8)
    pub const SPACE: usize = 8 + 32 + 1 + (4 + 33) + (4 + 128) + 1 + 8; // = 219
}

// ── Events ────────────────────────────────────────────────────────────────────

/// Emitted on every successful proof verification.
/// Policy + target program are visible in on-chain transaction logs.
/// This is the zero-trust audit trail.
#[event]
pub struct ProofVerified {
    /// The wallet that authorized the action.
    pub owner:  Pubkey,
    /// Application-defined policy that triggered enforcement (e.g. "transfer.large").
    pub policy: String,
    /// The program whose instruction was protected.
    pub target: Pubkey,
    /// The nonce that was consumed (now invalid — cannot be replayed).
    pub nonce:  u64,
    /// Unix timestamp when this proof expires.
    pub expiry: i64,
}

// ── Errors ────────────────────────────────────────────────────────────────────

#[error_code]
pub enum GuardError {
    #[msg("Missing secp256r1 or record_proof instruction before the protected instruction")]
    MissingProof,

    #[msg("Proof has expired")]
    ProofExpired,

    #[msg("Intent hash does not match — transaction parameters were tampered")]
    PayloadMismatch,

    #[msg("Proof was signed by a key not in the registry")]
    WrongSigner,

    #[msg("Registry is disabled — register a passkey first")]
    RegistryDisabled,

    #[msg("Invalid proof data")]
    InvalidProof,

    #[msg("Nonce overflow")]
    NonceOverflow,
}
