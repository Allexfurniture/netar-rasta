import * as THREE from 'three';
import { GameLoop } from '../../core/GameLoop';
import { InputController, type InputSnapshot } from '../../input/InputController';

export type SceneStatus = { speed: number; steering: number; hornFlash: boolean; boostActive: boolean; distance: number; finished: boolean };

export class DrivingScene {
  private readonly scene = new THREE.Scene();
  private readonly camera = new THREE.PerspectiveCamera(55, 1, 0.1, 320);
  private readonly renderer: THREE.WebGLRenderer;
  private readonly input: InputController;
  private readonly loop: GameLoop;
  private readonly player = new THREE.Group();
  private readonly wheels: THREE.Mesh[] = [];
  private readonly movingWorld: THREE.Object3D[] = [];
  private readonly clockLight = new THREE.PointLight(0xffd28a, 0, 8);
  private readonly finishLine = new THREE.Group();
  private distance = 0;
  private finished = false;
  private readonly prototypeRouteLength = 1200;
  private readonly resizeObserver: ResizeObserver;
  private speed = 11;
  private steering = 0;
  private wheelRotation = 0;
  private hornTime = 0;
  private disposed = false;
  private readonly onStatus: (status: SceneStatus) => void;

  constructor(private readonly host: HTMLElement, onStatus: (status: SceneStatus) => void) {
    this.onStatus = onStatus;
    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.6));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.setClearColor(0x9fc5c5);
    this.renderer.domElement.setAttribute('aria-label', 'থ্রিডি রিকশা ড্রাইভিং দৃশ্য');
    this.host.appendChild(this.renderer.domElement);
    this.input = new InputController();
    this.buildWorld();
    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(this.host);
    this.resize();
    this.loop = new GameLoop((dt) => this.update(dt), () => this.renderer.render(this.scene, this.camera));
    this.loop.start();
  }

  private material(color: THREE.ColorRepresentation, roughness = 0.86) {
    return new THREE.MeshStandardMaterial({ color, roughness, metalness: 0.02 });
  }

  private box(width: number, height: number, depth: number, color: THREE.ColorRepresentation, x: number, y: number, z: number) {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(width, height, depth), this.material(color));
    mesh.position.set(x, y, z);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    return mesh;
  }

  private buildWorld() {
    this.scene.background = new THREE.Color(0x9bc9d4);
    this.scene.fog = new THREE.Fog(0x9bc9d4, 85, 260);
    const hemi = new THREE.HemisphereLight(0xe8f6f1, 0x52654b, 2.25);
    this.scene.add(hemi);
    const sun = new THREE.DirectionalLight(0xffe0ae, 3.2);
    sun.position.set(-22, 36, 20);
    sun.castShadow = true;
    sun.shadow.mapSize.set(1024, 1024);
    sun.shadow.camera.left = -32; sun.shadow.camera.right = 32;
    sun.shadow.camera.top = 38; sun.shadow.camera.bottom = -38;
    this.scene.add(sun);

    const ground = new THREE.Mesh(new THREE.PlaneGeometry(220, 360), this.material(0x78956b));
    ground.rotation.x = -Math.PI / 2;
    ground.position.set(0, -0.16, -120);
    ground.receiveShadow = true;
    this.scene.add(ground);

    const road = new THREE.Mesh(new THREE.PlaneGeometry(15, 360), this.material(0x3d4140, 0.98));
    road.rotation.x = -Math.PI / 2;
    road.position.set(0, 0, -120);
    road.receiveShadow = true;
    this.scene.add(road);

    for (const x of [-7.7, 7.7]) {
      const curb = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.24, 360), this.material(0xe0d0ad));
      curb.position.set(x, 0.04, -120);
      curb.receiveShadow = true;
      this.scene.add(curb);
      const sidewalk = new THREE.Mesh(new THREE.BoxGeometry(4.2, 0.18, 360), this.material(0xc4b89c));
      sidewalk.position.set(x + (x < 0 ? -2.25 : 2.25), -0.02, -120);
      sidewalk.receiveShadow = true;
      this.scene.add(sidewalk);
      const drain = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.08, 360), this.material(0x777b70));
      drain.position.set(x + (x < 0 ? -0.42 : 0.42), 0.11, -120);
      this.scene.add(drain);
    }

    const lanePaint = this.material(0xf3e7bd);
    for (const x of [-2.5, 2.5]) {
      for (let i = 0; i < 30; i++) {
        const dash = new THREE.Mesh(new THREE.BoxGeometry(0.13, 0.028, 3.8), lanePaint);
        dash.position.set(x, 0.026, -i * 10 - 3);
        this.scene.add(dash);
        this.movingWorld.push(dash);
      }
    }
    // Crosswalk and road-side paint add recognizable Dhaka street detail.
    for (let i = 0; i < 7; i++) {
      const stripe = new THREE.Mesh(new THREE.BoxGeometry(13.8, 0.035, 0.42), this.material(0xe9e3d2));
      stripe.position.set(0, 0.035, -82 - i * 1.05);
      this.scene.add(stripe);
      this.movingWorld.push(stripe);
    }

    const palette = [0xe7b87d, 0xd98e72, 0x9db9a4, 0xe5d3a7, 0xc3a1c9, 0xd9c5a4];
    const shopNames = ['চা ঘর', 'মায়ের দোয়া', 'ফার্মেসি', 'মোবাইল কর্নার', 'মুদি দোকান', 'হোটেল'];
    for (let i = 0; i < 22; i++) {
      const side = i % 2 === 0 ? -1 : 1;
      const row = Math.floor(i / 2);
      const z = -17 - row * 22;
      const width = 6.2 + (i % 3) * 1.1;
      const height = 8.5 + (i % 4) * 2.2;
      const x = side * (13.1 + width / 2);
      const building = this.box(width, height, 10.5, palette[i % palette.length], x, height / 2 - 0.12, z);
      this.scene.add(building); this.movingWorld.push(building);
      const roof = this.box(width + 0.3, 0.34, 10.8, 0x776a59, x, height + 0.02, z);
      this.scene.add(roof); this.movingWorld.push(roof);

      // Front facade: windows, balconies, shop shutters and Bengali signboards.
      for (let floor = 0; floor < Math.max(2, Math.floor(height / 3)); floor++) {
        const y = 1.65 + floor * 2.65;
        for (let col = 0; col < 3; col++) {
          const wx = x + (col - 1) * width * 0.27;
          const glass = this.box(1.05, 1.35, 0.1, floor === 0 ? 0x547f83 : 0x52717a, wx, y, z + 5.31);
          this.scene.add(glass); this.movingWorld.push(glass);
          const frame = this.box(1.18, 0.12, 0.16, 0xf1dfbd, wx, y - 0.73, z + 5.34);
          this.scene.add(frame); this.movingWorld.push(frame);
          if (floor > 0) {
            const balcony = this.box(1.45, 0.12, 0.55, 0x7d6550, wx, y - 0.82, z + 5.58);
            this.scene.add(balcony); this.movingWorld.push(balcony);
            for (let rail = -1; rail <= 1; rail++) {
              const bar = this.box(0.055, 0.52, 0.055, 0xe8d4b3, wx + rail * 0.48, y - 0.53, z + 5.78);
              this.scene.add(bar); this.movingWorld.push(bar);
            }
          }
        }
      }
      const shop = this.box(width * 0.82, 1.55, 0.16, 0x4b514b, x, 1.0, z + 5.36);
      this.scene.add(shop); this.movingWorld.push(shop);
      const sign = this.box(width * 0.78, 0.85, 0.28, [0x17664f,0x9b3d35,0x315c87,0x9b6a26][i % 4], x, 2.25, z + 5.48);
      this.scene.add(sign); this.movingWorld.push(sign);
      // Bright striped awning gives the street a lively market feel.
      for (let stripe = 0; stripe < 6; stripe++) {
        const awning = this.box(width * 0.14, 0.12, 1.15, stripe % 2 ? 0xf3e3bf : 0xc94f42, x + (stripe - 2.5) * width * 0.14, 2.95, z + 5.72);
        this.scene.add(awning); this.movingWorld.push(awning);
      }
      const aircon = this.box(0.72, 0.42, 0.42, 0xe9e5d8, x + width * 0.34, height - 1.4, z + 5.45);
      this.scene.add(aircon); this.movingWorld.push(aircon);
    }

    // Street trees, utility poles, overhead cables and lamps.
    for (let i = 0; i < 14; i++) {
      const side = i % 2 === 0 ? -1 : 1;
      const z = -12 - i * 17;
      const x = side * (9.2 + (i % 3) * 0.5);
      const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.26, 2.8, 7), this.material(0x795438));
      trunk.position.set(x, 1.35, z); this.scene.add(trunk); this.movingWorld.push(trunk);
      const crown = new THREE.Mesh(new THREE.IcosahedronGeometry(1.65 + (i % 2) * 0.25, 1), this.material(i % 3 ? 0x4f8b58 : 0x679c60));
      crown.position.set(x, 3.5, z); crown.castShadow = true; this.scene.add(crown); this.movingWorld.push(crown);
      const pole = this.box(0.16, 8.5, 0.16, 0x626c69, side * 11.1, 4.1, z - 5);
      this.scene.add(pole); this.movingWorld.push(pole);
      const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.22, 10, 8), this.material(0xffe1a0, 0.35));
      lamp.position.set(side * 10.55, 7.9, z - 5); this.scene.add(lamp); this.movingWorld.push(lamp);
    }

    // A few colorful roadside stalls and parked two-wheelers break up the skyline.
    for (let i = 0; i < 8; i++) {
      const side = i % 2 === 0 ? -1 : 1;
      const z = -30 - i * 35;
      const x = side * 9.1;
      const stall = this.box(2.4, 1.55, 1.65, i % 2 ? 0xd8a45f : 0x5f9c86, x, 0.9, z);
      this.scene.add(stall); this.movingWorld.push(stall);
      const canopy = this.box(2.8, 0.16, 2.05, i % 2 ? 0xb94438 : 0xe6c35e, x, 2.05, z);
      this.scene.add(canopy); this.movingWorld.push(canopy);
      const parkedWheel = new THREE.Mesh(new THREE.TorusGeometry(0.38, 0.09, 8, 18), this.material(0x252a29));
      parkedWheel.position.set(x + side * 1.25, 0.43, z + 0.45); parkedWheel.rotation.y = Math.PI / 2;
      this.scene.add(parkedWheel); this.movingWorld.push(parkedWheel);
    }

    this.buildRickshaw();
    this.buildFinishLine();
    this.player.position.set(0, 0, 0);
    this.scene.add(this.player);
    this.clockLight.position.set(0, 2.2, -0.8);
    this.player.add(this.clockLight);

    this.camera.position.set(0, 5.2, 9.2);
    this.camera.lookAt(0, 1.25, -7);
  }

  private buildFinishLine() {
    const postMaterial = this.material(0xe8d89b, 0.55);
    const bannerMaterial = this.material(0x1b5a3c, 0.65);
    const left = new THREE.Mesh(new THREE.BoxGeometry(0.32, 5.4, 0.34), postMaterial);
    left.position.set(-6.1, 2.7, -this.prototypeRouteLength);
    const right = left.clone();
    right.position.x = 6.1;
    const banner = new THREE.Mesh(new THREE.BoxGeometry(12.5, 0.85, 0.35), bannerMaterial);
    banner.position.set(0, 5.15, -this.prototypeRouteLength);
    this.finishLine.add(left, right, banner);
    this.scene.add(this.finishLine);
  }

  private buildRickshaw() {
    const frame = this.box(1.35, 0.42, 2.0, 0x16865c, 0, 0.95, 0.05);
    this.player.add(frame);
    const seat = this.box(1.05, 0.2, 0.65, 0x292b2a, 0, 1.23, 0.52);
    this.player.add(seat);
    const floor = this.box(1.4, 0.14, 1.65, 0x27312d, 0, 0.62, 0.05);
    this.player.add(floor);

    const canopy = new THREE.Mesh(new THREE.BoxGeometry(1.75, 0.16, 1.65), this.material(0xd54d3e));
    canopy.position.set(0, 2.35, -0.12);
    canopy.castShadow = true;
    this.player.add(canopy);
    const canopyTrim = this.box(1.82, 0.1, 0.12, 0xe8bd62, 0, 2.26, -0.94);
    this.player.add(canopyTrim);

    for (const x of [-0.76, 0.76]) {
      for (const z of [-0.72, 0.65]) {
        const post = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.045, 1.18, 8), this.material(0xe5bd6b));
        post.position.set(x, 1.76, z);
        this.player.add(post);
      }
    }

    const wheelMaterial = this.material(0x202322, 0.98);
    for (const [x, z, radius] of [[-0.83, -0.68, 0.43], [0.83, -0.68, 0.43], [0, 1.05, 0.34]] as const) {
      const wheel = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius, 0.18, 20), wheelMaterial);
      wheel.rotation.z = Math.PI / 2;
      wheel.position.set(x, radius, z);
      wheel.castShadow = true;
      this.player.add(wheel);
      this.wheels.push(wheel);
      const hub = new THREE.Mesh(new THREE.CylinderGeometry(radius * 0.25, radius * 0.25, 0.2, 12), this.material(0xb6a46d, 0.4));
      hub.rotation.z = Math.PI / 2;
      hub.position.copy(wheel.position);
      this.player.add(hub);
    }

    const windshield = new THREE.Mesh(new THREE.PlaneGeometry(1.18, 0.72), new THREE.MeshStandardMaterial({ color: 0x8dbac0, transparent: true, opacity: 0.48, side: THREE.DoubleSide, roughness: 0.2 }));
    windshield.position.set(0, 1.72, -0.91);
    this.player.add(windshield);

    const headlamp = new THREE.Mesh(new THREE.SphereGeometry(0.13, 12, 8), this.material(0xffe4a1, 0.3));
    headlamp.position.set(0, 0.94, -1.03);
    this.player.add(headlamp);
  }

  private update(dt: number) {
    const controls: InputSnapshot = this.input.consume();
    if (this.finished) return;
    const targetSpeed = controls.reverse ? 4 : controls.boost ? 24 : controls.accelerate ? 17 : 11;
    this.speed = THREE.MathUtils.damp(this.speed, targetSpeed, 2.4, dt);
    this.steering = THREE.MathUtils.damp(this.steering, controls.steer, 7.5, dt);
    this.player.position.x = THREE.MathUtils.clamp(this.player.position.x + this.steering * dt * 5.2, -4.7, 4.7);
    this.player.rotation.z = THREE.MathUtils.damp(this.player.rotation.z, -this.steering * 0.09, 6, dt);
    this.player.rotation.y = THREE.MathUtils.damp(this.player.rotation.y, -this.steering * 0.08, 5, dt);
    this.wheelRotation += this.speed * dt * 1.7;
    this.wheels.forEach(wheel => { wheel.rotation.x = this.wheelRotation; });
    const travel = this.speed * dt;
    this.distance += travel;
    this.finishLine.position.z += travel;
    this.movingWorld.forEach(object => {
      object.position.z += travel;
      if (object.position.z > 14) object.position.z -= 228;
    });
    this.hornTime = controls.horn ? 0.24 : Math.max(0, this.hornTime - dt);
    this.clockLight.intensity = this.hornTime > 0 ? 2.5 : 0;
    this.camera.position.x = THREE.MathUtils.damp(this.camera.position.x, this.player.position.x * 0.36, 2.2, dt);
    this.camera.lookAt(this.player.position.x * 0.18, 1.15, -5);
    if (this.distance >= this.prototypeRouteLength) {
      this.finished = true;
      this.speed = 0;
      this.input.clear();
    }
    this.onStatus({ speed: Math.round(this.speed * 8), steering: Math.round(this.player.position.x * 10) / 10, hornFlash: this.hornTime > 0, boostActive: controls.boost, distance: Math.floor(this.distance), finished: this.finished });
  }

  private resize() {
    if (this.disposed) return;
    const width = Math.max(1, this.host.clientWidth);
    const height = Math.max(1, this.host.clientHeight);
    this.camera.aspect = width / height;
    this.camera.fov = width < 500 ? 59 : 54;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(width, height, false);
  }

  pause() {
    this.input.clear();
    this.loop.stop();
  }

  resume() {
    if (!this.disposed) this.loop.start();
  }

  setTouch(key: 'left' | 'right' | 'accelerate' | 'reverse' | 'horn' | 'boost', pressed: boolean) {
    this.input.setTouch(key, pressed);
  }

  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    this.loop.stop();
    this.resizeObserver.disconnect();
    this.input.dispose();
    this.scene.traverse(object => {
      if (object instanceof THREE.Mesh) {
        object.geometry.dispose();
        const materials = Array.isArray(object.material) ? object.material : [object.material];
        materials.forEach(material => material.dispose());
      }
    });
    this.renderer.dispose();
    this.renderer.domElement.remove();
  }
}
