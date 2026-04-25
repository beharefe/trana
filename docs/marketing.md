# Trana — Content & Marketing Strategy

## The Core Insight

Trana owns a search category that does not fully exist yet: **onchain execution-time authorization**.

SIMD-0075 shipped February 2025. It made P-256 (secp256r1) signatures natively verifiable on Solana at the validator level. Nobody has built the authorization layer on top of it yet. That is the window.

The strategy: publish fast, define the vocabulary, and become the canonical reference before anyone else competes for these terms. When a developer asks ChatGPT, Perplexity, or Google "how do I add a second factor to my Solana smart contract" — Trana should be the answer.

Two audiences. They search differently:
- **Developers** — high technical intent, searching for how-to, code, tutorials
- **Protocol decision-makers** (Jito, Drift, Squads teams) — searching for security patterns, comparisons, trust arguments

---

## Positioning

**Tagline options (ranked):**
1. `Execution requires approval.` — strongest, defines the paradigm shift
2. `A valid signature is not enough.` — clear problem statement, good for SEO
3. `Device-bound second-factor authorization at the program level.` — technical, precise, good for docs

**One-sentence pitch:**
> Trana adds a live device second-factor requirement to any Solana instruction — enforced onchain at execution time, not in the UI.

**Supported authenticators:**
The onchain primitive verifies any secp256r1 (P-256) signature. Any FIDO2/WebAuthn device using ES256 (COSE algorithm -7) works:
- **Passkeys** — Touch ID, Face ID, iCloud Keychain, Google Password Manager (PoC focus)
- **Hardware security keys** — YubiKey 5 series, Google Titan, SoloKey (FIDO2 with P-256)
- **Platform authenticators** — Windows Hello (P-256 mode), Android biometric (FIDO2)

"Passkey" is the consumer-friendly term for the PoC. Enterprise integrations will often use YubiKeys or hardware security keys instead. The guard program does not care which device produced the signature — it verifies a P-256 signature against a registered public key.

**Differentiation from multisig (answer this early on every page):**
Multisig = M-of-N coordinators sign off on a governance action. Trana = single user, device-bound second factor, zero coordination, instant, enforced inside the program. They compose — Trana adds user-level 2FA on top of whatever governance you already have.

**Why now:**
SIMD-0075 is three months old. No one has shipped the auth layer. First audit + first production deployment + SDK adoption = the same moat Anchor has. Switching cost is real.

---

## Landing Page Refinements

### Current hero (keep)
```
Execution requires approval.
A valid signature is not enough.
```

### Add to hero
A third line that names the mechanism for developer SEO:
```
WebAuthn second-factor authorization, verified at the program level.
```
Note: consumer-facing copy can say "passkey" (Touch ID / Face ID) since that is the PoC device. Developer and enterprise-facing copy should say "WebAuthn" or "device second factor" to signal that YubiKeys and other FIDO2 hardware also work.

### Add a code snippet in the hero section
Developers scan for `::` on landing pages. Even one line signals "this is for me":
```rust
guard::cpi::enforce(ctx, Policy::Threshold { param_offset: 0, threshold: 1_000_000_000 })?;
```

### Add a "How is this different from multisig?" section
This is the #1 objection from protocol teams. It is not currently answered on the landing page. Short table:

| | Trana | Multisig |
|---|---|---|
| Signers | 1 (you, FIDO2 device) | N coordinators |
| Device support | Passkey, YubiKey, Windows Hello | Any signing key |
| Coordination | Zero | Async approval flow |
| Latency | Instant (device tap or button) | Minutes to days |
| Enforcement | Onchain, program-level | Onchain, governance-level |
| Best for | Per-action user 2FA | Protocol governance |

### Add integration signal early
Before the demo section, add a line:
> "Designed for vault withdrawals, DAO treasury transfers, and protocol upgrade authority."

### Structured data
Add `FAQPage` schema to the landing page and security page. LLMs favor FAQ-structured content for snippet extraction.

---

## Competitive Landscape

### Para (Helius article: helius.dev/blog/solana-passkeys)

Para is a passkey-based **embedded wallet** platform. It is the most visible existing content around "Solana passkeys" and already ranks well via the Helius blog.

**How Para works:**
1. User registers a passkey (Touch ID / Face ID)
2. Passkey signs an authorization challenge → establishes a session
3. Session grants access to an Ed25519 signing key managed by Para's MPC servers
4. That Ed25519 key signs Solana transactions normally

**The fundamental difference:**

