import * as anchor from "@coral-xyz/anchor"
import { Keypair, PublicKey } from "@solana/web3.js"
import type { TranaGuard }     from "../target/types/trana_guard"
import type { TranaAuthority } from "../target/types/trana_authority"
import type { TranaTestVault } from "../target/types/trana_test_vault"
import {
  getProgram,
  registryPda,
  ensureConfig,
  setupWallet,
  registerPasskey,
  generateTestPasskey,
} from "./helpers/setup"
import { sendV0 } from "./helpers/transactions"
import { buildProofInstructions } from "./helpers/proof"
import { createUpgradeBuffer, deployFreshProgram, BPF_LOADER as _BPF_LOADER, setUpgradeAuthorityIx as _setUpgradeAuthorityIx } from "./helpers/bpf"
import * as path from "path"

// ── Helpers ───────────────────────────────────────────────────────────────────

function getAuthorityProgram(): anchor.Program<TranaAuthority> {
  return anchor.workspace.TranaAuthority as anchor.Program<TranaAuthority>
}

function authorityRecordPda(
  owner:     PublicKey,
  target:    PublicKey,
  programId: PublicKey,
): PublicKey {
  const [pda] = PublicKey.findProgramAddressSync(
    [Buffer.from("trana-authority"), owner.toBuffer(), target.toBuffer()],
    programId,
  )
  return pda
}

async function setupGuardedOwner(tranaGuard: anchor.Program<TranaGuard>) {
  const payer         = (tranaGuard.provider as anchor.AnchorProvider).wallet as anchor.Wallet
  const { treasury }  = await ensureConfig(tranaGuard, payer)
  const { owner }     = await setupWallet(tranaGuard)
  const passkey       = generateTestPasskey()
  await registerPasskey(tranaGuard, owner, passkey, treasury)
  return { owner, passkey, treasury }
}

async function buildAndSendProof(
  tranaGuard:  anchor.Program<TranaGuard>,
  protectedIx: anchor.web3.TransactionInstruction,
  owner:       Keypair,
  passkey:     ReturnType<typeof generateTestPasskey>,
  nonce = 0n,
) {
  const proof = buildProofInstructions(
    passkey,
    protectedIx,
    tranaGuard.programId,
    owner.publicKey,
    nonce,
    "trana.require",
    "localhost",
    undefined,
    undefined,
    tranaGuard.programId,
  )
  return sendV0(
    tranaGuard.provider.connection,
    [proof.secp256r1Ix, proof.recordProofIx, protectedIx],
    owner.publicKey,
    [owner],
  )
}

// ─────────────────────────────────────────────────────────────────────────────

