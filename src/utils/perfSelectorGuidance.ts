/**
 * ESLint guidance (documented rule) — avoid broad store subscriptions on the
 * scene hot path. Prefer primitive selectors or store.subscribe + rAF.
 *
 * Banned patterns in SceneLayers / interaction UI:
 * - useUiStateStore((s) => s.mouse)
 * - useModelStore((s) => s)  // entire store
 *
 * Preferred:
 * - useUiStateStore((s) => s.mouse.position.tile.x)
 * - useModelStore((s) => s.items)
 * - useModelStoreApi().getState() inside event handlers
 *
 * Enforce via review until a custom ESLint rule is added to the package.
 */
export const PERF_SELECTOR_GUIDANCE = true;
