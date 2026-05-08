// =============================================================
// Trana Guard — supporting pages
// How it works · Policies · Integration · trana_authority · Deploy
// =============================================================

const { useState: useStateP } = React;

// ===========================================================
// PAGE 2 — HOW IT WORKS
// ===========================================================
function HowItWorks() {
  return (
    <PageShell
      eyebrow="02 · How it works"
      title="Three instructions, one transaction."
      lede="Every protected action is a tuple of three top-level instructions: native P-256 verify, proof record, and the action itself. Guard reads the sibling proof through the Instructions sysvar and gates the CPI."
    >
      <div style={{
        display: 'grid', gridTemplateColumns: 'minmax(0, 1.2fr) minmax(0, 1fr)',
        gap: 56, marginTop: 28,
      }}>
        <div style={{ minWidth: 0 }}>
          <Section num="01" title="Registration">
            <p className="body">
              On the user's first encounter, they enroll a passkey via WebAuthn. The COSE-encoded
              public key is stored in a registry PDA derived from <code className="mono">[wallet, "trana"]</code>.
              No backend, no key custody — the credential lives on-chain.
            </p>
            <Code lang="rust" copyText={'trana_authority::register_two_fa(\n  ctx,\n  credential_id,\n  cose_public_key,\n)?;'}>
{`trana_authority::<a>register_two_fa</a>(
  ctx,
  credential_id: <s>"yk5-touch-2026"</s>,
  cose_public_key: <a>cose_pk</a>,   <c>// 77-byte P-256 COSE</c>
)?;`}
            </Code>
          </Section>

          <Section num="02" title="Authorization">
            <p className="body">
              Before sending the protected transaction, the SDK builds an
              <span className="mono"> intent hash</span> — a digest of the program ID,
              accounts, and parameters. The user's authenticator signs the hash; the
              WebAuthn ceremony returns <code className="mono">authenticatorData</code> +
              <code className="mono"> clientDataJSON</code>. Proofs expire in 120 seconds.
            </p>
            <Code lang="ts" copyText={'const intent = hashIntent({ program, accounts, args });\nconst proof = await navigator.credentials.get({\n  publicKey: { challenge: intent, allowCredentials },\n});'}>
{`<k>const</k> intent = hashIntent({ program, accounts, args });
<k>const</k> proof = <k>await</k> navigator.credentials.<a>get</a>({
  publicKey: { challenge: intent, allowCredentials },
});`}
            </Code>
          </Section>

          <Section num="03" title="Enforcement">
            <p className="body">
              Inside your instruction, a single CPI call to <code className="mono">guard::cpi::enforce()</code>
              walks the Instructions sysvar, locates the sibling
              <code className="mono"> record_proof</code>, recomputes the intent hash,
              and matches it against the recorded proof. If anything is off — wrong accounts,
              expired proof, missing precompile — the call returns
              <code className="mono"> MissingProof</code> and your CPI never runs.
            </p>
            <Code lang="rust" copyText={'pub fn withdraw(ctx: Context<Withdraw>, lamports: u64) -> Result<()> {\n    trana_guard::cpi::enforce(ctx.accounts.into_enforce_ctx(), policy)?;\n    transfer(ctx.accounts.into_transfer_ctx(), lamports)?;\n    Ok(())\n}'}>
{`<k>pub fn</k> <a>withdraw</a>(ctx: Context&lt;Withdraw&gt;, lamports: <a>u64</a>) -&gt; Result&lt;()&gt; {
    <c>// reads the sibling proof; returns MissingProof if absent</c>
    trana_guard::cpi::<a>enforce</a>(ctx.accounts.into_enforce_ctx(), <a>policy</a>)?;

    <a>transfer</a>(ctx.accounts.into_transfer_ctx(), lamports)?;
    <k>Ok</k>(())
}`}
            </Code>
          </Section>
        </div>

        <ArchDiagram />
      </div>
    </PageShell>
  );
}

