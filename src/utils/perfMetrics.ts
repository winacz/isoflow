/**
 * Lightweight perf counters for the IsoFlow editor.
 * Enable HUD with: localStorage.setItem('isoflow-perf-hud', '1') then reload.
 */

export const PERF_HUD_STORAGE_KEY = 'isoflow-perf-hud';

export const isPerfHudEnabled = (): boolean => {
  if (typeof window === 'undefined') return false;
  try {
    return window.localStorage.getItem(PERF_HUD_STORAGE_KEY) === '1';
  } catch {
    return false;
  }
};

type PerfSnapshot = {
  fps: number;
  setMousePerFrame: number;
  lastMousemoveMs: number;
  frameCount: number;
};

type PerfState = {
  frames: number;
  lastFpsSampleAt: number;
  fps: number;
  setMouseThisFrame: number;
  setMousePerFrame: number;
  lastMousemoveMs: number;
  rafId: number | null;
  listeners: Set<(snapshot: PerfSnapshot) => void>;
};

const state: PerfState = {
  frames: 0,
  lastFpsSampleAt: 0,
  fps: 0,
  setMouseThisFrame: 0,
  setMousePerFrame: 0,
  lastMousemoveMs: 0,
  rafId: null,
  listeners: new Set()
};

const snapshot = (): PerfSnapshot => {
  return {
    fps: state.fps,
    setMousePerFrame: state.setMousePerFrame,
    lastMousemoveMs: state.lastMousemoveMs,
    frameCount: state.frames
  };
};

const tick = (now: number) => {
  state.frames += 1;
  state.setMousePerFrame = state.setMouseThisFrame;
  state.setMouseThisFrame = 0;

  if (!state.lastFpsSampleAt) {
    state.lastFpsSampleAt = now;
  } else if (now - state.lastFpsSampleAt >= 500) {
    const elapsed = (now - state.lastFpsSampleAt) / 1000;
    state.fps = Math.round(state.frames / elapsed);
    state.frames = 0;
    state.lastFpsSampleAt = now;
  }

  const snap = snapshot();
  state.listeners.forEach((listener) => {
    listener(snap);
  });

  state.rafId = window.requestAnimationFrame(tick);
};

export const ensurePerfLoop = () => {
  if (typeof window === 'undefined') return;
  if (state.rafId !== null) return;
  state.lastFpsSampleAt = performance.now();
  state.rafId = window.requestAnimationFrame(tick);
};

export const stopPerfLoop = () => {
  if (state.rafId !== null) {
    window.cancelAnimationFrame(state.rafId);
    state.rafId = null;
  }
};

export const recordSetMouse = () => {
  state.setMouseThisFrame += 1;
};

export const recordMousemoveDuration = (ms: number) => {
  state.lastMousemoveMs = ms;
};

export const subscribePerfSnapshot = (
  listener: (snapshot: PerfSnapshot) => void
): (() => void) => {
  ensurePerfLoop();
  state.listeners.add(listener);
  listener(snapshot());
  return () => {
    state.listeners.delete(listener);
    if (state.listeners.size === 0) {
      stopPerfLoop();
    }
  };
};
