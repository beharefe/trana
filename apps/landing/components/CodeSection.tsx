"use client"

import { useState } from "react"

// § 04 — One CPI call: tabbed code block

const PROTECTED_RS = `// programs/vault/src/instructions/withdraw.rs
use anchor_lang::prelude::*;
use trana_guard::cpi::{require};

pub fn withdraw(ctx: Context<Withdraw>, amount: u64) -> Result<()> {
    trana_guard::require(
        &ctx.accounts.guard,
        &ctx.accounts.user,
    )?;

    token::transfer(
        ctx.accounts.into_transfer_context(),
        amount,
    )?;
    Ok(())
}`

const UNPROTECTED_RS = `// programs/vault/src/instructions/withdraw.rs
use anchor_lang::prelude::*;

// any signer can drain — protected only by the seed
pub fn withdraw(ctx: Context<Withdraw>, amount: u64) -> Result<()> {
    token::transfer(
        ctx.accounts.into_transfer_context(),
        amount,
    )?;
    Ok(())
}`

const CLIENT_TS = `// client/withdraw.ts
import { TranaGuard } from "@trana/sdk";

const guard = await TranaGuard.load(connection, vault);

const proof = await guard.prove({
  intent: "vault::withdraw",
  amount: 2_500_000_000n,
});

await program.methods
  .withdraw(2_500_000_000n)
  .preInstructions(proof.instructions)  // secp256r1 + record_proof
  .accounts({ guard: guard.address })
  .rpc();`

type Tab = "after" | "before" | "ts"

