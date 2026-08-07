import React, { useCallback, useLayoutEffect, useMemo, useState } from 'react';
import { Divider, ListSubheader, Menu, MenuItem } from '@mui/material';
import { Coords } from 'src/types';

export interface ContextMenuEntry {
  label: string;
  onClick?: () => void;
  disabled?: boolean;
  /** Non-clickable section title. */
  isHeader?: boolean;
  dividerBefore?: boolean;
}

interface Props {
  onClose: () => void;
  /** Offset from scene-layer origin, already scaled by zoom (scene px × zoom). */
  position: Coords;
  /** SceneLayer origin marker — used to convert position into viewport coords. */
  anchorEl?: HTMLElement;
  menuItems: ContextMenuEntry[];
}

const VIEWPORT_MARGIN = 8;

/** Place the menu so its box stays inside the window (flip above/left if needed). */
const fitMenuToViewport = (
  click: { top: number; left: number },
  size: { width: number; height: number }
): { top: number; left: number } => {
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const { width, height } = size;

  let left = click.left;
  let top = click.top;

  // Prefer opening to the right; flip left if it would overflow.
  if (left + width + VIEWPORT_MARGIN > vw) {
    left = click.left - width;
  }
  left = Math.min(
    Math.max(left, VIEWPORT_MARGIN),
    Math.max(VIEWPORT_MARGIN, vw - width - VIEWPORT_MARGIN)
  );

  // Prefer opening downward; flip up if it would overflow.
  if (top + height + VIEWPORT_MARGIN > vh) {
    top = click.top - height;
  }
  top = Math.min(
    Math.max(top, VIEWPORT_MARGIN),
    Math.max(VIEWPORT_MARGIN, vh - height - VIEWPORT_MARGIN)
  );

  return { top, left };
};

export const ContextMenu = ({
  onClose,
  position,
  anchorEl,
  menuItems
}: Props) => {
  const clickPosition = useMemo(() => {
    if (anchorEl) {
      const rect = anchorEl.getBoundingClientRect();
      return {
        top: rect.top + position.y,
        left: rect.left + position.x
      };
    }
    return { top: position.y, left: position.x };
  }, [anchorEl, position.x, position.y]);

  const [anchorPosition, setAnchorPosition] = useState(clickPosition);

  useLayoutEffect(() => {
    setAnchorPosition(clickPosition);
  }, [clickPosition]);

  const applyFit = useCallback(
    (paper: HTMLElement) => {
      const next = fitMenuToViewport(clickPosition, {
        width: paper.offsetWidth,
        height: paper.offsetHeight
      });
      setAnchorPosition((prev) => {
        if (prev.top === next.top && prev.left === next.left) return prev;
        return next;
      });
    },
    [clickPosition]
  );

  return (
    <Menu
      open
      anchorReference="anchorPosition"
      anchorPosition={anchorPosition}
      transformOrigin={{ vertical: 'top', horizontal: 'left' }}
      marginThreshold={VIEWPORT_MARGIN}
      onClose={onClose}
      TransitionProps={{
        onEntering: (node) => {
          applyFit(node as HTMLElement);
        }
      }}
      PaperProps={{
        sx: {
          minWidth: 220,
          maxHeight: `calc(100vh - ${VIEWPORT_MARGIN * 2}px)`,
          overflowY: 'auto',
          '& .MuiMenuItem-root': {
            minHeight: 28,
            py: 0.5,
            fontSize: 13,
            lineHeight: 1.25
          },
          '& .MuiListSubheader-root': {
            lineHeight: 1.3,
            py: 0.75,
            fontSize: 10,
            fontWeight: 700,
            letterSpacing: 0.5,
            textTransform: 'uppercase',
            color: 'text.secondary'
          }
        }
      }}
    >
      {menuItems.map((item, index) => {
        const key = `${item.label}-${index}`;
        return (
          <React.Fragment key={key}>
            {item.dividerBefore && <Divider component="li" sx={{ my: 0.5 }} />}
            {item.isHeader ? (
              <ListSubheader disableSticky>{item.label}</ListSubheader>
            ) : (
              <MenuItem
                disabled={item.disabled}
                onClick={() => {
                  item.onClick?.();
                }}
              >
                {item.label}
              </MenuItem>
            )}
          </React.Fragment>
        );
      })}
    </Menu>
  );
};
