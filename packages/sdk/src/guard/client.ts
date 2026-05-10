// Copyright 2026 Trana, Inc.
// SPDX-License-Identifier: Apache-2.0

/**
 * TranaGuardClient — typed client for the `trana_guard` program.
 *
 * Usage pattern (bring your own connection):
 *
 *   const client = new TranaGuardClient({ connection, cluster: "devnet" })
 *
 *   // Register first passkey (browser only — triggers native passkey UI)
 *   const { instruction, handle } = await client.registerPasskey({
 *     owner:           walletPubkey,
 *     rpId:            window.location.hostname,
 *     userDisplayName: walletPubkey.toBase58().slice(0, 8) + "…",
 *   })
 *
 *   // Add a second passkey (requires proof from an existing key)
 *   const { instruction, handle } = await client.addPasskey({
 *     owner:        walletPubkey,
 *     credentialId: existingHandle.credentialId,
 *     rpId:         window.location.hostname,
 *     userDisplayName: "MacBook",
 *   })
 *
 *   // Remove a passkey by credential ID
 *   const instruction = await client.removePasskey({
 *     owner:                   walletPubkey,
 *     credentialIdToRemove:    lostHandle.credentialId,
 *     authorizingCredentialId: existingHandle.credentialId,
 *     rpId:                    window.location.hostname,
 *   })
 *
 *   // Build proof + protected instruction triple
 *   const { secp256r1Ix, recordProofIx } = await client.buildProof({
 *     protectedIx: withdrawIx,
 *     owner:       walletPubkey,
 *     credentialId: handle.credentialId,
 *     policy:      Policy.Require(),
 *     rpId:        window.location.hostname,
 *   })
 */

import * as anchor from "@coral-xyz/anchor"
import { Connection, PublicKey, Keypair, TransactionInstruction } from "@solana/web3.js"
import type { TranaGuard } from "./idl"
import { IDL } from "./idl"

import { TranaCluster, PROGRAM_IDS, PasskeyHandle, Policy, policyId } from "../core/types"
import { buildIntent, hashIntent, intentFromInstruction }              from "../core/intent"
import { buildSecp256r1Ix, buildWebAuthnMessage, buildRecordProofIx }  from "../core/secp256r1"
import { registerPasskey as nativeRegister, signIntent }               from "../core/webauthn"

// ── Client options ────────────────────────────────────────────────────────────

