import * as THREE from 'three';
import { GameLoop } from '../../core/GameLoop';
import { InputController, type InputSnapshot } from '../../input/InputController';

export type SceneStatus = { speed: number; steering: number; hornFlash: boolean };

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
    this.input = new InputController(this.renderer.domElement);
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
    this.scene.background = new THREE.Color(0x9fc5c5);
    this.scene.fog = new THREE.Fog(0x9fc5c5, 65, 230);
    const hemi = new THREE.HemisphereLight(0xe7f4ef, 0x586b53, 2.0);
    this.scene.add(hemi);
    const sun = new THREE.DirectionalLight(0xffe3b7, 3.1);
    sun.position.set(-18, 32, 18);
    sun.castShadow = true;
    sun.shadow.mapSize.set(1024, 1024);
    sun.shadow.camera.left = -24; sun.shadow.camera.right = 24;
    sun.shadow.camera.top = 32; sun.shadow.camera.bottom = -32;
    this.scene.add(sun);

    const ground = new THREE.Mesh(new THREE.PlaneGeometry(180, 300), this.material(0x718d69));
    ground.rotation.x = -Math.PI / 2;
    ground.position.set(0, -0.12, -100);
    ground.receiveShadow = true;
    this.scene.add(ground);

    const road = new THREE.Mesh(new THREE.PlaneGeometry(14, 300), this.material(0x343b3b, 0.98));
    road.rotation.x = -Math.PI / 2;
    road.position.set(0, 0, -100);
    road.receiveShadow = true;
    this.scene.add(road);

    for (const x of [-7.35, 7.35]) {
      const curb = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.22, 300), this.material(0xc7bda2));
      curb.position.set(x, 0.02, -100);
      curb.receiveShadow = true;
      this.scene.add(curb);
      const sidewalk = new THREE.Mesh(new THREE.BoxGeometry(3.2, 0.16, 300), this.material(0xb8ad92));
      sidewalk.position.set(x + (x < 0 ? -1.9 : 1.9), -0.015, -100);
      this.scene.add(sidewalk);
    }

    const lanePaint = this.material(0xe8dfb8);
    for (const x of [-2.35, 2.35]) {
      for (let i = 0; i < 24; i++) {
        const dash = new THREE.Mesh(new THREE.BoxGeometry(0.11, 0.025, 3.0), lanePaint);
        dash.position.set(x, 0.025, -i * 9 - 4);
        this.scene.add(dash);
        this.movingWorld.push(dash);
      }
    }

    const palette = [0xc77c54, 0xd4b77e, 0x879b9b, 0xd5d0bd, 0x9d806b];
    for (let i = 0; i < 18; i++) {
      const side = i % 2 === 0 ? -1 : 1;
      const z = -15 - Math.floor(i / 2) * 19;
      const width = 5 + (i % 3) * 1.8;
      const height = 7 + (i % 4) * 3.5;
      const x = side * (12 + width / 2);
      const building = this.box(width, height, 10, palette[i % palette.length], x, height / 2 - 0.1, z);
      this.scene.add(building);
      this.movingWorld.push(building);
      const roof = this.box(width + 0.18, 0.28, 10.18, 0x625d50, x, height + 0.02, z);
      this.scene.add(roof);
      this.movingWorld.push(roof);
      for (let row = 0; row < Math.max(2, Math.floor(height / 2.4)); row++) {
        for (let col = 0; col < 2; col++) {
          const windowMesh = this.box(0.8, 1.05, 0.08, 0x385a60, x + (col ? 1 : -1) * width * 0.22, 1.8 + row * 2.1, z + 5.06);
          windowMesh.castShadow = false;
          this.scene.add(windowMesh);
          this.movingWorld.push(windowMesh);
        }
      }
    }

    this.buildRickshaw();
    this.player.position.set(0, 0, 0);
    this.scene.add(this.player);
    this.clockLight.position.set(0, 2.2, -0.8);
    this.player.add(this.clockLight);

    this.camera.position.set(0, 5.6, 9.5);
    this.camera.lookAt(0, 1.1, -5);
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
    const targetSpeed = controls.reverse ? 4 : controls.accelerate ? 17 : 11;
    this.speed = THREE.MathUtils.damp(this.speed, targetSpeed, 2.4, dt);
    this.steering = THREE.MathUtils.damp(this.steering, controls.steer, 7.5, dt);
    this.player.position.x = THREE.MathUtils.clamp(this.player.position.x + this.steering * dt * 5.2, -4.7, 4.7);
    this.player.rotation.z = THREE.MathUtils.damp(this.player.rotation.z, -this.steering * 0.09, 6, dt);
    this.player.rotation.y = THREE.MathUtils.damp(this.player.rotation.y, -this.steering * 0.08, 5, dt);
    this.wheelRotation += this.speed * dt * 1.7;
    this.wheels.forEach(wheel => { wheel.rotation.x = this.wheelRotation; });
    const travel = this.speed * dt;
    this.movingWorld.forEach(object => {
      object.position.z += travel;
      if (object.position.z > 14) object.position.z -= 228;
    });
    this.hornTime = controls.horn ? 0.24 : Math.max(0, this.hornTime - dt);
    this.clockLight.intensity = this.hornTime > 0 ? 2.5 : 0;
    this.camera.position.x = THREE.MathUtils.damp(this.camera.position.x, this.player.position.x * 0.36, 2.2, dt);
    this.camera.lookAt(this.player.position.x * 0.18, 1.15, -5);
    this.onStatus({ speed: Math.round(this.speed * 8), steering: Math.round(this.player.position.x * 10) / 10, hornFlash: this.hornTime > 0 });
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

  setTouch(key: 'left' | 'right' | 'accelerate' | 'reverse' | 'horn', pressed: boolean) {
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