function Section({ num, title, children }) {
  return (
    <section style={{ marginBottom: 44 }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 14, marginBottom: 14 }}>
        <span className="mono" style={{ fontSize: 11, color: 'var(--bone-4)', letterSpacing: '0.18em' }}>
          {num}
        </span>
        <h2 className="h2" style={{ fontSize: 26 }}>{title}</h2>
      </div>
      {children}
    </section>
  );
}

// ---------- architecture diagram (custom SVG, sticky) ----------
function ArchDiagram() {
  return (
    <div style={{
      position: 'sticky', top: 88, alignSelf: 'flex-start',
      border: '1px solid var(--rule)', background: 'var(--ink-2)',
      padding: '22px 22px 26px',
    }}>
      <div className="eyebrow" style={{ marginBottom: 14 }}>Architecture</div>
      <svg viewBox="0 0 360 460" width="100%" style={{ display: 'block' }}>
        <defs>
          <marker id="ah" viewBox="0 0 8 8" refX="6" refY="4"
                  markerWidth="6" markerHeight="6" orient="auto">
            <path d="M0,0 L8,4 L0,8 z" fill="rgba(235,232,224,0.55)" />
          </marker>
          <marker id="ahL" viewBox="0 0 8 8" refX="6" refY="4"
                  markerWidth="6" markerHeight="6" orient="auto">
            <path d="M0,0 L8,4 L0,8 z" fill="#c6ff3a" />
          </marker>
        </defs>

        {/* CLIENT cluster */}
        <g>
          <rect x="14" y="14" width="332" height="92" fill="none" stroke="rgba(235,232,224,0.18)" strokeDasharray="3 3" />
          <text x="22" y="32" fontFamily="var(--mono)" fontSize="9.5" letterSpacing="2.2"
                fill="rgba(235,232,224,0.55)">CLIENT</text>
          <DiagramBox x={28} y={42} w={92} h={48}
            title="wallet" sub="Phantom · Backpack" />
          <DiagramBox x={132} y={42} w={92} h={48}
            title="passkey" sub="P-256 device" accent />
          <DiagramBox x={236} y={42} w={92} h={48}
            title="@trana/sdk" sub="builds the tx" />
        </g>

        {/* arrow down */}
        <path d="M180,116 L180,138" stroke="rgba(235,232,224,0.55)"
              strokeWidth="1.2" markerEnd="url(#ah)" />
        <text x="186" y="132" fontFamily="var(--mono)" fontSize="9"
              fill="rgba(235,232,224,0.55)">3-ix tx</text>

        {/* INSTRUCTIONS */}
        <g>
          <rect x="14" y="146" width="332" height="184" fill="none"
                stroke="rgba(235,232,224,0.18)" strokeDasharray="3 3" />
          <text x="22" y="164" fontFamily="var(--mono)" fontSize="9.5" letterSpacing="2.2"
                fill="rgba(235,232,224,0.55)">SOLANA RUNTIME</text>

          <DiagramBox x={28} y={176} w={300} h={42}
            title="ix[N-2] · secp256r1" sub="native P-256 precompile" />
          <DiagramBox x={28} y={228} w={300} h={42}
            title="ix[N-1] · record_proof" sub="trana_guard · authenticatorData + clientDataJSON" />
          <DiagramBox x={28} y={280} w={300} h={42}
            title="ix[N] · your_program::action" sub="calls guard::cpi::enforce()" accent />
        </g>

        {/* sysvar arrow */}
        <path d="M178,322 C 100,360 100,420 220,408" fill="none"
              stroke="#c6ff3a" strokeWidth="1.2" markerEnd="url(#ahL)" />
        <text x="62" y="385" fontFamily="var(--mono)" fontSize="9.5"
              fill="#c6ff3a">enforce() reads</text>
        <text x="62" y="397" fontFamily="var(--mono)" fontSize="9.5"
              fill="#c6ff3a">Instructions sysvar</text>

        {/* registry */}
        <DiagramBox x={228} y={386} w={108} h={48}
          title="registry PDA" sub="proof + nonce" />
      </svg>

      <div style={{ marginTop: 16, paddingTop: 14, borderTop: '1px solid var(--rule)' }}>
        <Legend dot="var(--lime)" text="passkey-bound CPI path" />
        <Legend dot="rgba(235,232,224,0.55)" text="standard tx flow" />
      </div>
    </div>
  );
}

