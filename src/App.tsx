import { useCallback, useEffect, useRef, useState } from 'react';
import type { DrivingInput, DrivingSnapshot, DrivingScene } from './game/three/DrivingScene';

const initialSnapshot: DrivingSnapshot = {
  distance: 0,
  score: 0,
  battery: 100,
  damage: 0,
  speed: 0,
  ended: false,
};

const initialInput: DrivingInput = {
  left: false,
  right: false,
  forward: false,
  reverse: false,
  horn: false,
};

export default function App() {
  const hostRef = useRef<HTMLDivElement>(null);
  const sceneRef = useRef<DrivingScene | null>(null);
  const [snapshot, setSnapshot] = useState(initialSnapshot);
  const [started, setStarted] = useState(false);
  const [graphicsError, setGraphicsError] = useState(false);

  useEffect(() => {
    if (!started || !hostRef.current) return;
    let disposed = false;
    let scene: DrivingScene | null = null;
    let removeListeners: () => void = () => {};

    void import('./game/three/DrivingScene')
      .then(({ DrivingScene }) => {
        if (disposed || !hostRef.current) return;
        try {
          const activeScene = new DrivingScene(hostRef.current, setSnapshot);
          scene = activeScene;
          sceneRef.current = activeScene;
          const keyMap: Record<string, keyof DrivingInput> = {
            ArrowLeft: 'left',
            KeyA: 'left',
            ArrowRight: 'right',
            KeyD: 'right',
            ArrowUp: 'forward',
            KeyW: 'forward',
            ArrowDown: 'reverse',
            KeyS: 'reverse',
            Space: 'horn',
          };
          const onKeyDown = (event: KeyboardEvent) => {
            const key = keyMap[event.code];
            if (!key) return;
            event.preventDefault();
            activeScene.setInput(key, true);
          };
          const onKeyUp = (event: KeyboardEvent) => {
            const key = keyMap[event.code];
            if (key) activeScene.setInput(key, false);
          };
          const releaseAll = () => {
            (Object.keys(initialInput) as Array<keyof DrivingInput>).forEach((key) => activeScene.setInput(key, false));
          };
          window.addEventListener('keydown', onKeyDown, { passive: false });
          window.addEventListener('keyup', onKeyUp);
          window.addEventListener('blur', releaseAll);
          removeListeners = () => {
            window.removeEventListener('keydown', onKeyDown);
            window.removeEventListener('keyup', onKeyUp);
            window.removeEventListener('blur', releaseAll);
          };
        } catch {
          setGraphicsError(true);
          setStarted(false);
        }
      })
      .catch(() => {
        if (!disposed) {
          setGraphicsError(true);
          setStarted(false);
        }
      });

    return () => {
      disposed = true;
      removeListeners();
      scene?.dispose();
      if (sceneRef.current === scene) sceneRef.current = null;
    };
  }, [started]);

  const startGame = useCallback(() => {
    setGraphicsError(false);
    setSnapshot(initialSnapshot);
    setStarted(true);
  }, []);

  const restart = useCallback(() => {
    setSnapshot(initialSnapshot);
    setStarted(false);
    window.setTimeout(() => setStarted(true), 50);
  }, []);

  const setControl = (key: keyof DrivingInput, down: boolean) => {
    sceneRef.current?.setInput(key, down);
  };

  return (
    <main className="shell">
      <header className="topbar">
        <div>
          <span className="eyebrow">ঢাকার রাস্তায় টিকে থাকুন</span>
          <h1>নেতার রাস্তা</h1>
        </div>
        <span className="camera-chip">৩D · পেছন থেকে ক্যামেরা</span>
      </header>

      {!started ? (
        <section className="intro">
          <div className="badge">থার্ড-পারসন ৩D ড্রাইভিং</div>
          <div className="hero-rickshaw" aria-hidden="true">🛺</div>
          <h2>এবার রাস্তা দেখুন<br />রিকশার পেছন থেকে।</h2>
          <p>ঢাকার ব্যস্ত রাস্তায় রিকশা চালান, ট্রাফিক এড়িয়ে চলুন এবং ব্যাটারি ধরে রেখে যতদূর সম্ভব টিকে থাকুন।</p>
          {graphicsError && <p className="error-note">আপনার ব্রাউজারে ৩D গ্রাফিক্স চালু করা যাচ্ছে না। WebGL সমর্থিত ব্রাউজার ব্যবহার করুন।</p>}
          <button className="primary" onClick={startGame}>খেলা শুরু করুন <span>→</span></button>
          <small>কীবোর্ড: ← → চালনা · ↑ গতি · ↓ রিভার্স · Space হর্ন</small>
        </section>
      ) : (
        <>
          <section className="stats">
            <div><small>দূরত্ব</small><b>{snapshot.distance} মি.</b></div>
            <div><small>স্কোর</small><b>৳ {snapshot.score} BDT</b></div>
            <div>
              <small>ব্যাটারি</small>
              <b>{snapshot.battery}%</b>
              <i><em style={{ width: snapshot.battery + '%' }} /></i>
            </div>
          </section>

          <section className="game-frame">
            <div ref={hostRef} className="game-host" />
            <div className="scene-label">ফার্মগেট · ৩D ড্রাইভিং</div>
            {snapshot.ended && (
              <div className="game-over">
                <span>খেলা শেষ</span>
                <h2>আপনার যাত্রা শেষ!</h2>
                <p>সর্বোচ্চ দূরত্ব: {snapshot.distance} মিটার</p>
                <p>মোট স্কোর: ৳ {snapshot.score} BDT</p>
                <button className="primary" onClick={restart}>আবার খেলুন</button>
              </div>
            )}
          </section>

          <section className="game-meta">
            <span>গতি {snapshot.speed} কিমি/ঘণ্টা</span>
            <span>ক্ষতি {snapshot.damage}%</span>
            <span>{snapshot.battery <= 15 ? 'চার্জ কম!' : 'সাবধানে চালান'}</span>
          </section>

          {!snapshot.ended && (
            <section className="controls">
              <div className="steer">
                <button aria-label="বামে চালান" onPointerDown={() => setControl('left', true)} onPointerUp={() => setControl('left', false)} onPointerCancel={() => setControl('left', false)} onPointerLeave={() => setControl('left', false)}>←</button>
                <button aria-label="ডানে চালান" onPointerDown={() => setControl('right', true)} onPointerUp={() => setControl('right', false)} onPointerCancel={() => setControl('right', false)} onPointerLeave={() => setControl('right', false)}>→</button>
              </div>
              <div className="drive">
                <button onPointerDown={() => setControl('reverse', true)} onPointerUp={() => setControl('reverse', false)} onPointerCancel={() => setControl('reverse', false)} onPointerLeave={() => setControl('reverse', false)}>পেছনে</button>
                <button className="accelerate" onPointerDown={() => setControl('forward', true)} onPointerUp={() => setControl('forward', false)} onPointerCancel={() => setControl('forward', false)} onPointerLeave={() => setControl('forward', false)}>গতি</button>
                <button className="horn" onPointerDown={() => setControl('horn', true)} onPointerUp={() => setControl('horn', false)} onPointerCancel={() => setControl('horn', false)} onPointerLeave={() => setControl('horn', false)}>হর্ন</button>
              </div>
            </section>
          )}
        </>
      )}

      <footer>কাল্পনিক ৩D আর্কেড গেম · ভার্চুয়াল BDT-এর কোনো বাস্তব আর্থিক মূল্য নেই</footer>
    </main>
  );
}