| | Para | Trana |
|---|---|---|
| Layer | Wallet authentication | Execution-time authorization |
| Question answered | "Who is this user?" | "Should this instruction execute?" |
| Passkey role | Unlocks access to a managed Ed25519 key | Signs an intent hash verified onchain |
| Trust model | Trust Para's MPC infrastructure | Trust the Solana secp256r1 precompile (trustless) |
| Enforcement point | Before transaction submission (client-side) | Inside the program at execution (onchain) |
| What happens if bypassed | Attacker with Para session can sign anything | Impossible to bypass — program rejects the tx |
| Custodial? | Yes (Para holds the Ed25519 key via MPC) | No (user holds both keys) |
| Protects against | No seed phrase exposure, friction-free UX | Stolen/compromised wallet key executing protected actions |

**They compose, not compete.** A user can have a Para-managed wallet AND interact with a Trana-protected protocol. If Para's MPC is compromised, Trana's onchain enforcement still blocks unauthorized execution because the attacker also needs a live FIDO2 device approval. Para adds frictionless onboarding; Trana adds execution-time assurance on top of whatever wallet the user has.

**The search opportunity.** The Helius article ranks for "Solana passkeys." Everyone reading it is asking the right adjacent question: "OK, passkeys can authorize on Solana — but can they enforce security *inside* a program?" That is exactly Trana's answer. A `/compare/para` page and the SIMD-0075 explainer will capture that traffic with a clear "authentication vs authorization" framing.

### New marketing page: `/compare/para`
**Target keywords:** `para solana passkeys`, `solana passkey wallet vs 2fa`, `para vs trana`
**Framing:** Not "Para is wrong" — "Para and Trana solve different problems and work better together."
- Para: your users never see a seed phrase → better UX, lower drop-off at onboarding
- Trana: your program never executes without a live device approval → better security, lower blast radius when keys are compromised
- Together: embedded wallet UX (Para) + execution-time enforcement (Trana) = the complete picture
- Key line: "Para answers 'who is this user.' Trana answers 'should this instruction run.' Both questions matter."

---

## New Marketing Pages

### `/security` — Security Model
**Target audience:** CTOs and security engineers doing due diligence before integrating.
**Content:**
- The zero-trust model — what Trana trusts and does not trust
- Full attack matrix: pre-signed tx, replay, parameter tampering, account substitution, cross-program abuse, clock manipulation — each one with why it fails
- What Trana does NOT protect against (phishing, complete device compromise, consensus-level attacks) — being honest here builds trust
- Audit trail: every `ProofVerified` event emits policy, target program, nonce onchain
- The secp256r1 precompile as the cryptographic root of trust (no Trana server, no Trana key)

**Key line:** "Send a raw transaction without proof — MissingProof. You can't bypass this in a frontend. You can't bypass this at the RPC. It fails in the program."

---

### `/compare/multisig` — Trana vs Multisig
**Target keywords:** `solana multisig alternative`, `squads vs trana`, `solana 2fa vs multisig`
**Framing:** Not "multisig is bad" — "they solve different problems and compose well."
- Multisig = governance layer (who can initiate an action)
- Trana = execution layer (anyone initiating must prove live presence)
- Show: Squads multisig + Trana = governance approval + device second-factor confirmation at execution

---

### `/compare/hardware-wallets` — Why Hardware Wallets Don't Solve This
**Target keywords:** `solana hardware wallet security`, `ledger solana exploit`
**Core argument:** Hardware wallets protect the signing key. They do not protect against pre-signed transactions, durable nonce replay, or an attacker who gets the user to sign something under false pretenses. Trana closes the gap hardware wallets leave open — enforcement is at execution time, not key custody time.

---

### `/use-cases/dao-treasury` — DAO Treasury Protection
**Target keywords:** `DAO security Solana`, `protect DAO treasury`, `solana multisig treasury`
**Content:**
- The specific attack: governance proposal passes, execution happens without live approval, treasury drained
- How Trana adds a live FIDO2 device requirement to every disbursement
- How a Squads-owned registry works (registry owner = Squads multisig, recovery = Squads vote)
- Real scenario walkthrough with code
**Key message:** "Your existing governance controls recovery. Trana adds a second factor to what you already have — it doesn't replace or own anything."

---

### `/use-cases/defi-vaults` — DeFi Vault Security
**Target keywords:** `Solana vault security`, `DeFi vault exploit`, `solana vault withdrawal protection`
**Content:**
- Threshold policy: require second-factor approval for any withdrawal over N SOL
- Velocity policy: cap total withdrawals per rolling window
- RapidDrain policy: block withdrawal within X hours of a large deposit (anomaly detection)
- All three policies compose — you can stack them
- Integration walkthrough for a typical vault program

