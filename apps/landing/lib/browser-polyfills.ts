import { Buffer } from "buffer"

// The Solana SDK still reads Buffer from the browser global in a few modules.
// Initialize it before those modules are evaluated.
if (typeof globalThis.Buffer === "undefined") {
  globalThis.Buffer = Buffer
}
