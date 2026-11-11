# Netar Rasta — Game Design & Technical Specification

**Status:** Phase 1 — foundational specification  
**Product:** নেতার রাস্তা (Netar Rasta)  
**Platform:** Mobile-first browser game  
**Primary mode:** Endless Survival  
**Language:** Bengali only  
**Perspective:** 2D top-down cartoon  
**World:** Fictional, Dhaka-inspired connected road network

This document records confirmed product decisions and separates unresolved balancing decisions from implementation assumptions. Values marked **TBD** must not be treated as approved gameplay rules.

## 1. Product definition

Netar Rasta is a free-to-play, single-player, guest-accessible browser game. The player drives a rickshaw through a fictional Dhaka-inspired city and attempts to survive for as long as possible. The game is designed primarily for portrait mobile screens.

### Product principles
- Immediate play: no mandatory account creation or registration.
- Endless Survival is the only game mode.
- Bengali is the only player-facing language.
- The game is cartoon-style and non-graphic.
- Virtual BDT is a score display only. It has no real-world monetary value and cannot be spent, transferred, withdrawn, or purchased.
- The core challenge comes from traffic, collisions, damage, battery depletion, charging opportunities, and pursuit pressure.
- A guest may submit a validated score to a cloud leaderboard; leaderboard submission must not block local play.

## 2. Confirmed scope

### Player and rickshaw
- One rickshaw is available at the start.
- Rickshaw colors may vary; the final selection interaction is not yet decided.
- Speed increases as the run continues.
- Controls include steering, forward acceleration, reverse, and horn.
- Damage reduces rickshaw speed.
- Movement is constrained to the road network. The player may turn at junctions but cannot drive freely off-road.

### City and map
- The initial interconnected map includes Farmgate, Shahbagh, and Dhanmondi.
- All three areas are available from the beginning; there is no area unlock progression.
- Roads are limited to major roads.
- A minimap remains visible during play.
- Include bus stops, decorative traffic signals, and a Parliament landmark.
- The world is fictional and Dhaka-inspired; it is not intended to be a geographically exact navigation map.

### Traffic, pedestrians, and pursuit
- Traffic includes recognizable Dhaka vehicle types.
- Traffic vehicles use AI movement and collision behavior.
- Pedestrians appear on sidewalks and roadside areas.
- Collision severity affects the reaction.
- A pursuit/crowd event involves 5–10 chasers.
- The player can escape by driving faster.
- If caught, show a cartoon, non-graphic confrontation and then Game Over.
- No graphic violence or gore.

### Battery and charging
- Battery starts at 100%.
- Battery drains based on speed and distance.
- Roadside charging stations are placed on the map.
- Charging starts automatically when the rickshaw is within the station's effective range.
- A fully depleted battery stops the rickshaw and ends the run.
- Charging from 0% to 100% takes 5 seconds.

### Score and run summary
- Display score using the ৳ symbol and BDT label.
- Virtual BDT is a non-monetary score only.
- The score is retained after Game Over.
- Game Over shows final score, virtual BDT, and maximum distance.

### Identity and leaderboard
- Guest identity is supported; registration is not mandatory.
- Cloud leaderboard is supported.
- Score submission is validated by the backend.
- Client-provided score values must never be trusted as authoritative.

## 3. Explicit exclusions

Do not add any of the following unless the product owner changes the requirements:
- Passenger pickup/drop-off or passenger system.
- Missions, quests, or mission rewards.
- Background music.
- Rickshaw upgrades or upgrade economy.
- Virtual BDT spending, purchases, transfers, or withdrawals.
- Mandatory registration before play.
- Additional game modes.

Traffic and ambient sound effects are in scope, but no audio assets have been supplied yet. The horn must ultimately produce an appropriate sound effect; the current visual-only horn feedback is prototype behavior, not final behavior.

## 4. Core gameplay loop

1. A guest starts a new Endless Survival run.
2. The player steers the rickshaw along connected roads.
3. Traffic and roadside pedestrians create navigation and collision pressure.
4. Speed and distance influence battery consumption.
5. The player reaches roadside charging stations and receives automatic charging while in range.
6. Collisions increase damage; damage reduces available speed.
7. A pursuit event may begin. The player attempts to escape by maintaining sufficient speed and navigating the road network.
8. Battery depletion, being caught, or the approved damage failure condition ends the run.
9. Game Over displays the final score, virtual BDT, and maximum distance.
10. The guest may submit a server-validated score to the leaderboard.

## 5. Gameplay state model

The runtime should use explicit states rather than loosely coupled booleans.

