# AGENTS.md

## Cursor Cloud specific instructions

Isoflow is a **client-only React component library** (an isometric/2D network-diagram editor). There is **no backend, database, or auth service** — everything runs in the browser and persists custom device templates to `localStorage`. For end-to-end manual testing you only need the webpack dev server.

### Services

Only one service matters for local development/testing:

- **Webpack dev server** — `npm run start` serves the examples playground at `http://localhost:3000` (config: `webpack/dev.config.js`). This is the app to open when manually testing UI changes.

Optional/not needed for the core product: the Next.js docs site under `docs/` (`cd docs && npm run dev`, port 3002), the `npm run dev` nodemon library watcher (rebuilds `dist/`, no UI), and the Docker/nginx production image.

### Standard commands (defined in `package.json`)

- Run app (dev): `npm run start` (port 3000)
- Build library: `npm run build`
- Lint: `npm run lint` (runs `tsc --noEmit` then eslint)
- Tests: `npm run test` (jest)

### Non-obvious caveats

- **Node version:** `.nvmrc` pins `16.19.0`, but that is stale — the current lockfile needs a modern Node. `webpack-dev-server@6` and `uuid@14` require Node ≥ 20/22. Use the default VM Node (v22.x). Ignore the `.nvmrc` value; do **not** switch to Node 16.
- **`npm run lint` reports ~1200 pre-existing eslint errors** (Airbnb style rules) even on a clean checkout. The `tsc --noEmit` type-check portion passes; the eslint failures are pre-existing and are not caused by the environment. Don't treat a nonzero lint exit as a setup problem.
- **`npm run test` currently fails on a clean checkout.** `uuid@14` ships ESM only and jest/ts-jest is not configured to transform it (`SyntaxError: Unexpected token 'export'` from `node_modules/uuid`). This is a pre-existing repo config issue, not an environment issue. Only 2 trivial tests actually pass.
- The examples playground loads with a **pre-populated demo diagram**. Add nodes via the **`+` button in the top-right toolbar** to open the icon library, then drag an icon onto the canvas.
- Build/dev-server emit large-bundle performance warnings — these are expected and harmless.
