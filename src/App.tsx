import { useEffect, useRef, useState } from 'react';
import Phaser from 'phaser';

type Snapshot = { distance: number; score: number; battery: number; damage: number; speed: number; area: string; ended: boolean };

class RoadScene extends Phaser.Scene {
  private player!: Phaser.GameObjects.Container;
  private traffic: Phaser.GameObjects.Container[] = [];
  private road!: Phaser.GameObjects.Graphics;
  private keys!: Record<string, Phaser.Input.Keyboard.Key>;
  private touch = { left: false, right: false, forward: false, reverse: false };
  private distance = 0;
  private score = 0;
  private battery = 100;
  private damage = 0;
  private speed = 150;
  private elapsed = 0;
  private ended = false;
  private area = 'ফার্মগেট';
  private hud?: (s: Snapshot) => void;
  private lastHud = 0;
  private lane = 0;
  private charging = false;

  constructor(onHud: (s: Snapshot) => void) { super('road'); this.hud = onHud; }

  create() {
    const { width, height } = this.scale;
    this.road = this.add.graphics();
    this.drawRoad(width, height);
    this.player = this.makeRickshaw(width / 2, height * 0.72, 0x16a36b);
    this.physics.world.setBounds(0, 0, width, height);
    this.input.keyboard?.on('keydown-SPACE', () => this.horn());
    this.keys = this.input.keyboard!.addKeys('LEFT,RIGHT,UP,DOWN,A,D,W,S,SPACE') as unknown as Record<string, Phaser.Input.Keyboard.Key>;
    this.spawnTraffic();
    this.events.on('shutdown', () => { this.traffic.forEach(v => v.destroy()); });
  }

  private drawRoad(w: number, h: number) {
    this.road.clear();
    this.road.fillStyle(0x31584a); this.road.fillRect(0, 0, w, h);
    this.road.fillStyle(0x777d78); this.road.fillRect(w * .13, 0, w * .74, h);
    this.road.fillStyle(0x343a3b); this.road.fillRect(w * .17, 0, w * .66, h);
    this.road.fillStyle(0xe8dfb8); this.road.fillRect(w * .145, 0, 4, h); this.road.fillRect(w * .855, 0, 4, h);
    this.road.lineStyle(3, 0xf5e8a8, .8);
    for (let y = -40; y < h + 40; y += 76) {
      this.road.beginPath(); this.road.moveTo(w / 2, y); this.road.lineTo(w / 2, y + 38); this.road.strokePath();
    }
    this.road.fillStyle(0x2d6c51); this.road.fillRoundedRect(w * .02, h * .08, w * .24, 48, 8);
    this.road.fillStyle(0xffffff); this.road.fillRoundedRect(w * .04, h * .095, w * .20, 22, 4);
    this.road.fillStyle(0x18382b); this.road.fillRoundedRect(w * .04, h * .095, w * .20, 22, 4);
    this.add.text(w * .14, h * .105, this.area, { fontFamily: 'sans-serif', fontSize: '12px', color: '#ffffff', fontStyle: 'bold' }).setOrigin(.5);
  }

  private makeRickshaw(x: number, y: number, color: number) {
    const c = this.add.container(x, y);
    const g = this.add.graphics();
    g.fillStyle(0x202b28); g.fillRoundedRect(-18, -27, 36, 54, 7);
    g.fillStyle(color); g.fillRoundedRect(-15, -23, 30, 42, 6);
    g.fillStyle(0xf0bd8d); g.fillCircle(0, -14, 7);
    g.fillStyle(0xf7d75a); g.fillRoundedRect(-13, 7, 26, 8, 3);
    g.fillStyle(0x111817); g.fillCircle(-17, -18, 4); g.fillCircle(17, -18, 4);
    g.lineStyle(3, 0xd5e6db); g.lineBetween(-12, 23, 12, 23);
    c.add(g);
    return c;
  }