| State | Meaning | Expected transitions |
|---|---|---|
| READY | Start screen; no active simulation | PLAYING |
| PLAYING | Simulation and controls active | CHARGING, PURSUIT, PAUSED, GAME_OVER |
| CHARGING | Charging station is actively charging the battery; driving may continue unless later balancing rules say otherwise | PLAYING, PURSUIT, GAME_OVER |
| PURSUIT | Chasers are active and the escape condition is evaluated | PLAYING, GAME_OVER |
| PAUSED | Simulation timers and movement are frozen | Previous active state |
| GAME_OVER | Run is finalized; score and distance are immutable | READY / restart |

Implementation note: CHARGING and PURSUIT may be represented as orthogonal gameplay flags layered over PLAYING if that produces a cleaner state machine. The observable behavior must remain deterministic.

## 6. Systems and responsibilities

### 6.1 Road graph and navigation

Represent the map as a graph:
- Nodes represent junctions, intersections, and road endpoints.
- Edges represent traversable road segments.
- Each edge has a width, direction rule, speed context, and map position.
- The rickshaw remains within the active edge corridor.
- At a junction, steering selects an available connected edge.
- The minimap uses the same graph data as the movement system to avoid divergent representations.

The initial graph must connect Farmgate, Shahbagh, and Dhanmondi. All areas are accessible from the start.

### 6.2 Traffic AI

Traffic agents should have:
- Vehicle type and dimensions.
- Current road edge and direction.
- Target speed and current speed.
- Lane/position constraints.
- Basic following and spacing behavior.
- Collision shape and collision response.
- Deterministic spawn/despawn rules suitable for mobile performance.

### 6.3 Pedestrians and crowd pursuit

Pedestrians are placed on sidewalks and roadside zones. Crowd pursuit is a distinct event with 5–10 chasers. The pursuit system needs explicit trigger, chase, escape, and caught rules before final tuning.

All confrontation visuals must remain cartoon-like and non-graphic.

### 6.4 Damage and collision

Collision handling must distinguish severity rather than applying one fixed penalty to every contact. Damage affects vehicle performance, especially maximum/current speed. The final damage cap, per-severity damage, recovery policy, and failure threshold are TBD.

### 6.5 Battery and charging

Battery drain is a function of distance and speed. Charging is automatic within the station radius and must complete a 0-to-100% charge in exactly 5 seconds under uninterrupted charging. The rules for leaving the radius, multiple stations, and charging while moving must be specified and tested.

### 6.6 Score

Score and virtual BDT are the same non-monetary run score unless a later approved design separates them. The scoring curve must be deterministic and server-verifiable. No score can be spent or converted into a benefit.

### 6.7 Guest and leaderboard

- Guest play begins without a registration form.
- A guest session receives a non-secret public identifier and a server-verifiable session credential.
- The backend validates run submissions and rejects malformed, impossible, replayed, or out-of-range results.
- The leaderboard stores only the minimum required public display data.
- Never expose Supabase service-role credentials in browser code.
- Database tables and RPCs must use explicit authorization checks and Row Level Security.
- The database has not yet been initialized for this game; no migration is authorized by this specification.

## 7. Technical architecture

### Current prototype stack
- React
- TypeScript
- Vite
- Phaser 3

### Proposed runtime boundaries

Keep React responsible for menus, HUD, settings, Game Over, and leaderboard screens. Keep Phaser responsible for the real-time simulation, rendering, input sampling, collision detection, and world entities.

Suggested modules as implementation grows:
- game/config/ — approved tuning values and feature configuration.
- game/scenes/ — Phaser scenes and lifecycle.
- game/world/ — map graph, roads, landmarks, and minimap data.
- game/entities/ — rickshaw, traffic, pedestrians, chasers, and charging stations.
- game/systems/ — movement, collision, damage, battery, scoring, pursuit, and spawning.
- game/input/ — keyboard and touch input abstraction.
- services/ — guest session and leaderboard API boundary.
- ui/ — Bengali React screens and HUD components.

Do not introduce a global state library unless actual cross-component state complexity justifies it.

## 8. Mobile and accessibility requirements

- Portrait-first layout.
- Touch targets must be comfortable for mobile play.
- Pointer controls must release reliably on pointer-up, pointer-cancel, and loss of focus.
- Prevent page scrolling/zoom gestures from hijacking active game controls where appropriate.
- Keep HUD text legible at common mobile widths.
- Provide a visible minimap throughout active gameplay.
- Support keyboard controls for desktop testing.
- Avoid unnecessary network requests and heavy assets during a run.
- Respect reduced-motion preferences for non-essential UI animation where practical.

