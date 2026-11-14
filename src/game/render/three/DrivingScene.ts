import * as THREE from 'three';
import { GameLoop } from '../../core/GameLoop';
import { InputController, type InputSnapshot } from '../../input/InputController';
import { advanceRoad, retreatRoad, createRoadState, getRoadPoint, type RoadAdvance, type RoadState } from '../../world/RoadGraph';

export type CameraMode = 'chase' | 'elevated' | 'close' | 'side';
export type DamageCategory = 'car' | 'bus' | 'motorcycle' | 'cng' | 'auto' | 'rickshaw' | 'pedestrian';
export type DamageCategoryStats = Record<DamageCategory, { hits: number; cost: number }>;
export type SceneStatus = { speed: number; maxSpeed: number; score: number; elapsedSeconds: number; steering: number; hornFlash: boolean; boostActive: boolean; distance: number; finished: boolean; caught: boolean; pursuitActive: boolean; currentDistrict: string; roadX: number; battery: number; charging: boolean; damage: number; batteryEmpty: boolean; totalDamageCost: number; collisionCount: number; damageBreakdown: DamageCategoryStats };
type TrafficKind = 'car' | 'cng' | 'bus' | 'bike' | 'auto' | 'rickshaw';
type TrafficAgent = { kind: TrafficKind; group: THREE.Group; state: RoadAdvance; cruiseSpeed: number; currentSpeed: number; routeBias: -1 | 0 | 1; lane: number; halfWidth: number; halfLength: number; overlapping: boolean; knockedBack: boolean; knockbackVelocity: THREE.Vector3; knockbackTime: number };
type AnimatedPerson = { group: THREE.Group; leftLeg: THREE.Group; rightLeg: THREE.Group; leftArm: THREE.Group; rightArm: THREE.Group; phase: number; stride: number };
type MarketPerson = AnimatedPerson & { baseX: number; activity: 'serve' | 'walk'; phaseOffset: number };
type PedestrianAgent = AnimatedPerson & { knockedBack: boolean; knockbackVelocity: THREE.Vector3; knockbackTime: number; side: -1 | 1; spawnIndex: number; walkPhase: number };

export class DrivingScene {
  private readonly scene = new THREE.Scene();
  private readonly camera = new THREE.PerspectiveCamera(55, 1, 0.1, 320);
  private readonly cameraLookTarget = new THREE.Vector3(0, 1.2, -6.5);
  private cameraMode: CameraMode = 'chase';
  private readonly cameraPresets: Record<CameraMode, { x: number; y: number; z: number; lookX: number; lookY: number; lookZ: number; fov: number }> = {
    chase: { x: 0, y: 6.1, z: 10.8, lookX: 0, lookY: 1.2, lookZ: -6.5, fov: 55 },
    elevated: { x: 0, y: 8.4, z: 13.2, lookX: 0, lookY: 0.9, lookZ: -8.2, fov: 59 },
    close: { x: 0, y: 4.65, z: 7.6, lookX: 0, lookY: 1.35, lookZ: -5.1, fov: 51 },
    side: { x: 4.8, y: 5.7, z: 9.4, lookX: -1.0, lookY: 1.2, lookZ: -5.8, fov: 57 },
  };
  private readonly renderer: THREE.WebGLRenderer;
  private readonly input: InputController;
  private readonly loop: GameLoop;
  private readonly player = new THREE.Group();
  private readonly wheels: THREE.Mesh[] = [];
  private readonly movingWorld: THREE.Object3D[] = [];
  private readonly trafficAgents: TrafficAgent[] = [];
  private readonly sidewalkPeople: AnimatedPerson[] = [];
  private readonly marketPeople: MarketPerson[] = [];
  private readonly pedestrians: PedestrianAgent[] = [];
  private readonly chasers: AnimatedPerson[] = [];
  private readonly chargingStations: Array<{ group: THREE.Group; distance: number }> = [];
  private lateralOffset = 0;
  private battery = 100;
  private charging = false;
  private chargeElapsed = 0;
  private damage = 0;
  private batteryEmpty = false;
  private totalDamageCost = 0;
  private collisionCount = 0;
  private readonly damageBreakdown: DamageCategoryStats = {
    car: { hits: 0, cost: 0 }, bus: { hits: 0, cost: 0 }, motorcycle: { hits: 0, cost: 0 },
    cng: { hits: 0, cost: 0 }, auto: { hits: 0, cost: 0 }, rickshaw: { hits: 0, cost: 0 },
    pedestrian: { hits: 0, cost: 0 },
  };
  private readonly collisionValues: Record<DamageCategory, number> = {
    car: 200, bus: 500, motorcycle: 150, cng: 180, auto: 150, rickshaw: 100, pedestrian: 100,
  };
  private crashTime = 0;
  private crashRoll = 0;
  private collisionShake = 0;
  private pursuitActive = false;
  private caught = false;
  private escaped = false;
  private escapeTime = 0;
  private pursuitElapsed = 0;
  private readonly clockLight = new THREE.PointLight(0xffd28a, 0, 8);
  private readonly finishLine = new THREE.Group();
  private distance = 0;
  private roadState: RoadState = createRoadState();
  private currentDistrict = 'ফার্মগেট';
  private roadX = 0;
  private finished = false;
  private readonly prototypeRouteLength = 1200;
  private readonly resizeObserver: ResizeObserver;
  private speed = 11;
  private maxSpeed = 0;
  private elapsedSeconds = 0;
  private steering = 0;
  private wheelRotation = 0;
  private hornTime = 0;
  private disposed = false;
  private readonly onStatus: (status: SceneStatus) => void;
  private readonly boxGeometryCache = new Map<string, THREE.BoxGeometry>();
  private readonly trafficCylinderGeometryCache = new Map<string, THREE.CylinderGeometry>();