  private spawnTraffic() {
    const { width } = this.scale;
    for (let i = 0; i < 5; i++) {
      const colors = [0xd94d42, 0xe4b83f, 0x3e85c8, 0x777e83];
      const v = this.add.container(width * (.34 + (i % 3) * .16), -100 - i * 190);
      const g = this.add.graphics();
      g.fillStyle(0x202729); g.fillRoundedRect(-17, -28, 34, 56, 6);
      g.fillStyle(colors[i % colors.length]); g.fillRoundedRect(-14, -25, 28, 48, 5);
      g.fillStyle(0xcce5e8); g.fillRoundedRect(-10, -18, 20, 10, 2);
      g.fillStyle(0x222); g.fillRect(-16, -17, 4, 9); g.fillRect(12, -17, 4, 9);
      v.add(g); v.setData('speed', 90 + (i % 3) * 35); this.traffic.push(v);
    }
  }

  private horn() {
    if (this.ended) return;
    const tone = this.sound.add(''); // no bundled music or remote audio in prototype
    tone.destroy();
    this.cameras.main.flash(60, 255, 244, 180, false);
  }

  setTouch(key: keyof typeof this.touch, down: boolean) { this.touch[key] = down; }

  update(_time: number, delta: number) {
    if (this.ended) return;
    const dt = Math.min(delta, 40) / 1000;
    this.elapsed += dt;
    this.speed = Math.min(310, 150 + this.elapsed * 1.7);
    const left = this.touch.left || this.keys.LEFT.isDown || this.keys.A.isDown;
    const right = this.touch.right || this.keys.RIGHT.isDown || this.keys.D.isDown;
    const forward = this.touch.forward || this.keys.UP.isDown || this.keys.W.isDown;
    const reverse = this.touch.reverse || this.keys.DOWN.isDown || this.keys.S.isDown;
    const steering = (right ? 1 : 0) - (left ? 1 : 0);
    this.player.x = Phaser.Math.Clamp(this.player.x + steering * 210 * dt, this.scale.width * .22, this.scale.width * .78);
    this.player.rotation = Phaser.Math.Linear(this.player.rotation, steering * .12, .12);
    const drive = reverse ? -0.48 : forward ? 1 : .72;
    const movement = this.speed * drive;
    this.distance += Math.max(0, movement) * dt / 10;
    this.score += Math.max(0, movement) * dt * .08;
    this.battery = Math.max(0, this.battery - (0.12 + Math.max(0, movement) / 900) * dt);
    this.charging = this.player.x < this.scale.width * .28 && this.player.y > this.scale.height * .55;
    if (this.charging) this.battery = Math.min(100, this.battery + 20 * dt);
    this.traffic.forEach(v => {
      v.y += (Number(v.getData('speed')) + movement * .28) * dt;
      if (v.y > this.scale.height + 80) { v.y = -100; v.x = this.scale.width * (.30 + Math.random() * .4); }
      const near = Phaser.Math.Distance.Between(v.x, v.y, this.player.x, this.player.y) < 38;
      if (near && !v.getData('hit')) {
        v.setData('hit', true); this.damage = Math.min(100, this.damage + 18);
        this.cameras.main.shake(150, .006);
        this.player.x = Phaser.Math.Clamp(this.player.x + (this.player.x < v.x ? -24 : 24), this.scale.width * .22, this.scale.width * .78);
      }
      if (v.y > this.scale.height + 80) v.setData('hit', false);
    });
    if (this.elapsed > 28) this.area = 'শাহবাগ'; if (this.elapsed > 55) this.area = 'ধানমন্ডি';
    if (this.battery <= 0 || this.damage >= 100) this.finish();
    if (_time - this.lastHud > 100) {
      this.hud?.({ distance: Math.floor(this.distance), score: Math.floor(this.score), battery: Math.round(this.battery), damage: Math.round(this.damage), speed: Math.round(this.speed), area: this.area, ended: this.ended });
      this.lastHud = _time;
    }
  }

  private finish() {
    this.ended = true;
    this.hud?.({ distance: Math.floor(this.distance), score: Math.floor(this.score), battery: Math.round(this.battery), damage: Math.round(this.damage), speed: Math.round(this.speed), area: this.area, ended: true });
  }
}

const initial: Snapshot = { distance: 0, score: 0, battery: 100, damage: 0, speed: 150, area: 'ফার্মগেট', ended: false };

