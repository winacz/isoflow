import React from 'react';
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
  position: Coords;
  anchorEl?: HTMLElement;
  menuItems: ContextMenuEntry[];
}

export const ContextMenu = ({
  onClose,
  position,
  anchorEl,
  menuItems
}: Props) => {
  return (
    <Menu
      open
      anchorEl={anchorEl}
      style={{
        left: position.x,
        top: position.y
      }}
      onClose={onClose}
      PaperProps={{
        sx: {
          minWidth: 220,
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