function DiagramBox({ x, y, w, h, title, sub, accent }) {
  return (
    <g>
      <rect x={x} y={y} width={w} height={h} fill="var(--ink)"
            stroke={accent ? '#c6ff3a' : 'rgba(235,232,224,0.22)'}
            strokeWidth={accent ? 1.4 : 1} />
      <text x={x + 12} y={y + 18} fontFamily="var(--mono)" fontSize="10.5"
            fill={accent ? '#c6ff3a' : '#ebe8e0'} letterSpacing="0.04em">{title}</text>
      {sub && <text x={x + 12} y={y + 32} fontFamily="var(--mono)" fontSize="9"
                    fill="rgba(235,232,224,0.55)">{sub}</text>}
    </g>
  );
}

function Legend({ dot, text }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
      <span style={{ width: 8, height: 8, background: dot, borderRadius: '50%' }}></span>
      <span className="mono" style={{ fontSize: 10.5, color: 'var(--bone-3)' }}>{text}</span>
    </div>
  );
}

// ===========================================================
// PAGE 3 — POLICIES
// ===========================================================
function PoliciesPage() {
  const policies = [
    {
      name: 'Require',
      kind: 'lime',
      trigger: 'Always demand a passkey proof.',
      use: 'High-value vaults, treasury withdrawals, admin actions.',
      code: `Policy::<k>Require</k>`,
    },
    {
      name: 'Limit',
      kind: 'azure',
      trigger: 'Demand proof above a threshold.',
      use: 'Daily spending limits, payroll, recurring transfers.',
      code: `Policy::<k>Limit</k> { max: <s>1_000_000</s> }`,
      note: 'Limit can escalate to Require if a drain window is detected by your program logic.',
    },
    {
      name: 'NotBefore',
      kind: 'amber',
      trigger: 'Demand proof until a slot has passed.',
      use: 'Time-locks, staking unlocks, vesting cliffs.',
      code: `Policy::<k>NotBefore</k> { slot: <s>327_900_000</s> }`,
    },
    {
      name: 'NotAfter',
      kind: 'plasma',
      trigger: 'Demand proof past an expiry slot.',
      use: 'Disable a feature past a sunset date, beta gating.',
      code: `Policy::<k>NotAfter</k> { slot: <s>328_500_000</s> }`,
    },
  ];

  return (
    <PageShell
      eyebrow="03 · Policies"
      title="Four primitives. Compose at will."
      lede="Policies are pure data — small enums passed into enforce(). Programs combine them in code: gate by amount, then by time, then by recent activity."
    >
      <div style={{
        display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 18, marginTop: 28,
      }}>
        {policies.map(p => (
          <article key={p.name} style={{
            border: '1px solid var(--rule)', background: 'var(--ink-2)',
            padding: '22px 24px', display: 'flex', flexDirection: 'column', gap: 14,
          }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <h3 className="h2" style={{ fontSize: 28 }}>{p.name}</h3>
              <span className={'pill ' + p.kind}>policy</span>
            </div>
            <Row k="trigger" v={p.trigger} />
            <Row k="when to use" v={p.use} />
            <Code copyText={p.code.replace(/<\/?\w>/g, '')}>{p.code}</Code>
            {p.note && (
              <div style={{
                marginTop: 4, padding: '10px 14px',
                borderLeft: '2px solid var(--lime)',
                background: 'rgba(198,255,58,0.04)',
                fontFamily: 'var(--mono)', fontSize: 11.5, lineHeight: 1.6,
                color: 'var(--bone-2)',
              }}>
                <span style={{ color: 'var(--lime)' }}>↳</span> {p.note}
              </div>
            )}
          </article>
        ))}
      </div>

      {/* composing example */}
      <div style={{ marginTop: 36 }}>
        <div className="eyebrow" style={{ marginBottom: 12 }}>Composition · in your program</div>
        <Code lang="rust" copyText={`let policy = if amount >= LIMIT {\n    Policy::Require\n} else if drain_window_open(&registry) {\n    Policy::Require\n} else {\n    Policy::Limit { max: LIMIT }\n};\ntrana_guard::cpi::enforce(ctx, policy)?;`}>
{`<k>let</k> policy = <k>if</k> amount &gt;= <a>LIMIT</a> {
    Policy::<k>Require</k>                       <c>// over threshold</c>
} <k>else if</k> drain_window_open(&amp;registry) {
    Policy::<k>Require</k>                       <c>// escalated</c>
} <k>else</k> {
    Policy::<k>Limit</k> { max: <a>LIMIT</a> }              <c>// silent path</c>
};
trana_guard::cpi::<a>enforce</a>(ctx, policy)?;`}
        </Code>
      </div>
    </PageShell>
  );
}

function Row({ k, v }) {
  return (
    <div style={{ display: 'flex', gap: 14 }}>
      <span className="eyebrow" style={{ width: 100, flexShrink: 0, paddingTop: 2 }}>{k}</span>
      <span className="body" style={{ fontSize: 13.5 }}>{v}</span>
    </div>
  );
}

// ===========================================================
// PAGE 4 — INTEGRATION (tabbed)
// ===========================================================
function IntegrationPage({ subRoute }) {
  // subRoute: 'rust' or 'ts'
  const tab = subRoute === 'ts' ? 'ts' : 'rust';
  return (
    <PageShell
      eyebrow="04 · Integration"
      title={tab === 'rust' ? 'Quickstart · Rust / Anchor' : 'Quickstart · TypeScript'}
      lede={tab === 'rust'
        ? 'Add Trana Guard to an Anchor program in three steps. Three accounts, one CPI call.'
        : 'Wire the SDK into your client. Register a passkey, then sign protected actions.'}
    >
      <div style={{ display: 'flex', gap: 4, borderBottom: '1px solid var(--rule)',
                     marginBottom: 28 }}>
        {['rust', 'ts'].map(t => (
          <a key={t} href={'#integration/' + t}
            style={{
              padding: '10px 18px',
              fontFamily: 'var(--mono)', fontSize: 11, letterSpacing: '0.18em',
              textTransform: 'uppercase',
              color: tab === t ? 'var(--bone)' : 'var(--bone-4)',
              borderBottom: '2px solid ' + (tab === t ? 'var(--lime)' : 'transparent'),
              marginBottom: -1,
            }}>
            {t === 'rust' ? 'Rust · Anchor' : 'TypeScript'}
          </a>
        ))}
      </div>

      {tab === 'rust' && <RustQuickstart />}
      {tab === 'ts' && <TsQuickstart />}
    </PageShell>
  );
}

function RustQuickstart() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 36 }}>
      <Step n="1" title="Cargo.toml" subtitle="Add the guard crate as a dependency.">
        <Code lang="toml" copyText={'[dependencies]\ntrana_guard = { version = "0.4", features = ["cpi"] }'}>
{`[dependencies]
<a>trana_guard</a> = { version = <s>"0.4"</s>, features = [<s>"cpi"</s>] }`}
        </Code>
      </Step>

      <Step n="2" title="Accounts struct"
            subtitle="Three accounts to add. Highlighted lines are the diff against your existing Withdraw context.">
        <Code lang="rust" copyText={'#[derive(Accounts)]\npub struct Withdraw<\'info> {\n    #[account(mut)]\n    pub vault: Account<\'info, Vault>,\n    #[account(mut)]\n    pub recipient: Signer<\'info>,\n    pub registry: Account<\'info, GuardRegistry>,\n    pub instructions: Sysvar<\'info, Instructions>,\n    pub trana_guard: Program<\'info, TranaGuard>,\n}'}>
{`#[derive(<a>Accounts</a>)]
<k>pub struct</k> Withdraw&lt;'info&gt; {
    #[account(mut)]
    <k>pub</k> vault: <a>Account</a>&lt;'info, Vault&gt;,
    #[account(mut)]
    <k>pub</k> recipient: <a>Signer</a>&lt;'info&gt;,
<p>+   <k>pub</k> registry: <a>Account</a>&lt;'info, GuardRegistry&gt;,</p>
<p>+   <k>pub</k> instructions: <a>Sysvar</a>&lt;'info, Instructions&gt;,</p>
<p>+   <k>pub</k> trana_guard: <a>Program</a>&lt;'info, TranaGuard&gt;,</p>
}`}
        </Code>
      </Step>

      <Step n="3" title="The enforce() call"
            subtitle="One CPI before your action. That's the whole integration.">
        <Code lang="rust" copyText={'pub fn withdraw(ctx: Context<Withdraw>, lamports: u64) -> Result<()> {\n    trana_guard::cpi::enforce(\n        ctx.accounts.into_enforce_ctx(),\n        Policy::Limit { max: 1_000_000 },\n    )?;\n    transfer_lamports(&ctx.accounts.vault, &ctx.accounts.recipient, lamports)?;\n    Ok(())\n}'}>
{`<k>pub fn</k> <a>withdraw</a>(ctx: Context&lt;Withdraw&gt;, lamports: <a>u64</a>) -&gt; Result&lt;()&gt; {
<p>+   trana_guard::cpi::<a>enforce</a>(</p>
<p>+       ctx.accounts.into_enforce_ctx(),</p>
<p>+       Policy::<k>Limit</k> { max: <s>1_000_000</s> },</p>
<p>+   )?;</p>
    transfer_lamports(&amp;ctx.accounts.vault, &amp;ctx.accounts.recipient, lamports)?;
    <k>Ok</k>(())
}`}
        </Code>
      </Step>
    </div>
  );
}

