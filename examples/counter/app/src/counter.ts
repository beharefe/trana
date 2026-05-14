import { sha256 } from "@noble/hashes/sha256"
import {
  Connection,
  PublicKey,
  SystemProgram,
  TransactionInstruction,
  SYSVAR_INSTRUCTIONS_PUBKEY,
} from "@solana/web3.js"

// Set by `npm run sync` (reads target/deploy/counter-keypair.json → app/.env.local)
export const COUNTER_PROGRAM_ID = new PublicKey(
  import.meta.env.VITE_COUNTER_PROGRAM_ID ?? "BF3AS5PQSbGvipTZo99CzPJmnLUJkyq3z8cY8RTimwTv",
)
export const TRANA_GUARD_ID = new PublicKey("GYhng7fbz51319ZwD1uBunBZs777C3KjmS52rYRcKfXn")

// ── Discriminators ────────────────────────────────────────────────────────────

function disc(name: string): Buffer {
  return Buffer.from(sha256(name)).subarray(0, 8)
}

// ── PDAs ──────────────────────────────────────────────────────────────────────

export function counterPda(owner: PublicKey): PublicKey {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("counter"), owner.toBuffer()],
    COUNTER_PROGRAM_ID,
  )[0]
}

export function registryPda(owner: PublicKey): PublicKey {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("passkey"), owner.toBuffer()],
    TRANA_GUARD_ID,
  )[0]
}

// ── Instructions ──────────────────────────────────────────────────────────────

export function initializeIx(owner: PublicKey): TransactionInstruction {
  return new TransactionInstruction({
    programId: COUNTER_PROGRAM_ID,
    keys: [
      { pubkey: counterPda(owner),        isWritable: true,  isSigner: false },
      { pubkey: owner,                    isWritable: true,  isSigner: true  },
      { pubkey: SystemProgram.programId,  isWritable: false, isSigner: false },
    ],
    data: disc("global:initialize"),
  })
}

export function incrementIx(owner: PublicKey): TransactionInstruction {
  return new TransactionInstruction({
    programId: COUNTER_PROGRAM_ID,
    keys: [
      { pubkey: counterPda(owner),          isWritable: true,  isSigner: false },
      { pubkey: owner,                      isWritable: false, isSigner: true  },
      { pubkey: TRANA_GUARD_ID,             isWritable: false, isSigner: false },
      { pubkey: registryPda(owner),         isWritable: true,  isSigner: false },
      { pubkey: SYSVAR_INSTRUCTIONS_PUBKEY, isWritable: false, isSigner: false },
    ],
    data: disc("global:increment"),
  })
}

// ── Account decoder ───────────────────────────────────────────────────────────
// Layout: discriminator(8) | count(u64 LE, 8) | owner(pubkey, 32) | bump(u8, 1)

export type CounterAccount = { count: bigint; owner: PublicKey }

export async function fetchCounter(
  connection: Connection,
  owner: PublicKey,
): Promise<CounterAccount | null> {
  const info = await connection.getAccountInfo(counterPda(owner))
  if (!info) return null
  const d = info.data
  return {
    count: d.readBigUInt64LE(8),
    owner: new PublicKey(d.slice(16, 48)),
  }
}
