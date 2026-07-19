import React from 'react';
import { Menu, MenuItem } from '@mui/material';
import { Coords } from 'src/types';

interface MenuItemI {
  label: string;
  onClick: () => void;
}

interface Props {
  onClose: () => void;
  position: Coords;
  anchorEl?: HTMLElement;
  menuItems: MenuItemI[];
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
          '& .MuiMenuItem-root': {
            minHeight: 28,
            py: 0.5,
            fontSize: 13,
            lineHeight: 1.25
          }
        }
      }}
    >
      {menuItems.map((item) => {
        return (
          <MenuItem key={item.label} onClick={item.onClick}>
            {item.label}
          </MenuItem>
        );
      })}
    </Menu>
  );
};
