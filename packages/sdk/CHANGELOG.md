## [1.4.6](https://github.com/beharefe/trana/compare/v1.4.5...v1.4.6) (2026-05-14)


### Bug Fixes

* **sdk:** use cluster-resolved programId for Anchor Program, fix devnet address in PROGRAM_IDS ([deb449e](https://github.com/beharefe/trana/commit/deb449e0e065690b76f96b4c267accdf2263f79c))

## [1.4.5](https://github.com/beharefe/trana/compare/v1.4.4...v1.4.5) (2026-05-14)


### Bug Fixes

* **repo:** load secp256r1 program account from devnet cache into test validator ([0603762](https://github.com/beharefe/trana/commit/060376260dfe713c54bb37a1b115abf9492b69e0))

## [1.4.4](https://github.com/beharefe/trana/compare/v1.4.3...v1.4.4) (2026-05-14)


### Bug Fixes

* **repo:** add --features localnet to trana_guard build, restore skipPreflight ([009e646](https://github.com/beharefe/trana/commit/009e6462a4b77e4bb5488183911b791c97d0e0cd))

## [1.4.3](https://github.com/beharefe/trana/compare/v1.4.2...v1.4.3) (2026-05-14)


### Bug Fixes

* **repo:** clone secp256r1 from devnet instead of skipping preflight ([36770bb](https://github.com/beharefe/trana/commit/36770bbda056e0833ccbe060be527857aa3139ad))

## [1.4.2](https://github.com/beharefe/trana/compare/v1.4.1...v1.4.2) (2026-05-14)


### Bug Fixes

* **repo:** skip preflight for secp256r1 precompile simulation bug ([6048aa1](https://github.com/beharefe/trana/commit/6048aa1f16fb9bf1ace9f1152646cada611844e1))

## [1.4.1](https://github.com/beharefe/trana/compare/v1.4.0...v1.4.1) (2026-05-14)


### Bug Fixes

* **repo:** use absolute paths in run.mjs, suppress build warnings, verify programs before start ([1fca023](https://github.com/beharefe/trana/commit/1fca0234cf5a08c3c84390cfe854b8283bab323b))

# [1.4.0](https://github.com/beharefe/trana/compare/v1.3.0...v1.4.0) (2026-05-14)


### Features

* **repo:** single npm start command for counter example ([522cc83](https://github.com/beharefe/trana/commit/522cc83939258d2faa1b88fa6e9a103ee2bdaa24))

# [1.3.0](https://github.com/beharefe/trana/compare/v1.2.0...v1.3.0) (2026-05-14)


### Features

* **repo:** auto-fund in-browser wallet and sync program ID in counter example ([23adec3](https://github.com/beharefe/trana/commit/23adec3ff9aa714ab3b98a29524c6f3b030442dc))
* **repo:** auto-register passkey on increment if missing ([168b055](https://github.com/beharefe/trana/commit/168b055fc046cc0163c6b95798ece57cbfd8244c))

# [1.2.0](https://github.com/beharefe/trana/compare/v1.1.0...v1.2.0) (2026-05-14)


### Features

* **repo:** add counter example with passkey-gated increment ([abd6945](https://github.com/beharefe/trana/commit/abd6945c830deedbb68fbfa3e628ead88116124c))

# [1.1.0](https://github.com/beharefe/trana/compare/v1.0.1...v1.1.0) (2026-05-14)


### Bug Fixes

* **ci:** skip vercel deployments on semantic-release commits ([ac3ec07](https://github.com/beharefe/trana/commit/ac3ec07e5d415058ce68ed74cfd6c0ab781bf264))


### Features

* **sdk:** rename package from @tranaprotocol/sdk to @beharefe/sdk ([ea49e4a](https://github.com/beharefe/trana/commit/ea49e4a15671e7878beb0dfb0287866ce5d917d1))


### Reverts

* **sdk:** restore @tranaprotocol/sdk package name ([16329d2](https://github.com/beharefe/trana/commit/16329d2be47a6583d3ce69c6131191578c5403e4))

## [1.0.1](https://github.com/beharefe/trana/compare/v1.0.0...v1.0.1) (2026-05-14)


### Bug Fixes

* **landing:** use workspace wildcard for sdk dep to survive major version bumps ([eb94de9](https://github.com/beharefe/trana/commit/eb94de9920776da4833b831c6f49e8d3cce914cb))

# 1.0.0 (2026-05-14)


### Bug Fixes

* add dark class to html for nextra code highlighting, remove mt-0 from h1 ([62f3dde](https://github.com/beharefe/trana/commit/62f3ddefa3ea2d503066a8d68fe4e87bbc3bacf4))
* add devnet feature to trana_test_vault, propagates to trana_guard ([cb429f7](https://github.com/beharefe/trana/commit/cb429f74b8bee23f8ab20cebd0b5cac0e3e2eb70))
* add turbopack config to apps/web for Next.js 16 compatibility ([bcd8041](https://github.com/beharefe/trana/commit/bcd80410dff63dff1ce9c0ef286a06effec8b3c2))
* address security audit findings in guard program ([c2c38d3](https://github.com/beharefe/trana/commit/c2c38d3287bcdc0c400d1f8e85720bce06704c4d))
* all 9 tests passing on localnet + README ([2ae5f6f](https://github.com/beharefe/trana/commit/2ae5f6fddd75466e96d39df39e405f4807398c73))
* **ci:** disable npm workspaces-update to prevent registry lookup on version bump ([33f5cc3](https://github.com/beharefe/trana/commit/33f5cc3545e8ea557d25e72c425352e2ffdb4e65))
* **ci:** fix npm auth and scoped package access for semantic-release ([7d2efb0](https://github.com/beharefe/trana/commit/7d2efb09fba4b89c21c52630dd9586509c169955))
* cluster validation in enforce(), param_offset docs, ClusterMismatch error ([5111fed](https://github.com/beharefe/trana/commit/5111fedf05699cf2c109bf1357128fc431f12ffc))
* correct .so path in upgrade test (../../ → ../) ([7f822fa](https://github.com/beharefe/trana/commit/7f822fad8c6af840167d090d2bcff5d330c92ef0))
* correct devnet program IDs ([22bc502](https://github.com/beharefe/trana/commit/22bc5028f59825c5dfed38f8f82be2795ad47221))
* correct Next.js output directory path in vercel.json ([0835aba](https://github.com/beharefe/trana/commit/0835abaedae38364b1ee04bbd288c84d2e7ee7ef))
* correct Vercel outputDirectory path ([0dc616a](https://github.com/beharefe/trana/commit/0dc616adfd4813180c30b2e490e30c5fdfd87994))
* **docker:** switch from pnpm to npm ([a3d755f](https://github.com/beharefe/trana/commit/a3d755fb08d55f5e6823f8beec750af3b8a7858b))
* **docs:** correct policy names and CPI accounts; add R18/R19 tests ([61548b3](https://github.com/beharefe/trana/commit/61548b3c895920cadfaf5a6a61a9882a7c10abef))
* enable corepack in Vercel install command to get pnpm 10 ([d5e76e2](https://github.com/beharefe/trana/commit/d5e76e2edecf4321b29bbf0e2571a6fed6ea17e0))
* expiry tests use epoch=1, vault is_drain requires active window ([b6c5717](https://github.com/beharefe/trana/commit/b6c5717037a3d49855efea1599fcd9c73eb24117))
* **guard:** verify program ID of record_proof ix before discriminator ([b230ed3](https://github.com/beharefe/trana/commit/b230ed3ee0d9ef4c17a71afa0b20ffdf19fb26de))
* install pnpm 10 via npm before workspace install on Vercel ([3b9fcf1](https://github.com/beharefe/trana/commit/3b9fcf16841f4d6794f8d87fd7dfee3a17c40ab2))
* **landing:** add Docs link to mobile nav dropdown ([e601f9e](https://github.com/beharefe/trana/commit/e601f9e0b24f5396a5e7e8d248d4079818882cc9))
* **landing:** breadcrumb false via _meta.ts theme option ([75b7762](https://github.com/beharefe/trana/commit/75b77626506388433d5f0605a622607acea215c8))
* **landing:** decode all trana_guard error codes in try page, handle raw InstructionError JSON ([f3e44e3](https://github.com/beharefe/trana/commit/f3e44e30715653e84451744032c166d415d6a178))
* **landing:** disable TOC on try-it-live pages to remove empty right column ([6905e07](https://github.com/beharefe/trana/commit/6905e075059fc050c56ef6eeb33218b6e38e5bb1))
* **landing:** extract JSON substring before parsing InstructionError in parseErrMsg ([f1aae91](https://github.com/beharefe/trana/commit/f1aae91ae64df12242b725b2cd87bd768d1b95e8))
* **landing:** layout full + toc false to remove empty right TOC column ([d7a6547](https://github.com/beharefe/trana/commit/d7a65472626ea3034a28fd4b0e5cc40f05f6cc4f))
* **landing:** mobile try — hide sidebar, 50/50 vault tabs, remove big hero cards ([ab94bf2](https://github.com/beharefe/trana/commit/ab94bf22a7bc0fe8c17d545894d7f6b07fea6264))
* **landing:** mobile try — zero side padding, panel header no wrap, tighter padding ([1f07d18](https://github.com/beharefe/trana/commit/1f07d1848f1e5df74f8e706d1cfef5d0c151a638))
* **landing:** mobile try page layout — compact tabs, stacked panels, no sidebar clutter ([e619b2a](https://github.com/beharefe/trana/commit/e619b2ad40c2efe47f5f99837ee5b04afd68777c))
* **landing:** real logo, active nav, /try polish ([4afc540](https://github.com/beharefe/trana/commit/4afc540c3f44208c195b98b30315424ffbc60bca)), closes [#section](https://github.com/beharefe/trana/issues/section)
* **landing:** remove breadcrumb and copy page button ([bc125d0](https://github.com/beharefe/trana/commit/bc125d061ee71154aa660108448b11aee6cd5f6f))
* **landing:** remove invalid docsRepositoryBase empty string ([4cd553a](https://github.com/beharefe/trana/commit/4cd553afb5481b13af85f5a5516bd1bdc803271c))
* **landing:** replace devnet live indicator with built with heart for solana ([15dab3c](https://github.com/beharefe/trana/commit/15dab3cce5adf2d53d13ff102503b32b6cdfa4df))
* **landing:** restore Inter+DM Serif for site, Space Grotesk for logo only ([71c967c](https://github.com/beharefe/trana/commit/71c967c81f13dbff8da91cc0f30d11318b7fb9cf))
* **landing:** restore SiteNav GitHub link, /try lime color, globals.css [@layer](https://github.com/layer) animation fixes ([b9f95e8](https://github.com/beharefe/trana/commit/b9f95e81c9c75bd9ee4fa96a1661e3b05da7e942))
* **landing:** select-none on seed phrase word numbers ([eaa1f65](https://github.com/beharefe/trana/commit/eaa1f651cc8650c05adf7c41751258351875ec91))
* **landing:** soften audit claim to planned before mainnet launch ([8c082e7](https://github.com/beharefe/trana/commit/8c082e7bdd014f73b0916d016e0b02023bd8afea))
* **landing:** strip VaultBanner/LiveStatePanel/TryItLiveShell, start with Deposit ([054edad](https://github.com/beharefe/trana/commit/054edadecd8ae330226a72c87cb795978ceca706))
* **landing:** update vault demo title and lede to match actual demo ([6e3341d](https://github.com/beharefe/trana/commit/6e3341d22a7573cd1b7b0e758e8bab0f88c998cd))
* **landing:** VaultBar compact mobile — no dot, no wrap, connect always right ([9290541](https://github.com/beharefe/trana/commit/92905413b43be63a4657cd3db45416b3579c08b8))
* **landing:** VaultBar same width as content, add rounded border ([021e303](https://github.com/beharefe/trana/commit/021e30351cdd1c46da010279539c18a1ffb1e294))
* next ([d62f9e1](https://github.com/beharefe/trana/commit/d62f9e1c678b9687078a66557c50488bddfc9921))
* pin anchor_version to 0.32.1 in Anchor.toml ([dc79b61](https://github.com/beharefe/trana/commit/dc79b61618d4bc988136e8114cde5519ee904e1b))
* pin pnpm version and Node for Vercel compatibility ([d2170f2](https://github.com/beharefe/trana/commit/d2170f2439f907e27e6f796b2df98225f484b4c6))
* **programs:** cfg feature flag for devnet vs localnet declare_id ([b50fad8](https://github.com/beharefe/trana/commit/b50fad8ec062fe9c72194718d4f718134f3cfa6a))
* remove logo from nav, whitespace-nowrap on animation card status ([b0b8453](https://github.com/beharefe/trana/commit/b0b845350c9cab1894eaf533d287985c57ca31b1))
* **repo:** add Linux x64 optionalDependencies for lightningcss/simple-git, fix SDK tsconfig ([dfdb187](https://github.com/beharefe/trana/commit/dfdb187b7d6147c6ffd5e048b410c106f0fd03bb))
* **repo:** build SDK before landing on Vercel ([a8ec5ef](https://github.com/beharefe/trana/commit/a8ec5ef69dad593930fd86a938d04c34fbc272d0))
* **repo:** pass cargo features via -- to anchor build/test ([b876795](https://github.com/beharefe/trana/commit/b8767950d512668aa27c0b758cca18e1f789d4bb))
* **repo:** post mergE ([ec9ba88](https://github.com/beharefe/trana/commit/ec9ba88a814e6ee63864b19fe751b11ce7d97b91))
* **repo:** skip husky when CI or VERCEL env is set ([b86a8b5](https://github.com/beharefe/trana/commit/b86a8b5318008ff6a17a68a0c7357dc01f1036c8))
* **repo:** use npm ci to avoid stale platform-specific native binaries in Vercel cache ([4d1c3c2](https://github.com/beharefe/trana/commit/4d1c3c2af5403104f522fa976c5f4e02a277ef4c))
* restore full MDX styling for content pages, split from docs components ([b73e51e](https://github.com/beharefe/trana/commit/b73e51edc86b15f65e5bec3e276ece7c19faff85))
* **sdk+docker:** fix package name mismatch and stale dist in container ([8916a3e](https://github.com/beharefe/trana/commit/8916a3ecb2294d28c4c90a583031f587232f61b0))
* **sdk:** correct secp256r1 prehash, add Node.js test helper ([5995fb5](https://github.com/beharefe/trana/commit/5995fb5c9d1f0075fc504a8e2642ba9a95ad8493))
* **sdk:** insert proof ixs before last ix, not at front (unshift) ([4c8b2a7](https://github.com/beharefe/trana/commit/4c8b2a7511c89232187a5652c2c26149a7531aae))
* **test:** Anchor emits event names as camelCase — proofVerified not ProofVerified ([42e235f](https://github.com/beharefe/trana/commit/42e235f35bf1b361309c22632fa149283c242b3c))
* **test:** correct replay_attack_modified_tx policy and error code ([77796f5](https://github.com/beharefe/trana/commit/77796f507faa46453ee554391c9e3face13aa674))
* **tests:** correct 3 guard_integration assertions + add vault policy tests ([1e09759](https://github.com/beharefe/trana/commit/1e09759daf6ff5f1ae04e968ff73eb54df19967b))
* **tests:** correct import path for buildSecp256r1Ix in guard.test.ts ([69c9b00](https://github.com/beharefe/trana/commit/69c9b0012cce4f5b269bb1be0459e764815fd313))
* **tests:** deploy fresh upgradeable program for execute_upgrade tests ([7b44a3d](https://github.com/beharefe/trana/commit/7b44a3d3b47a6f6a752e15ccd71c8520a951ea2d))
* **tests:** increase outer beforeAll timeout to 180s ([3f040ca](https://github.com/beharefe/trana/commit/3f040ca74a36b27fb5b0199ca3b2b4e363c3bca4))
* **tests:** pre-warm guard config in beforeAll to fix first-test timeout ([e155032](https://github.com/beharefe/trana/commit/e15503275520f853dfe4865570d1e5a00f464e35))
* **tests:** prevent hanging tests and align error assertions ([372f25c](https://github.com/beharefe/trana/commit/372f25cd05604cc4fa4dc0563c72f1c6ade95041))
* **tests:** retry sendV0 on blockhash expiry instead of hard timeout ([b3a58f6](https://github.com/beharefe/trana/commit/b3a58f6c1deb9f4110fc9b4ab4cdb41c9f9a91b5))
* **tests:** setup.ts — passkey seeds, registerPasskey, recoverRegistry, addKeyFee ([a79d39a](https://github.com/beharefe/trana/commit/a79d39ae616529996e5673858ddc14d5bbfc5ef1))
* **tests:** update error codes after RegistryDisabled removal ([b19ff8e](https://github.com/beharefe/trana/commit/b19ff8e90d4177425bdc93767127d7b87cb232f6))
* **tests:** update rotation tests to use recoverPasskey + correct nonce counts ([d398787](https://github.com/beharefe/trana/commit/d398787a44415969cf863cab7e3c1557f1521954))
* **tests:** use blockhash-based confirmation for airdrop helper ([800bbb8](https://github.com/beharefe/trana/commit/800bbb8e32afbc27a73b0a3070fcb5051aa808ca))
* **tests:** use WebSocket confirmation to avoid TransactionExpiredBlockheight ([63c7edc](https://github.com/beharefe/trana/commit/63c7edcc8d5a191ce9e95e5b7994973baef61758))
* **trana_authority:** restore() in upgradeFixture used nonce=999 instead of 0 ([bbd5567](https://github.com/beharefe/trana/commit/bbd5567495554ddcf0b9128632129405823f1682))
* **trana_authority:** route record_proof to trana_guard and use dummy programData ([059079a](https://github.com/beharefe/trana/commit/059079afead4025804924bff75b20a4ac7d0e7f1))
* **trana_guard:** block wallet-only passkey hijack, add recover_two_fa ([92036c8](https://github.com/beharefe/trana/commit/92036c8f3881ed764444c03672abea7a839e4568))
* **trana-guard:** add fallback declare_id! to suppress cascade errors on missing network feature ([dcdf177](https://github.com/beharefe/trana/commit/dcdf177b56a14d5d3a728fbc38ded42bf2c83447))
* update copy ([19eb340](https://github.com/beharefe/trana/commit/19eb3408156c8380dd4bcfe92feb717ecddee8bf))
* update copy ([1d5d66b](https://github.com/beharefe/trana/commit/1d5d66b83c70b8be653bb9b668d6799698f10948))
* use recursive getTextContent to extract code from MDX pre children ([fd7a3e0](https://github.com/beharefe/trana/commit/fd7a3e007d6a69ccad9a5b59b6458adca953b378))
* vercel ([9b47b8c](https://github.com/beharefe/trana/commit/9b47b8c6155da5529ac24b7fb410ebc2e8555824))


### Features

* add Nextra v4 docs app at /docs ([b7791c1](https://github.com/beharefe/trana/commit/b7791c11ada43126798b5a92472437f6486af68b)), closes [#7af0a8](https://github.com/beharefe/trana/issues/7af0a8)
* bake expected cluster into binary at build time, remove config from Enforce CPI ([4e70cc8](https://github.com/beharefe/trana/commit/4e70cc8071141dfc78ba0809eb1f1b3838891317))
* declare dedicated devnet program IDs ([6ea7650](https://github.com/beharefe/trana/commit/6ea7650d1bdd776c495ffa0788a11dadd9f5334c))
* **guard:** drop-in integration — record_proof data carrier, sysvar-driven enforcement ([619761a](https://github.com/beharefe/trana/commit/619761ae401af5d4a3ba254de6b5f19f13f33cc3))
* **guard:** enforce() CPI primitive + full WebAuthn verification onchain ([386b7bf](https://github.com/beharefe/trana/commit/386b7bf39d35f77fa09377cac74e040a06509bfa))
* implement full 14-policy surface in Trana guard ([7425b0d](https://github.com/beharefe/trana/commit/7425b0d618bcb0855960d2b059c3f5f470d3a94a))
* initial TAG MVP — Solana passkey guard (POC) ([6b99f7d](https://github.com/beharefe/trana/commit/6b99f7d2f1b04c2c0e33b4534a3db0019e2ff9e0))
* integrate Nextra v4 docs into landing app at /docs route ([eb8acc7](https://github.com/beharefe/trana/commit/eb8acc724c97e346af190037dbd3a8cb12fa1e74))
* **landing:** add /try interactive playground route ([c10e608](https://github.com/beharefe/trana/commit/c10e60806c102c3225beddce146acf38821b51ae))
* **landing:** apply Trana brand — fonts, colors, wordmark ([c06b3df](https://github.com/beharefe/trana/commit/c06b3dff67e50163c6e28d9dfbf3e2d4151e5e6d)), closes [#0a0a0b](https://github.com/beharefe/trana/issues/0a0a0b) [#ebe8e0](https://github.com/beharefe/trana/issues/ebe8e0) [#c6ff3a](https://github.com/beharefe/trana/issues/c6ff3a) [#ff5b1f](https://github.com/beharefe/trana/issues/ff5b1f) [#5aa9ff](https://github.com/beharefe/trana/issues/5aa9ff)
* **landing:** docs.trana.so subdomain routing, drop try subdomain, restore docs navbar links ([b92af47](https://github.com/beharefe/trana/commit/b92af47ce8776313f775df0363ea948303ad4032))
* **landing:** full redesign with responsive mobile layout ([a6ee562](https://github.com/beharefe/trana/commit/a6ee562c889a68bf6b7b34273ba20eda4d98d13a))
* **landing:** move docs content to repo-root docs/content/ ([bd22ff9](https://github.com/beharefe/trana/commit/bd22ff991d214351f6713c486dd420bf6a09f9c6))
* **landing:** program state block, VaultBar padding, remove copy button ([cf08a7e](https://github.com/beharefe/trana/commit/cf08a7eb09e7a928a2283e6e2fb313777e7dfa53))
* **landing:** redirect try-it-live→deposit, responsive TxAnatomyStrip ([7572951](https://github.com/beharefe/trana/commit/7572951b049eec33ac36bf50c3b41788bd5e6a2c))
* **landing:** remove try-it-live docs, flatten content to top level ([c6248cc](https://github.com/beharefe/trana/commit/c6248cc128a0e8f05912db3ef508b313a449e903))
* **landing:** symlink apps/landing/content → docs/content ([669f72d](https://github.com/beharefe/trana/commit/669f72d99d8cb605676ce5cffa43e4b0f005ff4a))
* **landing:** Trana T mark logo + wordmark ([44fee8e](https://github.com/beharefe/trana/commit/44fee8eb2f3d76d8097d5a08c913c2294ea7609e))
* **landing:** Try it live layout shell — folder structure ([c6246fe](https://github.com/beharefe/trana/commit/c6246fe1daff841ecc7ad9a216b810f1b5a62157))
* **landing:** try-it-live full redesign matching brand mockup ([03650af](https://github.com/beharefe/trana/commit/03650af2d69522628a3ff6ab211bb03424ff338d))
* **landing:** VaultBar with wallet connect, seed phrase modal, devnet faucet ([ef535bd](https://github.com/beharefe/trana/commit/ef535bda349e9bd459682138bf68380abc6bb49f))
* **landing:** wire /try to real devnet with wallet adapter + SDK ([27d1ceb](https://github.com/beharefe/trana/commit/27d1cebee71dad2f6a1fb1b0fa77a3db4f3afaea))
* **program:** move fee to register_two_fa, remove enforce treasury ([88bdbb0](https://github.com/beharefe/trana/commit/88bdbb0485ff5bf5d417c5bfa5fc783da75c5e8d))
* publish prep, browser compat, tighter docs, cleaner modal ([c930ffe](https://github.com/beharefe/trana/commit/c930ffe7ba008b1e9eb90e028ba741c4d8828fb5))
* **repo:** restore real WebAuthn flow, try page tabs, vault policies, SDK updates, CLI tools ([94ae2ea](https://github.com/beharefe/trana/commit/94ae2ea24ecae44e0a5858ef759adc14017dcf4e))
* Sandpack code viewer for content pages, relax table layout ([1d1213d](https://github.com/beharefe/trana/commit/1d1213ddc154acc69bc606f4db1093ad7409aab4)), closes [#0d0e11](https://github.com/beharefe/trana/issues/0d0e11)
* **scripts:** add deploy.sh, init-vault, rewrite init-config with fee args ([09370ea](https://github.com/beharefe/trana/commit/09370ea0ad5ecd5b9a41a2b0426b39c4d4a9ab9b))
* **sdk:** add config/treasury to register instruction, update IDL ([e61277d](https://github.com/beharefe/trana/commit/e61277d15ca7878162d62bfb0dd635f507f227ad))
* **sdk:** add intentFromInstruction helper ([e4cc17a](https://github.com/beharefe/trana/commit/e4cc17a8e9264a0fcd9786c37797493ba738162f))
* **sdk:** add React TranaProvider with inline passkey modal ([e0cfcfe](https://github.com/beharefe/trana/commit/e0cfcfe0f8f33d4f52bd60bc6e3c92d1104df52f))
* **sdk:** derive intent from tx automatically — no instruction arg needed ([5cd63e5](https://github.com/beharefe/trana/commit/5cd63e5dcf9f08ec729ce613af010d1e742b1f8a))
* **sdk:** expose authenticatorData + clientDataJSON in buildTransaction callback ([2aa54d2](https://github.com/beharefe/trana/commit/2aa54d2ef1254b3f13087308b9d8eec67803ad88))
* **sdk:** frictionless authorizeAndSend — instruction as anchor, no ordering convention ([1136b9c](https://github.com/beharefe/trana/commit/1136b9c2f3da9911d0ab7effe972298cb9733e96))
* **sdk:** Phase 1 passkey UX — decoded modals, step indicator, action-context registration ([0cfadee](https://github.com/beharefe/trana/commit/0cfadeea222cfd3ac33b11e2a7c28c14c600e763))
* **sdk:** rebuild as @trana-so/sdk with Apache-2.0 license + auto IDL sync ([7eab177](https://github.com/beharefe/trana/commit/7eab17726e2b5e054b37998e79394cff900fcc76))
* **sdk:** simplify authorizeAndSend — instruction shorthand + optional buildTransaction ([83fdacc](https://github.com/beharefe/trana/commit/83fdacc5f5c4501aa8480368cdd59f0f8eb85c28))
* SEO, AIO, and copy overhaul for landing page ([2e493a2](https://github.com/beharefe/trana/commit/2e493a2d2c570232bd3e2de4449480f6d100972e))
* Trana landing page (Anthropic-quality design) ([2c4f1d2](https://github.com/beharefe/trana/commit/2c4f1d2c1057b16c5364a8dda04fb9be04a4e38d)), closes [#0a0a0a](https://github.com/beharefe/trana/issues/0a0a0a) [#a855f7](https://github.com/beharefe/trana/issues/a855f7)
* **trana_authority:** implement PDA-based authority management program ([baa7257](https://github.com/beharefe/trana/commit/baa725787dcf5c9cecd345bc6119bdec984e18e4))
* **trana_test_vault:** add 4-policy support to demo vault ([fbf8ec0](https://github.com/beharefe/trana/commit/fbf8ec08be89d4efde4ab3cfb55866d73fff0ffd))
* **trana_test_vault:** add passkey-gated SOL vault demo program ([9e8273b](https://github.com/beharefe/trana/commit/9e8273b994c6afd5ea804eb524a1b5a50729bc70))
* **trana_test_vault:** add TimeLocked kind alongside Limit ([52677d4](https://github.com/beharefe/trana/commit/52677d4270f5d651c7cab5890cb9cb2f0d8f99cc))
* **trana_test_vault:** TimeLocked cooldown auto-derived from last_withdraw_slot ([a831744](https://github.com/beharefe/trana/commit/a8317442ba96d235153976cf922d83b15331f8ec))
* **trana-guard:** enforce network feature selection (devnet/localnet/mainnet-beta) ([bfe2822](https://github.com/beharefe/trana/commit/bfe28222f9ead442f4ce7ed6e769c9cf44b05353))
* **trana-guard:** re-apply network feature enforcement after merge ([e3d581d](https://github.com/beharefe/trana/commit/e3d581dda0356f5acc0f88e90113da31aa4d67a9))
* update hero copy to agreed text ([45c19d1](https://github.com/beharefe/trana/commit/45c19d14ad574063312ee498e69d20bc5ba41137))
* vault pattern, attacker demo UI, and full product refocus ([23192b1](https://github.com/beharefe/trana/commit/23192b1ae8da3c4f7ffa163d884bed70da7bcf5b))


### Reverts

* Revert "feat(landing): Trana T mark logo + wordmark" ([d88606e](https://github.com/beharefe/trana/commit/d88606ee8179bbe7761f2b776d0447cb8e984a8e))

# Changelog

All notable changes to `@tranaprotocol/sdk` are documented here.

This file is auto-generated by [semantic-release](https://semantic-release.gitbook.io) on every release.
