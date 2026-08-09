import React, { useMemo } from 'react';
import { Box, Typography, Portal } from '@mui/material';
import { DeviceShape2d } from 'src/components/Shapes2d/DeviceShape2d';
import {
  TILE_SIZE_2D,
  getModelItemSize,
  getShape2dSize
} from 'src/config';
import type { ModelItem, ViewItem } from 'src/types';
import { getDeviceTemplateLayout, hasNodeDescription } from 'src/utils';

const VIEWPORT = 220;
const PAD = 1.35;

type Props = {
  item: ModelItem;
  viewItem: ViewItem;
  /** Screen position (fixed) — typically near the cursor / button. */
  screen: { x: number; y: number };
};

/**
 * Mini PiP card of a single Plan v3 node (IPAM locate hover).
 */
export const IpamNodePipPreview = ({ item, viewItem, screen }: Props) => {
  const size = useMemo(() => {
    return (
      getModelItemSize(item) ??
      getShape2dSize(item.icon) ??
      getDeviceTemplateLayout(item.icon ?? '')?.size ?? {
        width: 8,
        height: 7
      }
    );
  }, [item]);

  const pxW = size.width * TILE_SIZE_2D;
  const pxH = size.height * TILE_SIZE_2D;
  const zoom = Math.min(
    VIEWPORT / (pxW * PAD),
    VIEWPORT / (pxH * PAD),
    0.55
  );

  const vw = typeof window !== 'undefined' ? window.innerWidth : 1200;
  const vh = typeof window !== 'undefined' ? window.innerHeight : 800;
  const cardW = VIEWPORT + 16;
  const cardH = VIEWPORT + 36;
  const left = Math.min(Math.max(12, screen.x + 18), vw - cardW - 12);
  const top = Math.min(Math.max(12, screen.y + 18), vh - cardH - 12);

  return (
    <Portal>
      <Box
        sx={{
          position: 'fixed',
          left,
          top,
          zIndex: 1400,
          pointerEvents: 'none',
          p: 1,
          borderRadius: 2,
          bgcolor: 'rgba(15, 23, 42, 0.92)',
          border: '1px solid rgba(148, 163, 184, 0.45)',
          boxShadow: '0 12px 40px rgba(0,0,0,0.35)',
          backdropFilter: 'blur(8px)'
        }}
      >
        <Typography
          sx={{
            fontSize: 11,
            fontWeight: 700,
            letterSpacing: 0.4,
            color: 'rgba(226, 232, 240, 0.9)',
            textTransform: 'uppercase',
            mb: 0.75,
            px: 0.25,
            maxWidth: VIEWPORT,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap'
          }}
        >
          Plan v3 · {item.name}
        </Typography>
        <Box
          sx={{
            position: 'relative',
            width: VIEWPORT,
            height: VIEWPORT,
            borderRadius: 1,
            bgcolor: '#e8eef5',
            backgroundImage:
              'radial-gradient(circle at 50% 45%, #f8fafc 0%, #dbe4ee 75%)',
            overflow: 'hidden'
          }}
        >
          <Box
            sx={{
              position: 'absolute',
              left: '50%',
              top: '50%',
              width: pxW,
              height: pxH,
              transform: `translate(-50%, -50%) scale(${zoom})`,
              transformOrigin: 'center center'
            }}
          >
            <DeviceShape2d
              itemId={item.id}
              shapeId={item.icon ?? ''}
              name={item.name}
              color={item.color}
              ports={item.ports}
              svis={item.svis}
              ip={item.dhcp ? 'DHCP' : item.ip}
              nodeIcon={item.nodeIcon}
              hasDescription={hasNodeDescription(item)}
              centered={false}
              width={pxW}
              height={pxH}
              showShadow
              modelItems={[item]}
            />
          </Box>
          {/* Keep viewItem referenced so callers stay honest about placement */}
          <Box sx={{ display: 'none' }} data-tile={`${viewItem.tile.x},${viewItem.tile.y}`} />
        </Box>
      </Box>
    </Portal>
  );
};
