/**
 * Cache getBoundingClientRect for the interaction element.
 * Layout rects are expensive; refresh on resize / explicit invalidate.
 */

type RectCacheEntry = {
  left: number;
  top: number;
  width: number;
  height: number;
  observed: boolean;
};

const cache = new WeakMap<Element, RectCacheEntry>();
const observers = new WeakMap<Element, ResizeObserver>();

const readRect = (el: Element): RectCacheEntry => {
  const r = el.getBoundingClientRect();
  return {
    left: r.left,
    top: r.top,
    width: r.width,
    height: r.height,
    observed: false
  };
};

const ensureObserver = (el: Element) => {
  if (observers.has(el)) return;
  if (typeof ResizeObserver === 'undefined') return;

  const ro = new ResizeObserver(() => {
    cache.set(el, { ...readRect(el), observed: true });
  });
  ro.observe(el);
  observers.set(el, ro);
};

export const getCachedBoundingClientRect = (
  el: Element
): { left: number; top: number; width: number; height: number } => {
  let entry = cache.get(el);
  if (!entry) {
    entry = { ...readRect(el), observed: false };
    cache.set(el, entry);
    ensureObserver(el);
  } else if (!entry.observed) {
    ensureObserver(el);
    entry.observed = true;
  }
  return entry;
};

export const invalidateBoundingClientRectCache = (el?: Element | null) => {
  if (!el) return;
  cache.delete(el);
};

/** Call after window scroll/move so client coords stay correct. */
export const refreshBoundingClientRectCache = (el?: Element | null) => {
  if (!el) return;
  cache.set(el, { ...readRect(el), observed: true });
  ensureObserver(el);
};
