/**
 * IDL placeholder — replaced by the generated file after `anchor build`.
 *
 * After running `anchor build`, copy the generated IDL:
 *   cp target/idl/guard.json packages/sdk/src/guard.json
 *
 * Then this import resolves automatically.
 *
 * Until then, instruction building falls back to the manual discriminator path.
 */

// We export the type so consumers can type-check against it.
// The actual runtime value is loaded dynamically to avoid bundler errors when
// the file doesn't exist yet.
export type GuardIdl = Record<string, unknown>

export function loadIdl(): GuardIdl | null {
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    return require("./guard.json") as GuardIdl
  } catch {
    return null
  }
}
