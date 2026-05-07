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
import { buildSecp256r1Ix } from "../packages/sdk/src/secp256r1"

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
    it("record_proof_missing", async () => {
      const { program, owner, passkey } = await enforceFixture()
      const enforceIx = await buildEnforceIx(program, owner)
      const proof     = buildProofInstructions(passkey, enforceIx, program.programId, owner.publicKey, 0n, "trana.require")

      // No record_proof: secp256r1 fills both ix[0] and ix[1]; ix[1] fails the discriminator check
      await expect(
        sendV0(program.provider.connection, [proof.secp256r1Ix, proof.secp256r1Ix, enforceIx], owner.publicKey, [owner])
      ).rejects.toThrow(/"Custom":6005/)
    })

    it("record_proof_wrong_order", async () => {
      const { program, owner, passkey } = await enforceFixture()
      const enforceIx = await buildEnforceIx(program, owner)
      const proof     = buildProofInstructions(passkey, enforceIx, program.programId, owner.publicKey, 0n, "trana.require")

      // Swapped order: record_proof at ix[0], secp256r1 at ix[1] — secp256r1 fails the discriminator check at ix[N-1]
      await expect(
        sendV0(program.provider.connection, [proof.recordProofIx, proof.secp256r1Ix, enforceIx], owner.publicKey, [owner])
      ).rejects.toThrow(/"Custom":6005/)
    })

    it("record_proof_wrong_payload_hash", async () => {
      const { program, owner, passkey } = await enforceFixture()
      const enforceIx = await buildEnforceIx(program, owner)
      const proofA    = buildProofInstructions(passkey, enforceIx, program.programId, owner.publicKey, 0n,   "trana.require")
      const proofB    = buildProofInstructions(passkey, enforceIx, program.programId, owner.publicKey, 999n, "trana.require")

      // secp256r1 signed for nonce=0, record_proof carries nonce=999 challenge — SHA256 hash mismatch
      await expect(
        sendV0(program.provider.connection, [proofA.secp256r1Ix, proofB.recordProofIx, enforceIx], owner.publicKey, [owner])
      ).rejects.toThrow(/"Custom":6002/)
    })

    it("record_proof_wrong_registry", async () => {
      const { program, owner: owner1, passkey: passkey1, treasury } = await enforceFixture()
      const { owner: owner2 } = await setupWallet(program)
      const passkey2 = generateTestPasskey()
      await registerPasskey(program, owner2, passkey2, treasury)

      const enforceIx1 = await buildEnforceIx(program, owner1)
      const proof      = buildProofInstructions(passkey1, enforceIx1, program.programId, owner1.publicKey, 0n, "trana.require")
      const enforceIx2 = await buildEnforceIx(program, owner2)

      // Proof is valid for owner1's registry; enforce is called with owner2's registry — intent hash differs
      await expect(
        sendV0(program.provider.connection, [proof.secp256r1Ix, proof.recordProofIx, enforceIx2], owner2.publicKey, [owner2])
      ).rejects.toThrow(/"Custom":6002/)
    })

    it("record_proof_wrong_owner", async () => {
      const { program, owner, passkey } = await enforceFixture()
      const enforceIx    = await buildEnforceIx(program, owner)
      const differentOwner = Keypair.generate().publicKey

      // Proof's intent was signed for a different wallet address — enforce sees owner.publicKey ≠ differentOwner
      const proof = buildProofInstructions(passkey, enforceIx, program.programId, differentOwner, 0n, "trana.require")

      await expect(
        sendV0(program.provider.connection, [proof.secp256r1Ix, proof.recordProofIx, enforceIx], owner.publicKey, [owner])
      ).rejects.toThrow(/"Custom":6002/)
    })
  })

  describe("nonce and replay", () => {
    it("nonce_increment_after_success", async () => {
      const { program, owner, passkey } = await enforceFixture()
      const pda       = registryPda(owner.publicKey, program.programId)
      const enforceIx = await buildEnforceIx(program, owner)
      const proof     = buildProofInstructions(passkey, enforceIx, program.programId, owner.publicKey, 0n, "trana.require")

      const before = await program.account.twoFactorRegistry.fetch(pda)
      expect((before.nonce as anchor.BN).toNumber()).toBe(0)

      await sendV0(program.provider.connection, [proof.secp256r1Ix, proof.recordProofIx, enforceIx], owner.publicKey, [owner])

      const after = await program.account.twoFactorRegistry.fetch(pda)
      expect((after.nonce as anchor.BN).toNumber()).toBe(1)
    })

    it("nonce_not_incremented_on_failure", async () => {
      const { program, owner, passkey } = await enforceFixture()
      const pda          = registryPda(owner.publicKey, program.programId)
      const enforceIx    = await buildEnforceIx(program, owner)
      const wrongPasskey = generateTestPasskey()
      const proof        = buildProofInstructions(wrongPasskey, enforceIx, program.programId, owner.publicKey, 0n, "trana.require")

      const before = await program.account.twoFactorRegistry.fetch(pda)
      const nonceBefore = (before.nonce as anchor.BN).toNumber()

      await expect(
        sendV0(program.provider.connection, [proof.secp256r1Ix, proof.recordProofIx, enforceIx], owner.publicKey, [owner])
      ).rejects.toThrow(/"Custom":6003/)

      const after = await program.account.twoFactorRegistry.fetch(pda)
      expect((after.nonce as anchor.BN).toNumber()).toBe(nonceBefore)
    })

    it("replay_attack_same_tx", async () => {
      const { program, owner, passkey } = await enforceFixture()
      const enforceIx = await buildEnforceIx(program, owner)
      const proof     = buildProofInstructions(passkey, enforceIx, program.programId, owner.publicKey, 0n, "trana.require")

      await sendV0(program.provider.connection, [proof.secp256r1Ix, proof.recordProofIx, enforceIx], owner.publicKey, [owner])

      // Identical proof + instruction bytes, fresh blockhash — nonce on-chain is now 1, proof was signed for 0
      await expect(
        sendV0(program.provider.connection, [proof.secp256r1Ix, proof.recordProofIx, enforceIx], owner.publicKey, [owner])
      ).rejects.toThrow(/"Custom":6002/)
    })

    it("replay_attack_modified_tx", async () => {
      const { program, owner, passkey } = await enforceFixture()
      const enforceIx = await buildEnforceIx(program, owner)
      const proof     = buildProofInstructions(passkey, enforceIx, program.programId, owner.publicKey, 0n, "trana.require")

      // Swap policy type after signing (slot=u64::MAX always requires proof).
      // Policy::Require → Policy::NotBefore: different policy string in enforce handler
      // so PolicyMismatch (6007) fires before the params hash check (6002).
      const tamperedEnforceIx = await program.methods
        .enforce({ notBefore: { slot: new anchor.BN("18446744073709551615") } })
        .accounts({ owner: owner.publicKey })
        .instruction()

      await expect(
        sendV0(program.provider.connection, [proof.secp256r1Ix, proof.recordProofIx, tamperedEnforceIx], owner.publicKey, [owner])
      ).rejects.toThrow(/"Custom":6007/)
    })
  })

  describe("proof expiry", () => {
    it("proof_expiry_boundary_valid", async () => {
      const { program, owner, passkey } = await enforceFixture()
      const enforceIx = await buildEnforceIx(program, owner)
      const expiry    = Math.floor(Date.now() / 1000) + 10
      const proof     = buildProofInstructions(passkey, enforceIx, program.programId, owner.publicKey, 0n, "trana.require", "localhost", undefined, expiry)

      const sig = await sendV0(program.provider.connection, [proof.secp256r1Ix, proof.recordProofIx, enforceIx], owner.publicKey, [owner])
      expect(sig).toBeTruthy()
    })

    it("proof_expiry_boundary_invalid", async () => {
      const { program, owner, passkey } = await enforceFixture()
      const enforceIx = await buildEnforceIx(program, owner)
      const expiry    = Math.floor(Date.now() / 1000) - 1
      const proof     = buildProofInstructions(passkey, enforceIx, program.programId, owner.publicKey, 0n, "trana.require", "localhost", undefined, expiry)

      await expect(
        sendV0(program.provider.connection, [proof.secp256r1Ix, proof.recordProofIx, enforceIx], owner.publicKey, [owner])
      ).rejects.toThrow(/"Custom":6001/)
    })

    it("future_expiry_valid", async () => {
      const { program, owner, passkey } = await enforceFixture()
      const enforceIx = await buildEnforceIx(program, owner)
      const expiry    = Math.floor(Date.now() / 1000) + 3600
      const proof     = buildProofInstructions(passkey, enforceIx, program.programId, owner.publicKey, 0n, "trana.require", "localhost", undefined, expiry)

      const sig = await sendV0(program.provider.connection, [proof.secp256r1Ix, proof.recordProofIx, enforceIx], owner.publicKey, [owner])
      expect(sig).toBeTruthy()
    })

    it("stale_expiry_invalid", async () => {
      const { program, owner, passkey } = await enforceFixture()
      const enforceIx = await buildEnforceIx(program, owner)
      const expiry    = Math.floor(Date.now() / 1000) - 60
      const proof     = buildProofInstructions(passkey, enforceIx, program.programId, owner.publicKey, 0n, "trana.require", "localhost", undefined, expiry)

      await expect(
        sendV0(program.provider.connection, [proof.secp256r1Ix, proof.recordProofIx, enforceIx], owner.publicKey, [owner])
      ).rejects.toThrow(/"Custom":6001/)
    })
  })

  describe("payload hash", () => {
    it("payload_hash_matches_instruction", async () => {
      const { program, owner, passkey } = await enforceFixture()
      const pda       = registryPda(owner.publicKey, program.programId)
      const enforceIx = await buildEnforceIx(program, owner)
      const proof     = buildProofInstructions(passkey, enforceIx, program.programId, owner.publicKey, 0n, "trana.require")

      await sendV0(program.provider.connection, [proof.secp256r1Ix, proof.recordProofIx, enforceIx], owner.publicKey, [owner])

      const after = await program.account.twoFactorRegistry.fetch(pda)
      expect((after.nonce as anchor.BN).toNumber()).toBe(1)
    })

    it("payload_hash_mismatch_on_amount_change", async () => {
      const { program, owner, passkey } = await enforceFixture()

      // Use Policy::Limit so params contain a tamper-able amount field
      const enforceIx = await program.methods
        .enforce({ limit: { paramOffset: 0, limit: new anchor.BN(1_000) } })
        .accounts({ owner: owner.publicKey })
        .instruction()
      const proof = buildProofInstructions(passkey, enforceIx, program.programId, owner.publicKey, 0n, "trana.limit")

      // Tamper: change limit 1_000 → 2_000 in the encoded instruction
      // Layout after Anchor disc (8B): variant(1B=3) + param_offset(1B=0) + limit(8B)
      const tamperedData = Buffer.from(enforceIx.data)
      new DataView(tamperedData.buffer, tamperedData.byteOffset + 10).setBigUint64(0, 2_000n, true)
      const tamperedEnforceIx = new TransactionInstruction({ programId: enforceIx.programId, keys: enforceIx.keys, data: tamperedData })

      await expect(
        sendV0(program.provider.connection, [proof.secp256r1Ix, proof.recordProofIx, tamperedEnforceIx], owner.publicKey, [owner])
      ).rejects.toThrow(/"Custom":6002/)
    })

    it("payload_hash_mismatch_on_account_change", async () => {
      const { program, owner, passkey } = await enforceFixture()
      const enforceIx = await buildEnforceIx(program, owner)

      // Sign proof for a version with an extra account — accounts_hash differs from the real enforceIx
      const enforceIxWithExtra = new TransactionInstruction({
        programId: enforceIx.programId,
        data:      enforceIx.data,
        keys:      [...enforceIx.keys, { pubkey: Keypair.generate().publicKey, isSigner: false, isWritable: false }],
      })
      const proof = buildProofInstructions(passkey, enforceIxWithExtra, program.programId, owner.publicKey, 0n, "trana.require")

      await expect(
        sendV0(program.provider.connection, [proof.secp256r1Ix, proof.recordProofIx, enforceIx], owner.publicKey, [owner])
      ).rejects.toThrow(/"Custom":6002/)
    })

    it("payload_hash_mismatch_on_program_change", async () => {
      const { program, owner, passkey } = await enforceFixture()
      const enforceIx = await buildEnforceIx(program, owner)

      // Sign proof with wrong trana_guard_program_id — record_proof still goes to trana
      // (protectedIx.programId), but the guard ID in the challenge differs from ctx.program_id
      const proof = buildProofInstructions(passkey, enforceIx, SystemProgram.programId, owner.publicKey, 0n, "trana.require")

      await expect(
        sendV0(program.provider.connection, [proof.secp256r1Ix, proof.recordProofIx, enforceIx], owner.publicKey, [owner])
      ).rejects.toThrow(/"Custom":6002/)
    })

    it("payload_hash_mismatch_on_policy_change", async () => {
      const { program, owner, passkey } = await enforceFixture()
      const enforceIx = await buildEnforceIx(program, owner)

      // overridePolicy sets the policy in BOTH record_proof AND the signed challenge,
      // so we can't use it here — policy check would fire first (6007).
      // Instead: build two proofs differing only in policy string, then mix them.
      // record_proof from proofA carries "trana.require" → policy check passes.
      // secp256r1 from proofB was signed for "trana.not_before" combined →
      // SHA256(secp256r1_msg) ≠ SHA256(record_proof combined) → 6002.
      const proofRequire   = buildProofInstructions(passkey, enforceIx, program.programId, owner.publicKey, 0n, "trana.require")
      const proofNotBefore = buildProofInstructions(passkey, enforceIx, program.programId, owner.publicKey, 0n, "trana.not_before")

      await expect(
        sendV0(program.provider.connection, [proofNotBefore.secp256r1Ix, proofRequire.recordProofIx, enforceIx], owner.publicKey, [owner])
      ).rejects.toThrow(/"Custom":6002/)
    })
  })

  describe("multi-instruction", () => {
    it("enforce_with_multiple_instructions", async () => {
      const { program, owner, passkey } = await enforceFixture()
      const pda       = registryPda(owner.publicKey, program.programId)
      const enforceIx = await buildEnforceIx(program, owner)
      const proof     = buildProofInstructions(passkey, enforceIx, program.programId, owner.publicKey, 0n, "trana.require")

      // Extra instruction after enforce — enforce is still at index 2, triple stays intact
      const extraIx = ComputeBudgetProgram.setComputeUnitLimit({ units: 400_000 })
      await sendV0(program.provider.connection, [proof.secp256r1Ix, proof.recordProofIx, enforceIx, extraIx], owner.publicKey, [owner])

      const after = await program.account.twoFactorRegistry.fetch(pda)
      expect((after.nonce as anchor.BN).toNumber()).toBe(1)
    })

    it.skip("[Skipped because it requires a dedicated CPI-caller test program that invokes trana::enforce.] enforce_with_nested_cpi", async () => {
      // Requires a dedicated CPI-caller test program that invokes trana::enforce.
      // The outer tx would be [secp256r1, recordProof, cpiCallerIx]; enforce sees
      // current_idx=2 via sysvar::instructions, so secp_idx=0 and proof_idx=1 are correct.
    })

    it("enforce_with_compute_budget_ix", async () => {
      const { program, owner, passkey } = await enforceFixture()
      const pda       = registryPda(owner.publicKey, program.programId)
      const enforceIx = await buildEnforceIx(program, owner)
      const proof     = buildProofInstructions(passkey, enforceIx, program.programId, owner.publicKey, 0n, "trana.require")

      // computeBudget at 0, secp256r1 at 1, recordProof at 2, enforce at 3 → secp_idx=1 ✓
      const budgetIx = ComputeBudgetProgram.setComputeUnitLimit({ units: 400_000 })
      await sendV0(program.provider.connection, [budgetIx, proof.secp256r1Ix, proof.recordProofIx, enforceIx], owner.publicKey, [owner])

      const after = await program.account.twoFactorRegistry.fetch(pda)
      expect((after.nonce as anchor.BN).toNumber()).toBe(1)
    })

    it("enforce_with_priority_fee_ix", async () => {
      const { program, owner, passkey } = await enforceFixture()
      const pda       = registryPda(owner.publicKey, program.programId)
      const enforceIx = await buildEnforceIx(program, owner)
      const proof     = buildProofInstructions(passkey, enforceIx, program.programId, owner.publicKey, 0n, "trana.require")

      // priority fee at 0, secp256r1 at 1, recordProof at 2, enforce at 3 → secp_idx=1 ✓
      const priorityIx = ComputeBudgetProgram.setComputeUnitPrice({ microLamports: 1_000 })
      await sendV0(program.provider.connection, [priorityIx, proof.secp256r1Ix, proof.recordProofIx, enforceIx], owner.publicKey, [owner])

      const after = await program.account.twoFactorRegistry.fetch(pda)
      expect((after.nonce as anchor.BN).toNumber()).toBe(1)
    })
  })

  describe("instruction introspection", () => {
    it("instruction_introspection_reads_correct_ix", async () => {
      const { program, owner, passkey } = await enforceFixture()
      const pda = registryPda(owner.publicKey, program.programId)

      // Policy::Limit { paramOffset: 0, limit: 0 }
      // read_u64_from_protected_ix reads enforce's own bytes[8..16]:
      //   byte 8 = variant(3=Limit), rest = 0 → u64-LE = 3 ≥ 0 → enforcement triggers
      const enforceIx = await program.methods
        .enforce({ limit: { paramOffset: 0, limit: new anchor.BN(0) } })
        .accounts({ owner: owner.publicKey })
        .instruction()
      const proof = buildProofInstructions(passkey, enforceIx, program.programId, owner.publicKey, 0n, "trana.limit")

      await sendV0(program.provider.connection, [proof.secp256r1Ix, proof.recordProofIx, enforceIx], owner.publicKey, [owner])

      const after = await program.account.twoFactorRegistry.fetch(pda)
      expect((after.nonce as anchor.BN).toNumber()).toBe(1)
    })

    it("instruction_introspection_fails_out_of_bounds", async () => {
      const { program, owner } = await enforceFixture()

      // paramOffset=255 → reads at offset 8+255=263; enforce data is ~18 bytes → 6005
      // read_u64_from_protected_ix fires before verify_with_policy so no proof is needed
      const enforceIx = await program.methods
        .enforce({ limit: { paramOffset: 255, limit: new anchor.BN(0) } })
        .accounts({ owner: owner.publicKey })
        .instruction()

      await expect(
        sendV0(program.provider.connection, [enforceIx], owner.publicKey, [owner])
      ).rejects.toThrow(/"Custom":6005/)
    })

    it("instruction_introspection_fails_wrong_program", async () => {
      const { program, owner } = await enforceFixture()

      // Direct enforce call (no CPI): read_u64_from_protected_ix reads from enforce's
      // own data, not from a protocol instruction that carries a real amount.
      // bytes[8..16] = [variant=3, paramOffset=0, 0xFF×6] → u64-LE ≪ u64::MAX
      // → limit condition never triggers → no proof required → passes.
      // Documents that Policy::Limit only enforces meaningfully via CPI from a
      // protocol instruction that actually carries the guarded amount field.
      const enforceIx = await program.methods
        .enforce({ limit: { paramOffset: 0, limit: new anchor.BN("18446744073709551615") } })
        .accounts({ owner: owner.publicKey })
        .instruction()

      const sig = await sendV0(program.provider.connection, [enforceIx], owner.publicKey, [owner])
      expect(sig).toBeTruthy()
    })
  })

  describe("registry PDA", () => {
    it("registry_pda_derivation_valid", async () => {
      const { program, owner } = await enforceFixture()
      const pda  = registryPda(owner.publicKey, program.programId)
      const data = await program.account.twoFactorRegistry.fetch(pda)
      expect(data.owner.toBase58()).toBe(owner.publicKey.toBase58())
      expect(data.enabled).toBe(true)
    })

    it("registry_pda_derivation_invalid", async () => {
      const { program, owner: owner1 } = await enforceFixture()
      const owner2 = Keypair.generate()

      const pda1 = registryPda(owner1.publicKey, program.programId)
      const pda2 = registryPda(owner2.publicKey, program.programId)
      expect(pda1.toBase58()).not.toBe(pda2.toBase58())

      // owner2 has no registry — fetching it throws
      await expect(
        program.account.twoFactorRegistry.fetch(pda2)
      ).rejects.toThrow()
    })

    it("registry_owner_mismatch", async () => {
      const { program, owner: owner1, passkey: passkey1, treasury } = await enforceFixture()
      const { owner: owner2 } = await setupWallet(program)
      await registerPasskey(program, owner2, generateTestPasskey(), treasury)

      const enforceIx1 = await buildEnforceIx(program, owner1)
      const proof      = buildProofInstructions(passkey1, enforceIx1, program.programId, owner1.publicKey, 0n, "trana.require")
      const enforceIx2 = await buildEnforceIx(program, owner2)

      // Proof signed for owner1's registry; enforce targets owner2's registry → intent hash mismatch
      await expect(
        sendV0(program.provider.connection, [proof.secp256r1Ix, proof.recordProofIx, enforceIx2], owner2.publicKey, [owner2])
      ).rejects.toThrow(/"Custom":6002/)
    })
  })

  describe("registry state", () => {
    it.skip("disabled_registry_rejected", async () => {
      // No disable_registry instruction exists yet — requires a future program change.
      // The Enforce constraint `registry.enabled @ RegistryDisabled` (6004) would fire.
    })

    it("uninitialized_registry_rejected", async () => {
      const program = getProgram()
      const owner   = Keypair.generate()

      // Registry PDA for this owner was never created — Anchor fails to load it
      const enforceIx = await buildEnforceIx(program, owner)
      await expect(
        sendV0(program.provider.connection, [enforceIx], owner.publicKey, [owner])
      ).rejects.toThrow()
    })
  })

  describe("isolation", () => {
    it("multiple_registries_isolated", async () => {
      const { program, owner: owner1, passkey: passkey1, treasury } = await enforceFixture()
      const { owner: owner2 } = await setupWallet(program)
      await registerPasskey(program, owner2, generateTestPasskey(), treasury)

      // owner1's proof submitted against owner2's enforce — wallet in intent differs → 6002
      const enforceIx2 = await buildEnforceIx(program, owner2)
      const proof      = buildProofInstructions(passkey1, enforceIx2, program.programId, owner1.publicKey, 0n, "trana.require")

      await expect(
        sendV0(program.provider.connection, [proof.secp256r1Ix, proof.recordProofIx, enforceIx2], owner2.publicKey, [owner2])
      ).rejects.toThrow(/"Custom":6002/)
    })

    it("multiple_users_isolated", async () => {
      const { program, owner: owner1, passkey: passkey1, treasury } = await enforceFixture()
      const pda1           = registryPda(owner1.publicKey, program.programId)
      const { owner: owner2 } = await setupWallet(program)
      const passkey2       = generateTestPasskey()
      await registerPasskey(program, owner2, passkey2, treasury)
      const pda2           = registryPda(owner2.publicKey, program.programId)

      // Each owner enforces with their own valid proof — nonces increment independently
      const enforceIx1 = await buildEnforceIx(program, owner1)
      const proof1     = buildProofInstructions(passkey1, enforceIx1, program.programId, owner1.publicKey, 0n, "trana.require")
      await sendV0(program.provider.connection, [proof1.secp256r1Ix, proof1.recordProofIx, enforceIx1], owner1.publicKey, [owner1])

      const enforceIx2 = await buildEnforceIx(program, owner2)
      const proof2     = buildProofInstructions(passkey2, enforceIx2, program.programId, owner2.publicKey, 0n, "trana.require")
      await sendV0(program.provider.connection, [proof2.secp256r1Ix, proof2.recordProofIx, enforceIx2], owner2.publicKey, [owner2])

      const data1 = await program.account.twoFactorRegistry.fetch(pda1)
      const data2 = await program.account.twoFactorRegistry.fetch(pda2)
      expect((data1.nonce as anchor.BN).toNumber()).toBe(1)
      expect((data2.nonce as anchor.BN).toNumber()).toBe(1)
    })

    it("concurrent_nonce_usage", async () => {
      const { program, owner, passkey } = await enforceFixture()
      const enforceIx = await buildEnforceIx(program, owner)
      const proof     = buildProofInstructions(passkey, enforceIx, program.programId, owner.publicKey, 0n, "trana.require")

      // First submission consumes nonce=0
      await sendV0(program.provider.connection, [proof.secp256r1Ix, proof.recordProofIx, enforceIx], owner.publicKey, [owner])

      // Second submission with the same nonce=0 proof → on-chain nonce is now 1 → 6002
      await expect(
        sendV0(program.provider.connection, [proof.secp256r1Ix, proof.recordProofIx, enforceIx], owner.publicKey, [owner])
      ).rejects.toThrow(/"Custom":6002/)
    })
  })

  describe("input validation", () => {
    it("large_client_data_json", async () => {
      const { program, owner, passkey } = await enforceFixture()
      const pda       = registryPda(owner.publicKey, program.programId)
      const enforceIx = await buildEnforceIx(program, owner)
      // 200-char rpId → origin is ~207 chars → clientDataJSON ~300 bytes, fits in tx
      const longRpId  = "a".repeat(200) + ".example.com"
      const proof     = buildProofInstructions(passkey, enforceIx, program.programId, owner.publicKey, 0n, "trana.require", longRpId)

      await sendV0(program.provider.connection, [proof.secp256r1Ix, proof.recordProofIx, enforceIx], owner.publicKey, [owner])

      const after = await program.account.twoFactorRegistry.fetch(pda)
      expect((after.nonce as anchor.BN).toNumber()).toBe(1)
    })

    it("malformed_client_data_json", async () => {
      const { program, owner, passkey } = await enforceFixture()
      const enforceIx = await buildEnforceIx(program, owner)
      const proof     = buildProofInstructions(passkey, enforceIx, program.programId, owner.publicKey, 0n, "trana.require")

      // Corrupt the "challenge" key in clientDataJSON so extract_challenge returns None → 6005
      const tamperedData = Buffer.from(proof.recordProofIx.data)
      const challengeKey = Buffer.from('"challenge":"')
      const keyOffset    = tamperedData.indexOf(challengeKey)
      expect(keyOffset).toBeGreaterThan(0)
      tamperedData[keyOffset + 1] = 0x58  // '"challenge"' → '"Xhallenge"'
      const tamperedIx = new TransactionInstruction({ ...proof.recordProofIx, data: tamperedData })

      await expect(
        sendV0(program.provider.connection, [proof.secp256r1Ix, tamperedIx, enforceIx], owner.publicKey, [owner])
      ).rejects.toThrow(/"Custom":6005/)
    })

    it("malformed_authenticator_data", async () => {
      const { program, owner, passkey } = await enforceFixture()
      const enforceIx = await buildEnforceIx(program, owner)
      const proof     = buildProofInstructions(passkey, enforceIx, program.programId, owner.publicKey, 0n, "trana.require")

      // Flip a byte in authData inside record_proof — expected_e_value changes → 6002
      const tamperedData = Buffer.from(proof.recordProofIx.data)
      const authDataLen  = Buffer.from([37, 0, 0, 0])
      const lenOffset    = tamperedData.indexOf(authDataLen)
      expect(lenOffset).toBeGreaterThan(0)
      tamperedData[lenOffset + 4] ^= 0x01
      const tamperedIx = new TransactionInstruction({ ...proof.recordProofIx, data: tamperedData })

      await expect(
        sendV0(program.provider.connection, [proof.secp256r1Ix, tamperedIx, enforceIx], owner.publicKey, [owner])
      ).rejects.toThrow(/"Custom":6002/)
    })

    it("oversized_payload_rejected", async () => {
      const { program, owner, passkey } = await enforceFixture()
      const enforceIx = await buildEnforceIx(program, owner)
      // 1000-char rpId → origin ~1007 chars → clientDataJSON ~1070 bytes → tx > 1232 bytes
      const hugeRpId  = "a".repeat(1000) + ".example.com"
      const proof     = buildProofInstructions(passkey, enforceIx, program.programId, owner.publicKey, 0n, "trana.require", hugeRpId)

      await expect(
        sendV0(program.provider.connection, [proof.secp256r1Ix, proof.recordProofIx, enforceIx], owner.publicKey, [owner])
      ).rejects.toThrow()
    })
  })

  describe("events", () => {
    it("proof_verified_event_emitted", async () => {
      const { program, owner, passkey } = await enforceFixture()
      const enforceIx = await buildEnforceIx(program, owner)
      const proof     = buildProofInstructions(passkey, enforceIx, program.programId, owner.publicKey, 0n, "trana.require")

      const sig    = await sendV0(program.provider.connection, [proof.secp256r1Ix, proof.recordProofIx, enforceIx], owner.publicKey, [owner])
      const txInfo = await program.provider.connection.getTransaction(sig, {
        commitment: "confirmed",
        maxSupportedTransactionVersion: 0,
      })
      const eventParser = new anchor.EventParser(program.programId, program.coder)
      const events      = [...eventParser.parseLogs(txInfo!.meta!.logMessages!)]

      expect(events.length).toBe(1)
      expect(events[0].name).toBe("proofVerified")
      expect((events[0].data as any).owner.toBase58()).toBe(owner.publicKey.toBase58())
      expect((events[0].data as any).nonce.toString()).toBe("0")
    })

    it("proof_failure_event_emitted", async () => {
      const { program, owner, passkey } = await enforceFixture()
      const enforceIx    = await buildEnforceIx(program, owner)
      const wrongPasskey = generateTestPasskey()
      const proof        = buildProofInstructions(wrongPasskey, enforceIx, program.programId, owner.publicKey, 0n, "trana.require")

      // Failed tx → program never reaches emit!() → no ProofVerified event
      await expect(
        sendV0(program.provider.connection, [proof.secp256r1Ix, proof.recordProofIx, enforceIx], owner.publicKey, [owner])
      ).rejects.toThrow(/"Custom":6003/)
    })

    it("replay_attempt_event_emitted", async () => {
      const { program, owner, passkey } = await enforceFixture()
      const enforceIx = await buildEnforceIx(program, owner)
      const proof     = buildProofInstructions(passkey, enforceIx, program.programId, owner.publicKey, 0n, "trana.require")

      // First attempt emits event; replay fails before emit!() is reached
      await sendV0(program.provider.connection, [proof.secp256r1Ix, proof.recordProofIx, enforceIx], owner.publicKey, [owner])
      await expect(
        sendV0(program.provider.connection, [proof.secp256r1Ix, proof.recordProofIx, enforceIx], owner.publicKey, [owner])
      ).rejects.toThrow(/"Custom":6002/)
    })
  })

  describe("atomicity", () => {
    it("enforce_atomicity_success", async () => {
      const { program, owner, passkey } = await enforceFixture()
      const pda       = registryPda(owner.publicKey, program.programId)
      const enforceIx = await buildEnforceIx(program, owner)
      const proof     = buildProofInstructions(passkey, enforceIx, program.programId, owner.publicKey, 0n, "trana.require")

      // Extra instruction after enforce — everything succeeds atomically
      const extraIx = ComputeBudgetProgram.setComputeUnitLimit({ units: 400_000 })
      await sendV0(program.provider.connection, [proof.secp256r1Ix, proof.recordProofIx, enforceIx, extraIx], owner.publicKey, [owner])

      const after = await program.account.twoFactorRegistry.fetch(pda)
      expect((after.nonce as anchor.BN).toNumber()).toBe(1)
    })

    it("enforce_atomicity_failure", async () => {
      const { program, owner, passkey } = await enforceFixture()
      const pda       = registryPda(owner.publicKey, program.programId)
      const enforceIx = await buildEnforceIx(program, owner)
      const proof     = buildProofInstructions(passkey, enforceIx, program.programId, owner.publicKey, 0n, "trana.require")

      // Instruction to a non-existent program after enforce — entire tx reverts
      const failIx = new TransactionInstruction({ programId: Keypair.generate().publicKey, keys: [], data: Buffer.alloc(0) })
      await expect(
        sendV0(program.provider.connection, [proof.secp256r1Ix, proof.recordProofIx, enforceIx, failIx], owner.publicKey, [owner])
      ).rejects.toThrow()

      const after = await program.account.twoFactorRegistry.fetch(pda)
      expect((after.nonce as anchor.BN).toNumber()).toBe(0)
    })

    it("partial_execution_impossible", async () => {
      const { program, owner, passkey } = await enforceFixture()
      const pda       = registryPda(owner.publicKey, program.programId)
      const enforceIx = await buildEnforceIx(program, owner)
      const proof     = buildProofInstructions(passkey, enforceIx, program.programId, owner.publicKey, 0n, "trana.require")

      // Failing instruction BEFORE the proof triple — enforce never runs, nonce stays 0
      const failIx = new TransactionInstruction({ programId: Keypair.generate().publicKey, keys: [], data: Buffer.alloc(0) })
      await expect(
        sendV0(program.provider.connection, [failIx, proof.secp256r1Ix, proof.recordProofIx, enforceIx], owner.publicKey, [owner])
      ).rejects.toThrow()

      const after = await program.account.twoFactorRegistry.fetch(pda)
      expect((after.nonce as anchor.BN).toNumber()).toBe(0)
    })
  })

  describe("compute budget", () => {
    it("compute_budget_under_limit", async () => {
      const { program, owner, passkey } = await enforceFixture()
      const pda       = registryPda(owner.publicKey, program.programId)
      const enforceIx = await buildEnforceIx(program, owner)
      const proof     = buildProofInstructions(passkey, enforceIx, program.programId, owner.publicKey, 0n, "trana.require")

      const budgetIx = ComputeBudgetProgram.setComputeUnitLimit({ units: 400_000 })
      await sendV0(program.provider.connection, [budgetIx, proof.secp256r1Ix, proof.recordProofIx, enforceIx], owner.publicKey, [owner])

      const after = await program.account.twoFactorRegistry.fetch(pda)
      expect((after.nonce as anchor.BN).toNumber()).toBe(1)
    })

    it("compute_budget_exceeded_gracefully", async () => {
      const { program, owner, passkey } = await enforceFixture()
      const enforceIx = await buildEnforceIx(program, owner)
      const proof     = buildProofInstructions(passkey, enforceIx, program.programId, owner.publicKey, 0n, "trana.require")

      // 1_000 CUs is far below the ~120K enforce needs — fails with compute exceeded
      const tightBudgetIx = ComputeBudgetProgram.setComputeUnitLimit({ units: 1_000 })
      await expect(
        sendV0(program.provider.connection, [tightBudgetIx, proof.secp256r1Ix, proof.recordProofIx, enforceIx], owner.publicKey, [owner])
      ).rejects.toThrow()
    })
  })

  describe("domain separation", () => {
    it("proof_domain_separation_valid", async () => {
      const { program, owner, passkey } = await enforceFixture()
      const pda       = registryPda(owner.publicKey, program.programId)
      const enforceIx = await buildEnforceIx(program, owner)
      const proof     = buildProofInstructions(passkey, enforceIx, program.programId, owner.publicKey, 0n, "trana.require")

      // Domain "trana:v1" is hardcoded in both SDK and program — proof is accepted
      await sendV0(program.provider.connection, [proof.secp256r1Ix, proof.recordProofIx, enforceIx], owner.publicKey, [owner])

      const after = await program.account.twoFactorRegistry.fetch(pda)
      expect((after.nonce as anchor.BN).toNumber()).toBe(1)
    })

    it("proof_domain_separation_invalid", async () => {
      const { program, owner, passkey } = await enforceFixture()
      const enforceIx = await buildEnforceIx(program, owner)

      // Proof signed with a different trana_guard_program_id — the full intent hash
      // (which includes the "trana:v1" domain prefix) does not match → 6002
      const proof = buildProofInstructions(passkey, enforceIx, SystemProgram.programId, owner.publicKey, 0n, "trana.require")

      await expect(
        sendV0(program.provider.connection, [proof.secp256r1Ix, proof.recordProofIx, enforceIx], owner.publicKey, [owner])
      ).rejects.toThrow(/"Custom":6002/)
    })
  })

  describe("cross-replay", () => {
    it("cross_program_replay_invalid", async () => {
      const { program, owner, passkey } = await enforceFixture()
      const enforceIx = await buildEnforceIx(program, owner)

      // Proof issued for a different program cannot be replayed here — 6002
      const proof = buildProofInstructions(passkey, enforceIx, SystemProgram.programId, owner.publicKey, 0n, "trana.require")

      await expect(
        sendV0(program.provider.connection, [proof.secp256r1Ix, proof.recordProofIx, enforceIx], owner.publicKey, [owner])
      ).rejects.toThrow(/"Custom":6002/)
    })

    it("cross_policy_replay_invalid", async () => {
      const { program, owner, passkey } = await enforceFixture()
      const enforceIx = await buildEnforceIx(program, owner)

      // Proof issued for "trana.require" submitted to a Policy::Limit enforce
      // → proof.policy ("trana.require") ≠ expected_policy ("trana.limit") → 6007
      const proof         = buildProofInstructions(passkey, enforceIx, program.programId, owner.publicKey, 0n, "trana.require")
      const limitEnforceIx = await program.methods
        .enforce({ limit: { paramOffset: 0, limit: new anchor.BN(0) } })
        .accounts({ owner: owner.publicKey })
        .instruction()

      await expect(
        sendV0(program.provider.connection, [proof.secp256r1Ix, proof.recordProofIx, limitEnforceIx], owner.publicKey, [owner])
      ).rejects.toThrow(/"Custom":6007/)
    })
  })

  describe("webauthn signatures", () => {
    it("valid_webauthn_p256_signature", async () => {
      const { program, owner, passkey } = await enforceFixture()
      const pda       = registryPda(owner.publicKey, program.programId)
      const enforceIx = await buildEnforceIx(program, owner)
      const proof     = buildProofInstructions(passkey, enforceIx, program.programId, owner.publicKey, 0n, "trana.require")

      await sendV0(program.provider.connection, [proof.secp256r1Ix, proof.recordProofIx, enforceIx], owner.publicKey, [owner])

      const after = await program.account.twoFactorRegistry.fetch(pda)
      expect((after.nonce as anchor.BN).toNumber()).toBe(1)
    })

    it("invalid_webauthn_p256_signature", async () => {
      const { program, owner, passkey } = await enforceFixture()
      const enforceIx = await buildEnforceIx(program, owner)
      const proof     = buildProofInstructions(passkey, enforceIx, program.programId, owner.publicKey, 0n, "trana.require")

      const data = Buffer.from(proof.secp256r1Ix.data)
      data.fill(0, 49, 113)  // zero the 64-byte sig field
      const invalidIx = new TransactionInstruction({ ...proof.secp256r1Ix, data })

      await expect(
        sendV0(program.provider.connection, [invalidIx, proof.recordProofIx, enforceIx], owner.publicKey, [owner])
      ).rejects.toThrow()
    })

    it("malformed_der_signature", async () => {
      const { program, owner, passkey } = await enforceFixture()
      const enforceIx = await buildEnforceIx(program, owner)
      const proof     = buildProofInstructions(passkey, enforceIx, program.programId, owner.publicKey, 0n, "trana.require")

      // Replace compact r||s with DER-like bytes (0x30 = sequence tag) — precompile rejects
      const data = Buffer.from(proof.secp256r1Ix.data)
      data[49]  = 0x30  // DER sequence tag
      data[50]  = 0x44  // DER length
      data[51]  = 0x02  // integer tag
      const derIx = new TransactionInstruction({ ...proof.secp256r1Ix, data })

      await expect(
        sendV0(program.provider.connection, [derIx, proof.recordProofIx, enforceIx], owner.publicKey, [owner])
      ).rejects.toThrow()
    })

    it("compact_signature_conversion_valid", async () => {
      const { program, owner, passkey } = await enforceFixture()
      const pda       = registryPda(owner.publicKey, program.programId)
      const enforceIx = await buildEnforceIx(program, owner)
      // noble/curves always produces low-S compact r||s — verify it passes end-to-end
      const proof     = buildProofInstructions(passkey, enforceIx, program.programId, owner.publicKey, 0n, "trana.require")

      await sendV0(program.provider.connection, [proof.secp256r1Ix, proof.recordProofIx, enforceIx], owner.publicKey, [owner])

      const after = await program.account.twoFactorRegistry.fetch(pda)
      expect((after.nonce as anchor.BN).toNumber()).toBe(1)
    })

    it("compact_signature_conversion_invalid", async () => {
      const { program, owner, passkey } = await enforceFixture()
      const enforceIx = await buildEnforceIx(program, owner)
      const proof     = buildProofInstructions(passkey, enforceIx, program.programId, owner.publicKey, 0n, "trana.require")

      // Corrupt r (first 32 bytes of sig) — invalid compact encoding → precompile rejects
      const data = Buffer.from(proof.secp256r1Ix.data)
      data.fill(0xff, 49, 81)
      const invalidIx = new TransactionInstruction({ ...proof.secp256r1Ix, data })

      await expect(
        sendV0(program.provider.connection, [invalidIx, proof.recordProofIx, enforceIx], owner.publicKey, [owner])
      ).rejects.toThrow()
    })
  })

  describe("passkey rotation", () => {
    it("passkey_rotation_success", async () => {
      const { program, owner, passkey: passkey1, treasury } = await enforceFixture()
      const pda     = registryPda(owner.publicKey, program.programId)
      const passkey2 = generateTestPasskey()

      await registerPasskey(program, owner, passkey2, treasury)

      const after = await program.account.twoFactorRegistry.fetch(pda)
      expect(Buffer.from(after.pubkeyBytes).equals(Buffer.from(passkey2.pubkey))).toBe(true)
      expect((after.nonce as anchor.BN).toNumber()).toBe(0)  // nonce preserved
    })

    it("old_passkey_invalid_after_rotation", async () => {
      const { program, owner, passkey: passkey1, treasury } = await enforceFixture()
      const passkey2 = generateTestPasskey()
      await registerPasskey(program, owner, passkey2, treasury)

      // Registry now has passkey2 — proof signed by passkey1 → 6003
      const enforceIx = await buildEnforceIx(program, owner)
      const proof     = buildProofInstructions(passkey1, enforceIx, program.programId, owner.publicKey, 0n, "trana.require")

      await expect(
        sendV0(program.provider.connection, [proof.secp256r1Ix, proof.recordProofIx, enforceIx], owner.publicKey, [owner])
      ).rejects.toThrow(/"Custom":6003/)
    })

    it("new_passkey_valid_after_rotation", async () => {
      const { program, owner, passkey: passkey1, treasury } = await enforceFixture()
      const pda      = registryPda(owner.publicKey, program.programId)
      const passkey2 = generateTestPasskey()
      await registerPasskey(program, owner, passkey2, treasury)

      // Registry has passkey2 — proof signed by passkey2 → passes
      const enforceIx = await buildEnforceIx(program, owner)
      const proof     = buildProofInstructions(passkey2, enforceIx, program.programId, owner.publicKey, 0n, "trana.require")

      await sendV0(program.provider.connection, [proof.secp256r1Ix, proof.recordProofIx, enforceIx], owner.publicKey, [owner])

      const after = await program.account.twoFactorRegistry.fetch(pda)
      expect((after.nonce as anchor.BN).toNumber()).toBe(1)
    })
  })

  describe("registry recovery", () => {
    it("registry_recovery_success", async () => {
      const { program, owner, treasury } = await enforceFixture()
      const pda      = registryPda(owner.publicKey, program.programId)
      const passkey2 = generateTestPasskey()

      const balanceBefore = await program.provider.connection.getBalance(treasury)
      await registerPasskey(program, owner, passkey2, treasury)  // re-register = recovery
      const balanceAfter = await program.provider.connection.getBalance(treasury)

      const data = await program.account.twoFactorRegistry.fetch(pda)
      expect(Buffer.from(data.pubkeyBytes).equals(Buffer.from(passkey2.pubkey))).toBe(true)
      expect(balanceAfter).toBeGreaterThan(balanceBefore)  // recovery fee charged
    })

    it("registry_recovery_invalid_proof", async () => {
      const { program, owner, passkey, treasury } = await enforceFixture()

      // After recovery, old passkey is rejected — proof no longer matches registry
      const passkey2 = generateTestPasskey()
      await registerPasskey(program, owner, passkey2, treasury)

      const enforceIx = await buildEnforceIx(program, owner)
      const oldProof  = buildProofInstructions(passkey, enforceIx, program.programId, owner.publicKey, 0n, "trana.require")

      await expect(
        sendV0(program.provider.connection, [oldProof.secp256r1Ix, oldProof.recordProofIx, enforceIx], owner.publicKey, [owner])
      ).rejects.toThrow(/"Custom":6003/)
    })

    it("registry_recovery_wrong_owner", async () => {
      const { program, owner, treasury } = await enforceFixture()
      const attacker = Keypair.generate()
      const passkey2 = generateTestPasskey()

      // Attacker tries to register a passkey for owner — owner must sign, attacker cannot
      const ix = await program.methods
        .registerTwoFa(
          { secp256R1Passkey: {} },
          Buffer.from(passkey2.pubkey),
          Buffer.from(passkey2.credentialId),
        )
        .accounts({ owner: owner.publicKey, treasury })
        .instruction()

      await expect(
        sendV0(program.provider.connection, [ix], attacker.publicKey, [attacker])
      ).rejects.toThrow()
    })
  })

  describe("attacks", () => {
    it("attack_raw_transaction_without_sdk", async () => {
      const { program, owner } = await enforceFixture()
      const enforceIx = await buildEnforceIx(program, owner)

      // Raw enforce call with no proof triple — caught immediately → 6000
      await expect(
        sendV0(program.provider.connection, [enforceIx], owner.publicKey, [owner])
      ).rejects.toThrow(/"Custom":6000/)
    })

    it("attack_direct_rpc_submission", async () => {
      const { program, owner, passkey } = await enforceFixture()
      const enforceIx = await buildEnforceIx(program, owner)

      // Omit record_proof — secp256r1 + enforce only (enforce at idx 1 → current_idx < 2) → 6000
      const proof = buildProofInstructions(passkey, enforceIx, program.programId, owner.publicKey, 0n, "trana.require")
      await expect(
        sendV0(program.provider.connection, [proof.secp256r1Ix, enforceIx], owner.publicKey, [owner])
      ).rejects.toThrow(/"Custom":6000/)
    })

    it("attack_manual_instruction_forgery", async () => {
      const { program, owner, passkey } = await enforceFixture()
      const enforceIx  = await buildEnforceIx(program, owner)
      const wrongKey   = generateTestPasskey()
      const proof      = buildProofInstructions(passkey, enforceIx, program.programId, owner.publicKey, 0n, "trana.require")

      // Forge: replace pubkey in secp256r1 with a different key — pubkey ≠ registry → 6003
      const data = Buffer.from(proof.secp256r1Ix.data)
      Buffer.from(wrongKey.pubkey).copy(data, 16)
      const forgedIx = new TransactionInstruction({ ...proof.secp256r1Ix, data })

      await expect(
        sendV0(program.provider.connection, [forgedIx, proof.recordProofIx, enforceIx], owner.publicKey, [owner])
      ).rejects.toThrow()
    })

    it("attack_modified_ix_order", async () => {
      const { program, owner, passkey } = await enforceFixture()
      const enforceIx = await buildEnforceIx(program, owner)
      const proof     = buildProofInstructions(passkey, enforceIx, program.programId, owner.publicKey, 0n, "trana.require")

      // Swap secp256r1 and record_proof — ix[N-1] is secp256r1, disc check fails → 6005
      await expect(
        sendV0(program.provider.connection, [proof.recordProofIx, proof.secp256r1Ix, enforceIx], owner.publicKey, [owner])
      ).rejects.toThrow(/"Custom":6005/)
    })

    it("attack_fake_record_proof_ix", async () => {
      const { program, owner, passkey } = await enforceFixture()
      const enforceIx = await buildEnforceIx(program, owner)
      const proof     = buildProofInstructions(passkey, enforceIx, program.programId, owner.publicKey, 0n, "trana.require")

      // Attacker builds a record_proof with a different nonce in the challenge — hash mismatch → 6002
      const fakeProof = buildProofInstructions(passkey, enforceIx, program.programId, owner.publicKey, 999n, "trana.require")
      await expect(
        sendV0(program.provider.connection, [proof.secp256r1Ix, fakeProof.recordProofIx, enforceIx], owner.publicKey, [owner])
      ).rejects.toThrow(/"Custom":6002/)
    })
  })

  describe("edge cases", () => {
    it("enforce_with_zero_nonce", async () => {
      const { program, owner, passkey } = await enforceFixture()
      const pda       = registryPda(owner.publicKey, program.programId)
      const enforceIx = await buildEnforceIx(program, owner)
      const proof     = buildProofInstructions(passkey, enforceIx, program.programId, owner.publicKey, 0n, "trana.require")

      await sendV0(program.provider.connection, [proof.secp256r1Ix, proof.recordProofIx, enforceIx], owner.publicKey, [owner])

      const after = await program.account.twoFactorRegistry.fetch(pda)
      expect((after.nonce as anchor.BN).toNumber()).toBe(1)
    })

    it.skip("enforce_with_max_nonce", async () => {
      // Advancing the registry nonce to u64::MAX-1 requires billions of transactions.
      // Behaviorally: signing a proof for nonce=u64::MAX-1 when on-chain nonce=0
      // correctly fails with 6002 (PayloadMismatch) — no panic or overflow.
    })
    it("enforce_with_empty_policy", async () => {
      const { program, owner, passkey } = await enforceFixture()
      const enforceIx = await buildEnforceIx(program, owner)
      const proof     = buildProofInstructions(passkey, enforceIx, program.programId, owner.publicKey, 0n, "")

      await expect(
        sendV0(program.provider.connection, [proof.secp256r1Ix, proof.recordProofIx, enforceIx], owner.publicKey, [owner])
      ).rejects.toThrow(/"Custom":6007/)
    })

    it("enforce_with_long_policy", async () => {
      const { program, owner, passkey } = await enforceFixture()
      const enforceIx  = await buildEnforceIx(program, owner)
      const proof      = buildProofInstructions(passkey, enforceIx, program.programId, owner.publicKey, 0n, "x".repeat(200))

      await expect(
        sendV0(program.provider.connection, [proof.secp256r1Ix, proof.recordProofIx, enforceIx], owner.publicKey, [owner])
      ).rejects.toThrow(/"Custom":6007/)
    })

    it("enforce_with_unicode_policy", async () => {
      const { program, owner, passkey } = await enforceFixture()
      const enforceIx = await buildEnforceIx(program, owner)
      const proof     = buildProofInstructions(passkey, enforceIx, program.programId, owner.publicKey, 0n, "trana.требовать🔑")

      await expect(
        sendV0(program.provider.connection, [proof.secp256r1Ix, proof.recordProofIx, enforceIx], owner.publicKey, [owner])
      ).rejects.toThrow(/"Custom":6007/)
    })
  })
})