export function CodeSection() {
  const [tab, setTab] = useState<Tab>("after")
  const [copied, setCopied] = useState(false)

  function handleCopy() {
    const src = tab === "after" ? PROTECTED_RS : tab === "before" ? UNPROTECTED_RS : CLIENT_TS
    navigator.clipboard.writeText(src).catch(() => {})
    setCopied(true)
    setTimeout(() => setCopied(false), 1100)
  }

  return (
    <section id="code" className="relative border-b py-16 md:py-24" style={{ borderColor: "var(--rule)" }}>
      <div className="sec-wrap">

        <div className="sec-header">
          <div className="font-mono text-[11px] tracking-[0.22em] uppercase" style={{ color: "var(--bone-4)" }}>
            <span style={{ color: "var(--bone-2)" }}>§ 04</span> ONE CPI CALL
          </div>
          <div>
            <h2 className="font-serif font-normal leading-[1.02] tracking-[-0.02em] m-0 text-balance" style={{ fontSize: "clamp(34px,4.4vw,56px)", color: "var(--bone)" }}>
              Three lines of <em>Anchor.</em><br />Zero changes to your token logic.
            </h2>
            <p className="mt-5 text-[17px] leading-[1.55] font-light max-w-[640px]" style={{ color: "var(--bone-2)" }}>
              Drop <span className="font-mono" style={{ color: "var(--bone)" }}>trana_guard::require</span> at the top of your handler.
              Pass the guard PDA. Done. Your program is now protected by execution-time
              authorization without restructuring a single account.
            </p>
          </div>
        </div>

        {/* Code block */}
        <div className="border overflow-hidden" style={{ borderColor: "var(--rule)", background: "var(--ink-2)" }}>
          {/* Tabs */}
          <div className="flex items-stretch border-b" style={{ borderColor: "var(--rule)", background: "var(--ink)" }}>
            {/* Scrollable tab strip */}
            <div className="flex flex-1 min-w-0 overflow-x-auto">
              {(["after", "before", "ts"] as Tab[]).map(t => {
                const label = t === "after" ? "protected.rs" : t === "before" ? "unprotected.rs" : "client.ts"
                const active = tab === t
                return (
                  <button
                    key={t}
                    onClick={() => setTab(t)}
                    className="flex items-center gap-[9px] px-[18px] py-3 font-mono text-[11px] tracking-[0.18em] uppercase shrink-0 transition-colors"
                    style={{
                      borderRight: "1px solid var(--rule)",
                      color: active ? "var(--bone)" : "var(--bone-4)",
                      background: active ? "var(--ink-2)" : "transparent",
                      boxShadow: active ? "inset 0 -2px 0 var(--lime)" : "none",
                      cursor: "pointer",
                    }}
                  >
                    <span className="w-[6px] h-[6px] rounded-full shrink-0" style={{ background: active ? "var(--lime)" : "var(--bone-5)" }} />
                    {label}
                  </button>
                )
              })}
            </div>
            {/* Meta + copy — always visible */}
            <div className="flex items-center gap-3 px-4 shrink-0 font-mono text-[10.5px] tracking-[0.18em] uppercase" style={{ borderLeft: "1px solid var(--rule)", color: "var(--bone-4)" }}>
              <span className="hidden sm:inline">+3 / −0 LoC</span>
              <button
                onClick={handleCopy}
                className="border px-2.5 py-[5px] font-mono text-[10px] tracking-[0.16em] uppercase cursor-pointer transition-colors"
                style={{ border: "1px solid var(--rule)", color: copied ? "var(--lime)" : "var(--bone-3)", background: "transparent" }}
              >
                {copied ? "Copied" : "Copy"}
              </button>
            </div>
          </div>

          {/* Pane */}
          {tab === "after" && <ProtectedPane />}
          {tab === "before" && <UnprotectedPane />}
          {tab === "ts" && <ClientPane />}
        </div>

        {/* Lede */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-14 mt-9">
          <div>
            <h4 className="font-serif font-normal text-[22px] tracking-[-0.01em] mb-2" style={{ color: "var(--bone)" }}>Audited the macro.</h4>
            <p className="m-0 text-[14.5px] leading-[1.6] font-light" style={{ color: "var(--bone-2)" }}>
              <span className="font-mono" style={{ color: "var(--bone)" }}>require!</span> expands to a single CPI to a single instruction
              on a single program. No magic accounts, no hidden upgrades.
              Read the lowering yourself.
            </p>
          </div>
          <div>
            <h4 className="font-serif font-normal text-[22px] tracking-[-0.01em] mb-2" style={{ color: "var(--bone)" }}>Reverts <em>cleanly</em>.</h4>
            <p className="m-0 text-[14.5px] leading-[1.6] font-light" style={{ color: "var(--bone-2)" }}>
              On a missing or malformed proof, the action returns{" "}
              <span className="font-mono" style={{ color: "var(--plasma)" }}>GuardError::ProofRequired</span>. The transaction reverts at
              the instruction boundary — nothing ever lands.
            </p>
          </div>
        </div>

      </div>
    </section>
  )
}

// ── Code pane sub-components ──────────────────────────────────────────────────

const LN_GUTTER = "text-right pr-[14px] border-r select-none"
const LN_STYLE  = { color: "var(--bone-5)", borderColor: "var(--rule)" }

function ProtectedPane() {
  return (
    <div>
      <div className="grid font-mono text-[13px] leading-[1.85] py-4" style={{ gridTemplateColumns: "50px 1fr" }}>
        <div className={LN_GUTTER} style={LN_STYLE}>
          {Array.from({ length: 15 }, (_, i) => <div key={i}>{i + 1}</div>)}
        </div>
        <div className="px-[22px] overflow-x-auto" style={{ color: "var(--bone-2)", whiteSpace: "pre" }}>
          <span style={{ color: "var(--bone-5)", fontStyle: "italic" }}>{"// programs/vault/src/instructions/withdraw.rs\n"}</span>
          <span style={{ color: "#e08c63" }}>{"use "}</span><span style={{ color: "#a99cff" }}>{"anchor_lang"}</span>{"::prelude::*;\n"}
          <span style={{ color: "#e08c63" }}>{"use "}</span><span style={{ color: "#a99cff" }}>{"trana_guard"}</span>{"::cpi::{"}
          <span style={{ color: "var(--azure)" }}>{"require"}</span>{"}};\n\n"}
          <span style={{ color: "#e08c63" }}>{"pub fn "}</span>
          <span style={{ color: "var(--azure)" }}>{"withdraw"}</span>
          {"(ctx: "}<span style={{ color: "#a99cff" }}>{"Context"}</span>{"<"}<span style={{ color: "#a99cff" }}>{"Withdraw"}</span>{">, amount: "}<span style={{ color: "#a99cff" }}>{"u64"}</span>
          {") -> "}<span style={{ color: "#a99cff" }}>{"Result"}</span>{"<()> {\n"}
          <span style={{ display: "block", background: "linear-gradient(90deg, rgba(198,255,58,0.10), rgba(198,255,58,0.04) 80%, transparent)", boxShadow: "inset 3px 0 0 var(--lime)", paddingLeft: "6px", marginLeft: "-6px" }}>
            {"    "}<span style={{ color: "var(--lime)", textShadow: "0 0 18px rgba(198,255,58,0.45)" }}>{"trana_guard::require"}</span>{"(\n"}
            {"        &ctx.accounts.guard,\n"}
            {"        &ctx.accounts.user,\n"}
            {"    )?;\n"}
          </span>
          {"\n    token::transfer(\n"}
          {"        ctx.accounts.into_transfer_context(),\n"}
          {"        amount,\n"}
          {"    )?;\n"}
          {"    "}<span style={{ color: "#a99cff" }}>{"Ok"}</span>{"(())\n}"}
        </div>
      </div>
      <div className="flex items-center gap-4 px-[18px] py-[14px] border-t flex-wrap font-mono text-[11px]" style={{ borderColor: "var(--rule)", color: "var(--bone-3)" }}>
        <span className="uppercase tracking-[0.18em] text-[10px]" style={{ color: "var(--bone-4)" }}>DIFF</span>
        <span style={{ color: "var(--lime)" }}>+3 lines · trana_guard::require</span>
        <span style={{ color: "var(--plasma)" }}>−0 lines · token logic untouched</span>
        <span className="ml-auto uppercase tracking-[0.18em] text-[10px]" style={{ color: "var(--bone-4)" }}>PROGRAM ID</span>
        <span style={{ color: "var(--bone-2)" }}>TRAqChewX8boPDuBbVXjS7iCQAnh9gDThfBRwXauwsG</span>
      </div>
    </div>
  )
}

function UnprotectedPane() {
  return (
    <div>
      <div className="grid font-mono text-[13px] leading-[1.85] py-4" style={{ gridTemplateColumns: "50px 1fr" }}>
        <div className={LN_GUTTER} style={LN_STYLE}>
          {Array.from({ length: 12 }, (_, i) => <div key={i}>{i + 1}</div>)}
        </div>
        <div className="px-[22px] overflow-x-auto" style={{ color: "var(--bone-2)", whiteSpace: "pre" }}>
          <span style={{ color: "var(--bone-5)", fontStyle: "italic" }}>{"// programs/vault/src/instructions/withdraw.rs\n"}</span>
          <span style={{ color: "#e08c63" }}>{"use "}</span><span style={{ color: "#a99cff" }}>{"anchor_lang"}</span>{"::prelude::*;\n\n"}
          <span style={{ color: "var(--bone-5)", fontStyle: "italic" }}>{"// any signer can drain — protected only by the seed\n"}</span>
          <span style={{ color: "#e08c63" }}>{"pub fn "}</span>
          <span style={{ color: "var(--azure)" }}>{"withdraw"}</span>
          {"(ctx: "}<span style={{ color: "#a99cff" }}>{"Context"}</span>{"<"}<span style={{ color: "#a99cff" }}>{"Withdraw"}</span>{">, amount: "}<span style={{ color: "#a99cff" }}>{"u64"}</span>
          {") -> "}<span style={{ color: "#a99cff" }}>{"Result"}</span>{"<()> {\n"}
          {"    token::transfer(\n"}
          {"        ctx.accounts.into_transfer_context(),\n"}
          {"        amount,\n"}
          {"    )?;\n"}
          {"    "}<span style={{ color: "#a99cff" }}>{"Ok"}</span>{"(())\n}"}
        </div>
      </div>
      <div className="flex items-center gap-4 px-[18px] py-[14px] border-t flex-wrap font-mono text-[11px]" style={{ borderColor: "var(--rule)", color: "var(--bone-3)" }}>
        <span className="uppercase tracking-[0.18em] text-[10px]" style={{ color: "var(--bone-4)" }}>STATE</span>
        <span style={{ color: "var(--plasma)" }}>UNPROTECTED · signer is sufficient</span>
        <span className="ml-auto uppercase tracking-[0.18em] text-[10px]" style={{ color: "var(--bone-4)" }}>RISK</span>
        <span style={{ color: "var(--plasma)" }}>leaked seed → drained pool</span>
      </div>
    </div>
  )
}

function ClientPane() {
  return (
    <div>
      <div className="grid font-mono text-[13px] leading-[1.85] py-4" style={{ gridTemplateColumns: "50px 1fr" }}>
        <div className={LN_GUTTER} style={LN_STYLE}>
          {Array.from({ length: 14 }, (_, i) => <div key={i}>{i + 1}</div>)}
        </div>
        <div className="px-[22px] overflow-x-auto" style={{ color: "var(--bone-2)", whiteSpace: "pre" }}>
          <span style={{ color: "var(--bone-5)", fontStyle: "italic" }}>{"// client/withdraw.ts\n"}</span>
          <span style={{ color: "#e08c63" }}>{"import"}</span>{" { "}<span style={{ color: "#a99cff" }}>{"TranaGuard"}</span>{" } "}<span style={{ color: "#e08c63" }}>{"from"}</span>{" "}<span style={{ color: "#d8b65a" }}>{'"@trana/sdk"'}</span>{";\n\n"}
          <span style={{ color: "#e08c63" }}>{"const"}</span>{" guard = "}<span style={{ color: "#e08c63" }}>{"await"}</span>{" "}<span style={{ color: "#a99cff" }}>{"TranaGuard"}</span>{"."}<span style={{ color: "var(--azure)" }}>{"load"}</span>{"(connection, vault);\n\n"}
          <span style={{ display: "block", background: "linear-gradient(90deg, rgba(198,255,58,0.10), rgba(198,255,58,0.04) 80%, transparent)", boxShadow: "inset 3px 0 0 var(--lime)", paddingLeft: "6px", marginLeft: "-6px" }}>
            <span style={{ color: "#e08c63" }}>{"const"}</span>{" proof = "}<span style={{ color: "#e08c63" }}>{"await"}</span>{" guard."}<span style={{ color: "var(--azure)" }}>{"prove"}</span>{"({\n"}
            {"  intent: "}<span style={{ color: "#d8b65a" }}>{'"vault::withdraw"'}</span>{",\n"}
            {"  amount: "}<span style={{ color: "#d8b65a" }}>{"2_500_000_000n"}</span>{",\n"}
            {"});\n"}
          </span>
          {"\n"}<span style={{ color: "#e08c63" }}>{"await"}</span>{" program.methods\n"}
          {"  ."}<span style={{ color: "var(--azure)" }}>{"withdraw"}</span>{"("}<span style={{ color: "#d8b65a" }}>{"2_500_000_000n"}</span>{")\n"}
          {"  .preInstructions(proof.instructions)  "}<span style={{ color: "var(--bone-5)", fontStyle: "italic" }}>{"// secp256r1 + record_proof"}</span>{"\n"}
          {"  .accounts({ guard: guard.address })\n"}
          {"  .rpc();"}
        </div>
      </div>
      <div className="flex items-center gap-4 px-[18px] py-[14px] border-t flex-wrap font-mono text-[11px]" style={{ borderColor: "var(--rule)", color: "var(--bone-3)" }}>
        <span className="uppercase tracking-[0.18em] text-[10px]" style={{ color: "var(--bone-4)" }}>CEREMONY</span>
        <span style={{ color: "var(--azure)" }}>WebAuthn · ≤ 1.2s on-device</span>
        <span className="ml-auto uppercase tracking-[0.18em] text-[10px]" style={{ color: "var(--bone-4)" }}>PRE-IXS</span>
        <span style={{ color: "var(--bone-2)" }}>2 (auto-built)</span>
      </div>
    </div>
  )
}
