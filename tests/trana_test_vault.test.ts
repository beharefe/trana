import * as anchor from "@coral-xyz/anchor"
import { Keypair, PublicKey, LAMPORTS_PER_SOL } from "@solana/web3.js"
import type { TranaGuard }     from "../target/types/trana_guard"
import type { TranaTestVault } from "../target/types/trana_test_vault"
import {
  getProgram,
  registryPda,
  ensureConfig,
  setupWallet,
  registerPasskey,
  generateTestPasskey,
  SOL,
} from "./helpers/setup"
import { sendV0, airdrop } from "./helpers/transactions"
import { buildProofInstructions } from "./helpers/proof"

// ── Helpers ───────────────────────────────────────────────────────────────────

function getVaultProgram(): anchor.Program<TranaTestVault> {
  return anchor.workspace.TranaTestVault as anchor.Program<TranaTestVault>
}

const POOL_SEED    = Buffer.from("trana-pool")
const DEPOSIT_SEED = Buffer.from("deposit")
const COOLDOWN_SLOTS = 150n
const WITHDRAW_LIMIT = BigInt(LAMPORTS_PER_SOL)

function poolPda(authority: PublicKey, programId: PublicKey): PublicKey {
  const [pda] = PublicKey.findProgramAddressSync(
    [POOL_SEED, authority.toBuffer()],
    programId,
  )
  return pda
}

function userDepositPda(pool: PublicKey, user: PublicKey, programId: PublicKey): PublicKey {
  const [pda] = PublicKey.findProgramAddressSync(
    [DEPOSIT_SEED, pool.toBuffer(), user.toBuffer()],
    programId,
  )
  return pda
}

async function setupGuardedUser(tranaGuard: anchor.Program<TranaGuard>) {
  const payer        = (tranaGuard.provider as anchor.AnchorProvider).wallet as anchor.Wallet
  const { treasury } = await ensureConfig(tranaGuard, payer)
  const { owner }    = await setupWallet(tranaGuard)
  const passkey      = generateTestPasskey()
  await registerPasskey(tranaGuard, owner, passkey, treasury)
  return { owner, passkey }
}

async function buildWithdrawProof(
  tranaGuard:  anchor.Program<TranaGuard>,
  protectedIx: anchor.web3.TransactionInstruction,
  owner:       Keypair,
  passkey:     ReturnType<typeof generateTestPasskey>,
  nonce:       bigint,
  policyId = "trana.require",
) {
  return buildProofInstructions(
    passkey, protectedIx, tranaGuard.programId, owner.publicKey,
    nonce, policyId, "localhost", undefined, undefined, tranaGuard.programId,
  )
}

// ─────────────────────────────────────────────────────────────────────────────

