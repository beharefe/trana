import { Connection, Keypair, LAMPORTS_PER_SOL, PublicKey } from "@solana/web3.js"

const STORAGE_KEY = "counter-example:keypair"

export function getOrCreateKeypair(): Keypair {
  const stored = localStorage.getItem(STORAGE_KEY)
  if (stored) return Keypair.fromSecretKey(Uint8Array.from(JSON.parse(stored)))
  const kp = Keypair.generate()
  localStorage.setItem(STORAGE_KEY, JSON.stringify(Array.from(kp.secretKey)))
  return kp
}

export async function ensureFunded(connection: Connection, pk: PublicKey): Promise<void> {
  const balance = await connection.getBalance(pk)
  if (balance >= LAMPORTS_PER_SOL) return
  const sig = await connection.requestAirdrop(pk, 2 * LAMPORTS_PER_SOL)
  const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash()
  await connection.confirmTransaction({ signature: sig, blockhash, lastValidBlockHeight }, "confirmed")
}
