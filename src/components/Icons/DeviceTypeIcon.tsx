import React from 'react';
import LanOutlined from '@mui/icons-material/LanOutlined';
import RouterOutlined from '@mui/icons-material/RouterOutlined';
import ComputerOutlined from '@mui/icons-material/ComputerOutlined';
import DnsOutlined from '@mui/icons-material/DnsOutlined';
import CropSquareOutlined from '@mui/icons-material/CropSquareOutlined';
import ApartmentOutlined from '@mui/icons-material/ApartmentOutlined';
import DevicesOtherOutlined from '@mui/icons-material/DevicesOtherOutlined';
import VideocamOutlined from '@mui/icons-material/VideocamOutlined';
import ViewQuiltOutlined from '@mui/icons-material/ViewQuiltOutlined';
import CameraAltOutlined from '@mui/icons-material/CameraAltOutlined';
import PrintOutlined from '@mui/icons-material/PrintOutlined';
import PhoneInTalkOutlined from '@mui/icons-material/PhoneInTalkOutlined';
import SmartphoneOutlined from '@mui/icons-material/SmartphoneOutlined';
import SensorsOutlined from '@mui/icons-material/SensorsOutlined';
import WifiOutlined from '@mui/icons-material/WifiOutlined';
import StorageOutlined from '@mui/icons-material/StorageOutlined';
import TabletOutlined from '@mui/icons-material/TabletOutlined';
import { SvgIconProps } from '@mui/material';
import {
  SHAPE_2D_CABINET_ID,
  SHAPE_2D_PC_ID,
  SHAPE_2D_CAMERA_ID,
  SHAPE_2D_CAMERA_V2_ID,
  SHAPE_2D_PRINTER_ID,
  SHAPE_2D_VOIP_ID,
  SHAPE_2D_SMARTPHONE_ID,
  SHAPE_2D_IOT_ID,
  SHAPE_2D_AP_ID,
  SHAPE_2D_NAS_ID,
  SHAPE_2D_TABLET_ID,
  SHAPE_2D_SWITCH_ID,
  SHAPE_2D_BLANKING_ID,
  SHAPE_2D_PATCH_PANEL_ID
} from 'src/config';
import { isDeviceTemplateId } from 'src/utils';

export type DeviceTypeIconKind =
  | 'switch'
  | 'router'
  | 'pc'
  | 'cabinet'
  | 'blanking'
  | 'patchPanel'
  | 'area'
  | 'building'
  | 'camera'
  | 'cameraV2'
  | 'printer'
  | 'voip'
  | 'smartphone'
  | 'iot'
  | 'ap'
  | 'nas'
  | 'tablet'
  | 'other';

export const resolveDeviceTypeIconKind = (
  iconId: string | undefined | null
): DeviceTypeIconKind => {
  if (!iconId) return 'other';
  if (iconId === SHAPE_2D_SWITCH_ID || isDeviceTemplateId(iconId)) {
    return 'switch';
  }
  if (iconId === SHAPE_2D_PC_ID) return 'pc';
  if (iconId === SHAPE_2D_CAMERA_ID) return 'camera';
  if (iconId === SHAPE_2D_CAMERA_V2_ID) return 'cameraV2';
  if (iconId === SHAPE_2D_PRINTER_ID) return 'printer';
  if (iconId === SHAPE_2D_VOIP_ID) return 'voip';
  if (iconId === SHAPE_2D_SMARTPHONE_ID) return 'smartphone';
  if (iconId === SHAPE_2D_IOT_ID) return 'iot';
  if (iconId === SHAPE_2D_AP_ID) return 'ap';
  if (iconId === SHAPE_2D_NAS_ID) return 'nas';
  if (iconId === SHAPE_2D_TABLET_ID) return 'tablet';
  if (iconId === SHAPE_2D_CABINET_ID) return 'cabinet';
  if (iconId === SHAPE_2D_BLANKING_ID) return 'blanking';
  if (iconId === SHAPE_2D_PATCH_PANEL_ID) return 'patchPanel';
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
      return <LanOutlined {...props} />;
    case 'router':
      return <RouterOutlined {...props} />;
    case 'pc':
      return <ComputerOutlined {...props} />;
    case 'cabinet':
      return <DnsOutlined {...props} />;
    case 'blanking':
      return <ViewQuiltOutlined {...props} />;
    case 'patchPanel':
      return <ViewQuiltOutlined {...props} />;
    case 'area':
      return <CropSquareOutlined {...props} />;
    case 'building':
      return <ApartmentOutlined {...props} />;
    case 'camera':
      return <VideocamOutlined {...props} />;
    case 'cameraV2':
      return <CameraAltOutlined {...props} />;
    case 'printer':
      return <PrintOutlined {...props} />;
    case 'voip':
      return <PhoneInTalkOutlined {...props} />;
    case 'smartphone':
      return <SmartphoneOutlined {...props} />;
    case 'iot':
      return <SensorsOutlined {...props} />;
    case 'ap':
      return <WifiOutlined {...props} />;
    case 'nas':
      return <StorageOutlined {...props} />;
    case 'tablet':
      return <TabletOutlined {...props} />;
    default:
      return <DevicesOtherOutlined {...props} />;
  }
};
