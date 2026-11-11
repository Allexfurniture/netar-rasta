# নেতার রাস্তা — 3D Game Design & Technical Specification

**Product:** নেতার রাস্তা (Netar Rasta)  
**Status:** 3D direction approved; prototype implementation in progress  
**Platform:** Mobile-first browser game  
**Mode:** Endless Survival  
**Language:** Bengali only  
**Rendering:** Real-time 3D  
**Camera:** Third-person chase camera behind the player's rickshaw  
**World:** Fictional, Dhaka-inspired connected city

This specification separates approved product requirements from unresolved balancing values. Anything marked TBD is not an approved gameplay value.

## 1. Product definition

A free-to-play, single-player browser game in which a guest player drives a rickshaw through a fictional Dhaka-inspired city and attempts to survive for as long as possible. The game targets portrait mobile browsers first, with desktop keyboard support for development and play.

The selected visual direction is a fully 3D world viewed from a third-person driving camera behind the rickshaw. This is a true 3D scene, not a 2D scene with perspective styling.

## 2. Confirmed product requirements

### Player and rickshaw
- One rickshaw is available at the start.
- Rickshaw colors may vary; the selection interaction is TBD.
- Speed increases as the run continues; final speed curve is TBD.
- Controls include steering, forward acceleration, reverse, and horn.
- Damage reduces rickshaw speed.
- Vehicle movement is constrained to the road network. The player can turn at junctions but cannot drive freely off-road.

### City and world
- The connected map includes Farmgate, Shahbagh, and Dhanmondi.
- All three areas are open from the start; no area unlock progression.
- Use major roads only.
- A minimap remains visible during active gameplay.
- Include bus stops, decorative traffic signals, and a Parliament landmark.
- The world is fictional and Dhaka-inspired, not an exact geographic navigation map.
- The road network must be shared by world navigation, traffic routing, and minimap rendering.

### Traffic, pedestrians, and pursuit
- Include recognizable Dhaka vehicle types with traffic AI.
- Pedestrians appear on sidewalks and roadside areas.
- Collision severity affects the reaction and damage.
- Crowd pursuit uses 5–10 chasers.
- The player can escape by driving faster.
- If caught, show a cartoon, non-graphic confrontation and then Game Over.
- No graphic violence or gore.

### Battery and charging
- Battery starts at 100%.
- Battery drains based on speed and distance.
- Roadside charging stations are placed in the world.
- Charging begins automatically when the rickshaw is within the effective station radius.
- An uninterrupted 0-to-100% charge takes 5 seconds.
- At 0%, the rickshaw stops and the run ends.
- Station radius, interruption, movement during charging, and station spacing remain TBD.

### Score and run summary
- Display the score with the ৳ symbol and BDT label.
- Virtual BDT is score only and has no real-world monetary value.
- It cannot be spent, transferred, withdrawn, purchased, or exchanged.
- Retain the score after Game Over.
- Game Over shows final score, virtual BDT, and maximum distance.

### Guest and leaderboard
- Guest play requires no mandatory registration.
- Cloud leaderboard is in scope.
- Backend validates every score submission; client-reported score is untrusted.
- Leaderboard submission must not block local play.

## 3. Explicit exclusions

Do not add unless the product owner changes the requirements:
- Passenger pickup/drop-off or passenger system.
- Missions, quests, or mission rewards.
- Background music.
- Rickshaw upgrades or upgrade economy.
- Virtual BDT spending, purchases, transfers, or withdrawals.
- Mandatory registration before play.
- Additional game modes.

Traffic and ambient sound effects are in scope. No audio assets have been supplied yet. Horn audio remains to be implemented when an approved sound asset is available.

## 4. Camera and visual direction

### Approved camera
- Third-person chase camera positioned behind and slightly above the rickshaw.
- Camera looks forward along the current road direction.
- Camera follows the rickshaw smoothly without disorienting snap movement.
- Camera must adapt to turns and maintain a readable view of upcoming road, traffic, and hazards.
- Camera controls are not a player-facing requirement for the initial mobile version; default follow behavior is sufficient.

### 3D presentation
- Fully 3D road surfaces, curbs, sidewalks, buildings, landmarks, rickshaw, traffic, pedestrians, and charging stations.
- Stylized, colorful, cartoon-like city art with non-graphic character reactions.
- Use level-of-detail, frustum culling, pooled traffic entities, and restrained shadow quality to preserve mobile frame rate.
- Target a stable 30 FPS baseline on supported mid-range mobile devices; higher refresh rates are optional and require device testing.
- WebGL is required. If unavailable, show a clear Bengali compatibility message rather than a blank screen.

