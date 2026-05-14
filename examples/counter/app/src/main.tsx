import { Buffer } from "buffer"
globalThis.Buffer = Buffer

import { StrictMode } from "react"
import { createRoot } from "react-dom/client"
import { ConnectionProvider, WalletProvider } from "@solana/wallet-adapter-react"
import { WalletModalProvider } from "@solana/wallet-adapter-react-ui"
import App from "./App"
import "@solana/wallet-adapter-react-ui/styles.css"

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <ConnectionProvider endpoint="http://127.0.0.1:8899">
      {/* wallets={[]} — wallet-standard compatible wallets are auto-detected */}
      <WalletProvider wallets={[]} autoConnect>
        <WalletModalProvider>
          <App />
        </WalletModalProvider>
      </WalletProvider>
    </ConnectionProvider>
  </StrictMode>,
)
