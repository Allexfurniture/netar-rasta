# নেতার রাস্তা — 3D Game Design & Technical Specification

**Product:** নেতার রাস্তা (Netar Rasta)  
**Status:** 3D direction approved; prototype implementation in progress  
**Platform:** Mobile-first browser game  
**Mode:** Finish Line Route Run  
**Language:** Bengali only  
**Rendering:** Real-time 3D  
**Camera:** Third-person chase camera behind the player's rickshaw  
**World:** Fictional, Dhaka-inspired connected city

This specification separates approved product requirements from unresolved balancing values. Anything marked TBD is not an approved gameplay value.

## 1. Product definition

A free-to-play, single-player browser game in which a guest player drives a rickshaw through a fictional Dhaka-inspired city and attempts to complete a defined route and reach its finish line before the pursuers catch the driver. The game targets portrait mobile browsers first, with desktop keyboard support for development and play.

The selected visual direction is a fully 3D world viewed from a third-person driving camera behind the rickshaw. This is a true 3D scene, not a 2D scene with perspective styling.

## 2. Confirmed product requirements

### Player and rickshaw
- One rickshaw is available at the start.
- Rickshaw colors may vary; the selection interaction is TBD.
- Speed increases as the run continues; final speed curve is TBD.
- Touch controls are button-only: LEFT, RIGHT, GO, REV, HORN, and BOOST. Do not render a steering wheel or virtual joystick.
- LEFT/RIGHT buttons steer; GO accelerates; REV reverses; HORN triggers the horn; BOOST temporarily increases speed while held/active.
- Desktop keyboard support remains available for testing.
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
- If caught before reaching the finish line, show a cartoon, non-graphic confrontation and then Game Over.
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
- Award a configurable virtual BDT score for eligible vehicle collision events; persistent overlap must not repeatedly farm rewards. Collision reward eligibility, cooldown, and amount are TBD.
- Reaching the designated finish line ends the run successfully and shows a Victory result. Being caught before the finish line, battery depletion, or an approved failure condition ends the run unsuccessfully.
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

Traffic, engine, horn, boost, collision, and pursuit reaction sound effects are in scope. No audio assets have been supplied; original WebAudio-generated effects may be used, initialized only after a user gesture. No background music.

## 4. Camera and visual direction

### Approved camera
- Third-person chase camera positioned behind and slightly above the rickshaw.
- Camera looks forward along the current road direction.
- Camera follows the rickshaw smoothly without disorienting snap movement.
- Camera must adapt to turns and maintain a readable view of upcoming road, traffic, and hazards.
- Camera controls are not a player-facing requirement for the initial mobile version; default follow behavior is sufficient.

### 3D presentation
- Fully 3D road surfaces, curbs, sidewalks, buildings, landmarks, rickshaw, traffic, pedestrians, and charging stations.
- Art direction is stylized 3D cartoon realism: recognizable real-world Bangladeshi cycle-rickshaw proportions and decoration, expressive driver/pedestrian characters, saturated but balanced colors, detailed street furniture, and non-graphic reactions.
- The player rickshaw must read clearly as a Bangladesh pedal rickshaw: single bicycle front wheel/fork/handlebar, twin rear carriage wheels, passenger seat/body, decorated fabric canopy, metal frame, headlamp, mudguards, painted motifs, and a visible driver.
- Streets must feel inhabited, not like empty box-building corridors: varied shopfronts with Bengali signboards, awnings, balconies, windows, roadside stalls, trees, utility poles/wires, street lamps, buses, cars, CNGs, motorcycles, other rickshaws, and pedestrians.
- Buildings must have varied silhouettes and facade details; avoid repeated plain cuboids as the dominant visual element.
- Use a warm Dhaka daylight palette, readable road markings, sidewalks, curbs, crossings, and recognizable roadside clutter while preserving mobile performance.
- Use level-of-detail, frustum culling, pooled traffic entities, and restrained shadow quality to preserve mobile frame rate.
- Target a stable 30 FPS baseline on supported mid-range mobile devices; higher refresh rates are optional and require device testing.
- WebGL is required. If unavailable, show a clear Bengali compatibility message rather than a blank screen.

## 5. Core gameplay loop

