"use client";

import { useEffect, useRef } from "react";
import type AnimeJS from "animejs";

// ── Shared helpers exported for policy sections ───────────────────────────────

export function GridBg() {
  return (
    <div
      aria-hidden
      className="absolute inset-0 pointer-events-none"
      style={{
        backgroundImage: [
          "linear-gradient(to right, rgba(255,255,255,0.025) 1px, transparent 1px)",
          "linear-gradient(to bottom, rgba(255,255,255,0.025) 1px, transparent 1px)",
        ].join(","),
        backgroundSize: "64px 64px",
        maskImage:
          "radial-gradient(ellipse 70% 60% at 50% 40%, black 30%, transparent 80%)",
        WebkitMaskImage:
          "radial-gradient(ellipse 70% 60% at 50% 40%, black 30%, transparent 80%)",
      }}
    />
  );
}

export function CodeCard({
  filename,
  accent,
  children,
}: {
  filename: string;
  accent?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="hidden lg:block absolute right-12 bottom-12 w-[min(420px,38vw)] bg-[#0f1013] border border-white/[0.08] rounded-xl overflow-hidden font-mono shadow-[0_24px_60px_rgba(0,0,0,0.5),0_0_0_1px_rgba(255,255,255,0.02)]">
      <div className="flex items-center justify-between px-3.5 py-2.5 border-b border-white/[0.08] text-[11px] text-faint tracking-[0.04em]">
        <div className="flex gap-1.5">
          <i
            className="w-2 h-2 rounded-full not-italic"
            style={{ background: accent ?? "rgba(255,255,255,0.12)" }}
          />
          <i className="w-2 h-2 rounded-full bg-white/[0.12] not-italic" />
          <i className="w-2 h-2 rounded-full bg-white/[0.12] not-italic" />
        </div>
        <span>{filename}</span>
      </div>
      <pre className="px-[18px] py-4 text-[13px] leading-[1.65] text-zinc-300 whitespace-pre overflow-x-auto">
        {children}
      </pre>
    </div>
  );
}

