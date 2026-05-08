import { LiveStatePanel } from "./LiveStatePanel"

/**
 * Wrapper that creates the main-content + right live-state-panel layout.
 * Use as a parent in each try-it-live MDX page.
 */
export function TryItLiveShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="not-prose flex gap-6 xl:gap-8 items-start -mx-0">
      {/* main */}
      <div className="flex-1 min-w-0 space-y-6">
        {children}
      </div>
      {/* live state — hidden on small screens */}
      <div className="hidden xl:block">
        <LiveStatePanel />
      </div>
    </div>
  )
}
