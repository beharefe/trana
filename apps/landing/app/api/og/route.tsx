import { ImageResponse } from "next/og"
import { getTranaFonts } from "@/lib/og-font"

export const runtime = "edge"

const BG    = "#F7F6F3"
const CARD  = "#EEECEA"
const INK   = "#111111"
const MUTED = "#5C5855"
const FAINT = "#9E9A96"
const BORDER = "rgba(17,17,17,0.12)"
const ACCENT = "#16A34A"

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)

  const rawTitle    = searchParams.get("title")    ?? "Execution requires approval."
  const rawSubtitle = searchParams.get("subtitle") ?? "Second-factor authorization at execution time — directly onchain."
  const section     = searchParams.get("section")  ?? ""

  const title    = rawTitle.length    > 60 ? `${rawTitle.slice(0, 58)}…`    : rawTitle
  const subtitle = rawSubtitle.length > 90 ? `${rawSubtitle.slice(0, 88)}…` : rawSubtitle

  let fonts: Awaited<ReturnType<typeof getTranaFonts>> | null = null
  try {
    fonts = await getTranaFonts()
  } catch {
    // fall back to system sans-serif
  }

  const fontFamily = fonts ? "DM Serif Display" : "serif"
  const bodyFamily = fonts ? "Inter"             : "sans-serif"

  const res = new ImageResponse(
    <div
      style={{
        display: "flex",
        width: "100%",
        height: "100%",
        background: BG,
        position: "relative",
        overflow: "hidden",
        fontFamily: bodyFamily,
      }}
    >
      {/* Inset border */}
      <div style={{ position: "absolute", inset: 0, border: `1.5px solid ${BORDER}`, display: "flex" }} />

      {/* Concentric rings — bottom-right */}
      {[640, 460, 300, 164].map((size, i) => (
        <div
          key={i}
          style={{
            position: "absolute",
            right: -(size / 2) + 80,
            bottom: -(size / 2) + 60,
            width: size,
            height: size,
            borderRadius: 9999,
            border: `1.5px solid rgba(17,17,17,${0.055 - i * 0.01})`,
            display: "flex",
          }}
        />
      ))}

      {/* Accent dot — top-right */}
      <div
        style={{
          position: "absolute",
          top: 52,
          right: 64,
          width: 12,
          height: 12,
          borderRadius: 9999,
          background: ACCENT,
          display: "flex",
        }}
      />

      {/* Top row: wordmark + section badge */}
      <div
        style={{
          position: "absolute",
          top: 44,
          left: 64,
          right: 64,
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
        }}
      >
        <div style={{ display: "flex", alignItems: "baseline", gap: 10 }}>
          <span style={{ fontFamily, fontSize: 30, fontWeight: 400, color: INK, letterSpacing: "-0.5px" }}>
            Trana
          </span>
          <span style={{ fontFamily: bodyFamily, fontSize: 16, fontWeight: 400, color: FAINT, letterSpacing: "0" }}>
            trana.so
          </span>
        </div>
        {section && (
          <div
            style={{
              display: "flex",
              border: `1.5px solid ${BORDER}`,
              borderRadius: 100,
              padding: "8px 20px",
              background: CARD,
            }}
          >
            <span style={{ fontSize: 18, fontWeight: 600, color: MUTED, letterSpacing: "-0.2px" }}>
              {section}
            </span>
          </div>
        )}
      </div>

      {/* Main content */}
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          paddingLeft: 64,
          paddingRight: 160,
          paddingTop: 120,
          paddingBottom: 120,
          height: "100%",
          gap: 20,
        }}
      >
        {/* Title — serif, large */}
        <div
          style={{
            fontFamily,
            fontSize: title.length > 40 ? 72 : 88,
            fontWeight: 400,
            color: INK,
            lineHeight: 1.06,
            letterSpacing: "-2px",
            maxWidth: 900,
          }}
        >
          {title}
        </div>

        {/* Subtitle */}
        <div
          style={{
            fontFamily: bodyFamily,
            fontSize: 26,
            fontWeight: 400,
            color: MUTED,
            lineHeight: 1.45,
            letterSpacing: "-0.3px",
            maxWidth: 720,
          }}
        >
          {subtitle}
        </div>
      </div>

      {/* Bottom bar */}
      <div
        style={{
          position: "absolute",
          bottom: 0,
          left: 0,
          right: 0,
          height: 100,
          borderTop: `1px solid ${BORDER}`,
          paddingLeft: 64,
          paddingRight: 64,
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
        }}
      >
        {/* Green pill */}
        <div
          style={{
            display: "flex",
            background: ACCENT,
            borderRadius: 100,
            padding: "12px 28px",
            gap: 8,
            alignItems: "center",
          }}
        >
          <span style={{ fontSize: 24, fontWeight: 600, color: "#fff", letterSpacing: "-0.3px" }}>
            Execution-time authorization
          </span>
        </div>

        <span style={{ fontSize: 20, fontWeight: 400, color: FAINT, letterSpacing: "-0.2px" }}>
          Solana · secp256r1 · SIMD-0075
        </span>
      </div>
    </div>,
    {
      width: 1200,
      height: 630,
      fonts: fonts
        ? [
            { name: "DM Serif Display", data: fonts.serifRegular, weight: 400, style: "normal"  },
            { name: "DM Serif Display", data: fonts.serifItalic,  weight: 400, style: "italic"  },
            { name: "Inter",            data: fonts.interRegular,  weight: 400, style: "normal"  },
            { name: "Inter",            data: fonts.interSemiBold, weight: 600, style: "normal"  },
          ]
        : [],
    },
  )

  res.headers.set("Cache-Control", "public, max-age=86400, stale-while-revalidate=604800")
  return res
}
