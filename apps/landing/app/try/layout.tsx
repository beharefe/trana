import { SolanaProvider } from "@/components/SolanaProvider"

export default function TryLayout({ children }: { children: React.ReactNode }) {
  return <SolanaProvider>{children}</SolanaProvider>
}
