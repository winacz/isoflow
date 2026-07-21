import React from 'react';
import { Card, SxProps } from '@mui/material';

interface Props {
  children: React.ReactNode;
  sx?: SxProps;
  style?: React.CSSProperties;
  /** Marks the item-controls panel as the only scroll target for port focus. */
  'data-item-controls-scroll'?: boolean | string;
}

export const UiElement = ({ children, sx, style, ...rest }: Props) => {
  return (
    <Card
      sx={{
        borderRadius: 2,
        boxShadow: 1,
        borderColor: 'grey.400',
        ...sx
      }}
      style={style}
      {...rest}
    >
      {children}
    </Card>
  );
};