function TsQuickstart() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 36 }}>
      <Step n="1" title="Install" subtitle="The SDK ships the React hook, the prover, and the tx builder.">
        <Code lang="bash" copyText={'npm i @trana/sdk @solana/web3.js'}>
{`<a>npm</a> i @trana/sdk @solana/web3.js`}
        </Code>
      </Step>

      <Step n="2" title="Register a passkey"
            subtitle="One-time enrollment. Stores the COSE pub key in the registry PDA.">
        <Code lang="ts" copyText={'import { TranaGuard } from "@trana/sdk";\n\nconst guard = new TranaGuard({ connection, wallet });\nawait guard.register({ rpId: "trana.so", userName: "alice" });'}>
{`<k>import</k> { TranaGuard } <k>from</k> <s>"@trana/sdk"</s>;

<k>const</k> guard = <k>new</k> <a>TranaGuard</a>({ connection, wallet });
<k>await</k> guard.<a>register</a>({ rpId: <s>"trana.so"</s>, userName: <s>"alice"</s> });`}
        </Code>
      </Step>

      <Step n="3" title="Sign a protected call"
            subtitle="Build the intent, prove it, append the 3 instructions, send.">
        <Code lang="ts" copyText={'const ix = await program.methods\n  .withdraw(new BN(lamports))\n  .accounts({ vault, recipient, registry, instructions, tranaGuard })\n  .instruction();\n\nconst tx = await guard.sign(ix, { policy: { kind: "Limit", max: 1_000_000 } });\nconst sig = await connection.sendTransaction(tx);'}>
{`<k>const</k> ix = <k>await</k> program.methods
  .<a>withdraw</a>(<k>new</k> BN(lamports))
  .<a>accounts</a>({ vault, recipient, registry, instructions, tranaGuard })
  .<a>instruction</a>();

<c>// guard.sign() prepends secp256r1 + record_proof, runs WebAuthn ceremony</c>
<k>const</k> tx = <k>await</k> guard.<a>sign</a>(ix, { policy: { kind: <s>"Limit"</s>, max: <s>1_000_000</s> } });
<k>const</k> sig = <k>await</k> connection.<a>sendTransaction</a>(tx);`}
        </Code>
      </Step>
    </div>
  );
}