1. Guest starts a Route Run with a defined finish line.
2. Player drives the rickshaw along connected 3D roads.
3. Traffic and roadside pedestrians create navigation and collision pressure.
4. Speed and distance influence battery drain.
5. Player reaches roadside charging stations and receives automatic charging while in range.
6. Collisions increase damage; damage reduces available speed.
7. A pursuit event may begin; the player attempts to escape using speed and road navigation.
8. Reaching the finish line ends the run as Victory; being caught before the finish line, battery depletion, or the approved damage failure condition ends it as Game Over.
9. Victory/Game Over displays final score, virtual BDT, and maximum distance.
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
| VICTORY | Finish line reached; result values immutable | READY / restart |
| GAME_OVER | Run failed; result values immutable | READY / restart |

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
Score and virtual BDT are the same non-monetary run score unless explicitly revised. The scoring curve must be deterministic and server-verifiable. Eligible vehicle collisions may award virtual BDT with anti-farming cooldown/unique-event handling. No spending or conversion path may exist.

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
| Score curve | Contribution of distance, survival time, and eligible collision rewards |
| BOOST tuning | Speed multiplier/increment, activation behavior, duration, cooldown, and energy interaction |
| Route finish | Route path, finish-line location, and any route checkpoint rules |
| Collision rewards | Eligible vehicle contact classes, reward amount, cooldown, and anti-farming validation |
| Audio | Original/supplied sound design, levels, and mobile performance |
| Pause/resume | Pause availability and browser backgrounding behavior |
| Guest lifecycle | Guest ID/session lifetime and refresh/device behavior |
| Leaderboard policy | Submission limits, display name rules, ranking period, tie-breaker |
| Rickshaw colors | Random assignment or player selection |

Do not silently promote prototype tuning values to final game balance.

## 12. Current 3D prototype status and known gaps

The current Three.js prototype renders the starter connected road graph as 3D road ribbons, follows graph edges in a third-person chase camera, selects connected roads at junctions, and displays a persistent Bengali minimap driven by the same graph coordinates. Traffic now includes pooled-at-startup prototype agents representing buses, cars, CNGs, rickshaws, and motorcycles. Each agent follows directed graph edges, selects a connected outgoing edge at junctions, maintains a basic same-edge following headway, uses a lane offset, and participates in rate-limited player collision handling. Basic landmark props, touch/keyboard controls, provisional driving balance, battery HUD, and start/Game Over screens remain.

It is not the completed game. The initial visual blockout has been upgraded with a detailed procedural Bangladesh cycle-rickshaw silhouette, visible driver, decorated canopy, varied shopfront facades, roadside trees/stalls, and illustrative traffic/pedestrian set dressing. These are still prototype geometry, not final production art. Outstanding work:
- Replace the straight prototype corridor with the full connected 3D road graph.
- Implement junction turns and a persistent minimap.
- Build final Farmgate, Shahbagh, Dhanmondi, Parliament landmark, bus stops, and decorative signals.
- Replace procedural blockout vehicle/character meshes with quality production assets or artist-authored models; refine traffic AI with hands-on validation, lane discipline at junctions, and robust multi-agent collision avoidance.
- Add pedestrians, 5–10 chaser pursuit, and caught/escape outcomes.
- Replace provisional collision and battery values with approved balancing.
- Implement exact 5-second charging rule with map-based station radius.
- Add horn, engine, traffic pass-by, collision, boost, and pursuit reaction sound effects.
- Implement guest sessions, cloud leaderboard, and server-side score validation.
- Complete mobile browser QA, performance profiling, and accessibility checks.

## 13. Development sequence

1. Complete the Three.js third-person vertical slice and validate build/runtime.
2. Define the Route Run path, finish-line trigger, button-only touch control layout, BOOST behavior, and Victory/Game Over transitions.
3. Convert the connected road graph into 3D road geometry and implement junction navigation.
4. Implement minimap and final city layout/landmarks.
5. Implement traffic AI, pedestrians, collision severity, damage effects, and collision score rewards.
6. Implement battery and map-based charging stations.
7. Implement pursuit, escape, caught/Game Over, and finish-line Victory behavior.
8. Approve and implement final score/balance values.
9. Implement guest identity and backend-validated leaderboard.
10. Add audio assets/generated effects and optimize mobile performance.
11. Run automated tests, device QA, and deployment verification.

## 14. Change control

- Third-person 3D camera and Three.js rendering direction are approved.
- Confirmed product requirements and exclusions remain binding.
- On 2026-11-12, the product owner replaced Endless Survival with a finite Route Run featuring a finish-line Victory condition; being caught before the finish line is a failure.
- On 2026-11-12, touch controls were confirmed as on-screen buttons only; no steering wheel or virtual joystick.
- On 2026-11-12, the product owner rejected the plain blockout visuals and requested a lively, recognizable, Dhaka-inspired 3D cartoon scene and a more authentic Bangladesh rickshaw; this visual direction is now explicit.
- TBD gameplay values remain open until approved.
- Supabase migrations, schema changes, and production database actions require explicit authorization.
- Development work stays on a feature branch and is reviewed through a pull request.
- Do not merge to main or promote Production without explicit approval.
