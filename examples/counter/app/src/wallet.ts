import { Connection, Keypair, LAMPORTS_PER_SOL, PublicKey } from "@solana/web3.js"

const STORE_KEY  = "counter-example:keypairs"
const ACTIVE_KEY = "counter-example:active"

function loadAll(): Keypair[] {
  const raw = localStorage.getItem(STORE_KEY)
  if (!raw) return []
  return JSON.parse(raw).map((b: number[]) => Keypair.fromSecretKey(Uint8Array.from(b)))
}

function saveAll(kps: Keypair[]): void {
  localStorage.setItem(STORE_KEY, JSON.stringify(kps.map(k => Array.from(k.secretKey))))
}

export function getWallets(): Keypair[] {
  const all = loadAll()
  if (all.length === 0) {
    const kp = Keypair.generate()
    saveAll([kp])
    return [kp]
  }
  return all
}

export function getActiveIndex(): number {
  return parseInt(localStorage.getItem(ACTIVE_KEY) ?? "0", 10)
}

export function setActiveIndex(i: number): void {
  localStorage.setItem(ACTIVE_KEY, String(i))
}

export function addWallet(): number {
  const all = loadAll()
  all.push(Keypair.generate())
  saveAll(all)
  const idx = all.length - 1
  setActiveIndex(idx)
  return idx
}

export async function ensureFunded(connection: Connection, pk: PublicKey): Promise<void> {
  const balance = await connection.getBalance(pk)
  if (balance >= LAMPORTS_PER_SOL) return
  const sig = await connection.requestAirdrop(pk, 2 * LAMPORTS_PER_SOL)
  const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash()
  await connection.confirmTransaction({ signature: sig, blockhash, lastValidBlockHeight }, "confirmed")
}