## 5. Core gameplay loop

1. Guest starts an Endless Survival run.
2. Player drives the rickshaw along connected 3D roads.
3. Traffic and roadside pedestrians create navigation and collision pressure.
4. Speed and distance influence battery drain.
5. Player reaches roadside charging stations and receives automatic charging while in range.
6. Collisions increase damage; damage reduces available speed.
7. A pursuit event may begin; the player attempts to escape using speed and road navigation.
8. Battery depletion, being caught, or the approved damage failure condition ends the run.
9. Game Over displays final score, virtual BDT, and maximum distance.
10. Guest may submit a server-validated score to the cloud leaderboard.

## 6. Runtime state model

Use explicit states rather than loosely coupled booleans.

| State | Meaning | Expected transitions |
|---|---|---|
| READY | Start screen; no active simulation | PLAYING |
| PLAYING | 3D simulation and controls active | CHARGING, PURSUIT, PAUSED, GAME_OVER |
| CHARGING | Charging station is actively charging | PLAYING, PURSUIT, GAME_OVER |
| PURSUIT | Chasers are active; escape/caught rules are evaluated | PLAYING, GAME_OVER |
| PAUSED | Simulation and timers are frozen | Previous active state |
| GAME_OVER | Run finalized; result values immutable | READY / restart |

CHARGING and PURSUIT may be orthogonal gameplay flags layered over PLAYING if that keeps the runtime simpler. Observable behavior must remain deterministic.

## 7. Technical architecture

### Approved prototype stack
- React for menus, HUD, start screen, Game Over, and leaderboard UI.
- TypeScript for application and game logic.
- Vite for development and production bundling.
- Three.js for 3D rendering, scene graph, camera, meshes, materials, and WebGL lifecycle.

Phaser is no longer the selected rendering engine for this project. The 2D Phaser implementation is being replaced by Three.js.

### Suggested module boundaries
- src/game/three/ — renderer, camera, scene lifecycle, 3D presentation.
- src/game/config/ — approved gameplay configuration; prototype-only values clearly separated.
- src/game/world/ — road graph, 3D road geometry, landmarks, minimap projection.
- src/game/entities/ — rickshaw, traffic, pedestrians, chasers, charging stations.
- src/game/systems/ — movement, collision, damage, battery, scoring, pursuit, spawning.
- src/game/input/ — keyboard and touch input abstraction.
- src/services/ — guest session and leaderboard API boundary.
- src/ui/ — Bengali React screens and HUD.

React owns interface state. The 3D runtime owns per-frame simulation and rendering. Keep high-frequency frame state out of React; publish HUD snapshots at a limited update rate.

## 8. Road graph and 3D navigation

The map is a graph:
- Nodes represent junctions, intersections, and road endpoints.
- Edges represent traversable major road segments.
- Each edge contains normalized map geometry, width, direction rules, and lane data.
- The 3D world converts graph geometry into road meshes and roadside boundaries.
- The rickshaw stays within the active road corridor.
- At a junction, steering selects an available connected edge.
- Traffic agents use the same graph for legal routes.
- Minimap uses the same graph and player location as the 3D simulation.

Farmgate, Shahbagh, and Dhanmondi must be connected and accessible from the beginning. Existing normalized 2D graph coordinates are only a map-layout source; the runtime must render them as 3D world geometry.

## 9. System responsibilities

### 9.1 Vehicle movement and camera
- World-space vehicle movement follows road geometry and legal direction.
- Steering selects lanes and junction branches; it must not permit unrestricted off-road movement.
- Reverse must not add forward distance or score.
- Camera follows the player and rotates/leans subtly on turns without excessive motion.
- Touch and keyboard input must share the same input abstraction.

### 9.2 Traffic AI
Each traffic agent needs vehicle type, dimensions, current graph edge, direction, lane, target/current speed, following behavior, collision shape, and deterministic spawn/despawn rules. Pool entities to limit mobile allocation and garbage collection.

### 9.3 Pedestrians and crowd pursuit
Pedestrians occupy sidewalk/roadside zones. Pursuit is a separate event with 5–10 chasers and explicit trigger, chase, escape, and caught rules. The confrontation must be cartoon-like and non-graphic.

### 9.4 Collision and damage
Collision handling distinguishes severity. Damage affects rickshaw performance. Final severity categories, damage amounts, recovery policy, cap, and failure threshold are TBD. Collision response must be rate-limited so a persistent overlap cannot apply damage every frame.

### 9.5 Battery and charging
Battery drain depends on speed and distance. Charging starts automatically within station radius and takes exactly 5 seconds from 0% to 100% when uninterrupted. Leaving the radius, charging while moving, and multiple-station behavior require explicit rules and tests.