  constructor(private readonly host: HTMLElement, onStatus: (status: SceneStatus) => void) {
    this.onStatus = onStatus;
    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, powerPreference: 'high-performance' });
    const compactViewport = window.innerWidth < 700;
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, compactViewport ? 1.25 : 1.6));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.08;
    this.renderer.shadowMap.enabled = true;
    // PCF is materially cheaper than PCFSoft on mobile GPUs.
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
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

  private readonly materialCache = new Map<string, THREE.MeshStandardMaterial>();

  private material(color: THREE.ColorRepresentation, roughness = 0.86) {
    const key = `${String(color)}:${roughness}`;
    const cached = this.materialCache.get(key);
    if (cached) return cached;
    const material = new THREE.MeshStandardMaterial({ color, roughness, metalness: 0.02 });
    this.materialCache.set(key, material);
    return material;
  }

  private sharedBoxGeometry(width: number, height: number, depth: number) {
    const key = `${width.toFixed(3)}:${height.toFixed(3)}:${depth.toFixed(3)}`;
    let geometry = this.boxGeometryCache.get(key);
    if (!geometry) {
      geometry = new THREE.BoxGeometry(width, height, depth);
      this.boxGeometryCache.set(key, geometry);
    }
    return geometry;
  }

  private sharedTrafficCylinder(radius: number, height: number, segments: number) {
    const key = `${radius.toFixed(3)}:${height.toFixed(3)}:${segments}`;
    let geometry = this.trafficCylinderGeometryCache.get(key);
    if (!geometry) {
      geometry = new THREE.CylinderGeometry(radius, radius, height, segments);
      this.trafficCylinderGeometryCache.set(key, geometry);
    }
    return geometry;
  }

  private box(width: number, height: number, depth: number, color: THREE.ColorRepresentation, x: number, y: number, z: number) {
    const mesh = new THREE.Mesh(this.sharedBoxGeometry(width, height, depth), this.material(color));
    mesh.position.set(x, y, z);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    return mesh;
  }

  private streetSign(label: string, x: number, y: number, z: number, background = '#17664f') {
    const canvas = document.createElement('canvas');
    canvas.width = 512; canvas.height = 128;
    const ctx = canvas.getContext('2d');
    if (ctx) {
      ctx.fillStyle = background; ctx.fillRect(0, 0, 512, 128);
      ctx.strokeStyle = '#f4d78b'; ctx.lineWidth = 9; ctx.strokeRect(7, 7, 498, 114);
      ctx.fillStyle = '#fff7df'; ctx.font = 'bold 62px sans-serif';
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(label, 256, 66);
    }
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    const material = new THREE.MeshBasicMaterial({ map: texture, side: THREE.DoubleSide });
    const sign = new THREE.Mesh(new THREE.PlaneGeometry(3.8, 0.95), material);
    sign.position.set(x, y, z);
    this.scene.add(sign); this.movingWorld.push(sign);
    return sign;
  }

  private buildJunctionSet(z: number, district: string, color: number) {
    const crossRoad = new THREE.Mesh(new THREE.PlaneGeometry(34, 13), this.material(0x464947, 0.98));
    crossRoad.rotation.x = -Math.PI / 2; crossRoad.position.set(0, 0.012, z);
    this.scene.add(crossRoad); this.movingWorld.push(crossRoad);
    // Nine junction stop-line bars share one instanced draw call.
    const junctionBars = new THREE.InstancedMesh(
      new THREE.BoxGeometry(0.48, 0.035, 5.2), this.material(0xf3ead4), 9,
    );
    const junctionMatrix = new THREE.Matrix4();
    for (let i = 0; i < 9; i++) {
      junctionMatrix.makeTranslation(-5.4 + i * 1.35, 0.045, z - 1.4);
      junctionBars.setMatrixAt(i, junctionMatrix);
    }
    junctionBars.instanceMatrix.needsUpdate = true;
    junctionBars.computeBoundingSphere();
    junctionBars.castShadow = false;
    junctionBars.receiveShadow = false;
    this.scene.add(junctionBars); this.movingWorld.push(junctionBars);
    this.streetSign(district, -7.2, 4.8, z - 6, '#174f3d');
    // Signal poles and three signal lamps on both corners.
    for (const side of [-1, 1]) {
      const pole = this.box(0.14, 4.6, 0.14, 0x424b48, side * 8.2, 2.3, z - 4);
      this.scene.add(pole); this.movingWorld.push(pole);
      const housing = this.box(0.42, 1.15, 0.32, 0x242a28, side * 8.2, 4.45, z - 4);
      this.scene.add(housing); this.movingWorld.push(housing);
      [0xe34c3d, 0xe9bd4b, 0x54a66b].forEach((lampColor, i) => {
        const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.13, 10, 8), this.material(lampColor, 0.35));
        lamp.position.set(side * 8.2, 4.78 - i * 0.34, z - 3.8);
        this.scene.add(lamp); this.movingWorld.push(lamp);
      });
    }
    const island = this.box(1.15, 0.2, 7.8, color, 0, 0.12, z + 5.2);
    this.scene.add(island); this.movingWorld.push(island);

    // Two curved side-road corridors. Their centerlines follow the same smoothstep
    // profile as RoadGraph so the visible asphalt matches the drivable route.
    const addBranch = (side: -1 | 1, fromZ: number, toZ: number) => {
      const geometry = new THREE.BufferGeometry();
      const positions: number[] = [];
      const indices: number[] = [];
      const segments = 48;
      const smooth = (value: number) => value * value * (3 - 2 * value);
      const centerAt = (t: number) => side * 4.5 * (t <= 0.5 ? smooth(t * 2) : smooth((1 - t) * 2));
      for (let i = 0; i <= segments; i++) {
        const t = i / segments;
        const previousT = Math.max(0, t - 1 / segments);
        const nextT = Math.min(1, t + 1 / segments);
        const centerX = centerAt(t);
        const dx = centerAt(nextT) - centerAt(previousT);
        const dz = (toZ - fromZ) * (nextT - previousT);
        const length = Math.max(0.001, Math.hypot(dx, dz));
        const normalX = dz / length;
        const normalZ = -dx / length;
        const centerZ = fromZ + (toZ - fromZ) * t;
        const halfWidth = 4.25;
        positions.push(centerX + normalX * halfWidth, 0.018, centerZ + normalZ * halfWidth);
        positions.push(centerX - normalX * halfWidth, 0.018, centerZ - normalZ * halfWidth);
        if (i < segments) {
          const a = i * 2;
          indices.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
        }
      }
      geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
      geometry.setIndex(indices);
      geometry.computeVertexNormals();
      const road = new THREE.Mesh(geometry, this.material(0x3d4140, 0.98));
      road.receiveShadow = true;
      this.scene.add(road);
      this.movingWorld.push(road);
    };
    addBranch(-1, z, z - 88);
    addBranch(1, z, z - 88);
  }

  private buildWorld() {
    this.scene.background = new THREE.Color(0x9bc9d4);
    this.scene.fog = new THREE.Fog(0x9bc9d4, 85, 260);
    const hemi = new THREE.HemisphereLight(0xe8f6f1, 0x52654b, 2.25);
    this.scene.add(hemi);
    const sun = new THREE.DirectionalLight(0xffe0ae, 3.2);
    sun.position.set(-22, 36, 20);
    sun.castShadow = true;
    const mobileShadows = window.innerWidth < 700;
    sun.shadow.mapSize.set(mobileShadows ? 512 : 1024, mobileShadows ? 512 : 1024);
    sun.shadow.camera.near = 1;
    sun.shadow.camera.far = 90;
    sun.shadow.camera.left = -24; sun.shadow.camera.right = 24;
    sun.shadow.camera.top = 30; sun.shadow.camera.bottom = -30;
    this.scene.add(sun);

    const ground = new THREE.Mesh(new THREE.PlaneGeometry(220, 360), this.material(0x78956b));
    ground.rotation.x = -Math.PI / 2;
    ground.position.set(0, -0.16, -120);
    ground.receiveShadow = true;
    this.scene.add(ground);

    // Small seamless procedural asphalt map adds fine grain without external assets.
    const asphaltCanvas = document.createElement('canvas');
    asphaltCanvas.width = 128; asphaltCanvas.height = 128;
    const asphaltContext = asphaltCanvas.getContext('2d');
    if (asphaltContext) {
      asphaltContext.fillStyle = '#414644'; asphaltContext.fillRect(0, 0, 128, 128);
      for (let i = 0; i < 720; i++) {
        const px = (i * 73) % 128; const py = (i * 47) % 128;
        const shade = 48 + ((i * 29) % 46);
        asphaltContext.fillStyle = `rgba(${shade},${shade + 2},${shade},0.28)`;
        asphaltContext.fillRect(px, py, 1 + (i % 3), 1 + (i % 2));
      }
    }
    const asphaltTexture = new THREE.CanvasTexture(asphaltCanvas);
    asphaltTexture.wrapS = THREE.RepeatWrapping; asphaltTexture.wrapT = THREE.RepeatWrapping;
    asphaltTexture.repeat.set(3, 42);
    asphaltTexture.colorSpace = THREE.SRGBColorSpace;
    asphaltTexture.anisotropy = Math.min(4, this.renderer.capabilities.getMaxAnisotropy());
    const asphaltMaterial = new THREE.MeshStandardMaterial({ map: asphaltTexture, color: 0xc2c6c2, roughness: 0.98, metalness: 0 });
    const road = new THREE.Mesh(new THREE.PlaneGeometry(15, 360), asphaltMaterial);
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

    // Sixty repeated lane dashes are one GPU draw call instead of sixty meshes.
    // The parent is recycled as a 300m strip, preserving the 10m dash spacing.
    const lanePaint = this.material(0xf3e7bd);
    const laneDashGeometry = new THREE.BoxGeometry(0.13, 0.028, 3.8);
    const laneDashes = new THREE.InstancedMesh(laneDashGeometry, lanePaint, 60);
    const dashMatrix = new THREE.Matrix4();
    let dashIndex = 0;
    for (const x of [-2.5, 2.5]) {
      for (let i = 0; i < 30; i++) {
        dashMatrix.makeTranslation(x, 0.026, -i * 10 - 3);
        laneDashes.setMatrixAt(dashIndex++, dashMatrix);
      }
    }
    laneDashes.instanceMatrix.needsUpdate = true;
    laneDashes.computeBoundingSphere();
    laneDashes.castShadow = false;
    laneDashes.receiveShadow = false;
    laneDashes.userData.recycleDistance = 300;
    this.scene.add(laneDashes);
    this.movingWorld.push(laneDashes);
    // Seven crosswalk bars become a single instanced draw call.
    const crosswalk = new THREE.InstancedMesh(
      new THREE.BoxGeometry(13.8, 0.035, 0.42), this.material(0xe9e3d2), 7,
    );
    const crosswalkMatrix = new THREE.Matrix4();
    for (let i = 0; i < 7; i++) {
      crosswalkMatrix.makeTranslation(0, 0.035, -82 - i * 1.05);
      crosswalk.setMatrixAt(i, crosswalkMatrix);
    }
    crosswalk.instanceMatrix.needsUpdate = true;
    crosswalk.computeBoundingSphere();
    crosswalk.castShadow = false;
    crosswalk.receiveShadow = false;
    this.scene.add(crosswalk);
    this.movingWorld.push(crosswalk);

    const buildingLodStart = this.movingWorld.length;
    const palette = [0xe7b87d, 0xd98e72, 0x9db9a4, 0xe5d3a7, 0xc3a1c9, 0xd9c5a4];
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
      // Everyday balcony life: colored laundry hangs behind selected railings.
      // One InstancedMesh per facade keeps the extra detail inexpensive.
      for (let floor = 1; floor < Math.max(2, Math.floor(height / 3)); floor++) {
        if ((row + floor + i) % 3 !== 0) continue;
        const y = 1.65 + floor * 2.65;
        const laundry = new THREE.InstancedMesh(
          this.sharedBoxGeometry(0.34, 0.48, 0.045),
          this.material(0xf0e6d2, 0.88),
          3,
        );
        const laundryMatrix = new THREE.Matrix4();
        const laundryColors = [0xd95b4d, 0x4f7fa3, 0xe4c15a];
        for (let piece = 0; piece < 3; piece++) {
          laundryMatrix.makeTranslation(x + (piece - 1) * 0.42, y - 0.12, z + 5.88);
          laundry.setMatrixAt(piece, laundryMatrix);
          laundry.setColorAt(piece, new THREE.Color(laundryColors[(piece + row) % laundryColors.length]));
        }
        laundry.instanceMatrix.needsUpdate = true;
        laundry.computeBoundingSphere();
        laundry.castShadow = false;
        laundry.receiveShadow = false;
        this.scene.add(laundry); this.movingWorld.push(laundry);
      }

      const shop = this.box(width * 0.82, 1.55, 0.16, 0x4b514b, x, 1.0, z + 5.36);
      this.scene.add(shop); this.movingWorld.push(shop);
      const sign = this.box(width * 0.78, 0.85, 0.28, [0x17664f,0x9b3d35,0x315c87,0x9b6a26][i % 4], x, 2.25, z + 5.48);
      this.scene.add(sign); this.movingWorld.push(sign);
      const shopNames = ['মায়ের দোয়া হোটেল','ঢাকা ফ্যাশন','মদিনা স্টোর','ভাই ভাই টেলিকম','নিউ মার্কেট','চা বিরতি','মা-বাবার দোয়া','জনতা ফার্মেসি'];
      this.streetSign(shopNames[i % shopNames.length], x, 2.3, z + 5.68, ['#17664f','#9b3d35','#315c87','#9b6a26'][i % 4]);
      // Bright striped awning gives the street a lively market feel.
      for (let stripe = 0; stripe < 6; stripe++) {
        const awning = this.box(width * 0.14, 0.12, 1.15, stripe % 2 ? 0xf3e3bf : 0xc94f42, x + (stripe - 2.5) * width * 0.14, 2.95, z + 5.72);
        this.scene.add(awning); this.movingWorld.push(awning);
      }
      const aircon = this.box(0.72, 0.42, 0.42, 0xe9e5d8, x + width * 0.34, height - 1.4, z + 5.45);
      this.scene.add(aircon); this.movingWorld.push(aircon);

      // Architectural pass: facade pilasters, window mullions, balcony rails,
      // rooftop water tank and dish. Shared low-poly primitives keep mobile cost bounded.
      for (const edge of [-1, 1]) {
        const pilaster = this.box(0.16, height - 0.5, 0.18, 0xb9a78d, x + edge * (width * 0.46), height / 2, z + 5.34);
        this.scene.add(pilaster); this.movingWorld.push(pilaster);
      }
      for (let floor = 1; floor < Math.max(2, Math.floor(height / 3)); floor++) {
        const slab = this.box(width * 0.94, 0.1, 0.22, 0x9c8d78, x, floor * 2.65 + 0.45, z + 5.42);
        this.scene.add(slab); this.movingWorld.push(slab);
        for (let col = 0; col < 3; col++) {
          const wx = x + (col - 1) * width * 0.27;
          const mullion = this.box(0.055, 1.25, 0.13, 0xd8d0bd, wx, 1.65 + floor * 2.65, z + 5.39);
          this.scene.add(mullion); this.movingWorld.push(mullion);
          const railTop = this.box(1.42, 0.055, 0.055, 0xd8d0bd, wx, 1.65 + floor * 2.65 - 0.3, z + 5.83);
          this.scene.add(railTop); this.movingWorld.push(railTop);
        }
      }
      const tank = new THREE.Mesh(new THREE.CylinderGeometry(0.72, 0.72, 1.35, 12), this.material(0x66858a, 0.72));
      tank.position.set(x + width * 0.22, height + 0.86, z - 1.3);
      tank.castShadow = true; this.scene.add(tank); this.movingWorld.push(tank);
      const tankCap = this.box(1.42, 0.12, 1.42, 0x526c70, x + width * 0.22, height + 1.57, z - 1.3);
      this.scene.add(tankCap); this.movingWorld.push(tankCap);
      const dish = new THREE.Mesh(new THREE.SphereGeometry(0.48, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2), this.material(0xc8c9bd, 0.55));
      dish.position.set(x - width * 0.24, height + 0.55, z - 1.6);
      dish.rotation.x = -0.45; this.scene.add(dish); this.movingWorld.push(dish);
      // Condenser grille and drain pipe make shop AC units read as real equipment.
      for (let vent = 0; vent < 4; vent++) {
        const grille = this.box(0.045, 0.3, 0.025, 0x8d9892, x + width * 0.34 - 0.2 + vent * 0.13, height - 1.4, z + 5.68);
        this.scene.add(grille); this.movingWorld.push(grille);
      }
      const drainPipe = this.box(0.045, 1.15, 0.045, 0x8b9288, x + width * 0.4, height - 2.1, z + 5.5);
      this.scene.add(drainPipe); this.movingWorld.push(drainPipe);

      // Ground-floor shutter ribs, a projecting sign canopy and balcony planters
      // add the layered, lived-in frontage common to Dhaka mixed-use buildings.
      const shutterSlats = new THREE.InstancedMesh(
        this.sharedBoxGeometry(width * 0.54, 0.055, 0.055),
        this.material(0x9a9b91, 0.78),
        7,
      );
      const shutterMatrix = new THREE.Matrix4();
      for (let slat = 0; slat < 7; slat++) {
        shutterMatrix.makeTranslation(
          x - width * 0.12,
          0.58 + slat * 0.115,
          z + 5.57,
        );
        shutterSlats.setMatrixAt(slat, shutterMatrix);
      }
      shutterSlats.instanceMatrix.needsUpdate = true;
      shutterSlats.computeBoundingSphere();
      shutterSlats.castShadow = false;
      shutterSlats.receiveShadow = false;
      this.scene.add(shutterSlats); this.movingWorld.push(shutterSlats);

      const signCanopy = this.box(width * 0.84, 0.1, 0.82, 0x6b6253, x, 3.36, z + 5.82);
      this.scene.add(signCanopy); this.movingWorld.push(signCanopy);
      const canopyEdge = this.box(width * 0.84, 0.08, 0.08, 0xe7c45d, x, 3.31, z + 6.23);
      this.scene.add(canopyEdge); this.movingWorld.push(canopyEdge);

      for (const planterSide of [-1, 1]) {
        const planter = this.box(0.72, 0.22, 0.34, 0x8b7155, x + planterSide * 0.72, 2.0 + 2.65, z + 5.91);
        this.scene.add(planter); this.movingWorld.push(planter);
        const foliage = new THREE.Mesh(
          new THREE.IcosahedronGeometry(0.24, 0),
          this.material(0x54834f, 0.92),
        );
        foliage.position.set(x + planterSide * 0.72, 2.27 + 2.65, z + 5.91);
        foliage.scale.set(1.45, 0.7, 0.72);
        this.scene.add(foliage); this.movingWorld.push(foliage);
      }

      // Short roof parapets break the flat roof silhouette and hide rooftop equipment bases.
      for (const edge of [-1, 1]) {
        const parapet = this.box(0.16, 0.72, 10.7, 0x9a8e7b, x + edge * (width / 2), height + 0.46, z);
        this.scene.add(parapet); this.movingWorld.push(parapet);
      }
      const frontParapet = this.box(width + 0.12, 0.62, 0.16, 0x9a8e7b, x, height + 0.42, z + 5.25);
      this.scene.add(frontParapet); this.movingWorld.push(frontParapet);

      // Rooftop TV antennas and external service pipes add a varied skyline.
      if (i % 3 === 0) {
        const mast = this.box(0.055, 2.15, 0.055, 0x68736e, x - width * 0.28, height + 1.45, z - 2.2);
        this.scene.add(mast); this.movingWorld.push(mast);
        for (let arm = -1; arm <= 1; arm++) {
          const aerial = this.box(0.82, 0.045, 0.045, 0x87918a, x - width * 0.28, height + 2.05 + arm * 0.28, z - 2.2);
          this.scene.add(aerial); this.movingWorld.push(aerial);
        }
      }
      if (i % 2 === 1) {
        const servicePipe = this.box(0.075, height - 1.1, 0.075, 0x8c958d, x + width * 0.43, height / 2 + 0.45, z + 5.47);
        this.scene.add(servicePipe); this.movingWorld.push(servicePipe);
        for (let clamp = 0; clamp < Math.floor(height / 2.8); clamp++) {
          const bracket = this.box(0.16, 0.055, 0.11, 0x6e7771, x + width * 0.43, 1.1 + clamp * 2.8, z + 5.5);
          this.scene.add(bracket); this.movingWorld.push(bracket);
        }
      }
    }

    // Tag the complete building assemblies for distance culling. Their facade detail
    // remains intact nearby, while distant buildings disappear beyond the fog horizon.
    for (const object of this.movingWorld.slice(buildingLodStart)) {
      object.userData.environmentLod = true;
      object.userData.lodVisible = true;
      if (object instanceof THREE.Mesh) {
        object.castShadow = false;
        object.receiveShadow = false;
      }
    }

    // Street trees, utility poles, overhead cables and lamps.
    const roadsideLodStart = this.movingWorld.length;
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
    const stallLodStart = this.movingWorld.length;
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


    // Distant roadside props are culled and skip small-object shadow work.
    for (const object of [...this.movingWorld.slice(roadsideLodStart), ...this.movingWorld.slice(stallLodStart)]) {
      object.userData.environmentLod = true;
      object.userData.lodVisible = true;
      if (object instanceof THREE.Mesh) {
        object.castShadow = false;
        object.receiveShadow = false;
      }
    }

    // Repeating Dhaka-style junctions give the route a recognizable urban rhythm.
    this.buildJunctionSet(-70, 'ফার্মগেট', 0xd7b15e);
    this.buildJunctionSet(-158, 'শাহবাগ', 0x5d9b79);
    this.buildJunctionSet(-246, 'ধানমন্ডি', 0xb96b54);

    // Slightly sagging overhead utility cables: a more familiar Dhaka street silhouette.
    for (let i = 0; i < 8; i++) {
      const z = -22 - i * 29;
      const y = 7.4 + (i % 2) * 0.35;
      const curve = new THREE.CatmullRomCurve3([
        new THREE.Vector3(-11, y, z),
        new THREE.Vector3(-5.5, y - 0.38, z),
        new THREE.Vector3(0, y - 0.52, z),
        new THREE.Vector3(5.5, y - 0.38, z),
        new THREE.Vector3(11, y, z),
      ]);
      const cable = new THREE.Mesh(
        new THREE.TubeGeometry(curve, 16, 0.018, 5, false),
        this.material(0x343a37, 0.9)
      );
      this.scene.add(cable); this.movingWorld.push(cable);
    }

    // Stylized National Parliament landmark silhouette in the distant roadside skyline.
    const parliament = new THREE.Group();
    const stone = this.material(0xc8bda4);
    const plinth = new THREE.Mesh(new THREE.BoxGeometry(12, 1.1, 7), stone);
    plinth.position.y = 0.55; parliament.add(plinth);
    const hall = new THREE.Mesh(new THREE.BoxGeometry(8.5, 4.8, 5.2), stone);
    hall.position.y = 3.3; parliament.add(hall);
    const dome = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 2.6, 3.2, 8, 1), this.material(0x8c9a91));
    dome.position.y = 7.2; parliament.add(dome);
    for (let i = 0; i < 6; i++) {
      const column = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.2, 3.6, 8), stone);
      column.position.set(-4.4 + i * 1.75, 2.8, -2.75); parliament.add(column);
    }
    parliament.position.set(-21, 0, -218);
    this.scene.add(parliament); this.movingWorld.push(parliament);
    this.streetSign('জাতীয় সংসদ ভবন', -14.5, 5.2, -215, '#315c87');

    this.buildStreetTraffic();
    this.buildChargingStations();
    this.buildDhakaStreetDetails();
    this.buildDhakaMarketProps();
    this.buildMarketPeople();
    this.buildSidewalkCrowd();
    this.buildPursuitCrowd();
    this.buildRickshaw();
    this.player.scale.setScalar(0.74);
    this.buildFinishLine();
    this.player.position.set(0, 0, 0);
    this.scene.add(this.player);
    this.clockLight.position.set(0, 2.2, -0.8);
    this.player.add(this.clockLight);

    this.camera.position.set(0, 6.1, 10.8);
    this.cameraLookTarget.set(0, 1.2, -6.5);
    this.camera.lookAt(this.cameraLookTarget);
  }


  private buildDhakaStreetDetails() {
    // Small street-level landmarks make the fictional Dhaka route feel lived-in.
    const addMoving = (object: THREE.Object3D) => { this.scene.add(object); this.movingWorld.push(object); };
    const shelter = (x: number, z: number, label: string) => {
      for (const dx of [-1.65, 1.65]) {
        addMoving(this.box(0.12, 2.35, 0.12, 0x53615a, x + dx, 1.17, z));
        addMoving(this.box(0.1, 1.45, 0.1, 0x53615a, x + dx, 1.1, z - 1.05));
      }
      addMoving(this.box(3.65, 0.18, 1.85, 0x247b68, x, 2.35, z - 0.55));
      addMoving(this.box(3.2, 0.12, 0.18, 0xe8c65f, x, 2.22, z - 1.42));
      addMoving(this.box(2.65, 0.16, 0.55, 0x725b45, x, 0.62, z - 0.5));
      this.streetSign(label, x, 3.0, z - 1.52, '#174f3d');
    };
    shelter(-9.1, -104, 'ফার্মগেট বাস স্টপ');
    shelter(9.1, -192, 'শাহবাগ বাস স্টপ');

    // Street vendor carts with canopies and colorful goods.
    for (let i = 0; i < 4; i++) {
      const side = i % 2 === 0 ? -1 : 1;
      const x = side * (8.8 + (i % 2) * 0.35);
      const z = -48 - i * 54;
      addMoving(this.box(1.55, 0.82, 1.05, i % 2 ? 0xb86b3f : 0x4c8a70, x, 0.55, z));
      addMoving(this.box(1.85, 0.13, 1.3, i % 2 ? 0xe6bd58 : 0xc84d43, x, 1.15, z));
      for (const wheelX of [-0.58, 0.58]) {
        const wheel = new THREE.Mesh(new THREE.TorusGeometry(0.18, 0.055, 7, 14), this.material(0x282b28));
        wheel.position.set(x + wheelX, 0.22, z + 0.32);
        addMoving(wheel);
      }
      for (let item = 0; item < 4; item++) {
        const goods = new THREE.Mesh(new THREE.SphereGeometry(0.12, 8, 7), this.material([0xe6b94f,0xd94e42,0x65a66c,0xe8e0c9][item]));
        goods.position.set(x - 0.48 + item * 0.32, 1.27, z - 0.12);
        addMoving(goods);
      }
    }

    // Street hardware: drain covers, tactile paving, bins and pedestrian crossing posts.
    for (let i = 0; i < 10; i++) {
      const z = -34 - i * 24;
      for (const side of [-1,1]) {
        const bin = new THREE.Group();
        const body = new THREE.Mesh(new THREE.CylinderGeometry(0.24,0.2,0.72,10),this.material(0x4f7167));
        body.position.y=0.38; bin.add(body);
        const lid = new THREE.Mesh(new THREE.CylinderGeometry(0.25,0.25,0.08,10),this.material(0x303a36));
        lid.position.y=0.78; bin.add(lid);
        bin.position.set(side*9.1,0,z); addMoving(bin);
        for (let grate=0; grate<5; grate++) {
          addMoving(this.box(0.06,0.035,1.0,0x505752,side*7.55,0.15,z-0.5+grate*0.22));
        }
      }
    }
    // Painted curb bollards and reflective road studs around junction approaches.
    for (let i = 0; i < 18; i++) {
      const z = -22 - i * 13;
      for (const side of [-1, 1]) {
        const bollard = this.box(0.18, 0.62, 0.18, i % 2 ? 0xe8dfc8 : 0xc94c40, side * 7.95, 0.31, z);
        addMoving(bollard);
      }
      if (i % 2 === 0) {
        const stud = this.box(0.22, 0.035, 0.12, 0xe7c45d, 0, 0.035, z);
        addMoving(stud);
      }
    }

    // Local directional signs and a small rickshaw waiting bay.
    this.streetSign('মতিঝিল  →  শাহবাগ', 8.7, 4.0, -132, '#315c87');
    this.streetSign('ধানমন্ডি  →', -8.7, 4.0, -224, '#315c87');
    addMoving(this.box(3.2, 0.12, 0.16, 0xe4d4b4, -9.1, 0.18, -270));
    addMoving(this.box(0.12, 0.8, 0.12, 0x48534e, -10.5, 0.48, -270));
    addMoving(this.box(0.12, 0.8, 0.12, 0x48534e, -7.7, 0.48, -270));
    this.streetSign('রিকশা স্ট্যান্ড', -9.1, 2.0, -270, '#9b6a26');
  }

  private buildDhakaMarketProps() {
    // Compact, reusable roadside market scenes: tea counter, stools, crates,
    // produce baskets and hanging bulbs. Each stall is one moving/cullable group.
    const wood = this.material(0x80583b, 0.9);
    const darkWood = this.material(0x503b2c, 0.94);
    const steel = this.material(0x9aa39b, 0.48);
    const tea = this.material(0x9a5b2e, 0.35);
    const produce = [0xe2b84c, 0xd45a43, 0x659653, 0xd98c3f].map(color => this.material(color, 0.82));
    const bulbs = this.material(0xffd98b, 0.3);
    for (let i = 0; i < 6; i++) {
      const side = i % 2 === 0 ? -1 : 1;
      const x = side * 9.45;
      const z = -42 - i * 39;
      const stall = new THREE.Group();
      const add = (mesh: THREE.Object3D) => { stall.add(mesh); };
      const counter = new THREE.Mesh(this.sharedBoxGeometry(2.15, 0.92, 0.72), wood);
      counter.position.set(0, 0.68, 0); add(counter);
      const counterTop = new THREE.Mesh(this.sharedBoxGeometry(2.28, 0.1, 0.82), darkWood);
      counterTop.position.set(0, 1.18, 0); add(counterTop);
      // Open shelves and a row of small tea glasses.
      for (let shelf = 0; shelf < 2; shelf++) {
        const board = new THREE.Mesh(this.sharedBoxGeometry(1.55, 0.07, 0.34), steel);
        board.position.set(0, 0.55 + shelf * 0.34, -0.39); add(board);
      }
      for (let cup = 0; cup < 5; cup++) {
        const glass = new THREE.Mesh(new THREE.CylinderGeometry(0.075, 0.06, 0.16, 8), tea);
        glass.position.set(-0.62 + cup * 0.31, 1.32, -0.12); add(glass);
      }
      const kettle = new THREE.Mesh(new THREE.SphereGeometry(0.2, 10, 8), steel);
      kettle.scale.set(1.15, 0.78, 0.85); kettle.position.set(0.72, 1.39, 0.02); add(kettle);
      const kettleSpout = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.075, 0.28, 8), steel);
      kettleSpout.rotation.z = -Math.PI / 3; kettleSpout.position.set(0.93, 1.48, 0.02); add(kettleSpout);
      // Stacked produce crates and colorful goods make the frontage read as a market.
      for (let crate = 0; crate < 3; crate++) {
        const box = new THREE.Mesh(this.sharedBoxGeometry(0.48, 0.38, 0.42), crate === 1 ? darkWood : wood);
        box.position.set(-1.18 + (crate % 2) * 0.25, 0.25 + Math.floor(crate / 2) * 0.38, 0.58); add(box);
      }
      for (let item = 0; item < 9; item++) {
        const fruit = new THREE.Mesh(new THREE.SphereGeometry(0.105, 8, 7), produce[item % produce.length]);
        fruit.position.set(-1.18 + (item % 3) * 0.15, 0.55 + Math.floor(item / 3) * 0.13, 0.58);
        add(fruit);
      }
      for (const stoolX of [-0.72, 0.72]) {
        const stool = new THREE.Mesh(new THREE.CylinderGeometry(0.23, 0.2, 0.12, 10), darkWood);
        stool.position.set(stoolX, 0.36, 1.05); add(stool);
        const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.34, 6), steel);
        leg.position.set(stoolX, 0.17, 1.05); add(leg);
      }
      // Fabric-like striped canopy, support posts and a warm hanging bulb.
      for (const postX of [-1.18, 1.18]) {
        const post = new THREE.Mesh(this.sharedBoxGeometry(0.07, 2.55, 0.07), steel);
        post.position.set(postX, 1.42, -0.52); add(post);
      }
      const canopy = new THREE.Mesh(this.sharedBoxGeometry(2.75, 0.12, 1.45), this.material(i % 2 ? 0xb84b3e : 0x267a68, 0.72));
      canopy.position.set(0, 2.72, -0.25); add(canopy);
      for (let stripe = 0; stripe < 7; stripe++) {
        const trim = new THREE.Mesh(this.sharedBoxGeometry(0.055, 0.025, 1.36), this.material(stripe % 2 ? 0xf0dfbd : 0xe6b94f, 0.78));
        trim.position.set(-1.2 + stripe * 0.4, 2.79, -0.25); add(trim);
      }
      const cord = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.5, 5), darkWood);
      cord.position.set(0, 2.43, 0.18); add(cord);
      const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.11, 10, 8), bulbs);
      bulb.position.set(0, 2.15, 0.18); add(bulb);
      stall.position.set(x, 0, z);
      stall.traverse(object => {
        if (object instanceof THREE.Mesh) { object.castShadow = false; object.receiveShadow = false; }
      });
      stall.userData.environmentLod = true;
      stall.userData.lodVisible = true;
      this.scene.add(stall); this.movingWorld.push(stall);
    }
  }

  private buildMarketPeople() {
    // Vendors and shoppers give the tea stalls a readable everyday street rhythm.
    // They remain simple articulated characters so the scene stays mobile-friendly.
    for (let i = 0; i < 6; i++) {
      const side = i % 2 === 0 ? -1 : 1;
      const stallZ = -42 - i * 39;
      const vendor = this.createAnimatedPerson([0x34775d, 0x9b493d, 0x3e6489][i % 3], i * 0.9, 1.8);
      vendor.group.scale.setScalar(0.92);
      vendor.group.position.set(side * 8.65, 0, stallZ - 0.65);
      vendor.group.rotation.y = side < 0 ? Math.PI / 2 : -Math.PI / 2;
      this.scene.add(vendor.group);
      this.movingWorld.push(vendor.group);
      this.marketPeople.push({ ...vendor, baseX: side * 8.65, activity: 'serve', phaseOffset: i * 0.9 });

      // Every other stall has a customer walking slowly along the pavement.
      if (i % 2 === 0) {
        const customer = this.createAnimatedPerson([0xc28a43, 0x526d83, 0x8a5b75][i % 3], i * 0.7 + 1, 2.1);
        customer.group.scale.setScalar(0.9);
        customer.group.position.set(side * 7.55, 0, stallZ + 1.45);
        customer.group.rotation.y = side < 0 ? -Math.PI / 2 : Math.PI / 2;
        this.scene.add(customer.group);
        this.movingWorld.push(customer.group);
        this.marketPeople.push({ ...customer, baseX: side * 7.55, activity: 'walk', phaseOffset: i * 0.7 });
      }
    }
  }

  private buildStreetTraffic() {
    const vehicle = (kind: TrafficKind, color: number) => {
      const group = new THREE.Group();
      const detailed = new THREE.Group();
      const bodyMat = this.material(color, 0.58);
      const glassMat = this.material(0x8db9c1, 0.22);
      const black = this.material(0x202522, 0.96);
      const chrome = this.material(0xb9c4bb, 0.42);
      const addBox = (w:number,h:number,d:number,c:THREE.Material,px:number,py:number,pz:number) => {
        const mesh = new THREE.Mesh(this.sharedBoxGeometry(w,h,d),c);
        mesh.position.set(px,py,pz); mesh.castShadow = false; mesh.receiveShadow = false; detailed.add(mesh); return mesh;
      };
      const wheel = (wx:number,wz:number,r=0.32) => {
        const tire = new THREE.Mesh(this.sharedTrafficCylinder(r,0.18,14),black);
        tire.rotation.z = Math.PI/2; tire.position.set(wx,r,wz); detailed.add(tire);
        const hubRadius = r * 0.35;
        const hub = new THREE.Mesh(this.sharedTrafficCylinder(hubRadius,0.2,10),chrome);
        hub.rotation.z = Math.PI/2; hub.position.copy(tire.position); detailed.add(hub);
        // Raised sidewall and a visible alloy/steel rim make wheels read at close range.
        const rim = new THREE.Mesh(new THREE.TorusGeometry(r * 0.69, Math.max(0.018, r * 0.055), 6, 16), chrome);
        rim.rotation.y = Math.PI / 2; rim.position.copy(tire.position); rim.position.x += 0.095; detailed.add(rim);
        const innerRim = new THREE.Mesh(new THREE.TorusGeometry(r * 0.69, Math.max(0.018, r * 0.055), 6, 16), chrome);
        innerRim.rotation.y = Math.PI / 2; innerRim.position.copy(tire.position); innerRim.position.x -= 0.095; detailed.add(innerRim);
      };
      const addRod = (a:THREE.Vector3,b:THREE.Vector3,r:number,mat:THREE.Material) => {
        const delta = new THREE.Vector3().subVectors(b,a);
        const rod = new THREE.Mesh(this.sharedTrafficCylinder(r,delta.length(),7),mat);
        rod.position.copy(a).add(b).multiplyScalar(0.5);
        rod.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),delta.normalize());
        detailed.add(rod); return rod;
      };
      const darkTrim = this.material(0x252c2a, 0.94);
      if (kind === 'bus') {
        // Dhaka city bus: tall passenger cabin, separated side windows and front windscreen.
        addBox(2.7,2.45,6.2,bodyMat,0,1.45,0);
        addBox(2.58,0.82,0.12,glassMat,0,2.25,-3.12);
        addBox(2.58,0.82,0.12,glassMat,0,2.25,3.12);
        addBox(2.78,0.18,6.25,this.material(0xf1d79a),0,0.48,0);
        addBox(2.72,0.32,0.12,this.material(0x273d39),0,2.72,-3.12);
        for (let col=0; col<6; col++) {
          const px = (col-2.5)*0.43;
          addBox(0.36,0.58,0.05,glassMat,px,1.9,-3.13);
          addBox(0.36,0.58,0.05,glassMat,px,1.9,3.13);
        }
        for (const side of [-1,1]) {
          for (let win=0; win<5; win++) {
            const wz = -2.35 + win * 1.15;
            addBox(0.07,0.78,0.82,glassMat,side*1.36,2.05,wz);
            addBox(0.055,0.92,0.06,chrome,side*1.405,2.05,wz);
          }
          addBox(0.08,0.78,0.06,chrome,side*1.405,2.05,-2.92);
          addBox(0.08,0.78,0.06,chrome,side*1.405,2.05,2.92);
          // Painted lower belt stripe and wheel-arch side skirts.
          addBox(0.045,0.2,5.9,this.material(0xe7c45a),side*1.38,0.82,0);
          addBox(0.08,0.22,5.5,darkTrim,side*1.39,0.52,0);
        }
        addBox(0.9,0.28,0.1,this.material(0x263b39),0,2.78,-3.18);
        for (const wx of [-1.18,1.18]) for (const wz of [-2.0,2.0]) wheel(wx,wz,0.42);
      } else if (kind === 'bike') {
        wheel(0,-0.78,0.31); wheel(0,0.82,0.31);
        // Motorcycle frame, sculpted fuel tank, two-piece saddle and rear carrier.
        addBox(0.16,0.62,0.16,chrome,0,0.77,0.02);
        addBox(0.52,0.42,0.64,bodyMat,0,1.03,-0.18);
        addBox(0.38,0.18,0.82,black,0,1.13,0.43);
        addBox(0.34,0.12,0.5,black,0,1.02,-0.63);
        addBox(0.12,0.12,0.72,chrome,0,0.64,0.05);
        addBox(0.62,0.28,0.24,bodyMat,0,0.86,-0.18);
        addBox(0.12,0.12,0.12,this.material(0xffedbd,0.28),0,1.13,-0.55);
        addBox(0.86,0.055,0.055,chrome,0,1.37,-0.2);
        addBox(0.1,0.13,0.62,chrome,0.28,0.54,0.46);
        addBox(0.62,0.08,0.13,bodyMat,0,1.1,0.94);
        for (const side of [-1,1]) {
          addRod(new THREE.Vector3(side*0.12,0.62,-0.78),new THREE.Vector3(side*0.2,1.16,-0.5),0.035,chrome);
          addBox(0.12,0.08,0.28,darkTrim,side*0.32,0.54,0.15);
        }
      } else if (kind === 'auto') {
        // Battery-powered three-wheeler / easybike with roof and rear passenger bay.
        addBox(1.58,0.68,2.55,bodyMat,0,0.82,0.1);
        addBox(1.48,0.72,1.08,glassMat,0,1.55,-0.62);
        addBox(1.78,0.14,2.35,this.material(0xe8d5a0),0,2.12,0.25);
        addBox(1.5,0.1,1.0,this.material(0x4c514b),0,1.32,0.78);
        wheel(0,-1.05,0.38); wheel(-0.78,0.82,0.4); wheel(0.78,0.82,0.4);
        for (const wx of [-0.72,0.72]) {
          const support = new THREE.Mesh(new THREE.CylinderGeometry(0.035,0.035,0.92,7),chrome);
          support.position.set(wx,1.62,0.72); detailed.add(support);
        }
      } else if (kind === 'rickshaw') {
        // Pedal rickshaw used as ambient traffic, visually distinct from the player's easybike.
        wheel(0,-1.12,0.34); wheel(-0.78,0.78,0.4); wheel(0.78,0.78,0.4);
        // Traditional pedal rickshaw: front bicycle fork, rear passenger bench and curved canopy ribs.
        addBox(0.12,0.14,1.22,chrome,0,0.62,-0.2);
        addBox(1.58,0.52,1.5,this.material(0xc84e42),0,0.96,0.78);
        addBox(1.55,0.12,1.62,this.material(0x267e59),0,1.72,0.72);
        addBox(1.1,0.08,0.78,this.material(0xe8bd58),0,1.82,0.72);
        addBox(0.5,0.72,0.44,this.material(0x286b55),0,1.2,-0.42);
        for (const side of [-1,1]) {
          addRod(new THREE.Vector3(side*0.72,1.15,0.0),new THREE.Vector3(side*0.62,2.18,0.35),0.045,chrome);
          addRod(new THREE.Vector3(side*0.62,2.18,0.35),new THREE.Vector3(side*0.62,2.18,1.22),0.045,chrome);
          addRod(new THREE.Vector3(side*0.62,2.18,1.22),new THREE.Vector3(side*0.72,1.15,1.45),0.045,chrome);
          addBox(0.045,0.025,1.5,this.material([0xe5c44d,0xece3c8][side===-1?0:1]),side*0.5,2.0,0.72);
        }
        addBox(0.72,0.12,0.55,this.material(0x4a3328),0,1.48,1.2);
        addBox(0.68,0.08,0.12,this.material(0x302820),0,1.78,1.5);
        const head = new THREE.Mesh(new THREE.SphereGeometry(0.16,10,8),this.material(0xb97850));
        head.position.set(0,1.7,-0.46); detailed.add(head);
        addBox(0.08,0.08,0.52,chrome,0,0.55,0.0);
        addBox(0.58,0.06,0.08,chrome,0,0.55,-0.18);
      } else {
        const length = kind === 'cng' ? 2.7 : 3.4;
        if (kind === 'cng') {
          // Three-wheeled CNG with curved-looking nose, open passenger cabin and tubular canopy.
          addBox(1.5,0.62,1.18,bodyMat,0,0.72,-0.72);
          addBox(1.42,0.72,1.38,bodyMat,0,0.78,0.48);
          addBox(1.35,0.66,0.09,glassMat,0,1.47,-0.48);
          addBox(1.32,0.62,0.08,glassMat,0,1.45,1.1);
          addBox(1.55,0.13,1.72,this.material(0x18784f),0,1.95,0.32);
          addBox(1.45,0.1,1.42,this.material(0x273a32),0,1.34,0.52);
          addBox(1.55,0.12,0.16,this.material(0xe7c75c),0,0.48,-1.12);
          for (const side of [-1,1]) {
            addRod(new THREE.Vector3(side*0.72,0.78,-0.95),new THREE.Vector3(side*0.72,1.92,-0.62),0.045,chrome);
            addRod(new THREE.Vector3(side*0.72,1.92,-0.62),new THREE.Vector3(side*0.72,1.92,1.12),0.045,chrome);
            addRod(new THREE.Vector3(side*0.72,1.92,1.12),new THREE.Vector3(side*0.72,0.78,1.12),0.045,chrome);
            addBox(0.055,0.58,0.88,glassMat,side*0.74,1.45,0.28);
            addBox(0.08,0.1,0.46,this.material(0xf0c94f),side*0.77,0.9,0.42);
          }
          wheel(-0.72,-0.78,0.31); wheel(0.72,-0.78,0.31); wheel(0,1.12,0.34);
        } else {
          // Private sedan/SUV-style car with hood, passenger greenhouse and separated glazing.
          addBox(1.9,0.58,3.35,bodyMat,0,0.7,0.08);
          addBox(1.68,0.58,1.92,glassMat,0,1.38,-0.12);
          addBox(1.58,0.12,1.62,bodyMat,0,1.73,-0.12);
          addBox(1.84,0.13,0.82,bodyMat,0,0.99,-1.12);
          addBox(1.84,0.12,0.72,bodyMat,0,0.98,1.2);
          addBox(1.85,0.16,0.18,this.material(0xe9d7a9),0,0.38,-1.58);
          for (const side of [-1,1]) {
            addBox(0.055,0.52,1.38,glassMat,side*0.91,1.43,-0.12);
            addBox(0.07,0.54,0.06,chrome,side*0.94,1.43,-0.83);
            addBox(0.07,0.54,0.06,chrome,side*0.94,1.43,0.58);
            addBox(0.055,0.045,0.2,chrome,side*0.97,1.04,0.0);
            addBox(0.055,0.045,0.2,chrome,side*0.97,1.04,0.78);
          }
          for (const wx of [-0.82,0.82]) for (const wz of [-length*0.32,length*0.32]) wheel(wx,wz,0.34);
        }
      }

      // Vehicle-specific finishing kit: lamps, bumpers, mirrors, doors and trim.
      const lampMat = new THREE.MeshStandardMaterial({ color: 0xffedbd, emissive: 0x8a6a2d, emissiveIntensity: 0.22, roughness: 0.28 });
      const redLamp = this.material(0xb93d35, 0.42);
      const addLamp = (px:number, py:number, pz:number, color:THREE.Material) => addBox(0.22,0.14,0.055,color,px,py,pz);
      const amberLamp = this.material(0xf0a43b, 0.38);
      const plateMat = this.material(0xe9e4d4, 0.82);
      // Common registration plates, door seams and turn indicators.
      addBox(0.48,0.15,0.035,plateMat,0,0.57,kind === 'bus' ? -3.17 : kind === 'bike' ? -0.61 : -1.76);
      if (kind !== 'bus' && kind !== 'bike') {
        for (const side of [-1,1]) {
          addBox(0.045,0.48,0.035,chrome,side * (kind === 'cng' ? 0.76 : 0.96),1.03,0.1);
          addLamp(side * (kind === 'cng' ? 0.68 : 0.82),0.9,kind === 'cng' ? -1.28 : -1.68,amberLamp);
        }
      }
      if (kind === 'bus') {
        addBox(2.76,0.14,0.16,chrome,0,0.56,-3.16);
        for (const wx of [-0.96,0.96]) {
          addLamp(wx,0.82,-3.18,lampMat); addLamp(wx,0.82,3.18,redLamp);
          addBox(0.045,0.7,0.045,chrome,wx,1.92,-3.17);
        }
        for (let col=0; col<6; col++) {
          addBox(0.055,0.62,0.07,chrome,(col-2.5)*0.43,1.92,-3.19);
          addBox(0.38,0.055,0.07,chrome,(col-2.5)*0.43,1.57,-3.19);
        }
        addBox(0.82,0.2,0.12,this.material(0x263b39),0,2.75,-3.2);
      } else if (kind === 'car' || kind === 'cng') {
        const w = kind === 'cng' ? 1.5 : 1.9;
        const len = kind === 'cng' ? 2.7 : 3.4;
        addBox(w*0.82,0.1,0.08,chrome,0,1.0,-len*0.5);
        addBox(w*0.82,0.1,0.08,chrome,0,1.0,len*0.5);
        for (const side of [-1,1]) {
          addLamp(side*w*0.36,0.84,-len*0.49,lampMat);
          addLamp(side*w*0.36,0.84,len*0.49,redLamp);
          addBox(0.12,0.12,0.32,chrome,side*(w*0.53),1.72,-0.58);
          if (kind === 'car') {
            addBox(0.045,0.52,len*0.42,chrome,side*(w*0.5),1.46,0.08);
            addBox(0.62,0.06,0.08,chrome,side*0.48,0.48,0.12);
          } else {
            addBox(0.05,0.72,len*0.46,chrome,side*(w*0.5),1.43,0.08);
            addBox(0.055,0.5,0.055,chrome,side*(w*0.5),1.55,-0.62);
          }
        }
        addBox(w*0.45,0.14,0.08,chrome,0,0.45,-len*0.51);
      } else if (kind === 'bike') {
        addBox(0.62,0.28,0.24,bodyMat,0,0.86,-0.18);
        addBox(0.12,0.12,0.12,lampMat,0,1.13,-0.55);
        addBox(0.86,0.055,0.055,chrome,0,1.37,-0.2);
        for (const side of [-1,1]) {
          const mirror = new THREE.Mesh(new THREE.SphereGeometry(0.09,10,8),chrome);
          mirror.position.set(side*0.43,1.55,-0.22); detailed.add(mirror);
          addBox(0.055,0.32,0.055,chrome,side*0.38,1.48,-0.18);
        }
      } else if (kind === 'auto') {
        for (const side of [-1,1]) {
          addBox(0.07,0.7,0.07,chrome,side*0.72,1.58,-0.6);
          addBox(0.09,0.12,0.12,lampMat,side*0.56,1.0,-1.37);
          addBox(0.09,0.12,0.12,redLamp,side*0.68,0.92,1.38);
          addBox(0.055,0.42,1.2,chrome,side*0.79,1.43,0.65);
        }
        addBox(1.32,0.08,0.08,chrome,0,0.55,1.43);
      } else if (kind === 'rickshaw') {
        // Hand-painted hood ribs and visible pedal/crank detail distinguish it from an easybike.
        for (let stripe=0; stripe<5; stripe++) addBox(0.12,0.035,1.35,this.material([0xffd45b,0xf2e8cf,0x267e59,0xf2e8cf,0xc84e42][stripe]),-0.5+stripe*0.25,1.81,0.72);
        addBox(0.08,0.08,0.7,chrome,0,0.62,0.15);
        addBox(0.52,0.055,0.06,chrome,0,0.58,0.15);
        addBox(0.12,0.1,0.12,chrome,0.26,0.58,0.15);
        addLamp(-0.48,1.0,-1.2,lampMat); addLamp(0.48,1.0,-1.2,lampMat);
      }
      // Keep the authored detailed model close to the player, with a low-cost
      // silhouette proxy for distant traffic. The outer Group keeps physics unchanged.
      group.add(detailed);
      const proxy = new THREE.Group();
      const proxyBody = new THREE.Mesh(
        this.sharedBoxGeometry(kind === 'bus' ? 2.5 : 1.65, kind === 'bus' ? 1.9 : 1.05, kind === 'bus' ? 5.6 : kind === 'bike' ? 1.7 : 3.0),
        bodyMat
      );
      proxyBody.castShadow = false;
      proxyBody.receiveShadow = false;
      proxyBody.position.y = kind === 'bus' ? 1.25 : 0.85;
      proxy.add(proxyBody);
      const proxyGlass = new THREE.Mesh(
        this.sharedBoxGeometry(kind === 'bus' ? 2.35 : 1.42, kind === 'bus' ? 0.7 : 0.48, 0.08),
        glassMat
      );
      proxyGlass.castShadow = false;
      proxyGlass.receiveShadow = false;
      proxyGlass.position.set(0, kind === 'bus' ? 2.0 : 1.45, -0.8);
      proxy.add(proxyGlass);
      const proxyWheelRadius = kind === 'bus' ? 0.38 : 0.29;
      const proxyWheelCount = kind === 'bike' ? 2 : kind === 'auto' || kind === 'cng' || kind === 'rickshaw' ? 3 : 4;
      for (let wi = 0; wi < proxyWheelCount; wi++) {
        const wheel = new THREE.Mesh(this.sharedTrafficCylinder(proxyWheelRadius, 0.12, 8), black);
        wheel.castShadow = false;
        wheel.receiveShadow = false;
        wheel.rotation.z = Math.PI / 2;
        wheel.position.set(wi % 2 === 0 ? -0.72 : 0.72, proxyWheelRadius, wi < 2 ? -1.0 : 1.0);
        proxy.add(wheel);
      }
      proxy.visible = false;
      group.add(proxy);
      group.userData.highDetail = detailed;
      group.userData.lowDetail = proxy;
      group.userData.lodTier = -1;
      this.scene.add(group);
      return group;
    };
    // A fixed-size pool of graph-routed agents. Each agent owns a graph state,
    // a legal route preference, lane offset, speed profile and rectangular collider.
    const traffic: Array<{kind:TrafficKind;distance:number;color:number;speed:number;route:-1|0|1;lane:number}> = [
      {kind:'bus',distance:38,color:0x287b70,speed:8.2,route:0,lane:-1.65},
      {kind:'car',distance:62,color:0xe0a13d,speed:10.4,route:1,lane:1.65},
      {kind:'auto',distance:88,color:0x16845e,speed:7.6,route:-1,lane:-1.55},
      {kind:'cng',distance:116,color:0x18875d,speed:9.3,route:1,lane:1.55},
      {kind:'bike',distance:145,color:0xc84b3e,speed:12.2,route:0,lane:-1.55},
      {kind:'rickshaw',distance:174,color:0x2d8c63,speed:6.8,route:-1,lane:1.55},
      {kind:'car',distance:204,color:0x547ca0,speed:10.8,route:1,lane:-1.65},
      {kind:'bus',distance:234,color:0xd2a04f,speed:7.9,route:0,lane:1.65},
      {kind:'auto',distance:264,color:0xb74c42,speed:8.7,route:-1,lane:-1.55},
      {kind:'cng',distance:294,color:0x277e68,speed:9.8,route:1,lane:1.55},
      {kind:'rickshaw',distance:324,color:0x2f9366,speed:6.9,route:0,lane:-1.55},
      {kind:'bike',distance:354,color:0x276ca0,speed:11.8,route:-1,lane:1.55},
    ];
    const dimensions: Record<TrafficKind,{halfWidth:number;halfLength:number}> = {
      bus:{halfWidth:1.42,halfLength:3.15}, car:{halfWidth:1.02,halfLength:1.75},
      cng:{halfWidth:0.82,halfLength:1.45}, bike:{halfWidth:0.42,halfLength:0.9},
      auto:{halfWidth:0.94,halfLength:1.35}, rickshaw:{halfWidth:0.96,halfLength:1.25},
    };
    traffic.forEach((spec) => {
      const group = vehicle(spec.kind,spec.color);
      const state = advanceRoad(createRoadState(),spec.distance,spec.route);
      const size = dimensions[spec.kind];
      const agent: TrafficAgent = {
        kind:spec.kind,group,state,cruiseSpeed:spec.speed,currentSpeed:spec.speed,
        routeBias:spec.route,lane:spec.lane,halfWidth:size.halfWidth,halfLength:size.halfLength,overlapping:false,knockedBack:false,knockbackVelocity:new THREE.Vector3(),knockbackTime:0,
      };
      this.trafficAgents.push(agent);
      group.position.set(state.x + spec.lane,0,this.distance - state.distance);
    });
  }

  private buildChargingStations() {
    // Clearly marked roadside battery-swap/charging bays; positions are route-distance based.
    for (const [index, distance] of [145, 390, 650, 930].entries()) {
      const group = new THREE.Group();
      const side = index % 2 === 0 ? 1 : -1;
      const x = side * 8.6;
      const base = new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.18, 4.2), this.material(0x315b48));
      base.position.y = 0.09; group.add(base);
      const cabinet = new THREE.Mesh(new THREE.BoxGeometry(0.9, 1.7, 0.62), this.material(0xe7d9a9));
      cabinet.position.set(-side * 0.55, 0.95, 0); group.add(cabinet);
      const screen = new THREE.Mesh(new THREE.BoxGeometry(0.48, 0.42, 0.04), this.material(0x3a9b83, 0.35));
      screen.position.set(-side * 0.55, 1.22, -0.34); group.add(screen);
      const canopy = new THREE.Mesh(new THREE.BoxGeometry(2.7, 0.16, 2.4), this.material(0x168c82));
      canopy.position.set(0, 2.0, 0); group.add(canopy);
      const postMat = this.material(0xf1d34f);
      for (const px of [-1.12, 1.12]) {
        const post = new THREE.Mesh(new THREE.CylinderGeometry(0.055,0.055,2,8),postMat);
        post.position.set(px,1,0); group.add(post);
      }
      const labelCanvas = document.createElement('canvas');
      labelCanvas.width = 512; labelCanvas.height = 128;
      const ctx = labelCanvas.getContext('2d');
      if (ctx) { ctx.fillStyle='#164b39';ctx.fillRect(0,0,512,128);ctx.fillStyle='#fff7d8';ctx.font='bold 58px sans-serif';ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText('ইজি-বাইক চার্জ',256,66); }
      const texture = new THREE.CanvasTexture(labelCanvas); texture.colorSpace = THREE.SRGBColorSpace;
      const sign = new THREE.Mesh(new THREE.PlaneGeometry(2.6,0.65),new THREE.MeshBasicMaterial({map:texture,side:THREE.DoubleSide}));
      sign.position.set(0,2.45,-0.02); group.add(sign);
      group.position.set(x,0,-distance);
      this.scene.add(group);
      this.chargingStations.push({group,distance});
    }
  }

  private roadHeading(state: Pick<RoadState, 'edgeId' | 'edgeProgress'>) {
    const before = getRoadPoint(state.edgeId, Math.max(0, state.edgeProgress - 0.025));
    const after = getRoadPoint(state.edgeId, Math.min(1, state.edgeProgress + 0.025));
    return -Math.atan2(after.x - before.x, Math.max(0.001, after.distance - before.distance));
  }

  private positionTrafficAgent(agent: TrafficAgent) {
    const heading = this.roadHeading(agent.state);
    // Lane offset follows the road's local normal, so vehicles stay inside curved branches.
    const laneX = agent.lane * Math.cos(heading);
    const laneZ = -agent.lane * Math.sin(heading);
    agent.group.rotation.y = heading;
    agent.group.position.set(agent.state.x + laneX, 0, this.distance - agent.state.distance + laneZ);
  }

  private recordCollision(kind: DamageCategory) {
    const cost = this.collisionValues[kind];
    this.totalDamageCost += cost;
    this.collisionCount += 1;
    this.damageBreakdown[kind].hits += 1;
    this.damageBreakdown[kind].cost += cost;
  }

  private launchTrafficAgent(agent: TrafficAgent, lateral: number) {
    const side = lateral <= 0 ? -1 : 1;
    const travelSign = Math.sign(this.speed || 1);
    const heading = this.player.rotation.y;
    const forwardX = -Math.sin(heading) * travelSign;
    const forwardZ = -Math.cos(heading) * travelSign;
    const rightX = Math.cos(heading) * side;
    const rightZ = -Math.sin(heading) * side;
    agent.knockedBack = true;
    agent.knockbackTime = 1.35;
    agent.knockbackVelocity.set(forwardX * 3.2 + rightX * 4.6, 6.4, forwardZ * 3.2 + rightZ * 4.6);
    agent.group.rotation.z = side * 0.22;
    agent.group.rotation.x = -0.16;
    agent.overlapping = true;
  }

  private updateTrafficLod(agent: TrafficAgent, depth: number) {
    const tier = depth < 72 ? 2 : depth < 155 ? 1 : 0;
    if (agent.group.userData.lodTier === tier) return;
    agent.group.userData.lodTier = tier;
    const highDetail = agent.group.userData.highDetail as THREE.Group | undefined;
    const lowDetail = agent.group.userData.lowDetail as THREE.Group | undefined;
    if (highDetail) highDetail.visible = tier === 2;
    if (lowDetail) lowDetail.visible = tier === 1;
    agent.group.visible = tier !== 0;
  }

  private updateTraffic(dt: number) {
    const targetSpeeds = this.trafficAgents.map(agent => {
      if (agent.knockedBack) return 0;
      let nearestGap = Number.POSITIVE_INFINITY;
      let leadSpeed = agent.cruiseSpeed;
      for (const other of this.trafficAgents) {
        if (other === agent || other.knockedBack) continue;
        const gap = other.state.distance - agent.state.distance;
        const lateralGap = Math.abs(other.state.x + other.lane - agent.state.x - agent.lane);
        if (gap > 0 && gap < nearestGap && lateralGap < agent.halfWidth + other.halfWidth + 0.45) {
          nearestGap = gap; leadSpeed = other.currentSpeed;
        }
      }
      if (nearestGap < agent.halfLength + 3.2) {
        const safeSpeed = leadSpeed * Math.max(0.2, (nearestGap - agent.halfLength) / 3.2);
        return Math.min(agent.cruiseSpeed, safeSpeed);
      }
      return agent.cruiseSpeed;
    });

    this.trafficAgents.forEach((agent,index) => {
      if (agent.knockedBack) {
        agent.knockbackTime -= dt;
        agent.knockbackVelocity.y -= 12 * dt;
        agent.group.position.addScaledVector(agent.knockbackVelocity, dt);
        if (agent.group.position.y < 0) { agent.group.position.y = 0; agent.knockbackVelocity.y = 0; }
        agent.group.rotation.z += (agent.knockbackVelocity.x >= 0 ? 1 : -1) * dt * 3.8;
        agent.group.rotation.x += dt * 2.2;
        this.updateTrafficLod(agent, Math.abs(agent.group.position.z));
        if (agent.knockbackTime <= 0) {
          const spawnDistance = Math.min(this.prototypeRouteLength - 30, this.distance + 150 + index * 11);
          agent.state = advanceRoad(createRoadState(), spawnDistance, agent.routeBias);
          agent.currentSpeed = agent.cruiseSpeed;
          agent.knockedBack = false; agent.overlapping = false;
          agent.group.rotation.set(0, 0, 0);
          this.positionTrafficAgent(agent);
        }
        return;
      }

      agent.currentSpeed = THREE.MathUtils.damp(agent.currentSpeed,targetSpeeds[index],2.8,dt);
      agent.state = advanceRoad(agent.state,agent.currentSpeed * dt,agent.routeBias);
      if (agent.state.distance < this.distance - 52 || agent.state.distance > this.prototypeRouteLength - 18) {
        const spawnDistance = Math.min(this.prototypeRouteLength - 30,this.distance + 170 + index * 13);
        agent.state = advanceRoad(createRoadState(),spawnDistance,agent.routeBias);
        agent.currentSpeed = agent.cruiseSpeed; agent.overlapping = false;
      }
      this.positionTrafficAgent(agent);
      const depth = Math.abs(agent.state.distance - this.distance);
      this.updateTrafficLod(agent, depth);
      const dx = agent.group.position.x - this.player.position.x;
      const dz = agent.group.position.z;
      const heading = this.player.rotation.y;
      const longitudinal = dx * -Math.sin(heading) + dz * -Math.cos(heading);
      const lateral = dx * Math.cos(heading) - dz * Math.sin(heading);
      const overlaps = Math.abs(longitudinal) < 1.42 + agent.halfLength
        && Math.abs(lateral) < 0.98 + agent.halfWidth;
      if (overlaps && !agent.overlapping) {
        agent.overlapping = true;
        this.recordCollision(agent.kind === 'bike' ? 'motorcycle' : agent.kind);
        this.collisionShake = 0.55;
        this.crashTime = 0.55;
        this.crashRoll = lateral <= 0 ? -1 : 1;
        this.damage = Math.min(100, this.damage + (agent.kind === 'bus' ? 28 : agent.kind === 'car' ? 20 : 12));
        this.speed *= 0.52;
        this.lateralOffset = THREE.MathUtils.clamp(this.lateralOffset + this.crashRoll * 0.45, -2.65, 2.65);
        this.launchTrafficAgent(agent, lateral);
      } else if (!overlaps) {
        agent.overlapping = false;
      }
    });
  }

  private updatePedestrianCollisions(dt: number) {
    this.pedestrians.forEach((person) => {
      if (person.knockedBack) {
        person.knockbackTime -= dt;
        person.knockbackVelocity.y -= 12 * dt;
        person.group.position.addScaledVector(person.knockbackVelocity, dt);
        if (person.group.position.y < 0) { person.group.position.y = 0; person.knockbackVelocity.y = 0; }
        person.group.rotation.z += (person.knockbackVelocity.x >= 0 ? 1 : -1) * dt * 4.2;
        person.group.rotation.x += dt * 2.6;
        if (person.knockbackTime <= 0) {
          person.knockedBack = false;
          person.group.rotation.set(0, 0, 0);
          person.group.position.set(person.side * (3.8 + (person.spawnIndex % 3) * 0.25), 0, -78 - person.spawnIndex * 2.2);
          person.phase += Math.PI;
          person.walkPhase = person.phase;
        }
        return;
      }
      const dx = person.group.position.x - this.player.position.x;
      const dz = person.group.position.z;
      const heading = this.player.rotation.y;
      const longitudinal = dx * -Math.sin(heading) + dz * -Math.cos(heading);
      const lateral = dx * Math.cos(heading) - dz * Math.sin(heading);
      if (Math.abs(longitudinal) < 1.72 && Math.abs(lateral) < 1.3) {
        person.knockedBack = true;
        person.knockbackTime = 1.2;
        const direction = lateral <= 0 ? -1 : 1;
        const travelSign = Math.sign(this.speed || 1);
        const forwardX = -Math.sin(heading) * travelSign;
        const forwardZ = -Math.cos(heading) * travelSign;
        const rightX = Math.cos(heading) * direction;
        const rightZ = -Math.sin(heading) * direction;
        person.knockbackVelocity.set(forwardX * 3.0 + rightX * 4.2, 6.1, forwardZ * 3.0 + rightZ * 4.2);
        person.group.rotation.z = direction * 0.18;
        this.recordCollision('pedestrian');
        this.collisionShake = 0.5;
        this.crashTime = 0.45;
        this.crashRoll = direction;
        this.damage = Math.min(100, this.damage + 8);
        this.speed *= 0.72;
      }
    });
  }

  private createAnimatedPerson(shirtColor: number, phase: number, stride: number): AnimatedPerson {
    const group = new THREE.Group();
    const shirt = this.material(shirtColor, 0.92);
    const skin = this.material(0xb97951, 0.96);
    const skinLight = this.material(0xd49a70, 0.92);
    const trousers = this.material(0x303a3c, 0.96);
    const shoe = this.material(0x252927, 0.98);
    const hair = this.material(0x292622, 0.98);
    const trim = this.material(0xe7d8bd, 0.9);
    const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.22, 0.55, 5, 9), shirt);
    body.position.y = 1.05; group.add(body);
    const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.075, 0.085, 0.15, 9), skin);
    neck.position.y = 1.42; group.add(neck);
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.19, 16, 12), skin);
    head.position.set(0, 1.62, -0.02); group.add(head);
    const hairCap = new THREE.Mesh(new THREE.SphereGeometry(0.195, 14, 8, 0, Math.PI * 2, 0, Math.PI * 0.53), hair);
    hairCap.position.set(0, 1.69, -0.035); group.add(hairCap);
    const earGeometry = new THREE.SphereGeometry(0.045, 8, 7);
    for (const side of [-1, 1]) {
      const ear = new THREE.Mesh(earGeometry, skinLight);
      ear.position.set(side * 0.185, 1.61, -0.02); group.add(ear);
      const eye = new THREE.Mesh(new THREE.SphereGeometry(0.018, 7, 6), hair);
      eye.position.set(side * 0.067, 1.65, -0.19); group.add(eye);
    }
    const nose = new THREE.Mesh(new THREE.SphereGeometry(0.035, 8, 7), skinLight);
    nose.scale.set(0.8, 0.8, 0.7); nose.position.set(0, 1.59, -0.205); group.add(nose);
    // A small collar and shirt placket break up the otherwise plain torso.
    const collar = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.055, 0.08), trim);
    collar.position.set(0, 1.34, -0.195); group.add(collar);
    const placket = new THREE.Mesh(new THREE.BoxGeometry(0.035, 0.32, 0.025), trim);
    placket.position.set(0, 1.08, -0.218); group.add(placket);
    const makeLimb = (x: number, y: number, length: number, material: THREE.Material, radius = 0.065) => {
      const pivot = new THREE.Group(); pivot.position.set(x, y, 0);
      const limb = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius * 1.12, length, 9), material);
      limb.position.y = -length / 2; pivot.add(limb); group.add(pivot); return pivot;
    };
    const leftLeg = makeLimb(-0.12, 0.67, 0.58, trousers, 0.078);
    const rightLeg = makeLimb(0.12, 0.67, 0.58, trousers, 0.078);
    // Short sleeves plus exposed forearms give the crowd a more natural silhouette.
    for (const side of [-1, 1]) {
      const sleeve = new THREE.Mesh(new THREE.CylinderGeometry(0.095, 0.09, 0.28, 9), shirt);
      sleeve.position.set(side * 0.29, 1.19, 0); sleeve.rotation.z = side * -0.16; group.add(sleeve);
      const shoeMesh = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.09, 0.28), shoe);
      shoeMesh.position.set(side * 0.12, 0.055, -0.075); group.add(shoeMesh);
    }
    const leftArm = makeLimb(-0.3, 1.08, 0.48, skin, 0.055);
    const rightArm = makeLimb(0.3, 1.08, 0.48, skin, 0.055);
    leftArm.rotation.z = -0.18; rightArm.rotation.z = 0.18;
    return { group, leftLeg, rightLeg, leftArm, rightArm, phase, stride };
  }

  private animatePerson(person: AnimatedPerson, dt: number, running = false) {
    person.phase += dt * person.stride;
    const swing = Math.sin(person.phase) * (running ? 0.72 : 0.34);
    person.leftLeg.rotation.x = swing;
    person.rightLeg.rotation.x = -swing;
    person.leftArm.rotation.x = -swing * 0.72;
    person.rightArm.rotation.x = swing * 0.72;
    person.group.position.y = Math.abs(Math.sin(person.phase * 2)) * (running ? 0.07 : 0.025);
  }

  private buildSidewalkCrowd() {
    for (let i = 0; i < 12; i++) {
      const side = i % 2 === 0 ? -1 : 1;
      const person = this.createAnimatedPerson([0x2e8069, 0xc65a49, 0x426f9b, 0xd39c43][i % 4], i * 0.8, 2.4 + (i % 3) * 0.25);
      const pedestrian: PedestrianAgent = { ...person, knockedBack: false, knockbackVelocity: new THREE.Vector3(), knockbackTime: 0, side, spawnIndex: i, walkPhase: i * 1.7 };
      pedestrian.group.position.set(side * (3.8 + (i % 3) * 0.25), 0, -24 - i * 18);
      this.scene.add(pedestrian.group); this.movingWorld.push(pedestrian.group);
      this.sidewalkPeople.push(pedestrian); this.pedestrians.push(pedestrian);
    }
  }

  private buildPursuitCrowd() {
    // Seven pursuers are a prototype tuning choice inside the approved 5–10 range.
    for (let i = 0; i < 7; i++) {
      const person = this.createAnimatedPerson([0xb84237, 0x7d3546, 0xd06a38, 0x5b4141][i % 4], i * 0.65, 10.5 + (i % 3) * 0.35);
      person.group.scale.setScalar(1.02);
      person.group.visible = false;
      this.scene.add(person.group);
      this.chasers.push(person);
    }
  }

  private updatePursuit(dt: number) {
    // Trigger and movement values below are explicitly provisional for playtesting.
    if (!this.pursuitActive && !this.escaped && this.distance >= 280) {
      this.pursuitActive = true;
      this.pursuitElapsed = 0;
      this.chasers.forEach((person, i) => {
        const state = advanceRoad(createRoadState(), Math.max(0, this.distance - 24 - i * 2.8), i % 3 === 0 ? -1 : i % 3 === 1 ? 0 : 1);
        person.group.position.set(state.x + (i % 2 ? 1.0 : -1.0), 0, this.distance - state.distance);
        person.group.visible = true;
      });
    }
    if (!this.pursuitActive || this.caught) return;
    this.pursuitElapsed += dt;
    const chaserSpeed = 15.2; // provisional world units/second
    let nearestGap = Number.POSITIVE_INFINITY;
    this.chasers.forEach((person, i) => {
      const previousZ = person.group.position.z;
      const gapToPlayer = previousZ;
      const newGap = Math.max(0, gapToPlayer + (this.speed - chaserSpeed) * dt);
      person.group.position.z = newGap;
      person.group.position.x = THREE.MathUtils.damp(person.group.position.x, this.player.position.x + (i % 2 ? 0.75 : -0.75), 1.8, dt);
      person.group.rotation.y = Math.PI;
      this.animatePerson(person, dt, true);
      nearestGap = Math.min(nearestGap, newGap);
    });
    if (nearestGap <= 2.35) {
      this.caught = true;
      this.speed = 0;
      this.input.clear();
      this.chasers.forEach(person => { person.group.rotation.y = 0; });
      return;
    }
    // A sustained high-speed gap creates a clean escape; BOOST is the intended test route.
    if (this.speed >= chaserSpeed + 2.2 && nearestGap >= 34) this.escapeTime += dt;
    else this.escapeTime = Math.max(0, this.escapeTime - dt * 0.5);
    if (this.escapeTime >= 4.0) {
      this.escaped = true;
      this.pursuitActive = false;
      this.chasers.forEach(person => { person.group.visible = false; });
    }
  }

  private updateChargingAndBattery(dt: number) {
    let nearby = false;
    for (const station of this.chargingStations) {
      const zGap = Math.abs(station.group.position.z);
      const xGap = Math.abs(station.group.position.x - this.player.position.x);
      if (zGap < 4.2 && xGap < 4.8) { nearby = true; break; }
    }
    this.charging = nearby && this.battery < 100;
    if (this.charging) {
      this.chargeElapsed += dt;
      this.battery = Math.min(100, this.battery + 20 * dt); // 0–100% in five seconds.
    } else {
      this.chargeElapsed = 0;
      this.battery = Math.max(0, this.battery - (0.012 + Math.abs(this.speed) * 0.008) * dt);
    }
    if (this.battery <= 0 && !this.batteryEmpty) {
      this.batteryEmpty = true;
      this.speed = 0;
      this.input.clear();
    }
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
    // Original procedural Dhaka electric easybike. This is an in-house model,
    // not a downloaded Sketchfab asset or a pedal/cycle rickshaw.
    const frame = this.material(0x244f68, 0.52);
    const body = this.material(0xd94e46, 0.48);
    const bodyLight = this.material(0xf16b51, 0.48);
    const accent = this.material(0xf4c64e, 0.48);
    const cream = this.material(0xf1e6c9, 0.58);
    const rubber = this.material(0x202522, 0.96);
    const metal = this.material(0x8b9994, 0.42);
    const seat = this.material(0x463a32, 0.88);
    const dark = this.material(0x28312f, 0.86);
    const glass = new THREE.MeshStandardMaterial({ color: 0x8fc5d0, roughness: 0.18, metalness: 0.08, transparent: true, opacity: 0.58 });
    const skin = this.material(0xb97850);
    const shirt = this.material(0x28664f);

    const addBox = (w:number,h:number,d:number,mat:THREE.Material,x:number,y:number,z:number) => {
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(w,h,d),mat);
      mesh.position.set(x,y,z); mesh.castShadow=true; mesh.receiveShadow=true;
      this.player.add(mesh); return mesh;
    };
    const addSphere = (x:number,y:number,z:number,sx:number,sy:number,sz:number,mat:THREE.Material) => {
      const mesh = new THREE.Mesh(new THREE.SphereGeometry(1,16,12),mat);
      mesh.position.set(x,y,z); mesh.scale.set(sx,sy,sz); mesh.castShadow=true; mesh.receiveShadow=true;
      this.player.add(mesh); return mesh;
    };
    const addRod = (a:THREE.Vector3,b:THREE.Vector3,r:number,mat:THREE.Material) => {
      const delta=new THREE.Vector3().subVectors(b,a);
      const mesh=new THREE.Mesh(new THREE.CylinderGeometry(r,r,delta.length(),10),mat);
      mesh.position.copy(a).add(b).multiplyScalar(0.5);
      mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),delta.normalize());
      mesh.castShadow=true; this.player.add(mesh); return mesh;
    };
    const addWheel = (x:number,z:number,r:number,width:number) => {
      const tire=new THREE.Mesh(new THREE.CylinderGeometry(r,r,width,24),rubber);
      tire.rotation.z=Math.PI/2; tire.position.set(x,r,z); tire.castShadow=true; tire.receiveShadow=true; this.player.add(tire);
      const hub=new THREE.Mesh(new THREE.CylinderGeometry(r*0.38,r*0.38,width+0.035,16),accent);
      hub.rotation.z=Math.PI/2; hub.position.copy(tire.position); this.player.add(hub);
      const inner=new THREE.Mesh(new THREE.CylinderGeometry(r*0.2,r*0.2,width+0.05,12),metal);
      inner.rotation.z=Math.PI/2; inner.position.copy(tire.position); this.player.add(inner);
      const rim=new THREE.Mesh(new THREE.TorusGeometry(r*0.73,0.035,8,24),cream);
      rim.position.copy(tire.position); rim.rotation.y=Math.PI/2; this.player.add(rim);
      this.wheels.push(tire);
    };
    const addFender = (x:number,z:number,r:number,width:number,mat:THREE.Material) => {
      const arc = new THREE.Mesh(new THREE.TorusGeometry(r+0.035,0.075,8,28,Math.PI),mat);
      arc.rotation.set(Math.PI/2,0,Math.PI);
      arc.position.set(x,r,z);
      arc.scale.set(1,1,width/0.15);
      this.player.add(arc);
    };
    const addExtrudedSide = (x:number, mat:THREE.Material) => {
      const shape = new THREE.Shape();
      // Profile follows the raised rear passenger tub and sloping front footwell.
      shape.moveTo(0.10,0.70); shape.lineTo(1.72,0.70);
      shape.lineTo(1.72,1.52); shape.lineTo(1.48,1.58);
      shape.lineTo(1.28,1.30); shape.lineTo(0.34,1.30);
      shape.lineTo(0.10,1.08); shape.closePath();
      const geo = new THREE.ExtrudeGeometry(shape,{depth:0.09,bevelEnabled:true,bevelSegments:2,steps:1,bevelSize:0.035,bevelThickness:0.035});
      const panel = new THREE.Mesh(geo,mat);
      panel.rotation.y=x < 0 ? -Math.PI/2 : Math.PI/2;
      if (x > 0) panel.scale.x=-1;
      panel.position.set(x < 0 ? x-0.09 : x,0,0);
      panel.castShadow=true; panel.receiveShadow=true; this.player.add(panel);
    };

    // Chassis and suspension: one front steering wheel, twin rear drive wheels.
    addBox(1.58,0.2,2.9,frame,0,0.62,0.18);
    addBox(1.18,0.16,1.2,dark,0,0.52,0.72);
    addWheel(0,-1.22,0.39,0.22);
    addWheel(-0.88,0.94,0.45,0.22);
    addWheel(0.88,0.94,0.45,0.22);
    addFender(0,-1.22,0.43,0.22,body);
    addFender(-0.88,0.94,0.49,0.22,body);
    addFender(0.88,0.94,0.49,0.22,body);
    addRod(new THREE.Vector3(0,0.7,-1.22),new THREE.Vector3(0,1.22,-0.95),0.075,metal);
    addRod(new THREE.Vector3(-0.88,0.68,0.94),new THREE.Vector3(-0.58,0.82,0.56),0.055,metal);
    addRod(new THREE.Vector3(0.88,0.68,0.94),new THREE.Vector3(0.58,0.82,0.56),0.055,metal);

    // Sculpted front nose and mudguard, with layered painted fascia.
    addSphere(0,1.03,-1.02,0.72,0.48,0.38,body);
    addSphere(0,1.19,-1.18,0.63,0.3,0.22,bodyLight);
    addBox(1.32,0.12,0.16,accent,0,0.77,-1.37);
    addBox(1.08,0.07,0.12,cream,0,0.69,-1.39);
    addBox(0.72,0.16,0.07,dark,0,0.95,-1.405);
    for(const x of [-0.48,0.48]){
      const lamp=new THREE.Mesh(new THREE.CylinderGeometry(0.14,0.14,0.075,16),cream);
      lamp.rotation.x=Math.PI/2; lamp.position.set(x,1.12,-1.39); this.player.add(lamp);
      const lens=new THREE.Mesh(new THREE.CircleGeometry(0.105,16),this.material(0xfff3c2,0.22));
      lens.position.set(x,1.12,-1.435); this.player.add(lens);
      addBox(0.13,0.09,0.08,this.material(0xffa13a),x*1.45,0.98,-1.39);
    }
    // Windscreen and roofed driver canopy.
    const windshield=new THREE.Mesh(new THREE.PlaneGeometry(1.18,0.72),glass);
    windshield.position.set(0,1.77,-0.91); windshield.rotation.x=-0.12; this.player.add(windshield);
    for(const x of [-0.66,0.66]){
      addRod(new THREE.Vector3(x,1.25,-0.98),new THREE.Vector3(x,2.18,-0.78),0.045,frame);
    }
    addRod(new THREE.Vector3(-0.66,2.18,-0.78),new THREE.Vector3(0.66,2.18,-0.78),0.045,accent);
    addBox(1.56,0.11,0.52,accent,0,2.22,-0.63);
    addRod(new THREE.Vector3(0,1.55,-0.9),new THREE.Vector3(0,1.91,-0.77),0.055,metal);
    addRod(new THREE.Vector3(-0.43,1.91,-0.77),new THREE.Vector3(0.43,1.91,-0.77),0.045,dark);

    // Driver seat, torso, head, arms and simple clothing details.
    addBox(0.72,0.16,0.56,seat,0,1.1,-0.36);
    const driver=new THREE.Mesh(new THREE.CapsuleGeometry(0.23,0.48,4,8),shirt);
    driver.position.set(0,1.55,-0.43); driver.rotation.x=-0.12; this.player.add(driver);
    addSphere(0,1.98,-0.58,0.19,0.22,0.19,skin);
    addSphere(0,2.1,-0.57,0.2,0.11,0.2,dark);
    addRod(new THREE.Vector3(-0.18,1.7,-0.45),new THREE.Vector3(-0.39,1.88,-0.78),0.065,skin);
    addRod(new THREE.Vector3(0.18,1.7,-0.45),new THREE.Vector3(0.39,1.88,-0.78),0.065,skin);

    // Rear passenger cabin: deep lower tub, open window apertures, rails and roof.
    addBox(1.82,0.58,1.76,body,0,1.0,0.88);
    addExtrudedSide(-0.88,bodyLight);
    addExtrudedSide(0.79,body);
    addBox(1.65,0.12,1.45,seat,0,1.43,0.93);
    addBox(1.7,0.12,1.78,accent,0,1.61,0.88);
    // Three open passenger window bays per side, framed by slim metal pillars.
    for(const x of [-0.82,0.82]){
      addRod(new THREE.Vector3(x,1.56,0.08),new THREE.Vector3(x,2.53,0.08),0.045,frame);
      addRod(new THREE.Vector3(x,1.56,0.86),new THREE.Vector3(x,2.53,0.86),0.045,frame);
      addRod(new THREE.Vector3(x,1.56,1.65),new THREE.Vector3(x,2.53,1.65),0.045,frame);
      addRod(new THREE.Vector3(x,2.53,0.08),new THREE.Vector3(x,2.53,1.65),0.045,accent);
      addRod(new THREE.Vector3(x,1.58,0.08),new THREE.Vector3(x,1.58,1.65),0.04,cream);
      addBox(0.08,0.52,1.42,cream,x,1.98,0.88);
    }
    // Curved-looking canopy made from a shallow domed shell and painted edge trim.
    addSphere(0,2.56,0.9,1.02,0.15,1.04,this.material(0x16877e,0.5));
    addBox(1.98,0.1,1.94,accent,0,2.54,0.9);
    for(let stripe=0;stripe<8;stripe++){
      const stripeMat=this.material([0xffd34f,0xf6ead1,0x2876ad,0xf6ead1,0x61aa70,0xf6ead1,0xe45b43,0xf6ead1][stripe],0.48);
      addBox(0.2,0.025,1.76,stripeMat,-0.7+stripe*0.2,2.61,0.9);
    }
    // Passenger bench, backrest, rear step and tail-light cluster.
    addBox(1.42,0.15,0.5,seat,0,1.48,1.12);
    addBox(1.45,0.42,0.13,seat,0,1.77,1.66);
    addBox(1.2,0.1,0.34,frame,0,0.64,1.88);
    for(const x of [-0.72,0.72]){
      addBox(0.16,0.2,0.08,this.material(0xc94439),x,1.03,1.79);
      addBox(0.1,0.12,0.08,cream,x,0.83,1.8);
    }
    // Side mirrors, indicators, grab rails and ornamental pinstripes.
    for(const x of [-0.76,0.76]){
      addRod(new THREE.Vector3(x,1.77,-0.82),new THREE.Vector3(x*1.2,2.06,-0.7),0.025,frame);
      addSphere(x*1.2,2.08,-0.7,0.12,0.085,0.045,metal);
      addRod(new THREE.Vector3(x,1.28,0.02),new THREE.Vector3(x,1.28,1.62),0.025,accent);
      addBox(0.055,0.06,1.25,cream,x*1.02,1.22,0.84);
    }
    // Distinctive Bangladesh easybike side decals and front registration plate.
    addBox(0.06,0.18,0.68,accent,-0.94,1.13,0.86);
    addBox(0.06,0.18,0.68,accent,0.94,1.13,0.86);
    addBox(0.56,0.19,0.035,cream,0,0.86,-1.43);
    addBox(0.34,0.035,0.04,dark,0,0.86,-1.46);
  }

  private update(dt: number) {
    const controls: InputSnapshot = this.input.consume();
    if (this.finished || this.caught || this.batteryEmpty) return;
    this.elapsedSeconds += dt;
    const reverseAllowed = controls.reverse && this.distance > 0.05 && !controls.brake;
    const targetSpeed = controls.brake ? 0 : reverseAllowed ? -4 : controls.boost ? 24 : controls.accelerate ? 17 : 11;
    this.speed = THREE.MathUtils.damp(this.speed, targetSpeed, 2.4, dt);
    this.maxSpeed = Math.max(this.maxSpeed, Math.round(Math.abs(this.speed) * 8));
    this.steering = THREE.MathUtils.damp(this.steering, controls.steer, 6.5, dt);
    // Steering moves the vehicle continuously inside the current road corridor.
    // Keep the complete easybike footprint inside the narrowest connected road segment.
    this.lateralOffset = THREE.MathUtils.clamp(this.lateralOffset + this.steering * 3.8 * dt, -2.65, 2.65);
    this.player.rotation.z = THREE.MathUtils.damp(this.player.rotation.z, -this.steering * 0.11 + (this.crashTime > 0 ? this.crashRoll * Math.sin((this.crashTime / 0.55) * Math.PI) * 0.42 : 0), 7, dt);
    const roadAhead = getRoadPoint(this.roadState.edgeId, Math.min(1, this.roadState.edgeProgress + 0.06));
    const roadHeading = -Math.atan2(roadAhead.x - this.roadX, Math.max(0.001, roadAhead.distance - this.distance));
    this.player.rotation.y = THREE.MathUtils.damp(this.player.rotation.y, roadHeading - this.steering * 0.035, 5, dt);
    this.wheelRotation += this.speed * dt * 1.7;
    this.wheels.forEach(wheel => { wheel.rotation.x = this.wheelRotation; });
    const travel = this.speed * dt;
    const roadProgress = travel < 0 ? retreatRoad(this.roadState, -travel) : advanceRoad(this.roadState, travel, controls.steer);
    this.roadState = roadProgress;
    this.distance = roadProgress.distance;
    this.roadX = roadProgress.x;
    this.currentDistrict = this.distance < 112 ? 'ফার্মগেট' : this.distance < 202 ? 'শাহবাগ' : 'ধানমন্ডি';
    this.player.position.x = THREE.MathUtils.damp(this.player.position.x, this.roadX + this.lateralOffset, 7.2, dt);
    this.crashTime = Math.max(0, this.crashTime - dt);
    this.updateTraffic(dt);
    this.pedestrians.forEach(person => {
      if (person.knockedBack) return;
      const pedestrianDepth = Math.abs(person.group.position.z);
      person.group.visible = pedestrianDepth < 155;
      if (pedestrianDepth < 88) this.animatePerson(person, dt);
      person.walkPhase += dt * 0.72;
      // Pedestrians wander within the roadside shoulder instead of standing in place.
      const sideWalk = 3.75 + (person.spawnIndex % 3) * 0.24 + Math.sin(person.walkPhase) * 0.82;
      person.group.position.x = person.side * sideWalk;
      person.group.position.z += Math.sin(person.walkPhase * 0.62) * 0.22 * dt;
      person.group.rotation.y = person.side < 0 ? Math.PI / 2 : -Math.PI / 2;
    });
    this.marketPeople.forEach(person => {
      this.animatePerson(person, dt, false);
      if (person.activity === 'serve') {
        // Vendors make small repetitive serving gestures instead of freezing in place.
        const reach = Math.sin(person.phase * 0.8 + person.phaseOffset) * 0.28;
        person.rightArm.rotation.x = -0.72 + reach;
        person.leftArm.rotation.x = -0.28 - reach * 0.35;
        person.group.rotation.y = (person.baseX < 0 ? Math.PI / 2 : -Math.PI / 2)
          + Math.sin(person.phase * 0.45 + person.phaseOffset) * 0.045;
      } else {
        person.group.position.x = person.baseX + Math.sin(person.phase * 0.45 + person.phaseOffset) * 0.42;
        person.group.rotation.y = person.baseX < 0 ? -Math.PI / 2 : Math.PI / 2;
      }
    });
    this.updatePursuit(dt);
    this.updateChargingAndBattery(dt);
    this.finishLine.position.z += travel;
    this.chargingStations.forEach(station => { station.group.position.z = this.distance - station.distance; });
    this.movingWorld.forEach(object => {
      object.position.z += travel;
      if (object.position.z > 14) object.position.z -= object.userData.recycleDistance ?? 228;
      if (object.userData.environmentLod) {
        const shouldShow = Math.abs(object.position.z) < 145;
        if (object.userData.lodVisible !== shouldShow) {
          object.visible = shouldShow;
          object.userData.lodVisible = shouldShow;
        }
      }
    });
    this.updatePedestrianCollisions(dt);
    this.hornTime = controls.horn ? 0.24 : Math.max(0, this.hornTime - dt);
    this.clockLight.intensity = this.hornTime > 0 ? 2.5 : 0;
    this.collisionShake = Math.max(0,this.collisionShake - dt);
    const shake = this.collisionShake > 0 ? Math.sin(this.wheelRotation * 3.2) * this.collisionShake * 0.22 : 0;
    const speedCameraLift = Math.min(0.9, Math.abs(this.speed) * 0.035);
    const speedCameraPullback = Math.min(1.8, Math.abs(this.speed) * 0.07);
    const cameraPreset = this.cameraPresets[this.cameraMode];
    const desiredCameraX = this.player.position.x * 0.52 + cameraPreset.x;
    const desiredCameraY = cameraPreset.y + speedCameraLift * (this.cameraMode === 'close' ? 0.45 : 1);
    const desiredCameraZ = cameraPreset.z + speedCameraPullback * (this.cameraMode === 'close' ? 0.55 : 1);
    this.camera.position.x = THREE.MathUtils.damp(this.camera.position.x, desiredCameraX, 2.8, dt) + shake;
    this.camera.position.y = THREE.MathUtils.damp(this.camera.position.y, desiredCameraY, 2.2, dt);
    this.camera.position.z = THREE.MathUtils.damp(this.camera.position.z, desiredCameraZ, 2.2, dt);
    this.cameraLookTarget.x = THREE.MathUtils.damp(this.cameraLookTarget.x, this.player.position.x * 0.2 + cameraPreset.lookX, 3.0, dt);
    this.cameraLookTarget.y = THREE.MathUtils.damp(this.cameraLookTarget.y, cameraPreset.lookY, 2.5, dt);
    this.cameraLookTarget.z = THREE.MathUtils.damp(this.cameraLookTarget.z, cameraPreset.lookZ, 2.5, dt);
    this.camera.lookAt(this.cameraLookTarget);
    if (this.caught || this.batteryEmpty) {
      this.onStatus({ speed: 0, maxSpeed: this.maxSpeed, score: Math.floor(this.distance), elapsedSeconds: Math.floor(this.elapsedSeconds), steering: 0, hornFlash: false, boostActive: false, distance: Math.floor(this.distance), finished: false, caught: this.caught, pursuitActive: this.pursuitActive, currentDistrict: this.currentDistrict, roadX: this.roadX, battery: Math.round(this.battery), charging: this.charging, damage: Math.round(this.damage), batteryEmpty: this.batteryEmpty, totalDamageCost: this.totalDamageCost, collisionCount: this.collisionCount, damageBreakdown: this.damageBreakdown });
      return;
    }
    if (this.distance >= this.prototypeRouteLength) {
      this.finished = true;
      this.speed = 0;
      this.input.clear();
    }
    this.onStatus({ speed: Math.round(Math.abs(this.speed) * 8), maxSpeed: this.maxSpeed, score: Math.floor(this.distance), elapsedSeconds: Math.floor(this.elapsedSeconds), steering: Math.round(this.player.position.x * 10) / 10, hornFlash: this.hornTime > 0, boostActive: controls.boost, distance: Math.floor(this.distance), finished: this.finished, caught: this.caught, pursuitActive: this.pursuitActive, currentDistrict: this.currentDistrict, roadX: this.roadX, battery: Math.round(this.battery), charging: this.charging, damage: Math.round(this.damage), batteryEmpty: this.batteryEmpty, totalDamageCost: this.totalDamageCost, collisionCount: this.collisionCount, damageBreakdown: this.damageBreakdown });
  }

  private resize() {
    if (this.disposed) return;
    const width = Math.max(1, this.host.clientWidth);
    const height = Math.max(1, this.host.clientHeight);
    this.camera.aspect = width / height;
    this.camera.fov = this.cameraPresets[this.cameraMode].fov + (width < 500 ? 2 : 0);
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

  setTouch(key: 'left' | 'right' | 'accelerate' | 'reverse' | 'brake' | 'boost', pressed: boolean) {
    this.input.setTouch(key, pressed);
  }

  setCameraMode(mode: CameraMode) {
    this.cameraMode = mode;
    this.camera.fov = this.cameraPresets[mode].fov + (this.host.clientWidth < 500 ? 2 : 0);
    this.camera.updateProjectionMatrix();
  }

  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    this.loop.stop();
    this.resizeObserver.disconnect();
    this.input.dispose();
    // A geometry/material may be referenced by many meshes. Dispose each GPU
    // resource once rather than repeatedly disposing shared cached resources.
    const geometries = new Set<THREE.BufferGeometry>();
    const materials = new Set<THREE.Material>();
    this.scene.traverse(object => {
      if (object instanceof THREE.Mesh) {
        geometries.add(object.geometry);
        const meshMaterials = Array.isArray(object.material) ? object.material : [object.material];
        meshMaterials.forEach(material => materials.add(material));
      }
    });
    geometries.forEach(geometry => geometry.dispose());
    materials.forEach(material => material.dispose());
    this.boxGeometryCache.clear();
    this.trafficCylinderGeometryCache.clear();
    this.renderer.dispose();
    this.materialCache.clear();
    this.renderer.domElement.remove();
  }
}
