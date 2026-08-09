import React, { useMemo, useState } from 'react';
import { Box } from '@mui/material';
import { AnchorPosition, Coords } from 'src/types';
import { TRANSFORM_CONTROLS_COLOR } from 'src/config';
import { useUiStateStore } from 'src/stores/uiStateStore';

interface Props {
  position: Coords;
  anchor?: AnchorPosition;
  onPointerDown: (event: React.PointerEvent) => void;
  onPointerMove?: (event: React.PointerEvent) => void;
  onPointerUp?: (event: React.PointerEvent) => void;
}

/** Visible handle size (counter-zoomed). */
export const TRANSFORM_HANDLE_SIZE = 18;
/** Larger invisible hit target so corners are easy to grab in iso. */
const HIT_SIZE = 32;

const counterZoom = (zoom: number) => {
  return 1 / Math.max(zoom, 0.08);
};

const cursorForAnchor = (key?: AnchorPosition): string => {
  switch (key) {
    case 'TOP_LEFT':
    case 'BOTTOM_RIGHT':
      return 'nwse-resize';
    case 'TOP_RIGHT':
    case 'BOTTOM_LEFT':
      return 'nesw-resize';
    case 'LEFT':
    case 'RIGHT':
      return 'ew-resize';
    case 'TOP':
    case 'BOTTOM':
      return 'ns-resize';
    default:
      return 'nwse-resize';
  }
};

/**
 * Shared resize handle for 2D + isometric — round screen-space circle
 * with pointer capture (stable drag even over the interaction layer).
 */
export const TransformAnchor = ({
  position,
  anchor,
  onPointerDown,
  onPointerMove,
  onPointerUp
}: Props) => {
  const [isHovered, setIsHovered] = useState(false);
  const zoom = useUiStateStore((state) => state.zoom);
  const modeType = useUiStateStore((state) => state.mode.type);
  const isResizing = modeType === 'RECTANGLE.TRANSFORM';
  const scale = useMemo(() => counterZoom(zoom), [zoom]);
  const isHot = isHovered || isResizing;

  return (
    <Box
      title="Przeciągnij róg"
      onMouseEnter={() => {
        setIsHovered(true);
      }}
      onMouseLeave={() => {
        setIsHovered(false);
      }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
      sx={{
        position: 'absolute',
        left: position.x,
        top: position.y,
        width: HIT_SIZE,
        height: HIT_SIZE,
        transform: `translate(-50%, -50%) scale(${scale})`,
        transformOrigin: 'center',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        cursor: cursorForAnchor(anchor),
        // Parent SceneLayer is pointer-events:none — must re-enable hits.
        pointerEvents: 'auto',
        zIndex: 2,
        touchAction: 'none'
      }}
    >
      <Box
        sx={{
          width: TRANSFORM_HANDLE_SIZE,
          height: TRANSFORM_HANDLE_SIZE,
          borderRadius: '50%',
          bgcolor: isHot ? TRANSFORM_CONTROLS_COLOR : '#fff',
          border: `2.5px solid ${TRANSFORM_CONTROLS_COLOR}`,
          boxShadow: '0 1px 4px rgba(0,0,0,0.3)',
          transform: isHot ? 'scale(1.12)' : 'none',
          transition: 'background-color 0.1s ease, transform 0.1s ease',
          pointerEvents: 'none'
        }}
      />
    </Box>
  );
};
