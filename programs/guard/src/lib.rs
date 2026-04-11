use anchor_lang::prelude::*;
use anchor_lang::solana_program::sysvar::instructions::{
    load_current_index_checked, load_instruction_at_checked, ID as INSTRUCTIONS_ID,
};
use sha2::{Digest, Sha256};

const ED25519_PROGRAM_ID:   &str = "Ed25519SigVerify111111111111111111111111111";
const SECP256R1_PROGRAM_ID: &str = "Secp256r1SigVerify1111111111111111111111111";

/// Domain string embedded in every intent hash — ties proofs to this protocol.
const INTENT_DOMAIN: &str = "trana:v1";

// ── ProofData ─────────────────────────────────────────────────────────────────
//
// Borsh-serialized payload stored in the `record_proof` instruction.
// Deserialized by `verify_via_sysvar` from the Instructions sysvar.
// Field order must exactly match `record_proof` instruction parameters.

#[derive(AnchorDeserialize, AnchorSerialize, Clone)]
pub struct ProofData {
    pub version:            u8,
    pub expiry:             i64,
    pub cluster:            String,
    pub policy:             String,
    pub authenticator_data: Vec<u8>,
    pub client_data_json:   Vec<u8>,
}

declare_id!("572t8Ctxx1nrHgxJZ1EHSNZTLcMH4oxV1R6g2pRAqba6");

// ─────────────────────────────────────────────────────────────────────────────
//  Transaction Authorization Guard — Onchain Authorization Primitive
//
//  Core guarantee:
//    "This instruction cannot execute unless a valid second-factor
//     authorization proof is present in the same transaction."
//
//  Trust model (no trusted backend):
//    - P-256 public key stored in the onchain registry PDA
//    - secp256r1 precompile (SIMD-0075) verifies the signature natively
//    - Intent hash binds the proof to exact program / accounts / params
//    - Nonce + expiry prevent replay
//
//  Proof anatomy:
//    passkey signs:  SHA-256(authenticatorData ‖ SHA-256(clientDataJSON))
//    clientDataJSON: {"type":"webauthn.get","challenge":"<base64url(intentHash)>",...}
//    intentHash:     SHA-256(canonical binary encoding of all intent fields)
//
//  enforce() is the primary CPI primitive:
//    External programs call guard::cpi::enforce() to require that the owner's
//    registered passkey approved a specific action intent.
// ─────────────────────────────────────────────────────────────────────────────

#[program]
pub mod guard {
    use super::*;

    // ── Configuration ─────────────────────────────────────────────────────────

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

    pub fn init_vault(ctx: Context<InitVault>, opt_in: bool) -> Result<()> {
        let vault = &mut ctx.accounts.vault;
        vault.owner      = ctx.accounts.owner.key();
        vault.next_nonce = 0;
        vault.opt_in     = opt_in;
        vault.bump       = ctx.bumps.vault;
        Ok(())
    }

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

    /// Vault withdrawal using the legacy Ed25519 bridge key.
    /// Kept for backward compatibility — prefer registry_vault_withdraw.
    pub fn vault_withdraw(
        ctx: Context<VaultWithdraw>,
        amount: u64,
        nonce: u64,
        payload_hash: [u8; 32],
        expiry: i64,
    ) -> Result<()> {
        let config = &ctx.accounts.config;
        let vault  = &mut ctx.accounts.vault;

        require!(amount > 0, GuardError::ZeroAmount);

        let requires_2fa =
            config.enabled && (amount >= config.threshold || vault.opt_in);

        if requires_2fa {
            verify_ed25519_proof(
                &ctx.accounts.instructions,
                &config.server_key,
                &payload_hash,
                expiry,
            )?;

            require!(nonce == vault.next_nonce, GuardError::InvalidNonce);

            let expected = compute_vault_payload_hash(
                &ctx.program_id.to_string(),
                &vault.key().to_string(),
                amount,
                nonce,
                expiry,
            );
            require!(expected == payload_hash, GuardError::PayloadMismatch);
        }

        vault.next_nonce = vault.next_nonce
            .checked_add(1)
            .ok_or(GuardError::NonceOverflow)?;

        let vault_info = ctx.accounts.vault.to_account_info();
        let to_info    = ctx.accounts.to.to_account_info();

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

    // ── 2FA Registry ──────────────────────────────────────────────────────────

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
        let reg           = &mut ctx.accounts.registry;
        reg.owner         = ctx.accounts.owner.key();
        reg.key_kind      = key_kind;
        reg.pubkey_bytes  = pubkey_bytes;
        reg.credential_id = credential_id;
        reg.enabled       = true;
        reg.nonce         = 0;
        Ok(())
    }