## 9. Unresolved gameplay decisions — approval required

The following values are deliberately not invented. They must be agreed before final balancing and before they are treated as product requirements.

| Decision | Required definition |
|---|---|
| Speed curve | Initial speed, acceleration/growth rate, and maximum speed |
| Damage performance | How much each damage level reduces speed; damage cap and failure threshold |
| Collision severity | Contact categories and damage/crowd reactions for each |
| Battery drain | Base drain and speed/distance contribution |
| Charging station | Effective radius, station placement frequency, and behavior when entering/leaving range |
| Charging interruption | Whether charge pauses immediately on leaving the radius and whether driving remains enabled |
| Pursuit trigger | What starts the crowd event and whether it is time-, collision-, or distance-based |
| Pursuit tuning | Chaser count within 5–10, chase speed, catch distance, escape duration/speed |
| Score curve | How distance, survival time, and other approved events contribute to BDT score |
| Pause/resume | Whether pause is available and how browser backgrounding affects the run |
| Guest lifecycle | Guest ID/session lifetime and behavior across refreshes or devices |
| Leaderboard policy | Submission limits, display name rules, ranking period, and tie-breaker |
| Rickshaw colors | How color variants are chosen or selected |

No unresolved value in this table should be silently copied from the temporary prototype.

## 10. Acceptance criteria for the next implementation phase

### World and movement
- The map is a connected road graph.
- The rickshaw cannot travel off-road.
- Junction turns follow graph connectivity.
- Farmgate, Shahbagh, and Dhanmondi are available at run start.
- Minimap position reflects the player's actual graph position.

### Controls
- Touch and keyboard input behave consistently.
- Steering and acceleration are independent.
- Reverse works without increasing distance or score.
- Horn has a real sound effect when an approved asset is available.
- Pointer cancellation cannot leave a control stuck.

### Traffic and collision
- Traffic follows road/lane constraints.
- Collision severity produces distinct approved outcomes.
- Damage reduces speed according to the approved curve.
- Repeated overlap cannot apply unlimited damage every frame.

### Battery and charging
- Battery begins at 100%.
- Drain responds to speed and distance.
- A station charges automatically within the approved radius.
- An uninterrupted 0-to-100% charge takes 5 seconds.
- At 0%, the rickshaw stops and the run ends.

### Pursuit and Game Over
- Pursuit uses 5–10 chasers.
- Escape and caught outcomes follow approved thresholds.
- Caught sequence is cartoon/non-graphic and leads to Game Over.
- Game Over values remain stable after the run ends.

### Score and leaderboard
- Virtual BDT is score only and persists in the Game Over result.
- The backend validates submissions independently of client claims.
- No payment, withdrawal, transfer, purchase, or spending path exists.

## 11. Current prototype gaps to address

The current src/App.tsx is a vertical-slice prototype, not the final game simulation. Known gaps from code inspection:
- The world is one scrolling straight road, not a connected road graph.
- Player steering is horizontal screen movement, not junction navigation.
- The charging area is a screen-side region, not a map-based roadside station.
- Horn feedback is a camera flash; no audio plays.
- Traffic is spawned as simple containers and does not follow a lane/road graph.
- Collision damage is currently a fixed increment and does not model severity.
- There are no pedestrians, chasers, pursuit state, or minimap.
- Area progression is based on elapsed time labels rather than actual map location.
- Distance and score currently accrue from forward movement only, but their final scoring formula is not approved.
- Pause/resume, guest sessions, cloud leaderboard, and server-side score validation are not implemented.
- The current prototype uses fixed scene dimensions; responsive game-world scaling and mobile QA remain required.

## 12. Development sequence

1. Finalize this specification and approve the unresolved balancing decisions.
2. Refactor the prototype into clear simulation modules and explicit run states.
3. Implement the connected road graph, player navigation, and minimap.
4. Implement traffic AI, pedestrians, collision severity, and damage effects.
5. Implement battery, charging stations, and the 5-second charge rule.
6. Implement pursuit, escape, and caught/Game Over behavior.
7. Finalize score calculation and Game Over persistence.
8. Implement guest identity and backend-validated leaderboard.
9. Add audio assets and polish mobile controls/performance.
10. Run automated tests, mobile browser QA, and deployment verification.

## 13. Change control

- Confirmed requirements in sections 1–8 and exclusions in section 3 are binding.
- TBD values remain open until approved.
- Supabase migrations, schema changes, and production database actions require explicit authorization.
- Development work should be performed on a feature branch and reviewed through a pull request.
- Do not merge to main or promote a production deployment without explicit approval.
