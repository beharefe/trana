import * as anchor from "@coral-xyz/anchor"
import { Keypair, PublicKey, SystemProgram, TransactionInstruction } from "@solana/web3.js"
import {
  createMint,
  createAccount,
  getAccount,
  getMint,
  setAuthority,
  AuthorityType,
  TOKEN_PROGRAM_ID,
  mintTo as splMintTo,
} from "@solana/spl-token"
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
  SOL,
} from "./helpers/setup"
import { sendV0 } from "./helpers/transactions"
import { buildProofInstructions } from "./helpers/proof"
import { createUpgradeBuffer, BPF_LOADER as _BPF_LOADER, setUpgradeAuthorityIx as _setUpgradeAuthorityIx } from "./helpers/bpf"
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

  // ── register ────────────────────────────────────────────────────────────────

  describe("register", () => {
    it("register_token_mint_authority", async () => {
      const { owner } = await setupGuardedOwner(tranaGuard)
      const target    = Keypair.generate().publicKey
      const pda       = authorityRecordPda(owner.publicKey, target, authority.programId)

      await authority.methods
        .register({ tokenMint: {} })
        .accounts({ owner: owner.publicKey, target })
        .signers([owner])
        .rpc()

      const rec = await authority.account.authorityRecord.fetch(pda)
      expect(rec.owner.toBase58()).toBe(owner.publicKey.toBase58())
      expect(rec.target.toBase58()).toBe(target.toBase58())
      expect(rec.authorityKind).toEqual({ tokenMint: {} })
    })

    it("register_token_freeze_authority", async () => {
      const { owner } = await setupGuardedOwner(tranaGuard)
      const target    = Keypair.generate().publicKey
      const pda       = authorityRecordPda(owner.publicKey, target, authority.programId)

      await authority.methods
        .register({ tokenFreeze: {} })
        .accounts({ owner: owner.publicKey, target })
        .signers([owner])
        .rpc()

      const rec = await authority.account.authorityRecord.fetch(pda)
      expect(rec.authorityKind).toEqual({ tokenFreeze: {} })
    })

    it("register_program_upgrade_authority", async () => {
      const { owner } = await setupGuardedOwner(tranaGuard)
      const target    = Keypair.generate().publicKey

      await authority.methods
        .register({ programUpgrade: {} })
        .accounts({ owner: owner.publicKey, target })
        .signers([owner])
        .rpc()

      const pda = authorityRecordPda(owner.publicKey, target, authority.programId)
      const rec = await authority.account.authorityRecord.fetch(pda)
      expect(rec.authorityKind).toEqual({ programUpgrade: {} })
    })

    it("register_requires_owner_signature", async () => {
      const { owner } = await setupGuardedOwner(tranaGuard)
      const attacker  = Keypair.generate()
      const target    = Keypair.generate().publicKey

      // attacker tries to register a record for owner's account
      await expect(
        authority.methods
          .register({ tokenMint: {} })
          .accounts({ owner: owner.publicKey, target })
          .signers([attacker])
          .rpc()
      ).rejects.toThrow()
    })

    it("register_same_owner_same_mint_token_mint_then_token_freeze_collides", async () => {
      const { owner } = await setupGuardedOwner(tranaGuard)
      const target    = Keypair.generate().publicKey

      await authority.methods
        .register({ tokenMint: {} })
        .accounts({ owner: owner.publicKey, target })
        .signers([owner])
        .rpc()

      // [AUTHORITY_SEED, owner, target] is the same PDA regardless of kind —
      // second init on the same address fails
      await expect(
        authority.methods
          .register({ tokenFreeze: {} })
          .accounts({ owner: owner.publicKey, target })
          .signers([owner])
          .rpc()
      ).rejects.toThrow()
    })

    it("register_duplicate_same_owner_target_fails", async () => {
      const { owner } = await setupGuardedOwner(tranaGuard)
      const target    = Keypair.generate().publicKey

      await authority.methods
        .register({ tokenMint: {} })
        .accounts({ owner: owner.publicKey, target })
        .signers([owner])
        .rpc()

      await expect(
        authority.methods
          .register({ tokenMint: {} })
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
        .register({ tokenMint: {} })
        .accounts({ owner: owner1.publicKey, target })
        .signers([owner1])
        .rpc()
      await authority.methods
        .register({ tokenMint: {} })
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

    it("register_same_owner_same_mint_token_freeze_then_token_mint_collides", async () => {
      const { owner } = await setupGuardedOwner(tranaGuard)
      const target    = Keypair.generate().publicKey

      await authority.methods
        .register({ tokenFreeze: {} })
        .accounts({ owner: owner.publicKey, target })
        .signers([owner])
        .rpc()

      await expect(
        authority.methods
          .register({ tokenMint: {} })
          .accounts({ owner: owner.publicKey, target })
          .signers([owner])
          .rpc()
      ).rejects.toThrow()
    })

    it("register_does_not_require_guard_proof", async () => {
      // register() only needs the wallet sig — no secp256r1/record_proof preamble
      const { owner } = await setupGuardedOwner(tranaGuard)
      const target    = Keypair.generate().publicKey

      // Plain .rpc() (no proof triple) must succeed
      await expect(
        authority.methods
          .register({ tokenMint: {} })
          .accounts({ owner: owner.publicKey, target })
          .signers([owner])
          .rpc()
      ).resolves.toBeDefined()
    })
  })

  // ── execute_mint ─────────────────────────────────────────────────────────────

  describe("execute_mint", () => {
    async function mintFixture() {
      const { owner, passkey } = await setupGuardedOwner(tranaGuard)
      const conn               = tranaGuard.provider.connection
      const payer              = (tranaGuard.provider as anchor.AnchorProvider).wallet as anchor.Wallet
      const payerKp            = (payer as unknown as { payer: Keypair }).payer

      const pda = authorityRecordPda(owner.publicKey, /* placeholder */ owner.publicKey, authority.programId)

      // Create mint with the authority PDA as the mint_authority (will be updated after register)
      // First, register the authority record for a placeholder target
      // We'll use a fresh mint keypair and create the mint after knowing the PDA
      const mintKp = Keypair.generate()
      const mint   = await createMint(
        conn,
        payerKp,
        payer.publicKey,   // temporary mint authority
        null,
        9,
        mintKp,
      )

      // Register the authority PDA for this mint
      await authority.methods
        .register({ tokenMint: {} })
        .accounts({ owner: owner.publicKey, target: mint })
        .signers([owner])
        .rpc()

      const mintPda = authorityRecordPda(owner.publicKey, mint, authority.programId)

      // Transfer mint authority to the PDA
      await setAuthority(conn, payerKp, mint, payerKp, AuthorityType.MintTokens, mintPda)

      // Create a destination token account owned by the payer
      const destination = await createAccount(conn, payerKp, mint, payer.publicKey)

      return { owner, passkey, mint, mintPda, destination }
    }

    it("execute_mint_with_valid_proof", async () => {
      const { owner, passkey, mint, mintPda, destination } = await mintFixture()
      const conn = tranaGuard.provider.connection

      const registry = registryPda(owner.publicKey, tranaGuard.programId)
      const ix = await authority.methods
        .executeMint(new anchor.BN(1_000_000_000))
        .accounts({
          authorityRecord:   mintPda,
          owner:             owner.publicKey,
          mint,
          destination,
          tokenProgram:      TOKEN_PROGRAM_ID,
          tranaGuardProgram: tranaGuard.programId,
          tranaRegistry:     registry,
          instructions:      anchor.web3.SYSVAR_INSTRUCTIONS_PUBKEY,
        })
        .instruction()

      await buildAndSendProof(tranaGuard, ix, owner, passkey)

      const account = await getAccount(conn, destination)
      expect(account.amount.toString()).toBe("1000000000")
    })

    it("execute_mint_missing_proof", async () => {
      const { owner, passkey, mint, mintPda, destination } = await mintFixture()

      const registry = registryPda(owner.publicKey, tranaGuard.programId)
      const ix = await authority.methods
        .executeMint(new anchor.BN(1_000_000_000))
        .accounts({
          authorityRecord:   mintPda,
          owner:             owner.publicKey,
          mint,
          destination,
          tokenProgram:      TOKEN_PROGRAM_ID,
          tranaGuardProgram: tranaGuard.programId,
          tranaRegistry:     registry,
          instructions:      anchor.web3.SYSVAR_INSTRUCTIONS_PUBKEY,
        })
        .instruction()

      await expect(
        sendV0(tranaGuard.provider.connection, [ix], owner.publicKey, [owner])
      ).rejects.toThrow(/"Custom":6000/)
    })

    it("execute_mint_wrong_passkey", async () => {
      const { owner, passkey, mint, mintPda, destination } = await mintFixture()

      const registry    = registryPda(owner.publicKey, tranaGuard.programId)
      const wrongPasskey = generateTestPasskey()
      const ix = await authority.methods
        .executeMint(new anchor.BN(1_000_000_000))
        .accounts({
          authorityRecord:   mintPda,
          owner:             owner.publicKey,
          mint,
          destination,
          tokenProgram:      TOKEN_PROGRAM_ID,
          tranaGuardProgram: tranaGuard.programId,
          tranaRegistry:     registry,
          instructions:      anchor.web3.SYSVAR_INSTRUCTIONS_PUBKEY,
        })
        .instruction()

      const proof = buildProofInstructions(wrongPasskey, ix, tranaGuard.programId, owner.publicKey, 0n, "trana.require", "localhost", undefined, undefined, tranaGuard.programId)
      await expect(
        sendV0(tranaGuard.provider.connection, [proof.secp256r1Ix, proof.recordProofIx, ix], owner.publicKey, [owner])
      ).rejects.toThrow(/"Custom":6003/)
    })

    it("execute_mint_wrong_kind", async () => {
      const { owner, passkey } = await setupGuardedOwner(tranaGuard)
      const conn               = tranaGuard.provider.connection
      const payer              = (tranaGuard.provider as anchor.AnchorProvider).wallet as anchor.Wallet
      const payerKp            = (payer as unknown as { payer: Keypair }).payer

      const mintKp = Keypair.generate()
      const mint   = await createMint(conn, payerKp, payer.publicKey, null, 9, mintKp)

      // Register as FREEZE authority, not MINT
      await authority.methods
        .register({ tokenFreeze: {} })
        .accounts({ owner: owner.publicKey, target: mint })
        .signers([owner])
        .rpc()

      const mintPda     = authorityRecordPda(owner.publicKey, mint, authority.programId)
      const destination = await createAccount(conn, payerKp, mint, payer.publicKey)
      const registry    = registryPda(owner.publicKey, tranaGuard.programId)

      const ix = await authority.methods
        .executeMint(new anchor.BN(1_000))
        .accounts({
          authorityRecord:   mintPda,
          owner:             owner.publicKey,
          mint,
          destination,
          tokenProgram:      TOKEN_PROGRAM_ID,
          tranaGuardProgram: tranaGuard.programId,
          tranaRegistry:     registry,
          instructions:      anchor.web3.SYSVAR_INSTRUCTIONS_PUBKEY,
        })
        .instruction()

      await expect(
        buildAndSendProof(tranaGuard, ix, owner, passkey)
      ).rejects.toThrow(/"Custom":6000/)  // KindMismatch fires before guard (enforce CPI inside)
    })

    it("execute_mint_without_real_mint_authority_transfer_fails", async () => {
      const { owner, passkey } = await setupGuardedOwner(tranaGuard)
      const conn    = tranaGuard.provider.connection
      const payer   = (tranaGuard.provider as anchor.AnchorProvider).wallet as anchor.Wallet
      const payerKp = (payer as unknown as { payer: Keypair }).payer

      const mint = await createMint(conn, payerKp, payer.publicKey, null, 9)

      await authority.methods
        .register({ tokenMint: {} })
        .accounts({ owner: owner.publicKey, target: mint })
        .signers([owner])
        .rpc()

      // Authority NOT transferred to PDA — payer still holds it
      const mintPda     = authorityRecordPda(owner.publicKey, mint, authority.programId)
      const destination = await createAccount(conn, payerKp, mint, payer.publicKey)
      const registry    = registryPda(owner.publicKey, tranaGuard.programId)

      const ix = await authority.methods
        .executeMint(new anchor.BN(1_000))
        .accounts({
          authorityRecord:   mintPda,
          owner:             owner.publicKey,
          mint,
          destination,
          tokenProgram:      TOKEN_PROGRAM_ID,
          tranaGuardProgram: tranaGuard.programId,
          tranaRegistry:     registry,
          instructions:      anchor.web3.SYSVAR_INSTRUCTIONS_PUBKEY,
        })
        .instruction()

      // mint_to CPI fails — PDA is not the mint authority
      await expect(
        buildAndSendProof(tranaGuard, ix, owner, passkey)
      ).rejects.toThrow()
    })

    it("execute_mint_wrong_destination_mint_fails", async () => {
      const { owner, passkey, mint, mintPda } = await mintFixture()
      const conn    = tranaGuard.provider.connection
      const payer   = (tranaGuard.provider as anchor.AnchorProvider).wallet as anchor.Wallet
      const payerKp = (payer as unknown as { payer: Keypair }).payer

      // Destination belongs to a different mint
      const otherMint        = await createMint(conn, payerKp, payer.publicKey, null, 9)
      const wrongDestination = await createAccount(conn, payerKp, otherMint, payer.publicKey)
      const registry         = registryPda(owner.publicKey, tranaGuard.programId)

      const ix = await authority.methods
        .executeMint(new anchor.BN(1_000))
        .accounts({
          authorityRecord:   mintPda,
          owner:             owner.publicKey,
          mint,
          destination:       wrongDestination,
          tokenProgram:      TOKEN_PROGRAM_ID,
          tranaGuardProgram: tranaGuard.programId,
          tranaRegistry:     registry,
          instructions:      anchor.web3.SYSVAR_INSTRUCTIONS_PUBKEY,
        })
        .instruction()

      await expect(
        buildAndSendProof(tranaGuard, ix, owner, passkey)
      ).rejects.toThrow()
    })

    it("execute_mint_wrong_mint_for_record_fails", async () => {
      const { owner, passkey, mint, mintPda } = await mintFixture()
      const conn    = tranaGuard.provider.connection
      const payer   = (tranaGuard.provider as anchor.AnchorProvider).wallet as anchor.Wallet
      const payerKp = (payer as unknown as { payer: Keypair }).payer

      // A second mint not registered in the record
      const otherMint   = await createMint(conn, payerKp, payer.publicKey, null, 9)
      const destination = await createAccount(conn, payerKp, otherMint, payer.publicKey)
      const registry    = registryPda(owner.publicKey, tranaGuard.programId)

      // Pass mintPda (registered for mint) but otherMint as the mint account
      // → seeds check: [AUTHORITY_SEED, owner, otherMint] ≠ mintPda → ConstraintSeeds
      const ix = await authority.methods
        .executeMint(new anchor.BN(1_000))
        .accounts({
          authorityRecord:   mintPda,
          owner:             owner.publicKey,
          mint:              otherMint,
          destination,
          tokenProgram:      TOKEN_PROGRAM_ID,
          tranaGuardProgram: tranaGuard.programId,
          tranaRegistry:     registry,
          instructions:      anchor.web3.SYSVAR_INSTRUCTIONS_PUBKEY,
        })
        .instruction()

      await expect(
        buildAndSendProof(tranaGuard, ix, owner, passkey)
      ).rejects.toThrow()
    })

    it("execute_mint_emits_mint_executed_event", async () => {
      const { owner, passkey, mint, mintPda, destination } = await mintFixture()
      const registry = registryPda(owner.publicKey, tranaGuard.programId)

      const ix = await authority.methods
        .executeMint(new anchor.BN(500_000_000))
        .accounts({
          authorityRecord:   mintPda,
          owner:             owner.publicKey,
          mint,
          destination,
          tokenProgram:      TOKEN_PROGRAM_ID,
          tranaGuardProgram: tranaGuard.programId,
          tranaRegistry:     registry,
          instructions:      anchor.web3.SYSVAR_INSTRUCTIONS_PUBKEY,
        })
        .instruction()

      let capturedEvent: any
      const listenerId = authority.addEventListener("mintExecuted", (e) => { capturedEvent = e })
      try {
        await buildAndSendProof(tranaGuard, ix, owner, passkey)
        await new Promise(r => setTimeout(r, 2_000))
      } finally {
        await authority.removeEventListener(listenerId)
      }

      expect(capturedEvent).toBeDefined()
      expect(capturedEvent.owner.toBase58()).toBe(owner.publicKey.toBase58())
      expect(capturedEvent.mint.toBase58()).toBe(mint.toBase58())
      expect(capturedEvent.amount.toString()).toBe("500000000")
    })

    it("execute_mint_changes_supply_and_destination_balance", async () => {
      const { owner, passkey, mint, mintPda, destination } = await mintFixture()
      const conn     = tranaGuard.provider.connection
      const registry = registryPda(owner.publicKey, tranaGuard.programId)

      const supplyBefore = (await getMint(conn, mint)).supply

      const ix = await authority.methods
        .executeMint(new anchor.BN(2_000_000))
        .accounts({
          authorityRecord:   mintPda,
          owner:             owner.publicKey,
          mint,
          destination,
          tokenProgram:      TOKEN_PROGRAM_ID,
          tranaGuardProgram: tranaGuard.programId,
          tranaRegistry:     registry,
          instructions:      anchor.web3.SYSVAR_INSTRUCTIONS_PUBKEY,
        })
        .instruction()

      await buildAndSendProof(tranaGuard, ix, owner, passkey)

      const supplyAfter = (await getMint(conn, mint)).supply
      const balance     = (await getAccount(conn, destination)).amount
      expect(supplyAfter - supplyBefore).toBe(BigInt(2_000_000))
      expect(balance).toBe(BigInt(2_000_000))
    })
  })

  // ── execute_freeze / execute_thaw ─────────────────────────────────────────

  describe("execute_freeze_thaw", () => {
    async function freezeFixture() {
      const { owner, passkey } = await setupGuardedOwner(tranaGuard)
      const conn               = tranaGuard.provider.connection
      const payer              = (tranaGuard.provider as anchor.AnchorProvider).wallet as anchor.Wallet
      const payerKp            = (payer as unknown as { payer: Keypair }).payer

      const mintKp = Keypair.generate()
      const mint   = await createMint(
        conn, payerKp,
        payer.publicKey,  // mint authority
        payer.publicKey,  // temporary freeze authority
        9, mintKp,
      )

      // Register FREEZE authority PDA
      await authority.methods
        .register({ tokenFreeze: {} })
        .accounts({ owner: owner.publicKey, target: mint })
        .signers([owner])
        .rpc()

      const freezePda = authorityRecordPda(owner.publicKey, mint, authority.programId)

      // Transfer freeze authority to PDA
      await setAuthority(conn, payerKp, mint, payerKp, AuthorityType.FreezeAccount, freezePda)

      // Mint some tokens into a target account (using the mint authority, not PDA)
      const tokenAccount = await createAccount(conn, payerKp, mint, owner.publicKey)
      await splMintTo(conn, payerKp, mint, tokenAccount, payerKp, 1_000_000_000)

      return { owner, passkey, mint, freezePda, tokenAccount }
    }

    it("execute_freeze_with_valid_proof", async () => {
      const { owner, passkey, mint, freezePda, tokenAccount } = await freezeFixture()
      const registry = registryPda(owner.publicKey, tranaGuard.programId)

      const ix = await authority.methods
        .executeFreeze()
        .accounts({
          authorityRecord:   freezePda,
          owner:             owner.publicKey,
          mint,
          tokenAccount,
          tokenProgram:      TOKEN_PROGRAM_ID,
          tranaGuardProgram: tranaGuard.programId,
          tranaRegistry:     registry,
          instructions:      anchor.web3.SYSVAR_INSTRUCTIONS_PUBKEY,
        })
        .instruction()

      await buildAndSendProof(tranaGuard, ix, owner, passkey)

      const account = await getAccount(tranaGuard.provider.connection, tokenAccount)
      expect(account.isFrozen).toBe(true)
    })

    it("execute_thaw_with_valid_proof", async () => {
      const { owner, passkey, mint, freezePda, tokenAccount } = await freezeFixture()
      const conn     = tranaGuard.provider.connection
      const registry = registryPda(owner.publicKey, tranaGuard.programId)

      // Freeze first
      const freezeIx = await authority.methods
        .executeFreeze()
        .accounts({
          authorityRecord:   freezePda,
          owner:             owner.publicKey,
          mint,
          tokenAccount,
          tokenProgram:      TOKEN_PROGRAM_ID,
          tranaGuardProgram: tranaGuard.programId,
          tranaRegistry:     registry,
          instructions:      anchor.web3.SYSVAR_INSTRUCTIONS_PUBKEY,
        })
        .instruction()
      await buildAndSendProof(tranaGuard, freezeIx, owner, passkey, 0n)

      // Now thaw (nonce is 1)
      const thawIx = await authority.methods
        .executeThaw()
        .accounts({
          authorityRecord:   freezePda,
          owner:             owner.publicKey,
          mint,
          tokenAccount,
          tokenProgram:      TOKEN_PROGRAM_ID,
          tranaGuardProgram: tranaGuard.programId,
          tranaRegistry:     registry,
          instructions:      anchor.web3.SYSVAR_INSTRUCTIONS_PUBKEY,
        })
        .instruction()
      await buildAndSendProof(tranaGuard, thawIx, owner, passkey, 1n)

      const account = await getAccount(conn, tokenAccount)
      expect(account.isFrozen).toBe(false)
    })

    it("execute_freeze_without_proof", async () => {
      const { owner, passkey, mint, freezePda, tokenAccount } = await freezeFixture()
      const registry = registryPda(owner.publicKey, tranaGuard.programId)

      const ix = await authority.methods
        .executeFreeze()
        .accounts({
          authorityRecord:   freezePda,
          owner:             owner.publicKey,
          mint,
          tokenAccount,
          tokenProgram:      TOKEN_PROGRAM_ID,
          tranaGuardProgram: tranaGuard.programId,
          tranaRegistry:     registry,
          instructions:      anchor.web3.SYSVAR_INSTRUCTIONS_PUBKEY,
        })
        .instruction()

      await expect(
        sendV0(tranaGuard.provider.connection, [ix], owner.publicKey, [owner])
      ).rejects.toThrow(/"Custom":6000/)
    })

    it("execute_freeze_kind_mismatch_fails", async () => {
      const { owner, passkey } = await setupGuardedOwner(tranaGuard)
      const conn    = tranaGuard.provider.connection
      const payer   = (tranaGuard.provider as anchor.AnchorProvider).wallet as anchor.Wallet
      const payerKp = (payer as unknown as { payer: Keypair }).payer

      // Register as MINT, not FREEZE
      const mint = await createMint(conn, payerKp, payer.publicKey, payer.publicKey, 9)
      await authority.methods
        .register({ tokenMint: {} })
        .accounts({ owner: owner.publicKey, target: mint })
        .signers([owner])
        .rpc()

      const mintPda      = authorityRecordPda(owner.publicKey, mint, authority.programId)
      const tokenAccount = await createAccount(conn, payerKp, mint, owner.publicKey)
      const registry     = registryPda(owner.publicKey, tranaGuard.programId)

      const ix = await authority.methods
        .executeFreeze()
        .accounts({
          authorityRecord:   mintPda,
          owner:             owner.publicKey,
          mint,
          tokenAccount,
          tokenProgram:      TOKEN_PROGRAM_ID,
          tranaGuardProgram: tranaGuard.programId,
          tranaRegistry:     registry,
          instructions:      anchor.web3.SYSVAR_INSTRUCTIONS_PUBKEY,
        })
        .instruction()

      await expect(
        buildAndSendProof(tranaGuard, ix, owner, passkey)
      ).rejects.toThrow(/"Custom":6000/)
    })

    it("execute_freeze_wrong_token_account_mint_fails", async () => {
      const { owner, passkey, mint, freezePda } = await freezeFixture()
      const conn    = tranaGuard.provider.connection
      const payer   = (tranaGuard.provider as anchor.AnchorProvider).wallet as anchor.Wallet
      const payerKp = (payer as unknown as { payer: Keypair }).payer

      // Token account from a different mint
      const otherMint     = await createMint(conn, payerKp, payer.publicKey, payer.publicKey, 9)
      const wrongAccount  = await createAccount(conn, payerKp, otherMint, owner.publicKey)
      const registry      = registryPda(owner.publicKey, tranaGuard.programId)

      const ix = await authority.methods
        .executeFreeze()
        .accounts({
          authorityRecord:   freezePda,
          owner:             owner.publicKey,
          mint,
          tokenAccount:      wrongAccount,
          tokenProgram:      TOKEN_PROGRAM_ID,
          tranaGuardProgram: tranaGuard.programId,
          tranaRegistry:     registry,
          instructions:      anchor.web3.SYSVAR_INSTRUCTIONS_PUBKEY,
        })
        .instruction()

      await expect(
        buildAndSendProof(tranaGuard, ix, owner, passkey)
      ).rejects.toThrow()
    })

    it("execute_freeze_emits_freeze_executed_event", async () => {
      const { owner, passkey, mint, freezePda, tokenAccount } = await freezeFixture()
      const registry = registryPda(owner.publicKey, tranaGuard.programId)

      const ix = await authority.methods
        .executeFreeze()
        .accounts({
          authorityRecord:   freezePda,
          owner:             owner.publicKey,
          mint,
          tokenAccount,
          tokenProgram:      TOKEN_PROGRAM_ID,
          tranaGuardProgram: tranaGuard.programId,
          tranaRegistry:     registry,
          instructions:      anchor.web3.SYSVAR_INSTRUCTIONS_PUBKEY,
        })
        .instruction()

      let capturedEvent: any
      const listenerId = authority.addEventListener("freezeExecuted", (e) => { capturedEvent = e })
      try {
        await buildAndSendProof(tranaGuard, ix, owner, passkey)
        await new Promise(r => setTimeout(r, 2_000))
      } finally {
        await authority.removeEventListener(listenerId)
      }

      expect(capturedEvent).toBeDefined()
      expect(capturedEvent.frozen).toBe(true)
      expect(capturedEvent.mint.toBase58()).toBe(mint.toBase58())
    })

    it("execute_freeze_without_real_freeze_authority_transfer_fails", async () => {
      const { owner, passkey } = await setupGuardedOwner(tranaGuard)
      const conn    = tranaGuard.provider.connection
      const payer   = (tranaGuard.provider as anchor.AnchorProvider).wallet as anchor.Wallet
      const payerKp = (payer as unknown as { payer: Keypair }).payer

      // mint with payer as freeze authority — never transferred to PDA
      const mint = await createMint(conn, payerKp, payer.publicKey, payer.publicKey, 9)
      await authority.methods
        .register({ tokenFreeze: {} })
        .accounts({ owner: owner.publicKey, target: mint })
        .signers([owner])
        .rpc()

      const freezePda    = authorityRecordPda(owner.publicKey, mint, authority.programId)
      const tokenAccount = await createAccount(conn, payerKp, mint, owner.publicKey)
      const registry     = registryPda(owner.publicKey, tranaGuard.programId)

      const ix = await authority.methods
        .executeFreeze()
        .accounts({
          authorityRecord:   freezePda,
          owner:             owner.publicKey,
          mint,
          tokenAccount,
          tokenProgram:      TOKEN_PROGRAM_ID,
          tranaGuardProgram: tranaGuard.programId,
          tranaRegistry:     registry,
          instructions:      anchor.web3.SYSVAR_INSTRUCTIONS_PUBKEY,
        })
        .instruction()

      await expect(
        buildAndSendProof(tranaGuard, ix, owner, passkey)
      ).rejects.toThrow()
    })

    it("direct_freeze_with_old_admin_key_fails_after_transfer", async () => {
      const { owner, passkey, mint, freezePda, tokenAccount } = await freezeFixture()
      const conn    = tranaGuard.provider.connection
      const payer   = (tranaGuard.provider as anchor.AnchorProvider).wallet as anchor.Wallet
      const payerKp = (payer as unknown as { payer: Keypair }).payer

      // freezeFixture already transferred freeze authority to PDA
      // Old key (payerKp) can no longer freeze directly
      await expect(
        anchor.web3.sendAndConfirmTransaction(
          conn,
          new anchor.web3.Transaction().add(
            (await import("@solana/spl-token")).createFreezeAccountInstruction(
              tokenAccount, mint, payer.publicKey, [],
            )
          ),
          [payerKp],
        )
      ).rejects.toThrow()
    })

    it("execute_thaw_kind_mismatch_fails", async () => {
      const { owner, passkey } = await setupGuardedOwner(tranaGuard)
      const conn    = tranaGuard.provider.connection
      const payer   = (tranaGuard.provider as anchor.AnchorProvider).wallet as anchor.Wallet
      const payerKp = (payer as unknown as { payer: Keypair }).payer

      // Register as MINT, not FREEZE — thaw requires FREEZE kind
      const mint = await createMint(conn, payerKp, payer.publicKey, payer.publicKey, 9)
      await authority.methods
        .register({ tokenMint: {} })
        .accounts({ owner: owner.publicKey, target: mint })
        .signers([owner])
        .rpc()

      const mintPda      = authorityRecordPda(owner.publicKey, mint, authority.programId)
      const tokenAccount = await createAccount(conn, payerKp, mint, owner.publicKey)
      const registry     = registryPda(owner.publicKey, tranaGuard.programId)

      const ix = await authority.methods
        .executeThaw()
        .accounts({
          authorityRecord:   mintPda,
          owner:             owner.publicKey,
          mint,
          tokenAccount,
          tokenProgram:      TOKEN_PROGRAM_ID,
          tranaGuardProgram: tranaGuard.programId,
          tranaRegistry:     registry,
          instructions:      anchor.web3.SYSVAR_INSTRUCTIONS_PUBKEY,
        })
        .instruction()

      await expect(
        buildAndSendProof(tranaGuard, ix, owner, passkey)
      ).rejects.toThrow(/"Custom":6000/)
    })

    it("execute_thaw_missing_proof_fails", async () => {
      const { owner, passkey, mint, freezePda, tokenAccount } = await freezeFixture()
      const registry = registryPda(owner.publicKey, tranaGuard.programId)

      // Freeze first with valid proof
      const freezeIx = await authority.methods
        .executeFreeze()
        .accounts({
          authorityRecord:   freezePda,
          owner:             owner.publicKey,
          mint,
          tokenAccount,
          tokenProgram:      TOKEN_PROGRAM_ID,
          tranaGuardProgram: tranaGuard.programId,
          tranaRegistry:     registry,
          instructions:      anchor.web3.SYSVAR_INSTRUCTIONS_PUBKEY,
        })
        .instruction()
      await buildAndSendProof(tranaGuard, freezeIx, owner, passkey, 0n)

      // Thaw without proof → MissingProof
      const thawIx = await authority.methods
        .executeThaw()
        .accounts({
          authorityRecord:   freezePda,
          owner:             owner.publicKey,
          mint,
          tokenAccount,
          tokenProgram:      TOKEN_PROGRAM_ID,
          tranaGuardProgram: tranaGuard.programId,
          tranaRegistry:     registry,
          instructions:      anchor.web3.SYSVAR_INSTRUCTIONS_PUBKEY,
        })
        .instruction()

      await expect(
        sendV0(tranaGuard.provider.connection, [thawIx], owner.publicKey, [owner])
      ).rejects.toThrow(/"Custom":6000/)
    })

    it("execute_thaw_wrong_token_account_mint_fails", async () => {
      const { owner, passkey, mint, freezePda, tokenAccount } = await freezeFixture()
      const conn    = tranaGuard.provider.connection
      const payer   = (tranaGuard.provider as anchor.AnchorProvider).wallet as anchor.Wallet
      const payerKp = (payer as unknown as { payer: Keypair }).payer
      const registry = registryPda(owner.publicKey, tranaGuard.programId)

      // Freeze first
      const freezeIx = await authority.methods
        .executeFreeze()
        .accounts({
          authorityRecord:   freezePda,
          owner:             owner.publicKey,
          mint,
          tokenAccount,
          tokenProgram:      TOKEN_PROGRAM_ID,
          tranaGuardProgram: tranaGuard.programId,
          tranaRegistry:     registry,
          instructions:      anchor.web3.SYSVAR_INSTRUCTIONS_PUBKEY,
        })
        .instruction()
      await buildAndSendProof(tranaGuard, freezeIx, owner, passkey, 0n)

      // Thaw with a token account from a different mint
      const otherMint    = await createMint(conn, payerKp, payer.publicKey, payer.publicKey, 9)
      const wrongAccount = await createAccount(conn, payerKp, otherMint, owner.publicKey)

      const thawIx = await authority.methods
        .executeThaw()
        .accounts({
          authorityRecord:   freezePda,
          owner:             owner.publicKey,
          mint,
          tokenAccount:      wrongAccount,
          tokenProgram:      TOKEN_PROGRAM_ID,
          tranaGuardProgram: tranaGuard.programId,
          tranaRegistry:     registry,
          instructions:      anchor.web3.SYSVAR_INSTRUCTIONS_PUBKEY,
        })
        .instruction()

      await expect(
        buildAndSendProof(tranaGuard, thawIx, owner, passkey, 1n)
      ).rejects.toThrow()
    })

    it("execute_thaw_emits_freeze_executed_event_with_frozen_false", async () => {
      const { owner, passkey, mint, freezePda, tokenAccount } = await freezeFixture()
      const registry = registryPda(owner.publicKey, tranaGuard.programId)

      const freezeIx = await authority.methods
        .executeFreeze()
        .accounts({
          authorityRecord:   freezePda,
          owner:             owner.publicKey,
          mint,
          tokenAccount,
          tokenProgram:      TOKEN_PROGRAM_ID,
          tranaGuardProgram: tranaGuard.programId,
          tranaRegistry:     registry,
          instructions:      anchor.web3.SYSVAR_INSTRUCTIONS_PUBKEY,
        })
        .instruction()
      await buildAndSendProof(tranaGuard, freezeIx, owner, passkey, 0n)

      const thawIx = await authority.methods
        .executeThaw()
        .accounts({
          authorityRecord:   freezePda,
          owner:             owner.publicKey,
          mint,
          tokenAccount,
          tokenProgram:      TOKEN_PROGRAM_ID,
          tranaGuardProgram: tranaGuard.programId,
          tranaRegistry:     registry,
          instructions:      anchor.web3.SYSVAR_INSTRUCTIONS_PUBKEY,
        })
        .instruction()

      let capturedEvent: any
      const listenerId = authority.addEventListener("freezeExecuted", (e) => { capturedEvent = e })
      try {
        await buildAndSendProof(tranaGuard, thawIx, owner, passkey, 1n)
        await new Promise(r => setTimeout(r, 2_000))
      } finally {
        await authority.removeEventListener(listenerId)
      }

      expect(capturedEvent).toBeDefined()
      expect(capturedEvent.frozen).toBe(false)
    })

    it("direct_thaw_with_old_admin_key_fails_after_transfer", async () => {
      const { owner, passkey, mint, freezePda, tokenAccount } = await freezeFixture()
      const conn    = tranaGuard.provider.connection
      const payer   = (tranaGuard.provider as anchor.AnchorProvider).wallet as anchor.Wallet
      const payerKp = (payer as unknown as { payer: Keypair }).payer
      const registry = registryPda(owner.publicKey, tranaGuard.programId)

      // Freeze via PDA
      const freezeIx = await authority.methods
        .executeFreeze()
        .accounts({
          authorityRecord:   freezePda,
          owner:             owner.publicKey,
          mint,
          tokenAccount,
          tokenProgram:      TOKEN_PROGRAM_ID,
          tranaGuardProgram: tranaGuard.programId,
          tranaRegistry:     registry,
          instructions:      anchor.web3.SYSVAR_INSTRUCTIONS_PUBKEY,
        })
        .instruction()
      await buildAndSendProof(tranaGuard, freezeIx, owner, passkey, 0n)

      // Old key can't thaw directly — no longer the freeze authority
      const { createThawAccountInstruction } = await import("@solana/spl-token")
      await expect(
        anchor.web3.sendAndConfirmTransaction(
          conn,
          new anchor.web3.Transaction().add(
            createThawAccountInstruction(tokenAccount, mint, payer.publicKey, [])
          ),
          [payerKp],
        )
      ).rejects.toThrow()
    })
  })

  // ── reclaim_authority ─────────────────────────────────────────────────────

  describe("reclaim_authority", () => {
    it("reclaim_mint_authority_with_valid_proof", async () => {
      const { owner, passkey } = await setupGuardedOwner(tranaGuard)
      const conn               = tranaGuard.provider.connection
      const payer              = (tranaGuard.provider as anchor.AnchorProvider).wallet as anchor.Wallet
      const payerKp            = (payer as unknown as { payer: Keypair }).payer

      const mintKp = Keypair.generate()
      const mint   = await createMint(conn, payerKp, payer.publicKey, null, 9, mintKp)

      await authority.methods
        .register({ tokenMint: {} })
        .accounts({ owner: owner.publicKey, target: mint })
        .signers([owner])
        .rpc()

      const mintPda = authorityRecordPda(owner.publicKey, mint, authority.programId)
      await setAuthority(conn, payerKp, mint, payerKp, AuthorityType.MintTokens, mintPda)

      const newAuthority    = Keypair.generate().publicKey
      const dummyProgramData = Keypair.generate().publicKey
      const registry        = registryPda(owner.publicKey, tranaGuard.programId)

      const ix = await authority.methods
        .reclaimAuthority(newAuthority)
        .accounts({
          authorityRecord:  mintPda,
          owner:            owner.publicKey,
          target:           mint,
          programData:      dummyProgramData,
          newAuthorityInfo: newAuthority,
          bpfLoader:        new PublicKey("BPFLoaderUpgradeab1e11111111111111111111111"),
          tokenProgram:     TOKEN_PROGRAM_ID,
          tranaGuardProgram: tranaGuard.programId,
          tranaRegistry:    registry,
          instructions:     anchor.web3.SYSVAR_INSTRUCTIONS_PUBKEY,
          systemProgram:    SystemProgram.programId,
        })
        .instruction()

      await buildAndSendProof(tranaGuard, ix, owner, passkey)

      // PDA should be closed
      const pdaInfo = await conn.getAccountInfo(mintPda)
      expect(pdaInfo).toBeNull()

      // New mint authority should be set
      const mintInfo = await getMint(conn, mint)
      expect(mintInfo.mintAuthority?.toBase58()).toBe(newAuthority.toBase58())
    })

    it("reclaim_authority_without_proof", async () => {
      const { owner, passkey } = await setupGuardedOwner(tranaGuard)
      const conn               = tranaGuard.provider.connection
      const payer              = (tranaGuard.provider as anchor.AnchorProvider).wallet as anchor.Wallet
      const payerKp            = (payer as unknown as { payer: Keypair }).payer

      const mintKp = Keypair.generate()
      const mint   = await createMint(conn, payerKp, payer.publicKey, null, 9, mintKp)

      await authority.methods
        .register({ tokenMint: {} })
        .accounts({ owner: owner.publicKey, target: mint })
        .signers([owner])
        .rpc()

      const mintPda          = authorityRecordPda(owner.publicKey, mint, authority.programId)
      const newAuthority     = Keypair.generate().publicKey
      const dummyProgramData = Keypair.generate().publicKey
      const registry         = registryPda(owner.publicKey, tranaGuard.programId)

      const ix = await authority.methods
        .reclaimAuthority(newAuthority)
        .accounts({
          authorityRecord:  mintPda,
          owner:            owner.publicKey,
          target:           mint,
          programData:      dummyProgramData,
          newAuthorityInfo: newAuthority,
          bpfLoader:        new PublicKey("BPFLoaderUpgradeab1e11111111111111111111111"),
          tokenProgram:     TOKEN_PROGRAM_ID,
          tranaGuardProgram: tranaGuard.programId,
          tranaRegistry:    registry,
          instructions:     anchor.web3.SYSVAR_INSTRUCTIONS_PUBKEY,
          systemProgram:    SystemProgram.programId,
        })
        .instruction()

      // No proof triple → MissingProof
      await expect(
        sendV0(conn, [ix], owner.publicKey, [owner])
      ).rejects.toThrow(/"Custom":6000/)
    })

    it("reclaim_authority_wrong_passkey", async () => {
      const { owner, passkey } = await setupGuardedOwner(tranaGuard)
      const conn               = tranaGuard.provider.connection
      const payer              = (tranaGuard.provider as anchor.AnchorProvider).wallet as anchor.Wallet
      const payerKp            = (payer as unknown as { payer: Keypair }).payer

      const mintKp = Keypair.generate()
      const mint   = await createMint(conn, payerKp, payer.publicKey, null, 9, mintKp)

      await authority.methods
        .register({ tokenMint: {} })
        .accounts({ owner: owner.publicKey, target: mint })
        .signers([owner])
        .rpc()

      const mintPda          = authorityRecordPda(owner.publicKey, mint, authority.programId)
      const newAuthority     = Keypair.generate().publicKey
      const dummyProgramData = Keypair.generate().publicKey
      const registry         = registryPda(owner.publicKey, tranaGuard.programId)
      const wrongPasskey     = generateTestPasskey()

      const ix = await authority.methods
        .reclaimAuthority(newAuthority)
        .accounts({
          authorityRecord:  mintPda,
          owner:            owner.publicKey,
          target:           mint,
          programData:      dummyProgramData,
          newAuthorityInfo: newAuthority,
          bpfLoader:        new PublicKey("BPFLoaderUpgradeab1e11111111111111111111111"),
          tokenProgram:     TOKEN_PROGRAM_ID,
          tranaGuardProgram: tranaGuard.programId,
          tranaRegistry:    registry,
          instructions:     anchor.web3.SYSVAR_INSTRUCTIONS_PUBKEY,
          systemProgram:    SystemProgram.programId,
        })
        .instruction()

      const proof = buildProofInstructions(wrongPasskey, ix, tranaGuard.programId, owner.publicKey, 0n, "trana.require", "localhost", undefined, undefined, tranaGuard.programId)
      await expect(
        sendV0(conn, [proof.secp256r1Ix, proof.recordProofIx, ix], owner.publicKey, [owner])
      ).rejects.toThrow(/"Custom":6003/)
    })

    it("reclaim_failure_keeps_record_open", async () => {
      const { owner, passkey } = await setupGuardedOwner(tranaGuard)
      const conn    = tranaGuard.provider.connection
      const payer   = (tranaGuard.provider as anchor.AnchorProvider).wallet as anchor.Wallet
      const payerKp = (payer as unknown as { payer: Keypair }).payer

      const mintKp = Keypair.generate()
      const mint   = await createMint(conn, payerKp, payer.publicKey, null, 9, mintKp)

      await authority.methods
        .register({ tokenMint: {} })
        .accounts({ owner: owner.publicKey, target: mint })
        .signers([owner])
        .rpc()

      const mintPda          = authorityRecordPda(owner.publicKey, mint, authority.programId)
      const newAuthority     = Keypair.generate().publicKey
      const dummyProgramData = Keypair.generate().publicKey
      const registry         = registryPda(owner.publicKey, tranaGuard.programId)

      // Intentionally do NOT transfer mint authority to the PDA
      const ix = await authority.methods
        .reclaimAuthority(newAuthority)
        .accounts({
          authorityRecord:   mintPda,
          owner:             owner.publicKey,
          target:            mint,
          programData:       dummyProgramData,
          newAuthorityInfo:  newAuthority,
          bpfLoader:         new PublicKey("BPFLoaderUpgradeab1e11111111111111111111111"),
          tokenProgram:      TOKEN_PROGRAM_ID,
          tranaGuardProgram: tranaGuard.programId,
          tranaRegistry:     registry,
          instructions:      anchor.web3.SYSVAR_INSTRUCTIONS_PUBKEY,
          systemProgram:     SystemProgram.programId,
        })
        .instruction()

      // token::set_authority fails because PDA doesn't hold the mint authority
      await expect(
        buildAndSendProof(tranaGuard, ix, owner, passkey, 0n)
      ).rejects.toThrow()

      // Tx reverted — record still open, authority unchanged
      const rec = await authority.account.authorityRecord.fetch(mintPda)
      expect(rec.owner.toBase58()).toBe(owner.publicKey.toBase58())
      const mintInfo = await getMint(conn, mint)
      expect(mintInfo.mintAuthority?.toBase58()).toBe(payer.publicKey.toBase58())
    })

    it("reclaim_success_closes_record_and_refunds_owner", async () => {
      const { owner, passkey } = await setupGuardedOwner(tranaGuard)
      const conn    = tranaGuard.provider.connection
      const payer   = (tranaGuard.provider as anchor.AnchorProvider).wallet as anchor.Wallet
      const payerKp = (payer as unknown as { payer: Keypair }).payer

      const mint    = await createMint(conn, payerKp, payer.publicKey, null, 9)
      await authority.methods
        .register({ tokenMint: {} })
        .accounts({ owner: owner.publicKey, target: mint })
        .signers([owner])
        .rpc()

      const mintPda          = authorityRecordPda(owner.publicKey, mint, authority.programId)
      await setAuthority(conn, payerKp, mint, payerKp, AuthorityType.MintTokens, mintPda)

      const lamportsBefore   = await conn.getBalance(owner.publicKey)
      const newAuthority     = Keypair.generate().publicKey
      const dummyProgramData = Keypair.generate().publicKey
      const registry         = registryPda(owner.publicKey, tranaGuard.programId)

      const ix = await authority.methods
        .reclaimAuthority(newAuthority)
        .accounts({
          authorityRecord:   mintPda,
          owner:             owner.publicKey,
          target:            mint,
          programData:       dummyProgramData,
          newAuthorityInfo:  newAuthority,
          bpfLoader:         new PublicKey("BPFLoaderUpgradeab1e11111111111111111111111"),
          tokenProgram:      TOKEN_PROGRAM_ID,
          tranaGuardProgram: tranaGuard.programId,
          tranaRegistry:     registry,
          instructions:      anchor.web3.SYSVAR_INSTRUCTIONS_PUBKEY,
          systemProgram:     SystemProgram.programId,
        })
        .instruction()

      await buildAndSendProof(tranaGuard, ix, owner, passkey)

      // PDA closed
      expect(await conn.getAccountInfo(mintPda)).toBeNull()
      // Rent returned to owner (balance increased — minus tx fee, so just verify > before)
      const lamportsAfter = await conn.getBalance(owner.publicKey)
      expect(lamportsAfter).toBeGreaterThan(lamportsBefore)
    })

    it("reclaim_after_close_fails", async () => {
      const { owner, passkey } = await setupGuardedOwner(tranaGuard)
      const conn    = tranaGuard.provider.connection
      const payer   = (tranaGuard.provider as anchor.AnchorProvider).wallet as anchor.Wallet
      const payerKp = (payer as unknown as { payer: Keypair }).payer

      const mint    = await createMint(conn, payerKp, payer.publicKey, null, 9)
      await authority.methods
        .register({ tokenMint: {} })
        .accounts({ owner: owner.publicKey, target: mint })
        .signers([owner])
        .rpc()

      const mintPda          = authorityRecordPda(owner.publicKey, mint, authority.programId)
      await setAuthority(conn, payerKp, mint, payerKp, AuthorityType.MintTokens, mintPda)

      const newAuthority     = Keypair.generate().publicKey
      const dummyProgramData = Keypair.generate().publicKey
      const registry         = registryPda(owner.publicKey, tranaGuard.programId)

      const buildIx = () => authority.methods
        .reclaimAuthority(newAuthority)
        .accounts({
          authorityRecord:   mintPda,
          owner:             owner.publicKey,
          target:            mint,
          programData:       dummyProgramData,
          newAuthorityInfo:  newAuthority,
          bpfLoader:         new PublicKey("BPFLoaderUpgradeab1e11111111111111111111111"),
          tokenProgram:      TOKEN_PROGRAM_ID,
          tranaGuardProgram: tranaGuard.programId,
          tranaRegistry:     registry,
          instructions:      anchor.web3.SYSVAR_INSTRUCTIONS_PUBKEY,
          systemProgram:     SystemProgram.programId,
        })
        .instruction()

      // First reclaim succeeds
      await buildAndSendProof(tranaGuard, await buildIx(), owner, passkey, 0n)
      // Second reclaim fails — account is closed
      await expect(
        buildAndSendProof(tranaGuard, await buildIx(), owner, passkey, 1n)
      ).rejects.toThrow()
    })

    it("reclaim_freeze_authority_success_sets_new_freeze_authority", async () => {
      const { owner, passkey } = await setupGuardedOwner(tranaGuard)
      const conn    = tranaGuard.provider.connection
      const payer   = (tranaGuard.provider as anchor.AnchorProvider).wallet as anchor.Wallet
      const payerKp = (payer as unknown as { payer: Keypair }).payer

      const mint    = await createMint(conn, payerKp, payer.publicKey, payer.publicKey, 9)
      await authority.methods
        .register({ tokenFreeze: {} })
        .accounts({ owner: owner.publicKey, target: mint })
        .signers([owner])
        .rpc()

      const freezePda        = authorityRecordPda(owner.publicKey, mint, authority.programId)
      await setAuthority(conn, payerKp, mint, payerKp, AuthorityType.FreezeAccount, freezePda)

      const newAuthority     = Keypair.generate().publicKey
      const dummyProgramData = Keypair.generate().publicKey
      const registry         = registryPda(owner.publicKey, tranaGuard.programId)

      const ix = await authority.methods
        .reclaimAuthority(newAuthority)
        .accounts({
          authorityRecord:   freezePda,
          owner:             owner.publicKey,
          target:            mint,
          programData:       dummyProgramData,
          newAuthorityInfo:  newAuthority,
          bpfLoader:         new PublicKey("BPFLoaderUpgradeab1e11111111111111111111111"),
          tokenProgram:      TOKEN_PROGRAM_ID,
          tranaGuardProgram: tranaGuard.programId,
          tranaRegistry:     registry,
          instructions:      anchor.web3.SYSVAR_INSTRUCTIONS_PUBKEY,
          systemProgram:     SystemProgram.programId,
        })
        .instruction()

      await buildAndSendProof(tranaGuard, ix, owner, passkey)

      const mintInfo = await getMint(conn, mint)
      expect(mintInfo.freezeAuthority?.toBase58()).toBe(newAuthority.toBase58())
      expect(await conn.getAccountInfo(freezePda)).toBeNull()
    })

    it("reclaim_token_kind_with_non_mint_target_fails", async () => {
      const { owner, passkey } = await setupGuardedOwner(tranaGuard)
      const conn    = tranaGuard.provider.connection
      const payer   = (tranaGuard.provider as anchor.AnchorProvider).wallet as anchor.Wallet
      const payerKp = (payer as unknown as { payer: Keypair }).payer

      // target is not a real mint — just a random keypair pubkey
      const fakeTarget = Keypair.generate().publicKey
      await authority.methods
        .register({ tokenMint: {} })
        .accounts({ owner: owner.publicKey, target: fakeTarget })
        .signers([owner])
        .rpc()

      const fakePda          = authorityRecordPda(owner.publicKey, fakeTarget, authority.programId)
      const newAuthority     = Keypair.generate().publicKey
      const dummyProgramData = Keypair.generate().publicKey
      const registry         = registryPda(owner.publicKey, tranaGuard.programId)

      const ix = await authority.methods
        .reclaimAuthority(newAuthority)
        .accounts({
          authorityRecord:   fakePda,
          owner:             owner.publicKey,
          target:            fakeTarget,
          programData:       dummyProgramData,
          newAuthorityInfo:  newAuthority,
          bpfLoader:         new PublicKey("BPFLoaderUpgradeab1e11111111111111111111111"),
          tokenProgram:      TOKEN_PROGRAM_ID,
          tranaGuardProgram: tranaGuard.programId,
          tranaRegistry:     registry,
          instructions:      anchor.web3.SYSVAR_INSTRUCTIONS_PUBKEY,
          systemProgram:     SystemProgram.programId,
        })
        .instruction()

      // set_authority CPI fails — target is not a mint
      await expect(
        buildAndSendProof(tranaGuard, ix, owner, passkey)
      ).rejects.toThrow()
    })

    it.todo("reclaim_program_upgrade_with_non_program_target_fails")
    it.todo("reclaim_program_upgrade_with_wrong_program_data_fails")
    it.todo("reclaim_program_upgrade_new_authority_arg_and_account_mismatch_fails")
  })

  // ── isolation ────────────────────────────────────────────────────────────────

  describe("isolation", () => {
    it("cannot_use_others_authority_record", async () => {
      const conn   = tranaGuard.provider.connection
      const payer  = (tranaGuard.provider as anchor.AnchorProvider).wallet as anchor.Wallet
      const payerKp = (payer as unknown as { payer: Keypair }).payer

      const { owner: owner1, passkey: passkey1 } = await setupGuardedOwner(tranaGuard)
      const { owner: owner2, passkey: passkey2 } = await setupGuardedOwner(tranaGuard)

      const mintKp = Keypair.generate()
      const mint   = await createMint(conn, payerKp, payer.publicKey, null, 9, mintKp)

      // owner1 registers and gets PDA
      await authority.methods
        .register({ tokenMint: {} })
        .accounts({ owner: owner1.publicKey, target: mint })
        .signers([owner1])
        .rpc()

      const mintPda1     = authorityRecordPda(owner1.publicKey, mint, authority.programId)
      await setAuthority(conn, payerKp, mint, payerKp, AuthorityType.MintTokens, mintPda1)

      const destination  = await createAccount(conn, payerKp, mint, payer.publicKey)
      const registry2    = registryPda(owner2.publicKey, tranaGuard.programId)

      // owner2 tries to use owner1's authority record with owner2's signer
      const ix = await authority.methods
        .executeMint(new anchor.BN(1_000_000))
        .accounts({
          authorityRecord:   mintPda1,
          owner:             owner2.publicKey,
          mint,
          destination,
          tokenProgram:      TOKEN_PROGRAM_ID,
          tranaGuardProgram: tranaGuard.programId,
          tranaRegistry:     registry2,
          instructions:      anchor.web3.SYSVAR_INSTRUCTIONS_PUBKEY,
        })
        .instruction()

      // Anchor constraint check will fail: authority_record.owner != owner2.public_key
      await expect(
        buildAndSendProof(tranaGuard, ix, owner2, passkey2)
      ).rejects.toThrow()
    })

    it("nonce_replay_blocked_across_execute_calls", async () => {
      const conn    = tranaGuard.provider.connection
      const payer   = (tranaGuard.provider as anchor.AnchorProvider).wallet as anchor.Wallet
      const payerKp = (payer as unknown as { payer: Keypair }).payer

      const { owner, passkey } = await setupGuardedOwner(tranaGuard)
      const mintKp             = Keypair.generate()
      const mint               = await createMint(conn, payerKp, payer.publicKey, null, 9, mintKp)

      await authority.methods
        .register({ tokenMint: {} })
        .accounts({ owner: owner.publicKey, target: mint })
        .signers([owner])
        .rpc()

      const mintPda     = authorityRecordPda(owner.publicKey, mint, authority.programId)
      await setAuthority(conn, payerKp, mint, payerKp, AuthorityType.MintTokens, mintPda)

      const destination = await createAccount(conn, payerKp, mint, payer.publicKey)
      const registry    = registryPda(owner.publicKey, tranaGuard.programId)

      const ix = await authority.methods
        .executeMint(new anchor.BN(1_000))
        .accounts({
          authorityRecord:   mintPda,
          owner:             owner.publicKey,
          mint,
          destination,
          tokenProgram:      TOKEN_PROGRAM_ID,
          tranaGuardProgram: tranaGuard.programId,
          tranaRegistry:     registry,
          instructions:      anchor.web3.SYSVAR_INSTRUCTIONS_PUBKEY,
        })
        .instruction()

      // First call with nonce=0 succeeds
      await buildAndSendProof(tranaGuard, ix, owner, passkey, 0n)

      // Replay with same nonce=0 proof fails
      await expect(
        buildAndSendProof(tranaGuard, ix, owner, passkey, 0n)
      ).rejects.toThrow(/"Custom":6002/)
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

    // Full fixture: registers PDA for trana_test_vault and transfers upgrade
    // authority from payer → PDA. Returns a cleanup function that restores
    // the authority back to payer so subsequent tests start from a clean state.
    async function upgradeFixture() {
      const conn    = tranaGuard.provider.connection
      const payer   = (tranaGuard.provider as anchor.AnchorProvider).wallet as anchor.Wallet
      const payerKp = (payer as unknown as { payer: Keypair }).payer

      const { owner, passkey } = await setupGuardedOwner(tranaGuard)
      const testVault   = anchor.workspace.TranaTestVault as anchor.Program<TranaTestVault>
      const programId   = testVault.programId
      const programData = await getProgramData(conn, programId)

      await authority.methods
        .register({ programUpgrade: {} })
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
            authorityRecord:   upgradePda,
            owner:             owner.publicKey,
            target:            programId,
            programData,
            newAuthorityInfo:  payerKp.publicKey,
            bpfLoader:         BPF_LOADER,
            tokenProgram:      TOKEN_PROGRAM_ID,
            tranaGuardProgram: tranaGuard.programId,
            tranaRegistry:     registry,
            instructions:      anchor.web3.SYSVAR_INSTRUCTIONS_PUBKEY,
            systemProgram:     SystemProgram.programId,
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
        .register({ programUpgrade: {} })
        .accounts({ owner: owner.publicKey, target: fakeProgram })
        .signers([owner])
        .rpc()

      const pda = authorityRecordPda(owner.publicKey, fakeProgram, authority.programId)
      const rec = await authority.account.authorityRecord.fetch(pda)
      expect(rec.owner.toBase58()).toBe(owner.publicKey.toBase58())
      expect(rec.target.toBase58()).toBe(fakeProgram.toBase58())
      expect(rec.authorityKind).toEqual({ programUpgrade: {} })
    })

    it("execute_upgrade_kind_mismatch_fails", async () => {
      // Register as TokenMint — calling execute_upgrade should fire KindMismatch
      // before reaching enforce or the BPF CPI.
      const { owner, passkey } = await setupGuardedOwner(tranaGuard)
      const conn    = tranaGuard.provider.connection
      const testVault = anchor.workspace.TranaTestVault as anchor.Program<TranaTestVault>
      const programId = testVault.programId
      const programData = await getProgramData(conn, programId)

      await authority.methods
        .register({ tokenMint: {} })
        .accounts({ owner: owner.publicKey, target: programId })
        .signers([owner])
        .rpc()

      const mintPda  = authorityRecordPda(owner.publicKey, programId, authority.programId)
      const registry = registryPda(owner.publicKey, tranaGuard.programId)
      const dummy    = Keypair.generate().publicKey

      const ix = await authority.methods
        .executeUpgrade()
        .accounts({
          authorityRecord:   mintPda,
          owner:             owner.publicKey,
          program:           programId,
          programData,
          buffer:            dummy,
          spill:             dummy,
          rent:              anchor.web3.SYSVAR_RENT_PUBKEY,
          clock:             anchor.web3.SYSVAR_CLOCK_PUBKEY,
          bpfLoader:         BPF_LOADER,
          tranaGuardProgram: tranaGuard.programId,
          tranaRegistry:     registry,
          instructions:      anchor.web3.SYSVAR_INSTRUCTIONS_PUBKEY,
        })
        .instruction()

      await expect(
        buildAndSendProof(tranaGuard, ix, owner, passkey)
      ).rejects.toThrow(/"Custom":6000/)
    })

    it("execute_upgrade_missing_proof_fails", async () => {
      // KindMismatch passes (ProgramUpgrade), then enforce fires → MissingProof.
      // Buffer/spill are never reached so dummies are fine.
      const { owner } = await setupGuardedOwner(tranaGuard)
      const conn     = tranaGuard.provider.connection
      const testVault = anchor.workspace.TranaTestVault as anchor.Program<TranaTestVault>
      const programId  = testVault.programId
      const programData = await getProgramData(conn, programId)

      await authority.methods
        .register({ programUpgrade: {} })
        .accounts({ owner: owner.publicKey, target: programId })
        .signers([owner])
        .rpc()

      const pda      = authorityRecordPda(owner.publicKey, programId, authority.programId)
      const registry = registryPda(owner.publicKey, tranaGuard.programId)
      const dummy    = Keypair.generate().publicKey

      const ix = await authority.methods
        .executeUpgrade()
        .accounts({
          authorityRecord:   pda,
          owner:             owner.publicKey,
          program:           programId,
          programData,
          buffer:            dummy,
          spill:             dummy,
          rent:              anchor.web3.SYSVAR_RENT_PUBKEY,
          clock:             anchor.web3.SYSVAR_CLOCK_PUBKEY,
          bpfLoader:         BPF_LOADER,
          tranaGuardProgram: tranaGuard.programId,
          tranaRegistry:     registry,
          instructions:      anchor.web3.SYSVAR_INSTRUCTIONS_PUBKEY,
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
      const { conn, payerKp, owner, passkey, programId, programData, upgradePda, registry } =
        await upgradeFixture()
      // Reclaim back to payer (keeps state clean for other tests)
      const ix = await authority.methods
        .reclaimAuthority(payerKp.publicKey)
        .accounts({
          authorityRecord:   upgradePda,
          owner:             owner.publicKey,
          target:            programId,
          programData,
          newAuthorityInfo:  payerKp.publicKey,
          bpfLoader:         BPF_LOADER,
          tokenProgram:      TOKEN_PROGRAM_ID,
          tranaGuardProgram: tranaGuard.programId,
          tranaRegistry:     registry,
          instructions:      anchor.web3.SYSVAR_INSTRUCTIONS_PUBKEY,
          systemProgram:     SystemProgram.programId,
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
      const { conn, payerKp, owner, programId, programData, upgradePda, registry, restore } =
        await upgradeFixture()
      try {
        const ix = await authority.methods
          .reclaimAuthority(payerKp.publicKey)
          .accounts({
            authorityRecord:   upgradePda,
            owner:             owner.publicKey,
            target:            programId,
            programData,
            newAuthorityInfo:  payerKp.publicKey,
            bpfLoader:         BPF_LOADER,
            tokenProgram:      TOKEN_PROGRAM_ID,
            tranaGuardProgram: tranaGuard.programId,
            tranaRegistry:     registry,
            instructions:      anchor.web3.SYSVAR_INSTRUCTIONS_PUBKEY,
            systemProgram:     SystemProgram.programId,
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
      const { conn, payerKp, owner, programId, programData, upgradePda, registry, restore } =
        await upgradeFixture()
      try {
        const wrongPasskey = generateTestPasskey()
        const ix = await authority.methods
          .reclaimAuthority(payerKp.publicKey)
          .accounts({
            authorityRecord:   upgradePda,
            owner:             owner.publicKey,
            target:            programId,
            programData,
            newAuthorityInfo:  payerKp.publicKey,
            bpfLoader:         BPF_LOADER,
            tokenProgram:      TOKEN_PROGRAM_ID,
            tranaGuardProgram: tranaGuard.programId,
            tranaRegistry:     registry,
            instructions:      anchor.web3.SYSVAR_INSTRUCTIONS_PUBKEY,
            systemProgram:     SystemProgram.programId,
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
        .register({ programUpgrade: {} })
        .accounts({ owner: owner.publicKey, target: programId })
        .signers([owner])
        .rpc()

      const pda      = authorityRecordPda(owner.publicKey, programId, authority.programId)
      const registry = registryPda(owner.publicKey, tranaGuard.programId)

      const ix = await authority.methods
        .reclaimAuthority(payerKp.publicKey)
        .accounts({
          authorityRecord:   pda,
          owner:             owner.publicKey,
          target:            programId,
          programData,
          newAuthorityInfo:  payerKp.publicKey,
          bpfLoader:         BPF_LOADER,
          tokenProgram:      TOKEN_PROGRAM_ID,
          tranaGuardProgram: tranaGuard.programId,
          tranaRegistry:     registry,
          instructions:      anchor.web3.SYSVAR_INSTRUCTIONS_PUBKEY,
          systemProgram:     SystemProgram.programId,
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
      const { conn, payerKp, owner, passkey, programId, programData, upgradePda, registry } =
        await upgradeFixture()

      const reclaimIx = await authority.methods
        .reclaimAuthority(payerKp.publicKey)
        .accounts({
          authorityRecord:   upgradePda,
          owner:             owner.publicKey,
          target:            programId,
          programData,
          newAuthorityInfo:  payerKp.publicKey,
          bpfLoader:         BPF_LOADER,
          tokenProgram:      TOKEN_PROGRAM_ID,
          tranaGuardProgram: tranaGuard.programId,
          tranaRegistry:     registry,
          instructions:      anchor.web3.SYSVAR_INSTRUCTIONS_PUBKEY,
          systemProgram:     SystemProgram.programId,
        })
        .instruction()
      await buildAndSendProof(tranaGuard, reclaimIx, owner, passkey)

      // PDA closed — execute_upgrade with it now fails
      const dummy = Keypair.generate().publicKey
      const upgradeIx = await authority.methods
        .executeUpgrade()
        .accounts({
          authorityRecord:   upgradePda,
          owner:             owner.publicKey,
          program:           programId,
          programData,
          buffer:            dummy,
          spill:             dummy,
          rent:              anchor.web3.SYSVAR_RENT_PUBKEY,
          clock:             anchor.web3.SYSVAR_CLOCK_PUBKEY,
          bpfLoader:         BPF_LOADER,
          tranaGuardProgram: tranaGuard.programId,
          tranaRegistry:     registry,
          instructions:      anchor.web3.SYSVAR_INSTRUCTIONS_PUBKEY,
        })
        .instruction()

      await expect(
        buildAndSendProof(tranaGuard, upgradeIx, owner, passkey, 1n)
      ).rejects.toThrow()
    })

    it("execute_upgrade_success_after_transferring_upgrade_authority_to_pda", async () => {
      // Uses trana_test_vault's own .so — upgrading to the same binary is valid
      // for testing the mechanism. The CLI handles the ~290 write transactions.
      const soPath = path.join(__dirname, "../../target/deploy/trana_test_vault.so")

      const { conn, payerKp, owner, passkey, programId, programData, upgradePda, registry,
              advanceRestoreNonce, restore } = await upgradeFixture()
      try {
        const buffer = createUpgradeBuffer(soPath, upgradePda)
        const spill  = payerKp.publicKey  // receives buffer rent refund

        const ix = await authority.methods
          .executeUpgrade()
          .accounts({
            authorityRecord:   upgradePda,
            owner:             owner.publicKey,
            program:           programId,
            programData,
            buffer,
            spill,
            rent:              anchor.web3.SYSVAR_RENT_PUBKEY,
            clock:             anchor.web3.SYSVAR_CLOCK_PUBKEY,
            bpfLoader:         BPF_LOADER,
            tranaGuardProgram: tranaGuard.programId,
            tranaRegistry:     registry,
            instructions:      anchor.web3.SYSVAR_INSTRUCTIONS_PUBKEY,
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
      // Register PDA as ProgramUpgrade but do NOT transfer upgrade authority.
      // Prove passes, BPF Loader rejects because PDA is not the current authority.
      const { owner, passkey } = await setupGuardedOwner(tranaGuard)
      const conn    = tranaGuard.provider.connection
      const testVault   = anchor.workspace.TranaTestVault as anchor.Program<TranaTestVault>
      const programId   = testVault.programId
      const programData = await getProgramData(conn, programId)

      await authority.methods
        .register({ programUpgrade: {} })
        .accounts({ owner: owner.publicKey, target: programId })
        .signers([owner])
        .rpc()

      const pda      = authorityRecordPda(owner.publicKey, programId, authority.programId)
      const registry = registryPda(owner.publicKey, tranaGuard.programId)
      const dummy    = Keypair.generate().publicKey

      const ix = await authority.methods
        .executeUpgrade()
        .accounts({
          authorityRecord:   pda,
          owner:             owner.publicKey,
          program:           programId,
          programData,
          buffer:            dummy,
          spill:             dummy,
          rent:              anchor.web3.SYSVAR_RENT_PUBKEY,
          clock:             anchor.web3.SYSVAR_CLOCK_PUBKEY,
          bpfLoader:         BPF_LOADER,
          tranaGuardProgram: tranaGuard.programId,
          tranaRegistry:     registry,
          instructions:      anchor.web3.SYSVAR_INSTRUCTIONS_PUBKEY,
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

  // ── Token authority handoff ──────────────────────────────────────────────────

  describe("token_authority_handoff", () => {
    it("direct_mint_with_old_admin_key_fails_after_transfer", async () => {
      const { owner } = await setupGuardedOwner(tranaGuard)
      const conn      = tranaGuard.provider.connection
      const payer     = (tranaGuard.provider as anchor.AnchorProvider).wallet as anchor.Wallet
      const payerKp   = (payer as unknown as { payer: Keypair }).payer

      const mintKp = Keypair.generate()
      const mint   = await createMint(conn, payerKp, payer.publicKey, null, 9, mintKp)

      await authority.methods
        .register({ tokenMint: {} })
        .accounts({ owner: owner.publicKey, target: mint })
        .signers([owner])
        .rpc()

      const mintPda    = authorityRecordPda(owner.publicKey, mint, authority.programId)
      await setAuthority(conn, payerKp, mint, payerKp, AuthorityType.MintTokens, mintPda)

      const destination = await createAccount(conn, payerKp, mint, payer.publicKey)

      // Old admin (payerKp) can no longer mint directly — authority now lives in the PDA
      await expect(
        splMintTo(conn, payerKp, mint, destination, payerKp, 1_000)
      ).rejects.toThrow()
    })

    it("pda_mint_fails_after_reclaim", async () => {
      const { owner, passkey } = await setupGuardedOwner(tranaGuard)
      const conn      = tranaGuard.provider.connection
      const payer     = (tranaGuard.provider as anchor.AnchorProvider).wallet as anchor.Wallet
      const payerKp   = (payer as unknown as { payer: Keypair }).payer

      const mintKp = Keypair.generate()
      const mint   = await createMint(conn, payerKp, payer.publicKey, null, 9, mintKp)

      await authority.methods
        .register({ tokenMint: {} })
        .accounts({ owner: owner.publicKey, target: mint })
        .signers([owner])
        .rpc()

      const mintPda     = authorityRecordPda(owner.publicKey, mint, authority.programId)
      await setAuthority(conn, payerKp, mint, payerKp, AuthorityType.MintTokens, mintPda)
      const destination = await createAccount(conn, payerKp, mint, payer.publicKey)

      // Reclaim → PDA closed, authority moved to newAuthority
      const newAuthority     = Keypair.generate().publicKey
      const dummyProgramData = Keypair.generate().publicKey
      const registry         = registryPda(owner.publicKey, tranaGuard.programId)

      const reclaimIx = await authority.methods
        .reclaimAuthority(newAuthority)
        .accounts({
          authorityRecord:   mintPda,
          owner:             owner.publicKey,
          target:            mint,
          programData:       dummyProgramData,
          newAuthorityInfo:  newAuthority,
          bpfLoader:         new PublicKey("BPFLoaderUpgradeab1e11111111111111111111111"),
          tokenProgram:      TOKEN_PROGRAM_ID,
          tranaGuardProgram: tranaGuard.programId,
          tranaRegistry:     registry,
          instructions:      anchor.web3.SYSVAR_INSTRUCTIONS_PUBKEY,
          systemProgram:     SystemProgram.programId,
        })
        .instruction()
      await buildAndSendProof(tranaGuard, reclaimIx, owner, passkey, 0n)

      // AuthorityRecord is closed; execute_mint with that PDA now fails
      const mintIx = await authority.methods
        .executeMint(new anchor.BN(1_000))
        .accounts({
          authorityRecord:   mintPda,
          owner:             owner.publicKey,
          mint,
          destination,
          tokenProgram:      TOKEN_PROGRAM_ID,
          tranaGuardProgram: tranaGuard.programId,
          tranaRegistry:     registry,
          instructions:      anchor.web3.SYSVAR_INSTRUCTIONS_PUBKEY,
        })
        .instruction()

      await expect(
        buildAndSendProof(tranaGuard, mintIx, owner, passkey, 1n)
      ).rejects.toThrow()
    })

    it("direct_mint_with_new_authority_succeeds_after_reclaim", async () => {
      const { owner, passkey } = await setupGuardedOwner(tranaGuard)
      const conn    = tranaGuard.provider.connection
      const payer   = (tranaGuard.provider as anchor.AnchorProvider).wallet as anchor.Wallet
      const payerKp = (payer as unknown as { payer: Keypair }).payer

      const mint    = await createMint(conn, payerKp, payer.publicKey, null, 9)
      await authority.methods
        .register({ tokenMint: {} })
        .accounts({ owner: owner.publicKey, target: mint })
        .signers([owner])
        .rpc()

      const mintPda     = authorityRecordPda(owner.publicKey, mint, authority.programId)
      await setAuthority(conn, payerKp, mint, payerKp, AuthorityType.MintTokens, mintPda)
      const destination = await createAccount(conn, payerKp, mint, payer.publicKey)

      // Reclaim to newAuthorityKp
      const newAuthorityKp   = Keypair.generate()
      const dummyProgramData = Keypair.generate().publicKey
      const registry         = registryPda(owner.publicKey, tranaGuard.programId)
      await (async () => {
        // fund newAuthorityKp so it can sign
        const { airdrop } = await import("./helpers/transactions")
        await airdrop(conn, newAuthorityKp.publicKey, 1 * anchor.web3.LAMPORTS_PER_SOL)
      })()

      const reclaimIx = await authority.methods
        .reclaimAuthority(newAuthorityKp.publicKey)
        .accounts({
          authorityRecord:   mintPda,
          owner:             owner.publicKey,
          target:            mint,
          programData:       dummyProgramData,
          newAuthorityInfo:  newAuthorityKp.publicKey,
          bpfLoader:         new PublicKey("BPFLoaderUpgradeab1e11111111111111111111111"),
          tokenProgram:      TOKEN_PROGRAM_ID,
          tranaGuardProgram: tranaGuard.programId,
          tranaRegistry:     registry,
          instructions:      anchor.web3.SYSVAR_INSTRUCTIONS_PUBKEY,
          systemProgram:     SystemProgram.programId,
        })
        .instruction()
      await buildAndSendProof(tranaGuard, reclaimIx, owner, passkey, 0n)

      // New authority can now mint directly — no PDA, no passkey
      await splMintTo(conn, newAuthorityKp, mint, destination, newAuthorityKp, 5_000)
      const balance = (await getAccount(conn, destination)).amount
      expect(balance).toBe(BigInt(5_000))
    })
  })

  // ── Account validation ───────────────────────────────────────────────────────

  describe("account_validation", () => {
    it("execute_with_wrong_authority_record_pda_fails", async () => {
      // Pass a PDA derived from a different owner → seeds check fails
      const { owner: owner1, passkey } = await setupGuardedOwner(tranaGuard)
      const { owner: owner2 }          = await setupGuardedOwner(tranaGuard)
      const conn    = tranaGuard.provider.connection
      const payer   = (tranaGuard.provider as anchor.AnchorProvider).wallet as anchor.Wallet
      const payerKp = (payer as unknown as { payer: Keypair }).payer

      const mint = await createMint(conn, payerKp, payer.publicKey, null, 9)
      await authority.methods
        .register({ tokenMint: {} })
        .accounts({ owner: owner1.publicKey, target: mint })
        .signers([owner1])
        .rpc()

      // PDA that belongs to owner1 but we're signing as owner1 with owner2's PDA in accounts
      const wrongPda    = authorityRecordPda(owner2.publicKey, mint, authority.programId)
      const destination = await createAccount(conn, payerKp, mint, payer.publicKey)
      const registry    = registryPda(owner1.publicKey, tranaGuard.programId)

      const ix = await authority.methods
        .executeMint(new anchor.BN(1_000))
        .accounts({
          authorityRecord:   wrongPda,
          owner:             owner1.publicKey,
          mint,
          destination,
          tokenProgram:      TOKEN_PROGRAM_ID,
          tranaGuardProgram: tranaGuard.programId,
          tranaRegistry:     registry,
          instructions:      anchor.web3.SYSVAR_INSTRUCTIONS_PUBKEY,
        })
        .instruction()

      await expect(
        buildAndSendProof(tranaGuard, ix, owner1, passkey)
      ).rejects.toThrow()
    })

    it("execute_with_wrong_owner_for_record_fails", async () => {
      const { owner: owner1, passkey: passkey1 } = await setupGuardedOwner(tranaGuard)
      const { owner: owner2, passkey: passkey2 } = await setupGuardedOwner(tranaGuard)
      const conn    = tranaGuard.provider.connection
      const payer   = (tranaGuard.provider as anchor.AnchorProvider).wallet as anchor.Wallet
      const payerKp = (payer as unknown as { payer: Keypair }).payer

      const mint = await createMint(conn, payerKp, payer.publicKey, null, 9)
      await authority.methods
        .register({ tokenMint: {} })
        .accounts({ owner: owner1.publicKey, target: mint })
        .signers([owner1])
        .rpc()

      const mintPda1    = authorityRecordPda(owner1.publicKey, mint, authority.programId)
      const destination = await createAccount(conn, payerKp, mint, payer.publicKey)
      // owner2's registry — will fail because seeds compute a different PDA for owner2
      const registry2   = registryPda(owner2.publicKey, tranaGuard.programId)

      const ix = await authority.methods
        .executeMint(new anchor.BN(1_000))
        .accounts({
          authorityRecord:   mintPda1,
          owner:             owner2.publicKey,
          mint,
          destination,
          tokenProgram:      TOKEN_PROGRAM_ID,
          tranaGuardProgram: tranaGuard.programId,
          tranaRegistry:     registry2,
          instructions:      anchor.web3.SYSVAR_INSTRUCTIONS_PUBKEY,
        })
        .instruction()

      await expect(
        buildAndSendProof(tranaGuard, ix, owner2, passkey2)
      ).rejects.toThrow()
    })

    it("execute_with_wrong_target_for_record_fails", async () => {
      const { owner, passkey } = await setupGuardedOwner(tranaGuard)
      const conn    = tranaGuard.provider.connection
      const payer   = (tranaGuard.provider as anchor.AnchorProvider).wallet as anchor.Wallet
      const payerKp = (payer as unknown as { payer: Keypair }).payer

      const mint1 = await createMint(conn, payerKp, payer.publicKey, null, 9)
      const mint2 = await createMint(conn, payerKp, payer.publicKey, null, 9)
      await authority.methods
        .register({ tokenMint: {} })
        .accounts({ owner: owner.publicKey, target: mint1 })
        .signers([owner])
        .rpc()

      const mintPda1    = authorityRecordPda(owner.publicKey, mint1, authority.programId)
      const destination = await createAccount(conn, payerKp, mint2, payer.publicKey)
      const registry    = registryPda(owner.publicKey, tranaGuard.programId)

      // Pass mintPda1 but mint2 as the mint — seeds check fails
      const ix = await authority.methods
        .executeMint(new anchor.BN(1_000))
        .accounts({
          authorityRecord:   mintPda1,
          owner:             owner.publicKey,
          mint:              mint2,
          destination,
          tokenProgram:      TOKEN_PROGRAM_ID,
          tranaGuardProgram: tranaGuard.programId,
          tranaRegistry:     registry,
          instructions:      anchor.web3.SYSVAR_INSTRUCTIONS_PUBKEY,
        })
        .instruction()

      await expect(
        buildAndSendProof(tranaGuard, ix, owner, passkey)
      ).rejects.toThrow()
    })

    it("execute_with_wrong_trana_registry_pda_fails", async () => {
      const { owner, passkey } = await setupGuardedOwner(tranaGuard)
      const conn    = tranaGuard.provider.connection
      const payer   = (tranaGuard.provider as anchor.AnchorProvider).wallet as anchor.Wallet
      const payerKp = (payer as unknown as { payer: Keypair }).payer

      const mint = await createMint(conn, payerKp, payer.publicKey, null, 9)
      await authority.methods
        .register({ tokenMint: {} })
        .accounts({ owner: owner.publicKey, target: mint })
        .signers([owner])
        .rpc()

      const mintPda     = authorityRecordPda(owner.publicKey, mint, authority.programId)
      await setAuthority(conn, payerKp, mint, payerKp, AuthorityType.MintTokens, mintPda)
      const destination = await createAccount(conn, payerKp, mint, payer.publicKey)

      // Use a random pubkey as registry — Anchor seeds check will reject it
      const fakeRegistry = Keypair.generate().publicKey

      const ix = await authority.methods
        .executeMint(new anchor.BN(1_000))
        .accounts({
          authorityRecord:   mintPda,
          owner:             owner.publicKey,
          mint,
          destination,
          tokenProgram:      TOKEN_PROGRAM_ID,
          tranaGuardProgram: tranaGuard.programId,
          tranaRegistry:     fakeRegistry,
          instructions:      anchor.web3.SYSVAR_INSTRUCTIONS_PUBKEY,
        })
        .instruction()

      await expect(
        buildAndSendProof(tranaGuard, ix, owner, passkey)
      ).rejects.toThrow()
    })

    it.todo("execute_with_wrong_authority_record_bump_fails")
    it.todo("execute_with_wrong_instructions_sysvar_fails")
    it.todo("execute_upgrade_with_wrong_bpf_loader_account_fails")
    it.todo("reclaim_program_upgrade_with_non_program_target_fails")
    it.todo("reclaim_program_upgrade_with_wrong_program_data_fails")
    it.todo("reclaim_program_upgrade_new_authority_arg_and_account_mismatch_fails")
  })

  // ── Guard integration ────────────────────────────────────────────────────────

  describe("guard_integration", () => {
    // Shared fixture: mint with PDA as authority, ready to call executeMint
    async function guardFixture() {
      const { owner, passkey } = await setupGuardedOwner(tranaGuard)
      const conn    = tranaGuard.provider.connection
      const payer   = (tranaGuard.provider as anchor.AnchorProvider).wallet as anchor.Wallet
      const payerKp = (payer as unknown as { payer: Keypair }).payer

      const mint = await createMint(conn, payerKp, payer.publicKey, null, 9)
      await authority.methods
        .register({ tokenMint: {} })
        .accounts({ owner: owner.publicKey, target: mint })
        .signers([owner])
        .rpc()

      const mintPda     = authorityRecordPda(owner.publicKey, mint, authority.programId)
      await setAuthority(conn, payerKp, mint, payerKp, AuthorityType.MintTokens, mintPda)
      const destination = await createAccount(conn, payerKp, mint, payer.publicKey)
      const registry    = registryPda(owner.publicKey, tranaGuard.programId)

      const buildMintIx = (nonce = 0n) =>
        authority.methods
          .executeMint(new anchor.BN(1_000))
          .accounts({
            authorityRecord:   mintPda,
            owner:             owner.publicKey,
            mint,
            destination,
            tokenProgram:      TOKEN_PROGRAM_ID,
            tranaGuardProgram: tranaGuard.programId,
            tranaRegistry:     registry,
            instructions:      anchor.web3.SYSVAR_INSTRUCTIONS_PUBKEY,
          })
          .instruction()

      return { owner, passkey, mint, mintPda, destination, registry, buildMintIx }
    }

    it("execute_any_missing_record_proof_ix_fails", async () => {
      const { owner, passkey, buildMintIx } = await guardFixture()
      const ix    = await buildMintIx()
      const proof = buildProofInstructions(
        passkey, ix, tranaGuard.programId, owner.publicKey, 0n, "trana.require",
        "localhost", undefined, undefined, tranaGuard.programId,
      )
      // secp256r1 only — no record_proof → enforce can't find the proof data
      await expect(
        sendV0(tranaGuard.provider.connection, [proof.secp256r1Ix, ix], owner.publicKey, [owner])
      ).rejects.toThrow(/"Custom":6000/)
    })

    it("execute_any_wrong_instruction_order_fails", async () => {
      const { owner, passkey, buildMintIx } = await guardFixture()
      const ix    = await buildMintIx()
      const proof = buildProofInstructions(
        passkey, ix, tranaGuard.programId, owner.publicKey, 0n, "trana.require",
        "localhost", undefined, undefined, tranaGuard.programId,
      )
      // Swapped: record_proof before secp256r1 — enforce tries to deserialize
      // ix[N-1]=secp256r1 as a record_proof discriminator → InvalidProof (6005)
      await expect(
        sendV0(tranaGuard.provider.connection, [proof.recordProofIx, proof.secp256r1Ix, ix], owner.publicKey, [owner])
      ).rejects.toThrow(/"Custom":6005/)
    })

    it("execute_any_wrong_owner_registry_pair_fails", async () => {
      const { owner: owner1, passkey: passkey1, buildMintIx } = await guardFixture()
      const { owner: owner2, passkey: passkey2 } = await setupGuardedOwner(tranaGuard)
      const ix = await buildMintIx()
      // Build intent correctly for owner1, but sign with passkey2 (owner2's key).
      // enforce: hash matches owner1's intent ✓, but secp256r1 pubkey ≠ owner1's
      // registered passkey1 → WrongSigner (6003).
      const proof = buildProofInstructions(
        passkey2, ix, tranaGuard.programId, owner1.publicKey, 0n, "trana.require",
        "localhost", undefined, undefined, tranaGuard.programId,
      )
      await expect(
        sendV0(tranaGuard.provider.connection, [proof.secp256r1Ix, proof.recordProofIx, ix], owner1.publicKey, [owner1])
      ).rejects.toThrow(/"Custom":6003/)
    })

    it("execute_any_expired_proof_fails", async () => {
      const { owner, passkey, buildMintIx } = await guardFixture()
      const ix = await buildMintIx()
      // Unix epoch + 1 — guaranteed past on any running validator regardless of
      // how far its clock lags behind JS Date.now()
      const expiredAt = 1
      const proof = buildProofInstructions(
        passkey, ix, tranaGuard.programId, owner.publicKey, 0n, "trana.require",
        "localhost", undefined, expiredAt, tranaGuard.programId,
      )
      await expect(
        sendV0(tranaGuard.provider.connection, [proof.secp256r1Ix, proof.recordProofIx, ix], owner.publicKey, [owner])
      ).rejects.toThrow(/"Custom":6001/)
    })

    it("execute_any_replayed_proof_fails", async () => {
      const { owner, passkey, buildMintIx } = await guardFixture()

      await buildAndSendProof(tranaGuard, await buildMintIx(), owner, passkey, 0n)

      await expect(
        buildAndSendProof(tranaGuard, await buildMintIx(), owner, passkey, 0n)
      ).rejects.toThrow(/"Custom":6002/)
    })

    it("execute_any_proof_bound_to_different_target_fails", async () => {
      const { owner, passkey, buildMintIx } = await guardFixture()
      // Build fixture for a second mint
      const { buildMintIx: buildMintIx2 } = await guardFixture()

      const ix1 = await buildMintIx()
      const ix2 = await buildMintIx2()

      // Sign for ix2 but submit against ix1 — intent hash won't match
      const proof = buildProofInstructions(
        passkey, ix2, tranaGuard.programId, owner.publicKey, 0n, "trana.require",
        "localhost", undefined, undefined, tranaGuard.programId,
      )
      await expect(
        sendV0(tranaGuard.provider.connection, [proof.secp256r1Ix, proof.recordProofIx, ix1], owner.publicKey, [owner])
      ).rejects.toThrow(/"Custom":6002/)
    })

    it("execute_any_proof_bound_to_different_amount_or_accounts_fails", async () => {
      const { owner, passkey, mint, mintPda, destination, registry } = await guardFixture()

      // Sign proof for amount 1_000
      const ix1000 = await authority.methods
        .executeMint(new anchor.BN(1_000))
        .accounts({
          authorityRecord:   mintPda,
          owner:             owner.publicKey,
          mint,
          destination,
          tokenProgram:      TOKEN_PROGRAM_ID,
          tranaGuardProgram: tranaGuard.programId,
          tranaRegistry:     registry,
          instructions:      anchor.web3.SYSVAR_INSTRUCTIONS_PUBKEY,
        })
        .instruction()

      // Build ix for amount 9_999 (different params → different hash)
      const ix9999 = await authority.methods
        .executeMint(new anchor.BN(9_999))
        .accounts({
          authorityRecord:   mintPda,
          owner:             owner.publicKey,
          mint,
          destination,
          tokenProgram:      TOKEN_PROGRAM_ID,
          tranaGuardProgram: tranaGuard.programId,
          tranaRegistry:     registry,
          instructions:      anchor.web3.SYSVAR_INSTRUCTIONS_PUBKEY,
        })
        .instruction()

      const proof = buildProofInstructions(
        passkey, ix1000, tranaGuard.programId, owner.publicKey, 0n, "trana.require",
        "localhost", undefined, undefined, tranaGuard.programId,
      )
      // Submit proof for 1_000 but protected ix is for 9_999
      await expect(
        sendV0(tranaGuard.provider.connection, [proof.secp256r1Ix, proof.recordProofIx, ix9999], owner.publicKey, [owner])
      ).rejects.toThrow(/"Custom":6002/)
    })

    it.todo("mint_route_compute_budget_regression")
    it.todo("upgrade_route_compute_budget_regression")
  })
})