    /// Record a Trana WebAuthn proof in the transaction.
    ///
    /// This is a data-carrier instruction — it stores the WebAuthn proof
    /// payload in the transaction so the following instruction can read it
    /// from the Instructions sysvar without needing it as explicit params.
    ///
    /// The SDK inserts this automatically. Protocol programs never reference it.
    ///
    /// Required transaction shape:
    ///   ix[N-2]: secp256r1 precompile (SIMD-0075 native signature verify)
    ///   ix[N-1]: guard::record_proof  ← this instruction
    ///   ix[N]:   protected instruction (registry_vault_withdraw or enforce() caller)
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

    /// Withdraw SOL from a vault using the owner's onchain passkey registry.
    ///
    /// Requires the SDK-inserted proof instructions immediately before:
    ///   ix[N-2]: secp256r1 precompile
    ///   ix[N-1]: guard::record_proof (carries authenticatorData + clientDataJSON)
    ///   ix[N]:   this instruction
    ///
    /// On success: registry.nonce is incremented (replay prevention).
    pub fn registry_vault_withdraw(
        ctx: Context<RegistryVaultWithdraw>,
        amount: u64,
    ) -> Result<()> {
        require!(amount > 0, GuardError::ZeroAmount);

        verify_via_sysvar(
            &ctx.accounts.instructions,
            &mut ctx.accounts.registry,
            &ctx.accounts.owner.key(),
            ctx.program_id,
        )?;

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

        ctx.accounts.vault.next_nonce = ctx.accounts.vault.next_nonce
            .checked_add(1)
            .ok_or(GuardError::NonceOverflow)?;

        Ok(())
    }

    /// General-purpose passkey enforcement CPI primitive.
    ///
    /// Call this from your program to require the owner's registered passkey
    /// approved the current instruction. No Trana-specific params needed.
    ///
    /// The guard reads proof data from the adjacent Instructions sysvar entries:
    ///   ix[N-2]: secp256r1 precompile
    ///   ix[N-1]: guard::record_proof (carries WebAuthn data)
    ///   ix[N]:   your instruction (this CPI's caller — accounts + data hashed into intent)
    ///
    /// Integration (3 accounts + 1 CPI call):
    ///   Accounts: trana_registry (mut), trana_guard_program, trana_instructions (sysvar)
    ///   CPI:      guard::cpi::enforce(cpi_ctx)
    ///
    /// On success: registry.nonce is incremented (cannot be replayed).
    pub fn enforce(ctx: Context<Enforce>) -> Result<()> {
        let owner_key = ctx.accounts.owner.key();
        verify_via_sysvar(
            &ctx.accounts.instructions,
            &mut ctx.accounts.registry,
            &owner_key,
            ctx.program_id,
        )
    }

    // ── Protected transfer (legacy Ed25519 bridge path) ───────────────────────

