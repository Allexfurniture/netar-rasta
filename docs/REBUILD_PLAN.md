# Netar Rasta — Clean Rebuild Plan

## Objective
Rebuild the game on a clean feature branch from `main`, following the approved product specification in `GAME_DESIGN_SPEC.md`. Do not extend or reuse the current prototype implementation as the foundation.

## Baseline findings
- `main` currently contains a 2D Phaser prototype, not the approved 3D direction.
- The previous 3D prototype is isolated on `development/game-design-spec` and its open Draft PR #2 remains unmerged.
- The approved 3D specification was not present on `main`; it has been copied into this clean rebuild branch.
- No Supabase schema or migration has been applied. This rebuild does not authorize database changes.

## Rebuild principles
1. Keep React responsible for menus, HUD, pause/game-over and leaderboard presentation.
2. Keep the simulation in framework-independent TypeScript systems; Three.js is the renderer and scene adapter.
3. Use one authoritative road graph for player movement, traffic routing, world geometry and minimap projection.
4. Model gameplay with explicit states and deterministic systems; avoid frame-loop business logic embedded in React.
5. Separate approved requirements from provisional tuning. Do not silently finalize any TBD value.
6. Design for portrait mobile first, with touch and keyboard input sharing one input abstraction.
7. Treat build success as necessary but insufficient: each milestone requires browser gameplay QA and recorded acceptance checks.

## Delivery stages
### Stage 0 — Product and architecture baseline
- Preserve the approved specification and exclusions.
- Define module boundaries, runtime state transitions, coordinate conventions, input contract, entity lifecycle, and test strategy.
- Record all unresolved gameplay values as TBD.

### Stage 1 — 3D visual/technical vertical slice
- Create a clean Vite + React + TypeScript + Three.js foundation.
- Render a polished test road, player rickshaw placeholder/model, chase camera and responsive portrait viewport.
- Validate WebGL failure handling, resize, context lifecycle, touch/keyboard input and stable simulation timing.
- Do not add unapproved gameplay systems.

### Stage 2 — Road graph and city blockout
- Build the shared road graph and connected junction traversal.
- Render 3D roads, sidewalks and blockout buildings.
- Verify Farmgate, Shahbagh and Dhanmondi are connected from the start.
- Drive minimap from the same graph and player position.

### Stage 3 — Core driving and traffic
- Implement movement, steering, reverse, horn interface, traffic routing, collision categories and damage system.
- Add pedestrians and pursuit only after their state rules and tuning are explicit.

### Stage 4 — Battery, charging, score and run lifecycle
- Implement battery drain and exact uninterrupted five-second full charge.
- Keep score/virtual BDT non-monetary and immutable after Game Over.
- Test all state transitions and edge cases.

### Stage 5 — Guest and leaderboard
- Design server-verifiable guest sessions and score validation.
- Review security, RLS and database tests before requesting explicit authorization for Supabase migrations.
- Never ship service-role credentials to the client.

### Stage 6 — QA and release candidate
- Automated unit/integration tests, browser runtime tests, real mobile device QA, performance profiling and accessibility checks.
- Preview deploy only; no merge to main or Production promotion without explicit approval.

## Acceptance rule
A stage is not complete merely because TypeScript or Vite builds. It must pass its defined behavior checks in a running browser, with evidence recorded in the PR.
