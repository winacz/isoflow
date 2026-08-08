/**
 * Pathfinder call instrumentation for perf regression tests.
 * Production code paths call `findPath` which increments when counting is enabled.
 */

let counting = false;
let callCount = 0;

export const startPathfinderCallCount = () => {
  counting = true;
  callCount = 0;
};

export const stopPathfinderCallCount = (): number => {
  counting = false;
  const n = callCount;
  callCount = 0;
  return n;
};

export const getPathfinderCallCount = () => callCount;

export const recordPathfinderCall = () => {
  if (counting) callCount += 1;
};
