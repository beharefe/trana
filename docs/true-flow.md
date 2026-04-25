# True Flow — Sign Then Approve

## The UX Principle

Every user already understands 2FA:
1. Enter password → confirm who you are
2. Enter code / biometric → prove it's really you

Trana should feel exactly like this:

```
Click "Withdraw"
  → Phantom popup    (wallet signs — "I am authorizing this transaction")
  → Touch ID prompt  (passkey approves — "and I physically confirm it")
  → Done
```

The current SDK implementation has these two steps swapped — passkey first,
wallet sign second. It works and is secure, but it feels backwards. The wallet
signature is the main credential. The passkey is the second factor confirmation.
Second factor should come second.

---

## Proposed Flow

```
1. User initiates action (click Withdraw, Transfer, etc.)
2. SDK simulates transaction — detect which policy fires
3. Build intent hash (accounts + params + policy + nonce)
4. Fetch fresh blockhash
5. Build full transaction with proof placeholders
   → tx = [secp256r1_ix, record_proof_ix, protected_ix]
   → recentBlockhash already set
6. Wallet signs transaction         ← Phantom / Backpack popup
   → User sees exactly what they're signing (full decoded tx)
7. Passkey approves intent hash     ← Touch ID / Face ID / YubiKey
   → 1–3 seconds for biometrics
8. Insert real secp256r1 + record_proof into signed tx
9. Send
```

Compare to current:
```
Current:  Simulate → Intent → Passkey → Blockhash → Build tx → Wallet sign → Send
Proposed: Simulate → Intent → Blockhash → Build tx → Wallet sign → Passkey → Send
```

One conceptual change: blockhash is fetched before the wallet sign (step 4),
not after the passkey (as it is today).

---

## Why This Is Better

**Mental model matches existing 2FA habits.**
Password then second factor. Main credential then confirmation. Users don't need
to learn a new interaction pattern.

**Wallet shows the complete transaction.**
When Phantom displays the transaction for signing, the proof instructions are
already in it. The user (and wallet) see the full picture — not a partial
transaction that gets modified after approval.

**Passkey is clearly a confirmation step.**
By placing it after the wallet sign, it reads as "you signed it, now confirm
with biometrics." This is more reassuring than "biometrics first, then sign
something."

---

## Concerns

### 1. Blockhash expiry window

**The concern:** Blockhash expires after ~90 seconds (150 blocks × 400ms).
If blockhash is fetched at step 4, the clock starts ticking. If the user is
slow with the wallet popup (step 6) or the passkey device (step 7), the
transaction arrives at the validator with an expired blockhash.

**In practice:** Touch ID and Face ID take 1–3 seconds. A slow user completing
both wallet sign and passkey in under 30 seconds total is realistic. Under 90
seconds is almost guaranteed for biometric passkeys.

**The real risk:** Hardware security keys (YubiKey). The user has to find it,
plug it in, tap it. This could take 30–60 seconds. Combined with a slow wallet
popup, expiry becomes possible.

**Mitigation:** Catch the blockhash expired error, fetch a fresh blockhash,
and retry from step 4. The passkey proof is still valid — it signs the intent
hash which does NOT include the blockhash. Only the wallet needs to re-sign.
Show a simple "Transaction timed out — please re-confirm in your wallet" message.

### 2. Wallet signs a transaction it can't fully verify

**The concern:** At step 6, the wallet signs a transaction that includes
secp256r1 and record_proof instructions. Most wallet UIs (Phantom, Backpack)
will show these as unrecognized instructions or raw byte blobs. The user may
not understand what they're signing.

**Mitigation:** This is an existing problem for all multi-instruction transactions.
Wallet UX for complex transactions is a known gap in the Solana ecosystem.
In the short term, app-level UI (show a clear breakdown of what the tx does)
compensates. Long term, wallet simulation views (Phantom's transaction preview)
will improve.

### 3. Transaction modified after wallet signs

**Current implementation:** Wallet signs last, after proofs are built. The
signed transaction is final.

**Proposed flow (as stated above):** Wallet signs at step 6, then passkey
approves at step 7, then proof instructions are finalized and inserted at step 8.

**This is actually a problem.** If the wallet signed a transaction with placeholder
proof instructions, and we swap them out for the real ones at step 8, the wallet
signature is invalid. The serialized transaction changed.

**Resolution:** There are two clean options:

**Option A — Wallet signs twice (bad UX):**
Wallet approves intent hash as a message (step 6), passkey approves (step 7),
then wallet signs the actual transaction (step 8). Two wallet interactions.
Terrible UX.

**Option B — Build real proofs before wallet signs (requires passkey first):**
This is the current flow. Passkey must go first so the real secp256r1 and
record_proof instructions exist before the wallet signs. The wallet signs a
complete, final transaction.

**Implication:** A true "wallet first, passkey second" flow where the wallet
signs a complete final transaction requires the proof to be pre-built — which
means the passkey must have already approved. **The two goals are in direct
conflict at the cryptographic level.**

### 4. The real resolution

The "sign first then passkey" UX feel CAN be achieved without actually signing
first, by changing the UI presentation:

```
Step 5: Show user a decoded preview of the transaction
        ("You are withdrawing 1 SOL to address X using trana.threshold policy")
Step 6: Passkey approves   ← biometric, fast
Step 7: Fetch fresh blockhash
Step 8: Wallet signs final transaction  ← Phantom popup appears now
Step 9: Send
```

The trick: show a **trana-level confirmation UI** before the passkey prompt.
The user sees exactly what they're authorizing (decoded from the intent input)
BEFORE touching the passkey. The passkey becomes the "commit" gesture, and
the wallet sign is the mechanical final step.

From the user's perspective the flow reads:
1. "Here is what you're about to do" (trana preview UI)
2. "Confirm with Touch ID" (passkey — the meaningful approval)
3. Phantom popup auto-approved or minimal (just the send confirmation)

This is arguably better than wallet-first because the passkey IS the moment
of decision, and the wallet sign is just the submission mechanism.

---

## Recommendation

Do not swap the order in the SDK. Instead:

1. **Add a trana confirmation UI step** before the passkey prompt. Show a
   human-readable breakdown: action, amount, destination, policy firing,
   fee. Make the passkey the "I confirm this" gesture.

2. **Improve blockhash retry handling.** If the wallet sign fails with
   blockhash expired, silently retry with a fresh hash and re-prompt the
   wallet. No need to re-run the passkey.

3. **Document the flow clearly for integrators.** The order is passkey then
   wallet — explain why, and provide UI copy for the passkey confirmation screen.

The UX feel of "sign + approve" is achievable through presentation, not by
reordering the cryptographic steps.

---

## Current Status

- SDK: passkey first, wallet sign second (correct order, suboptimal presentation)
- Tests: R8 and R9 validate the flow is resilient to delays
- Missing: trana confirmation UI component (shows decoded intent before passkey)
- Missing: blockhash expiry retry logic in useTrana.ts
