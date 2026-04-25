// Satori supports WOFF/TTF but not WOFF2.
// Old Safari UA makes Google Fonts return WOFF instead of WOFF2.
let _cache: { interRegular: ArrayBuffer; interSemiBold: ArrayBuffer; serifRegular: ArrayBuffer; serifItalic: ArrayBuffer } | null = null

const SAFARI_UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_11_2) AppleWebKit/601.3.9 (KHTML, like Gecko) Version/9.0.2 Safari/601.3.9"

async function fetchGoogleFontWoff(family: string, weight: number, italic = false): Promise<ArrayBuffer> {
  const variant = italic ? `ital,wght@1,${weight}` : `wght@${weight}`
  const css = await fetch(
    `https://fonts.googleapis.com/css2?family=${encodeURIComponent(family)}:${variant}&display=swap`,
    { headers: { "User-Agent": SAFARI_UA } },
  ).then((r) => r.text())
  const fontUrl = css.match(/src: url\((.+?)\)/)?.[1]
  if (!fontUrl) throw new Error(`og-font: no url for ${family} ${weight} italic=${italic}`)
  return fetch(fontUrl).then((r) => r.arrayBuffer())
}

export async function getTranaFonts() {
  if (_cache) return _cache
  const [interRegular, interSemiBold, serifRegular, serifItalic] = await Promise.all([
    fetchGoogleFontWoff("Inter", 400),
    fetchGoogleFontWoff("Inter", 600),
    fetchGoogleFontWoff("DM Serif Display", 400),
    fetchGoogleFontWoff("DM Serif Display", 400, true),
  ])
  _cache = { interRegular, interSemiBold, serifRegular, serifItalic }
  return _cache
}
