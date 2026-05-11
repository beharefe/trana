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

// deposit() — pool is a PDA with seeds that reference pool.authority (a field
// read from the pool account data). Anchor v1 types incorrectly mark it as
// auto-resolvable via `never`, but the resolver can't derive it without an
// on-chain fetch. Pass it explicitly with `as any`.
function depositAccounts(pool: PublicKey, depositor: PublicKey): any {
  return { pool, depositor }
}

// withdraw() — pool, userDeposit, and tranaRegistry must be passed explicitly;
// Anchor can't auto-resolve UncheckedAccount or seeds that depend on runtime data.
function withdrawAccounts(
  pool:          PublicKey,
  userDeposit:   PublicKey,
  owner:         PublicKey,
  destination:   PublicKey,
  tranaRegistry: PublicKey,
): any {
  return { pool, userDeposit, owner, destination, tranaRegistry }
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
        .accounts(depositAccounts(pool, stranger.publicKey))
        .signers([stranger])
        .rpc()

      const after = await conn.getBalance(pool)
      expect(after - before).toBe(0.5 * LAMPORTS_PER_SOL)
    })

    it("small_withdrawal_needs_no_proof", async () => {
      const { conn, pool } = await limitPoolFixture()
      const { owner } = await setupGuardedUser(tranaGuard)

      await vault.methods
        .deposit(new anchor.BN(2 * LAMPORTS_PER_SOL))
        .accounts(depositAccounts(pool, owner.publicKey))
        .signers([owner])
        .rpc()

      const ud = userDepositPda(pool, owner.publicKey, vault.programId)

      // 0.1 SOL < 1 SOL limit — no proof triple in the tx
      const ix = await vault.methods
        .withdraw(new anchor.BN(0.1 * LAMPORTS_PER_SOL))
        .accounts(withdrawAccounts(pool, ud, owner.publicKey, owner.publicKey, registryPda(owner.publicKey, tranaGuard.programId)))
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
        .accounts(depositAccounts(pool, owner.publicKey))
        .signers([owner])
        .rpc()

      const ud = userDepositPda(pool, owner.publicKey, vault.programId)

      const ix = await vault.methods
        .withdraw(new anchor.BN(1.5 * LAMPORTS_PER_SOL))
        .accounts(withdrawAccounts(pool, ud, owner.publicKey, owner.publicKey, registryPda(owner.publicKey, tranaGuard.programId)))
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
        .accounts(depositAccounts(pool, owner.publicKey))
        .signers([owner])
        .rpc()

      const ud = userDepositPda(pool, owner.publicKey, vault.programId)

      const ix = await vault.methods
        .withdraw(new anchor.BN(LAMPORTS_PER_SOL))
        .accounts(withdrawAccounts(pool, ud, owner.publicKey, owner.publicKey, registryPda(owner.publicKey, tranaGuard.programId)))
        .instruction()

      const proof = await buildWithdrawProof(tranaGuard, ix, owner, passkey, 0n, "trana.limit")
      await sendV0(conn, [proof.secp256r1Ix, proof.recordProofIx, ix], owner.publicKey, [owner])

      const udData = await vault.account.userDeposit.fetch(ud)
      expect(udData.balance.toNumber()).toBe(LAMPORTS_PER_SOL)
    })

    it("consecutive_withdrawal_requires_not_before_passkey", async () => {
      const { conn, pool } = await limitPoolFixture()
      const { owner, passkey } = await setupGuardedUser(tranaGuard)

      await vault.methods
        .deposit(new anchor.BN(3 * LAMPORTS_PER_SOL))
        .accounts(depositAccounts(pool, owner.publicKey))
        .signers([owner])
        .rpc()

      const ud = userDepositPda(pool, owner.publicKey, vault.programId)

      const buildIx = (amount: number) => vault.methods
        .withdraw(new anchor.BN(amount))
        .accounts(withdrawAccounts(pool, ud, owner.publicKey, owner.publicKey, registryPda(owner.publicKey, tranaGuard.programId)))
        .instruction()

      // First pull (0.1 SOL, under limit) — free
      const ix1 = await buildIx(0.1 * LAMPORTS_PER_SOL)
      await sendV0(conn, [ix1], owner.publicKey, [owner])

      // Second pull within DRAIN_WINDOW — consecutive → NotBefore required, regardless of amount
      const ix2 = await buildIx(0.1 * LAMPORTS_PER_SOL)
      await expect(
        sendV0(conn, [ix2], owner.publicKey, [owner])
      ).rejects.toThrow(/"Custom":6000/)

      // Same pull with a valid passkey (NotBefore policy) succeeds
      const proof = await buildWithdrawProof(tranaGuard, ix2, owner, passkey, 0n, "trana.not_before")
      await sendV0(conn, [proof.secp256r1Ix, proof.recordProofIx, ix2], owner.publicKey, [owner])
    })

    it("drain_window_is_per_user_not_global", async () => {
      const { conn, pool } = await limitPoolFixture()
      const { owner: alice } = await setupGuardedUser(tranaGuard)
      const { owner: bob }   = await setupGuardedUser(tranaGuard)

      await vault.methods.deposit(new anchor.BN(2 * LAMPORTS_PER_SOL))
        .accounts(depositAccounts(pool, alice.publicKey)).signers([alice]).rpc()
      await vault.methods.deposit(new anchor.BN(2 * LAMPORTS_PER_SOL))
        .accounts(depositAccounts(pool, bob.publicKey)).signers([bob]).rpc()

      const aliceUd = userDepositPda(pool, alice.publicKey, vault.programId)
      const bobUd   = userDepositPda(pool, bob.publicKey, vault.programId)

      // Alice makes her first free pull — this opens her drain window
      const aliceIx1 = await vault.methods.withdraw(new anchor.BN(0.4 * LAMPORTS_PER_SOL))
        .accounts(withdrawAccounts(pool, aliceUd, alice.publicKey, alice.publicKey, registryPda(alice.publicKey, tranaGuard.programId)))
        .instruction()
      await sendV0(conn, [aliceIx1], alice.publicKey, [alice])

      // Alice's second pull within the window now requires NotBefore (consecutive)
      const aliceIx2 = await vault.methods.withdraw(new anchor.BN(0.4 * LAMPORTS_PER_SOL))
        .accounts(withdrawAccounts(pool, aliceUd, alice.publicKey, alice.publicKey, registryPda(alice.publicKey, tranaGuard.programId)))
        .instruction()
      await expect(sendV0(conn, [aliceIx2], alice.publicKey, [alice])).rejects.toThrow(/"Custom":6000/)

      // Bob's window is completely independent — his first pull is still free
      const bobIx = await vault.methods.withdraw(new anchor.BN(0.4 * LAMPORTS_PER_SOL))
        .accounts(withdrawAccounts(pool, bobUd, bob.publicKey, bob.publicKey, registryPda(bob.publicKey, tranaGuard.programId)))
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
        .accounts(depositAccounts(pool, owner.publicKey)).signers([owner]).rpc()

      const ud = userDepositPda(pool, owner.publicKey, vault.programId)

      const ix = await vault.methods
        .withdraw(new anchor.BN(0.1 * LAMPORTS_PER_SOL))
        .accounts(withdrawAccounts(pool, ud, owner.publicKey, owner.publicKey, registryPda(owner.publicKey, tranaGuard.programId)))
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
        .accounts(depositAccounts(pool, owner.publicKey)).signers([owner]).rpc()

      const ud = userDepositPda(pool, owner.publicKey, vault.programId)

      const buildIx = () => vault.methods
        .withdraw(new anchor.BN(0.1 * LAMPORTS_PER_SOL))
        .accounts(withdrawAccounts(pool, ud, owner.publicKey, owner.publicKey, registryPda(owner.publicKey, tranaGuard.programId)))
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
        .accounts(depositAccounts(pool, owner.publicKey)).signers([owner]).rpc()

      const ud = userDepositPda(pool, owner.publicKey, vault.programId)

      const buildIx = () => vault.methods
        .withdraw(new anchor.BN(0.1 * LAMPORTS_PER_SOL))
        .accounts(withdrawAccounts(pool, ud, owner.publicKey, owner.publicKey, registryPda(owner.publicKey, tranaGuard.programId)))
        .instruction()

      // First pull (free, no proof)
      await sendV0(conn, [await buildIx()], owner.publicKey, [owner])

      // Read the stored last_withdraw_slot to compute the unlock slot the program will use
      const udData = await vault.account.userDeposit.fetch(ud)

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
