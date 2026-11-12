# Netar Rasta — 3D Asset Register

This register distinguishes inspected asset candidates from assets actually integrated into the game. Do not treat a candidate as approved for shipping until the downloaded file, source page, license text, visual fit, scale, and runtime performance have been checked.

## Player vehicle direction

Target: Bangladesh-style battery-powered Electric Rickshaw / Auto Rickshaw (often locally called an easybike), with one steerable front wheel, two rear wheels, a front driver cockpit, windscreen, rear passenger compartment, roof/canopy, and electric drivetrain. Pedals, bicycle chain, and pedal-cycle-rickshaw geometry are explicitly excluded.

## Free candidate assets

| Asset | Format / reported license | Intended evaluation | Status |
|---|---|---|---|
| [Tuk-Tuk — Grab3D](https://grab3d.com/models/vehicles/tuk-tuk/) | GLB; reported CC0 1.0; approx. 11.9k triangles | Stylized three-wheel auto-rickshaw candidate; inspect whether its silhouette matches a Bangladesh electric easybike before use | Candidate only; not downloaded or integrated |
| [Auto Rickshaw — 3DAssets.dev](https://3dassets.dev/assets/indian-bazaar-street-and-temple-auto-rickshaw-51b91c47) | Reported CC0 1.0; approx. 596 triangles; one rolling animation | Lightweight traffic/prop candidate; likely too simple for the player vehicle without enhancement | Candidate only; not downloaded or integrated |
| [E Rickshaw — Sketchfab](https://sketchfab.com/3d-models/e-rickshaw-23a8190b0b16412fa44751af2ea8fd98) | Reported CC BY; approx. 402.9k triangles | Possible visual reference or source for a retopology/LOD workflow | Candidate only; attribution and optimization required |
| [Auto Rickshaw — Sketchfab (Bhushan)](https://sketchfab.com/3d-models/auto-rickshaw-3d-model-243d47a9453740fb9c2da8caa347267e) | Reported CC BY; GLB; approx. 390.3k triangles; separated wheels | Possible reference; high polygon count requires optimization for mobile | Candidate only; attribution and optimization required |

## Integration requirements

- Prefer GLB/glTF for Three.js.
- Preserve original author, source URL, exact license identifier/version, and required attribution.
- Do not use CC BY-NC, Editorial-only, or unclear-license assets in a commercial-capable game.
- Check that downloaded assets contain no embedded third-party content with a different license.
- Optimize textures, materials, draw calls, and geometry; create LODs where appropriate.
- Verify wheel pivots and orientation before animation.
- Test on a mid-range Android device before approving a player-vehicle asset.
- Keep the current procedural electric auto-rickshaw as a fallback until a replacement asset passes review.
