import * as THREE from 'three';
import { STARTER_ROAD_GRAPH, type RoadGraph } from '../world/roadGraph';
import { getAvailableRoads, getDirectedGeometry, type DirectedRoad, type Point2D } from '../world/roadNavigation';

export type DrivingSnapshot = {
  distance: number; score: number; battery: number; damage: number; speed: number; ended: boolean;
  mapX: number; mapY: number; district: string;
};
export type DrivingInput = { left: boolean; right: boolean; forward: boolean; reverse: boolean; horn: boolean };
const TUNING = { baseSpeed: 12, maxSpeed: 24, acceleration: 0.22, drain: 0.22, collisionDamage: 18, mapScale: 150, roadWidthScale: 150 };
type TrafficActor = { mesh: THREE.Group; road: DirectedRoad; progress: number; speed: number; hit: boolean };
type RoadRuntime = { road: DirectedRoad; points: Point2D[]; lengths: number[]; total: number };

export class DrivingScene {
  private renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera = new THREE.PerspectiveCamera(62, 1, 0.1, 500);
  private clock = new THREE.Clock();
  private player = new THREE.Group();
  private traffic: TrafficActor[] = [];
  private input: DrivingInput = { left: false, right: false, forward: false, reverse: false, horn: false };
  private animationFrame = 0;
  private elapsed = 0;
  private distance = 0;
  private score = 0;
  private battery = 100;
  private damage = 0;
  private speed = TUNING.baseSpeed;
  private ended = false;
  private lastHudAt = 0;
  private onHud: (snapshot: DrivingSnapshot) => void;
  private host: HTMLElement;
  private disposed = false;
  private chargingStations: THREE.Group[] = [];
  private hornLight!: THREE.PointLight;
  private graph: RoadGraph = STARTER_ROAD_GRAPH;
  private roads: RoadRuntime[] = [];
  private currentRoad!: RoadRuntime;
  private progress = 0;
  private mapPoint: Point2D = { x: 0.16, y: 0.18 };
  private district = 'ফার্মগেট';
  private junctionCooldown = 0;
  private roadMaterials: THREE.MeshStandardMaterial[] = [];

  constructor(host: HTMLElement, onHud: (snapshot: DrivingSnapshot) => void) {
    this.host = host; this.onHud = onHud;
    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
    this.renderer.shadowMap.enabled = true; this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace; this.renderer.setClearColor(0x9bc9d7);
    this.host.appendChild(this.renderer.domElement);
    this.scene.background = new THREE.Color(0x9bc9d7);
    this.scene.fog = new THREE.Fog(0x9bc9d7, 90, 280);
    this.camera.position.set(-48, 20, -27);
    this.addLighting(); this.addWorldGround(); this.buildRoadNetwork(); this.addCityProps(); this.addRickshaw(); this.addTraffic();
    this.currentRoad = this.roads.find((r) => r.road.edge.id === 'farmgate-crossing' && !r.road.reversed)!;
    this.progress = 0.02; this.updatePlayerPose(0);
    this.hornLight = new THREE.PointLight(0xffd76a, 0, 8); this.hornLight.position.set(0, 2.3, -1.3); this.player.add(this.hornLight);
    this.resize(); window.addEventListener('resize', this.resize); this.animationFrame = window.requestAnimationFrame(this.animate);
  }

  setInput(key: keyof DrivingInput, down: boolean) { this.input[key] = down; }

