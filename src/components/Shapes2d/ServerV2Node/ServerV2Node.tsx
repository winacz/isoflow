import React, { useMemo, useState } from 'react';
import {
  Box,
  Dialog,
  DialogContent,
  DialogTitle,
  IconButton
} from '@mui/material';
import CloseIcon from '@mui/icons-material/Close';
import { TILE_SIZE_2D } from 'src/config';
import type { ModelItem } from 'src/types';
import type { DeviceTemplateLayout } from 'src/utils/deviceTemplateLayout';
import { DeviceShape2d } from 'src/components/Shapes2d/DeviceShape2d';
import type { UnifiedNetworkModel } from './types';
import { ServerV2LogicalDiagram } from './ServerV2LogicalDiagram';

interface Props {
  jsonText: string;
  layout: DeviceTemplateLayout;
  shapeId: string;
  itemId?: string;
  name?: string;
  width?: number;
  height?: number;
  centered?: boolean;
  showShadow?: boolean;
  color?: string;
  ports?: ModelItem['ports'];
  svis?: ModelItem['svis'];
  connectedPortIds?: ReadonlySet<string> | string[];
  mismatchPortIds?: ReadonlySet<string> | string[];
  focusedPortIds?: ReadonlySet<string> | string[] | null;
  peerHighlightPortIds?: ReadonlySet<string> | string[];
  attentionPortId?: string | null;
  attentionToken?: number | null;
  modelItems?: ModelItem[];
  vlanBorderColor?: string | null;
  /** Faceplate button to open logical dialog (off in workshop preview). */
  showLogicalButton?: boolean;
}

/**
 * Rack face = switch chassis (DeviceShape2d).
 * Logical topology opens from the faceplate button.
 */
export const ServerV2Node = ({
  jsonText,
  layout,
  shapeId,
  itemId,
  name,
  width,
  height,
  centered = true,
  showShadow = true,
  color,
  ports,
  svis,
  connectedPortIds,
  mismatchPortIds,
  focusedPortIds = null,
  peerHighlightPortIds,
  attentionPortId = null,
  attentionToken = null,
  modelItems,
  vlanBorderColor = null,
  showLogicalButton = true
}: Props) => {
  const [isLogicalViewOpen, setIsLogicalViewOpen] = useState(false);

  const model: UnifiedNetworkModel | null = useMemo(() => {
    try {
      return JSON.parse(jsonText) as UnifiedNetworkModel;
    } catch {
      return null;
    }
  }, [jsonText]);

  const pxWidth = width ?? layout.size.width * TILE_SIZE_2D;
  const pxHeight = height ?? layout.size.height * TILE_SIZE_2D;

  if (!model) {
    return (
      <Box sx={{ p: 2, color: 'error.main', fontSize: 12 }}>Invalid JSON</Box>
    );
  }

  const hostTitle =
    name?.trim() || model.host.name || model.host.id || 'Server V2';
  const subtitle = `${model.computeNodes.length} VM · ${model.host.pNICs.length} NIC`;
  const btnH = Math.max(18, Math.min(24, Math.round(pxHeight * 0.22)));
  const btnW = Math.max(72, Math.min(96, Math.round(pxWidth * 0.14)));

  return (
    <>
      <Box
        sx={{
          position: centered ? 'absolute' : 'relative',
          width: pxWidth,
          height: pxHeight,
          left: centered ? -pxWidth / 2 : 0,
          top: centered ? -pxHeight / 2 : 0,
          overflow: 'visible',
          pointerEvents: 'none'
        }}
      >
        <DeviceShape2d
          itemId={itemId}
          shapeId={shapeId}
          name={hostTitle}
          subtitle={subtitle}
          width={pxWidth}
          height={pxHeight}
          centered={false}
          layoutOverride={layout}
          ports={ports}
          svis={svis}
          connectedPortIds={connectedPortIds}
          mismatchPortIds={mismatchPortIds}
          focusedPortIds={focusedPortIds}
          peerHighlightPortIds={peerHighlightPortIds}
          attentionPortId={attentionPortId}
          attentionToken={attentionToken}
          modelItems={modelItems}
          color={color}
          showShadow={showShadow}
          vlanBorderColor={vlanBorderColor}
        />

        {showLogicalButton && (
          <Box
            component="button"
            type="button"
            onPointerDown={(e) => {
              e.stopPropagation();
            }}
            onClick={(e) => {
              e.stopPropagation();
              setIsLogicalViewOpen(true);
            }}
            sx={{
              pointerEvents: 'auto',
              position: 'absolute',
              right: Math.max(8, pxWidth * 0.015),
              bottom: Math.max(6, pxHeight * 0.08),
              width: btnW,
              height: btnH,
              cursor: 'pointer',
              bgcolor: '#f8fafc',
              color: '#475569',
              border: '1px solid #cbd5e1',
              borderRadius: '4px',
              fontSize: Math.max(9, Math.min(11, btnH * 0.45)),
              fontWeight: 700,
              lineHeight: 1,
              p: 0,
              zIndex: 9,
              '&:hover': { bgcolor: '#e2e8f0' }
            }}
          >
            Pokaż węzeł
          </Box>
        )}
      </Box>

      <Dialog
        open={isLogicalViewOpen}
        onClose={() => {
          setIsLogicalViewOpen(false);
        }}
        maxWidth="xl"
        fullWidth
      >
        <DialogTitle
          sx={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            bgcolor: '#f1f5f9',
            p: 2
          }}
        >
          Logical Network Topology - {model.host.name || model.host.id}
          <IconButton
            onClick={() => {
              setIsLogicalViewOpen(false);
            }}
            size="small"
          >
            <CloseIcon />
          </IconButton>
        </DialogTitle>
        <DialogContent
          sx={{ p: 4, bgcolor: '#ffffff', minHeight: '60vh', overflow: 'auto' }}
        >
          <ServerV2LogicalDiagram model={model} />
        </DialogContent>
      </Dialog>
    </>
  );
};
