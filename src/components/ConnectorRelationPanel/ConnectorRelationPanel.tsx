import React, { useCallback, useMemo } from 'react';
import { Box, Typography } from '@mui/material';
import { UiElement } from 'src/components/UiElement/UiElement';
import { useConnector } from 'src/hooks/useConnector';
import { useScene } from 'src/hooks/useScene';
import { useModelStore } from 'src/stores/modelStore';
import { useUiStateStore } from 'src/stores/uiStateStore';
import { useResizeObserver } from 'src/hooks/useResizeObserver';
import { getShape2dPortIfaceName } from 'src/config';
import {
  getConnectorRelationSummary,
  focusShape2dPortOnCanvas,
  TRUNK_RAINBOW_CSS,
  TRUNK_MISMATCH_COLOR
} from 'src/utils';

interface Props {
  connectorId: string;
}

/**
 * Fixed HUD panel (bottom-left) showing cable endpoints + VLAN while selected.
 * Endpoints are clickable — zoom/center on that port and open its device panel.
 */
export const ConnectorRelationPanel = ({ connectorId }: Props) => {
  const connector = useConnector(connectorId);
  const { items: viewItems, connectors: sceneConnectors } = useScene();
  const modelItems = useModelStore((state) => {
    return state.items;
  });
  const uiStateActions = useUiStateStore((state) => {
    return state.actions;
  });
  const rendererEl = useUiStateStore((state) => {
    return state.rendererEl;
  });
  const { size: rendererSize } = useResizeObserver(rendererEl);

  const linkSummary = useMemo(() => {
    return getConnectorRelationSummary({
      anchors: connector.anchors,
      modelItems,
      connectors: sceneConnectors,
      connectorId,
      resolvePortLabel: (itemId, portId) => {
        const modelItem = modelItems.find((item) => {
          return item.id === itemId;
        });
        return getShape2dPortIfaceName(modelItem?.icon ?? '', portId);
      }
    });
  }, [connector.anchors, connectorId, modelItems, sceneConnectors]);

  const jumpToEndpoint = useCallback(
    (itemId: string, portId: string) => {
      focusShape2dPortOnCanvas({
        itemId,
        portId,
        viewItems,
        modelItems,
        rendererSize: {
          width: rendererSize.width || 800,
          height: rendererSize.height || 600
        },
        setZoom: uiStateActions.setZoom,
        setScroll: uiStateActions.setScroll,
        setItemControls: uiStateActions.setItemControls,
        setSelectedItemIds: uiStateActions.setSelectedItemIds,
        setFocusedPortId: uiStateActions.setFocusedPortId,
        setPortAttention: uiStateActions.setPortAttention,
        clearSelectedWaypointIds: () => {
          uiStateActions.setSelectedWaypointIds([]);
        }
      });
    },
    [viewItems, modelItems, rendererSize, uiStateActions]
  );

  const isMismatchLink = linkSummary.linkMode === 'mismatch';
  const isTrunkLink = linkSummary.linkMode === 'trunk';

  return (
    <UiElement
      sx={{
        minWidth: 260,
        maxWidth: 340,
        px: 1.75,
        py: 1.5,
        boxSizing: 'border-box',
        border: isMismatchLink ? '2px solid' : undefined,
        borderColor: isMismatchLink ? TRUNK_MISMATCH_COLOR : undefined
      }}
    >
      <Typography
        sx={{
          fontSize: 11,
          fontWeight: 700,
          letterSpacing: 0.55,
          color: isMismatchLink ? TRUNK_MISMATCH_COLOR : 'text.secondary',
          textTransform: 'uppercase',
          mb: 1
        }}
      >
        {isMismatchLink ? 'Błąd łącza' : 'Połączenie'}
      </Typography>

      {linkSummary.endpoints.length === 0 ? (
        <Typography sx={{ fontSize: 14, color: 'text.secondary' }}>
          Brak endpointów
        </Typography>
      ) : (
        linkSummary.endpoints.map((endpoint, index) => {
          const canJump = Boolean(endpoint.itemId);

          return (
            <Box key={`${endpoint.itemId}-${endpoint.portId}-${index}`}>
              {index > 0 && (
                <Typography
                  sx={{
                    fontSize: 12,
                    color: 'text.disabled',
                    textAlign: 'center',
                    my: 0.35
                  }}
                >
                  ↕
                </Typography>
              )}
              <Box
                component={canJump ? 'button' : 'div'}
                type={canJump ? 'button' : undefined}
                onClick={
                  canJump
                    ? () => {
                        jumpToEndpoint(endpoint.itemId, endpoint.portId);
                      }
                    : undefined
                }
                title={
                  canJump
                    ? 'Przejdź do portu na canvasie'
                    : undefined
                }
                sx={{
                  display: 'block',
                  width: '100%',
                  textAlign: 'left',
                  border: 'none',
                  background: 'transparent',
                  p: 0.75,
                  m: 0,
                  mx: -0.75,
                  borderRadius: 1,
                  cursor: canJump ? 'pointer' : 'default',
                  font: 'inherit',
                  color: 'inherit',
                  transition: 'background-color 0.12s ease',
                  ...(canJump
                    ? {
                        '&:hover': {
                          bgcolor: 'action.hover'
                        },
                        '&:focus-visible': {
                          outline: '2px solid',
                          outlineColor: 'primary.main',
                          outlineOffset: 1
                        }
                      }
                    : {})
                }}
              >
                <Typography
                  sx={{
                    fontSize: 15,
                    fontWeight: 700,
                    lineHeight: 1.3,
                    color: canJump ? 'primary.main' : 'text.primary'
                  }}
                >
                  {endpoint.itemName}
                </Typography>
                <Typography
                  sx={{
                    fontSize: 13,
                    color: 'text.secondary',
                    fontFamily:
                      'ui-monospace, SFMono-Regular, Menlo, monospace'
                  }}
                >
                  {endpoint.portLabel}
                  {endpoint.type === 'trunk'
                    ? ' · trunk'
                    : endpoint.isNonVlanAware
                      ? ' · host'
                      : ''}
                </Typography>
                {endpoint.ip && (
                  <Typography
                    sx={{
                      mt: 0.2,
                      fontSize: 12,
                      fontWeight: 600,
                      color: 'text.primary',
                      fontFamily:
                        'ui-monospace, SFMono-Regular, Menlo, monospace'
                    }}
                  >
                    IP {endpoint.ip}
                  </Typography>
                )}
              </Box>
            </Box>
          );
        })
      )}

      {isMismatchLink && (
        <Typography
          sx={{
            mt: 1,
            fontSize: 12,
            fontWeight: 600,
            color: TRUNK_MISMATCH_COLOR,
            lineHeight: 1.4
          }}
        >
          {linkSummary.endpoints.some((endpoint) => {
            return endpoint.isNonVlanAware;
          })
            ? 'Trunk nie może łączyć się z urządzeniem bez VLAN (np. PC).'
            : 'Trunk nie może łączyć się z portem Access.'}
        </Typography>
      )}

      <Box
        sx={{
          mt: 1.25,
          pt: 1.25,
          borderTop: '1px solid',
          borderColor: 'divider',
          display: 'flex',
          alignItems: 'center',
          gap: 1
        }}
      >
        <Box
          sx={{
            width: 14,
            height: 14,
            borderRadius: '50%',
            flexShrink: 0,
            bgcolor: isTrunkLink
              ? undefined
              : linkSummary.vlanColor ??
                (isMismatchLink ? TRUNK_MISMATCH_COLOR : '#0a0a0a'),
            background: isTrunkLink ? TRUNK_RAINBOW_CSS : undefined,
            border: '1px solid rgba(0,0,0,0.12)'
          }}
        />
        <Typography sx={{ fontSize: 13, fontWeight: 600 }}>
          {linkSummary.vlanLabel}
        </Typography>
      </Box>
    </UiElement>
  );
};