// ── Hero flow — HTML/CSS animated via anime.js ────────────────────────────────
function HeroFlow() {
  const containerRef = useRef<HTMLDivElement>(null);
  const pillRef = useRef<HTMLDivElement>(null);
  const shieldGlowRef = useRef<HTMLDivElement>(null);
  const blockGlowRef = useRef<HTMLDivElement>(null);
  const passkeyRef = useRef<HTMLDivElement>(null);
  const statusRef = useRef<HTMLSpanElement>(null);
  const checkRef = useRef<SVGPathElement>(null);
  const xRef = useRef<SVGPathElement>(null);

  useEffect(() => {
    let stopped = false;

    async function run() {
      const { default: anime } = (await import("animejs")) as {
        default: typeof AnimeJS;
      };
      if (stopped) return;

      const container = containerRef.current;
      const pill = pillRef.current;
      const shieldGlow = shieldGlowRef.current;
      const blockGlow = blockGlowRef.current;
      const passkey = passkeyRef.current;
      const status = statusRef.current;
      const check = checkRef.current;
      const xPath = xRef.current;

      if (
        !container ||
        !pill ||
        !shieldGlow ||
        !blockGlow ||
        !passkey ||
        !status ||
        !check ||
        !xPath
      )
        return;

      const PILL_W = 140;

      while (!stopped) {
        const W = container.getBoundingClientRect().width;
        const shieldCX = W / 2;
        const startX = W * 0.08;
        const nearX = shieldCX - PILL_W - 30;
        const hitX = shieldCX - PILL_W + 14;
        const backX = shieldCX - PILL_W - 55;
        const passX = shieldCX + 22;
        const endX = W * 0.88 - PILL_W;

        // ── reset (translateX only — no left mixing) ─────────────────────
        anime.set(pill, { translateX: startX, opacity: 1 });
        anime.set(shieldGlow, { opacity: 0 });
        anime.set(blockGlow, { opacity: 0 });
        anime.set(xPath, { opacity: 0 });
        anime.set(passkey, { opacity: 0, translateX: "-50%", translateY: 18 });
        (check as SVGPathElement).style.strokeDashoffset = "46";
        (check as SVGPathElement).style.transition = "none";
        status.textContent = "TX · SIGNED";
        await new Promise<void>((r) => requestAnimationFrame(() => r()));
        await anime({ targets: {}, duration: 450, easing: "linear" }).finished;
        if (stopped) break;

        // ── travel toward shield ─────────────────────────────────────────
        await anime({
          targets: pill,
          translateX: nearX,
          duration: 1300,
          easing: "cubicBezier(.4,.0,.2,1)",
        }).finished;
        if (stopped) break;

        // ── blocked ──────────────────────────────────────────────────────
        anime({
          targets: blockGlow,
          opacity: 1,
          duration: 400,
          easing: "linear",
        });
        anime({ targets: xPath, opacity: 1, duration: 250, easing: "linear" });
        await anime({
          targets: pill,
          translateX: hitX,
          duration: 380,
          easing: "cubicBezier(.5,1.6,.4,1)",
        }).finished;
        status.textContent = "TRANA GUARD · TRIGGERED";
        if (stopped) break;
        await anime({
          targets: pill,
          translateX: backX,
          duration: 340,
          easing: "cubicBezier(.2,.8,.2,1)",
        }).finished;
        await anime({ targets: {}, duration: 420, easing: "linear" }).finished;
        if (stopped) break;

        // ── passkey rises ────────────────────────────────────────────────
        anime({
          targets: passkey,
          opacity: 1,
          translateX: "-50%",
          translateY: 0,
          duration: 600,
          easing: "cubicBezier(.2,.8,.2,1)",
        });
        status.textContent = "PASSKEY · REQUIRED";
        await anime({ targets: {}, duration: 1200, easing: "linear" }).finished;
        if (stopped) break;

        // ── authorized ───────────────────────────────────────────────────
        anime({ targets: xPath, opacity: 0, duration: 250, easing: "linear" });
        anime({
          targets: blockGlow,
          opacity: 0,
          duration: 400,
          easing: "linear",
        });
        anime({
          targets: shieldGlow,
          opacity: 1,
          duration: 500,
          easing: "linear",
        });
        (check as SVGPathElement).style.transition =
          "stroke-dashoffset .55s ease";
        (check as SVGPathElement).style.strokeDashoffset = "0";
        status.textContent = "PROOF · VERIFIED";
        await anime({ targets: {}, duration: 700, easing: "linear" }).finished;
        if (stopped) break;

        // ── pill passes shield ───────────────────────────────────────────
        anime({
          targets: passkey,
          opacity: 0,
          translateX: "-50%",
          translateY: 18,
          duration: 500,
          easing: "easeInSine",
        });
        await anime({
          targets: pill,
          translateX: passX,
          duration: 1200,
          easing: "cubicBezier(.4,.0,.2,1)",
        }).finished;
        if (stopped) break;
        await anime({
          targets: pill,
          translateX: endX,
          opacity: 0,
          duration: 1000,
          easing: "cubicBezier(.4,.0,.2,1)",
        }).finished;
        status.textContent = "EXECUTED · ✓";
        await anime({ targets: {}, duration: 1100, easing: "linear" }).finished;
      }
    }

    run();
    return () => {
      stopped = true;
    };
  }, []);

  return (
    <div ref={containerRef} className="relative w-full h-[220px] sm:h-[260px]">
      {/* Stage labels */}
      <span className="absolute top-0 left-[8%] font-mono text-[10.5px] text-faint tracking-[0.14em]">
        01 · WALLET
      </span>
      <span className="absolute top-0 left-1/2 -translate-x-1/2 font-mono text-[10.5px] text-faint tracking-[0.14em]">
        02 · TRANA GUARD
      </span>
      <span className="absolute top-0 right-[8%] font-mono text-[10.5px] text-faint tracking-[0.14em]">
        03 · PROGRAM
      </span>

      {/* Rail */}
      <div
        className="absolute top-1/2 left-[8%] right-[8%] h-px -translate-y-1/2"
        style={{
          background:
            "linear-gradient(to right, rgba(255,255,255,0.04), rgba(255,255,255,0.16) 50%, rgba(255,255,255,0.04))",
        }}
      />
      {/* Tick marks */}
      {["left-[8%]", "left-1/2 -translate-x-1/2", "right-[8%]"].map((pos) => (
        <div
          key={pos}
          className={`absolute top-[calc(50%-8px)] w-px h-4 bg-white/20 ${pos}`}
        />
      ))}
      {/* Rail dots */}
      {[28, 34, 40, 60, 66, 72, 78].map((pct) => (
        <div
          key={pct}
          className="absolute top-1/2 -translate-y-1/2 w-[3px] h-[3px] rounded-full bg-white/20"
          style={{ left: `${pct}%` }}
        />
      ))}

      {/* Glow rings */}
      <div
        ref={shieldGlowRef}
        className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[180px] h-[180px] rounded-full pointer-events-none"
        style={{
          background:
            "radial-gradient(ellipse, rgba(122,240,168,0.18) 0%, transparent 70%)",
          opacity: 0,
        }}
      />
      <div
        ref={blockGlowRef}
        className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[150px] h-[150px] rounded-full pointer-events-none"
        style={{
          background:
            "radial-gradient(ellipse, rgba(255,85,96,0.20) 0%, transparent 70%)",
          opacity: 0,
        }}
      />

      {/* Shield */}
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2">
        <svg width="60" height="70" viewBox="0 0 60 70" aria-hidden>
          <path
            d="M30 3 L57 12 L57 37 C57 51 44 62 30 68 C16 62 3 51 3 37 L3 12 Z"
            fill="rgba(255,255,255,0.03)"
            stroke="rgba(255,255,255,0.55)"
            strokeWidth="1.4"
          />
          <path
            ref={checkRef}
            d="M16 36 L26 46 L46 24"
            stroke="#7af0a8"
            strokeWidth="2.4"
            fill="none"
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeDasharray="46"
            style={{ strokeDashoffset: 46 }}
          />
          <path
            ref={xRef}
            d="M18 26 L42 50 M42 26 L18 50"
            stroke="#ff5560"
            strokeWidth="2.2"
            fill="none"
            strokeLinecap="round"
            style={{ opacity: 0 }}
          />
        </svg>
      </div>

      {/* TX pill */}
      <div
        ref={pillRef}
        className="absolute top-[calc(50%-14px)] flex items-center gap-2 px-3 rounded-full border border-white/25 bg-white/[0.06] font-mono text-[11.5px] text-zinc-200"
        style={{ left: 0, width: 140, height: 28 }}
      >
        <div className="w-[8px] h-[8px] rounded-full bg-sky shrink-0" />
        tx · 5.0 SOL
      </div>

      {/* Passkey */}
      <div
        ref={passkeyRef}
        className="absolute flex items-center gap-2 px-4 py-1.5 rounded-[10px] border border-white/35 bg-white/[0.04] font-mono text-[11.5px] text-ink whitespace-nowrap"
        style={{ top: "68%", left: "50%", opacity: 0 }}
      >
        <svg width="10" height="12" viewBox="0 0 10 12" aria-hidden>
          <circle
            cx="5"
            cy="4"
            r="3.2"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.3"
          />
          <path
            d="M5 4 L5 10"
            stroke="currentColor"
            strokeWidth="1.3"
            strokeLinecap="round"
          />
        </svg>
        passkey · touch
      </div>

      {/* Status */}
      <div className="absolute bottom-[6%] left-1/2 -translate-x-1/2 flex items-center gap-1.5">
        <div className="w-1.5 h-1.5 rounded-full bg-faint" />
        <span
          ref={statusRef}
          className="font-mono text-[11px] text-faint tracking-[0.14em]"
        >
          IDLE
        </span>
      </div>
    </div>
  );
}

// ── Hero section ──────────────────────────────────────────────────────────────
export function Hero() {
  return (
    <section
      id="top"
      className="relative px-6 sm:px-12 pt-[100px] pb-[60px] border-b border-white/[0.08] overflow-hidden"
    >
      <GridBg />

      <div className="relative max-w-[1320px] mx-auto grid grid-cols-1 lg:grid-cols-2 gap-10 items-center">
        {/* Copy */}
        <div>
          <h1 className="font-serif text-[clamp(38px,5vw,72px)] leading-[0.98] tracking-[-0.035em] mt-5 mb-4 max-w-[18ch] text-balance text-ink">
            Execution-time authorization<br />
            <em className="text-lime">for Solana</em>
          </h1>
          <p className="text-[clamp(16px,1.3vw,19px)] text-muted leading-[1.45] max-w-[46ch] tracking-[-0.005em] text-pretty">
            Secure your program with one CPI call.
          </p>
        </div>

        {/* Animation */}
        <div className="w-full">
          <HeroFlow />
        </div>
      </div>
    </section>
  );
}
