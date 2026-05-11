# Trana — 2-Minute Pitch Script
### Colosseum Frontier · TED-style camera + slides

---

## How the video works

You record **one continuous take** looking straight at the camera.  
In the video editor you cut away to a slide, then cut back to you.  
Think of it like a news anchor: the anchor talks, then the clip plays, then it's back to the anchor.

```
[YOU on camera] → [SLIDE full screen] → [YOU on camera] → [SLIDE] → [YOU] → ...
```

**Three types of shots in the edit:**

| Shot | What viewer sees | When to use |
|---|---|---|
| 🎥 **CAMERA** | Your face, full screen | Opening, emotional beats, closing |
| 📊 **SLIDE** | Slide full screen, no camera | When you reference a specific visual |
| 🎥+📊 **BOTH** | You in frame, slide behind or PiP | Optional — only if your setup allows |

For a simple Colosseum recording:  
1. Record yourself with phone/webcam — one clean take  
2. Open `/slides` full screen, record a **separate** screencast of you clicking through  
3. In CapCut / iMovie / DaVinci: your camera is the main track, slide screencasts are dropped on top when needed

---

## The Script

---

### 🎥 CAMERA · 0:00–0:08
> "Your wallet proves you own the key.  
> It cannot stop someone who stole it."

*Open on you. Direct eye contact. Let the second sentence land with a full pause.*

---

### 📊 SLIDE 1 (Problem) · 0:08–0:26
*Cut to slide. You keep talking — viewer reads the headline while hearing your voice.*

> "When a device is compromised — and they are, every week —  
> the attacker doesn't need your app.  
> They send a raw transaction.  
> Valid signature. Funds gone.  
> This is not a wallet bug. It's a missing primitive."

---

### 🎥 CAMERA · 0:26–0:30
*Cut back to you for the turn — energy lifts slightly.*

> "Until earlier this year."

---

### 📊 SLIDE 2 (Insight) · 0:30–0:48
> "Solana added native support for hardware-backed authentication  
> directly in the validator runtime.  
> Devices people already trust — phones, laptops, security keys —  
> can now authorize actions directly onchain.  
> No server. No bridge."

---

### 🎥 CAMERA · 0:48–0:58
*Back to you. Slow down here. This is your product moment.*

> "That's trana.  
> One guarantee:  
> this instruction cannot execute  
> unless a real human authorized it —  
> right now, for exactly this action."

---

### 📊 SLIDE 4 (Why Trana — animation) · 0:58–1:18
*Cut to the slide and let the animation play. You narrate over it.*

> "A wallet signs. Trana Guard evaluates the proof at the instruction level.  
> Hardware says yes — program runs.  
> It doesn't matter who has the key.  
> There is no client-side component to bypass."

---

### 📊 SLIDE 5 (Integration) · 1:18–1:26
> "For developers: one CPI call. No new wallet. No infrastructure."

---

### 📊 SLIDE 6 (Authority primitive) · 1:26–1:37
> "Any Solana authority can require runtime authorization.  
> Upgrade authorities. Mint authorities. Treasury signers. Bridge withdrawals.  
> Stolen key can request a deploy. It cannot authorize one."

---

### 🎥 CAMERA · 1:37–1:42
*Back to you for the market moment — confidence.*

> "Seven billion in Solana TVL.  
> Every protocol holding it — our market."

---

### 📊 SLIDE 9 (Market) · 1:42–1:48
> "As hardware auth spreads cross-chain: two hundred billion."

---

### 🎥 CAMERA · 1:48–2:00
*Finish on camera. No slide. Eye contact the whole close.*

> "Devnet is live — try the vault demo today.  
> The demo isn't 'look Face ID works.'  
> The demo is: a stolen key still cannot execute.  
>  
> Multisig protects coordination.  
> trana protects execution.  
>  
> I'm Efe — Colosseum Breakout infra track winner,  
> now building the missing runtime primitive Solana needs.  
> Thank you."

---

## Pacing cheat-sheet

| Beat | Tip |
|---|---|
| "It cannot stop someone who stole it." | Full stop. 1-second pause. Let it land. |
| "Until earlier this year." | Slight smile — this is the turn. |
| "No server. No bridge." | Two beats. Each one separate. |
| "That's trana." | Slowest line in the whole script. |
| "right now, for exactly this action." | Emphasise "right now" — that's the product. |
| "It doesn't matter who has the key." | Say it like it's obvious. Because it should be. |
| "Stolen key can request a deploy. It cannot authorize one." | Two sentences. Pause between them. |
| "Multisig protects coordination. trana protects execution." | These are equal weight. Don't rush either. |
| "missing runtime primitive Solana needs." | Your last real sentence. Say it like a fact. |
| "Thank you." | Look at lens. Don't look away. Don't smile too early. |

---

## Positioning reminders

- The product is **runtime second-factor authorization** — not passkeys, not Face ID, not P-256
- Passkeys are an implementation detail; the *category* is hardware-backed authorization
- "Missing runtime primitive" — that is how judges should categorize this, not "security feature"
- The demo point: **"a stolen key still cannot execute privileged actions"** — lead with that
- Multisig is not competition — "Trana composes naturally with systems like Squads by gating final execution"
- Open source core is a trust argument, not a liability — say it proudly

---

## What to skip

Slides **7** (Policies), **8** (Where It Matters), **10** (Business Model) are not in this script.  
They live in the deck for Q&A — the 2-min arc doesn't need them.

---

## Factual notes

- ✅ Colosseum Breakout infra track winner (Action Codes)
- ✅ "I" not "we" — solo founder
- ❌ Do NOT say "Solana Foundation grantee" — not yet for Trana
- ✅ "Devnet is live" — confirmed
- ❌ Do NOT say "passkey" as the product — say "hardware-backed authorization"
- ❌ Do NOT say "P-256" in the pitch — too cryptography-heavy
- ✅ "hardware says yes" replaces "passkey says yes"
