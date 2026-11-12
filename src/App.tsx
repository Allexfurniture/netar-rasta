import { useCallback, useEffect, useRef, useState } from 'react';
import { DrivingScene, type SceneStatus } from './game/render/three/DrivingScene';

type ViewState = 'ready' | 'running' | 'paused' | 'error';

export default function App() {
  const hostRef = useRef<HTMLDivElement>(null);
  const sceneRef = useRef<DrivingScene | null>(null);
  const [view, setView] = useState<ViewState>('ready');
  const [sceneMounted, setSceneMounted] = useState(false);
  const [status, setStatus] = useState<SceneStatus>({ speed: 0, steering: 0, hornFlash: false });
  const [error, setError] = useState('');

  useEffect(() => {
    if (!sceneMounted || !hostRef.current || sceneRef.current) return;
    let lastPublish = 0;
    try {
      sceneRef.current = new DrivingScene(hostRef.current, (next) => {
        const now = performance.now();
        if (now - lastPublish > 120) {
          setStatus(next);
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
    if (view === 'paused') sceneRef.current?.pause();
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

  const setTouch = (key: 'left' | 'right' | 'accelerate' | 'reverse' | 'horn', pressed: boolean) => {
    sceneRef.current?.setTouch(key, pressed);
  };

  const bindHold = (key: 'left' | 'right' | 'accelerate' | 'reverse' | 'horn') => ({
    onPointerDown: (event: React.PointerEvent<HTMLButtonElement>) => {
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
            <span className="cover-hint">কীবোর্ড: ← → স্টিয়ারিং · ↑ গতি · ↓ রিভার্স · Space হর্ন</span>
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
          {view === 'running' ? 'চলছে' : view === 'paused' ? 'বিরতি' : 'প্রস্তুত'}
        </div>
        {view === 'running' && <button className="pause-button" onClick={() => setView('paused')} aria-label="গেম বিরতি দিন">Ⅱ</button>}
        {view === 'paused' && <button className="pause-button" onClick={() => setView('running')} aria-label="গেম আবার চালু করুন">▶</button>}
      </header>

      {view === 'running' && (
        <>
          <section className="game-hud" aria-label="গেমের অবস্থা">
            <div className="hud-card speed-card">
              <span>গতি</span>
              <strong>{status.speed}<small> km/h*</small></strong>
              <div className="metric-track"><i style={{ width: Math.min(100, status.speed / 180 * 100) + '%' }} /></div>
            </div>
            <div className="hud-card steering-card">
              <span>স্টিয়ারিং</span>
              <strong>{status.steering.toFixed(1)}</strong>
            </div>
          </section>

          <div className="keyboard-hint" aria-label="কীবোর্ড নির্দেশনা">
            <span><kbd>←</kbd><kbd>→</kbd> স্টিয়ারিং</span>
            <span><kbd>↑</kbd> GO</span>
            <span><kbd>↓</kbd> REV</span>
            <span><kbd>Space</kbd> হর্ন</span>
            <span><kbd>Esc</kbd> বিরতি</span>
          </div>

          <section className="touch-controls" aria-label="ড্রাইভিং কন্ট্রোল">
            <div className="control-cluster steering-controls">
              <button aria-label="বামে ঘুরুন" {...bindHold('left')}>←</button>
              <button aria-label="ডানে ঘুরুন" {...bindHold('right')}>→</button>
            </div>
            <div className="control-cluster action-controls">
              <button className="secondary-control" aria-label="রিভার্স" {...bindHold('reverse')}>REV</button>
              <button className="go-control" aria-label="সামনে চলুন" {...bindHold('accelerate')}>GO</button>
              <button className="secondary-control" aria-label="হর্ন" {...bindHold('horn')}>HORN</button>
            </div>
          </section>
          <p className="provisional-note">*প্রাথমিক টেস্ট গতি-স্কেল</p>
        </>
      )}
    </main>
  );
}
