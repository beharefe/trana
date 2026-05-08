// =============================================================
// Trana Guard — shared utilities
// Icons, modals, tx anatomy strip, code, toasts, formatters
// =============================================================

const { useState, useEffect, useRef, useMemo, useCallback } = React;

// ---------- formatters ----------
const truncate = (a, n = 4) => a ? `${a.slice(0, n)}…${a.slice(-n)}` : '';
const formatSol = (n) => Number(n).toLocaleString('en-US', {
  minimumFractionDigits: 3,
  maximumFractionDigits: 3,
});
const fakeSig = () => Array.from({ length: 64 }, () =>
  '0123456789abcdef'[Math.floor(Math.random() * 16)]).join('');

// ---------- line icons (24px, currentColor) ----------
function Icon({ name, size = 18, stroke = 1.5, className = '' }) {
  const props = {
    width: size, height: size, viewBox: '0 0 24 24',
    fill: 'none', stroke: 'currentColor',
    strokeWidth: stroke, strokeLinecap: 'round',
    strokeLinejoin: 'round',
    className,
  };
  switch (name) {
    case 'arrow-down-box':
      return <svg {...props}>
        <rect x="3.5" y="3.5" width="17" height="17" rx="1" />
        <path d="M12 8v7m-3-3 3 3 3-3" />
      </svg>;
    case 'arrow-up-box':
      return <svg {...props}>
        <rect x="3.5" y="3.5" width="17" height="17" rx="1" />
        <path d="M12 16V9m-3 3 3-3 3 3" />
      </svg>;
    case 'cpu':
      return <svg {...props}>
        <rect x="6" y="6" width="12" height="12" rx="1" />
        <rect x="9" y="9" width="6" height="6" rx="0.5" />
        <path d="M9 3v2M12 3v2M15 3v2M9 19v2M12 19v2M15 19v2M3 9h2M3 12h2M3 15h2M19 9h2M19 12h2M19 15h2" />
      </svg>;
    case 'key':
      return <svg {...props}>
        <circle cx="8" cy="14" r="3.5" />
        <path d="M10.6 11.5 21 1m-3 3 2 2m-5 1 2 2" />
      </svg>;
    case 'fingerprint':
      return <svg {...props}>
        <path d="M5 12a7 7 0 0 1 14 0v3" />
        <path d="M8.5 12a3.5 3.5 0 0 1 7 0v4a3 3 0 0 0 3 3" />
        <path d="M12 12v6" />
        <path d="M5.5 16c.5 2 1.5 3 3 4" />
      </svg>;
    case 'shield':
      return <svg {...props}>
        <path d="M12 3 4 6v6c0 4.5 3.5 7.5 8 9 4.5-1.5 8-4.5 8-9V6l-8-3Z" />
      </svg>;
    case 'check':
      return <svg {...props}><path d="m5 12 5 5L20 6" /></svg>;
    case 'x':
      return <svg {...props}><path d="M6 6 18 18M18 6 6 18" /></svg>;
    case 'copy':
      return <svg {...props}>
        <rect x="8" y="8" width="12" height="12" rx="1" />
        <path d="M16 4H5a1 1 0 0 0-1 1v11" />
      </svg>;
    case 'link-out':
      return <svg {...props}>
        <path d="M14 5h5v5M19 5l-9 9M11 5H6a1 1 0 0 0-1 1v12a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-5" />
      </svg>;
    case 'eye':
      return <svg {...props}>
        <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z" />
        <circle cx="12" cy="12" r="3" />
      </svg>;
    case 'eye-off':
      return <svg {...props}>
        <path d="m4 4 16 16M9.5 9.5a3 3 0 0 0 4.2 4.2M6.5 6.7C3.8 8.4 2 12 2 12s3.5 7 10 7c1.7 0 3.2-.4 4.5-1.1M11 5.1c.3 0 .6-.1 1-.1 6.5 0 10 7 10 7-.6 1.2-1.4 2.3-2.4 3.2" />
      </svg>;
    case 'chevron-down':
      return <svg {...props}><path d="m6 9 6 6 6-6" /></svg>;
    case 'chevron-right':
      return <svg {...props}><path d="m9 6 6 6-6 6" /></svg>;
    case 'arrow-right':
      return <svg {...props}><path d="M5 12h14m-5-5 5 5-5 5" /></svg>;
    case 'plus':
      return <svg {...props}><path d="M12 5v14M5 12h14" /></svg>;
    case 'minus':
      return <svg {...props}><path d="M5 12h14" /></svg>;
    case 'github':
      return <svg {...props}>
        <path d="M9 19c-4 1-4-2-6-2m12 4v-3.5c0-1 .1-1.4-.5-2 2.8-.3 5.5-1.4 5.5-6a4.6 4.6 0 0 0-1.3-3.2 4.2 4.2 0 0 0-.1-3.2s-1.1-.3-3.5 1.3a12 12 0 0 0-6.2 0C6.5 2.8 5.4 3.1 5.4 3.1a4.2 4.2 0 0 0-.1 3.2A4.6 4.6 0 0 0 4 9.5c0 4.6 2.7 5.7 5.5 6-.6.6-.6 1.2-.5 2V21" />
      </svg>;
    case 'wallet':
      return <svg {...props}>
        <path d="M3 7v11a1 1 0 0 0 1 1h16a1 1 0 0 0 1-1v-8a1 1 0 0 0-1-1H4a1 1 0 0 1-1-1Z" />
        <path d="M3 7a1 1 0 0 1 1-1h13M16 13h2" />
      </svg>;
    case 'sparkle':
      return <svg {...props}>
        <path d="M12 3v6m0 6v6M3 12h6m6 0h6M5.5 5.5l4 4m5 5 4 4M5.5 18.5l4-4m5-5 4-4" />
      </svg>;
    case 'dot':
      return <svg {...props}><circle cx="12" cy="12" r="3" fill="currentColor" /></svg>;
    case 'clock':
      return <svg {...props}>
        <circle cx="12" cy="12" r="9" />
        <path d="M12 7v5l3 2" />
      </svg>;
    case 'lock':
      return <svg {...props}>
        <rect x="4" y="11" width="16" height="10" rx="1" />
        <path d="M8 11V7a4 4 0 0 1 8 0v4" />
      </svg>;
    case 'menu':
      return <svg {...props}><path d="M4 7h16M4 12h16M4 17h16" /></svg>;
    default:
      return null;
  }
}