  private worldPoint(p: Point2D): THREE.Vector3 {
    return new THREE.Vector3((p.x - 0.5) * TUNING.mapScale, 0, (p.y - 0.5) * TUNING.mapScale);
  }
  private addLighting() {
    this.scene.add(new THREE.HemisphereLight(0xe7f5ff, 0x52604c, 2));
    const sun = new THREE.DirectionalLight(0xfff1d5, 2.4); sun.position.set(-60, 90, 50); sun.castShadow = true;
    sun.shadow.mapSize.set(1024, 1024); sun.shadow.camera.left = -110; sun.shadow.camera.right = 110;
    sun.shadow.camera.top = 110; sun.shadow.camera.bottom = -110; this.scene.add(sun);
  }
  private addWorldGround() {
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(260, 260), new THREE.MeshStandardMaterial({ color: 0x78966d, roughness: 1 }));
    ground.rotation.x = -Math.PI / 2; ground.position.y = -0.2; ground.receiveShadow = true; this.scene.add(ground);
  }
  private makeRoadRuntime(road: DirectedRoad): RoadRuntime {
    const points = getDirectedGeometry(road);
    const lengths: number[] = []; let total = 0;
    for (let i = 1; i < points.length; i++) { const len = Math.hypot(points[i].x - points[i-1].x, points[i].y - points[i-1].y); lengths.push(len); total += len; }
    return { road, points, lengths, total };
  }
  private sample(runtime: RoadRuntime, amount: number): { position: THREE.Vector3; tangent: THREE.Vector3 } {
    const target = THREE.MathUtils.clamp(amount, 0, 1) * runtime.total;
    let remaining = target;
    for (let i = 0; i < runtime.lengths.length; i++) {
      const len = runtime.lengths[i];
      if (remaining <= len || i === runtime.lengths.length - 1) {
        const a = runtime.points[i], b = runtime.points[i+1], t = len === 0 ? 0 : remaining / len;
        const p = { x: THREE.MathUtils.lerp(a.x,b.x,t), y: THREE.MathUtils.lerp(a.y,b.y,t) };
        const tangent = this.worldPoint(b).sub(this.worldPoint(a)).normalize();
        return { position: this.worldPoint(p), tangent };
      }
      remaining -= len;
    }
    const last = runtime.points[runtime.points.length - 1];
    return { position: this.worldPoint(last), tangent: new THREE.Vector3(0,0,1) };
  }
  private buildRoadNetwork() {
    const asphalt = new THREE.MeshStandardMaterial({ color: 0x343b3d, roughness: 0.96 });
    const shoulder = new THREE.MeshStandardMaterial({ color: 0xb6b1a1, roughness: 1 });
    const marking = new THREE.MeshStandardMaterial({ color: 0xf3e5a5, emissive: 0x292516 });
    for (const edge of this.graph.edges) {
      const directed: DirectedRoad = { edge, from: edge.from, to: edge.to, reversed: false };
      const runtime = this.makeRoadRuntime(directed); this.roads.push(runtime);
      const verts: number[] = []; const indices: number[] = [];
      const half = edge.width * TUNING.roadWidthScale * 0.5;
      for (let i = 0; i < runtime.points.length; i++) {
        const p = this.worldPoint(runtime.points[i]);
        const before = this.worldPoint(runtime.points[Math.max(0, i-1)]);
        const after = this.worldPoint(runtime.points[Math.min(runtime.points.length-1, i+1)]);
        const tangent = after.sub(before).normalize(); const normal = new THREE.Vector3(-tangent.z,0,tangent.x);
        const left = p.clone().addScaledVector(normal, half), right = p.clone().addScaledVector(normal, -half);
        verts.push(left.x,0.015,left.z,right.x,0.015,right.z);
        if (i > 0) { const n=i*2; indices.push(n-2,n-1,n,n-1,n+1,n); }
      }
      const geometry = new THREE.BufferGeometry(); geometry.setAttribute('position',new THREE.Float32BufferAttribute(verts,3)); geometry.setIndex(indices); geometry.computeVertexNormals();
      const mesh = new THREE.Mesh(geometry,asphalt); mesh.receiveShadow=true; this.scene.add(mesh);
      this.roadMaterials.push(asphalt);
      // Thin edge strips make road boundaries readable without creating extra navigable space.
      for (const side of [-1,1]) {
        const points: THREE.Vector3[] = runtime.points.map((_,i) => {
          const p=this.worldPoint(runtime.points[i]); const a=this.worldPoint(runtime.points[Math.max(0,i-1)]); const b=this.worldPoint(runtime.points[Math.min(runtime.points.length-1,i+1)]);
          const tangent=b.sub(a).normalize(); return p.add(new THREE.Vector3(-tangent.z,0,tangent.x).multiplyScalar(half*side));
        });
        const line = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points),Math.max(8,points.length*8),0.09,5,false),shoulder);
        line.position.y=0.06; this.scene.add(line);
      }
      // Dashed centre line.
      const curvePoints = runtime.points.map(p=>this.worldPoint(p)); const curve=new THREE.CatmullRomCurve3(curvePoints);
      const line = new THREE.Mesh(new THREE.TubeGeometry(curve,Math.max(12,curvePoints.length*12),0.035,4,false),marking);
      line.position.y=0.045; this.scene.add(line);
    }
  }
  private addCityProps() {
    const palette=[0xd8c8ad,0xb8c8c0,0xd5d8d1,0xc8b7a2];
    for (let i=0;i<26;i++) {
      const x=(i%7)*31-93, z=Math.floor(i/7)*43-78;
      const nearRoad=this.roads.some(r=>r.points.some(p=>{const q=this.worldPoint(p);return Math.hypot(q.x-x,q.z-z)<13;}));
      if(nearRoad) continue;
      const h=8+(i*17%19), w=7+(i*7%6);
      const building=new THREE.Mesh(new THREE.BoxGeometry(w,h,8),new THREE.MeshStandardMaterial({color:palette[i%palette.length],roughness:0.9}));
      building.position.set(x,h/2,z);building.castShadow=true;building.receiveShadow=true;this.scene.add(building);
      for(let f=0;f<Math.floor(h/3);f++) for(let c=-1;c<=1;c++) {
        const win=new THREE.Mesh(new THREE.BoxGeometry(0.9,0.9,0.08),new THREE.MeshStandardMaterial({color:0x58747a,roughness:0.5}));
        win.position.set(x+c*2,h/2-h/2+1.7+f*2.5,z+4.05);this.scene.add(win);
      }
    }
    for(const landmark of this.graph.landmarks) {
      const p=this.worldPoint({x:landmark.x,y:landmark.y});
      if(landmark.kind==='parliament') {
        const base=new THREE.Mesh(new THREE.CylinderGeometry(5,6,2,8),new THREE.MeshStandardMaterial({color:0xd8d0bc}));
        base.position.set(p.x,1,p.z);base.castShadow=true;this.scene.add(base);
        const dome=new THREE.Mesh(new THREE.ConeGeometry(4,5,8),new THREE.MeshStandardMaterial({color:0xc6b99f}));
        dome.position.set(p.x,4.5,p.z);this.scene.add(dome);
      } else {
        const pole=new THREE.Mesh(new THREE.BoxGeometry(0.18,3,0.18),new THREE.MeshStandardMaterial({color:0x454b49}));
        pole.position.set(p.x,1.5,p.z);this.scene.add(pole);
        const prop=new THREE.Mesh(new THREE.BoxGeometry(landmark.kind==='bus-stop'?2.4:0.8,0.65,0.35),new THREE.MeshStandardMaterial({color:landmark.kind==='bus-stop'?0x267b59:0xd34d3d}));
        prop.position.set(p.x,3,p.z);this.scene.add(prop);
      }
    }
    for(const node of this.graph.nodes) {
      if(node.kind==='junction') {
        const p=this.worldPoint(node); const signal=new THREE.Mesh(new THREE.BoxGeometry(0.35,2.6,0.35),new THREE.MeshStandardMaterial({color:0x454b49}));
        signal.position.set(p.x+5,1.3,p.z+4);this.scene.add(signal);
      }
    }
    const station=this.makeChargingStation(); const stationNode=this.graph.nodes.find(n=>n.id==='shahbagh-central')!;
    station.position.copy(this.worldPoint(stationNode)); station.position.x+=3.5; this.scene.add(station); this.chargingStations.push(station);
  }
  private makeChargingStation() {
    const group=new THREE.Group();
    const base=new THREE.Mesh(new THREE.BoxGeometry(1.6,1.8,1.2),new THREE.MeshStandardMaterial({color:0x247b57}));
    base.position.y=0.9;base.castShadow=true;group.add(base);
    const sign=new THREE.Mesh(new THREE.BoxGeometry(1.2,0.55,0.1),new THREE.MeshStandardMaterial({color:0xc5ef7d,emissive:0x426b20}));
    sign.position.set(0,1.5,-0.65);group.add(sign);return group;
  }
  private addRickshaw() {
    const frame=new THREE.MeshStandardMaterial({color:0x1b2924,metalness:0.25,roughness:0.6});
    const green=new THREE.MeshStandardMaterial({color:0x15965b,roughness:0.72});
    const yellow=new THREE.MeshStandardMaterial({color:0xf2c94c,roughness:0.55});
    const black=new THREE.MeshStandardMaterial({color:0x15191a,roughness:0.9});
    const chassis=new THREE.Mesh(new THREE.BoxGeometry(1.35,0.35,2.2),frame);chassis.position.y=0.72;chassis.castShadow=true;this.player.add(chassis);
    const cabin=new THREE.Mesh(new THREE.BoxGeometry(1.45,1.05,1.15),green);cabin.position.set(0,1.28,0.35);cabin.castShadow=true;this.player.add(cabin);
    const canopy=new THREE.Mesh(new THREE.BoxGeometry(1.62,0.16,1.42),yellow);canopy.position.set(0,1.92,0.35);this.player.add(canopy);
    const wheelGeo=new THREE.CylinderGeometry(0.36,0.36,0.18,16);
    for(const pos of [[-0.77,0.42,-0.72],[0.77,0.42,-0.72],[0,0.42,1.02]] as const){const wheel=new THREE.Mesh(wheelGeo,black);wheel.rotation.z=Math.PI/2;wheel.position.set(...pos);this.player.add(wheel);}
    this.player.position.set(0,0,0);this.scene.add(this.player);
  }
  private makeTrafficVehicle(color:number) {
    const group=new THREE.Group();const body=new THREE.Mesh(new THREE.BoxGeometry(1.6,1.1,2.8),new THREE.MeshStandardMaterial({color,roughness:0.75}));
    body.position.y=0.85;body.castShadow=true;group.add(body);
    const roof=new THREE.Mesh(new THREE.BoxGeometry(1.35,0.65,1.5),new THREE.MeshStandardMaterial({color:0x9eb7bc}));roof.position.set(0,1.6,0);group.add(roof);return group;
  }
  private addTraffic() {
    const candidates=this.roads.filter(r=>r.road.edge.id!=='farmgate-crossing');
    const colors=[0xc74d3e,0xd6a93d,0x397da5,0x4b6657,0x9c9c91,0x8c5940];
    for(let i=0;i<9;i++){
      const road=candidates[i%candidates.length];const mesh=this.makeTrafficVehicle(colors[i%colors.length]);
      const progress=0.18+(i%4)*0.19;const sample=this.sample(road,progress);mesh.position.copy(sample.position);mesh.position.y=0;mesh.rotation.y=Math.atan2(sample.tangent.x,sample.tangent.z);this.scene.add(mesh);
      this.traffic.push({mesh,road,progress,speed:0.025+(i%3)*0.008,hit:false});
    }
  }
  private updatePlayerPose(delta:number) {
    const pose=this.sample(this.currentRoad,this.progress);this.player.position.copy(pose.position);this.player.position.y=0;
    const heading=Math.atan2(pose.tangent.x,pose.tangent.z);
    this.player.rotation.y=heading;
    const side=new THREE.Vector3(pose.tangent.z,0,-pose.tangent.x);
    const steer=(this.input.right?1:0)-(this.input.left?1:0);
    this.player.position.addScaledVector(side,steer*0.7);
    this.mapPoint={x:THREE.MathUtils.clamp(pose.position.x/TUNING.mapScale+0.5,0,1),y:THREE.MathUtils.clamp(pose.position.z/TUNING.mapScale+0.5,0,1)};
    const node=this.graph.nodes.find(n=>n.id===this.currentRoad.road.to);if(node?.district)this.district=node.district==='farmgate'?'ফার্মগেট':node.district==='shahbagh'?'শাহবাগ':'ধানমন্ডি';
    const behind=pose.tangent.clone().multiplyScalar(-11);const cameraTarget=pose.position.clone().add(new THREE.Vector3(0,1.2,0));
    const desired=pose.position.clone().add(behind).add(new THREE.Vector3(0,6.2,0));
    this.camera.position.lerp(desired,1-Math.exp(-3.2*delta));this.camera.lookAt(cameraTarget.clone().add(pose.tangent.clone().multiplyScalar(8)));
  }
  private chooseNextRoad() {
    const nodeId=this.currentRoad.road.to;const choices=getAvailableRoads(this.graph,nodeId).filter(r=>!(r.edge.id===this.currentRoad.road.edge.id&&r.to===this.currentRoad.road.from));
    if(!choices.length)return;
    const previous=this.sample(this.currentRoad,1).tangent;
    const intent=(this.input.right?1:0)-(this.input.left?1:0);
    const scored=choices.map(choice=>{
      const runtime=this.makeRoadRuntime(choice);const tangent=this.sample(runtime,0.02).tangent;
      const cross=previous.x*tangent.z-previous.z*tangent.x;
      const dot=previous.dot(tangent);
      return {runtime,score:dot+intent*cross*1.7};
    }).sort((a,b)=>b.score-a.score);
    this.currentRoad=scored[0].runtime;this.progress=0;this.junctionCooldown=0.8;
  }
  private animate=()=>{
    if(this.disposed)return;this.animationFrame=window.requestAnimationFrame(this.animate);
    const delta=Math.min(this.clock.getDelta(),0.04);if(!this.ended)this.update(delta);this.renderer.render(this.scene,this.camera);
  };
  private update(delta:number) {
    this.elapsed+=delta;this.junctionCooldown=Math.max(0,this.junctionCooldown-delta);
    const steering=(this.input.right?1:0)-(this.input.left?1:0);
    this.speed=Math.min(TUNING.maxSpeed,this.speed+TUNING.acceleration*delta);
    const signedSpeed=this.speed*(this.input.reverse?-0.38:1)*(1-this.damage*0.004);
    const forward=Math.max(0,signedSpeed)*delta;this.distance+=forward*0.62;this.score+=forward*0.45;
    const worldLength=this.currentRoad.total*TUNING.mapScale;
    this.progress+=signedSpeed*delta/Math.max(1,worldLength);
    if(this.progress>=1){this.progress=1;this.updatePlayerPose(delta);if(this.junctionCooldown<=0)this.chooseNextRoad();}
    if(this.progress<0){this.progress=0;}
    this.battery=Math.max(0,this.battery-TUNING.drain*(0.45+Math.abs(signedSpeed)/TUNING.maxSpeed)*delta);
    this.updatePlayerPose(delta);
    for(const actor of this.traffic){
      actor.progress+=actor.speed*delta;
      if(actor.progress>1)actor.progress=0;
      const pose=this.sample(actor.road,actor.progress);actor.mesh.position.copy(pose.position);actor.mesh.position.y=0;
      actor.mesh.rotation.y=Math.atan2(pose.tangent.x,pose.tangent.z);
      if(!actor.hit&&actor.mesh.position.distanceTo(this.player.position)<2.2){actor.hit=true;this.damage=Math.min(100,this.damage+TUNING.collisionDamage);}
      if(actor.mesh.position.distanceTo(this.player.position)>8)actor.hit=false;
    }
    for(const station of this.chargingStations){if(station.position.distanceTo(this.player.position)<4)this.battery=Math.min(100,this.battery+20*delta);}
    this.hornLight.intensity=this.input.horn?4.5:THREE.MathUtils.damp(this.hornLight.intensity,0,12,delta);
    if(this.battery<=0||this.damage>=100)this.finish();
    if(this.elapsed-this.lastHudAt>=0.1){this.publish(false);this.lastHudAt=this.elapsed;}
  }
  private publish(ended:boolean){this.onHud({distance:Math.floor(this.distance),score:Math.floor(this.score),battery:Math.round(this.battery),damage:Math.round(this.damage),speed:Math.round(Math.abs(this.speed)*3.6),ended,mapX:this.mapPoint.x,mapY:this.mapPoint.y,district:this.district});}
  private finish(){this.ended=true;this.publish(true);}
  private resize=()=>{if(this.disposed)return;const w=Math.max(1,this.host.clientWidth),h=Math.max(1,this.host.clientHeight);this.camera.aspect=w/h;this.camera.updateProjectionMatrix();this.renderer.setSize(w,h,false);};
  dispose(){this.disposed=true;window.cancelAnimationFrame(this.animationFrame);window.removeEventListener('resize',this.resize);this.scene.traverse(o=>{if(o instanceof THREE.Mesh){o.geometry.dispose();const mats=Array.isArray(o.material)?o.material:[o.material];mats.forEach(m=>m.dispose());}});this.renderer.dispose();this.renderer.domElement.remove();}
}