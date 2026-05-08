# Devnet Deploy — Core Programs

Deploys `trana_guard` and `trana_authority` to devnet and initialises the
global fee config. Run this once. The vault deploy builds on top of it.

## Program IDs

```
trana_guard     TRAqChewX8boPDuBbVXjS7iCQAnh9gDThfBRwXauwsG
trana_authority TRNA8iyPm9AuBGiTeSirJm6F4jsxvq66LqfFeU7G4AN
```

These IDs are fixed by dedicated keypairs. As long as you use the same
keypair files the IDs never change across redeploys.

## Prerequisites

```bash
solana --version      # >= 1.18
anchor --version      # 0.32.x
node --version        # >= 18
solana config set --url devnet
solana balance        # needs ~6 SOL (each program ~2–3 SOL)
```

Fund your wallet if needed:
```bash
solana airdrop 2      # repeat if rate-limited
```

The payer for all transactions is `~/.config/solana/id.json`. The program
keypairs only sign once to claim their addresses — they are not the payer.

## 1. Build

The programs use a `devnet` cargo feature to switch `declare_id!` between
localnet (for tests) and devnet (for deployment). Always build with the
feature when deploying:

```bash
NO_DNA=1 anchor build -- --features devnet
```

Confirm the program IDs match before deploying:
```bash
anchor keys list
# trana_guard     : TRAqChewX8boPDuBbVXjS7iCQAnh9gDThfBRwXauwsG
# trana_authority : TRNA8iyPm9AuBGiTeSirJm6F4jsxvq66LqfFeU7G4AN
```

If the IDs don't match, your keypair files are wrong — stop and check before
deploying.

> **Tests use the localnet IDs.** Run `NO_DNA=1 anchor build` (no feature
> flag) before running `anchor test`.

## 2. Deploy

Each program needs its dedicated keypair passed with `--program-keypair`.
Your `id.json` wallet pays the fees.

```bash
# trana_guard
anchor deploy \
  --provider.cluster devnet \
  --program-name trana_guard \
  --program-keypair /path/to/trana_guard-keypair.json

# trana_authority
anchor deploy \
  --provider.cluster devnet \
  --program-name trana_authority \
  --program-keypair /path/to/trana_authority-keypair.json
```

> **Do not** use the program keypairs as the payer wallet. Once a program is
> deployed, the BPF Loader takes ownership of that account and the keypair
> can no longer act as a regular wallet.

Verify both are live:
```bash
solana program show TRAqChewX8boPDuBbVXjS7iCQAnh9gDThfBRwXauwsG --url devnet
solana program show TRNA8iyPm9AuBGiTeSirJm6F4jsxvq66LqfFeU7G4AN --url devnet
```

Both should show `Upgrade authority: <your id.json pubkey>`.

## 3. Initialise trana_guard config

The global config PDA stores `register_fee`, `recovery_fee`, and the treasury
address. Call it once — `ensureConfig` in the SDK skips it if the PDA already
exists.

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

Default fees:
- `register_fee` 0.005 SOL
- `recovery_fee` 0.01 SOL
- `treasury` = deployer wallet (`id.json`)

## 4. Verify

```bash
# Config PDA should exist
solana account $(solana address --keypair target/deploy/trana_guard-keypair.json) --url devnet
```

The IDL is embedded in the program so clients resolve it automatically via
the Anchor workspace.

## Upgrading

If you need to redeploy after a patch:
```bash
anchor deploy \
  --provider.cluster devnet \
  --program-name trana_guard \
  --program-keypair /path/to/trana_guard-keypair.json
```

Keep `trana_authority`'s upgrade authority as your wallet until the vault demo
is live and locked — see `deploy-devnet-vault.md`.