    pub fn protected_transfer(
        ctx: Context<ProtectedTransfer>,
        amount: u64,
        nonce: [u8; 32],
        payload_hash: [u8; 32],
        expiry: i64,
        user_opt_in: bool,
    ) -> Result<()> {
        let config = &ctx.accounts.config;

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

// ── Core: sysvar-based WebAuthn proof verification ────────────────────────────
//
// Heart of trustless passkey enforcement. Called by registry_vault_withdraw
// and enforce() — no WebAuthn data passes through either instruction's params.
//
// Transaction shape required by the SDK:
//   ix[N-2]: secp256r1 precompile  — native P-256 signature verify
//   ix[N-1]: guard::record_proof   — carries ProofData (expiry, cluster, policy,
//                                    authenticatorData, clientDataJSON)
//   ix[N]:   protected instruction — accounts + data hashed into the intent
//
// Verification steps:
//   1. Read ProofData from ix[N-1] (preceding record_proof instruction)
//   2. Read protected instruction ix[N] → derive discriminator, accounts_hash, params_hash
//   3. Expiry check
//   4. Compute intentHash (canonical encoding)
//   5. Challenge binding: base64url(clientDataJSON.challenge) == intentHash
//   6. Compute expected e-value = SHA-256(authData ‖ SHA-256(clientDataJSON))
//   7. Read secp256r1 ix at ix[N-2], verify pubkey matches registry, msg == e-value
//   8. Increment registry.nonce (consume — prevents replay)

fn verify_via_sysvar(
    ix_sysvar:        &AccountInfo,
    registry:         &mut TwoFactorRegistry,
    owner:            &Pubkey,
    guard_program_id: &Pubkey,
) -> Result<()> {
    // ── 0. Current instruction index ──────────────────────────────────────────
    let current_idx = load_current_index_checked(ix_sysvar)
        .map_err(|_| error!(GuardError::InvalidProof))?;

    require!(current_idx >= 2, GuardError::MissingProof);

    // ── 1. Load ProofData from record_proof at ix[N-1] ────────────────────────
    let proof = load_proof_from_preceding_ix(ix_sysvar, current_idx)?;

    // ── 2. Load protected instruction at ix[N] ────────────────────────────────
    //      Derive target_program_id, discriminator, accounts_hash, params_hash.
    //      When called via CPI, load_current_index_checked returns the top-level
    //      caller's index — exactly the protected instruction we need to bind to.
    let protected_ix = load_instruction_at_checked(current_idx as usize, ix_sysvar)
        .map_err(|_| error!(GuardError::InvalidProof))?;

    let target_program_id = protected_ix.program_id;

    require!(protected_ix.data.len() >= 8, GuardError::InvalidProof);
    let mut discriminator = [0u8; 8];
    discriminator.copy_from_slice(&protected_ix.data[..8]);

    // accounts_hash = SHA-256(concat of all account pubkeys in the protected ix)
    let mut acc_bytes: Vec<u8> = Vec::with_capacity(protected_ix.accounts.len() * 32);
    for meta in &protected_ix.accounts {
        acc_bytes.extend_from_slice(meta.pubkey.as_ref());
    }
    let accounts_hash = sha256_bytes(&acc_bytes);

    // params_hash = SHA-256(instruction data after the 8-byte discriminator)
    let params_hash = sha256_bytes(&protected_ix.data[8..]);

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
    let secp_ix = load_instruction_at_checked(secp_idx, ix_sysvar)
        .map_err(|_| {
            msg!("TRANA_MISSING_PROOF");
            error!(GuardError::MissingProof)
        })?;

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

    require!(
        proof_pubkey == registry.pubkey_bytes.as_slice(),
        GuardError::WrongSigner
    );
    require!(
        proof_message == expected_e_value.as_ref(),
        GuardError::PayloadMismatch
    );

    // ── 8. Consume nonce ──────────────────────────────────────────────────────
    registry.nonce = registry.nonce
        .checked_add(1)
        .ok_or(GuardError::NonceOverflow)?;

    Ok(())
}

/// Deserialise the `record_proof` instruction at ix[current_idx - 1].
/// Verifies the Anchor discriminator before Borsh-decoding the payload.
fn load_proof_from_preceding_ix(
    ix_sysvar:   &AccountInfo,
    current_idx: u16,
) -> Result<ProofData> {
    let idx = (current_idx as usize) - 1; // bounds already checked by caller
    let proof_ix = load_instruction_at_checked(idx, ix_sysvar)
        .map_err(|_| error!(GuardError::InvalidProof))?;

    // Anchor discriminator = SHA-256("global:record_proof")[0..8]
    let disc = &sha256_bytes(b"global:record_proof")[..8];
    require!(proof_ix.data.len() >= 8, GuardError::InvalidProof);
    require!(&proof_ix.data[..8] == disc, GuardError::InvalidProof);

    ProofData::try_from_slice(&proof_ix.data[8..])
        .map_err(|_| error!(GuardError::InvalidProof))
}

// ── Intent hash ───────────────────────────────────────────────────────────────
//
// Canonical binary encoding — must match TypeScript's hashIntent() exactly.
// All length prefixes are u16 LE (2 bytes). All integers are little-endian.
//
//   version (u8 = 1)
//   domain  (u16-LE len + UTF-8 bytes)
//   cluster (u16-LE len + UTF-8 bytes)
//   wallet               (32 bytes)
//   guard_program_id     (32 bytes)
//   target_program_id    (32 bytes)
//   policy_id  (u16-LE len + UTF-8 bytes)
//   discriminator        (8 bytes)
//   accounts_hash        (32 bytes)
//   params_hash          (32 bytes)
//   nonce  (u64 LE,  8 bytes)
//   expiry (i64 LE,  8 bytes)

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

    let cap = 1
        + 2 + domain_b.len()
        + 2 + cluster_b.len()
        + 32 + 32 + 32
        + 2 + policy_b.len()
        + 8 + 32 + 32
        + 8 + 8;

    let mut buf = Vec::with_capacity(cap);

    buf.push(1u8); // version

    // u16-LE length-prefixed strings (matches TypeScript lenBuf = Buffer.allocUnsafe(2).writeUInt16LE)
    buf.extend_from_slice(&(domain_b.len() as u16).to_le_bytes());
    buf.extend_from_slice(domain_b);

    buf.extend_from_slice(&(cluster_b.len() as u16).to_le_bytes());
    buf.extend_from_slice(cluster_b);

    buf.extend_from_slice(wallet.as_ref());
    buf.extend_from_slice(guard_program_id.as_ref());
    buf.extend_from_slice(target_program_id.as_ref());

    buf.extend_from_slice(&(policy_b.len() as u16).to_le_bytes());
    buf.extend_from_slice(policy_b);

    buf.extend_from_slice(discriminator);
    buf.extend_from_slice(accounts_hash);
    buf.extend_from_slice(params_hash);
    buf.extend_from_slice(&nonce.to_le_bytes());
    buf.extend_from_slice(&expiry.to_le_bytes());

    sha256_bytes(&buf)
}

// ── WebAuthn clientDataJSON parsing ──────────────────────────────────────────

/// Extract the base64url challenge value from a WebAuthn clientDataJSON buffer.
/// Finds `"challenge":"<value>"` and returns the raw base64url bytes (no quotes).
fn extract_challenge(client_data_json: &[u8]) -> Option<&[u8]> {
    const KEY: &[u8] = b"\"challenge\":\"";
    let start = client_data_json
        .windows(KEY.len())
        .position(|w| w == KEY)?
        + KEY.len();
    let end = client_data_json[start..]
        .iter()
        .position(|&b| b == b'"')?
        + start;
    Some(&client_data_json[start..end])
}

/// Minimal base64url (RFC 4648 §5, no padding required) decoder.
fn base64url_decode(input: &[u8]) -> Option<Vec<u8>> {
    if input.is_empty() {
        return Some(vec![]);
    }

    let mut out     = Vec::with_capacity((input.len() * 3 + 3) / 4);
    let mut acc:     u32 = 0;
    let mut acc_len: u32 = 0;

    for &c in input {
        let val: u32 = match c {
            b'A'..=b'Z' => (c - b'A') as u32,
            b'a'..=b'z' => (c - b'a') as u32 + 26,
            b'0'..=b'9' => (c - b'0') as u32 + 52,
            b'-' | b'+' => 62,  // base64url uses '-', standard uses '+'
            b'_' | b'/' => 63,  // base64url uses '_', standard uses '/'
            b'='         => continue, // skip padding
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

// ── Legacy Ed25519 bridge proof helpers ───────────────────────────────────────

/// Validate a successful Ed25519 precompile verify instruction at index 0.
/// Used by vault_withdraw and protected_transfer (legacy bridge path).
fn verify_ed25519_proof(
    ix_sysvar:        &AccountInfo,
    expected_signer:  &Pubkey,
    expected_message: &[u8; 32],
    expiry:           i64,
) -> Result<()> {
    let clock = Clock::get()?;
    require!(clock.unix_timestamp < expiry, GuardError::ProofExpired);

    let verify_ix = load_instruction_at_checked(0, ix_sysvar)
        .map_err(|_| error!(GuardError::MissingProof))?;

    let ed25519_id: Pubkey = ED25519_PROGRAM_ID.parse().unwrap();
    require!(verify_ix.program_id == ed25519_id, GuardError::MissingProof);

    let data = &verify_ix.data;
    require!(data.len() >= 16, GuardError::InvalidProof);

    let pk_offset  = u16::from_le_bytes([data[6],  data[7]])  as usize;
    let msg_offset = u16::from_le_bytes([data[10], data[11]]) as usize;
    let msg_size   = u16::from_le_bytes([data[12], data[13]]) as usize;

    require!(data.len() >= pk_offset  + 32,       GuardError::InvalidProof);
    require!(data.len() >= msg_offset + msg_size,  GuardError::InvalidProof);

    let pubkey_bytes  = &data[pk_offset..pk_offset + 32];
    let message_bytes = &data[msg_offset..msg_offset + msg_size];

    require!(pubkey_bytes  == expected_signer.as_ref(),   GuardError::WrongSigner);
    require!(message_bytes == expected_message.as_ref(),  GuardError::PayloadMismatch);

    Ok(())
}

/// Legacy JSON payload hash for vault_withdraw (Ed25519 bridge path).
fn compute_vault_payload_hash(
    program_id:    &str,
    vault_address: &str,
    amount:        u64,
    nonce:         u64,
    expiry:        i64,
) -> [u8; 32] {
    let json = format!(
        r#"{{"programId":"{}","instruction":"vault_withdraw","vault":"{}","amount":{},"nonce":{},"expiry":{}}}"#,
        program_id, vault_address, amount, nonce, expiry
    );
    sha256_str(&json)
}

/// Legacy JSON payload hash for protected_transfer (Ed25519 bridge path).
fn compute_payload_hash(
    program_id: &str,
    amount:     u64,
    nonce:      &[u8; 32],
    expiry:     i64,
) -> [u8; 32] {
    let json = format!(
        r#"{{"programId":"{}","instruction":"transfer","amount":{},"nonce":"{}","expiry":{}}}"#,
        program_id, amount, hex_encode(nonce), expiry
    );
    sha256_str(&json)
}

// ── SHA-256 helpers ───────────────────────────────────────────────────────────

fn sha256_bytes(data: &[u8]) -> [u8; 32] {
    let mut hasher = Sha256::new();
    hasher.update(data);
    hasher.finalize().into()
}

fn sha256_str(s: &str) -> [u8; 32] {
    sha256_bytes(s.as_bytes())
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

    /// CHECK: only the public key is stored.
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

    /// CHECK: destination wallet.
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

/// No accounts required — record_proof is a pure data-carrier instruction.
#[derive(Accounts)]
pub struct RecordProof {}

#[derive(Accounts)]
pub struct RegistryVaultWithdraw<'info> {
    #[account(
        mut,
        seeds = [b"vault", owner.key().as_ref()],
        bump = vault.bump,
        has_one = owner,
    )]
    pub vault: Account<'info, VaultState>,

    /// Registry nonce is consumed here — must be writable.
    #[account(
        mut,
        seeds = [b"2fa", owner.key().as_ref()],
        bump,
        constraint = registry.enabled @ GuardError::RegistryDisabled,
    )]
    pub registry: Account<'info, TwoFactorRegistry>,