export default function App() {
  const host = useRef<HTMLDivElement>(null);
  const game = useRef<Phaser.Game | null>(null);
  const [hud, setHud] = useState(initial);
  const [started, setStarted] = useState(false);
  const [touchReady, setTouchReady] = useState(false);

  useEffect(() => {
    if (!started || !host.current) return;
    const scene = new RoadScene(setHud);
    game.current = new Phaser.Game({
      type: Phaser.AUTO, parent: host.current, width: 390, height: 690,
      backgroundColor: '#31584a', scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH },
      physics: { default: 'arcade', arcade: { debug: false } },
      scene, render: { antialias: true, pixelArt: false },
    });
    setTouchReady(true);
    return () => { game.current?.destroy(true); game.current = null; setTouchReady(false); };
  }, [started]);

  const control = (key: 'left'|'right'|'forward'|'reverse', down: boolean) => {
    const scene = game.current?.scene.getScene('road') as RoadScene | undefined;
    scene?.setTouch(key, down);
  };

  const restart = () => { setHud(initial); setStarted(false); window.setTimeout(() => setStarted(true), 30); };

  return <main className="shell">
    <header className="topbar"><div><span className="eyebrow">ঢাকার রাস্তায় টিকে থাকুন</span><h1>নেতার রাস্তা</h1></div><span className="live-dot">● SURVIVAL</span></header>
    {!started ? <section className="intro">
      <div className="badge">2D RICKSHAW SURVIVAL</div><div className="hero-rickshaw">🛺</div>
      <h2>রাস্তা আপনার,<br/>সিদ্ধান্তও আপনার।</h2>
      <p>ফার্মগেট থেকে শাহবাগ, তারপর ধানমন্ডি—ট্রাফিক সামলে যতদূর পারেন এগিয়ে যান।</p>
      <button className="primary" onClick={() => { setHud(initial); setStarted(true); }}>খেলা শুরু করুন <span>→</span></button>
      <small>কীবোর্ড: ← → চালনা · ↑ গতি · ↓ রিভার্স</small>
    </section> : <>
      <section className="stats">
        <div><small>দূরত্ব</small><b>{hud.distance} মি.</b></div><div><small>স্কোর</small><b>৳ {hud.score} BDT</b></div>
        <div><small>ব্যাটারি</small><b>{hud.battery}%</b><i><em style={{width: hud.battery+'%'}} /></i></div>
      </section>
      <div className="game-frame"><div ref={host} className="game-host" />
        <div className="area-tag">{hud.area}</div>
        {hud.ended && <div className="game-over"><span>RUN OVER</span><h2>খেলা শেষ!</h2><p>সর্বোচ্চ দূরত্ব: {hud.distance} মিটার</p><p>মোট স্কোর: ৳ {hud.score} BDT</p><button className="primary" onClick={restart}>আবার খেলুন</button></div>}
      </div>
      <section className="game-meta"><span>গতি {hud.speed}</span><span>ক্ষতি {hud.damage}%</span><span>{hud.battery <= 15 ? 'চার্জ কম!' : 'সাবধানে চালান'}</span></section>
      {touchReady && !hud.ended && <section className="controls">
        <div className="steer"><button onPointerDown={()=>control('left',true)} onPointerUp={()=>control('left',false)} onPointerLeave={()=>control('left',false)}>←</button><button onPointerDown={()=>control('right',true)} onPointerUp={()=>control('right',false)} onPointerLeave={()=>control('right',false)}>→</button></div>
        <div className="drive"><button onPointerDown={()=>control('reverse',true)} onPointerUp={()=>control('reverse',false)} onPointerLeave={()=>control('reverse',false)}>REV</button><button className="accelerate" onPointerDown={()=>control('forward',true)} onPointerUp={()=>control('forward',false)} onPointerLeave={()=>control('forward',false)}>GO</button></div>
      </section>}
    </>}
    <footer>একটি কাল্পনিক আর্কেড গেম · ভার্চুয়াল BDT-এর কোনো বাস্তব আর্থিক মূল্য নেই</footer>
  </main>;
}