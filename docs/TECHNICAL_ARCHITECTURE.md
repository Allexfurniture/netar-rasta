# Netar Rasta — Technical Architecture Baseline

## Runtime ownership
- **React UI:** READY, PAUSED, GAME_OVER screens; Bengali HUD; settings and leaderboard presentation.
- **Game runtime:** fixed-step simulation, state machine, world model, entities, input sampling and event publication.
- **Three.js adapter:** WebGL renderer, scene graph, camera, lighting, mesh/material lifecycle. Rendering must not own game rules.
- **Services:** guest identity and leaderboard boundary. Local play must remain functional if the service is unavailable.

## Proposed source layout
```text
src/
  app/                 React composition and application providers
  ui/                  Bengali screens, HUD and touch controls
  game/
    core/              GameLoop, GameStateMachine, clock and event bus
    config/            Approved constants and explicitly provisional tuning
    input/             Pointer/keyboard abstraction and normalized controls
    world/             RoadGraph, coordinates, city layout and world queries
    entities/          Rickshaw, traffic, pedestrian, chaser, charging station
    systems/            Movement, routing, collision, damage, battery, score, pursuit
    render/
      three/           Renderer, scene, camera, meshes and visual adapters
  services/            Guest and leaderboard interfaces/adapters
  test/                Test fixtures and deterministic scenarios
```

## Simulation contract
- Use a fixed simulation step with an accumulator; rendering may interpolate but must not change authoritative state.
- All gameplay systems consume the same immutable input snapshot and update a single world state in a deterministic order.
- Systems communicate through typed domain events or explicit state updates, not React component state.
- React receives throttled read-only HUD snapshots. It cannot mutate simulation internals.
- Pause/backgrounding freezes simulation time and input; resume reinitializes the frame timestamp to avoid a large delta.
- Reverse movement never increases forward distance or score.
- Collision overlap is resolved with contact identity/cooldown and severity classification, not per-frame damage.
- The road graph is the sole authority for legal player and traffic navigation. Minimap and 3D road geometry are projections of it.

## State machine
- READY -> PLAYING
- PLAYING -> PAUSED | CHARGING | PURSUIT | GAME_OVER
- PAUSED -> prior resumable state
- CHARGING and PURSUIT may be orthogonal flags on PLAYING if transitions remain explicit and testable.
- Any terminal condition finalizes a frozen run result exactly once.
- GAME_OVER -> READY for a new run; the previous result remains immutable.

## Coordinate and graph contract
- Keep graph coordinates normalized and renderer-independent.
- Each directed road edge defines a centerline, width, allowed direction, lane metadata and connected endpoints.
- World-space conversion is centralized in one projection utility.
- Player position is represented by edge identity + progress + lateral offset; junction changes are explicit graph transitions.
- Traffic uses directed edges and legal outgoing connections; minimap reads the same player graph position.

## Input contract
- Normalize keyboard and touch into `steer`, `accelerate`, `reverse`, `horn`, `pause`.
- Input is sampled once per simulation step.
- Every pressed touch control must clear on pointer-up, pointer-cancel, pointer-leave and window blur.
- UI gestures must not scroll/zoom the page while a control is actively held.

## Asset and performance policy
- Start with procedural blockout geometry; replace assets without changing simulation contracts.
- Avoid large per-frame allocations; pool repeated traffic/pedestrian visuals.
- Bound device pixel ratio and shadow cost; profile on real Android devices before claiming a performance target.
- Handle resize, WebGL context loss and renderer disposal explicitly.
- Do not use remote assets that can disappear or add uncontrolled network latency.

## Testing strategy
1. Unit tests: graph connectivity/routing, movement constraints, reverse, state transitions, score, battery and charge timing.
2. Deterministic system tests: traffic following, collision latching/severity, pursuit escape/caught outcomes.
3. Component tests: input release semantics, HUD formatting, Bengali terminal states.
4. Browser tests: WebGL startup/failure, resize/orientation, restart, pause/resume, touch/keyboard controls.
5. Device QA: mid-range Android portrait performance, thermal behavior, memory, touch ergonomics and browser backgrounding.

## Provisional-value discipline
The design specification's unresolved table is authoritative. Any temporary constants must live in a clearly named prototype tuning file, be labeled provisional, and never be described as approved balance. No final values may be selected without product-owner approval.

## Security boundary
- Client-reported score is untrusted.
- Guest session credentials must be scoped and verifiable server-side.
- Service-role keys must never enter browser bundles.
- RLS and database RPC authorization are required before leaderboard rollout.
- No database change is included in this stage.
