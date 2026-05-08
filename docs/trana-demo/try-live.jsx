// =============================================================
// Trana Guard — "Try it live" page
// All 4 Withdraw states, Deposit, Upgrade, right-side state panel
// =============================================================

const { useState: useStateL, useEffect: useEffectL, useRef: useRefL, useMemo: useMemoL } = React;

const PROGRAM_ID = '7TgRanaGuArD9TvJyf3KkpFw2HxQwvpKpUhNpVnDmLmS';
const AUTHORITY_PDA = 'Tr4n4PdAauTh0r1tyXvJ9hnfQwzZqLmW8sKRyP1eNvBb';
const SEED_PHRASE = 'pioneer ridge fabric outdoor enroll cabin orbit chimney plate hover music ladder';

function TryItLive({ wallet, onConnect, onDisconnect }) {
  const toast = useToast();

  // ----- chain state (pretend) -----
  const [poolBalance, setPoolBalance] = useStateL(412.503);
  const [registryNonce, setRegistryNonce] = useStateL(1847);
  const [yourDeposits, setYourDeposits] = useStateL(0);
  const [lastSig, setLastSig] = useStateL(null);
  const [lastPolicy, setLastPolicy] = useStateL(null);
  const [poolFlash, setPoolFlash] = useStateL(false);
  const [nonceFlash, setNonceFlash] = useStateL(false);
  const [showPhrase, setShowPhrase] = useStateL(false);

  // ----- demo selector -----
  const [tab, setTab] = useStateL('withdraw'); // deposit | withdraw | upgrade

  // ----- transaction strip phase -----
  // idle | pre | precompile | record | action | done | failed
  const [txPhase, setTxPhase] = useStateL('idle');

  // ----- passkey modal -----
  const [pkOpen, setPkOpen] = useStateL(false);
  const pkResolveRef = useRefL(null);
  const requestPasskey = (intent) => new Promise(resolve => {
    pkResolveRef.current = resolve;
    setPkOpen(true);
  });
  const onPkApprove = () => {
    setPkOpen(false);
    pkResolveRef.current && pkResolveRef.current(true);
  };
  const onPkCancel = () => {
    setPkOpen(false);
    pkResolveRef.current && pkResolveRef.current(false);
  };
  const [pkIntent, setPkIntent] = useStateL('');

  // ----- pool refresh tick -----
  useEffectL(() => {
    const t = setInterval(() => {
      setPoolBalance(b => +(b + (Math.random() * 0.04 - 0.005)).toFixed(3));
    }, 5000);
    return () => clearInterval(t);
  }, []);

  // ----- nonce flash on change -----
  useEffectL(() => {
    setNonceFlash(true);
    const t = setTimeout(() => setNonceFlash(false), 700);
    return () => clearTimeout(t);
  }, [registryNonce]);

  const flashPool = (delta) => {
    setPoolFlash(true);
    setPoolBalance(b => +(b + delta).toFixed(3));
    setTimeout(() => setPoolFlash(false), 720);
  };

  // ----- run the tx animation through the strip -----
  const runStrip = async (kind, opts = {}) => {
    // kind: simple (no passkey) | guarded (passkey path) | failed
    setTxPhase('pre');
    if (kind === 'simple') {
      setTxPhase('action');
      await wait(700);
    } else if (kind === 'guarded') {
      setTxPhase('precompile');
      await wait(550);
      setTxPhase('record');
      await wait(550);
      setTxPhase('action');
      await wait(550);
    } else if (kind === 'failed-attack') {
      setTxPhase('action');
      await wait(550);
      setTxPhase('failed');
      return;
    } else if (kind === 'missing-proof') {
      // partial — bce no proof recorded
      setTxPhase('failed');
      return;
    }
    setTxPhase('done');
    await wait(900);
    setTxPhase('idle');
  };

  return (
    <div style={{ display: 'flex', minHeight: 'calc(100vh - 64px)' }}>
      {/* ---- main column ---- */}
      <div style={{ flex: 1, minWidth: 0, padding: '28px 36px 80px' }}>

        {/* page intro */}
        <PageIntro />

        {/* phrase strip */}
        <PhraseStrip
          shown={showPhrase}
          onToggle={() => setShowPhrase(s => !s)}
        />

        {/* card selector */}
        <CardSelector tab={tab} onTab={setTab} />

        {/* panels */}
        <div style={{ marginTop: 28 }}>
          {tab === 'deposit' && (
            <DepositPanel
              wallet={wallet}
              onSuccess={(amt, sig) => {
                setLastSig(sig);
                setLastPolicy(null);
                setYourDeposits(d => +(d + amt).toFixed(3));
                flashPool(amt);
                toast.push({ text: `Deposited ${amt.toFixed(2)} SOL`, sig });
              }}
              runStrip={runStrip}
            />
          )}
          {tab === 'withdraw' && (
            <WithdrawPanel
              wallet={wallet}
              poolBalance={poolBalance}
              requestPasskey={requestPasskey}
              setPkIntent={setPkIntent}
              onSuccess={(amt, policy, sig) => {
                setLastSig(sig);
                setLastPolicy(policy);
                setRegistryNonce(n => n + 1);
                flashPool(-amt);
                toast.push({
                  text: `Withdrew ${amt.toFixed(2)} SOL · ${policy}`, sig,
                  label: 'ProofVerified',
                });
              }}
              onSimple={(amt, sig) => {
                setLastSig(sig);
                setLastPolicy('Limit');
                flashPool(-amt);
                toast.push({
                  text: `Withdrew ${amt.toFixed(2)} SOL — under limit`,
                  sig,
                });
              }}
              onFailed={(reason) => {
                toast.push({ kind: 'err', text: reason, label: 'MissingProof' });
              }}
              runStrip={runStrip}
              txPhase={txPhase}
              setTxPhase={setTxPhase}
            />
          )}
          {tab === 'upgrade' && (
            <UpgradePanel
              wallet={wallet}
              requestPasskey={requestPasskey}
              setPkIntent={setPkIntent}
              onSuccess={(sig) => {
                setLastSig(sig);
                setLastPolicy('Require');
                setRegistryNonce(n => n + 1);
                toast.push({ text: 'Program upgraded · v1 → v2', sig });
              }}
              onFailed={(reason) => {
                toast.push({ kind: 'err', text: reason, label: 'Tx failed' });
              }}
              runStrip={runStrip}
              txPhase={txPhase}
            />
          )}
        </div>

        {/* tx anatomy strip — shared bottom rail (only when relevant) */}
        {(tab === 'withdraw' || tab === 'upgrade') && (
          <div style={{ marginTop: 28, border: '1px solid var(--rule)' }}>
            <TxAnatomyStrip
              phase={txPhase}
              action={tab === 'upgrade' ? 'bpf_loader::upgrade' : 'vault::withdraw'}
              policy={lastPolicy}
            />
          </div>
        )}
      </div>

      {/* ---- right state panel ---- */}
      <RightPanel
        poolBalance={poolBalance}
        poolFlash={poolFlash}
        registryNonce={registryNonce}
        nonceFlash={nonceFlash}
        yourDeposits={yourDeposits}
        lastSig={lastSig}
        lastPolicy={lastPolicy}
      />

      <PasskeyModal
        open={pkOpen}
        onApprove={onPkApprove}
        onCancel={onPkCancel}
        intent={pkIntent}
      />
    </div>
  );
}

