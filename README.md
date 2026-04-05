# Trana Guard

> **Onchain authorization primitive — execution-time second-factor enforcement for Solana.**

## Core guarantee

> "This instruction cannot execute unless a valid second-factor authorization proof is present in the same transaction."

Enforced onchain. Cannot be bypassed by crafting raw transactions. Atomic with execution.

---

## Quick start

### Prerequisites

| Tool | Version |
|------|---------|
| Rust | 1.75+ |
| Node | 22+ |
| pnpm | 10+ |

### 1. Install toolchain

```bash
# Solana CLI
sh -c "$(curl -sSfL https://release.anza.xyz/stable/install)"
export PATH="$HOME/.local/share/solana/install/active_release/bin:$PATH"

# hidapi (for anchor-cli)
apt-get install -y libudev-dev libhidapi-dev   # Ubuntu/Debian

# anchor-cli 0.32
cargo install anchor-cli --version "0.32.0"

# Verify
solana --version   # solana-cli 3.x
anchor --version   # anchor-cli 0.32.0
```

### 2. Install JS dependencies

```bash
pnpm install
```

### 3. Configure wallet

```bash
solana-keygen new --no-bip39-passphrase -o ~/.config/solana/id.json
solana config set --url devnet
```

---

## Run tests (localnet)

Start a local validator in one terminal:

```bash
solana-test-validator --reset --quiet
```

In another terminal:

```bash
export PATH="$HOME/.local/share/solana/install/active_release/bin:$PATH"

# Airdrop SOL to your wallet
solana airdrop 100 --url http://127.0.0.1:8899

# Build + deploy to localnet
anchor build
anchor deploy --provider.cluster localnet --no-idl

# Run all 9 test scenarios
anchor test --skip-local-validator --provider.cluster localnet
```

Expected output:

```
  guard — vault path
    ✔ Scenario 1: attacker without proof fails with MissingProof
    ✔ Scenario 2: small withdrawal succeeds without proof
    ✔ Scenario 3: large withdrawal with valid proof succeeds
    ✔ Scenario 4: replay attack fails with InvalidNonce
    ✔ Scenario 5: tampered amount fails with PayloadMismatch

  guard — protected_transfer path
    ✔ Scenario 6: small transfer succeeds without proof
    ✔ Scenario 7: large transfer without proof fails with MissingProof
    ✔ Scenario 8: large transfer with valid proof succeeds
    ✔ Scenario 9: replay of used nonce fails with NonceAlreadyUsed

  9 passing (3s)
```

---

## Deploy to devnet

### 1. Get devnet SOL

```bash
solana config set --url devnet
solana airdrop 4
# If rate-limited, wait 60s and retry or use https://faucet.solana.com
```

### 2. Build + get program ID

```bash
anchor build
anchor keys list
# → guard: <PROGRAM_ID>
```

### 3. Update program ID

Update `declare_id!` in `programs/guard/src/lib.rs` and both entries in `Anchor.toml`:

```toml
[programs.devnet]
guard = "<PROGRAM_ID>"
```

Rebuild after updating:

```bash
anchor build
```

### 4. Deploy

```bash
anchor deploy --provider.cluster devnet --no-idl
```

### 5. Copy IDL for the frontend

```bash
cp target/idl/guard.json packages/sdk/src/guard.json
```

---

## Run the web app locally

### 1. Set up Supabase

