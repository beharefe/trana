// Copyright 2026 Trana, Inc.
// SPDX-License-Identifier: Apache-2.0

/**
 * TranaGuardClient — typed client for the `trana_guard` program.
 *
 * Usage pattern (bring your own connection):
 *
 *   const client = new TranaGuardClient({ connection, cluster: "devnet" })
 *
 *   // Register (browser only — triggers native passkey UI)
 *   const { instruction, handle } = await client.registerPasskey({
 *     owner:           walletPubkey,
 *     rpId:            window.location.hostname,
 *     userDisplayName: walletPubkey.toBase58().slice(0, 8) + "…",
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
 *
 *   // Assemble + send via your wallet
 *   const tx = buildVersionedTx([secp256r1Ix, recordProofIx, withdrawIx], ...)
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

  // IN PROGRESS: Wallet adapter bridge
  // wallet?: WalletContextState  // @solana/wallet-adapter-react — pass for auto-signing
}

// ── Return types (re-exported for consumer convenience) ───────────────────────

export type { TranaGuard }

// Anchor account types derived from IDL
export type PasskeyRegistryAccount = anchor.IdlAccounts<TranaGuard>["passkeyRegistry"]
/** @deprecated Use PasskeyRegistryAccount */
export type TwoFactorRegistryAccount = PasskeyRegistryAccount
export type TranaConfigAccount        = anchor.IdlAccounts<TranaGuard>["tranaConfig"]

export type RegisterPasskeyResult = {
  /** `register_two_fa` instruction — include in your transaction. */
  instruction: TransactionInstruction
  /** Store this — required for every future `buildProof()` call. */
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

  // Typed Anchor program — IDL generic gives full account + method typing
  private readonly program: anchor.Program<TranaGuard>

  constructor(options: TranaGuardClientOptions) {
    this.cluster   = options.cluster ?? "devnet"
    this.programId = options.programId ?? resolvedProgramId(this.cluster)

    // Anchor provider with a dummy wallet — the SDK never signs; callers do.
    const provider = new anchor.AnchorProvider(
      options.connection,
      dummyWallet(),
      { commitment: "confirmed", skipPreflight: false },
    )
    // Override the IDL's baked-in address with the cluster-resolved program ID.
    // The IDL contains the devnet address; without this, instructions built via
    // this.program.methods.X() target the wrong program on localnet.
    this.program = new anchor.Program<TranaGuard>(
      { ...(IDL as any), address: this.programId.toBase58() },
      provider,
    )
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

  /** Fetch the registry for an owner. Returns `null` if not yet registered. */
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
   * Register a new passkey for an owner wallet.
   *
   * **Browser only** — triggers the native OS passkey creation dialog.
   * For Node.js test environments, use `registerTestPasskey()` from `@tranaprotocol/sdk/testing`.
   *
   * Flow:
   *   1. Triggers `navigator.credentials.create()` (no SDK modal)
   *   2. Extracts compressed P-256 pubkey from SPKI attestation
   *   3. Builds the `registerTwoFa` instruction
   *   4. Returns the instruction + PasskeyHandle for the caller to store
   *
   * The caller must include `instruction` in a signed transaction.
   * The `handle` must be stored (e.g. localStorage) — it's needed for `buildProof()`.
   */
  async registerPasskey(args: {
    owner:           PublicKey
    rpId:            string
    userDisplayName: string
  }): Promise<RegisterPasskeyResult> {
    const { owner, rpId, userDisplayName } = args

    const config = await this.fetchConfig()
    if (!config) throw new Error("Trana config not initialized — run init_config first")

    // Trigger native WebAuthn registration (no custom UI)
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

  // ── Proof building ──────────────────────────────────────────────────────────

  /**
   * Build the `secp256r1Ix + recordProofIx` proof pair for a protected instruction.
   *
   * **Browser only** — triggers the native OS passkey authentication dialog.
   * For Node.js test environments, use `buildTestProof()` from `@tranaprotocol/sdk/testing`.
   *
   * Flow:
   *   1. Fetches registry nonce (or uses provided `nonce`)
   *   2. Builds a frozen `TranaIntent` binding the protected instruction
   *   3. Triggers `navigator.credentials.get()` with `hashIntent(intent)` as challenge
   *   4. Converts the WebAuthn assertion to the secp256r1 precompile format
   *   5. Returns two `TransactionInstruction` objects to prepend
   *
   * Transaction layout the caller must construct:
   *   [secp256r1Ix, recordProofIx, protectedIx, ...]
   */
  async buildProof(args: {
    /** The instruction that calls `trana_guard::cpi::enforce()` internally. */
    protectedIx:  TransactionInstruction
    owner:        PublicKey
    credentialId: Uint8Array
    policy:       Policy
    rpId:         string
    /** Current registry nonce. Fetched on-chain if omitted (extra RPC call). */
    nonce?:       bigint
    /** Proof validity window. Defaults to 120 s. */
    expiryTtlSec?: number
  }): Promise<BuildProofResult> {
    const { protectedIx, owner, credentialId, policy, rpId, expiryTtlSec = 120 } = args

    const nonce    = args.nonce ?? await this.fetchNonce(owner)
    const registry = await this.fetchRegistry(owner)
    if (!registry) throw new Error(`No registry found for ${owner.toBase58()} — register a passkey first`)

    const input  = intentFromInstruction(protectedIx)
    const intent = buildIntent(owner, this.programId, input, nonce, {
      policy:       policyId(policy),
      expiryTtlSec,
    })

    const challenge = hashIntent(intent)

    // Trigger native WebAuthn signing (no custom UI)
    const { authenticatorData, clientDataJSON, signature } = await signIntent(
      challenge,
      credentialId,
      rpId,
    )

    const matchedEntry = registry.keys.find(
      k => Buffer.from(k.credentialId as unknown as number[]).equals(Buffer.from(credentialId))
    )
    if (!matchedEntry) throw new Error("credentialId not found in registry — was this passkey registered for this wallet?")
    const pubkeyBytes = new Uint8Array(matchedEntry.pubkeyBytes as unknown as number[])
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

  // ── Private helpers ─────────────────────────────────────────────────────────

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

/** Read-only dummy wallet — the SDK never signs transactions; callers do. */
function dummyWallet(): anchor.Wallet {
  const kp = Keypair.generate()
  return {
    publicKey:           kp.publicKey,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    signTransaction:     async (tx: any)   => tx,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    signAllTransactions: async (txs: any[]) => txs,
    payer:               kp,
  } as unknown as anchor.Wallet
}
