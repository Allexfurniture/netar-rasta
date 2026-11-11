import * as THREE from 'three';

export type DrivingSnapshot = {
  distance: number;
  score: number;
  battery: number;
  damage: number;
  speed: number;
  ended: boolean;
};

export type DrivingInput = {
  left: boolean;
  right: boolean;
  forward: boolean;
  reverse: boolean;
  horn: boolean;
};

// Temporary prototype tuning only. These values are not approved final game balance.
const PROTOTYPE = {
  baseSpeed: 19,
  maxSpeed: 39,
  accelerationPerSecond: 0.48,
  batteryDrainPerSecond: 0.34,
  collisionDamage: 18,
  playerSteerSpeed: 8.5,
  roadHalfWidth: 7.2,
};

type TrafficActor = {
  group: THREE.Group;
  speed: number;
  lane: number;
  hit: boolean;
};

export class DrivingScene {
  private renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera = new THREE.PerspectiveCamera(62, 1, 0.1, 500);
  private clock = new THREE.Clock();
  private player = new THREE.Group();
  private traffic: TrafficActor[] = [];
  private buildings: THREE.Group[] = [];
  private input: DrivingInput = { left: false, right: false, forward: false, reverse: false, horn: false };
  private animationFrame = 0;
  private elapsed = 0;
  private distance = 0;
  private score = 0;
  private battery = 100;
  private damage = 0;
  private speed = PROTOTYPE.baseSpeed;
  private ended = false;
  private lastHudAt = 0;
  private onHud: (snapshot: DrivingSnapshot) => void;
  private host: HTMLElement;
  private disposed = false;
  private roadMarkers: THREE.Mesh[] = [];
  private chargingStation: THREE.Group;
  private hornLight: THREE.PointLight;

