/**
 * Yield to the browser so UI can paint / handle input between heavy chunks.
 */
export const yieldToMain = (): Promise<void> => {
  return new Promise((resolve) => {
    if (typeof window !== 'undefined' && 'requestIdleCallback' in window) {
      window.requestIdleCallback(() => resolve(), { timeout: 32 });
      return;
    }
    setTimeout(resolve, 0);
  });
};

/**
 * Run a heavy sync function after yielding once (keeps click handlers responsive).
 */
export const runAfterYield = async <T>(work: () => T): Promise<T> => {
  await yieldToMain();
  return work();
};
