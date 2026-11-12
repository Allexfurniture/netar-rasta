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
    for (let i = 0; i < 9; i++) {
      const stripe = new THREE.Mesh(new THREE.BoxGeometry(0.48, 0.035, 5.2), this.material(0xf3ead4));
      stripe.position.set(-5.4 + i * 1.35, 0.045, z - 1.4);
      this.scene.add(stripe); this.movingWorld.push(stripe);
    }
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


    // Repeating Dhaka-style junctions give the route a recognizable urban rhythm.
    this.buildJunctionSet(-70, 'ফার্মগেট', 0xd7b15e);
    this.buildJunctionSet(-158, 'শাহবাগ', 0x5d9b79);
    this.buildJunctionSet(-246, 'ধানমন্ডি', 0xb96b54);

    // Overhead utility cables and roadside Bengali wayfinding signs.
    for (let i = 0; i < 8; i++) {
      const z = -22 - i * 29;
      const cable = new THREE.Mesh(
        new THREE.CylinderGeometry(0.018, 0.018, 22, 5),
        this.material(0x343a37, 0.9)
      );
      cable.rotation.z = Math.PI / 2;
      cable.position.set(0, 7.4 + (i % 2) * 0.35, z);
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
    this.buildSidewalkCrowd();
    this.buildRickshaw();
    this.buildFinishLine();
    this.player.position.set(0, 0, 0);
    this.scene.add(this.player);
    this.clockLight.position.set(0, 2.2, -0.8);
    this.player.add(this.clockLight);

    this.camera.position.set(0, 5.2, 9.2);
    this.camera.lookAt(0, 1.25, -7);
  }


  private buildStreetTraffic() {
    type TrafficKind = 'car' | 'cng' | 'bus' | 'bike' | 'auto' | 'rickshaw';
    const vehicle = (kind: TrafficKind, x: number, z: number, color: number) => {
      const group = new THREE.Group();
      const bodyMat = this.material(color, 0.58);
      const glassMat = new THREE.MeshStandardMaterial({ color: 0x8db9c1, roughness: 0.22, metalness: 0.1 });
      const black = this.material(0x202522, 0.96);
      const chrome = this.material(0xb9c4bb, 0.42);
      const addBox = (w:number,h:number,d:number,c:THREE.Material,px:number,py:number,pz:number) => {
        const mesh = new THREE.Mesh(new THREE.BoxGeometry(w,h,d),c);
        mesh.position.set(px,py,pz); mesh.castShadow = true; group.add(mesh); return mesh;
      };
      const wheel = (wx:number,wz:number,r=0.32) => {
        const tire = new THREE.Mesh(new THREE.CylinderGeometry(r,r,0.18,14),black);
        tire.rotation.z = Math.PI/2; tire.position.set(wx,r,wz); group.add(tire);
        const hub = new THREE.Mesh(new THREE.CylinderGeometry(r*0.35,r*0.35,0.2,10),chrome);
        hub.rotation.z = Math.PI/2; hub.position.copy(tire.position); group.add(hub);
      };
      if (kind === 'bus') {
        addBox(2.7,2.45,6.2,bodyMat,0,1.45,0);
        addBox(2.58,0.92,5.8,glassMat,0,2.05,-0.05);
        addBox(2.78,0.18,6.25,this.material(0xf1d79a),0,0.48,0);
        addBox(2.72,0.32,0.12,this.material(0x273d39),0,2.72,-3.12);
        for (let col=0; col<6; col++) addBox(0.36,0.58,0.05,glassMat,(col-2.5)*0.43,1.9,-3.13);
        for (const wx of [-1.18,1.18]) for (const wz of [-2.0,2.0]) wheel(wx,wz,0.42);
      } else if (kind === 'bike') {
        wheel(0,-0.78,0.31); wheel(0,0.82,0.31);
        addBox(0.32,0.5,1.05,bodyMat,0,0.82,0);
        addBox(0.54,0.12,0.42,black,0,1.13,0.18);
        addBox(0.52,0.09,0.08,chrome,0,1.25,-0.48);
      } else if (kind === 'auto') {
        // Battery-powered three-wheeler / easybike with roof and rear passenger bay.
        addBox(1.58,0.68,2.55,bodyMat,0,0.82,0.1);
        addBox(1.48,0.72,1.08,glassMat,0,1.55,-0.62);
        addBox(1.78,0.14,2.35,this.material(0xe8d5a0),0,2.12,0.25);
        addBox(1.5,0.1,1.0,this.material(0x4c514b),0,1.32,0.78);
        wheel(0,-1.05,0.38); wheel(-0.78,0.82,0.4); wheel(0.78,0.82,0.4);
        for (const wx of [-0.72,0.72]) {
          const support = new THREE.Mesh(new THREE.CylinderGeometry(0.035,0.035,0.92,7),chrome);
          support.position.set(wx,1.62,0.72); group.add(support);
        }
      } else if (kind === 'rickshaw') {
        // Pedal rickshaw used as ambient traffic, visually distinct from the player's easybike.
        wheel(0,-1.12,0.34); wheel(-0.78,0.78,0.4); wheel(0.78,0.78,0.4);
        addBox(1.58,0.52,1.5,this.material(0xc84e42),0,0.96,0.78);
        addBox(1.55,0.12,1.62,this.material(0x267e59),0,1.72,0.72);
        addBox(1.1,0.08,0.78,this.material(0xe8bd58),0,1.82,0.72);
        addBox(0.5,0.72,0.44,this.material(0x286b55),0,1.2,-0.42);
        const head = new THREE.Mesh(new THREE.SphereGeometry(0.16,10,8),this.material(0xb97850));
        head.position.set(0,1.7,-0.46); group.add(head);
      } else {
        const length = kind === 'cng' ? 2.7 : 3.4;
        if (kind === 'cng') {
          addBox(1.5,0.72,length,bodyMat,0,0.78,0.1);
          addBox(1.42,0.74,length*0.54,glassMat,0,1.48,-0.12);
          addBox(1.58,0.12,0.16,this.material(0xe7c75c),0,0.48,-length*0.48);
          wheel(-0.72,-0.78,0.31); wheel(0.72,-0.78,0.31); wheel(0,1.12,0.34);
        } else {
          addBox(1.9,0.82,length,bodyMat,0,0.78,0.1);
          addBox(1.78,0.82,length*0.56,glassMat,0,1.48,-0.12);
          addBox(1.85,0.16,0.18,this.material(0xe9d7a9),0,0.38,-length*0.42);
          for (const wx of [-0.82,0.82]) for (const wz of [-length*0.32,length*0.32]) wheel(wx,wz,0.34);
        }
      }
      group.position.set(x,0,z);
      this.scene.add(group); this.movingWorld.push(group);
    };
    const traffic: [TrafficKind,number,number,number][] = [
      ['bus',-3.1,-48,0x287b70], ['car',3.0,-66,0xe0a13d],
      ['auto',-3.0,-102,0x16845e], ['cng',3.1,-126,0x18875d],
      ['bike',-2.8,-146,0xc84b3e], ['rickshaw',3.0,-184,0x2d8c63],
      ['car',-3.2,-202,0x547ca0], ['bus',3.0,-230,0xd2a04f],
      ['auto',-3.0,-258,0xb74c42], ['cng',3.0,-282,0x277e68],
      ['rickshaw',-3.0,-306,0x2f9366], ['bike',3.0,-330,0xc84b3e],
    ];
    traffic.forEach(([kind,x,z,color]) => vehicle(kind,x,z,color));
  }

  private buildSidewalkCrowd() {
    for(let i=0;i<12;i++){
      const side=i%2===0?-1:1;
      const x=side*(9.0+(i%3)*0.45);
      const z=-24-i*18;
      const person=new THREE.Group();
      const shirt=this.material([0x2e8069,0xc65a49,0x426f9b,0xd39c43][i%4]);
      const skin=this.material(0xb97951);
      const body=new THREE.Mesh(new THREE.CapsuleGeometry(0.22,0.55,4,7),shirt);
      body.position.y=1.05; person.add(body);
      const head=new THREE.Mesh(new THREE.SphereGeometry(0.19,12,10),skin);
      head.position.set(0,1.55,-0.02); person.add(head);
      const legMat=this.material(0x343a3a);
      for(const lx of [-0.12,0.12]){
        const leg=new THREE.Mesh(new THREE.CylinderGeometry(0.065,0.075,0.58,7),legMat);
        leg.position.set(lx,0.38,0); person.add(leg);
      }
      const armMat=skin;
      for(const ax of [-0.28,0.28]){
        const arm=new THREE.Mesh(new THREE.CylinderGeometry(0.06,0.07,0.58,7),armMat);
        arm.position.set(ax,1.05,-0.02); arm.rotation.z=ax<0?-0.22:0.22; person.add(arm);
      }
      person.position.set(x,0,z);
      this.scene.add(person);
      this.movingWorld.push(person);
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
    // Bangladesh-style battery electric auto-rickshaw / easybike.
    // No bicycle frame, pedals, chain or cycle-rickshaw carriage.
    const frame = this.material(0x263c39, 0.58);
    const trim = this.material(0xd9c9a5, 0.48);
    const rubber = this.material(0x202523, 0.96);
    const glass = new THREE.MeshStandardMaterial({ color: 0x8ebbc4, roughness: 0.2, metalness: 0.12, transparent: true, opacity: 0.78 });
    const body = this.material(0x16845e, 0.48);
    const accent = this.material(0xe6bd58, 0.5);
    const dark = this.material(0x343b39, 0.82);

    const addBox = (w:number,h:number,d:number,color:THREE.Material,x:number,y:number,z:number) => {
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(w,h,d),color);
      mesh.position.set(x,y,z); mesh.castShadow=true; mesh.receiveShadow=true;
      this.player.add(mesh); return mesh;
    };
    const addRod = (a:THREE.Vector3,b:THREE.Vector3,r:number,mat:THREE.Material) => {
      const delta=new THREE.Vector3().subVectors(b,a);
      const mesh=new THREE.Mesh(new THREE.CylinderGeometry(r,r,delta.length(),8),mat);
      mesh.position.copy(a).add(b).multiplyScalar(0.5);
      mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),delta.normalize());
      mesh.castShadow=true; this.player.add(mesh); return mesh;
    };
    const addWheel = (x:number,z:number,r:number,width:number) => {
      const tire=new THREE.Mesh(new THREE.CylinderGeometry(r,r,width,20),rubber);
      tire.rotation.z=Math.PI/2; tire.position.set(x,r,z); tire.castShadow=true; this.player.add(tire);
      const hub=new THREE.Mesh(new THREE.CylinderGeometry(r*0.34,r*0.34,width+0.025,14),accent);
      hub.rotation.z=Math.PI/2; hub.position.copy(tire.position); this.player.add(hub);
      const rim=new THREE.Mesh(new THREE.TorusGeometry(r*0.7,0.035,7,20),trim);
      rim.position.copy(tire.position); rim.rotation.y=Math.PI/2; this.player.add(rim);
      this.wheels.push(tire);
    };

    // Low battery-vehicle chassis and three road wheels: one steerable front, two rear.
    addBox(1.72,0.24,2.65,frame,0,0.62,0.12);
    addWheel(0,-1.18,0.43,0.2);
    addWheel(-0.91,0.91,0.48,0.2);
    addWheel(0.91,0.91,0.48,0.2);

    // Front nose, bumper, fender, twin lamps and broad windscreen.
    addBox(1.35,0.94,0.34,body,0,1.05,-1.18);
    addBox(1.48,0.13,0.22,accent,0,0.66,-1.37);
    addBox(1.2,0.08,0.18,trim,0,0.72,-1.39);
    const windshield=addBox(1.28,0.78,0.055,glass,0,1.72,-1.08);
    windshield.rotation.x=-0.12;
    addRod(new THREE.Vector3(-0.72,1.28,-1.08),new THREE.Vector3(-0.72,2.08,-1.08),0.045,frame);
    addRod(new THREE.Vector3(0.72,1.28,-1.08),new THREE.Vector3(0.72,2.08,-1.08),0.045,frame);
    for(const x of [-0.48,0.48]){
      const lamp=new THREE.Mesh(new THREE.SphereGeometry(0.13,12,10),this.material(0xffe7a5,0.28));
      lamp.position.set(x,1.05,-1.38); this.player.add(lamp);
      const indicator=new THREE.Mesh(new THREE.BoxGeometry(0.16,0.1,0.08),this.material(0xf0a33c));
      indicator.position.set(x*1.45,0.98,-1.39); this.player.add(indicator);
    }
    // Handlebar steering assembly; deliberately no pedals or bicycle chain.
    addRod(new THREE.Vector3(0,1.55,-1.0),new THREE.Vector3(0,1.88,-0.92),0.055,trim);
    addRod(new THREE.Vector3(-0.42,1.88,-0.92),new THREE.Vector3(0.42,1.88,-0.92),0.045,frame);

    // Driver's enclosed/semi-open front cockpit and seat.
    addBox(0.78,0.16,0.62,dark,0,1.12,-0.42);
    const driverBody=new THREE.Mesh(new THREE.CapsuleGeometry(0.25,0.48,4,8),this.material(0x2c6c55));
    driverBody.position.set(0,1.55,-0.48); driverBody.rotation.x=-0.12; this.player.add(driverBody);
    const head=new THREE.Mesh(new THREE.SphereGeometry(0.22,14,12),this.material(0xb97850));
    head.position.set(0,2.0,-0.62); this.player.add(head);
    const hair=new THREE.Mesh(new THREE.SphereGeometry(0.22,12,8),dark);
    hair.scale.set(1,0.48,0.95); hair.position.set(0,2.12,-0.61); this.player.add(hair);
    addRod(new THREE.Vector3(-0.2,1.68,-0.52),new THREE.Vector3(-0.38,1.82,-0.9),0.065,this.material(0xb97850));
    addRod(new THREE.Vector3(0.2,1.68,-0.52),new THREE.Vector3(0.38,1.82,-0.9),0.065,this.material(0xb97850));

    // Rear passenger compartment: solid lower body, open side windows, bench and roof.
    addBox(1.88,0.72,1.72,body,0,1.08,0.88);
    addBox(1.72,0.16,1.42,this.material(0x563c30),0,1.5,0.92);
    addBox(1.78,0.14,1.82,accent,0,1.84,0.88);
    addBox(1.78,0.12,1.82,body,0,2.65,0.88);
    // Roof supports and open passenger windows are characteristic of local easybikes.
    for(const x of [-0.82,0.82]){
      addRod(new THREE.Vector3(x,1.42,0.02),new THREE.Vector3(x,2.65,0.02),0.045,frame);
      addRod(new THREE.Vector3(x,1.42,1.72),new THREE.Vector3(x,2.65,1.72),0.045,frame);
      addRod(new THREE.Vector3(x,2.65,0.02),new THREE.Vector3(x,2.65,1.72),0.045,accent);
      addBox(0.08,0.48,1.5,trim,x,1.95,0.88);
    }
    // Rear bench and seat back visible through the passenger opening.
    addBox(1.45,0.16,0.52,this.material(0x6d4936),0,1.72,1.05);
    addBox(1.48,0.5,0.14,this.material(0x704a37),0,1.98,1.62);
    // Decorative front roof visor, rear lamps and side running boards.
    addBox(1.96,0.12,0.36,accent,0,2.62,-0.98);
    addBox(0.16,0.22,0.08,this.material(0xc84638),-0.82,1.02,1.78);
    addBox(0.16,0.22,0.08,this.material(0xc84638),0.82,1.02,1.78);
    addBox(0.18,0.12,1.48,frame,-1.0,0.58,0.82);
    addBox(0.18,0.12,1.48,frame,1.0,0.58,0.82);
    // Small side mirrors.
    for(const x of [-0.76,0.76]){
      addRod(new THREE.Vector3(x,1.72,-0.95),new THREE.Vector3(x*1.18,2.02,-0.88),0.025,frame);
      const mirror=new THREE.Mesh(new THREE.BoxGeometry(0.18,0.13,0.06),trim);
      mirror.position.set(x*1.18,2.04,-0.88); this.player.add(mirror);
    }
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
