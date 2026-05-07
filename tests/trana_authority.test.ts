import * as anchor from "@coral-xyz/anchor"
import { Keypair, PublicKey, SystemProgram } from "@solana/web3.js"
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

  // ── execute_upgrade (structure test) ────────────────────────────────────────

  describe("execute_upgrade", () => {
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
      // The real execute_upgrade test requires a deployed BPF program + buffer —
      // tested via anchor test integration or the demo script
    })
  })
})