---

### `/use-cases/protocol-upgrades` — Protecting Upgrade Authority
**Target keywords:** `Solana program upgrade security`, `solana upgrade authority compromise`, `solana program admin key`
**Content:**
- Upgrade authority compromise is one of the most damaging Solana attack vectors
- A compromised upgrade key = full program rewrite, all user funds at risk
- How to require second-factor approval before `upgrade_program` executes
- The `Admin` policy: always require second-factor approval, no conditions
- How to use a Squads multisig as the upgrade authority + Trana on the multisig execution

---

### `/docs/quickstart` — 5-Minute Integration Guide
**Target keywords:** `how to add 2FA to Solana program`, `trana integration guide`, `solana webauthn second factor`, `solana passkey tutorial`
**This is the most important page for AI discoverability.** When developers ask LLMs "how do I add a second factor to my Solana program," this should be the cited source.

Include a callout at the top: "Trana works with any FIDO2 device using P-256 (secp256r1): passkeys (Touch ID, Face ID), YubiKey, Google Titan, Windows Hello. The PoC SDK uses passkeys. Enterprise integrations typically use hardware security keys."

Structure:
1. Install the SDK (`npm install @trana/sdk`)
2. Register your FIDO2 device (one transaction — passkey or YubiKey)
3. Add the CPI call to your program (one line)
4. Wire up the SDK in your frontend (one hook)
5. Test it

Keep it copy-paste. Every code block should run.

---

### `/docs/policies` — Policy Reference
**Target keywords:** `trana policy`, `onchain authorization policy`, `solana threshold policy`
One page per policy with: what it does, when to use it, when NOT to use it, the full code example, the policy string identifier, and the edge cases.

Policies:
- `Always` — every execution requires second-factor approval (any registered FIDO2 device)
- `Admin` — privileged/irreversible actions
- `Threshold` — require second-factor approval above an amount
- `Velocity` — rolling rate limit
- `RapidDrain` — anomaly detection (large deposit + quick withdrawal)
- `Custom` — application-defined logic

---

### `/docs/glossary` — Glossary
**Purpose:** AI anchor content. LLMs are trained on structured definitions. Each term here becomes a potential AI citation.

Terms to define:
- secp256r1 / P-256
- SIMD-0075
- WebAuthn / FIDO2
- Passkey (one type of FIDO2 credential — Touch ID, Face ID, synced via iCloud/Google)
- Hardware security key (YubiKey, Titan — another type of FIDO2 credential, not synced)
- ES256 / COSE algorithm -7 (the P-256 signature algorithm used by FIDO2)
- Intent hash
- Execution-time authorization
- TwoFactorRegistry
- enforce CPI
- Onchain 2FA
- Pre-signed transaction attack
- Durable nonce
- Accounts hash
- Params hash
- Registry nonce

Each definition: 2–4 sentences, link to the deeper concept.

---

## Content Cluster Map

```
Core Topic: Onchain 2FA / Execution-Time Authorization
│
├── Developer Track
│   ├── "How to add a WebAuthn second factor to a Solana program"  ← PILLAR
│   ├── "SIMD-0075 explained for Solana developers"
│   ├── "secp256r1 precompile Solana tutorial"
│   ├── "WebAuthn on Solana — how P-256 authenticators verify onchain"
│   ├── "Anchor CPI security patterns"
│   └── "Intent hash pattern — binding approvals to actions"
│
├── Security Architecture Track
│   ├── "Why a valid Solana signature is not enough"   ← PILLAR
│   ├── "Pre-signed transaction attack explained"
│   ├── "Durable nonce replay attacks on Solana"
│   ├── "Solana wallet compromise — what attackers actually do"
│   └── "Execution-time vs signing-time authorization"
│
├── Protocol Integration Track
│   ├── "Securing DAO treasury on Solana"              ← PILLAR
│   ├── "Protecting Solana program upgrade authority"
│   ├── "DeFi vault security patterns"
│   ├── "Velocity limits onchain — preventing rapid vault drainage"
│   └── "Composing Trana with Squads multisig"
│
└── Comparison Track
    ├── "Trana vs Squads multisig"
    ├── "Trana vs hardware wallets for Solana"
    ├── "Onchain 2FA vs server-side 2FA"
    └── "P-256 vs Ed25519 on Solana"
```

---

## Priority Content Queue