  constructor(host: HTMLElement, onHud: (snapshot: DrivingSnapshot) => void) {
    this.host = host;
    this.onHud = onHud;
    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.6));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.setClearColor(0x9bc9d7);
    this.host.appendChild(this.renderer.domElement);

    this.scene.background = new THREE.Color(0x9bc9d7);
    this.scene.fog = new THREE.Fog(0x9bc9d7, 75, 220);
    this.camera.position.set(0, 5.2, 10.5);
    this.camera.lookAt(0, 1.1, -7);

    this.addLighting();
    this.addCityEnvironment();
    this.addRoad();
    this.addRickshaw();
    this.addTraffic();
    this.chargingStation = this.makeChargingStation();
    this.chargingStation.position.set(-9.5, 0, -35);
    this.scene.add(this.chargingStation);
    this.hornLight = new THREE.PointLight(0xffd76a, 0, 8);
    this.hornLight.position.set(0, 2.3, -1.3);
    this.player.add(this.hornLight);

    this.resize();
    window.addEventListener('resize', this.resize);
    this.animationFrame = window.requestAnimationFrame(this.animate);
  }

  setInput(key: keyof DrivingInput, down: boolean) {
    this.input[key] = down;
  }

  private addLighting() {
    const hemi = new THREE.HemisphereLight(0xe7f5ff, 0x52604c, 2.1);
    this.scene.add(hemi);
    const sun = new THREE.DirectionalLight(0xfff1d5, 2.5);
    sun.position.set(-22, 34, 18);
    sun.castShadow = true;
    sun.shadow.mapSize.set(1024, 1024);
    sun.shadow.camera.left = -35;
    sun.shadow.camera.right = 35;
    sun.shadow.camera.top = 35;
    sun.shadow.camera.bottom = -35;
    this.scene.add(sun);
  }

  private addCityEnvironment() {
    const ground = new THREE.Mesh(
      new THREE.PlaneGeometry(260, 300),
      new THREE.MeshStandardMaterial({ color: 0x71956d, roughness: 1 }),
    );
    ground.rotation.x = -Math.PI / 2;
    ground.position.set(0, -0.14, -95);
    ground.receiveShadow = true;
    this.scene.add(ground);

    const random = (seed: number) => {
      const value = Math.sin(seed * 127.1 + 311.7) * 43758.5453;
      return value - Math.floor(value);
    };

    for (let side = -1; side <= 1; side += 2) {
      for (let index = 0; index < 18; index += 1) {
        const height = 5 + random(index + side * 31) * 18;
        const width = 4.5 + random(index + side * 71) * 5;
        const depth = 5 + random(index + side * 97) * 6;
        const group = new THREE.Group();
        const material = new THREE.MeshStandardMaterial({
          color: [0xd9c7a8, 0xb7c6bf, 0xd5d8d1, 0xc6b7a2][index % 4],
          roughness: 0.92,
        });
        const building = new THREE.Mesh(new THREE.BoxGeometry(width, height, depth), material);
        building.position.y = height / 2;
        building.castShadow = true;
        building.receiveShadow = true;
        group.add(building);

        const floors = Math.max(2, Math.floor(height / 2.4));
        for (let floor = 0; floor < floors; floor += 1) {
          for (let column = 0; column < 2; column += 1) {
            const windowMesh = new THREE.Mesh(
              new THREE.BoxGeometry(0.72, 0.82, 0.08),
              new THREE.MeshStandardMaterial({ color: 0x56727a, roughness: 0.45, metalness: 0.12 }),
            );
            windowMesh.position.set((column - 0.5) * width * 0.42, 1.4 + floor * 2.25, depth / 2 + 0.05);
            group.add(windowMesh);
          }
        }

        group.position.set(side * (13 + random(index + 12) * 9), 0, -index * 12 - 10);
        this.scene.add(group);
        this.buildings.push(group);
      }
    }

    // Trees and roadside poles add scale and a recognizable city-street rhythm.
    for (let index = 0; index < 22; index += 1) {
      for (const side of [-1, 1]) {
        const tree = new THREE.Group();
        const trunk = new THREE.Mesh(
          new THREE.CylinderGeometry(0.18, 0.25, 2.3, 7),
          new THREE.MeshStandardMaterial({ color: 0x76543a }),
        );
        trunk.position.y = 1.15;
        const crown = new THREE.Mesh(
          new THREE.SphereGeometry(1.35, 9, 7),
          new THREE.MeshStandardMaterial({ color: index % 2 ? 0x3d8050 : 0x548b51 }),
        );
        crown.position.y = 3;
        tree.add(trunk, crown);
        tree.position.set(side * 10.2, 0, -index * 10 - 7);
        this.scene.add(tree);
      }
    }
  }

  private addRoad() {
    const asphalt = new THREE.Mesh(
      new THREE.PlaneGeometry(15, 300),
      new THREE.MeshStandardMaterial({ color: 0x343b3d, roughness: 0.96 }),
    );
    asphalt.rotation.x = -Math.PI / 2;
    asphalt.position.set(0, 0, -95);
    asphalt.receiveShadow = true;
    this.scene.add(asphalt);

    const sidewalkMaterial = new THREE.MeshStandardMaterial({ color: 0xaaa99e, roughness: 1 });
    for (const side of [-1, 1]) {
      const sidewalk = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.24, 300), sidewalkMaterial);
      sidewalk.position.set(side * 8.6, 0.02, -95);
      sidewalk.receiveShadow = true;
      this.scene.add(sidewalk);
    }

    const lineMaterial = new THREE.MeshStandardMaterial({ color: 0xf5e7a9, emissive: 0x322d16 });
    for (const x of [-2.5, 2.5]) {
      for (let index = 0; index < 22; index += 1) {
        const marker = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.025, 3.1), lineMaterial);
        marker.position.set(x, 0.025, -index * 9);
        this.scene.add(marker);
        this.roadMarkers.push(marker);
      }
    }

    const curbMaterial = new THREE.MeshStandardMaterial({ color: 0xe6dfca });
    for (const side of [-1, 1]) {
      const curb = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.25, 300), curbMaterial);
      curb.position.set(side * 7.55, 0.1, -95);
      this.scene.add(curb);
    }
  }

  private addRickshaw() {
    const frame = new THREE.MeshStandardMaterial({ color: 0x1b2924, metalness: 0.25, roughness: 0.6 });
    const green = new THREE.MeshStandardMaterial({ color: 0x15965b, roughness: 0.72 });
    const yellow = new THREE.MeshStandardMaterial({ color: 0xf2c94c, roughness: 0.55 });
    const black = new THREE.MeshStandardMaterial({ color: 0x15191a, roughness: 0.9 });
    const seat = new THREE.MeshStandardMaterial({ color: 0x8d3529, roughness: 0.8 });

    const chassis = new THREE.Mesh(new THREE.BoxGeometry(1.35, 0.35, 2.2), frame);
    chassis.position.y = 0.72;
    chassis.castShadow = true;
    this.player.add(chassis);

    const cabin = new THREE.Mesh(new THREE.BoxGeometry(1.45, 1.05, 1.15), green);
    cabin.position.set(0, 1.28, 0.35);
    cabin.castShadow = true;
    this.player.add(cabin);

    const canopy = new THREE.Mesh(new THREE.BoxGeometry(1.62, 0.16, 1.42), yellow);
    canopy.position.set(0, 1.92, 0.35);
    canopy.castShadow = true;
    this.player.add(canopy);

    const back = new THREE.Mesh(new THREE.BoxGeometry(1.18, 0.72, 0.16), seat);
    back.position.set(0, 1.42, 0.9);
    this.player.add(back);

    const frontPanel = new THREE.Mesh(new THREE.BoxGeometry(0.95, 0.75, 0.16), yellow);
    frontPanel.position.set(0, 1.08, -0.9);
    this.player.add(frontPanel);

    const wheelGeometry = new THREE.CylinderGeometry(0.36, 0.36, 0.18, 16);
    for (const position of [[-0.77, 0.42, -0.72], [0.77, 0.42, -0.72], [0, 0.42, 1.02]] as const) {
      const wheel = new THREE.Mesh(wheelGeometry, black);
      wheel.rotation.z = Math.PI / 2;
      wheel.position.set(position[0], position[1], position[2]);
      wheel.castShadow = true;
      this.player.add(wheel);
    }

    const lamp = new THREE.Mesh(
      new THREE.SphereGeometry(0.12, 10, 8),
      new THREE.MeshStandardMaterial({ color: 0xfff2b2, emissive: 0xffcf61, emissiveIntensity: 0.8 }),
    );
    lamp.position.set(0, 1.05, -1.02);
    this.player.add(lamp);

    this.player.position.set(0, 0, 1);
    this.scene.add(this.player);
  }

  private makeTrafficVehicle(color: number): THREE.Group {
    const vehicle = new THREE.Group();
    const body = new THREE.Mesh(
      new THREE.BoxGeometry(1.55, 1.05, 2.7),
      new THREE.MeshStandardMaterial({ color, roughness: 0.7 }),
    );
    body.position.y = 0.85;
    body.castShadow = true;
    vehicle.add(body);
    const roof = new THREE.Mesh(
      new THREE.BoxGeometry(1.35, 0.68, 1.45),
      new THREE.MeshStandardMaterial({ color: 0x9eb7bc, roughness: 0.42, metalness: 0.12 }),
    );
    roof.position.set(0, 1.58, 0.08);
    vehicle.add(roof);
    const wheelMaterial = new THREE.MeshStandardMaterial({ color: 0x171a1b });
    for (const x of [-0.82, 0.82]) {
      for (const z of [-0.82, 0.82]) {
        const wheel = new THREE.Mesh(new THREE.CylinderGeometry(0.27, 0.27, 0.14, 12), wheelMaterial);
        wheel.rotation.z = Math.PI / 2;
        wheel.position.set(x, 0.38, z);
        vehicle.add(wheel);
      }
    }
    return vehicle;
  }

  private addTraffic() {
    const colors = [0xc74d3e, 0xd6a93d, 0x397da5, 0x4b6657, 0x9c9c91, 0x8c5940];
    for (let index = 0; index < 7; index += 1) {
      const lane = [-4.8, 0, 4.8][index % 3];
      const group = this.makeTrafficVehicle(colors[index % colors.length]);
      group.position.set(lane, 0, -24 - index * 23);
      this.scene.add(group);
      this.traffic.push({ group, speed: 8 + (index % 3) * 2.4, lane, hit: false });
    }
  }

  private makeChargingStation() {
    const station = new THREE.Group();
    const base = new THREE.Mesh(
      new THREE.BoxGeometry(1.5, 1.8, 1.1),
      new THREE.MeshStandardMaterial({ color: 0x247b57, roughness: 0.65 }),
    );
    base.position.y = 0.9;
    base.castShadow = true;
    station.add(base);
    const sign = new THREE.Mesh(
      new THREE.BoxGeometry(1.1, 0.55, 0.08),
      new THREE.MeshStandardMaterial({ color: 0xc5ef7d, emissive: 0x426b20, emissiveIntensity: 0.45 }),
    );
    sign.position.set(0, 1.35, -0.58);
    station.add(sign);
    const label = new THREE.Mesh(
      new THREE.BoxGeometry(0.12, 0.35, 0.1),
      new THREE.MeshStandardMaterial({ color: 0x183d2d }),
    );
    label.position.set(0, 1.35, -0.64);
    station.add(label);
    return station;
  }

  private resize = () => {
    if (this.disposed) return;
    const width = Math.max(1, this.host.clientWidth);
    const height = Math.max(1, this.host.clientHeight);
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(width, height, false);
  };

  private animate = () => {
    if (this.disposed) return;
    this.animationFrame = window.requestAnimationFrame(this.animate);
    const delta = Math.min(this.clock.getDelta(), 0.04);
    if (!this.ended) this.update(delta);
    this.renderer.render(this.scene, this.camera);
  };

  private update(delta: number) {
    this.elapsed += delta;
    const steering = (this.input.right ? 1 : 0) - (this.input.left ? 1 : 0);
    const throttle = this.input.reverse ? -0.42 : this.input.forward ? 1 : 0.7;
    this.speed = Math.min(PROTOTYPE.maxSpeed, this.speed + PROTOTYPE.accelerationPerSecond * delta);
    const effectiveSpeed = Math.max(0, this.speed * throttle * (1 - this.damage * 0.004));
    this.player.position.x = THREE.MathUtils.clamp(
      this.player.position.x + steering * PROTOTYPE.playerSteerSpeed * delta,
      -PROTOTYPE.roadHalfWidth + 1.2,
      PROTOTYPE.roadHalfWidth - 1.2,
    );
    this.player.rotation.z = THREE.MathUtils.damp(this.player.rotation.z, -steering * 0.12, 7, delta);

    const forwardDistance = Math.max(0, effectiveSpeed) * delta;
    this.distance += forwardDistance * 0.62;
    this.score += forwardDistance * 0.45;
    this.battery = Math.max(0, this.battery - PROTOTYPE.batteryDrainPerSecond * (0.45 + effectiveSpeed / PROTOTYPE.maxSpeed) * delta);

    // Move traffic and roadside scenery toward the player to create forward travel.
    for (const actor of this.traffic) {
      actor.group.position.z += (effectiveSpeed - actor.speed) * delta;
      if (actor.group.position.z > 12) {
        actor.group.position.z = -150 - Math.random() * 35;
        actor.lane = [-4.8, 0, 4.8][Math.floor(Math.random() * 3)];
        actor.group.position.x = actor.lane;
        actor.hit = false;
      }
      const dx = Math.abs(actor.group.position.x - this.player.position.x);
      const dz = Math.abs(actor.group.position.z - this.player.position.z);
      if (dx < 1.25 && dz < 2.1 && !actor.hit) {
        actor.hit = true;
        this.damage = Math.min(100, this.damage + PROTOTYPE.collisionDamage);
        actor.group.position.z = -150;
        this.player.position.x = THREE.MathUtils.clamp(this.player.position.x + (this.player.position.x < actor.group.position.x ? -1.2 : 1.2), -5.5, 5.5);
      }
    }

    for (const building of this.buildings) {
      building.position.z += effectiveSpeed * delta * 0.72;
      if (building.position.z > 18) building.position.z -= 216;
    }
    for (const marker of this.roadMarkers) {
      marker.position.z += effectiveSpeed * delta;
      if (marker.position.z > 12) marker.position.z -= 198;
    }

    this.chargingStation.position.z += effectiveSpeed * delta;
    if (this.chargingStation.position.z > 12) this.chargingStation.position.z = -210;
    const stationNear = Math.abs(this.chargingStation.position.z - this.player.position.z) < 4
      && Math.abs(this.chargingStation.position.x - this.player.position.x) < 3;
    if (stationNear) this.battery = Math.min(100, this.battery + 20 * delta);

    this.camera.position.x = THREE.MathUtils.damp(this.camera.position.x, this.player.position.x * 0.42, 3.5, delta);
    this.camera.position.y = THREE.MathUtils.damp(this.camera.position.y, 5.2, 3, delta);
    this.camera.position.z = THREE.MathUtils.damp(this.camera.position.z, this.player.position.z + 10.5, 4, delta);
    this.camera.lookAt(this.player.position.x * 0.25, 1.1, this.player.position.z - 7.5);

    this.hornLight.intensity = this.input.horn ? 4.5 : THREE.MathUtils.damp(this.hornLight.intensity, 0, 12, delta);

    if (this.battery <= 0 || this.damage >= 100) this.finish();
    if (this.elapsed - this.lastHudAt >= 0.1) {
      this.onHud({
        distance: Math.floor(this.distance),
        score: Math.floor(this.score),
        battery: Math.round(this.battery),
        damage: Math.round(this.damage),
        speed: Math.round(effectiveSpeed * 3.6),
        ended: this.ended,
      });
      this.lastHudAt = this.elapsed;
    }
  }

  private finish() {
    this.ended = true;
    this.onHud({
      distance: Math.floor(this.distance),
      score: Math.floor(this.score),
      battery: Math.round(this.battery),
      damage: Math.round(this.damage),
      speed: Math.round(this.speed * 3.6),
      ended: true,
    });
  }

  dispose() {
    this.disposed = true;
    window.cancelAnimationFrame(this.animationFrame);
    window.removeEventListener('resize', this.resize);
    this.scene.traverse((object) => {
      if (object instanceof THREE.Mesh) {
        object.geometry.dispose();
        const materials = Array.isArray(object.material) ? object.material : [object.material];
        materials.forEach((material) => material.dispose());
      }
    });
    this.renderer.dispose();
    this.renderer.domElement.remove();
  }
}
