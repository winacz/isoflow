import React from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { Isoflow } from 'src/Isoflow';
import type { Model, View } from 'src/types';
import { getUnprojectedBounds } from './renderer';

/**
 * Shared offscreen, non-interactive `<Isoflow>` mount used by every export
 * that needs a clean, deterministic render of the Plan (2D) view — the
 * interactive HTML export and the PDF export both build on this.
 *
 * We NEVER touch/clone the live, currently-visible canvas. Instead we mount
 * a dedicated, offscreen instance forced onto the Plan view with
 * `fitToView`, so exports are always correct regardless of which tab / pan
 * / zoom the user happened to have open.
 */

const OFFSCREEN_PADDING_PX = 480;
const OFFSCREEN_MIN_PX = 900;
const OFFSCREEN_MAX_PX = 6000;

const clampOffscreenSize = (value: number): number => {
  return Math.min(
    OFFSCREEN_MAX_PX,
    Math.max(OFFSCREEN_MIN_PX, Math.round(value))
  );
};

export type OffscreenStage = {
  host: HTMLDivElement;
  root: Root;
  canvasEl: HTMLElement;
};

export const mountOffscreenPlanView = (
  model: Model,
  planView: View
): Promise<OffscreenStage> => {
  const bounds = getUnprojectedBounds(planView, {
    projectionMode: 'TWO_D',
    modelItems: model.items
  });

  const width = clampOffscreenSize(bounds.width + OFFSCREEN_PADDING_PX * 2);
  const height = clampOffscreenSize(bounds.height + OFFSCREEN_PADDING_PX * 2);

  const host = document.createElement('div');
  host.setAttribute('data-isoflow-export-stage', '');
  host.style.position = 'fixed';
  host.style.left = '-99999px';
  host.style.top = '0';
  host.style.width = `${width}px`;
  host.style.height = `${height}px`;
  host.style.pointerEvents = 'none';
  document.body.appendChild(host);

  const root = createRoot(host);

  return new Promise<OffscreenStage>((resolve, reject) => {
    let settled = false;

    const finish = () => {
      if (settled) return;
      settled = true;

      // NOTE: intentionally NOT requestAnimationFrame — rAF callbacks are
      // suspended entirely by the browser while the document/tab is hidden
      // or backgrounded, which can hang this promise forever. React has
      // already committed the DOM synchronously by the time this runs, so
      // a plain macrotask tick is enough to let things settle.
      window.setTimeout(() => {
        const canvasEl = host.querySelector<HTMLElement>(
          '#isoflow-canvas-container'
        );

        if (!canvasEl) {
          reject(new Error('Nie udało się zbudować podglądu do eksportu.'));
          return;
        }

        resolve({ host, root, canvasEl });
      }, 0);
    };

    // Safety net — never hang forever if onModelUpdated doesn't fire.
    const timeoutId = window.setTimeout(finish, 4000);

    root.render(
      <Isoflow
        editorMode="NON_INTERACTIVE"
        width={width}
        height={height}
        initialData={{
          ...model,
          view: planView.id,
          projectionMode: 'TWO_D',
          fitToView: true
        }}
        renderer={{ showGrid: false }}
        onModelUpdated={() => {
          window.clearTimeout(timeoutId);
          finish();
        }}
      />
    );
  });
};

export const unmountOffscreenStage = (stage: OffscreenStage): void => {
  stage.root.unmount();
  stage.host.remove();
};

/**
 * Isoflow's own "node"/"cable" wrapper elements are zero-size absolute
 * positioning anchors (their actual visible content lives a few levels
 * deep, offset via inline left/top). Measuring the wrapper itself always
 * yields a 0x0 rect. Union the rects of every descendant that actually has
 * size instead — this is the accurate on-screen bounding box of the node.
 */
export const unionRect = (
  el: Element
): { left: number; top: number; right: number; bottom: number } | null => {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  let found = false;

  const consider = (r: DOMRect) => {
    if (r.width === 0 && r.height === 0) return;
    found = true;
    minX = Math.min(minX, r.left);
    minY = Math.min(minY, r.top);
    maxX = Math.max(maxX, r.right);
    maxY = Math.max(maxY, r.bottom);
  };

  consider(el.getBoundingClientRect());
  el.querySelectorAll('*').forEach((child) => {
    consider(child.getBoundingClientRect());
  });

  return found ? { left: minX, top: minY, right: maxX, bottom: maxY } : null;
};