describe("trana_test_vault", () => {
  anchor.setProvider(anchor.AnchorProvider.env())

  const tranaGuard = getProgram()
  const vault      = getVaultProgram()

  // ── Limit pool ────────────────────────────────────────────────────────────

  describe("Limit pool", () => {
    async function limitPoolFixture() {
      const conn      = tranaGuard.provider.connection
      const payer     = (tranaGuard.provider as anchor.AnchorProvider).wallet as anchor.Wallet
      const payerKp   = (payer as unknown as { payer: Keypair }).payer
      const authority = Keypair.generate()
      await airdrop(conn, authority.publicKey, 2 * LAMPORTS_PER_SOL)

      await vault.methods
        .initializePool({ limit: {} }, "Demo Vault")
        .accounts({ authority: authority.publicKey })
        .signers([authority])
        .rpc()

      const pool = poolPda(authority.publicKey, vault.programId)
      return { conn, payer, payerKp, authority, pool }
    }

    it("deposit_by_anyone_succeeds", async () => {
      const { conn, pool, payerKp } = await limitPoolFixture()
      const stranger = Keypair.generate()
      await airdrop(conn, stranger.publicKey, 2 * LAMPORTS_PER_SOL)

      const before = await conn.getBalance(pool)
      await vault.methods
        .deposit(new anchor.BN(0.5 * LAMPORTS_PER_SOL))
        .accounts({ pool, depositor: stranger.publicKey })
        .signers([stranger])
        .rpc()

      const after = await conn.getBalance(pool)
      expect(after - before).toBe(0.5 * LAMPORTS_PER_SOL)
    })

    it("small_withdrawal_needs_no_proof", async () => {
      const { conn, pool } = await limitPoolFixture()
      const { owner, passkey } = await setupGuardedUser(tranaGuard)

      // Fund the pool and register the user's deposit
      await vault.methods
        .deposit(new anchor.BN(2 * LAMPORTS_PER_SOL))
        .accounts({ pool, depositor: owner.publicKey })
        .signers([owner])
        .rpc()

      const ud      = userDepositPda(pool, owner.publicKey, vault.programId)
      const registry = registryPda(owner.publicKey, tranaGuard.programId)

      // 0.1 SOL < 1 SOL limit — no proof triple in the tx
      const ix = await vault.methods
        .withdraw(new anchor.BN(0.1 * LAMPORTS_PER_SOL))
        .accounts({
          pool,
          userDeposit:       ud,
          owner:             owner.publicKey,
          destination:       owner.publicKey,
          tranaGuardProgram: tranaGuard.programId,
          tranaRegistry:     registry,
          instructions:      anchor.web3.SYSVAR_INSTRUCTIONS_PUBKEY,
        })
        .instruction()

      // Plain tx, no secp256r1 preamble
      await expect(
        sendV0(conn, [ix], owner.publicKey, [owner])
      ).resolves.toBeDefined()
    })

    it("large_withdrawal_without_proof_fails", async () => {
      const { conn, pool } = await limitPoolFixture()
      const { owner } = await setupGuardedUser(tranaGuard)

      await vault.methods
        .deposit(new anchor.BN(2 * LAMPORTS_PER_SOL))
        .accounts({ pool, depositor: owner.publicKey })
        .signers([owner])
        .rpc()

      const ud      = userDepositPda(pool, owner.publicKey, vault.programId)
      const registry = registryPda(owner.publicKey, tranaGuard.programId)

      const ix = await vault.methods
        .withdraw(new anchor.BN(1.5 * LAMPORTS_PER_SOL))
        .accounts({
          pool,
          userDeposit:       ud,
          owner:             owner.publicKey,
          destination:       owner.publicKey,
          tranaGuardProgram: tranaGuard.programId,
          tranaRegistry:     registry,
          instructions:      anchor.web3.SYSVAR_INSTRUCTIONS_PUBKEY,
        })
        .instruction()

      // 1.5 SOL ≥ limit → enforce(Limit) requires proof → MissingProof
      await expect(
        sendV0(conn, [ix], owner.publicKey, [owner])
      ).rejects.toThrow(/"Custom":6000/)
    })

    it("large_withdrawal_with_proof_succeeds", async () => {
      const { conn, pool } = await limitPoolFixture()
      const { owner, passkey } = await setupGuardedUser(tranaGuard)

      await vault.methods
        .deposit(new anchor.BN(2 * LAMPORTS_PER_SOL))
        .accounts({ pool, depositor: owner.publicKey })
        .signers([owner])
        .rpc()

      const ud      = userDepositPda(pool, owner.publicKey, vault.programId)
      const registry = registryPda(owner.publicKey, tranaGuard.programId)
      const destBefore = await conn.getBalance(owner.publicKey)

      const ix = await vault.methods
        .withdraw(new anchor.BN(LAMPORTS_PER_SOL))
        .accounts({
          pool,
          userDeposit:       ud,
          owner:             owner.publicKey,
          destination:       owner.publicKey,
          tranaGuardProgram: tranaGuard.programId,
          tranaRegistry:     registry,
          instructions:      anchor.web3.SYSVAR_INSTRUCTIONS_PUBKEY,
        })
        .instruction()

      const proof = await buildWithdrawProof(tranaGuard, ix, owner, passkey, 0n, "trana.limit")
      await sendV0(conn, [proof.secp256r1Ix, proof.recordProofIx, ix], owner.publicKey, [owner])

      const udData = await vault.account.userDeposit.fetch(ud)
      expect(udData.balance.toNumber()).toBe(LAMPORTS_PER_SOL)
    })

    it("drain_burst_triggers_passkey_after_window_total_hits_limit", async () => {
      const { conn, pool } = await limitPoolFixture()
      const { owner, passkey } = await setupGuardedUser(tranaGuard)

      await vault.methods
        .deposit(new anchor.BN(3 * LAMPORTS_PER_SOL))
        .accounts({ pool, depositor: owner.publicKey })
        .signers([owner])
        .rpc()

      const ud      = userDepositPda(pool, owner.publicKey, vault.programId)
      const registry = registryPda(owner.publicKey, tranaGuard.programId)

      const buildIx = (amount: number) => vault.methods
        .withdraw(new anchor.BN(amount))
        .accounts({
          pool,
          userDeposit:       ud,
          owner:             owner.publicKey,
          destination:       owner.publicKey,
          tranaGuardProgram: tranaGuard.programId,
          tranaRegistry:     registry,
          instructions:      anchor.web3.SYSVAR_INSTRUCTIONS_PUBKEY,
        })
        .instruction()

      // Two small pulls: 0.4 + 0.4 = 0.8 SOL — still under 1 SOL window total
      const ix1 = await buildIx(0.4 * LAMPORTS_PER_SOL)
      await sendV0(conn, [ix1], owner.publicKey, [owner])

      const ix2 = await buildIx(0.4 * LAMPORTS_PER_SOL)
      await sendV0(conn, [ix2], owner.publicKey, [owner])

      // Third pull: 0.4 SOL would push window to 1.2 SOL → drain detected → passkey
      const ix3 = await buildIx(0.4 * LAMPORTS_PER_SOL)
      await expect(
        sendV0(conn, [ix3], owner.publicKey, [owner])
      ).rejects.toThrow(/"Custom":6000/)

      // Same pull with a valid passkey succeeds
      const proof = await buildWithdrawProof(tranaGuard, ix3, owner, passkey, 0n, "trana.require")
      await sendV0(conn, [proof.secp256r1Ix, proof.recordProofIx, ix3], owner.publicKey, [owner])
    })

    it("drain_window_is_per_user_not_global", async () => {
      const { conn, pool } = await limitPoolFixture()
      const { owner: alice, passkey: aliceKey } = await setupGuardedUser(tranaGuard)
      const { owner: bob }                      = await setupGuardedUser(tranaGuard)

      await vault.methods.deposit(new anchor.BN(2 * LAMPORTS_PER_SOL))
        .accounts({ pool, depositor: alice.publicKey }).signers([alice]).rpc()
      await vault.methods.deposit(new anchor.BN(2 * LAMPORTS_PER_SOL))
        .accounts({ pool, depositor: bob.publicKey }).signers([bob]).rpc()

      const aliceUd   = userDepositPda(pool, alice.publicKey, vault.programId)
      const bobUd     = userDepositPda(pool, bob.publicKey, vault.programId)
      const aliceReg  = registryPda(alice.publicKey, tranaGuard.programId)
      const bobReg    = registryPda(bob.publicKey, tranaGuard.programId)

      // Alice drains her window
      for (let i = 0; i < 2; i++) {
        const ix = await vault.methods.withdraw(new anchor.BN(0.4 * LAMPORTS_PER_SOL))
          .accounts({ pool, userDeposit: aliceUd, owner: alice.publicKey,
            destination: alice.publicKey, tranaGuardProgram: tranaGuard.programId,
            tranaRegistry: aliceReg, instructions: anchor.web3.SYSVAR_INSTRUCTIONS_PUBKEY })
          .instruction()
        await sendV0(conn, [ix], alice.publicKey, [alice])
      }

      // Bob's window is untouched — his 0.4 SOL pull is still free
      const bobIx = await vault.methods.withdraw(new anchor.BN(0.4 * LAMPORTS_PER_SOL))
        .accounts({ pool, userDeposit: bobUd, owner: bob.publicKey,
          destination: bob.publicKey, tranaGuardProgram: tranaGuard.programId,
          tranaRegistry: bobReg, instructions: anchor.web3.SYSVAR_INSTRUCTIONS_PUBKEY })
        .instruction()
      await expect(
        sendV0(conn, [bobIx], bob.publicKey, [bob])
      ).resolves.toBeDefined()
    })
  })

  // ── TimeLocked pool ───────────────────────────────────────────────────────

  describe("TimeLocked pool", () => {
    async function timeLockedPoolFixture() {
      const conn      = tranaGuard.provider.connection
      const authority = Keypair.generate()
      await airdrop(conn, authority.publicKey, 2 * LAMPORTS_PER_SOL)

      await vault.methods
        .initializePool({ timeLocked: {} }, "TimeLock Demo")
        .accounts({ authority: authority.publicKey })
        .signers([authority])
        .rpc()

      const pool = poolPda(authority.publicKey, vault.programId)
      return { conn, authority, pool }
    }

    it("first_withdrawal_is_free_no_proof_needed", async () => {
      // last_withdraw_slot starts at 0, so unlock_slot = 150 which is ancient
      const { conn, pool } = await timeLockedPoolFixture()
      const { owner } = await setupGuardedUser(tranaGuard)

      await vault.methods.deposit(new anchor.BN(LAMPORTS_PER_SOL))
        .accounts({ pool, depositor: owner.publicKey }).signers([owner]).rpc()

      const ud      = userDepositPda(pool, owner.publicKey, vault.programId)
      const registry = registryPda(owner.publicKey, tranaGuard.programId)

      const ix = await vault.methods
        .withdraw(new anchor.BN(0.1 * LAMPORTS_PER_SOL))
        .accounts({
          pool,
          userDeposit:       ud,
          owner:             owner.publicKey,
          destination:       owner.publicKey,
          tranaGuardProgram: tranaGuard.programId,
          tranaRegistry:     registry,
          instructions:      anchor.web3.SYSVAR_INSTRUCTIONS_PUBKEY,
        })
        .instruction()

      // No proof — first-ever pull, cooldown not yet started
      await expect(
        sendV0(conn, [ix], owner.publicKey, [owner])
      ).resolves.toBeDefined()

      // last_withdraw_slot is now set
      const udData = await vault.account.userDeposit.fetch(ud)
      expect(udData.lastWithdrawSlot.toNumber()).toBeGreaterThan(0)
    })

    it("immediate_second_withdrawal_without_proof_fails", async () => {
      const { conn, pool } = await timeLockedPoolFixture()
      const { owner } = await setupGuardedUser(tranaGuard)

      await vault.methods.deposit(new anchor.BN(LAMPORTS_PER_SOL))
        .accounts({ pool, depositor: owner.publicKey }).signers([owner]).rpc()

      const ud      = userDepositPda(pool, owner.publicKey, vault.programId)
      const registry = registryPda(owner.publicKey, tranaGuard.programId)

      const buildIx = () => vault.methods
        .withdraw(new anchor.BN(0.1 * LAMPORTS_PER_SOL))
        .accounts({
          pool,
          userDeposit:       ud,
          owner:             owner.publicKey,
          destination:       owner.publicKey,
          tranaGuardProgram: tranaGuard.programId,
          tranaRegistry:     registry,
          instructions:      anchor.web3.SYSVAR_INSTRUCTIONS_PUBKEY,
        })
        .instruction()

      // First pull (free)
      await sendV0(conn, [await buildIx()], owner.publicKey, [owner])

      // Immediate second pull — cooldown window is ~150 slots ahead → NotBefore → needs proof
      await expect(
        sendV0(conn, [await buildIx()], owner.publicKey, [owner])
      ).rejects.toThrow(/"Custom":6000/)
    })

    it("second_withdrawal_with_valid_proof_succeeds", async () => {
      const { conn, pool } = await timeLockedPoolFixture()
      const { owner, passkey } = await setupGuardedUser(tranaGuard)

      await vault.methods.deposit(new anchor.BN(LAMPORTS_PER_SOL))
        .accounts({ pool, depositor: owner.publicKey }).signers([owner]).rpc()

      const ud      = userDepositPda(pool, owner.publicKey, vault.programId)
      const registry = registryPda(owner.publicKey, tranaGuard.programId)

      const buildIx = () => vault.methods
        .withdraw(new anchor.BN(0.1 * LAMPORTS_PER_SOL))
        .accounts({
          pool,
          userDeposit:       ud,
          owner:             owner.publicKey,
          destination:       owner.publicKey,
          tranaGuardProgram: tranaGuard.programId,
          tranaRegistry:     registry,
          instructions:      anchor.web3.SYSVAR_INSTRUCTIONS_PUBKEY,
        })
        .instruction()

      // First pull (free, no proof)
      await sendV0(conn, [await buildIx()], owner.publicKey, [owner])

      // Read the stored last_withdraw_slot to compute the unlock slot the program will use
      const udData     = await vault.account.userDeposit.fetch(ud)
      const unlockSlot = BigInt(udData.lastWithdrawSlot.toString()) + COOLDOWN_SLOTS

      // Sign the proof with the correct policyId and the slot the program will compute
      const ix2 = await buildIx()
      const proof = buildProofInstructions(
        passkey, ix2, tranaGuard.programId, owner.publicKey, 0n, "trana.not_before",
        "localhost", undefined, undefined, tranaGuard.programId,
      )

      await sendV0(conn, [proof.secp256r1Ix, proof.recordProofIx, ix2], owner.publicKey, [owner])

      const udAfter = await vault.account.userDeposit.fetch(ud)
      expect(udAfter.lastWithdrawSlot.toNumber()).toBeGreaterThan(udData.lastWithdrawSlot.toNumber())
    })
  })
})