// ---------- copy button helper ----------
function CopyChip({ text, label }) {
  const [copied, setCopied] = useState(false);
  const onCopy = async () => {
    try { await navigator.clipboard.writeText(text); } catch (e) {}
    setCopied(true);
    setTimeout(() => setCopied(false), 1100);
  };
  return (
    <button onClick={onCopy} className="copy-chip">
      {copied ? 'copied' : (label || 'copy')}
      <style jsx>{``}</style>
    </button>
  );
}

// ---------- tagged code block ----------
// children is a string with our tiny tag syntax: <c>comment</c>, <k>kw</k>, etc.
function Code({ children, copyText, lang }) {
  const html = useMemo(() => {
    return String(children)
      .replace(/<c>/g, '<span class="c">').replace(/<\/c>/g, '</span>')
      .replace(/<k>/g, '<span class="k">').replace(/<\/k>/g, '</span>')
      .replace(/<a>/g, '<span class="a">').replace(/<\/a>/g, '</span>')
      .replace(/<s>/g, '<span class="s">').replace(/<\/s>/g, '</span>')
      .replace(/<p>/g, '<span class="p">').replace(/<\/p>/g, '</span>');
  }, [children]);
  const [copied, setCopied] = useState(false);
  const onCopy = async () => {
    try {
      await navigator.clipboard.writeText(copyText || String(children).replace(/<\/?\w>/g, ''));
    } catch (e) {}
    setCopied(true);
    setTimeout(() => setCopied(false), 1100);
  };
  return (
    <div style={{ position: 'relative' }}>
      {lang && <div style={{
        position: 'absolute', top: 10, left: 14,
        fontFamily: 'var(--mono)', fontSize: 9.5, letterSpacing: '0.22em',
        textTransform: 'uppercase', color: 'var(--bone-4)',
      }}>{lang}</div>}
      <pre className="code" style={lang ? { paddingTop: 32 } : null}
           dangerouslySetInnerHTML={{ __html: html }} />
      <button className="copy" onClick={onCopy}
              style={{
                position: 'absolute', top: 10, right: 10,
                fontFamily: 'var(--mono)', fontSize: 9.5, letterSpacing: '0.16em',
                textTransform: 'uppercase', padding: '5px 9px',
                border: '1px solid var(--rule)', background: 'var(--ink-2)',
                color: copied ? 'var(--lime)' : 'var(--bone-3)', cursor: 'pointer',
              }}>
        {copied ? 'copied' : 'copy'}
      </button>
    </div>
  );
}

