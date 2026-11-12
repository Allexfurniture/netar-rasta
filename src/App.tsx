import { useCallback, useEffect, useRef, useState, type PointerEvent } from 'react';
import { DrivingScene, type SceneStatus } from './game/render/three/DrivingScene';
import { ROAD_EDGES, ROAD_NODES } from './game/world/RoadGraph';

type ViewState = 'ready' | 'running' | 'paused' | 'victory' | 'gameover' | 'error';

export default function App() {
  const hostRef = useRef<HTMLDivElement>(null);
  const sceneRef = useRef<DrivingScene | null>(null);
  const [view, setView] = useState<ViewState>('ready');
  const [sceneMounted, setSceneMounted] = useState(false);
  const [status, setStatus] = useState<SceneStatus>({ speed: 0, maxSpeed: 0, score: 0, elapsedSeconds: 0, steering: 0, hornFlash: false, boostActive: false, distance: 0, finished: false, caught: false, pursuitActive: false, currentDistrict: 'ফার্মগেট', roadX: 0, battery: 100, charging: false, damage: 0, batteryEmpty: false });
  const [error, setError] = useState('');

  useEffect(() => {
    if (!sceneMounted || !hostRef.current || sceneRef.current) return;
    let lastPublish = 0;
    try {
      sceneRef.current = new DrivingScene(hostRef.current, (next) => {
        const now = performance.now();
        if (now - lastPublish > 120) {
          setStatus(next);
          if (next.caught || next.batteryEmpty) setView('gameover');
          else if (next.finished) setView('victory');
          lastPublish = now;
        }
      });
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : 'WebGL চালু করা যায়নি';
      setError(message);
      setSceneMounted(false);
      setView('error');
    }
    return () => {
      sceneRef.current?.dispose();
      sceneRef.current = null;
    };
  }, [sceneMounted]);

  useEffect(() => {
    if (view === 'paused' || view === 'victory' || view === 'gameover') sceneRef.current?.pause();
    if (view === 'running') sceneRef.current?.resume();
  }, [view]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key.toLowerCase() === 'escape' && view === 'running') setView('paused');
      else if (event.key.toLowerCase() === 'escape' && view === 'paused') setView('running');
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [view]);

  const start = useCallback(() => {
    setError('');
    setSceneMounted(true);
    setView('running');
  }, []);

  const setTouch = (key: 'left' | 'right' | 'accelerate' | 'reverse' | 'brake' | 'boost', pressed: boolean) => {
    sceneRef.current?.setTouch(key, pressed);
  };

  const bindHold = (key: 'left' | 'right' | 'accelerate' | 'reverse' | 'brake' | 'boost') => ({
    onPointerDown: (event: PointerEvent<HTMLButtonElement>) => {
      event.currentTarget.setPointerCapture(event.pointerId);
      setTouch(key, true);
    },
    onPointerUp: () => setTouch(key, false),
    onPointerCancel: () => setTouch(key, false),
    onLostPointerCapture: () => setTouch(key, false),
  });

  return (
    <main className="app-shell">
      <div className="scene-viewport" ref={hostRef} aria-label="নেতার রাস্তা 3D ড্রাইভিং দৃশ্য">
        {view === 'ready' && (
          <div className="scene-cover">
            <div className="cover-icon" aria-hidden="true">🛺</div>
            <p className="cover-kicker">THIRD-PERSON DRIVING</p>
            <h1>নেতার রাস্তা</h1>
            <p>ঢাকার পথে আপনার 3D ড্রাইভিং যাত্রা শুরু করুন।</p>
            <button className="primary-button" onClick={start}>ড্রাইভিং শুরু করুন <span>↗</span></button>
            <span className="cover-hint">কীবোর্ড: ← → দিক · ↑ চলুন · X ব্রেক · ↓ পিছনে · Shift টান · Space হর্ন</span>
          </div>
        )}
        {view === 'gameover' && (
          <div className="scene-cover modal-cover">
            <div className="cover-icon" aria-hidden="true">😵</div>
            <p className="cover-kicker">CHASE ENDED</p>
            <h2>{status.batteryEmpty ? 'ব্যাটারি শেষ!' : 'ধরা পড়ে গেছেন!'}</h2>
            <p>{status.batteryEmpty ? 'চার্জিং স্টেশনে না পৌঁছানোর কারণে গাড়ি থেমে গেছে।' : 'পেছনের দল আপনাকে ধরে ফেলেছে। পরেরবার BOOST ব্যবহার করে দূরত্ব বাড়ান।'}</p>
            <div className="finish-stats"><div><span>স্কোর</span><strong>{status.score.toLocaleString('bn-BD')}</strong></div><div><span>দূরত্ব</span><strong>{status.distance.toLocaleString('bn-BD')} মি</strong></div><div><span>সর্বোচ্চ গতি</span><strong>{status.maxSpeed.toLocaleString('bn-BD')} km/h</strong></div><div><span>সময়</span><strong>{Math.floor(status.elapsedSeconds / 60).toLocaleString('bn-BD')}:{String(status.elapsedSeconds % 60).padStart(2,'0')}</strong></div></div>
            <button className="primary-button" onClick={() => { sceneRef.current?.dispose(); sceneRef.current = null; setSceneMounted(false); setStatus({ speed: 0, maxSpeed: 0, score: 0, elapsedSeconds: 0, steering: 0, hornFlash: false, boostActive: false, distance: 0, finished: false, caught: false, pursuitActive: false, currentDistrict: 'ফার্মগেট', roadX: 0, battery: 100, charging: false, damage: 0, batteryEmpty: false }); setView('ready'); }}>আবার খেলুন</button>
          </div>
        )}
        {view === 'victory' && (
          <div className="scene-cover modal-cover">
            <div className="cover-icon" aria-hidden="true">🏁</div>
            <p className="cover-kicker">ROUTE COMPLETE</p>
            <h2>অভিনন্দন! ফিনিশ লাইন পার হয়েছেন</h2>
            <p>আপনার Route Run সম্পন্ন হয়েছে।</p>
            <div className="finish-stats"><div><span>মোট স্কোর</span><strong>{status.score.toLocaleString('bn-BD')}</strong></div><div><span>দূরত্ব</span><strong>{status.distance.toLocaleString('bn-BD')} মি</strong></div><div><span>সর্বোচ্চ গতি</span><strong>{status.maxSpeed.toLocaleString('bn-BD')} km/h</strong></div><div><span>সময়</span><strong>{Math.floor(status.elapsedSeconds / 60).toLocaleString('bn-BD')}:{String(status.elapsedSeconds % 60).padStart(2,'0')}</strong></div></div>
            <button className="primary-button" onClick={() => { sceneRef.current?.dispose(); sceneRef.current = null; setSceneMounted(false); setView('ready'); }}>আবার খেলুন</button>
          </div>
        )}
        {view === 'paused' && (
          <div className="scene-cover modal-cover">
            <p className="cover-kicker">PAUSED</p>
            <h2>বিরতি</h2>
            <p>সিমুলেশন সাময়িকভাবে থামানো হয়েছে।</p>
            <button className="primary-button" onClick={() => setView('running')}>আবার চালু করুন</button>
          </div>
        )}
        {view === 'error' && (
          <div className="scene-cover modal-cover error-cover">
            <p className="cover-kicker">GRAPHICS ERROR</p>
            <h2>3D চালু করা যায়নি</h2>
            <p>{error}</p>
            <button className="primary-button" onClick={() => setView('ready')}>আবার চেষ্টা করুন</button>
          </div>
        )}
      </div>

      <header className="game-topbar">
        <div className="game-brand">
          <span className="brand-mark">ন</span>
          <div><strong>নেতার রাস্তা</strong><small>3D ড্রাইভিং</small></div>
        </div>
        <div className="live-status" aria-live="polite">
          <span className="status-dot" />
          {view === 'running' ? 'চলছে' : view === 'paused' ? 'বিরতি' : view === 'victory' ? 'সম্পন্ন' : 'প্রস্তুত'}
        </div>
        {view === 'running' && <button className="pause-button" onClick={() => setView('paused')} aria-label="গেম বিরতি দিন">Ⅱ</button>}
        {view === 'paused' && <button className="pause-button" onClick={() => setView('running')} aria-label="গেম আবার চালু করুন">▶</button>}
      </header>

      {view === 'running' && (
        <>
          {status.pursuitActive && <div className="pursuit-alert" role="status">সতর্কতা: পেছনে ধাওয়া শুরু হয়েছে! টান দিয়ে দূরত্ব বাড়ান</div>}
          <section className="game-hud" aria-label="গেমের অবস্থা">
            <div className="hud-card speed-card">
              <span>গতি</span>
              <strong>{status.speed}<small> km/h*</small></strong>
              <div className="metric-track"><i style={{ width: Math.min(100, status.speed / 180 * 100) + '%' }} /></div>
            </div>
            <div className="hud-card steering-card">
              <span>দূরত্ব</span>
              <strong>{status.distance}<small> m</small></strong>
              <div className="metric-track"><i style={{ width: Math.min(100, status.distance / 1200 * 100) + '%' }} /></div>
            </div>
            <div className="hud-card battery-card" aria-label="ব্যাটারি অবস্থা">
              <span>{status.charging ? 'চার্জ হচ্ছে' : 'ব্যাটারি'}</span>
              <strong>{status.battery}<small>%</small></strong>
              <div className="metric-track"><i style={{ width: status.battery + '%', background: status.battery < 20 ? '#e87862' : '#c6e58c' }} /></div>
              <small className="battery-damage">ক্ষতি {status.damage}%</small>
            </div>
            <div className="hud-card route-map-card" aria-label="রোড গ্রাফ মিনিম্যাপ">
              <span>রুট · {status.currentDistrict}</span>
              <svg viewBox="0 0 120 180" role="img" aria-label="ফার্মগেট, শাহবাগ ও ধানমন্ডির সংযুক্ত রাস্তা" style={{ width: 64, height: 96, display: 'block', margin: '3px auto 0' }}>
                {ROAD_EDGES.map(edge => {
                  const from = ROAD_NODES.find(node => node.id === edge.from)!;
                  const to = ROAD_NODES.find(node => node.id === edge.to)!;
                  return <line key={edge.id} x1={60 + from.x * 2.6} y1={8 + from.distance * 0.13} x2={60 + to.x * 2.6} y2={8 + to.distance * 0.13} stroke={edge.choice === 0 ? '#e7e1d3' : '#b7a98d'} strokeWidth={edge.choice === 0 ? 3 : 2} strokeLinecap="round" />;
                })}
                {ROAD_NODES.filter(node => ['farmgate','shahbagh','dhanmondi','finish'].includes(node.id)).map(node => <circle key={node.id} cx={60 + node.x * 2.6} cy={8 + node.distance * 0.13} r="3" fill="#f0c76d" stroke="#263d36" strokeWidth="1" />)}
                <circle cx={60 + status.roadX * 2.6} cy={8 + status.distance * 0.13} r="4.2" fill="#ff674f" stroke="#fff" strokeWidth="1.5" />
              </svg>
              <small style={{ display: 'block', textAlign: 'center' }}>লাইভ অবস্থান</small>
            </div>
          </section>

          <div className="keyboard-hint" aria-label="কীবোর্ড নির্দেশনা">
            <span><kbd>←</kbd><kbd>→</kbd> স্টিয়ারিং</span>
            <span><kbd>↑</kbd> চলুন</span>
            <span><kbd>X</kbd> ব্রেক</span>
            <span><kbd>↓</kbd> পিছনে</span>
            <span><kbd>Space</kbd> হর্ন</span>
            <span><kbd>Shift</kbd> টান</span>
            <span><kbd>Esc</kbd> বিরতি</span>
          </div>

          <section className="touch-controls" aria-label="ড্রাইভিং কন্ট্রোল">
            <div className="control-cluster steering-controls" aria-label="দিক নিয়ন্ত্রণ">
              <button className="direction-control" aria-label="বামে" {...bindHold('left')}>বামে</button>
              <button className="direction-control" aria-label="ডানে" {...bindHold('right')}>ডানে</button>
            </div>
            <div className="control-cluster action-controls" aria-label="গতি নিয়ন্ত্রণ">
              <button className="go-control" aria-label="চলুন" {...bindHold('accelerate')}>চলুন</button>
              <button className="brake-control" aria-label="ব্রেক" {...bindHold('brake')}>ব্রেক</button>
              <button className={'boost-control' + (status.boostActive ? ' is-active' : '')} aria-label="টান" {...bindHold('boost')}>টান</button>
              <button className="reverse-control" aria-label="পিছনে" {...bindHold('reverse')}>পিছনে</button>
            </div>
          </section>
          <p className="provisional-note">*প্রাথমিক টেস্ট গতি-স্কেল · ফিনিশ দূরত্ব পরীক্ষামূলক</p>
        </>
      )}
    </main>
  );
}
