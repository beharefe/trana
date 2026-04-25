use anchor_lang::prelude::*;
use anchor_lang::solana_program::sysvar::instructions::{
    load_current_index_checked, load_instruction_at_checked,
};
use sha2::{Digest, Sha256};
use crate::error::GuardError;
use crate::events::ProofVerified;
use crate::state::{ProofData, TwoFactorRegistry};

// ── Fee context ───────────────────────────────────────────────────────────────

/// Accounts needed to collect the enforcement fee.
/// Passed from enforce() into run_verification so the fee transfer is
/// atomic with the proof — if verification fails, the fee reverts too.
pub struct FeeAccounts<'a, 'info> {
    pub fee_lamports:  u64,
    pub payer:         &'a AccountInfo<'info>,
    pub treasury:      &'a AccountInfo<'info>,
    pub system_program: &'a AccountInfo<'info>,
}

const SECP256R1_PROGRAM_ID: &str = "Secp256r1SigVerify1111111111111111111111111";
const INTENT_DOMAIN:        &str = "trana:v1";

/// Build a pubkey-scoped policy string, e.g. "trana.recipient_novelty:3xK…abc".
/// Embedding the pubkey in the policy string binds the proof to that specific address —
/// a valid proof for one recipient cannot be replayed for a different recipient.
pub fn scoped_policy(prefix: &str, pubkey: &Pubkey) -> String {
    format!("{}:{}", prefix, pubkey)
}

// ── Public helpers ────────────────────────────────────────────────────────────

/// Return the (program_id, discriminator) of the protected instruction.
/// Used by guard-tracked policies to derive their PDA seeds from the calling context.
pub fn get_protected_ix_metadata(ix_sysvar: &AccountInfo) -> Result<(Pubkey, [u8; 8])> {
    let current_idx = load_current_index_checked(ix_sysvar)
        .map_err(|_| error!(GuardError::InvalidProof))?;
    let protected_ix = load_instruction_at_checked(current_idx as usize, ix_sysvar)
        .map_err(|_| error!(GuardError::InvalidProof))?;
    require!(protected_ix.data.len() >= 8, GuardError::InvalidProof);
    let mut discriminator = [0u8; 8];
    discriminator.copy_from_slice(&protected_ix.data[..8]);
    Ok((protected_ix.program_id, discriminator))
}

/// Read the protected instruction at the current index and extract a u64
/// from its parameter data at `byte_offset` bytes after the 8-byte discriminator.
/// Used by standard policy instructions to read amounts trustlessly from the
/// protected instruction itself — the caller cannot fake the value.
pub fn read_u64_from_protected_ix(
    ix_sysvar:   &AccountInfo,
    byte_offset: u8,
) -> Result<u64> {
    let current_idx = load_current_index_checked(ix_sysvar)
        .map_err(|_| error!(GuardError::InvalidProof))?;
    let ix = load_instruction_at_checked(current_idx as usize, ix_sysvar)
        .map_err(|_| error!(GuardError::InvalidProof))?;
    let offset = 8 + byte_offset as usize; // skip Anchor discriminator
    require!(ix.data.len() >= offset + 8, GuardError::InvalidProof);
    Ok(u64::from_le_bytes(ix.data[offset..offset + 8].try_into().unwrap()))
}

// ── Core verification ─────────────────────────────────────────────────────────
//
// Two entry points:
//
//   verify_from_proof(...)   — used by enforce().
//                              Reads policy string from proof data.
//                              Application defines the policy string.
//
//   verify_with_policy(...)  — used by enforce_threshold / enforce_velocity etc.
//                              Policy string is hardcoded by the standard instruction.
//                              Verifies proof.policy matches — rejects mismatches.
//                              This is what makes standard policies trustless.

/// Called by `enforce()`. Reads the policy string from the proof.
/// Use this for application-defined policies.
pub fn verify_from_proof<'info>(
    ix_sysvar:        &AccountInfo<'info>,
    registry:         &mut TwoFactorRegistry,
    owner:            &Pubkey,
    guard_program_id: &Pubkey,
    fee:              &FeeAccounts<'_, 'info>,
) -> Result<()> {
    let current_idx = load_current_index_checked(ix_sysvar)
        .map_err(|_| error!(GuardError::InvalidProof))?;
    if current_idx < 2 {
        msg!("TRANA_MISSING_PROOF");
        return Err(error!(GuardError::MissingProof));
    }
    let proof = load_proof_from_preceding_ix(ix_sysvar, current_idx)?;
    let policy = proof.policy.clone();
    run_verification(ix_sysvar, registry, owner, guard_program_id, current_idx, proof, &policy, fee)
}

pub fn verify_with_policy<'info>(
    ix_sysvar:        &AccountInfo<'info>,
    registry:         &mut TwoFactorRegistry,
    owner:            &Pubkey,
    guard_program_id: &Pubkey,
    expected_policy:  &str,
    fee:              &FeeAccounts<'_, 'info>,
) -> Result<()> {
    let current_idx = load_current_index_checked(ix_sysvar)
        .map_err(|_| error!(GuardError::InvalidProof))?;
    if current_idx < 2 {
        msg!("TRANA_MISSING_PROOF");
        return Err(error!(GuardError::MissingProof));
    }
    let proof = load_proof_from_preceding_ix(ix_sysvar, current_idx)?;
    require!(proof.policy == expected_policy, GuardError::PolicyMismatch);
    let policy = proof.policy.clone();
    run_verification(ix_sysvar, registry, owner, guard_program_id, current_idx, proof, &policy, fee)
}