Create a project at [supabase.com](https://supabase.com) and run:

```sql
create table credentials (
  wallet        text primary key,
  credential_id text not null,
  public_key    bytea not null,
  counter       bigint not null default 0,
  opt_in        boolean not null default false
);

create table challenges (
  id         uuid primary key default gen_random_uuid(),
  wallet     text not null,
  challenge  text not null,
  payload    jsonb,
  created_at timestamptz default now()
);
```

### 2. Generate bridge server key

```bash
node -e "
const nacl = require('tweetnacl');
const bs58 = require('bs58');
const kp = nacl.sign.keyPair();
console.log('SECRET_KEY:', bs58.encode(kp.secretKey));
console.log('PUBLIC_KEY:', bs58.encode(kp.publicKey));
"
```

Keep the `SECRET_KEY` value — this is your `SERVER_SECRET_KEY`.

> **Important:** After deploying to devnet, pass the `PUBLIC_KEY` value to `initialize()` as `server_key`.

### 3. Create `.env.local`

```bash
cp .env.example apps/web/.env.local
```

Fill in all values:

```env
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key

SERVER_SECRET_KEY=<base58 64-byte secret from step 2>

NEXT_PUBLIC_PROGRAM_ID=<PROGRAM_ID from anchor deploy>
NEXT_PUBLIC_SOLANA_RPC=https://api.devnet.solana.com
NEXT_PUBLIC_GUARD_THRESHOLD_SOL=20

NEXT_PUBLIC_RP_ID=localhost
RP_ORIGIN=http://localhost:3000
RP_NAME=Trana Guard
```

### 4. Initialize the guard onchain

After deploying, call `initialize` once with your bridge server public key.
Use the Anchor TypeScript client or the Anchor CLI:

```bash
# Using anchor run (add a script to Anchor.toml, or use the test helper)
# The simplest approach: add initialize to a migration script

cat > migrations/deploy.ts << 'EOF'
import * as anchor from "@coral-xyz/anchor"
import { PublicKey } from "@solana/web3.js"
import bs58 from "bs58"
import nacl from "tweetnacl"

const SOL = 1_000_000_000

module.exports = async function(provider: anchor.AnchorProvider) {
  anchor.setProvider(provider)
  const program = anchor.workspace.Guard

  const secretKey = bs58.decode(process.env.SERVER_SECRET_KEY!)
  const serverKp  = nacl.sign.keyPair.fromSecretKey(secretKey)
  const serverKey = new PublicKey(serverKp.publicKey)

  const [configPda] = PublicKey.findProgramAddressSync(
    [Buffer.from("config")],
    program.programId
  )

  await program.methods
    .initialize(new anchor.BN(20 * SOL), true)
    .accounts({ config: configPda, serverKey, authority: provider.wallet.publicKey })
    .rpc()

  console.log("Guard initialized. Config PDA:", configPda.toBase58())
}
EOF
```

### 5. Start the dev server

```bash
pnpm dev:web
# → http://localhost:3000
```

---

## Deploy to Vercel

1. Push your branch to GitHub
2. Import the repo in [Vercel](https://vercel.com)
3. Set **Root Directory** to `apps/web`
4. Add all environment variables from `.env.local` in the Vercel dashboard
5. Update WebAuthn env vars for production:
   ```
   NEXT_PUBLIC_RP_ID=your-app.vercel.app
   RP_ORIGIN=https://your-app.vercel.app
   ```
6. Deploy

After deploy, update `NEXT_PUBLIC_PROGRAM_ID` in Vercel with your devnet program ID if not already set.

---

## Project structure

```
trana-guard/
├── programs/guard/          Anchor program (onchain enforcement)
│   └── src/lib.rs
├── packages/sdk/            TypeScript SDK
│   └── src/
│       ├── policy.ts        Rule tree + evaluatePolicy
│       ├── passkey.ts       WebAuthn browser flows
│       ├── proof.ts         attachProof(tx, proof)
│       └── types.ts         ProofPayload, VaultProofPayload, PasskeyProof
├── apps/web/                Next.js 16 demo + bridge
│   ├── app/
│   │   ├── page.tsx         Demo UI
│   │   ├── register/        Passkey registration
│   │   └── api/
│   │       ├── status/      GET  — has_passkey (UX signal)
│   │       ├── vault/       GET  — onchain vault state
│   │       ├── register/    POST — WebAuthn registration
│   │       └── approve/     POST — WebAuthn assertion + Ed25519 signing
│   └── lib/
│       ├── crypto.ts        Bridge server keypair + signPayloadHash
│       ├── db.ts            Supabase credential/challenge storage
│       └── webauthn.ts      @simplewebauthn/server wrappers
└── tests/guard.ts           9 Anchor test scenarios
```

---

## How it works

```
User passkey assertion
  → Bridge verifies WebAuthn (offchain)
  → Bridge signs sha256(ProofPayload) with Ed25519 server key
  → Client prepends Ed25519Program.createInstructionWithPublicKey(...) at index 0
  → Anchor program reads Instructions sysvar at index 0
  → Validates: signer == config.server_key && message == expected_hash && not expired
  → Executes (or rejects)
```

**Trust model:** Passkey proves approval to the bridge. Bridge proves approval to the chain. The chain only verifies the Ed25519 proof — not the WebAuthn process directly.

**Replay protection (vault):** Monotonic nonce stored in `VaultState`. Each successful withdrawal increments it; a proof for nonce N cannot be reused for nonce N+1.

**Replay protection (direct transfer):** Random 32-byte nonce stored as a one-time-use PDA. Marked used on first consumption.

---

## Test scenarios

| # | Description | Expected |
|---|-------------|----------|
| 1 | Attacker sends withdrawal without proof | `MissingProof` |
| 2 | Small withdrawal — below threshold, no opt-in | Success (no 2FA) |
| 3 | Large withdrawal + valid passkey proof | Success |
| 4 | Replay: reuse nonce from scenario 3 | `InvalidNonce` |
| 5 | Tampered amount after proof issued | `PayloadMismatch` |
| 6 | Small direct transfer (no vault) | Success (no 2FA) |
| 7 | Large direct transfer without proof | `MissingProof` |
| 8 | Large direct transfer + valid proof | Success |
| 9 | Replay: reuse nonce from scenario 8 | `NonceAlreadyUsed` |