// ---------- toast manager ----------
const ToastCtx = React.createContext(null);
function ToastHost({ children }) {
  const [toasts, setToasts] = useState([]);
  const push = useCallback((t) => {
    const id = Math.random().toString(36).slice(2);
    setToasts(ts => [...ts, { id, ...t }]);
    setTimeout(() => setToasts(ts => ts.filter(x => x.id !== id)), t.duration || 4000);
  }, []);
  return (
    <ToastCtx.Provider value={{ push }}>
      {children}
      <div className="toast-stack">
        {toasts.map(t => (
          <div key={t.id} className={'toast' + (t.kind === 'err' ? ' err' : '')}>
            <div className="bar"></div>
            <div className="body-t">
              <div className="lbl-t">{t.kind === 'err' ? 'rejected' : (t.label || 'confirmed')}</div>
              <div>{t.text}</div>
              {t.sig && <div style={{ color: 'var(--azure)', fontSize: 10.5, marginTop: 2 }}>
                {truncate(t.sig, 6)} ↗
              </div>}
            </div>
          </div>
        ))}
      </div>
    </ToastCtx.Provider>
  );
}
const useToast = () => React.useContext(ToastCtx);

// ---------- transaction anatomy strip ----------
// Shows ix[N-2] secp256r1 → ix[N-1] record_proof → ix[N] action
function TxAnatomyStrip({ phase, action = 'vault::withdraw', policy, hidden }) {
  // phase: idle | pre | precompile | record | action | done | failed
  const order = ['precompile', 'record', 'action'];
  const stateFor = (k) => {
    if (phase === 'idle' || phase === 'pre') return 'pending';
    if (phase === 'failed' && k !== order[0]) return order.indexOf(k) < order.indexOf(phase) ? 'done' : 'pending';
    if (phase === 'done') return 'done';
    const idx = order.indexOf(phase);
    const me = order.indexOf(k);
    if (me < idx) return 'done';
    if (me === idx) return 'active';
    return 'pending';
  };

  const Box = ({ stateK, name, ix, sub, ixLabel }) => {
    const isDone = stateK === 'done';
    const isActive = stateK === 'active';
    const border = isDone ? 'rgba(198,255,58,0.45)'
                  : isActive ? 'rgba(90,169,255,0.55)'
                  : 'var(--rule)';
    const accent = isDone ? 'var(--lime)' : isActive ? 'var(--azure)' : 'var(--bone-4)';
    return (
      <div style={{
        flex: 1, minWidth: 0, padding: '14px 16px', position: 'relative',
        border: `1px solid ${border}`,
        background: isActive ? 'rgba(90,169,255,0.04)' : 'var(--ink)',
        transition: 'border-color 200ms ease, background 200ms ease',
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 8 }}>
          <div style={{
            fontFamily: 'var(--mono)', fontSize: 9.5, letterSpacing: '0.2em',
            color: 'var(--bone-4)', textTransform: 'uppercase',
          }}>{ixLabel}</div>
          <div style={{
            fontFamily: 'var(--mono)', fontSize: 9.5, letterSpacing: '0.16em',
            color: accent, textTransform: 'uppercase',
          }}>
            {isDone ? '✓ ok' : isActive ? '… running' : 'pending'}
          </div>
        </div>
        <div style={{
          fontFamily: 'var(--mono)', fontSize: 13.5, color: 'var(--bone)',
          marginBottom: 4,
        }}>{name}</div>
        <div style={{ fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--bone-3)' }}>
          {sub}
        </div>
        {isActive && (
          <div style={{
            position: 'absolute', left: 0, right: 0, bottom: 0,
            height: 1.5, background: 'var(--azure)',
            animation: 'progslide 900ms linear infinite',
          }} />
        )}
      </div>
    );
  };

  if (hidden) return null;

  return (
    <div style={{
      borderTop: '1px solid var(--rule)', padding: '20px 24px 22px',
      background: 'var(--ink-2)',
    }}>
      <div style={{
        display: 'flex', justifyContent: 'space-between', alignItems: 'baseline',
        marginBottom: 12,
      }}>
        <div className="eyebrow">Transaction anatomy</div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          {policy && (
            <div style={{
              fontFamily: 'var(--mono)', fontSize: 10, letterSpacing: '0.16em',
              color: 'var(--bone-3)', textTransform: 'uppercase',
            }}>
              policy used <span style={{ color: 'var(--lime)' }}>{policy}</span>
            </div>
          )}
        </div>
      </div>
      <div style={{ display: 'flex', alignItems: 'stretch', gap: 0 }}>
        <Box stateK={stateFor('precompile')}
             ixLabel="ix[N-2]"
             name="secp256r1"
             sub="P-256 verify · native precompile" />
        <Arrow active={['record','action','done'].includes(phase)} />
        <Box stateK={stateFor('record')}
             ixLabel="ix[N-1]"
             name="record_proof"
             sub="trana_guard · stores proof for sysvar lookup" />
        <Arrow active={['action','done'].includes(phase)} />
        <Box stateK={stateFor('action')}
             ixLabel="ix[N]"
             name={action}
             sub="enforce() CPI ↓ reads sibling proof" />
      </div>
      <Disclosure title="Why three instructions?">
        <div className="body" style={{ fontSize: 13 }}>
          Solana's secp256r1 verifier is a native precompile — not callable by CPI.
          Guard reads sibling top-level instructions via the Instructions sysvar to
          verify the proof, so the precompile and <code className="mono">record_proof</code> must
          sit alongside your action in the same transaction.
        </div>
      </Disclosure>
      <style>{`
        @keyframes progslide {
          0% { transform: translateX(-100%); }
          100% { transform: translateX(100%); }
        }
      `}</style>
    </div>
  );
}

function Arrow({ active }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      width: 28, color: active ? 'var(--lime)' : 'var(--bone-4)',
      fontFamily: 'var(--mono)', fontSize: 14,
    }}>→</div>
  );
}

