// =============================================================
// Trana Guard — app shell
// Sidebar routing, top strip, wallet state, page switcher
// =============================================================

const { useState: useStateA, useEffect: useEffectA } = React;

const NAV = [
  { kind: 'section', label: 'Live demo' },
  { id: 'live', kind: 'route', label: 'Try it live', live: true, num: '01' },
  { kind: 'section', label: 'Protocol' },
  { id: 'how', kind: 'route', label: 'How it works', num: '02' },
  { id: 'policies', kind: 'route', label: 'Policies', num: '03' },
  { kind: 'section', label: 'Integration' },
  { id: 'integration/rust', kind: 'route', label: 'Quickstart · Rust', num: '04', subRoute: 'rust' },
  { id: 'integration/ts', kind: 'route', label: 'Quickstart · TypeScript', num: '04', subRoute: 'ts' },
  { id: 'authority', kind: 'route', label: 'trana_authority', num: '05' },
  { id: 'deploy', kind: 'route', label: 'Deploy guide', num: '06' },
];

function App() {
  // ---- routing via hash ----
  const [route, setRoute] = useStateA(() =>
    (window.location.hash || '#live').replace(/^#/, ''));

  useEffectA(() => {
    const h = () => setRoute((window.location.hash || '#live').replace(/^#/, ''));
    window.addEventListener('hashchange', h);
    return () => window.removeEventListener('hashchange', h);
  }, []);

  // ---- wallet state ----
  const [wallet, setWallet] = useStateA(null);
  // wallet shape: { addr, sol, kind }

  const onConnect = () => {
    // simulate connect to phantom
    const addr = 'AaBb' + Array.from({length: 36}, () =>
      'ABCDEFGHJKLMNPQRSTUVWXYZ123456789'[Math.floor(Math.random()*32)]).join('');
    setWallet({ addr, sol: 4.382, kind: 'Phantom' });
  };
  const onDisconnect = () => setWallet(null);

  // ---- top strip live pool balance (mirrored to TryItLive child) ----
  // We keep this simple — TryItLive owns the canonical pool number, but
  // we also surface it on the sticky topstrip. Use a global event bus.
  const [poolBalance, setPoolBalance] = useStateA(412.503);
  const [poolFlash, setPoolFlash] = useStateA(false);
  useEffectA(() => {
    const handler = (e) => {
      setPoolBalance(e.detail.balance);
      if (e.detail.flash) {
        setPoolFlash(true);
        setTimeout(() => setPoolFlash(false), 720);
      }
    };
    window.addEventListener('trana:pool', handler);
    return () => window.removeEventListener('trana:pool', handler);
  }, []);

  // ---- nav + active state matching ----
  const activeKey = route;
  const isActive = (item) => {
    if (item.id === activeKey) return true;
    if (item.id === 'integration/rust' && activeKey === 'integration') return true;
    return false;
  };

  // ---- render page ----
  let page;
  if (route === 'live') page = <TryItLive wallet={wallet} onConnect={onConnect} onDisconnect={onDisconnect} />;
  else if (route === 'how') page = <HowItWorks />;
  else if (route === 'policies') page = <PoliciesPage />;
  else if (route.startsWith('integration')) {
    const sub = route.split('/')[1] || 'rust';
    page = <IntegrationPage subRoute={sub} />;
  }
  else if (route === 'authority') page = <AuthorityPage />;
  else if (route === 'deploy') page = <DeployPage />;
  else page = <TryItLive wallet={wallet} onConnect={onConnect} onDisconnect={onDisconnect} />;

  return (
    <ToastHost>
      <div className="shell">
        <Sidebar route={route} isActive={isActive} />
        <div className="main">
          <TopStrip
            wallet={wallet}
            onConnect={onConnect}
            onDisconnect={onDisconnect}
            poolBalance={poolBalance}
            poolFlash={poolFlash}
            isLive={route === 'live'}
          />
          {page}
        </div>
      </div>
    </ToastHost>
  );
}

// ---------- Sidebar ----------
function Sidebar({ route, isActive }) {
  return (
    <nav className="sidebar">
      <div className="sb-mark">
        <span style={{
          fontFamily: 'var(--sans)', fontWeight: 600, fontSize: 22,
          letterSpacing: '-0.04em', color: 'var(--bone)',
        }}>
          <span className="crossbar">t</span>rana
        </span>
        <span className="badge">guard</span>
      </div>

      <div className="sb-search">
        <Icon name="dot" size={6} className="dim" />
        <span>Search docs</span>
        <span className="k">⌘K</span>
      </div>

      {NAV.map((item, i) => {
        if (item.kind === 'section') {
          return <div key={i} className="sb-section">{item.label}</div>;
        }
        const active = isActive(item);
        const isSub = item.id.startsWith('integration/');
        return (
          <a key={item.id} href={'#' + item.id}
             className={'sb-link' + (active ? ' active' : '') +
                        (isSub ? ' sub' : '') + (item.live ? ' live' : '')}>
            {!isSub && item.num && <span className="num">{item.num}</span>}
            <span style={{ flex: 1 }}>{item.label}</span>
            {item.live && <span className="pulse"></span>}
          </a>
        );
      })}

      <div className="sb-foot">
        <a href="https://github.com/beharefe/trana" target="_blank" rel="noreferrer"
           style={{ display: 'inline-flex', alignItems: 'center', gap: 8, color: 'var(--bone-3)' }}>
          <Icon name="github" size={14} />
          github
        </a>
        <span>v0.4 · trana.so</span>
      </div>
    </nav>
  );
}

// ---------- Top strip ----------
function TopStrip({ wallet, onConnect, onDisconnect, poolBalance, poolFlash, isLive }) {
  return (
    <div className="topstrip">
      <div className="ts-left">
        <span className="word">
          <span className="crossbar">t</span>rana <span style={{ color: 'var(--bone-3)' }}>guard</span>
        </span>
        <span className="ts-pill">
          <span style={{
            display: 'inline-block', width: 4, height: 4, borderRadius: '50%',
            background: 'var(--amber)', marginRight: 4,
          }}></span>
          devnet
        </span>
      </div>

      <div className="ts-mid" style={{ visibility: isLive ? 'visible' : 'hidden' }}>
        <div className="lbl">Shared vault balance</div>
        <div className={'val' + (poolFlash ? ' flash' : '')}>
          {formatSol(poolBalance)}
          <span className="unit">SOL</span>
        </div>
      </div>

      <div className="ts-right">
        {!wallet ? (
          <button className="wallet-btn" onClick={onConnect}>
            <Icon name="wallet" size={13} />
            Connect wallet
          </button>
        ) : (
          <>
            <span className="mono dim" style={{ fontSize: 11 }}>{wallet.kind}</span>
            <button className="wallet-btn connected" onClick={onDisconnect}
                    title="Click to disconnect">
              <span className="dot"></span>
              <span className="addr">{truncate(wallet.addr, 4)}</span>
              <span style={{ width: 1, height: 12, background: 'var(--rule-2)' }}></span>
              <span className="bal">{wallet.sol.toFixed(2)} SOL</span>
            </button>
          </>
        )}
      </div>
    </div>
  );
}

// ---------- mount ----------
ReactDOM.createRoot(document.getElementById('app')).render(<App />);
