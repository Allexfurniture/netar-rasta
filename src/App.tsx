import { useCallback, useEffect, useRef, useState } from 'react';
import { DrivingScene, type SceneStatus } from './game/render/three/DrivingScene';

type ViewState = 'ready' | 'running' | 'paused' | 'error';

export default function App() {
  const hostRef = useRef<HTMLDivElement>(null);
  const sceneRef = useRef<DrivingScene | null>(null);
  const [view, setView] = useState<ViewState>('ready');
  const [status, setStatus] = useState<SceneStatus>({ speed: 0, steering: 0, hornFlash: false });
  const [error, setError] = useState('');

  useEffect(() => {
    if (view !== 'running' || !hostRef.current || sceneRef.current) return;
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
      setView('error');
    }
    return () => {
      sceneRef.current?.dispose();
      sceneRef.current = null;
    };
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
    setView('running');
  }, []);

  const setTouch = (key: 'left' | 'right' | 'accelerate' | 'reverse' | 'horn', pressed: boolean) => {
    sceneRef.current?.setTouch(key, pressed);
  };

  return (
    <main className="app-shell">
      <header className="masthead">
        <div className="brand-lockup">
          <span className="brand-mark">ন</span>
          <div><p className="eyebrow">একটি 3D ড্রাইভিং অভিজ্ঞতা</p><h1>নেতার রাস্তা</h1></div>
        </div>
        <span className="build-label">FOUNDATION / 01</span>
      </header>

      <section className="stage-heading">
        <div><span className="section-kicker">THIRD-PERSON • THREE.JS</span><h2>ঢাকার পথে, এবার 3D-তে।</h2></div>
        <p>প্রথম ধাপ: রিকশা, ক্যামেরা ও ড্রাইভিং কন্ট্রোলের 3D ভিত্তি।</p>
      </section>

      <section className="dashboard">
        <div className="scene-shell">
          <div className="scene-topline"><span><i className="status-dot" /> {view === 'running' ? 'LIVE PREVIEW' : '3D TEST SCENE'}</span><span>PORTRAIT VIEW</span></div>
          <div className="scene-viewport" ref={hostRef}>
            {view === 'ready' && <div className="scene-cover"><div className="cover-icon">🛺</div><p className="cover-kicker">THIRD-PERSON DRIVING</p><h3>রাস্তায় নামবেন?</h3><p>একটি 3D টেস্ট রোডে রিকশার কন্ট্রোল ও ক্যামেরা পরীক্ষা করুন।</p><button className="primary-button" onClick={start}>ড্রাইভিং শুরু করুন <span>↗</span></button></div>}
            {view === 'paused' && <div className="scene-cover pause-cover"><p className="cover-kicker">PAUSED</p><h3>বিরতি</h3><p>সিমুলেশন থামানো হয়েছে।</p><button className="primary-button" onClick={() => setView('running')}>আবার চালু করুন</button></div>}
            {view === 'error' && <div className="scene-cover error-cover"><p className="cover-kicker">GRAPHICS ERROR</p><h3>3D চালু করা যায়নি</h3><p>{error}</p><button className="primary-button" onClick={() => setView('ready')}>আবার চেষ্টা করুন</button></div>}
            {view === 'running' && <div className="scene-overlay"><span>টেস্ট রোড · 3D</span><button onClick={() => setView('paused')} aria-label="বিরতি">Ⅱ</button></div>}
          </div>
          <div className="scene-footline"><span>WEBGL RENDERER</span><span>CHASE CAMERA</span><span>60 Hz SIMULATION</span></div>
        </div>

        <aside className="drive-panel">
          <div className="panel-title"><span className="section-kicker">VEHICLE STATUS</span><h3>রিকশার নিয়ন্ত্রণ</h3></div>
          <div className="metric-card"><span>গতি</span><strong>{view === 'running' ? status.speed : 0}<small> km/h*</small></strong><div className="metric-track"><i style={{ width: Math.min(100, status.speed / 180 * 100) + '%' }} /></div></div>
          <div className="metric-card compact"><span>স্টিয়ারিং অবস্থান</span><strong>{status.steering.toFixed(1)}</strong></div>
          <div className="control-instructions"><p>কীবোর্ড</p><div><kbd>←</kbd><kbd>→</kbd><span>স্টিয়ারিং</span></div><div><kbd>↑</kbd><span>গতি</span><kbd>↓</kbd><span>ধীর / রিভার্স</span></div><div><kbd>Space</kbd><span>হর্ন লাইট</span></div><div><kbd>Esc</kbd><span>বিরতি</span></div></div>
          <p className="provisional-note">*এটি ভিজ্যুয়াল টেস্টের প্রাথমিক গতি-স্কেল; চূড়ান্ত গেমপ্লে ব্যালান্স নয়।</p>
        </aside>
      </section>

      {view === 'running' && <section className="touch-controls" aria-label="টাচ কন্ট্রোল">
        <div className="control-cluster">
          <button onPointerDown={() => setTouch('left', true)} onPointerUp={() => setTouch('left', false)} onPointerCancel={() => setTouch('left', false)} onPointerLeave={() => setTouch('left', false)}>←</button>
          <button onPointerDown={() => setTouch('right', true)} onPointerUp={() => setTouch('right', false)} onPointerCancel={() => setTouch('right', false)} onPointerLeave={() => setTouch('right', false)}>→</button>
        </div>
        <div className="control-cluster">
          <button className="secondary-control" onPointerDown={() => setTouch('reverse', true)} onPointerUp={() => setTouch('reverse', false)} onPointerCancel={() => setTouch('reverse', false)} onPointerLeave={() => setTouch('reverse', false)}>REV</button>
          <button className="go-control" onPointerDown={() => setTouch('accelerate', true)} onPointerUp={() => setTouch('accelerate', false)} onPointerCancel={() => setTouch('accelerate', false)} onPointerLeave={() => setTouch('accelerate', false)}>GO</button>
          <button className="secondary-control" onPointerDown={() => setTouch('horn', true)} onPointerUp={() => setTouch('horn', false)} onPointerCancel={() => setTouch('horn', false)} onPointerLeave={() => setTouch('horn', false)}>HORN</button>
        </div>
      </section>}

      <footer className="page-footer"><span>নেতার রাস্তা</span><span>এটি প্রাথমিক 3D foundation — সম্পূর্ণ গেম নয়।</span></footer>
    </main>
  );
}