    pub owner: Signer<'info>,

    /// CHECK: withdrawal destination.
    #[account(mut)]
    pub to: UncheckedAccount<'info>,

    /// CHECK: Solana Instructions sysvar.
    #[account(address = INSTRUCTIONS_ID)]
    pub instructions: UncheckedAccount<'info>,
}

/// Accounts for the enforce() CPI primitive.
///
/// External programs pass these when calling guard::cpi::enforce().
/// The owner's registry nonce is consumed — prevents replay.
#[derive(Accounts)]
pub struct Enforce<'info> {
    /// Registry PDA for the owner's 2FA key — nonce is incremented on success.
    #[account(
        mut,
        seeds = [b"2fa", owner.key().as_ref()],
        bump,
        constraint = registry.enabled @ GuardError::RegistryDisabled,
    )]
    pub registry: Account<'info, TwoFactorRegistry>,

    pub owner: Signer<'info>,

    /// CHECK: Solana Instructions sysvar.
    #[account(address = INSTRUCTIONS_ID)]
    pub instructions: UncheckedAccount<'info>,
}

// ── State ─────────────────────────────────────────────────────────────────────

#[account]
#[derive(InitSpace)]
pub struct Config {
    pub authority:  Pubkey,
    pub server_key: Pubkey,
    pub threshold:  u64,
    pub enabled:    bool,
    pub bump:       u8,
}

