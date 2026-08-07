/**
 * Imperative RJ45 hover visuals (scale + blue ring + label).
 * Used by the plan canvas and the loupe so DeviceShape2d never re-renders
 * when the cursor slides along a port row.
 */

/** Matches Rj45Port `isHovered` scale. */
export const PORT_HOVER_SCALE = 1.22;
const PORT_HOVER_BORDER = '2px solid rgba(59, 130, 246, 0.9)';
const PORT_HOVER_SHADOW =
  '0 0 0 3px rgba(59, 130, 246, 0.4), 0 0 14px rgba(59, 130, 246, 0.45)';
const PORT_HOVER_LABEL = '#2563eb';
const PORT_HOVER_LABEL_SHADOW = '0 0 6px rgba(37, 99, 235, 0.45)';

export type PortHoverTarget = { itemId: string; portId: string };

export function clearJackHover(jack: HTMLElement) {
  const jackStyle = jack.style;
  const scaleTarget = jack.firstElementChild as HTMLElement | null;
  if (scaleTarget) {
    scaleTarget.style.transform = 'translate(-50%, -50%) scale(1)';
    const bezel = scaleTarget.firstElementChild as HTMLElement | null;
    if (bezel) {
      const bezelStyle = bezel.style;
      bezelStyle.border = '';
      bezelStyle.boxShadow = '';
      bezelStyle.transition = '';
    }
  }
  jackStyle.zIndex = '';
  jack.querySelectorAll('span').forEach((node) => {
    const labelStyle = (node as HTMLElement).style;
    labelStyle.color = '';
    labelStyle.fontWeight = '';
    labelStyle.textShadow = '';
  });
}

export function applyJackHover(jack: HTMLElement) {
  const jackStyle = jack.style;
  jackStyle.zIndex = '5';
  const scaleTarget = jack.firstElementChild as HTMLElement | null;
  if (scaleTarget) {
    const scaleStyle = scaleTarget.style;
    scaleStyle.transition = 'transform 0.14s ease';
    scaleStyle.transform = `translate(-50%, -50%) scale(${PORT_HOVER_SCALE})`;
    const bezel = scaleTarget.firstElementChild as HTMLElement | null;
    if (bezel) {
      const bezelStyle = bezel.style;
      bezelStyle.transition =
        'transform 0.14s ease, box-shadow 0.14s ease, border-color 0.14s ease';
      bezelStyle.border = PORT_HOVER_BORDER;
      bezelStyle.boxShadow = PORT_HOVER_SHADOW;
    }
  }
  jack.querySelectorAll('span').forEach((node) => {
    const labelStyle = (node as HTMLElement).style;
    labelStyle.color = PORT_HOVER_LABEL;
    labelStyle.fontWeight = '700';
    labelStyle.textShadow = PORT_HOVER_LABEL_SHADOW;
  });
}

/** Clear previous jack and optionally hover a jack inside `root`. */
export function applyPortHoverInRoot(
  root: ParentNode | null,
  portId: string | null,
  prevJackRef: { current: HTMLElement | null }
) {
  const prevJack = prevJackRef.current;
  if (prevJack) {
    clearJackHover(prevJack);
    // eslint-disable-next-line no-param-reassign -- ref bag updated by design
    prevJackRef.current = null;
  }

  if (!root || !portId) return;

  const jack = root.querySelector(
    `.isoflow-export-port[data-port-id="${CSS.escape(portId)}"]`
  ) as HTMLElement | null;
  if (!jack) return;

  applyJackHover(jack);
  // eslint-disable-next-line no-param-reassign -- ref bag updated by design
  prevJackRef.current = jack;
}

const querySceneJack = (itemId: string, portId: string) => {
  return document.querySelector(
    `.isoflow-node[data-node-id="${CSS.escape(
      itemId
    )}"] .isoflow-export-port[data-port-id="${CSS.escape(portId)}"]`
  ) as HTMLElement | null;
};

/**
 * Plan-canvas hover: scopes to `.isoflow-node` so the loupe's duplicate
 * DeviceShape2d is never targeted.
 * Pass `peerTargets` to also hover the far end of a connected cable.
 */
export function applyScenePortHoverDom(
  itemId: string | null,
  portId: string | null,
  prevJacksRef: { current: HTMLElement[] },
  peerTargets?: PortHoverTarget[] | null
) {
  prevJacksRef.current.forEach((jack) => {
    clearJackHover(jack);
  });
  // eslint-disable-next-line no-param-reassign -- ref bag updated by design
  prevJacksRef.current = [];

  if (!itemId || !portId) return;

  const seen = new Set<string>();
  const targets: PortHoverTarget[] = [
    { itemId, portId },
    ...(peerTargets ?? [])
  ];

  targets.forEach((target) => {
    if (!target.portId) return;
    const key = `${target.itemId}:${target.portId}`;
    if (seen.has(key)) return;
    seen.add(key);

    const jack = querySceneJack(target.itemId, target.portId);
    if (!jack) return;
    applyJackHover(jack);
    prevJacksRef.current.push(jack);
  });
}