describe("trana_authority", () => {
  anchor.setProvider(anchor.AnchorProvider.env())

  const tranaGuard = getProgram()
  const authority  = getAuthorityProgram()

  // Pre-initialise the guard config before any test runs. On a fresh anchor
  // test-validator the very first transaction can be dropped during startup.
  // Retrying here avoids that race without polluting individual test bodies.
  beforeAll(async () => {
    const payer = (tranaGuard.provider as anchor.AnchorProvider).wallet as anchor.Wallet
    for (let attempt = 0; ; attempt++) {
      try {
        await ensureConfig(tranaGuard, payer)
        return
      } catch (err) {
        if (attempt >= 4) throw err
        await new Promise(r => setTimeout(r, 3_000))
      }
    }
  // 5 attempts × (up to 30s confirmTransaction + 3s sleep) = ~165s worst-case
  }, 180_000)

  // ── register ────────────────────────────────────────────────────────────────

  describe("register", () => {
    it("register_creates_authority_record", async () => {
      const { owner } = await setupGuardedOwner(tranaGuard)
      const target    = Keypair.generate().publicKey
      const pda       = authorityRecordPda(owner.publicKey, target, authority.programId)

      await authority.methods
        .register()
        .accounts({ owner: owner.publicKey, target })
        .signers([owner])
        .rpc()

      const rec = await authority.account.authorityRecord.fetch(pda)
      expect(rec.owner.toBase58()).toBe(owner.publicKey.toBase58())
      expect(rec.target.toBase58()).toBe(target.toBase58())
    })

    it("register_requires_owner_signature", async () => {
      const { owner } = await setupGuardedOwner(tranaGuard)
      const attacker  = Keypair.generate()
      const target    = Keypair.generate().publicKey

      await expect(
        authority.methods
          .register()
          .accounts({ owner: owner.publicKey, target })
          .signers([attacker])
          .rpc()
      ).rejects.toThrow()
    })

    it("register_duplicate_same_owner_target_fails", async () => {
      const { owner } = await setupGuardedOwner(tranaGuard)
      const target    = Keypair.generate().publicKey

      await authority.methods
        .register()
        .accounts({ owner: owner.publicKey, target })
        .signers([owner])
        .rpc()

      await expect(
        authority.methods
          .register()
          .accounts({ owner: owner.publicKey, target })
          .signers([owner])
          .rpc()
      ).rejects.toThrow()
    })

    it("register_same_target_different_owner_succeeds", async () => {
      const { owner: owner1 } = await setupGuardedOwner(tranaGuard)
      const { owner: owner2 } = await setupGuardedOwner(tranaGuard)
      const target            = Keypair.generate().publicKey

      await authority.methods
        .register()
        .accounts({ owner: owner1.publicKey, target })
        .signers([owner1])
        .rpc()
      await authority.methods
        .register()
        .accounts({ owner: owner2.publicKey, target })
        .signers([owner2])
        .rpc()

      const pda1 = authorityRecordPda(owner1.publicKey, target, authority.programId)
      const pda2 = authorityRecordPda(owner2.publicKey, target, authority.programId)
      expect(pda1.toBase58()).not.toBe(pda2.toBase58())
      const rec1 = await authority.account.authorityRecord.fetch(pda1)
      const rec2 = await authority.account.authorityRecord.fetch(pda2)
      expect(rec1.owner.toBase58()).toBe(owner1.publicKey.toBase58())
      expect(rec2.owner.toBase58()).toBe(owner2.publicKey.toBase58())
    })

    it("register_does_not_require_guard_proof", async () => {
      // register() only needs the wallet sig — no secp256r1/record_proof preamble
      const { owner } = await setupGuardedOwner(tranaGuard)
      const target    = Keypair.generate().publicKey

      await expect(
        authority.methods
          .register()
          .accounts({ owner: owner.publicKey, target })
          .signers([owner])
          .rpc()
      ).resolves.toBeDefined()
    })
  })

  // ── execute_upgrade ──────────────────────────────────────────────────────────
  //
  // Uses trana_test_vault as the real target program — it is always deployed
  // by the test runner so we have a genuine upgradeable BPF program to work with.

  describe("execute_upgrade", () => {
    const BPF_LOADER = _BPF_LOADER

    // Read the ProgramData address from the deployed program account.
    // BpfLoaderUpgradeable::Program layout: [variant u32 (2)][programdata_address 32]
    async function getProgramData(conn: anchor.web3.Connection, programId: PublicKey): Promise<PublicKey> {
      const info = await conn.getAccountInfo(programId)
      if (!info) throw new Error(`program ${programId} not found`)
      return new PublicKey(info.data.slice(4, 36))
    }

    const setUpgradeAuthorityIx = _setUpgradeAuthorityIx

    // Programs loaded via anchor's --bpf-program flag are immutable (authority =
    // 11111...1) so setUpgradeAuthorityIx would fail against them. We deploy one
    // fresh upgradeable copy per describe block; all upgrade tests share it.
    let upgradeTargetProgramId: PublicKey
    beforeAll(async () => {
      const soPath = path.join(__dirname, "../target/deploy/trana_test_vault.so")
      upgradeTargetProgramId = deployFreshProgram(soPath)
    }, 60_000)

    // Full fixture: registers PDA for trana_test_vault and transfers upgrade
    // authority from payer → PDA. Returns a cleanup function that restores
    // the authority back to payer so subsequent tests start from a clean state.
    async function upgradeFixture() {
      const conn    = tranaGuard.provider.connection
      const payer   = (tranaGuard.provider as anchor.AnchorProvider).wallet as anchor.Wallet
      const payerKp = (payer as unknown as { payer: Keypair }).payer

      const { owner, passkey } = await setupGuardedOwner(tranaGuard)
      const programId   = upgradeTargetProgramId
      const programData = await getProgramData(conn, programId)

      await authority.methods
        .register()
        .accounts({ owner: owner.publicKey, target: programId })
        .signers([owner])
        .rpc()

      const upgradePda = authorityRecordPda(owner.publicKey, programId, authority.programId)
      const registry   = registryPda(owner.publicKey, tranaGuard.programId)

      // Transfer upgrade authority: payer → PDA
      await sendV0(
        conn,
        [setUpgradeAuthorityIx(programData, payerKp.publicKey, upgradePda)],
        payerKp.publicKey, [payerKp],
      )

      // Each fixture creates a fresh owner (nonce starts at 0).
      // restore() must be called before the owner's nonce has been incremented,
      // which is true for every test that uses it — they fail at proof/CPI level
      // without consuming the nonce.
      let restoreNonce = 0n

      const restore = async () => {
        const pdaInfo = await conn.getAccountInfo(upgradePda)
        if (!pdaInfo) return  // already closed — payer has the authority
        const reclaimIx = await authority.methods
          .reclaimAuthority(payerKp.publicKey)
          .accounts({
            owner:            owner.publicKey,
            target:           programId,
            programData,
            newAuthorityInfo: payerKp.publicKey,
          })
          .instruction()
        const proof = buildProofInstructions(
          passkey, reclaimIx, tranaGuard.programId, owner.publicKey,
          restoreNonce, "trana.require", "localhost", undefined, undefined, tranaGuard.programId,
        )
        await sendV0(conn, [proof.secp256r1Ix, proof.recordProofIx, reclaimIx], owner.publicKey, [owner])
      }

      return { conn, payer, payerKp, owner, passkey, programId, programData, upgradePda, registry, restore,
               // Expose so tests that use the passkey can keep restoreNonce in sync
               advanceRestoreNonce: () => { restoreNonce++ } }
    }

    it("register_program_upgrade_pda_is_correct", async () => {
      const { owner } = await setupGuardedOwner(tranaGuard)
      const fakeProgram = Keypair.generate().publicKey

      await authority.methods
        .register()
        .accounts({ owner: owner.publicKey, target: fakeProgram })
        .signers([owner])
        .rpc()

      const pda = authorityRecordPda(owner.publicKey, fakeProgram, authority.programId)
      const rec = await authority.account.authorityRecord.fetch(pda)
      expect(rec.owner.toBase58()).toBe(owner.publicKey.toBase58())
      expect(rec.target.toBase58()).toBe(fakeProgram.toBase58())
    })

    it("execute_upgrade_missing_proof_fails", async () => {
      const { owner } = await setupGuardedOwner(tranaGuard)
      const conn      = tranaGuard.provider.connection
      const testVault  = anchor.workspace.TranaTestVault as anchor.Program<TranaTestVault>
      const programId  = testVault.programId
      const programData = await getProgramData(conn, programId)
      const dummy      = Keypair.generate().publicKey

      await authority.methods
        .register()
        .accounts({ owner: owner.publicKey, target: programId })
        .signers([owner])
        .rpc()

      const ix = await authority.methods
        .executeUpgrade()
        .accounts({
          owner:       owner.publicKey,
          program:     programId,
          programData,
          buffer:      dummy,
          spill:       dummy,
        })
        .instruction()

      await expect(
        sendV0(conn, [ix], owner.publicKey, [owner])
      ).rejects.toThrow(/"Custom":6000/)
    })

    it("direct_upgrade_with_old_key_fails_after_transfer", async () => {
      const { conn, payerKp, programData, restore } = await upgradeFixture()
      try {
        // Payer is no longer the upgrade authority — set_upgrade_authority fails
        await expect(
          sendV0(
            conn,
            [setUpgradeAuthorityIx(programData, payerKp.publicKey, payerKp.publicKey)],
            payerKp.publicKey, [payerKp],
          )
        ).rejects.toThrow()
      } finally {
        await restore()
      }
    })

    it("reclaim_program_upgrade_success_sets_new_upgrade_authority", async () => {
      const { conn, payerKp, owner, passkey, programId, programData, upgradePda } =
        await upgradeFixture()
      // Reclaim back to payer (keeps state clean for other tests)
      const ix = await authority.methods
        .reclaimAuthority(payerKp.publicKey)
        .accounts({
          owner:            owner.publicKey,
          target:           programId,
          programData,
          newAuthorityInfo: payerKp.publicKey,
        })
        .instruction()

      await buildAndSendProof(tranaGuard, ix, owner, passkey)

      // PDA closed
      expect(await conn.getAccountInfo(upgradePda)).toBeNull()

      // Upgrade authority returned to payer
      const pdInfo = await conn.getAccountInfo(programData)
      // ProgramData layout: [variant u32 (3)][slot u64][Option<Pubkey>: 1+32 bytes]
      const hasAuthority = pdInfo!.data[12] === 1
      const actualAuth   = new PublicKey(pdInfo!.data.slice(13, 45))
      expect(hasAuthority).toBe(true)
      expect(actualAuth.toBase58()).toBe(payerKp.publicKey.toBase58())
    })

    it("reclaim_program_upgrade_missing_proof_fails", async () => {
      const { conn, payerKp, owner, programId, programData, upgradePda, restore } =
        await upgradeFixture()
      try {
        const ix = await authority.methods
          .reclaimAuthority(payerKp.publicKey)
          .accounts({
            owner:            owner.publicKey,
            target:           programId,
            programData,
            newAuthorityInfo: payerKp.publicKey,
          })
          .instruction()

        await expect(
          sendV0(conn, [ix], owner.publicKey, [owner])
        ).rejects.toThrow(/"Custom":6000/)

        // Record still open
        const rec = await authority.account.authorityRecord.fetch(upgradePda)
        expect(rec.owner.toBase58()).toBe(owner.publicKey.toBase58())
      } finally {
        await restore()
      }
    })

    it("reclaim_program_upgrade_invalid_proof_fails", async () => {
      const { conn, payerKp, owner, programId, programData, restore } =
        await upgradeFixture()
      try {
        const wrongPasskey = generateTestPasskey()
        const ix = await authority.methods
          .reclaimAuthority(payerKp.publicKey)
          .accounts({
            owner:            owner.publicKey,
            target:           programId,
            programData,
            newAuthorityInfo: payerKp.publicKey,
          })
          .instruction()

        const proof = buildProofInstructions(
          wrongPasskey, ix, tranaGuard.programId, owner.publicKey,
          0n, "trana.require", "localhost", undefined, undefined, tranaGuard.programId,
        )
        await expect(
          sendV0(conn, [proof.secp256r1Ix, proof.recordProofIx, ix], owner.publicKey, [owner])
        ).rejects.toThrow(/"Custom":6003/)
      } finally {
        await restore()
      }
    })

    it("reclaim_program_upgrade_keeps_record_open_on_failure", async () => {
      // Register but do NOT transfer upgrade authority to PDA.
      // Reclaim with valid proof → enforce passes, BPF CPI fails (PDA ≠ authority),
      // tx reverts → record stays open.
      const { owner, passkey } = await setupGuardedOwner(tranaGuard)
      const conn    = tranaGuard.provider.connection
      const payer   = (tranaGuard.provider as anchor.AnchorProvider).wallet as anchor.Wallet
      const payerKp = (payer as unknown as { payer: Keypair }).payer
      const testVault  = anchor.workspace.TranaTestVault as anchor.Program<TranaTestVault>
      const programId  = testVault.programId
      const programData = await getProgramData(conn, programId)

      await authority.methods
        .register()
        .accounts({ owner: owner.publicKey, target: programId })
        .signers([owner])
        .rpc()

      const pda = authorityRecordPda(owner.publicKey, programId, authority.programId)

      const ix = await authority.methods
        .reclaimAuthority(payerKp.publicKey)
        .accounts({
          owner:            owner.publicKey,
          target:           programId,
          programData,
          newAuthorityInfo: payerKp.publicKey,
        })
        .instruction()

      // Fails because PDA is not the upgrade authority
      await expect(
        buildAndSendProof(tranaGuard, ix, owner, passkey)
      ).rejects.toThrow()

      // Record still open
      const rec = await authority.account.authorityRecord.fetch(pda)
      expect(rec.owner.toBase58()).toBe(owner.publicKey.toBase58())
    })

    it("reclaim_program_upgrade_then_old_pda_cannot_upgrade", async () => {
      // After reclaim the AuthorityRecord is closed.
      // Trying to call execute_upgrade with the same PDA address fails
      // at Anchor account deserialization.
      const { conn, payerKp, owner, passkey, programId, programData, upgradePda } =
        await upgradeFixture()

      const reclaimIx = await authority.methods
        .reclaimAuthority(payerKp.publicKey)
        .accounts({
          owner:            owner.publicKey,
          target:           programId,
          programData,
          newAuthorityInfo: payerKp.publicKey,
        })
        .instruction()
      await buildAndSendProof(tranaGuard, reclaimIx, owner, passkey)

      // PDA closed — execute_upgrade with it now fails
      const dummy = Keypair.generate().publicKey
      const upgradeIx = await authority.methods
        .executeUpgrade()
        .accounts({
          owner:       owner.publicKey,
          program:     programId,
          programData,
          buffer:      dummy,
          spill:       dummy,
        })
        .instruction()

      await expect(
        buildAndSendProof(tranaGuard, upgradeIx, owner, passkey, 1n)
      ).rejects.toThrow()
    })

    it("execute_upgrade_success_after_transferring_upgrade_authority_to_pda", async () => {
      // Uses trana_test_vault's own .so — upgrading to the same binary is valid
      // for testing the mechanism. The CLI handles the ~290 write transactions.
      const soPath = path.join(__dirname, "../target/deploy/trana_test_vault.so")

      const { conn, payerKp, owner, passkey, programId, programData, upgradePda,
              advanceRestoreNonce, restore } = await upgradeFixture()
      try {
        const buffer = createUpgradeBuffer(soPath, upgradePda)
        const spill  = payerKp.publicKey  // receives buffer rent refund

        const ix = await authority.methods
          .executeUpgrade()
          .accounts({
            owner:       owner.publicKey,
            program:     programId,
            programData,
            buffer,
            spill,
          })
          .instruction()

        await buildAndSendProof(tranaGuard, ix, owner, passkey)
        advanceRestoreNonce()  // nonce 0 consumed — restore must use nonce 1

        // Buffer drained to spill — buffer account should be gone or zeroed
        const bufferInfo = await conn.getAccountInfo(buffer)
        expect(bufferInfo).toBeNull()

        // Program still executable
        const programInfo = await conn.getAccountInfo(programId)
        expect(programInfo?.executable).toBe(true)
      } finally {
        await restore()
      }
    })

    it("execute_upgrade_without_real_upgrade_authority_transfer_fails", async () => {
      // Register PDA as program target but do NOT transfer upgrade authority.
      // Proof passes, BPF Loader rejects because PDA is not the current authority.
      const { owner, passkey } = await setupGuardedOwner(tranaGuard)
      const conn    = tranaGuard.provider.connection
      const testVault   = anchor.workspace.TranaTestVault as anchor.Program<TranaTestVault>
      const programId   = testVault.programId
      const programData = await getProgramData(conn, programId)
      const dummy       = Keypair.generate().publicKey

      await authority.methods
        .register()
        .accounts({ owner: owner.publicKey, target: programId })
        .signers([owner])
        .rpc()

      const ix = await authority.methods
        .executeUpgrade()
        .accounts({
          owner:       owner.publicKey,
          program:     programId,
          programData,
          buffer:      dummy,
          spill:       dummy,
        })
        .instruction()

      await expect(
        buildAndSendProof(tranaGuard, ix, owner, passkey)
      ).rejects.toThrow()
    })

    it.todo("execute_upgrade_wrong_program_data_for_program_fails")
    it.todo("execute_upgrade_invalid_buffer_account_fails")
    it.todo("execute_upgrade_wrong_buffer_authority_fails")
    it.todo("execute_upgrade_wrong_spill_account_fails")
    it.todo("execute_upgrade_emits_upgrade_executed_event")
    it.todo("execute_upgrade_cannot_reuse_drained_buffer")
    it.todo("reclaim_program_upgrade_new_authority_arg_and_account_mismatch_fails")
    it.todo("reclaim_program_upgrade_then_new_authority_can_upgrade_directly")
  })
})