| # | Title | Keyword Target | Intent | Priority | Est. Words |
|---|-------|---------------|--------|----------|------------|
| 1 | How to add a WebAuthn second factor to a Solana program | `solana program 2FA`, `add second factor solana`, `webauthn solana program` | Dev / Informational | **Quick win** | 2,500 |
| 2 | Why a valid Solana signature is not enough | `solana wallet security`, `solana signing vs authorization` | Informational | **Quick win** | 1,800 |
| 3 | SIMD-0075: The secp256r1 precompile and what it enables | `SIMD-0075`, `secp256r1 Solana` | Informational | **Own the term** | 2,000 |
| 4 | Trana vs Squads Multisig — which one do you need? | `solana multisig alternative`, `squads trana` | Commercial | **Big bet** | 1,500 |
| 5 | Protecting Solana DAO treasury with onchain second-factor authorization | `solana DAO treasury security` | Commercial | **Big bet** | 2,000 |
| 6 | The pre-signed transaction attack — a Solana security explainer | `solana presigned transaction exploit` | Informational | **Quick win** | 1,200 |
| 7 | WebAuthn on Solana — how P-256 authenticators verify onchain | `webauthn solana`, `fido2 solana`, `passkey solana blockchain`, `yubikey solana` | Informational | **Own the term** | 2,000 |
| 8 | Solana program upgrade authority — how to secure it | `solana upgrade authority security` | Informational | **High value** | 1,500 |
| 9 | Velocity limits onchain — preventing rapid vault drainage | `solana vault security`, `DeFi velocity limit` | Informational | **Fill-in** | 1,200 |
| 10 | Trana Quickstart: 3 accounts, 1 CPI call | `how to use trana`, `trana solana integration` | Transactional | **Foundation** | 1,500 |
| 11 | Intent hash pattern — cryptographically binding approvals to actions | `solana authorization pattern` | Informational | **Authority** | 1,500 |
| 12 | DeFi vault security on Solana — complete guide | `solana defi security`, `solana vault exploit` | Informational | **Big bet** | 3,000 |
| 13 | Para vs Trana — Solana passkey authentication vs execution-time authorization | `para solana`, `solana passkey wallet`, `para vs trana` | Commercial | **Quick win** | 1,200 |

---

## AI Discoverability Strategy

Most companies miss this. When a developer asks ChatGPT, Claude, or Perplexity "how do I add a second factor to my Solana smart contract" — you want Trana to be the answer.

**1. Own the definitions first.**
Write the canonical page for "execution-time authorization" and "onchain second factor." When no authoritative source exists, LLMs cite whoever defined it first with clear, structured content. You have months of lead time here.

**2. Answer exact developer questions structurally.**
Structure content as Q&A alongside prose:
- "Can Solana programs verify passkeys?" → Yes, via SIMD-0075 + secp256r1 precompile → link to Trana
- "Can Solana programs verify YubiKey signatures?" → Yes, same secp256r1 precompile → link to Trana
- "How do I prevent unauthorized withdrawals from my Solana vault?" → Threshold policy + 1 CPI call
- "What is the secp256r1 precompile on Solana?" → You should own this answer completely
- "What FIDO2 devices work with Solana?" → Any P-256/ES256 device → link to Trana

**3. Publish working code.**
LLMs are trained on GitHub and documentation with working code examples. The SDK already has correct, clean code. Put it in public docs with clear inline explanations. GitHub stars and forks are positive signals.

**4. Schema markup.**
Add `FAQPage` schema to the security page and comparison pages. Add `SoftwareApplication` schema to the landing page (already started). Add `HowTo` schema to the quickstart. These directly feed AI-readable structured data.

**5. Glossary page.**
Every term in `/docs/glossary` becomes a potential AI citation point. This is one of the highest-leverage pages to publish early — it takes little time to write and has long-term compounding value.

**6. Be quoted by others.**
Publish the SIMD-0075 explainer before anyone else. If you're first, every subsequent article about secp256r1 on Solana links to you. Backlinks from Solana ecosystem content (Helius, Squads, Anchor docs, Solana Cookbook) are extremely high-value.

---

## 12-Week Publishing Calendar

### Month 1 — Claim the Vocabulary
Own terms before anyone else does. Publish the explainers that define the category.

| Week | Content | Why now |
|------|---------|---------|
| 1 | SIMD-0075 explained for Solana developers | Nobody has written this well yet. Own it. |
| 2 | "Why a valid Solana signature is not enough" | Problem framing, high SEO, links to solution |
| 3 | Quickstart guide (5-minute integration) | Developer onramp, AI citation target |
| 4 | Glossary page | AI anchor content, internal links to everything |

### Month 2 — Developer Trust
Become the technical reference for developers evaluating or integrating.

