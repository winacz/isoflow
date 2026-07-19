import React, { useMemo } from 'react';
import { Box, Typography } from '@mui/material';
import { UiElement } from 'src/components/UiElement/UiElement';
import { useConnector } from 'src/hooks/useConnector';
import { useModelStore } from 'src/stores/modelStore';
import { getShape2dPortIfaceName } from 'src/config';
import {
  getConnectorRelationSummary,
  TRUNK_RAINBOW_CSS,
  TRUNK_MISMATCH_COLOR
} from 'src/utils';

interface Props {
  connectorId: string;
}

/**
 * Fixed HUD panel (bottom-left) showing cable endpoints + VLAN while selected.
 */
export const ConnectorRelationPanel = ({ connectorId }: Props) => {
  const connector = useConnector(connectorId);
  const modelItems = useModelStore((state) => {
    return state.items;
  });

  const linkSummary = useMemo(() => {
    return getConnectorRelationSummary({
      anchors: connector.anchors,
      modelItems,
      resolvePortLabel: (itemId, portId) => {
        const modelItem = modelItems.find((item) => {
          return item.id === itemId;
        });
        return getShape2dPortIfaceName(modelItem?.icon ?? '', portId);
      }
    });
  }, [connector.anchors, modelItems]);

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
              <Typography
                sx={{
                  fontSize: 15,
                  fontWeight: 700,
                  lineHeight: 1.3,
                  color: 'text.primary'
                }}
              >
                {endpoint.itemName}
              </Typography>
              <Typography
                sx={{
                  fontSize: 13,
                  color: 'text.secondary',
                  fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace'
                }}
              >
                {endpoint.portLabel}
                {endpoint.type === 'trunk'
                  ? ' · trunk'
                  : endpoint.isNonVlanAware
                    ? ' · host'
                    : ''}
              </Typography>
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