function Step({ n, title, subtitle, children }) {
  return (
    <section style={{
      display: 'grid', gridTemplateColumns: '64px 1fr', gap: 24,
    }}>
      <div>
        <div style={{
          width: 56, height: 56, border: '1px solid var(--rule-2)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontFamily: 'var(--sans)', fontWeight: 500, fontSize: 28,
          letterSpacing: '-0.04em', color: 'var(--lime)',
        }}>{n}</div>
      </div>
      <div>
        <h2 className="h2" style={{ fontSize: 22, marginBottom: 4 }}>{title}</h2>
        <p className="body" style={{ fontSize: 13.5, marginBottom: 14 }}>{subtitle}</p>
        {children}
      </div>
    </section>
  );
}

// ===========================================================
// PAGE 5 — trana_authority
// ===========================================================
function AuthorityPage() {
  return (
    <PageShell
      eyebrow="05 · trana_authority"
      title="A PDA that signs only with proof."
      lede="trana_authority is a primitive — a PDA whose CPI signing seeds are gated by enforce(). Use it as upgrade authority, mint authority, multisig signer, or any other role that needs to act under cryptographic approval."
    >
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 22, marginTop: 28 }}>
        {[
          { name: 'Upgrade authority', sub: 'Replace the program binary only with a verified proof.', kind: 'lime' },
          { name: 'Mint authority', sub: 'Token issuance gated by passkey approval.', kind: 'azure' },
          { name: 'Multisig signer', sub: 'A PDA member of a Squads-style multisig — proof in, signature out.', kind: 'amber' },
          { name: 'DAO treasury', sub: 'Treasury PDA that requires a quorum of passkeys to move funds.', kind: 'plasma' },
        ].map(role => (
          <div key={role.name} style={{
            border: '1px solid var(--rule)', background: 'var(--ink-2)',
            padding: '20px 22px',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
              <h3 className="h2" style={{ fontSize: 19 }}>{role.name}</h3>
              <span className={'pill ' + role.kind}>role</span>
            </div>
            <p className="body" style={{ fontSize: 13 }}>{role.sub}</p>
          </div>
        ))}
      </div>

      <div style={{ marginTop: 36, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 22 }}>
        <div>
          <div className="eyebrow" style={{ marginBottom: 12 }}>Derive the PDA</div>
          <Code lang="rust" copyText={'let (authority, bump) = Pubkey::find_program_address(\n    &[b"trana_authority", owner.as_ref()],\n    &trana_authority::ID,\n);'}>
{`<k>let</k> (authority, bump) = Pubkey::<a>find_program_address</a>(
    &amp;[<s>b"trana_authority"</s>, owner.as_ref()],
    &amp;<a>trana_authority::ID</a>,
);`}
          </Code>
        </div>
        <div>
          <div className="eyebrow" style={{ marginBottom: 12 }}>Sign through it</div>
          <Code lang="rust" copyText={'trana_authority::cpi::sign(\n    ctx,\n    target_program: &bpf_loader_upgradeable::ID,\n    instruction: upgrade_ix,\n    policy: Policy::Require,\n)?;'}>
{`trana_authority::cpi::<a>sign</a>(
    ctx,
    target_program: &amp;<a>bpf_loader_upgradeable::ID</a>,
    instruction: upgrade_ix,
    policy: Policy::<k>Require</k>,
)?;`}
          </Code>
        </div>
      </div>
    </PageShell>
  );
}