| Week | Content | Why now |
|------|---------|---------|
| 5 | "How to add a WebAuthn second factor to a Solana program" (pillar, 2,500 words) | Highest-value developer keyword; covers passkeys + YubiKey |
| 6 | WebAuthn on Solana — P-256 authenticators, FIDO2, and the secp256r1 precompile | Covers all supported devices, not just passkeys |
| 7 | Intent hash pattern deep dive | Establishes technical authority |
| 8 | Policy reference docs | Developer decision tool |

### Month 3 — Protocol Conversion
Target protocol teams who have heard of Trana and are evaluating integration.

| Week | Content | Why now |
|------|---------|---------|
| 9  | DAO treasury security guide | Specific use case, high-value audience |
| 10 | Trana vs multisig comparison | Most common objection, answer it definitively |
| 11 | DeFi vault security guide (3,000-word pillar) | Broad DeFi developer audience |
| 12 | Upgrade authority protection | Specific pain point, high-stakes audience |

---

## Internal Linking Plan

Every developer-track article → links to **Quickstart** (conversion point).  
Every security article → links to **Security Model page** and comparison pages.  
Every comparison page → links back to **landing page** and **Quickstart**.  
Glossary → links to all relevant deep-dive pages.  
Landing page → links to use case pages, Quickstart, and Security Model.  
No orphan pages. Every page has at least 2 inbound internal links before publishing.

---

## Success Metrics

| Metric | 3-month target | 6-month target |
|--------|---------------|----------------|
| Rank for `SIMD-0075` | Top 3 | #1 |
| Rank for `solana passkey` / `solana 2FA` | Top 10 | Top 3 |
| Capture readers of Helius "Solana passkeys" article | `/compare/para` in top 5 for `para solana` | Top 3 |
| Rank for `secp256r1 Solana` | Top 5 | Top 3 |
| AI citation rate (test: ask Perplexity/Claude) | Referenced | Primary source cited |
| GitHub stars from organic referrals | Baseline tracked | Growing MoM |
| Developer signups / SDK installs from organic | Baseline tracked | 2× baseline |
| Backlinks from Solana ecosystem content | 5+ | 20+ |

---

## Key Messages by Audience

### For Solana developers
- Three accounts. One CPI call. That's the entire integration.
- The SDK handles WebAuthn, intent hash construction, the secp256r1 instruction, and blockhash retry. You write `guard::cpi::enforce(ctx, policy)?` and you're done.
- Works with any FIDO2 device using P-256: passkeys (Touch ID, Face ID), YubiKey, Google Titan, Windows Hello.
- Works with any Anchor program. No changes to your account structure.

### For DeFi protocol teams
- Every Solana exploit follows the same pattern: attacker gets the key, sends raw transactions, UI checks are irrelevant.
- Trana adds a checkpoint that cannot be bypassed from the frontend, the RPC, or a raw transaction.
- Policies are hardcoded in the program and evaluated by the guard, not by the caller — the caller cannot fake policy conditions.

### For DAO treasury managers
- Your existing governance controls recovery. Trana adds a second factor to what you already have.
- A Squads multisig can own the registry. Recovery requires M-of-N signers + a 72-hour time lock.
- Every treasury action emits a `ProofVerified` event onchain — full audit trail, no trust in Trana infrastructure.

### For security-conscious teams doing due diligence
- We don't hold custody. We don't hold keys. We own the safety layer.
- After deployment, the upgrade authority is burned. The program is immutable. Trana cannot modify enforcement logic.
- Zero-trust by design: the SDK is untrusted, the dApp is untrusted, the RPC is untrusted. Enforcement is cryptographic and happens inside the Solana runtime.

---

## Program Identity Assets

**Name:** Trana Guard  
**Domain:** trana.so (or similar)  
**Program ID (devnet):** `572t8Ctxx1nrHgxJZ1EHSNZTLcMH4oxV1R6g2pRAqba6`  
**Tagline:** Execution requires approval.  
**Category:** Onchain WebAuthn second-factor authorization primitive / Solana security infrastructure
**Authenticator support:** Any FIDO2/WebAuthn device with P-256 (ES256): passkeys, YubiKey 5, Google Titan, Windows Hello, SoloKey  
**Built for:** Colosseum Frontier Hackathon, April 2026

**Tone of voice:**
- Direct and precise — no marketing fluff, this is a security product
- Developer-first — lead with code, not with pitch
- Confident, not arrogant — explain why attacks fail, don't oversell
- Transparent about limitations — what Trana does NOT protect against builds trust