// ── Shared verification pipeline ─────────────────────────────────────────────
//
// Steps:
//   1. Load protected instruction at ix[N] → target, accounts_hash, params_hash
//   2. Expiry check
//   3. Compute intent hash (canonical binary encoding)
//   4. Challenge binding: base64url(clientDataJSON.challenge) == intentHash
//   5. WebAuthn e-value: SHA-256(authData ‖ SHA-256(clientDataJSON))
//   6. secp256r1 at ix[N-2]: verify pubkey matches registry, msg == e-value
//   7. Consume nonce (increment — prevents replay)
//   8. Emit ProofVerified event

fn run_verification<'info>(
    ix_sysvar:        &AccountInfo<'info>,
    registry:         &mut TwoFactorRegistry,
    owner:            &Pubkey,
    guard_program_id: &Pubkey,
    current_idx:      u16,
    proof:            ProofData,
    policy:           &str,
    fee:              &FeeAccounts<'_, 'info>,
) -> Result<()> {
    // ── 1. Protected instruction ──────────────────────────────────────────────
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

    // ── 2. Expiry ─────────────────────────────────────────────────────────────
    let clock = Clock::get()?;
    require!(clock.unix_timestamp < proof.expiry, GuardError::ProofExpired);

    // ── 3. Intent hash ────────────────────────────────────────────────────────
    let intent_hash = compute_intent_hash(
        INTENT_DOMAIN,
        &proof.cluster,
        owner,
        guard_program_id,
        &target_program_id,
        policy,
        &discriminator,
        &accounts_hash,
        &params_hash,
        registry.nonce,
        proof.expiry,
    );

    // ── 4. Challenge binding ──────────────────────────────────────────────────
    let challenge_b64   = extract_challenge(&proof.client_data_json)
        .ok_or_else(|| error!(GuardError::InvalidProof))?;
    let challenge_bytes = base64url_decode(challenge_b64)
        .ok_or_else(|| error!(GuardError::InvalidProof))?;
    require!(
        challenge_bytes.as_slice() == intent_hash.as_ref(),
        GuardError::PayloadMismatch
    );

    // ── 5. WebAuthn e-value ───────────────────────────────────────────────────
    //
    // authenticatorData ‖ SHA-256(clientDataJSON) → SHA-256 → ECDSA e-value
    let client_data_hash = sha256_bytes(&proof.client_data_json);
    let mut combined = Vec::with_capacity(proof.authenticator_data.len() + 32);
    combined.extend_from_slice(&proof.authenticator_data);
    combined.extend_from_slice(&client_data_hash);
    let expected_e_value = sha256_bytes(&combined);

    // ── 6. secp256r1 precompile at ix[N-2] ───────────────────────────────────
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
    require!(msg_size > 0,                        GuardError::InvalidProof);

    let proof_pubkey       = &data[pk_offset..pk_offset + 33];
    let proof_message      = &data[msg_offset..msg_offset + msg_size];
    let proof_message_hash = sha256_bytes(proof_message);

    require!(proof_pubkey       == registry.pubkey_bytes.as_slice(), GuardError::WrongSigner);
    require!(proof_message_hash == expected_e_value,                 GuardError::PayloadMismatch);

    // ── 7. Consume nonce ──────────────────────────────────────────────────────
    let old_nonce  = registry.nonce;
    registry.nonce = registry.nonce
        .checked_add(1)
        .ok_or(GuardError::NonceOverflow)?;

    // ── 8. Collect enforcement fee ────────────────────────────────────────────
    // Transferred atomically with the proof — reverts if anything above failed.
    // Fee is 0 only during the bootstrap window before init_config is called.
    if fee.fee_lamports > 0 {
        anchor_lang::system_program::transfer(
            CpiContext::new(
                fee.system_program.clone(),
                anchor_lang::system_program::Transfer {
                    from: fee.payer.clone(),
                    to:   fee.treasury.clone(),
                },
            ),
            fee.fee_lamports,
        )?;
    }

    // ── 9. Emit audit event ───────────────────────────────────────────────────
    msg!(
        "TRANA enforce | policy={} | target={} | nonce={}",
        policy,
        target_program_id,
        old_nonce,
    );

    emit!(ProofVerified {
        owner:  *owner,
        policy: policy.to_string(),
        target: target_program_id,
        nonce:  old_nonce,
        expiry: proof.expiry,
    });

    Ok(())
}

// ── Helpers ───────────────────────────────────────────────────────────────────

fn load_proof_from_preceding_ix(
    ix_sysvar:   &AccountInfo,
    current_idx: u16,
) -> Result<ProofData> {
    let idx      = (current_idx as usize) - 1;
    let proof_ix = load_instruction_at_checked(idx, ix_sysvar)
        .map_err(|_| error!(GuardError::InvalidProof))?;

    let disc = &sha256_bytes(b"global:record_proof")[..8];
    require!(proof_ix.data.len() >= 8,    GuardError::InvalidProof);
    require!(&proof_ix.data[..8] == disc, GuardError::InvalidProof);

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

fn extract_challenge(client_data_json: &[u8]) -> Option<&[u8]> {
    const KEY: &[u8] = b"\"challenge\":\"";
    let start = client_data_json.windows(KEY.len()).position(|w| w == KEY)? + KEY.len();
    let end   = client_data_json[start..].iter().position(|&b| b == b'"')? + start;
    Some(&client_data_json[start..end])
}

fn base64url_decode(input: &[u8]) -> Option<Vec<u8>> {
    if input.is_empty() { return Some(vec![]); }
    let mut out = Vec::with_capacity((input.len() * 3 + 3) / 4);
    let mut acc: u32     = 0;
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

pub fn sha256_bytes(data: &[u8]) -> [u8; 32] {
    let mut h = Sha256::new();
    h.update(data);
    h.finalize().into()
}