function Disclosure({ title, children }) {
  const [open, setOpen] = useState(false);
  return (
    <div style={{ marginTop: 14 }}>
      <button onClick={() => setOpen(o => !o)}
              style={{
                background: 'transparent', border: 0, color: 'var(--bone-3)',
                fontFamily: 'var(--mono)', fontSize: 10.5, letterSpacing: '0.16em',
                textTransform: 'uppercase', cursor: 'pointer',
                display: 'inline-flex', alignItems: 'center', gap: 6, padding: 0,
              }}>
        <span style={{
          display: 'inline-block', transform: `rotate(${open ? 90 : 0}deg)`,
          transition: 'transform 150ms ease',
        }}>▸</span>
        {title}
      </button>
      {open && <div style={{ marginTop: 10, color: 'var(--bone-3)', maxWidth: 720 }}>
        {children}
      </div>}
    </div>
  );
}

// ---------- passkey modal ----------
function PasskeyModal({ open, onApprove, onCancel, intent }) {
  const [phase, setPhase] = useState('prompt'); // prompt | verifying | done

  useEffect(() => {
    if (!open) setPhase('prompt');
  }, [open]);

  if (!open) return null;
  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 100,
      background: 'rgba(8,8,9,0.78)', backdropFilter: 'blur(6px)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      padding: 24,
      animation: 'fade-in 160ms ease',
    }}>
      <div style={{
        width: 460, maxWidth: '100%', background: 'var(--ink-2)',
        border: '1px solid var(--rule-2)',
        animation: 'rise-in 240ms ease',
      }}>
        <div style={{
          padding: '14px 20px', borderBottom: '1px solid var(--rule)',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        }}>
          <div style={{
            fontFamily: 'var(--mono)', fontSize: 10, letterSpacing: '0.22em',
            color: 'var(--bone-4)', textTransform: 'uppercase',
          }}>WebAuthn ceremony · P-256</div>
          <button onClick={onCancel} style={{
            background: 'transparent', border: 0, color: 'var(--bone-4)',
            cursor: 'pointer', padding: 4,
          }}><Icon name="x" size={16} /></button>
        </div>
        <div style={{ padding: '34px 28px 28px', textAlign: 'center' }}>
          <div style={{
            width: 76, height: 76, margin: '0 auto 18px',
            border: '1px solid var(--rule-2)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            color: phase === 'verifying' ? 'var(--lime)' : 'var(--bone)',
            position: 'relative',
          }}>
            <Icon name="fingerprint" size={38} stroke={1.4} />
            {phase === 'verifying' && (
              <div style={{
                position: 'absolute', inset: -1,
                border: '1px solid var(--lime)',
                animation: 'pulse-ring 1.4s ease-out infinite',
              }} />
            )}
          </div>
          <div className="h2" style={{ fontSize: 20, marginBottom: 8 }}>
            {phase === 'prompt' ? 'Confirm on your device'
              : phase === 'verifying' ? 'Verifying signature…'
              : 'Approved'}
          </div>
          <div className="body" style={{ fontSize: 13, marginBottom: 20, maxWidth: 320, margin: '0 auto 20px' }}>
            {phase === 'prompt'
              ? <>Use Touch ID, Face ID, or your security key to authorize {intent || 'this action'}. The proof is bound to this exact transaction.</>
              : phase === 'verifying'
              ? <>secp256r1 precompile is verifying the WebAuthn assertion against your registered credential.</>
              : <>Proof recorded on-chain. Your action is executing.</>}
          </div>
          <div style={{
            background: 'var(--ink)', border: '1px solid var(--rule)',
            padding: '10px 14px', textAlign: 'left',
            fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--bone-3)',
            marginBottom: 22, lineHeight: 1.6,
          }}>
            <div><span style={{ color: 'var(--bone-4)' }}>intent</span>  {intent || '—'}</div>
            <div><span style={{ color: 'var(--bone-4)' }}>nonce </span>  0x{Math.floor(Math.random()*0xffff).toString(16).padStart(4,'0')}</div>
            <div><span style={{ color: 'var(--bone-4)' }}>expiry</span>  120s</div>
          </div>
          {phase === 'prompt' && (
            <div style={{ display: 'flex', gap: 10, justifyContent: 'center' }}>
              <button className="btn btn-ghost" onClick={onCancel}>Cancel</button>
              <button className="btn btn-primary" onClick={() => {
                setPhase('verifying');
                setTimeout(() => { setPhase('done'); setTimeout(onApprove, 280); }, 1100);
              }}>
                <Icon name="fingerprint" size={14} /> Approve with passkey
              </button>
            </div>
          )}
        </div>
      </div>
      <style>{`
        @keyframes fade-in { from { opacity: 0; } to { opacity: 1; } }
        @keyframes rise-in {
          from { transform: translateY(14px); opacity: 0; }
          to { transform: translateY(0); opacity: 1; }
        }
        @keyframes pulse-ring {
          0%   { transform: scale(1); opacity: 0.8; }
          100% { transform: scale(1.18); opacity: 0; }
        }
      `}</style>
    </div>
  );
}

// ---------- placeholder image (subtle striped) ----------
function StripePlaceholder({ label, height = 200 }) {
  return (
    <div style={{
      height, border: '1px solid var(--rule)',
      backgroundImage: 'repeating-linear-gradient(135deg, rgba(235,232,224,0.025) 0 8px, transparent 8px 16px)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontFamily: 'var(--mono)', fontSize: 10.5, letterSpacing: '0.18em',
      textTransform: 'uppercase', color: 'var(--bone-4)',
    }}>{label}</div>
  );
}

// ---------- expose to other scripts ----------
Object.assign(window, {
  Icon, Code, ToastHost, useToast, PasskeyModal,
  TxAnatomyStrip, Disclosure, StripePlaceholder, CopyChip,
  truncate, formatSol, fakeSig,
});
