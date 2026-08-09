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
import { DeviceTypeIcon } from 'src/components/Icons/DeviceTypeIcon';

interface Props {
  connectorId: string;
  /** Fill the sidebar dock cell instead of the floating HUD card. */
  embedded?: boolean;
}

/**
 * Cable endpoints + VLAN while a connector is selected.
 * Endpoints are clickable — zoom/center on that port and open its device panel.
 * Embedded dock keeps readable type and scrolls when the path is long.
 */
export const ConnectorRelationPanel = ({
  connectorId,
  embedded = false
}: Props) => {
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
  const showEndpointVlan = isMismatchLink || linkSummary.vlansDiffer;
  // Slightly denser cards when VIA makes a 3-hop path — still readable.
  const dense = embedded && linkSummary.endpoints.length >= 3;

  return (
    <UiElement
      sx={{
        ...(embedded
          ? {
              width: '100%',
              height: '100%',
              minWidth: 0,
              maxWidth: 'none',
              borderRadius: 0,
              boxShadow: 'none',
              display: 'flex',
              flexDirection: 'column',
              overflow: 'hidden'
            }
          : {
              minWidth: 260,
              maxWidth: 340
            }),
        px: embedded ? 1 : 1.25,
        py: embedded ? 0.75 : 1,
        boxSizing: 'border-box',
        border: isMismatchLink ? '2px solid' : undefined,
        borderColor: isMismatchLink ? TRUNK_MISMATCH_COLOR : undefined
      }}
    >
      <Box
        sx={
          embedded
            ? {
                flex: 1,
                minHeight: 0,
                width: '100%',
                overflowX: 'hidden',
                overflowY: 'auto',
                overscrollBehavior: 'contain',
                scrollbarWidth: 'thin',
                '&::-webkit-scrollbar': {
                  width: 6
                },
                '&::-webkit-scrollbar-thumb': {
                  backgroundColor: 'rgba(100, 116, 139, 0.5)',
                  borderRadius: 3
                }
              }
            : { width: '100%' }
        }
      >
        <Typography
          sx={{
            fontSize: 10,
            fontWeight: 700,
            letterSpacing: 0.5,
            color: isMismatchLink ? TRUNK_MISMATCH_COLOR : 'text.secondary',
            textTransform: 'uppercase',
            mb: 0.5
          }}
        >
          {isMismatchLink ? 'Błąd łącza' : 'Połączenie'}
        </Typography>

        {linkSummary.endpoints.length === 0 ? (
          <Typography sx={{ fontSize: 13, color: 'text.secondary' }}>
            Brak endpointów
          </Typography>
        ) : (
          linkSummary.endpoints.map((endpoint, index) => {
            const canJump = Boolean(endpoint.itemId);
            const isVia = endpoint.role === 'via';

            return (
              <Box key={`${endpoint.itemId}-${endpoint.portId}-${index}`}>
                {index > 0 && (
                  <Box
                    sx={{
                      display: 'flex',
                      justifyContent: 'center',
                      my: dense ? 0.2 : 0.25
                    }}
                  >
                    <Box
                      sx={{
                        width: 2,
                        height: dense ? 8 : 12,
                        bgcolor: 'divider',
                        borderRadius: 1
                      }}
                    />
                  </Box>
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
                      ? isVia
                        ? 'Przejdź do patch panelu'
                        : 'Przejdź do portu na canvasie'
                      : undefined
                  }
                  sx={{
                    display: 'flex',
                    flexDirection: 'column',
                    gap: dense ? 0.15 : 0.25,
                    width: '100%',
                    textAlign: 'left',
                    border: '1px solid',
                    borderColor: isVia ? 'primary.light' : 'divider',
                    background: isVia
                      ? 'rgba(37, 99, 235, 0.04)'
                      : 'transparent',
                    p: dense ? 0.6 : 0.75,
                    m: 0,
                    borderRadius: 1.5,
                    cursor: canJump ? 'pointer' : 'default',
                    font: 'inherit',
                    color: 'inherit',
                    transition: 'border-color 0.15s ease, background 0.15s ease',
                    ...(canJump
                      ? {
                          '&:hover': {
                            bgcolor: 'action.hover',
                            borderColor: 'primary.main'
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
                      fontSize: dense ? 11.5 : 12,
                      fontWeight: 700,
                      lineHeight: 1.2,
                      color: canJump ? 'primary.main' : 'text.primary',
                      display: 'flex',
                      alignItems: 'center',
                      gap: 0.6
                    }}
                  >
                    <DeviceTypeIcon
                      iconId={endpoint.icon}
                      sx={{ fontSize: dense ? 13 : 14 }}
                    />
                    {endpoint.itemName}
                  </Typography>

                  <Box
                    sx={{
                      display: 'flex',
                      flexDirection: 'column',
                      gap: dense ? 0.15 : 0.25,
                      mt: 0.15
                    }}
                  >
                    <Box
                      sx={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 0.6,
                        flexWrap: 'wrap'
                      }}
                    >
                      <Typography
                        sx={{
                          fontSize: 10,
                          color: 'text.secondary',
                          fontWeight: 600,
                          letterSpacing: 0.5
                        }}
                      >
                        PORT
                      </Typography>
                      <Typography
                        sx={{
                          fontSize: 11,
                          fontFamily:
                            'ui-monospace, SFMono-Regular, Menlo, monospace',
                          bgcolor: 'action.selected',
                          px: 0.5,
                          py: 0.1,
                          borderRadius: 1,
                          color: 'text.primary',
                          fontWeight: 500
                        }}
                      >
                        {endpoint.portLabel}
                      </Typography>
                      {isVia ? (
                        <Typography
                          sx={{
                            fontSize: 9,
                            fontWeight: 700,
                            bgcolor: 'primary.main',
                            color: 'white',
                            px: 0.5,
                            py: 0.1,
                            borderRadius: 0.5,
                            lineHeight: 1
                          }}
                        >
                          VIA
                        </Typography>
                      ) : endpoint.isNonVlanAware ? (
                        <Typography
                          sx={{
                            fontSize: 9,
                            color: 'text.secondary',
                            fontWeight: 700,
                            bgcolor: 'action.disabledBackground',
                            px: 0.5,
                            py: 0.1,
                            borderRadius: 0.5,
                            lineHeight: 1
                          }}
                        >
                          HOST
                        </Typography>
                      ) : endpoint.type === 'trunk' ? (
                        <Typography
                          sx={{
                            fontSize: 9,
                            fontWeight: 700,
                            bgcolor: 'info.main',
                            color: 'white',
                            px: 0.5,
                            py: 0.1,
                            borderRadius: 0.5,
                            lineHeight: 1
                          }}
                        >
                          TRUNK
                        </Typography>
                      ) : (
                        <Typography
                          sx={{
                            fontSize: 9,
                            fontWeight: 700,
                            bgcolor: 'success.main',
                            color: 'white',
                            px: 0.5,
                            py: 0.1,
                            borderRadius: 0.5,
                            lineHeight: 1
                          }}
                        >
                          ACCESS
                        </Typography>
                      )}
                    </Box>

                    {showEndpointVlan && !isVia && (
                      <Box
                        sx={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: 0.6
                        }}
                      >
                        <Typography
                          sx={{
                            fontSize: 10,
                            color: 'text.secondary',
                            fontWeight: 600,
                            letterSpacing: 0.5
                          }}
                        >
                          VLAN
                        </Typography>
                        <Box
                          sx={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: 0.5
                          }}
                        >
                          {endpoint.vlanColor && (
                            <Box
                              sx={{
                                width: 6,
                                height: 6,
                                borderRadius: '50%',
                                bgcolor: endpoint.vlanColor
                              }}
                            />
                          )}
                          <Typography
                            sx={{
                              fontSize: 11,
                              fontFamily:
                                'ui-monospace, SFMono-Regular, Menlo, monospace',
                              color: 'text.primary',
                              fontWeight: 500
                            }}
                          >
                            {endpoint.vlan}
                          </Typography>
                        </Box>
                      </Box>
                    )}

                    {endpoint.ip && !isVia && (
                      <Box
                        sx={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: 0.6
                        }}
                      >
                        <Typography
                          sx={{
                            fontSize: 10,
                            color: 'text.secondary',
                            fontWeight: 600,
                            letterSpacing: 0.5
                          }}
                        >
                          IP
                        </Typography>
                        <Typography
                          sx={{
                            fontSize: 11,
                            fontFamily:
                              'ui-monospace, SFMono-Regular, Menlo, monospace',
                            color: 'text.primary',
                            fontWeight: 500
                          }}
                        >
                          {endpoint.ip}
                        </Typography>
                      </Box>
                    )}
                  </Box>
                </Box>
              </Box>
            );
          })
        )}

        {isMismatchLink && (
          <Typography
            sx={{
              mt: 0.5,
              fontSize: 11,
              fontWeight: 600,
              color: TRUNK_MISMATCH_COLOR,
              lineHeight: 1.3
            }}
          >
            {linkSummary.endpoints.some((endpoint) => {
              return endpoint.role !== 'via' && endpoint.isNonVlanAware;
            })
              ? 'Trunk nie może łączyć się z urządzeniem bez VLAN (np. PC).'
              : 'Trunk nie może łączyć się z portem Access.'}
          </Typography>
        )}

        <Box
          sx={{
            mt: 0.75,
            pt: 0.75,
            borderTop: '1px solid',
            borderColor: 'divider',
            display: 'flex',
            alignItems: 'flex-start',
            gap: 1
          }}
        >
          <Box
            sx={{
              width: 12,
              height: 12,
              borderRadius: '50%',
              flexShrink: 0,
              mt: '2px',
              bgcolor: isTrunkLink
                ? undefined
                : linkSummary.vlanColor ??
                  (isMismatchLink ? TRUNK_MISMATCH_COLOR : '#0a0a0a'),
              background: isTrunkLink ? TRUNK_RAINBOW_CSS : undefined,
              border: '1px solid rgba(0,0,0,0.12)'
            }}
          />
          <Typography sx={{ fontSize: 12, fontWeight: 600, lineHeight: 1.35 }}>
            {linkSummary.vlanLabel}
          </Typography>
        </Box>
      </Box>
    </UiElement>
  );
};
