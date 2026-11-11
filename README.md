# নেতার রাস্তা (Netar Rasta)

A Bengali-first, mobile portrait 2D rickshaw survival game set in a fictional Dhaka-inspired city.

## Current prototype

This branch contains the first playable browser prototype built with React, TypeScript, Vite, and Phaser 3.

### Implemented in this prototype
- Portrait-oriented game shell and Bengali start/game-over screens.
- Top-down scrolling road and player rickshaw.
- Keyboard and touch steering, acceleration, and reverse.
- Traffic vehicle spawning and basic collision/damage.
- Progressive speed, distance, provisional virtual BDT score, and battery meter.
- Simple charging zone and three area labels: Farmgate, Shahbagh, Dhanmondi.

### Not implemented yet
- Final city map/road graph, actual Dhaka vehicle/pedestrian AI, crowd pursuit, detailed collision severity, full 5-second charge interaction, horn audio, leaderboard, guest cloud save, and server-side score validation.
- Supabase schema has not been applied. No Supabase data has been changed.
- No production deployment has been made.

## Local development

```bash
npm install
npm run dev
```

Build:

```bash
npm run build
```

Vite output directory: `dist`.

## Deployment
Use Vercel with Framework Preset `Vite`, Build Command `npm run build`, and Output Directory `dist`. Deploy this feature branch as a Preview first. Production should remain on `main` until the prototype is reviewed and explicitly approved.

## Product constraints
- Endless Survival only; no passengers, missions, upgrades, background music, or in-game spending.
- Virtual BDT is score only and has no real monetary value.
- Guest play should not require registration.
