import { useCallback, useEffect, useRef, useState } from 'react';
import { Size } from 'src/types';

/**
 * Throttled ResizeObserver — at most one setState per animation frame.
 */
export const useResizeObserver = (el?: HTMLElement | null) => {
  const resizeObserverRef = useRef<ResizeObserver>();
  const [size, setSize] = useState<Size>({ width: 0, height: 0 });
  const rafRef = useRef<number | null>(null);
  const pendingRef = useRef<Size | null>(null);

  const disconnect = useCallback(() => {
    resizeObserverRef.current?.disconnect();
    if (rafRef.current !== null) {
      window.cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
  }, []);

  const observe = useCallback(
    (element: HTMLElement) => {
      disconnect();

      const flush = () => {
        rafRef.current = null;
        const next = pendingRef.current;
        if (!next) return;
        pendingRef.current = null;
        setSize((prev) => {
          if (prev.width === next.width && prev.height === next.height) {
            return prev;
          }
          return next;
        });
      };

      resizeObserverRef.current = new ResizeObserver(() => {
        pendingRef.current = {
          width: element.clientWidth,
          height: element.clientHeight
        };
        if (rafRef.current === null) {
          rafRef.current = window.requestAnimationFrame(flush);
        }
      });

      resizeObserverRef.current.observe(element);
      // Seed immediately
      setSize({
        width: element.clientWidth,
        height: element.clientHeight
      });
    },
    [disconnect]
  );

  useEffect(() => {
    return () => {
      disconnect();
    };
  }, [disconnect]);

  useEffect(() => {
    if (el) observe(el);
  }, [observe, el]);

  return {
    size,
    disconnect,
    observe
  };
};
