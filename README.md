# নেতার রাস্তা (Netar Rasta)

A Bengali-first, mobile portrait **3D third-person rickshaw survival game** set in a fictional Dhaka-inspired city.

## Current development direction

The game uses React, TypeScript, Vite, and Three.js. The selected camera is a third-person chase camera positioned behind the player's rickshaw.

### Current 3D prototype slice

- Three.js WebGL renderer with perspective chase camera.
- Procedurally assembled 3D rickshaw, traffic vehicles, buildings, trees, road, and roadside charging prop.
- Mobile touch controls and desktop keyboard controls.
- Basic traffic movement, collision/damage, speed, distance, score, and battery HUD.
- Bengali start and Game Over screens.
- Portrait-first responsive game shell.

The current scene is a 3D vertical slice, not the completed city simulation. It currently uses a straight road corridor and prototype-only balancing values.

### Planned / not yet implemented

- Full connected 3D road graph with junction turning and a live minimap.
- Final Farmgate, Shahbagh, and Dhanmondi city layout and landmarks.
- Dhaka-specific traffic AI, pedestrian behavior, crowd pursuit, and detailed collision severity.
- Final 5-second charging behavior and approved charging rules.
- Real horn/traffic sound effects (no audio assets supplied yet).
- Guest cloud identity, leaderboard, and server-side score validation.
- Supabase schema has not been applied; no Supabase data has been changed.

## Local development

\`\`\`bash
npm install
npm run dev
\`\`\`

Build:

\`\`\`bash
npm run build
\`\`\`

Vite output directory: \`dist\`.

## Deployment

Use Vercel with Framework Preset \`Vite\`, Build Command \`npm run build\`, and Output Directory \`dist\`. Deploy this development branch as a Preview first. Production should remain on \`main\` until the prototype is reviewed and explicitly approved.

## Product constraints

- Endless Survival only; no passengers, missions, upgrades, background music, or in-game spending.
- Virtual BDT is score only and has no real monetary value.
- Guest play should not require registration.
- Target mobile devices must support WebGL.