#[account]
#[derive(InitSpace)]
pub struct VaultState {
    pub owner:       Pubkey,
    /// Monotonic counter — incremented on every vault operation.
    pub next_nonce:  u64,
    pub opt_in:      bool,
    pub bump:        u8,
}

#[account]
#[derive(InitSpace)]
pub struct NonceAccount {
    pub used: bool,
    pub bump: u8,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, PartialEq)]
pub enum KeyKind {
    /// P-256 / secp256r1 — curve used by WebAuthn passkeys (Touch ID, Face ID, YubiKey).
    Secp256r1Passkey,
    /// Ed25519 — hardware signing devices or dedicated keypairs.
    Ed25519,
}

/// Per-user onchain 2FA registry.
///
/// Seeds: `[b"2fa", owner]`
///
/// `nonce` is incremented on every successful passkey proof verification.
/// This is the replay-prevention counter for the 2FA proof path — distinct
/// from VaultState.next_nonce (which counts vault operations).
#[account]
pub struct TwoFactorRegistry {
    pub owner:         Pubkey,    // 32
    pub key_kind:      KeyKind,   //  1
    pub pubkey_bytes:  Vec<u8>,   // 4 + up to 33 (secp256r1 compressed)
    pub credential_id: Vec<u8>,   // 4 + up to 128 (WebAuthn credential ID)
    pub enabled:       bool,      //  1
    pub nonce:         u64,       //  8  — 2FA proof replay prevention counter
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
    #[msg("2FA proof required — secp256r1 verify instruction missing or invalid")]
    MissingProof,

    #[msg("Proof instruction has an invalid format")]
    InvalidProof,

    #[msg("Proof was signed by an unregistered key")]
    WrongSigner,

    #[msg("Proof does not match this instruction's intent (program / accounts / params / nonce)")]
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
