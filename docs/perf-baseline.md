# IsoFlow performance baseline

Enable the on-canvas HUD:

```js
localStorage.setItem('isoflow-perf-hud', '1');
location.reload();
```

Load synthetic fixtures via `buildPerfLoadModel('S' | 'M' | 'L')` from
`src/fixtures/perfLoadModel.ts`.

## Budgets (plan 2D)

| Scenario | Fixture | Target |
|---|---|---|
| Idle hover | M | ≥55 FPS; ≤1 `setMouse` commit / frame |
| Pan / zoom | M | ≥50 FPS |
| Node drag | M | ≥50 FPS |
| Classic connector draw | M | ≥50 FPS during gesture (A* only on mouseup) |
| Zoom-out pan | L | ≥40–45 FPS (after culling/LOD) |
| Gesture long tasks | M | no main-thread task >50ms mid-gesture |
| mouseup route + jumps | M | <100–150ms spike |

## How to measure (Chrome)

1. Open Performance panel, enable Screenshots.
2. Load fixture M, switch to Plan / 2D.
3. Record 3–5s: idle mouse move over empty tiles, pan, node drag, connector draw.
4. Note FPS (HUD), Long Tasks >50ms, Scripting time in `mousemove` / React commit.

## Baseline notes

Record numbers here after each phase:

| Phase | Date | Idle FPS (M) | Pan FPS (M) | Connector drag long tasks | Notes |
|---|---|---|---|---|---|
| Pre-F0 | — | — | — | expected A* per tile | See plan audyt |
| After F1+ | | | | | |
| After F2+ | | | | | |
| After F3–F5 | | | | | |
