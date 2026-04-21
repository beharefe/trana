/**
 * IDL placeholder — replaced by the generated file after `anchor build`.
 *
 * After running `anchor build`, copy the generated IDL:
 *   cp target/idl/trana.json packages/sdk/src/trana.json
 *
 * Then this import resolves automatically.
 *
 * Until then, instruction building falls back to the manual discriminator path.
 */

export type GuardIdl = Record<string, unknown>

export function loadIdl(): GuardIdl | null {
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    return require("./trana.json") as GuardIdl
  } catch {
    return null
  }
}
