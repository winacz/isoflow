import React from 'react';
import RouterOutlined from '@mui/icons-material/RouterOutlined';
import ComputerOutlined from '@mui/icons-material/ComputerOutlined';
import DnsOutlined from '@mui/icons-material/DnsOutlined';
import CropSquareOutlined from '@mui/icons-material/CropSquareOutlined';
import ApartmentOutlined from '@mui/icons-material/ApartmentOutlined';
import DevicesOtherOutlined from '@mui/icons-material/DevicesOtherOutlined';
import { SvgIconProps } from '@mui/material';
import {
  SHAPE_2D_CABINET_ID,
  SHAPE_2D_PC_ID,
  SHAPE_2D_SWITCH_ID
} from 'src/config';
import { isDeviceTemplateId } from 'src/utils';

export type DeviceTypeIconKind =
  | 'switch'
  | 'pc'
  | 'cabinet'
  | 'area'
  | 'building'
  | 'other';

export const resolveDeviceTypeIconKind = (
  iconId: string | undefined | null
): DeviceTypeIconKind => {
  if (!iconId) return 'other';
  if (iconId === SHAPE_2D_SWITCH_ID || isDeviceTemplateId(iconId)) {
    return 'switch';
  }
  if (iconId === SHAPE_2D_PC_ID) return 'pc';
  if (iconId === SHAPE_2D_CABINET_ID) return 'cabinet';
  return 'other';
};

export const DeviceTypeIcon = ({
  kind,
  iconId,
  sx,
  ...rest
}: {
  kind?: DeviceTypeIconKind;
  iconId?: string | null;
} & SvgIconProps) => {
  const resolved = kind ?? resolveDeviceTypeIconKind(iconId);
  const props = { sx, ...rest };

  switch (resolved) {
    case 'switch':
      return <RouterOutlined {...props} />;
    case 'pc':
      return <ComputerOutlined {...props} />;
    case 'cabinet':
      return <DnsOutlined {...props} />;
    case 'area':
      return <CropSquareOutlined {...props} />;
    case 'building':
      return <ApartmentOutlined {...props} />;
    default:
      return <DevicesOtherOutlined {...props} />;
  }
};
