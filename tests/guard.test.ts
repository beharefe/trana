import * as anchor from "@coral-xyz/anchor"
import { ComputeBudgetProgram, TransactionInstruction, SystemProgram, Keypair } from "@solana/web3.js"
import { p256 } from "@noble/curves/nist"
import {
  getProgram,
  registryPda,
  ensureConfig,
  setupWallet,
  registerPasskey,
  generateTestPasskey,
  SOL,
} from "./helpers/setup"
import { sendV0 } from "./helpers/transactions"
import { buildProofInstructions } from "./helpers/proof"
import { buildSecp256r1Ix } from "../../packages/sdk/src/secp256r1"

function expectAnchorError(err: unknown, code: number): void {
  const msg = err instanceof Error ? err.message : String(err)
  expect(msg).toMatch(new RegExp(`"Custom":${code}`))
}

async function buildEnforceIx(program: ReturnType<typeof getProgram>, owner: Keypair) {
  return program.methods
    .enforce({ require: {} })
    .accounts({ owner: owner.publicKey })
    .instruction()
}

async function enforceFixture() {
  const program = getProgram()
  const payer   = (program.provider as anchor.AnchorProvider).wallet as anchor.Wallet
  const { treasury } = await ensureConfig(program, payer)
  const { owner }    = await setupWallet(program)
  const passkey      = generateTestPasskey()
  await registerPasskey(program, owner, passkey, treasury)
  return { program, owner, passkey, treasury }
}