export type TranaGuardClientOptions = {
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

export type { TranaGuard }

export type PasskeyEntryAccount = {
  keyKind:      unknown
  pubkeyBytes:  number[]
  credentialId: number[]
}

export type PasskeyRegistryAccount = anchor.IdlAccounts<TranaGuard>["passkeyRegistry"]
export type TranaConfigAccount     = anchor.IdlAccounts<TranaGuard>["tranaConfig"]

export type RegisterPasskeyResult = {
  /** `register_passkey` instruction — include in your transaction. */
  instruction: TransactionInstruction
  /** Store this — required for every future `buildProof()` or `addPasskey()` call. */
  handle: PasskeyHandle
}

export type AddPasskeyResult = {
  /** `add_passkey` instruction — include in a proof-bearing transaction. */
  instruction: TransactionInstruction
  /** Store this — the new credential handle. */
  handle: PasskeyHandle
}

export type BuildProofResult = {
  /**
   * ix[N-2] — secp256r1 precompile verify instruction.
   * Must appear exactly two positions before the protected instruction.
   */
  secp256r1Ix:   TransactionInstruction
  /**
   * ix[N-1] — `trana_guard::record_proof` data carrier.
   * Must appear exactly one position before the protected instruction.
   */
  recordProofIx: TransactionInstruction
}

// ── Client ────────────────────────────────────────────────────────────────────

export class TranaGuardClient {
  readonly programId: PublicKey
  readonly cluster:   TranaCluster

  private readonly program: anchor.Program<TranaGuard>

  constructor(options: TranaGuardClientOptions) {
    this.cluster   = options.cluster ?? "devnet"
    this.programId = options.programId ?? resolvedProgramId(this.cluster)

    const provider = new anchor.AnchorProvider(
      options.connection,
      dummyWallet(),
      { commitment: "confirmed", skipPreflight: false },
    )
    this.program = new anchor.Program<TranaGuard>(IDL, provider)
  }

  // ── PDA derivation ──────────────────────────────────────────────────────────

  /** Derive the `PasskeyRegistry` PDA for a wallet. Seeds: `[b"passkey", owner]`. */
  registryPda(owner: PublicKey): PublicKey {
    const [pda] = PublicKey.findProgramAddressSync(
      [Buffer.from("passkey"), owner.toBuffer()],
      this.programId,
    )
    return pda
  }

  /** Derive the global `TranaConfig` PDA. Seeds: `[b"config"]`. */
  configPda(): PublicKey {
    const [pda] = PublicKey.findProgramAddressSync(
      [Buffer.from("config")],
      this.programId,
    )
    return pda
  }

  // ── Account reads ───────────────────────────────────────────────────────────

  /** Fetch the passkey registry for an owner. Returns `null` if not yet registered. */
  async fetchRegistry(owner: PublicKey): Promise<PasskeyRegistryAccount | null> {
    try {
      return await this.program.account.passkeyRegistry.fetch(this.registryPda(owner))
    } catch {
      return null
    }
  }

  /** Fetch the global config. Returns `null` if not yet initialized. */
  async fetchConfig(): Promise<TranaConfigAccount | null> {
    try {
      return await this.program.account.tranaConfig.fetch(this.configPda())
    } catch {
      return null
    }
  }

  // ── Registration ────────────────────────────────────────────────────────────

  /**
   * Register the first passkey for an owner wallet.
   *
   * **Browser only** — triggers the native OS passkey creation dialog.
   * For Node.js test environments, use `registerTestPasskey()` from `@tranaprotocol/sdk/testing`.
   *
   * Flow:
   *   1. Triggers `navigator.credentials.create()` (no SDK modal)
   *   2. Extracts compressed P-256 pubkey from SPKI attestation
   *   3. Builds the `registerPasskey` instruction
   *   4. Returns the instruction + PasskeyHandle for the caller to store
   */
  async registerPasskey(args: {
    owner:           PublicKey
    rpId:            string
    userDisplayName: string
  }): Promise<RegisterPasskeyResult> {
    const { owner, rpId, userDisplayName } = args

    const config = await this.fetchConfig()
    if (!config) throw new Error("Trana config not initialized — run init_config first")

    const handle = await nativeRegister(rpId, owner.toBytes(), userDisplayName)

    const instruction = await this.program.methods
      .registerPasskey(
        { secp256R1Passkey: {} },
        Buffer.from(handle.pubkeyBytes),
        Buffer.from(handle.credentialId),
      )
      .accounts({ owner, treasury: config.treasury })
      .instruction()

    return { instruction, handle }
  }

  /**
   * Add a second (or further) passkey to an existing registry.
   *
   * **Browser only** — triggers the native OS passkey creation dialog for the
   * NEW passkey, then the authentication dialog for an EXISTING passkey.
   *
   * Flow:
   *   1. `navigator.credentials.create()` — registers new credential on device
   *   2. Fetches registry nonce
   *   3. Builds the `add_passkey` instruction
   *   4. `navigator.credentials.get()` — signs with an existing credential
   *   5. Returns instruction + secp256r1/record_proof pair + new handle
   *
   * The caller must assemble and send:
   *   [secp256r1Ix, recordProofIx, addPasskeyInstruction]
   */
  async addPasskey(args: {
    owner:              PublicKey
    /** Credential ID of any existing registered passkey to authorize the add. */
    credentialId:       Uint8Array
    rpId:               string
    userDisplayName:    string
    nonce?:             bigint
    expiryTtlSec?:      number
  }): Promise<AddPasskeyResult & BuildProofResult> {
    const { owner, credentialId, rpId, userDisplayName, expiryTtlSec = 120 } = args

    const config = await this.fetchConfig()
    if (!config) throw new Error("Trana config not initialized")

    // Register the new credential on the device
    const newHandle = await nativeRegister(rpId, owner.toBytes(), userDisplayName)

    // Build the add_passkey instruction (this is what the existing passkey signs)
    const addIx = await this.program.methods
      .addPasskey(
        { secp256R1Passkey: {} },
        Buffer.from(newHandle.pubkeyBytes),
        Buffer.from(newHandle.credentialId),
      )
      .accounts({ owner, treasury: config.treasury })
      .instruction()

    // Build proof with existing key signing this instruction
    const { secp256r1Ix, recordProofIx } = await this._buildProofForInstruction({
      protectedIx: addIx,
      owner,
      credentialId,
      policy: Policy.Require(),
      rpId,
      nonce: args.nonce,
      expiryTtlSec,
    })

    return { instruction: addIx, handle: newHandle, secp256r1Ix, recordProofIx }
  }

  /**
   * Remove a passkey from the registry by its credential ID.
   *
   * **Browser only** — triggers the OS authentication dialog for the
   * authorizing credential (any passkey OTHER than the one being removed).
   *
   * The caller must assemble and send:
   *   [secp256r1Ix, recordProofIx, removeInstruction]
   */
  async removePasskey(args: {
    owner:                   PublicKey
    /** Credential ID of the passkey to remove. */
    credentialIdToRemove:    Uint8Array
    /** Credential ID of any OTHER registered passkey to authorize the removal. */
    authorizingCredentialId: Uint8Array
    rpId:                    string
    nonce?:                  bigint
    expiryTtlSec?:           number
  }): Promise<{ instruction: TransactionInstruction } & BuildProofResult> {
    const { owner, credentialIdToRemove, authorizingCredentialId, rpId, expiryTtlSec = 120 } = args

    const removeIx = await this.program.methods
      .removePasskey(Buffer.from(credentialIdToRemove))
      .accounts({ owner })
      .instruction()

    const { secp256r1Ix, recordProofIx } = await this._buildProofForInstruction({
      protectedIx: removeIx,
      owner,
      credentialId: authorizingCredentialId,
      policy: Policy.Require(),
      rpId,
      nonce: args.nonce,
      expiryTtlSec,
    })

    return { instruction: removeIx, secp256r1Ix, recordProofIx }
  }

  // ── Proof building ──────────────────────────────────────────────────────────

  /**
   * Build the `secp256r1Ix + recordProofIx` proof pair for a protected instruction.
   *
   * **Browser only** — triggers the native OS passkey authentication dialog.
   * For Node.js test environments, use `buildTestProofIx()` from `@tranaprotocol/sdk/testing`.
   */
  async buildProof(args: {
    protectedIx:   TransactionInstruction
    owner:         PublicKey
    credentialId:  Uint8Array
    policy:        Policy
    rpId:          string
    nonce?:        bigint
    expiryTtlSec?: number
  }): Promise<BuildProofResult> {
    return this._buildProofForInstruction(args)
  }

  // ── Private helpers ─────────────────────────────────────────────────────────

  private async _buildProofForInstruction(args: {
    protectedIx:   TransactionInstruction
    owner:         PublicKey
    credentialId:  Uint8Array
    policy:        Policy
    rpId:          string
    nonce?:        bigint
    expiryTtlSec?: number
  }): Promise<BuildProofResult> {
    const { protectedIx, owner, credentialId, policy: pol, rpId, expiryTtlSec = 120 } = args

    const nonce    = args.nonce ?? await this.fetchNonce(owner)
    const registry = await this.fetchRegistry(owner)
    if (!registry) throw new Error(`No registry found for ${owner.toBase58()} — register a passkey first`)

    const input  = intentFromInstruction(protectedIx)
    const intent = buildIntent(owner, this.programId, input, nonce, {
      policy: policyId(pol),
      expiryTtlSec,
    })

    const challenge = hashIntent(intent)

    const { authenticatorData, clientDataJSON, signature } = await signIntent(
      challenge,
      credentialId,
      rpId,
    )

    // Find the matching pubkey from the registry for this credential
    const entries = registry.keys as PasskeyEntryAccount[]
    const entry   = entries.find(k => Buffer.from(k.credentialId).equals(Buffer.from(credentialId)))
    if (!entry) throw new Error("Credential ID not found in registry")

    const pubkeyBytes = new Uint8Array(entry.pubkeyBytes)
    const message     = buildWebAuthnMessage(authenticatorData, clientDataJSON)

    return {
      secp256r1Ix:   buildSecp256r1Ix(pubkeyBytes, signature, message),
      recordProofIx: buildRecordProofIx(
        this.programId,
        authenticatorData,
        clientDataJSON,
        intent.expiryUnix,
        intent.policyId,
      ),
    }
  }

  private async fetchNonce(owner: PublicKey): Promise<bigint> {
    const registry = await this.fetchRegistry(owner)
    if (!registry) throw new Error(`Registry not found for ${owner.toBase58()}`)
    return BigInt((registry.nonce as anchor.BN).toString())
  }
}

// ── Module-level helpers ──────────────────────────────────────────────────────

function resolvedProgramId(cluster: TranaCluster): PublicKey {
  const id = PROGRAM_IDS.guard[cluster as keyof typeof PROGRAM_IDS.guard]
  if (!id) throw new Error(`trana_guard not yet deployed on ${cluster}`)
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