### 9.6 Score
Score and virtual BDT are the same non-monetary run score unless explicitly revised. The scoring curve must be deterministic and server-verifiable. No spending or conversion path may exist.

### 9.7 Guest and leaderboard
- Guest play starts without a registration form.
- Guest session uses a non-secret public identifier and a server-verifiable session credential.
- Backend rejects malformed, impossible, replayed, or out-of-range results.
- Store only the minimum required public leaderboard data.
- Never expose Supabase service-role credentials in browser code.
- Database tables and RPCs require explicit authorization checks and Row Level Security.
- No Supabase schema/migration has been applied; this specification does not authorize a database change.

## 10. Mobile, performance, and compatibility

- Portrait-first layout with comfortable touch targets.
- Touch controls release on pointer-up, pointer-cancel, pointer-leave, and window blur.
- Prevent page scrolling/zoom gestures from hijacking active controls where appropriate.
- Keep HUD legible at common mobile widths.
- Minimap remains visible during gameplay.
- Keyboard support remains available for desktop testing.
- Use bounded pixel ratio, pooled entities, and controlled shadow/lighting quality.
- Handle WebGL context loss and show a Bengali error state when 3D rendering cannot initialize.
- Avoid heavy asset downloads during an active run.
- Respect reduced-motion preferences for non-essential UI effects where practical.

## 11. Unresolved gameplay values — approval required

| Decision | Required definition |
|---|---|
| Speed curve | Initial speed, acceleration/growth rate, maximum speed |
| Damage performance | Speed reduction per damage level; damage cap and failure threshold |
| Collision severity | Contact categories and reaction/damage for each |
| Battery drain | Base drain and speed/distance contribution |
| Charging station | Effective radius, placement frequency, entering/leaving behavior |
| Charging interruption | Whether charge pauses immediately outside radius; whether driving remains enabled |
| Pursuit trigger | Time-, collision-, or distance-based trigger |
| Pursuit tuning | Chaser count within 5–10, chase speed, catch distance, escape duration/speed |
| Score curve | Contribution of distance, survival time, and other approved events |
| Pause/resume | Pause availability and browser backgrounding behavior |
| Guest lifecycle | Guest ID/session lifetime and refresh/device behavior |
| Leaderboard policy | Submission limits, display name rules, ranking period, tie-breaker |
| Rickshaw colors | Random assignment or player selection |

Do not silently promote prototype tuning values to final game balance.

## 12. Current 3D prototype status and known gaps

The current Three.js prototype now renders the starter connected road graph as 3D road ribbons, follows a graph edge in a third-person chase camera, chooses a legal outgoing edge at junctions, displays a persistent Bengali minimap driven by the same graph coordinates, and places basic landmark props. It also retains procedural rickshaw/traffic meshes, touch/keyboard controls, provisional collision/damage, speed, distance, score, battery HUD, and start/Game Over screens.

It is not the completed game. Outstanding work:
- Replace the straight prototype corridor with the full connected 3D road graph.
- Implement junction turns and a persistent minimap.
- Build final Farmgate, Shahbagh, Dhanmondi, Parliament landmark, bus stops, and decorative signals.
- Implement proper Dhaka vehicle models and road-graph traffic AI.
- Add pedestrians, 5–10 chaser pursuit, and caught/escape outcomes.
- Replace provisional collision and battery values with approved balancing.
- Implement exact 5-second charging rule with map-based station radius.
- Add horn and traffic sound effects when assets are supplied.
- Implement guest sessions, cloud leaderboard, and server-side score validation.
- Complete mobile browser QA, performance profiling, and accessibility checks.

## 13. Development sequence

1. Complete the Three.js third-person vertical slice and validate build/runtime.
2. Convert the connected road graph into 3D road geometry and implement junction navigation.
3. Implement minimap and final city layout/landmarks.
4. Implement traffic AI, pedestrians, collision severity, and damage effects.
5. Implement battery and map-based charging stations.
6. Implement pursuit, escape, and caught/Game Over behavior.
7. Approve and implement final score/balance values.
8. Implement guest identity and backend-validated leaderboard.
9. Add audio assets and optimize mobile performance.
10. Run automated tests, device QA, and deployment verification.

## 14. Change control

- Third-person 3D camera and Three.js rendering direction are approved.
- Confirmed product requirements and exclusions remain binding.
- TBD gameplay values remain open until approved.
- Supabase migrations, schema changes, and production database actions require explicit authorization.
- Development work stays on a feature branch and is reviewed through a pull request.
- Do not merge to main or promote Production without explicit approval.