describe("trana", () => {
  anchor.setProvider(anchor.AnchorProvider.env())

  it("Is initialized!", async () => {
    const program = getProgram()
    console.log("Program id:", program.programId.toString())
  })

  describe("registry", () => {
    it("initialize_registry", async () => {
      const program = getProgram()
      const payer    = (program.provider as anchor.AnchorProvider).wallet as anchor.Wallet
      const { treasury } = await ensureConfig(program, payer)
      const { owner }    = await setupWallet(program)
      const passkey      = generateTestPasskey()

      await registerPasskey(program, owner, passkey, treasury)

      const pda  = registryPda(owner.publicKey, program.programId)
      const data = await program.account.twoFactorRegistry.fetch(pda)

      expect(data.owner.toBase58()).toBe(owner.publicKey.toBase58())
      expect(Buffer.from(data.pubkeyBytes).equals(Buffer.from(passkey.pubkey))).toBe(true)
      expect(data.enabled).toBe(true)
      expect((data.nonce as anchor.BN).toNumber()).toBe(0)
    })

    it("register_passkey", async () => {
      const program = getProgram()
      const payer    = (program.provider as anchor.AnchorProvider).wallet as anchor.Wallet
      const { treasury, registerFee } = await ensureConfig(program, payer)
      const { owner }  = await setupWallet(program)
      const passkey    = generateTestPasskey()

      const treasuryBefore = await program.provider.connection.getBalance(treasury)
      await registerPasskey(program, owner, passkey, treasury)
      const treasuryAfter = await program.provider.connection.getBalance(treasury)

      expect(treasuryAfter - treasuryBefore).toBe(registerFee)
    })

    it("update_passkey", async () => {
      const program = getProgram()
      const payer    = (program.provider as anchor.AnchorProvider).wallet as anchor.Wallet
      const { treasury } = await ensureConfig(program, payer)
      const { owner }    = await setupWallet(program)
      const passkey1     = generateTestPasskey()
      const passkey2     = generateTestPasskey()

      await registerPasskey(program, owner, passkey1, treasury)

      const pda      = registryPda(owner.publicKey, program.programId)
      const before   = await program.account.twoFactorRegistry.fetch(pda)
      const nonceBefore = (before.nonce as anchor.BN).toNumber()

      await registerPasskey(program, owner, passkey2, treasury)

      const after = await program.account.twoFactorRegistry.fetch(pda)
      expect(Buffer.from(after.pubkeyBytes).equals(Buffer.from(passkey2.pubkey))).toBe(true)
      expect((after.nonce as anchor.BN).toNumber()).toBe(nonceBefore)
    })

    it.skip("disable_registry", async () => {})
    it.skip("enable_registry", async () => {})
  })

  describe("enforce", () => {
    it("enforce_with_valid_proof", async () => {
      const { program, owner, passkey } = await enforceFixture()
      const enforceIx = await buildEnforceIx(program, owner)
      const proof     = buildProofInstructions(passkey, enforceIx, program.programId, owner.publicKey, 0n, "trana.require")

      await sendV0(program.provider.connection, [proof.secp256r1Ix, proof.recordProofIx, enforceIx], owner.publicKey, [owner])

      const data = await program.account.twoFactorRegistry.fetch(registryPda(owner.publicKey, program.programId))
      expect((data.nonce as anchor.BN).toNumber()).toBe(1)
    })

    it("enforce_missing_proof", async () => {
      const { program, owner } = await enforceFixture()
      const enforceIx = await buildEnforceIx(program, owner)

      await expect(
        sendV0(program.provider.connection, [enforceIx], owner.publicKey, [owner])
      ).rejects.toThrow(/"Custom":6000/)
    })

    it("enforce_wrong_signer", async () => {
      const { program, owner } = await enforceFixture()
      const wrongPasskey = generateTestPasskey()
      const enforceIx    = await buildEnforceIx(program, owner)
      const proof        = buildProofInstructions(wrongPasskey, enforceIx, program.programId, owner.publicKey, 0n, "trana.require")

      await expect(
        sendV0(program.provider.connection, [proof.secp256r1Ix, proof.recordProofIx, enforceIx], owner.publicKey, [owner])
      ).rejects.toThrow(/"Custom":6003/)
    })

    it("enforce_expired_proof", async () => {
      const { program, owner, passkey } = await enforceFixture()
      const enforceIx = await buildEnforceIx(program, owner)
      const pastExpiry = Math.floor(Date.now() / 1000) - 10
      const proof      = buildProofInstructions(passkey, enforceIx, program.programId, owner.publicKey, 0n, "trana.require", "localhost", undefined, pastExpiry)

      await expect(
        sendV0(program.provider.connection, [proof.secp256r1Ix, proof.recordProofIx, enforceIx], owner.publicKey, [owner])
      ).rejects.toThrow(/"Custom":6001/)
    })

    it("enforce_replayed_nonce", async () => {
      const { program, owner, passkey } = await enforceFixture()
      const enforceIx = await buildEnforceIx(program, owner)
      const proof     = buildProofInstructions(passkey, enforceIx, program.programId, owner.publicKey, 0n, "trana.require")

      await sendV0(program.provider.connection, [proof.secp256r1Ix, proof.recordProofIx, enforceIx], owner.publicKey, [owner])

      // nonce is now 1 on-chain; replaying the proof signed with nonce=0 fails
      const enforceIx2 = await buildEnforceIx(program, owner)
      await expect(
        sendV0(program.provider.connection, [proof.secp256r1Ix, proof.recordProofIx, enforceIx2], owner.publicKey, [owner])
      ).rejects.toThrow(/"Custom":6002/)
    })

    it("enforce_wrong_nonce", async () => {
      const { program, owner, passkey } = await enforceFixture()
      const enforceIx = await buildEnforceIx(program, owner)
      const proof     = buildProofInstructions(passkey, enforceIx, program.programId, owner.publicKey, 999n, "trana.require")

      await expect(
        sendV0(program.provider.connection, [proof.secp256r1Ix, proof.recordProofIx, enforceIx], owner.publicKey, [owner])
      ).rejects.toThrow(/"Custom":6002/)
    })

    it("enforce_wrong_program_id", async () => {
      const { program, owner, passkey } = await enforceFixture()
      const enforceIx    = await buildEnforceIx(program, owner)
      const wrongProgram = SystemProgram.programId
      const proof        = buildProofInstructions(passkey, enforceIx, wrongProgram, owner.publicKey, 0n, "trana.require")

      await expect(
        sendV0(program.provider.connection, [proof.secp256r1Ix, proof.recordProofIx, enforceIx], owner.publicKey, [owner])
      ).rejects.toThrow(/"Custom":6002/)
    })

    it("enforce_wrong_policy_id", async () => {
      const { program, owner, passkey } = await enforceFixture()
      const enforceIx = await buildEnforceIx(program, owner)
      const proof     = buildProofInstructions(passkey, enforceIx, program.programId, owner.publicKey, 0n, "trana.wrong_policy")

      await expect(
        sendV0(program.provider.connection, [proof.secp256r1Ix, proof.recordProofIx, enforceIx], owner.publicKey, [owner])
      ).rejects.toThrow(/"Custom":6007/)
    })

    it("enforce_wrong_instruction_discriminator", async () => {
      const { program, owner, passkey } = await enforceFixture()
      const enforceIx = await buildEnforceIx(program, owner)
      // Sign a proof for a fake instruction with zeroed discriminator
      const fakeIx = new TransactionInstruction({
        programId: enforceIx.programId,
        keys: enforceIx.keys,
        data: Buffer.concat([Buffer.alloc(8), Buffer.from(enforceIx.data.slice(8))]),
      })
      const proof = buildProofInstructions(passkey, fakeIx, program.programId, owner.publicKey, 0n, "trana.require")

      await expect(
        sendV0(program.provider.connection, [proof.secp256r1Ix, proof.recordProofIx, enforceIx], owner.publicKey, [owner])
      ).rejects.toThrow(/"Custom":6002/)
    })

    it("enforce_wrong_accounts_hash", async () => {
      const { program, owner, passkey } = await enforceFixture()
      const enforceIx = await buildEnforceIx(program, owner)
      // Sign for a version with an extra account — accounts hash differs
      const fakeIx = new TransactionInstruction({
        programId: enforceIx.programId,
        keys: [...enforceIx.keys, { pubkey: Keypair.generate().publicKey, isSigner: false, isWritable: false }],
        data: enforceIx.data,
      })
      const proof = buildProofInstructions(passkey, fakeIx, program.programId, owner.publicKey, 0n, "trana.require")

      await expect(
        sendV0(program.provider.connection, [proof.secp256r1Ix, proof.recordProofIx, enforceIx], owner.publicKey, [owner])
      ).rejects.toThrow(/"Custom":6002/)
    })

    it("enforce_wrong_params_hash", async () => {
      const { program, owner, passkey } = await enforceFixture()
      const enforceIx = await buildEnforceIx(program, owner)
      // Sign for an instruction whose params bytes are different from the real one
      const fakeIx = new TransactionInstruction({
        programId: enforceIx.programId,
        keys: enforceIx.keys,
        data: Buffer.concat([Buffer.from(enforceIx.data.slice(0, 8)), Buffer.from([0xff, 0xff, 0xff, 0xff])]),
      })
      const proof = buildProofInstructions(passkey, fakeIx, program.programId, owner.publicKey, 0n, "trana.require")

      await expect(
        sendV0(program.provider.connection, [proof.secp256r1Ix, proof.recordProofIx, enforceIx], owner.publicKey, [owner])
      ).rejects.toThrow(/"Custom":6002/)
    })

    it("enforce_tampered_payload", async () => {
      const { program, owner, passkey } = await enforceFixture()
      const enforceIx = await buildEnforceIx(program, owner)
      const proof     = buildProofInstructions(passkey, enforceIx, program.programId, owner.publicKey, 0n, "trana.require")

      // Flip the expiry field in record_proof to the past (bytes 9–16 after discriminator)
      const tamperedData = Buffer.from(proof.recordProofIx.data)
      new DataView(tamperedData.buffer, tamperedData.byteOffset).setBigInt64(9, 1n, true)
      const tamperedRecordProofIx = new TransactionInstruction({ ...proof.recordProofIx, data: tamperedData })

      await expect(
        sendV0(program.provider.connection, [proof.secp256r1Ix, tamperedRecordProofIx, enforceIx], owner.publicKey, [owner])
      ).rejects.toThrow(/"Custom":6001/)
    })

    it("enforce_tampered_client_data_json", async () => {
      const { program, owner, passkey } = await enforceFixture()
      const enforceIx = await buildEnforceIx(program, owner)
      const proof     = buildProofInstructions(passkey, enforceIx, program.programId, owner.publicKey, 0n, "trana.require")

      // Find clientDataJSON in the record_proof data and flip one byte
      const tamperedData  = Buffer.from(proof.recordProofIx.data)
      const jsonMarker    = Buffer.from('{"type":"webauthn.get"')
      const jsonOffset    = tamperedData.indexOf(jsonMarker)
      expect(jsonOffset).toBeGreaterThan(0)
      tamperedData[jsonOffset + 10] ^= 0x01
      const tamperedRecordProofIx = new TransactionInstruction({ ...proof.recordProofIx, data: tamperedData })

      await expect(
        sendV0(program.provider.connection, [proof.secp256r1Ix, tamperedRecordProofIx, enforceIx], owner.publicKey, [owner])
      ).rejects.toThrow(/"Custom":6002/)
    })

    it("enforce_tampered_authenticator_data", async () => {
      const { program, owner, passkey } = await enforceFixture()
      const enforceIx = await buildEnforceIx(program, owner)
      const proof     = buildProofInstructions(passkey, enforceIx, program.programId, owner.publicKey, 0n, "trana.require")

      // authData is 37 bytes and its length prefix is [37,0,0,0]; flip a byte in its content
      const tamperedData = Buffer.from(proof.recordProofIx.data)
      const authDataLen  = Buffer.from([37, 0, 0, 0])
      const lenOffset    = tamperedData.indexOf(authDataLen)
      expect(lenOffset).toBeGreaterThan(0)
      tamperedData[lenOffset + 4] ^= 0x01  // flip first byte of authData content
      const tamperedRecordProofIx = new TransactionInstruction({ ...proof.recordProofIx, data: tamperedData })

      await expect(
        sendV0(program.provider.connection, [proof.secp256r1Ix, tamperedRecordProofIx, enforceIx], owner.publicKey, [owner])
      ).rejects.toThrow(/"Custom":6002/)
    })
  })

  describe("secp256r1 instruction", () => {
    it("secp256r1_instruction_missing", async () => {
      const { program, owner, passkey } = await enforceFixture()
      const enforceIx = await buildEnforceIx(program, owner)
      const proof     = buildProofInstructions(passkey, enforceIx, program.programId, owner.publicKey, 0n, "trana.require")

      // No secp256r1Ix — enforce lands at index 1, current_idx < 2 fires
      await expect(
        sendV0(program.provider.connection, [proof.recordProofIx, enforceIx], owner.publicKey, [owner])
      ).rejects.toThrow(/"Custom":6000/)
    })

    it("secp256r1_instruction_wrong_index", async () => {
      const { program, owner, passkey } = await enforceFixture()
      const enforceIx = await buildEnforceIx(program, owner)
      const proof     = buildProofInstructions(passkey, enforceIx, program.programId, owner.publicKey, 0n, "trana.require")

      // secp256r1 at index 0, but enforce is at index 3 → secp_idx=1 → ix[1] is ComputeBudget, not secp256r1
      const paddingIx = ComputeBudgetProgram.setComputeUnitLimit({ units: 400_000 })
      await expect(
        sendV0(program.provider.connection,
          [proof.secp256r1Ix, paddingIx, proof.recordProofIx, enforceIx],
          owner.publicKey, [owner])
      ).rejects.toThrow(/"Custom":6000/)
    })

    it("secp256r1_instruction_invalid_signature", async () => {
      const { program, owner, passkey } = await enforceFixture()
      const enforceIx = await buildEnforceIx(program, owner)
      const proof     = buildProofInstructions(passkey, enforceIx, program.programId, owner.publicKey, 0n, "trana.require")

      // Zero-fill the 64-byte signature field (bytes 49–112) — precompile rejects (r,s)=(0,0)
      const data = Buffer.from(proof.secp256r1Ix.data)
      data.fill(0, 49, 113)
      const invalidSigIx = new TransactionInstruction({ ...proof.secp256r1Ix, data })

      await expect(
        sendV0(program.provider.connection, [invalidSigIx, proof.recordProofIx, enforceIx], owner.publicKey, [owner])
      ).rejects.toThrow()
    })

    it("secp256r1_instruction_invalid_pubkey", async () => {
      const { program, owner, passkey } = await enforceFixture()
      const enforceIx = await buildEnforceIx(program, owner)
      const proof     = buildProofInstructions(passkey, enforceIx, program.programId, owner.publicKey, 0n, "trana.require")

      // Replace 33-byte pubkey (bytes 16–48) with 0x02 prefix + 32×0xff — not a valid P-256 point
      const data = Buffer.from(proof.secp256r1Ix.data)
      data[16] = 0x02
      data.fill(0xff, 17, 49)
      const invalidPubkeyIx = new TransactionInstruction({ ...proof.secp256r1Ix, data })

      await expect(
        sendV0(program.provider.connection, [invalidPubkeyIx, proof.recordProofIx, enforceIx], owner.publicKey, [owner])
      ).rejects.toThrow()
    })

    it("secp256r1_instruction_wrong_message", async () => {
      const { program, owner, passkey } = await enforceFixture()
      const enforceIx = await buildEnforceIx(program, owner)
      const proof     = buildProofInstructions(passkey, enforceIx, program.programId, owner.publicKey, 0n, "trana.require")

      // Sign a different combined message with the same passkey — precompile passes,
      // but trana's SHA256(wrongCombined) ≠ expected e-value from record_proof → 6002
      const wrongCombined = Uint8Array.from(proof.combined)
      wrongCombined[0] ^= 0x01
      const wrongSig         = p256.sign(wrongCombined, passkey.privKey)
      const wrongSecp256r1Ix = buildSecp256r1Ix(passkey.pubkey, wrongSig, wrongCombined)

      await expect(
        sendV0(program.provider.connection, [wrongSecp256r1Ix, proof.recordProofIx, enforceIx], owner.publicKey, [owner])
      ).rejects.toThrow(/"Custom":6002/)
    })
  })

  describe("record_proof", () => {
    it.skip("record_proof_missing", async () => {})
    it.skip("record_proof_wrong_order", async () => {})
    it.skip("record_proof_wrong_payload_hash", async () => {})
    it.skip("record_proof_wrong_registry", async () => {})
    it.skip("record_proof_wrong_owner", async () => {})
  })

  describe("nonce and replay", () => {
    it.skip("nonce_increment_after_success", async () => {})
    it.skip("nonce_not_incremented_on_failure", async () => {})
    it.skip("replay_attack_same_tx", async () => {})
    it.skip("replay_attack_modified_tx", async () => {})
  })

  describe("proof expiry", () => {
    it.skip("proof_expiry_boundary_valid", async () => {})
    it.skip("proof_expiry_boundary_invalid", async () => {})
    it.skip("future_expiry_valid", async () => {})
    it.skip("stale_expiry_invalid", async () => {})
  })

  describe("payload hash", () => {
    it.skip("payload_hash_matches_instruction", async () => {})
    it.skip("payload_hash_mismatch_on_amount_change", async () => {})
    it.skip("payload_hash_mismatch_on_account_change", async () => {})
    it.skip("payload_hash_mismatch_on_program_change", async () => {})
    it.skip("payload_hash_mismatch_on_policy_change", async () => {})
  })

  describe("multi-instruction", () => {
    it.skip("enforce_with_multiple_instructions", async () => {})
    it.skip("enforce_with_nested_cpi", async () => {})
    it.skip("enforce_with_compute_budget_ix", async () => {})
    it.skip("enforce_with_priority_fee_ix", async () => {})
  })

  describe("instruction introspection", () => {
    it.skip("instruction_introspection_reads_correct_ix", async () => {})
    it.skip("instruction_introspection_fails_out_of_bounds", async () => {})
    it.skip("instruction_introspection_fails_wrong_program", async () => {})
  })

  describe("registry PDA", () => {
    it.skip("registry_pda_derivation_valid", async () => {})
    it.skip("registry_pda_derivation_invalid", async () => {})
    it.skip("registry_owner_mismatch", async () => {})
  })

  describe("registry state", () => {
    it.skip("disabled_registry_rejected", async () => {})
    it.skip("uninitialized_registry_rejected", async () => {})
  })

  describe("isolation", () => {
    it.skip("multiple_registries_isolated", async () => {})
    it.skip("multiple_users_isolated", async () => {})
    it.skip("concurrent_nonce_usage", async () => {})
  })

  describe("input validation", () => {
    it.skip("large_client_data_json", async () => {})
    it.skip("malformed_client_data_json", async () => {})
    it.skip("malformed_authenticator_data", async () => {})
    it.skip("oversized_payload_rejected", async () => {})
  })

  describe("events", () => {
    it.skip("proof_verified_event_emitted", async () => {})
    it.skip("proof_failure_event_emitted", async () => {})
    it.skip("replay_attempt_event_emitted", async () => {})
  })

  describe("devnet attacks", () => {
    it.skip("devnet_attack_without_proof", async () => {})
    it.skip("devnet_attack_with_valid_proof", async () => {})
    it.skip("devnet_public_key_compromise_blocked", async () => {})
    it.skip("devnet_modified_tx_after_approval_blocked", async () => {})
  })

  describe("atomicity", () => {
    it.skip("enforce_atomicity_success", async () => {})
    it.skip("enforce_atomicity_failure", async () => {})
    it.skip("partial_execution_impossible", async () => {})
  })

  describe("compute budget", () => {
    it.skip("compute_budget_under_limit", async () => {})
    it.skip("compute_budget_exceeded_gracefully", async () => {})
  })

  describe("domain separation", () => {
    it.skip("proof_domain_separation_valid", async () => {})
    it.skip("proof_domain_separation_invalid", async () => {})
  })

  describe("cross-replay", () => {
    it.skip("cross_program_replay_invalid", async () => {})
    it.skip("cross_policy_replay_invalid", async () => {})
  })

  describe("webauthn signatures", () => {
    it.skip("valid_webauthn_p256_signature", async () => {})
    it.skip("invalid_webauthn_p256_signature", async () => {})
    it.skip("malformed_der_signature", async () => {})
    it.skip("compact_signature_conversion_valid", async () => {})
    it.skip("compact_signature_conversion_invalid", async () => {})
  })

  describe("passkey rotation", () => {
    it.skip("passkey_rotation_success", async () => {})
    it.skip("old_passkey_invalid_after_rotation", async () => {})
    it.skip("new_passkey_valid_after_rotation", async () => {})
  })

  describe("registry recovery", () => {
    it.skip("registry_recovery_success", async () => {})
    it.skip("registry_recovery_invalid_proof", async () => {})
    it.skip("registry_recovery_wrong_owner", async () => {})
  })

  describe("attacks", () => {
    it.skip("attack_raw_transaction_without_sdk", async () => {})
    it.skip("attack_direct_rpc_submission", async () => {})
    it.skip("attack_manual_instruction_forgery", async () => {})
    it.skip("attack_modified_ix_order", async () => {})
    it.skip("attack_fake_record_proof_ix", async () => {})
  })

  describe("edge cases", () => {
    it.skip("enforce_with_zero_nonce", async () => {})
    it.skip("enforce_with_max_nonce", async () => {})
    it.skip("enforce_with_empty_policy", async () => {})
    it.skip("enforce_with_long_policy", async () => {})
    it.skip("enforce_with_unicode_policy", async () => {})
  })
})