// ===========================================================
// PAGE 6 — DEPLOY GUIDE
// ===========================================================
function DeployPage() {
  return (
    <PageShell
      eyebrow="06 · Deploy guide"
      title="Devnet to mainnet."
      lede="Deploy your guarded program in five steps. The same flow works for both networks; only the program ID and RPC change."
    >
      <ol style={{ listStyle: 'none', padding: 0, margin: '28px 0 0',
                    display: 'flex', flexDirection: 'column', gap: 22 }}>
        {[
          { t: 'Build', sub: 'Anchor build, then verifiably reproduce.',
            code: `<a>anchor</a> build --verifiable
<a>solana</a> program write-buffer target/deploy/your_program.so` },
          { t: 'Initialize the registry',
            sub: 'One-time per program. Idempotent.',
            code: `<a>npx</a> @trana/cli init-registry \\
  --program <a>${truncate('7TgRanaGuArD9TvJyf3KkpFw2HxQwvpKpUhNpVnDmLmS', 6)}</a> \\
  --network devnet` },
          { t: 'Hand over upgrade authority',
            sub: 'Transfer to the trana_authority PDA. From this point, only verified proofs can deploy.',
            code: `<a>solana</a> program set-upgrade-authority \\
  &lt;PROGRAM_ID&gt; \\
  --new-upgrade-authority &lt;TRANA_PDA&gt;` },
          { t: 'Register operators',
            sub: 'Each deploy operator enrolls a passkey. Quorum is policy-defined.',
            code: `<a>guard</a> register --operator alice --device yk5
<a>guard</a> register --operator bob   --device touchid` },
          { t: 'Ship', sub: 'Run an upgrade through the demo above to confirm. Then point your SDK at mainnet.',
            code: `<a>guard</a> upgrade --buffer &lt;BUFFER&gt; --program &lt;PROGRAM_ID&gt;
<c># ✓ ProofVerified · v1 → v2</c>` },
        ].map((s, i) => (
          <li key={s.t} style={{
            display: 'grid', gridTemplateColumns: '40px 1fr',
            gap: 22, alignItems: 'start',
            paddingBottom: 22, borderBottom: '1px dashed var(--rule)',
          }}>
            <div className="mono" style={{
              fontSize: 14, color: 'var(--lime)', paddingTop: 2,
            }}>0{i + 1}</div>
            <div>
              <h2 className="h2" style={{ fontSize: 19, marginBottom: 4 }}>{s.t}</h2>
              <p className="body" style={{ fontSize: 13.5, marginBottom: 14 }}>{s.sub}</p>
              <Code lang="bash" copyText={s.code.replace(/<\/?\w>/g, '')}>{s.code}</Code>
            </div>
          </li>
        ))}
      </ol>

      <div style={{
        marginTop: 36, padding: '18px 22px',
        border: '1px solid rgba(245,166,35,0.32)',
        background: 'rgba(245,166,35,0.04)',
        display: 'flex', gap: 14, alignItems: 'flex-start',
      }}>
        <Icon name="shield" size={18} className="dim" />
        <div>
          <div className="mono" style={{ fontSize: 11, letterSpacing: '0.16em',
            textTransform: 'uppercase', color: 'var(--amber)', marginBottom: 4 }}>
            recoverability
          </div>
          <p className="body" style={{ fontSize: 13.5, color: 'var(--bone-2)' }}>
            Trana never stores private keys. If every registered passkey is lost, the
            program is permanently locked at its current state. Register at least two
            independent devices (hardware key + platform authenticator) before turning
            over upgrade authority.
          </p>
        </div>
      </div>
    </PageShell>
  );
}

// ===========================================================
// PAGE SHELL — generic two-column doc page
// ===========================================================
function PageShell({ eyebrow, title, lede, children }) {
  return (
    <div style={{ padding: '28px 56px 96px', maxWidth: 1240, margin: '0 auto' }}>
      <div style={{ marginBottom: 12 }}>
        <div className="eyebrow">{eyebrow}</div>
      </div>
      <h1 className="h1" style={{ maxWidth: 880 }}>{title}</h1>
      {lede && (
        <p className="body" style={{ marginTop: 14, fontSize: 16, color: 'var(--bone-2)',
                                       maxWidth: 760, lineHeight: 1.6 }}>
          {lede}
        </p>
      )}
      <hr style={{ border: 0, borderTop: '1px solid var(--rule)', margin: '32px 0 0' }} />
      {children}
    </div>
  );
}

Object.assign(window, {
  HowItWorks, PoliciesPage, IntegrationPage, AuthorityPage, DeployPage,
});