// ---------- helpers ----------
const wait = (ms) => new Promise(r => setTimeout(r, ms));

// ---------- page intro ----------
function PageIntro() {
  return (
    <div style={{ marginBottom: 28, maxWidth: 760 }}>
      <div className="eyebrow" style={{ marginBottom: 12 }}>01 · Try it live · Solana devnet</div>
      <h1 className="h1">A vault you can attack.</h1>
      <p className="body" style={{ marginTop: 12, fontSize: 15.5, color: 'var(--bone-2)' }}>
        Anyone can deposit. Anyone can attempt to withdraw. The seed phrase is published below — the
        keypair signing is freely available. Funds remain because the program demands a fresh
        WebAuthn proof at execution time, not at signing time.
      </p>
    </div>
  );
}

// ---------- phrase strip ----------
function PhraseStrip({ shown, onToggle }) {
  return (
    <div style={{
      border: '1px solid var(--rule)',
      padding: '12px 16px',
      marginBottom: 28,
      display: 'flex', alignItems: 'center', gap: 14,
      background: 'var(--ink-2)',
    }}>
      <Icon name="lock" size={14} className="dim" />
      <div className="mono" style={{ fontSize: 12, color: 'var(--bone-3)' }}>
        Seed phrase published. The funds are protected by passkey — not the key.
      </div>
      <button onClick={onToggle} className="btn btn-ghost" style={{ marginLeft: 'auto', padding: '6px 10px' }}>
        <Icon name={shown ? 'eye-off' : 'eye'} size={12} />
        {shown ? 'Hide phrase' : 'Show phrase'}
      </button>
      {shown && (
        <div style={{
          flexBasis: '100%', marginTop: 12, paddingTop: 12,
          borderTop: '1px dashed var(--rule)',
          fontFamily: 'var(--mono)', fontSize: 12.5, letterSpacing: '0.04em',
          color: 'var(--bone-2)',
          display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: 8,
        }}>
          {SEED_PHRASE.split(' ').map((w, i) => (
            <div key={i} style={{
              padding: '6px 8px', border: '1px solid var(--rule)',
              display: 'flex', alignItems: 'baseline', gap: 8,
            }}>
              <span style={{ color: 'var(--bone-4)', fontSize: 10 }}>{i + 1}</span>
              <span>{w}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ---------- card selector ----------
function CardSelector({ tab, onTab }) {
  const cards = [
    { id: 'deposit', icon: 'arrow-down-box', title: 'Deposit',
      sub: 'Top up the shared pool', tag: 'No passkey required', tagKind: 'azure' },
    { id: 'withdraw', icon: 'arrow-up-box', title: 'Withdraw',
      sub: 'Try to drain the pool', tag: '3 policies — discover them', tagKind: 'lime' },
    { id: 'upgrade', icon: 'cpu', title: 'Program upgrade',
      sub: 'Try to patch the program', tag: 'Authority PDA primitive', tagKind: 'plasma' },
  ];
  return (
    <div style={{
      display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 14,
    }}>
      {cards.map(c => {
        const active = tab === c.id;
        return (
          <button key={c.id} onClick={() => onTab(c.id)}
            className={'demo-card' + (active ? ' active' : '')}
            style={{
              textAlign: 'left', padding: '20px 22px',
              background: active ? 'rgba(198,255,58,0.04)' : 'var(--ink-2)',
              border: '1px solid ' + (active ? 'rgba(198,255,58,0.55)' : 'var(--rule)'),
              color: 'var(--bone)', cursor: 'pointer',
              transition: 'transform 100ms ease, border-color 120ms ease, background 120ms ease, box-shadow 120ms ease',
              minHeight: 168, position: 'relative',
              display: 'flex', flexDirection: 'column', justifyContent: 'space-between',
            }}>
            <div>
              <div style={{
                width: 36, height: 36, border: '1px solid var(--rule-2)',
                display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                marginBottom: 14, color: active ? 'var(--lime)' : 'var(--bone)',
              }}>
                <Icon name={c.icon} size={18} />
              </div>
              <div className="h2" style={{ fontSize: 19 }}>{c.title}</div>
              <div className="body" style={{ fontSize: 13, marginTop: 4 }}>{c.sub}</div>
            </div>
            <div style={{ marginTop: 14 }}>
              <span className={'pill ' + c.tagKind}>{c.tag}</span>
            </div>
            <style>{`
              .demo-card:hover {
                transform: translateY(-3px);
                box-shadow: 0 18px 40px -28px rgba(198,255,58,0.35);
                border-color: var(--rule-2);
              }
              .demo-card.active:hover {
                box-shadow: 0 18px 40px -22px rgba(198,255,58,0.55);
              }
            `}</style>
          </button>
        );
      })}
    </div>
  );
}

// =========================================================
// DEPOSIT
// =========================================================
function DepositPanel({ wallet, onSuccess, runStrip }) {
  const [amt, setAmt] = useStateL('0.5');
  const [busy, setBusy] = useStateL(false);

  const submit = async () => {
    if (!wallet) return;
    const n = parseFloat(amt) || 0;
    if (n <= 0) return;
    setBusy(true);
    await runStrip('simple');
    onSuccess(n, fakeSig());
    setBusy(false);
  };

  return (
    <Panel title="Deposit · top up the shared pool">
      <div className="body" style={{ marginBottom: 18, fontSize: 13.5 }}>
        Anyone can deposit. This funds the challenge for others. No passkey is required —
        only your wallet signature.
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: 14, alignItems: 'end' }}>
        <div>
          <label className="eyebrow" style={{ display: 'block', marginBottom: 8 }}>Amount</label>
          <div style={{
            display: 'flex', alignItems: 'center', gap: 10,
            border: '1px solid var(--rule-2)', padding: '10px 14px',
            background: 'var(--ink)',
          }}>
            <input type="text" value={amt} onChange={e => setAmt(e.target.value)}
              style={{
                flex: 1, background: 'transparent', border: 0, color: 'var(--bone)',
                fontFamily: 'var(--sans)', fontWeight: 500, fontSize: 24,
                letterSpacing: '-0.02em', outline: 'none',
              }} />
            <span className="mono dim" style={{ fontSize: 12 }}>SOL</span>
          </div>
          <div style={{ display: 'flex', gap: 6, marginTop: 10 }}>
            {[0.1, 0.5, 1.0].map(v => (
              <button key={v} onClick={() => setAmt(String(v))}
                className="btn btn-ghost" style={{ padding: '7px 12px', fontSize: 11 }}>
                {v} SOL
              </button>
            ))}
          </div>
        </div>
        <button className="btn btn-primary" onClick={submit}
                disabled={!wallet || busy}
                style={{ height: 56, padding: '0 24px' }}>
          {busy ? 'Confirming…' : !wallet ? 'Connect wallet' : 'Add to pool'}
        </button>
      </div>
      <div className="body" style={{ marginTop: 18, fontSize: 12.5, color: 'var(--bone-4)' }}>
        Wallet sign only · no passkey · ix count: 1
      </div>
    </Panel>
  );
}

// =========================================================
// WITHDRAW — STATES A / B / C / D
// =========================================================
function WithdrawPanel({
  wallet, poolBalance, requestPasskey, setPkIntent,
  onSuccess, onSimple, onFailed, runStrip, txPhase, setTxPhase,
}) {
  const [amt, setAmt] = useStateL('0.4');
  const [busy, setBusy] = useStateL(false);
  const [shake, setShake] = useStateL(false);
  const [resultBadge, setResultBadge] = useStateL(null);
  // resultBadge: { kind: 'ok'|'err'|'esc', label, explanation }

  // drain window state
  const [drainStart, setDrainStart] = useStateL(null);   // ts
  const [drainCountdown, setDrainCountdown] = useStateL(0);

  useEffectL(() => {
    if (!drainStart) return;
    const t = setInterval(() => {
      const left = Math.max(0, 60 - Math.floor((Date.now() - drainStart) / 1000));
      setDrainCountdown(left);
      if (left === 0) { setDrainStart(null); setDrainCountdown(0); }
    }, 250);
    return () => clearInterval(t);
  }, [drainStart]);

  const drainOpen = drainCountdown > 0;
  const numAmt = parseFloat(amt) || 0;
  const policyEngaged = numAmt >= 1
    ? 'Limit (over threshold)'
    : drainOpen
      ? 'Require (drain window)'
      : 'Limit (under threshold)';

  const trigger = (kind) => {
    setShake(true);
    setTimeout(() => setShake(false), 360);
  };

  const submit = async () => {
    if (!wallet || numAmt <= 0) return;
    setBusy(true);
    setResultBadge(null);

    // STATE A — small + no drain window: succeed without passkey
    if (numAmt < 1 && !drainOpen) {
      await runStrip('simple');
      const sig = fakeSig();
      onSimple(numAmt, sig);
      setResultBadge({
        kind: 'ok',
        label: 'No passkey needed',
        explanation: 'Amount below the 1 SOL limit. Policy: Limit.',
      });
      // open drain window for next attempt
      setDrainStart(Date.now());
      setBusy(false);
      return;
    }

    // STATE B — large amount: passkey required
    // STATE C — small + drain window: passkey required (escalated)
    const intent = numAmt >= 1
      ? `vault::withdraw ${numAmt.toFixed(2)} SOL`
      : `vault::withdraw ${numAmt.toFixed(2)} SOL (drain window)`;
    setPkIntent(intent);
    const approved = await requestPasskey(intent);

    if (!approved) {
      // failure path
      trigger();
      setTxPhase('failed');
      await wait(120);
      setTxPhase('idle');
      onFailed(numAmt >= 1
        ? '1 SOL threshold crossed without proof'
        : 'Drain window — proof required, none supplied');
      setResultBadge({
        kind: 'err',
        label: 'MissingProof',
        explanation: numAmt >= 1
          ? '1 SOL threshold crossed. Policy: Limit — passkey required above limit.'
          : 'Consecutive withdrawals detected within 60s window. Escalated to Policy: Require.',
      });
      setBusy(false);
      return;
    }

    // approved — STATE D
    await runStrip('guarded');
    const sig = fakeSig();
    const policy = numAmt >= 1 ? 'Limit' : 'Require';
    onSuccess(numAmt, policy, sig);
    setResultBadge({
      kind: 'ok',
      label: 'ProofVerified',
      explanation: numAmt >= 1
        ? '1 SOL threshold crossed. Policy: Limit — proof accepted.'
        : 'Drain window active. Policy: Require — proof accepted.',
    });
    // refresh drain window
    setDrainStart(Date.now());
    setBusy(false);
  };

  return (
    <Panel
      title="Withdraw · attempt to drain"
      headerRight={
        <div className="mono" style={{ fontSize: 11, color: 'var(--bone-3)' }}>
          policy in play <span style={{ color: 'var(--lime)', marginLeft: 6 }}>{policyEngaged}</span>
        </div>
      }
      className={shake ? 'shake' : ''}
    >
      <div style={{ display: 'grid', gridTemplateColumns: '1.4fr 1fr', gap: 28 }}>
        <div>
          <label className="eyebrow" style={{ display: 'block', marginBottom: 8 }}>Amount · 0.01 — 5 SOL</label>
          <div style={{
            display: 'flex', alignItems: 'center', gap: 10,
            border: '1px solid ' + (numAmt >= 1 ? 'rgba(198,255,58,0.42)' : 'var(--rule-2)'),
            padding: '10px 14px', background: 'var(--ink)',
            transition: 'border-color 150ms ease',
          }}>
            <input type="text" value={amt} onChange={e => setAmt(e.target.value)}
              style={{
                flex: 1, background: 'transparent', border: 0, color: 'var(--bone)',
                fontFamily: 'var(--sans)', fontWeight: 500, fontSize: 28,
                letterSpacing: '-0.02em', outline: 'none',
              }} />
            <span className="mono dim" style={{ fontSize: 12 }}>SOL</span>
          </div>
          <input type="range" min={0.01} max={5} step={0.01}
            value={numAmt}
            onChange={e => setAmt(String(parseFloat(e.target.value).toFixed(2)))}
            style={{ width: '100%', marginTop: 14, accentColor: '#c6ff3a' }} />
          {/* threshold tick guide */}
          <div style={{
            display: 'flex', justifyContent: 'space-between',
            fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--bone-4)',
            marginTop: 4,
          }}>
            <span>0.01</span>
            <span style={{ color: numAmt >= 1 ? 'var(--lime)' : 'var(--bone-3)' }}>↑ 1.00 limit</span>
            <span>5.00</span>
          </div>

          <div style={{ marginTop: 18, display: 'flex', gap: 10, alignItems: 'center' }}>
            <button className="btn btn-primary" onClick={submit}
                    disabled={!wallet || busy}
                    style={{ flex: 1 }}>
              {busy ? 'Submitting…'
                : !wallet ? 'Connect wallet'
                : numAmt >= 1 ? <><Icon name="fingerprint" size={14} /> Withdraw · passkey required</>
                : drainOpen ? <><Icon name="fingerprint" size={14} /> Withdraw · drain window</>
                : <>Withdraw</>}
            </button>
          </div>
          <div className="body" style={{ marginTop: 14, fontSize: 12.5, color: 'var(--bone-4)' }}>
            Pool balance · {formatSol(poolBalance)} SOL. Try a small amount first.
          </div>
        </div>

        <div>
          {/* drain window */}
          <DrainWindow open={drainOpen} secondsLeft={drainCountdown} />
          {/* result badge */}
          <ResultBadge badge={resultBadge} />
          {/* state map */}
          <StateLegend amount={numAmt} drainOpen={drainOpen} />
        </div>
      </div>
    </Panel>
  );
}

function DrainWindow({ open, secondsLeft }) {
  const pct = Math.max(0, Math.min(1, secondsLeft / 60));
  const SIZE = 56, STROKE = 4;
  const r = (SIZE - STROKE) / 2;
  const c = 2 * Math.PI * r;
  return (
    <div style={{
      border: '1px solid ' + (open ? 'rgba(245,166,35,0.42)' : 'var(--rule)'),
      padding: '14px 16px', marginBottom: 14,
      background: open ? 'rgba(245,166,35,0.04)' : 'var(--ink-2)',
      display: 'flex', alignItems: 'center', gap: 14,
      transition: 'border-color 200ms ease',
    }}>
      <svg width={SIZE} height={SIZE}>
        <circle cx={SIZE/2} cy={SIZE/2} r={r} fill="none"
          stroke="var(--rule-2)" strokeWidth={STROKE} />
        {open && <circle cx={SIZE/2} cy={SIZE/2} r={r} fill="none"
          stroke="var(--amber)" strokeWidth={STROKE}
          strokeDasharray={c} strokeDashoffset={c * (1 - pct)}
          strokeLinecap="round"
          transform={`rotate(-90 ${SIZE/2} ${SIZE/2})`}
          style={{ transition: 'stroke-dashoffset 250ms linear' }} />}
      </svg>
      <div style={{ flex: 1 }}>
        <div className="eyebrow" style={{ marginBottom: 2 }}>Drain window</div>
        {open ? (
          <div className="mono" style={{ fontSize: 12.5, color: 'var(--bone)' }}>
            Active · <span style={{ color: 'var(--amber)' }}>{secondsLeft}s</span> remaining
          </div>
        ) : (
          <div className="mono" style={{ fontSize: 12.5, color: 'var(--bone-4)' }}>
            Closed · 60s window opens after a withdrawal
          </div>
        )}
      </div>
    </div>
  );
}

function ResultBadge({ badge }) {
  if (!badge) return (
    <div style={{
      border: '1px dashed var(--rule)', padding: '14px 16px',
      marginBottom: 14, background: 'transparent',
    }}>
      <div className="eyebrow" style={{ marginBottom: 4 }}>Last result</div>
      <div className="body" style={{ fontSize: 12.5, color: 'var(--bone-4)' }}>
        Awaiting first attempt
      </div>
    </div>
  );
  const isErr = badge.kind === 'err';
  return (
    <div style={{
      border: '1px solid ' + (isErr ? 'rgba(255,91,31,0.42)' : 'rgba(198,255,58,0.45)'),
      padding: '14px 16px', marginBottom: 14,
      background: isErr ? 'rgba(255,91,31,0.05)' : 'rgba(198,255,58,0.04)',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
        <span className={'pill ' + (isErr ? 'plasma' : 'lime')}>
          <span className="dot"></span>{badge.label}
        </span>
      </div>
      <div className="body" style={{ fontSize: 12.5, color: 'var(--bone-2)' }}>
        {badge.explanation}
      </div>
    </div>
  );
}

function StateLegend({ amount, drainOpen }) {
  const stateId = amount >= 1 ? 'B'
                  : drainOpen ? 'C' : 'A';
  const map = [
    ['A', 'Small + no window', '< 1 SOL · wallet sign only'],
    ['B', 'Large amount', '≥ 1 SOL · passkey required'],
    ['C', 'Drain escalated', '< 1 SOL but window open · passkey required'],
    ['D', 'Approve path', 'WebAuthn ceremony in flight'],
  ];
  return (
    <div style={{
      border: '1px solid var(--rule)', padding: '14px 16px',
      background: 'var(--ink-2)',
    }}>
      <div className="eyebrow" style={{ marginBottom: 10 }}>Discovered states</div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {map.map(([id, t, sub]) => {
          const active = id === stateId;
          return (
            <div key={id} style={{
              display: 'flex', gap: 10, alignItems: 'baseline',
              padding: '5px 8px', margin: '0 -8px',
              background: active ? 'rgba(198,255,58,0.06)' : 'transparent',
              borderLeft: '2px solid ' + (active ? 'var(--lime)' : 'transparent'),
            }}>
              <span className="mono" style={{
                fontSize: 11, color: active ? 'var(--lime)' : 'var(--bone-4)',
                width: 14,
              }}>{id}</span>
              <div style={{ flex: 1 }}>
                <div className="mono" style={{ fontSize: 11.5, color: active ? 'var(--bone)' : 'var(--bone-3)' }}>{t}</div>
                <div className="mono" style={{ fontSize: 10.5, color: 'var(--bone-4)' }}>{sub}</div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// =========================================================
// UPGRADE
// =========================================================
function UpgradePanel({ wallet, requestPasskey, setPkIntent,
                       onSuccess, onFailed, runStrip, txPhase }) {
  const [version, setVersion] = useStateL(1);
  const [tab, setTab] = useStateL('attack'); // attack | approve
  const [busy, setBusy] = useStateL(false);
  const [shake, setShake] = useStateL(false);
  const [verFlash, setVerFlash] = useStateL(false);
  const [lastResult, setLastResult] = useStateL(null);

  const tryAttack = async () => {
    if (!wallet) return;
    setBusy(true);
    await runStrip('failed-attack');
    setShake(true);
    setTimeout(() => setShake(false), 360);
    setLastResult({
      kind: 'err',
      label: 'Incorrect authority',
      sub: 'The wallet key is not the upgrade authority. The PDA is.',
    });
    onFailed('bpf_loader: incorrect authority provided');
    setBusy(false);
  };

  const tryApprove = async () => {
    if (!wallet) return;
    setPkIntent('bpf_loader_upgrade::set_program(v2)');
    const ok = await requestPasskey('bpf_loader_upgrade::set_program(v2)');
    if (!ok) {
      onFailed('Passkey cancelled · upgrade not authorized');
      setLastResult({
        kind: 'err', label: 'MissingProof',
        sub: 'Authority PDA refused — no proof recorded for this CPI.',
      });
      return;
    }
    setBusy(true);
    await runStrip('guarded');
    setVerFlash(true);
    setTimeout(() => { setVersion(v => v + 1); setTimeout(() => setVerFlash(false), 700); }, 200);
    onSuccess(fakeSig());
    setLastResult({
      kind: 'ok', label: 'ProofVerified',
      sub: 'PDA signed the upgrade via CPI. Authority preserved.',
    });
    setBusy(false);
  };

  return (
    <Panel
      title="Program upgrade · authority PDA"
      headerRight={
        <div className="mono" style={{ fontSize: 11, color: 'var(--bone-3)' }}>
          program <span className="dim">{truncate(PROGRAM_ID, 6)}</span>
        </div>
      }
      className={shake ? 'shake' : ''}
    >
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 22 }}>

        {/* LEFT — program state */}
        <div style={{
          border: '1px solid var(--rule)', padding: '18px 18px 16px',
          background: 'var(--ink-2)',
        }}>
          <div className="eyebrow" style={{ marginBottom: 14 }}>Program state · live</div>

          <KeyValueRow lbl="program id" val={truncate(PROGRAM_ID, 8)} copy={PROGRAM_ID} />
          <KeyValueRow lbl="upgrade auth" val={truncate(AUTHORITY_PDA, 8)} copy={AUTHORITY_PDA}
                       hint="Trana Authority PDA" />

          <div style={{ marginTop: 16, marginBottom: 14 }}>
            <div className="eyebrow" style={{ marginBottom: 6 }}>solana program show</div>
            <Code copyText={`Program Id: ${PROGRAM_ID}\nOwner: BPFLoaderUpgradeab1e\nAuthority: ${AUTHORITY_PDA}\nLast Deployed Slot: 327891204\nData Length: 286456 bytes`}>
{`<c>$ solana program show ${truncate(PROGRAM_ID, 6)}</c>
Program Id:   ${truncate(PROGRAM_ID, 8)}
Owner:        BPFLoaderUpgradeab1e
<k>Authority:    ${truncate(AUTHORITY_PDA, 8)}</k>  <c>← Trana PDA, not a wallet</c>
Last Slot:    327,891,204
Data Length:  286,456 bytes`}
            </Code>
          </div>

          <div style={{
            display: 'flex', alignItems: 'center', gap: 10, paddingTop: 12,
            borderTop: '1px solid var(--rule)',
          }}>
            <span className="eyebrow">version</span>
            <VersionBadge v={version} flash={verFlash} />
          </div>
        </div>

        {/* RIGHT — action */}
        <div style={{
          border: '1px solid var(--rule)', padding: '18px',
          background: 'var(--ink-2)',
        }}>
          <div style={{ display: 'flex', borderBottom: '1px solid var(--rule)', marginBottom: 16 }}>
            {[
              { id: 'attack', label: 'Attack', kind: 'plasma' },
              { id: 'approve', label: 'Approve', kind: 'lime' },
            ].map(t => (
              <button key={t.id} onClick={() => setTab(t.id)}
                style={{
                  background: 'transparent', border: 0, color: tab === t.id ? 'var(--bone)' : 'var(--bone-4)',
                  padding: '8px 14px',
                  fontFamily: 'var(--mono)', fontSize: 11, letterSpacing: '0.18em',
                  textTransform: 'uppercase',
                  borderBottom: '2px solid ' + (tab === t.id
                    ? (t.kind === 'plasma' ? 'var(--plasma)' : 'var(--lime)')
                    : 'transparent'),
                  marginBottom: -1, cursor: 'pointer',
                }}>{t.label}</button>
            ))}
          </div>

          {tab === 'attack' && (
            <>
              <div className="body" style={{ fontSize: 13, marginBottom: 18 }}>
                Use a leaked wallet key to attempt an upgrade. Simulates an attacker who
                stole the deployer's private key. The PDA is the real authority — this will fail.
              </div>
              <button className="btn btn-danger" onClick={tryAttack}
                      disabled={!wallet || busy} style={{ width: '100%', marginBottom: 14 }}>
                {busy ? 'Attempting…' : 'Upgrade with leaked wallet key'}
              </button>
              <Code lang="rust" copyText="bpf_loader_upgrade(program, &authority=wallet_kp)">
{`<c>// attacker has the wallet keypair</c>
bpf_loader_upgrade(
  program: <a>${truncate(PROGRAM_ID, 6)}</a>,
  authority: <p>wallet_kp</p>,    <c>// ← not the real authority</c>
  buffer: <a>v2_buffer</a>,
);
<c>// ✗ Incorrect authority provided</c>`}
              </Code>
            </>
          )}

          {tab === 'approve' && (
            <>
              <div className="body" style={{ fontSize: 13, marginBottom: 18 }}>
                Trigger an upgrade via the authority PDA. The PDA can only sign with a
                fresh WebAuthn proof recorded in the same transaction.
              </div>
              <button className="btn btn-primary" onClick={tryApprove}
                      disabled={!wallet || busy} style={{ width: '100%', marginBottom: 14 }}>
                <Icon name="fingerprint" size={14} />
                {busy ? 'Confirming…' : 'Upgrade with passkey'}
              </button>
              <Code lang="rust" copyText="trana_authority::cpi::upgrade(ctx)">
{`<c>// PDA signs only with a verified proof</c>
trana_authority::cpi::<a>upgrade</a>(ctx)
  .accounts(UpgradeAccounts {
    authority_pda: <a>trana_pda</a>,
    program: <a>${truncate(PROGRAM_ID, 6)}</a>,
    buffer: <a>v2_buffer</a>,
  })?;
<c>// ✓ ProofVerified · Authority PDA preserved</c>`}
              </Code>
            </>
          )}

          {lastResult && (
            <div style={{
              marginTop: 16, padding: '10px 14px',
              border: '1px solid ' + (lastResult.kind === 'err'
                ? 'rgba(255,91,31,0.42)' : 'rgba(198,255,58,0.45)'),
              background: lastResult.kind === 'err'
                ? 'rgba(255,91,31,0.05)' : 'rgba(198,255,58,0.04)',
            }}>
              <span className={'pill ' + (lastResult.kind === 'err' ? 'plasma' : 'lime')}>
                <span className="dot"></span>{lastResult.label}
              </span>
              <div className="body" style={{ marginTop: 6, fontSize: 12.5 }}>{lastResult.sub}</div>
            </div>
          )}
        </div>
      </div>
    </Panel>
  );
}

function VersionBadge({ v, flash }) {
  return (
    <div style={{
      display: 'inline-flex', alignItems: 'baseline',
      padding: '6px 12px', border: '1px solid ' + (flash ? 'var(--lime)' : 'var(--rule-2)'),
      background: flash ? 'rgba(198,255,58,0.08)' : 'transparent',
      transition: 'all 240ms ease',
      fontFamily: 'var(--mono)', fontSize: 14, color: 'var(--bone)',
    }}>
      v
      <span style={{
        display: 'inline-block', minWidth: 14, textAlign: 'left',
        marginLeft: 1, transition: 'transform 320ms ease',
        transform: flash ? 'translateY(-2px)' : 'translateY(0)',
        color: flash ? 'var(--lime)' : 'var(--bone)',
      }}>{v}</span>
    </div>
  );
}

function KeyValueRow({ lbl, val, copy, hint }) {
  const [copied, setCopied] = useStateL(false);
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 10,
      padding: '8px 0', borderBottom: '1px dashed var(--rule)',
    }}>
      <div className="eyebrow" style={{ width: 110 }}>{lbl}</div>
      <div className="mono" style={{ fontSize: 12, color: 'var(--bone)' }}>{val}</div>
      {hint && <span className="pill" style={{ fontSize: 9 }}>{hint}</span>}
      {copy && (
        <button onClick={() => {
          navigator.clipboard.writeText(copy).catch(()=>{});
          setCopied(true); setTimeout(() => setCopied(false), 1100);
        }}
        style={{
          marginLeft: 'auto', background: 'transparent', border: 0,
          color: copied ? 'var(--lime)' : 'var(--bone-4)', cursor: 'pointer',
          padding: 4, display: 'inline-flex', alignItems: 'center', gap: 4,
          fontFamily: 'var(--mono)', fontSize: 10,
        }}>
          <Icon name="copy" size={12} />
          {copied ? 'copied' : ''}
        </button>
      )}
    </div>
  );
}

// =========================================================
// PANEL — generic frame for each card
// =========================================================
function Panel({ title, headerRight, children, className = '' }) {
  return (
    <div className={className} style={{
      border: '1px solid var(--rule)',
      background: 'var(--ink-2)',
    }}>
      <div style={{
        padding: '14px 22px', borderBottom: '1px solid var(--rule)',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      }}>
        <div className="h3" style={{ fontSize: 14, fontFamily: 'var(--mono)',
                                       letterSpacing: '0.06em', color: 'var(--bone)' }}>
          {title}
        </div>
        {headerRight}
      </div>
      <div style={{ padding: '24px 24px 26px' }}>{children}</div>
    </div>
  );
}

// =========================================================
// RIGHT PANEL — live state
// =========================================================
function RightPanel({ poolBalance, poolFlash, registryNonce, nonceFlash,
                      yourDeposits, lastSig, lastPolicy }) {
  return (
    <aside style={{
      width: 300, borderLeft: '1px solid var(--rule)',
      padding: '28px 22px', position: 'sticky', top: 64,
      alignSelf: 'flex-start', height: 'calc(100vh - 64px)',
      overflowY: 'auto',
      flexShrink: 0,
      background: 'var(--ink)',
    }}
    className="right-panel">
      <div className="eyebrow" style={{ marginBottom: 14, display: 'flex', justifyContent: 'space-between' }}>
        <span>Live state</span>
        <span style={{ display: 'inline-flex', gap: 5, alignItems: 'center' }}>
          <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--lime)',
                          animation: 'rp-blink 2s linear infinite' }}></span>
          devnet
        </span>
      </div>

      <Stat label="Shared vault balance"
            value={formatSol(poolBalance)} unit="SOL"
            big flash={poolFlash} />
      <Stat label="Registry nonce"
            value={String(registryNonce)} mono flash={nonceFlash} />
      <Stat label="Your deposits this session"
            value={yourDeposits === 0 ? '—' : formatSol(yourDeposits)} unit={yourDeposits === 0 ? '' : 'SOL'} />
      <Stat label="Last policy triggered"
            value={lastPolicy || '—'}
            color={lastPolicy === 'Limit' ? 'var(--lime)' :
                   lastPolicy === 'Require' ? 'var(--azure)' : 'var(--bone)'} />

      <div style={{ marginTop: 22 }}>
        <div className="eyebrow" style={{ marginBottom: 8 }}>Last tx signature</div>
        {lastSig ? (
          <a href="#" onClick={e => e.preventDefault()}
             style={{ display: 'flex', alignItems: 'center', gap: 6,
                      color: 'var(--azure)', fontFamily: 'var(--mono)', fontSize: 11.5,
                      wordBreak: 'break-all' }}>
            {truncate(lastSig, 8)}
            <Icon name="link-out" size={12} />
          </a>
        ) : (
          <div className="mono dim" style={{ fontSize: 11.5 }}>No transactions yet</div>
        )}
      </div>

      <div style={{ marginTop: 28, paddingTop: 18, borderTop: '1px solid var(--rule)' }}>
        <div className="eyebrow" style={{ marginBottom: 10 }}>RPC endpoint</div>
        <div className="mono" style={{ fontSize: 10.5, color: 'var(--bone-3)', wordBreak: 'break-all', lineHeight: 1.5 }}>
          api.devnet.solana.com
        </div>
        <div className="mono" style={{ fontSize: 10, color: 'var(--bone-4)', marginTop: 4 }}>
          slot 327,891,204 · refresh 5s
        </div>
      </div>

      <style>{`
        @keyframes rp-blink {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.35; }
        }
        @media (max-width: 1180px) {
          .right-panel { display: none; }
        }
      `}</style>
    </aside>
  );
}

function Stat({ label, value, unit, big, flash, mono, color }) {
  return (
    <div style={{ marginBottom: 16 }}>
      <div className="eyebrow" style={{ marginBottom: 4 }}>{label}</div>
      <div className={'val' + (flash ? ' flash' : '')}
           style={{
             fontFamily: mono ? 'var(--mono)' : 'var(--sans)',
             fontWeight: mono ? 500 : 500,
             fontSize: big ? 26 : 18,
             letterSpacing: mono ? '0.04em' : '-0.02em',
             color: color || 'var(--bone)',
             display: 'flex', alignItems: 'baseline', gap: 5,
             transition: 'color 700ms ease',
           }}>
        {value}
        {unit && <span className="mono dim" style={{ fontSize: 11 }}>{unit}</span>}
      </div>
    </div>
  );
}

// expose
Object.assign(window, { TryItLive });
