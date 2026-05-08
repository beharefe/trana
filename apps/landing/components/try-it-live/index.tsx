export { PoolStrip }       from "./PoolStrip"
export { DemoCards }       from "./DemoCards"
export { WithdrawPanel }   from "./WithdrawPanel"
export { TxAnatomyStrip }  from "./TxAnatomyStrip"

import { PoolStrip }      from "./PoolStrip"
import { DemoCards }      from "./DemoCards"
import { WithdrawPanel }  from "./WithdrawPanel"
import { TxAnatomyStrip } from "./TxAnatomyStrip"

/**
 * Try it live — layout shell.
 * No state, no RPC, no wallet. Add logic in a wrapper.
 */
export function TryItLive() {
  return (
    <div className="not-prose space-y-4 my-8">
      <PoolStrip />
      <DemoCards />
      {/* active panel — swap based on selected card */}
      <WithdrawPanel />
      <TxAnatomyStrip />
    </div>
  )
}
