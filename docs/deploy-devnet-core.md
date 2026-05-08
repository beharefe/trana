# Devnet Deploy — Core Programs

Deploys `trana_guard` and `trana_authority` to devnet and initialises the
global fee config. Run this once. The vault deploy builds on top of it.

## Program IDs

```
trana_guard     GYhng7fbz51319ZwD1uBunBZs777C3KjmS52rYRcKfXn
trana_authority KoXvrg4DBLKa5U6LCUpWXJE1FHYqwaozqDqDcBXvGEE
```

These IDs are fixed by the keypairs in `target/deploy/`. As long as you use
the same keypair files across deploys the IDs never change.

## Prerequisites

```bash
solana --version      # >= 1.18
anchor --version      # 0.32.x
node --version        # >= 18
solana config set --url devnet
solana balance        # needs ~3 SOL for deployment + fees
```

Fund your wallet if needed:
```bash
solana airdrop 2      # repeat if rate-limited
```

## 1. Build

```bash
NO_DNA=1 anchor build
```

Confirm the program IDs match `Anchor.toml`:
```bash
anchor keys list
```

## 2. Deploy

```bash
anchor deploy --provider.cluster devnet --program-name trana_guard
anchor deploy --provider.cluster devnet --program-name trana_authority
```

Verify on-chain:
```bash
solana program show GYhng7fbz51319ZwD1uBunBZs777C3KjmS52rYRcKfXn --url devnet
solana program show KoXvrg4DBLKa5U6LCUpWXJE1FHYqwaozqDqDcBXvGEE   --url devnet
```

## 3. Initialise trana_guard config

The global config PDA stores the `register_fee`, `recovery_fee`, and treasury
address. Call it once — subsequent deploys skip this step automatically
(`ensureConfig` in the SDK checks if the PDA already exists).

Run the init script:
```bash
ANCHOR_PROVIDER_URL=https://api.devnet.solana.com \
ANCHOR_WALLET=~/.config/solana/id.json \
npx ts-node scripts/init-config.ts
```

`scripts/init-config.ts` (create if not present):
```typescript
import * as anchor from "@coral-xyz/anchor"
import { getProgram, ensureConfig } from "./tests/helpers/setup"

anchor.setProvider(anchor.AnchorProvider.env())
const program = getProgram()
const payer   = (program.provider as anchor.AnchorProvider).wallet as anchor.Wallet
const config  = await ensureConfig(program, payer)
console.log("config:", config)
```

Default fees set by `ensureConfig`:
- `register_fee` 0.005 SOL
- `recovery_fee` 0.01 SOL
- `treasury` = deployer wallet

Change these by passing params to `initConfig` directly if needed.

## 4. Verify

```bash
# Config PDA should exist
solana account $(solana address --keypair target/deploy/trana_guard-keypair.json) --url devnet
```

The IDL is embedded in the program so clients resolve it automatically via the
Anchor workspace.

## Upgrading

If you need to redeploy (bug fix, feature):
```bash
anchor deploy --provider.cluster devnet --program-name trana_guard
```

`trana_authority`'s upgrade authority should remain your wallet at this stage —
lock it only after the vault demo is live and you are confident you will not
need to patch it.
