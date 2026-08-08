/**
 * Freezes canvas port hit-tests while the loupe is aligning or the glass is open.
 * The loupe magnifies visually; mouse events still hit the scene underneath —
 * without a freeze those underside hits fight the glass (wrong port / jump).
 */
let loupeRevealLock = false;
let loupeGlassActive = false;
/** Node the open loupe is locked to (ignore stacked nodes underneath). */
let loupeAnchorItemId: string | null = null;

export const setLoupeRevealLock = (locked: boolean) => {
  loupeRevealLock = locked;
};

export const setLoupeGlassActive = (
  active: boolean,
  anchorItemId: string | null = null
) => {
  loupeGlassActive = active;
  loupeAnchorItemId = active ? anchorItemId : null;
};

export const isLoupeRevealLocked = () => loupeRevealLock;

export const isLoupeGlassActive = () => loupeGlassActive;

export const getLoupeAnchorItemId = () => loupeAnchorItemId;

/** True while canvas must not drive shape2dPortHover. */
export const isLoupePortHoverFrozen = () =>
  loupeRevealLock || loupeGlassActive;
