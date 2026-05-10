// Copyright 2026 Trana, Inc.
// SPDX-License-Identifier: Apache-2.0

/**
 * TranaAuthorityClient — typed client for the `trana_authority` program.
 *
 * Usage pattern:
 *
 *   const client = new TranaAuthorityClient({ connection, cluster: "devnet" })
 *
 *   // Step 1 — Register (no passkey, just wallet)
 *   const registerIx = await client.register({ owner: walletPubkey, target: programId })
 *   // Include registerIx in a signed transaction.
 *   // Then transfer upgrade authority to the PDA:
 *   //   solana program set-upgrade-authority <PROG> --new-upgrade-authority <PDA>
 *
 *   // Step 2 — Upgrade (passkey required)
 *   const upgradeIx = await client.executeUpgrade({ owner, program, programData, buffer, spill })
 *   // Prepend proof pair from TranaGuardClient.buildProof():
 *   //   tx = [secp256r1Ix, recordProofIx, upgradeIx]
 *
 *   // Step 3 — Reclaim (passkey required)
 *   const reclaimIx = await client.reclaimAuthority({ owner, target, programData, newAuthority })
 *   // Prepend proof pair from TranaGuardClient.buildProof():
 *   //   tx = [secp256r1Ix, recordProofIx, reclaimIx]
 */

import * as anchor from "@coral-xyz/anchor"
import { Connection, PublicKey, Keypair, TransactionInstruction } from "@solana/web3.js"
import type { TranaAuthority } from "./idl"
import { IDL } from "./idl"

import { TranaCluster, PROGRAM_IDS } from "../core/types"

// ── Client options ────────────────────────────────────────────────────────────

export type TranaAuthorityClientOptions = {
  /** A `Connection` instance. Create with `createConnection(cluster)` or bring your own. */
  connection: Connection
  /**
   * Override the program ID. Defaults to the well-known ID for the given cluster.
   * Required when running a local deployment with a non-standard key.
   */
  programId?: PublicKey
  /** Defaults to `"devnet"`. */
  cluster?: TranaCluster
}

// ── Return types ──────────────────────────────────────────────────────────────

export type { TranaAuthority }

export type AuthorityRecordAccount = anchor.IdlAccounts<TranaAuthority>["authorityRecord"]

// ── Client ────────────────────────────────────────────────────────────────────

export class TranaAuthorityClient {
  readonly programId: PublicKey
  readonly cluster:   TranaCluster

  private readonly program: anchor.Program<TranaAuthority>

  constructor(options: TranaAuthorityClientOptions) {
    this.cluster   = options.cluster ?? "devnet"
    this.programId = options.programId ?? resolvedProgramId(this.cluster)

    const provider = new anchor.AnchorProvider(
      options.connection,
      dummyWallet(),
      { commitment: "confirmed", skipPreflight: false },
    )
    this.program = new anchor.Program<TranaAuthority>(IDL, provider)
  }

  // ── PDA derivation ──────────────────────────────────────────────────────────

  /**
   * Derive the `AuthorityRecord` PDA for an (owner, target) pair.
   * Seeds: `[b"trana-authority", owner, target]`.
   *
   * After `register()`, transfer the program's upgrade authority to this address:
   *   `solana program set-upgrade-authority <target> --new-upgrade-authority <PDA>`
   */
  recordPda(owner: PublicKey, target: PublicKey): PublicKey {
    const [pda] = PublicKey.findProgramAddressSync(
      [Buffer.from("trana-authority"), owner.toBuffer(), target.toBuffer()],
      this.programId,
    )
    return pda
  }

  // ── Account reads ───────────────────────────────────────────────────────────

  /** Fetch an authority record. Returns `null` if not yet registered. */
  async fetchRecord(owner: PublicKey, target: PublicKey): Promise<AuthorityRecordAccount | null> {
    try {
      return await this.program.account.authorityRecord.fetch(this.recordPda(owner, target))
    } catch {
      return null
    }
  }

  // ── Instructions ────────────────────────────────────────────────────────────

  /**
   * Build the `register` instruction.
   *
   * No passkey required — only the owner's wallet signature.
   * After including this in a signed transaction, transfer the program's
   * upgrade authority to `recordPda(owner, target)`.
   */
  async register(args: {
    owner:  PublicKey
    target: PublicKey
    payer?: PublicKey
  }): Promise<TransactionInstruction> {
    const { owner, target } = args
    return this.program.methods
      .register()
      .accounts({ owner, target })
      .instruction()
  }

  /**
   * Build the `execute_upgrade` instruction.
   *
   * **Passkey proof required** — prepend `[secp256r1Ix, recordProofIx]` to the transaction.
   * The PDA must already be the program's upgrade authority (set after `register()`).
   *
   * Transaction layout:
   *   [secp256r1Ix, recordProofIx, upgradeIx]
   */
  async executeUpgrade(args: {
    owner:       PublicKey
    /** The program to upgrade. */
    program:     PublicKey
    /** The `programData` account (executable data account). */
    programData: PublicKey
    /** The buffer account holding the new program bytecode. */
    buffer:      PublicKey
    /** Account that receives the buffer's lamports after upgrade. */
    spill:       PublicKey
  }): Promise<TransactionInstruction> {
    const { owner, program, programData, buffer, spill } = args
    return this.program.methods
      .executeUpgrade()
      .accounts({ owner, program, programData, buffer, spill })
      .instruction()
  }

  /**
   * Build the `reclaim_authority` instruction.
   *
   * **Passkey proof required** — prepend `[secp256r1Ix, recordProofIx]` to the transaction.
   * Closes the `AuthorityRecord` PDA and returns rent to the owner.
   * Transfers upgrade authority to `newAuthority`.
   *
   * Transaction layout:
   *   [secp256r1Ix, recordProofIx, reclaimIx]
   */
  async reclaimAuthority(args: {
    owner:            PublicKey
    /** The program being protected (was registered as `target`). */
    target:           PublicKey
    /** The `programData` account. */
    programData:      PublicKey
    /** The pubkey to receive upgrade authority after reclaim. */
    newAuthority:     PublicKey
  }): Promise<TransactionInstruction> {
    const { owner, target, programData, newAuthority } = args
    return this.program.methods
      .reclaimAuthority(newAuthority)
      .accounts({ owner, target, programData, newAuthorityInfo: newAuthority })
      .instruction()
  }
}

// ── Module-level helpers ──────────────────────────────────────────────────────

function resolvedProgramId(cluster: TranaCluster): PublicKey {
  const id = PROGRAM_IDS.authority[cluster as keyof typeof PROGRAM_IDS.authority]
  if (!id) throw new Error(`trana_authority not yet deployed on ${cluster}`)
  return id
}

function dummyWallet(): anchor.Wallet {
  const kp = Keypair.generate()
  return {
    publicKey:           kp.publicKey,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    signTransaction:     async (tx: any)    => tx,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    signAllTransactions: async (txs: any[]) => txs,
    payer:               kp,
  } as unknown as anchor.Wallet
}
