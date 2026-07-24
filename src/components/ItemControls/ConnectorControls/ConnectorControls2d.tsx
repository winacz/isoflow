import React, { useCallback, useMemo } from 'react';
import {
  Box,
  Checkbox,
  FormControlLabel,
  Stack,
  Typography,
  Button
} from '@mui/material';
import { useConnector } from 'src/hooks/useConnector';
import { useScene } from 'src/hooks/useScene';
import { useModelStore } from 'src/stores/modelStore';
import { useUiStateStore } from 'src/stores/uiStateStore';
import { collectModelItemVlans, getConnectorRelationSummary } from 'src/utils';
import { ControlsContainer } from '../components/ControlsContainer';
import { Section } from '../components/Section';
import { DeleteButton } from '../components/DeleteButton';

interface Props {
  id: string;
}

/**
 * Plan (2D) connector side panel.
 * Access / mismatch cables: delete only (no colour / dash style UI).
 * Trunk cables: checklist of switch VLANs carried on the link.
 */
export const ConnectorControls2d = ({ id }: Props) => {
  const uiStateActions = useUiStateStore((state) => {
    return state.actions;
  });
  const connector = useConnector(id);
  const { deleteConnector, updateModelItem, connectors } = useScene();
  const modelItems = useModelStore((state) => {
    return state.items;
  });

  const linkSummary = useMemo(() => {
    return getConnectorRelationSummary({
      anchors: connector.anchors,
      modelItems,
      connectors,
      connectorId: id
    });
  }, [connector.anchors, connectors, id, modelItems]);

  const isTrunkLink = linkSummary.linkMode === 'trunk';

  const trunkEndpoints = useMemo(() => {
    return linkSummary.endpoints.filter((endpoint) => {
      return endpoint.type === 'trunk' && Boolean(endpoint.portId);
    });
  }, [linkSummary.endpoints]);

  const availableVlans = useMemo(() => {
    const vlans = new Set<string>();
    trunkEndpoints.forEach((endpoint) => {
      const item = modelItems.find((candidate) => {
        return candidate.id === endpoint.itemId;
      });
      collectModelItemVlans(item).forEach((vlan) => {
        vlans.add(vlan);
      });
    });
    return Array.from(vlans).sort((a, b) => {
      return a.localeCompare(b, undefined, { numeric: true });
    });
  }, [modelItems, trunkEndpoints]);

  /**
   * Effective allowed list: explicit port config when present, otherwise
   * every VLAN known on the connected switches (all checked by default).
   */
  const allowedVlans = useMemo(() => {
    const explicit = trunkEndpoints
      .map((endpoint) => {
        const item = modelItems.find((candidate) => {
          return candidate.id === endpoint.itemId;
        });
        return item?.ports?.[endpoint.portId]?.allowedVlans;
      })
      .find((list) => {
        return Array.isArray(list);
      });

    if (explicit) {
      return Array.from(
        new Set(
          explicit
            .map((vlan) => {
              return vlan.trim();
            })
            .filter(Boolean)
        )
      ).sort((a, b) => {
        return a.localeCompare(b, undefined, { numeric: true });
      });
    }

    return availableVlans;
  }, [availableVlans, modelItems, trunkEndpoints]);

  const writeAllowedVlans = useCallback(
    (next: string[]) => {
      const sorted = Array.from(new Set(next)).sort((a, b) => {
        return a.localeCompare(b, undefined, { numeric: true });
      });

      trunkEndpoints.forEach((endpoint) => {
        const item = modelItems.find((candidate) => {
          return candidate.id === endpoint.itemId;
        });
        if (!item) return;
        const current = item.ports?.[endpoint.portId] ?? {};
        updateModelItem(endpoint.itemId, {
          ports: {
            ...(item.ports ?? {}),
            [endpoint.portId]: {
              ...current,
              type: 'trunk',
              allowedVlans: sorted
            }
          }
        });
      });
    },
    [modelItems, trunkEndpoints, updateModelItem]
  );

  const toggleVlan = useCallback(
    (vlan: string) => {
      const isOn = allowedVlans.includes(vlan);
      writeAllowedVlans(
        isOn
          ? allowedVlans.filter((entry) => {
              return entry !== vlan;
            })
          : [...allowedVlans, vlan]
      );
    },
    [allowedVlans, writeAllowedVlans]
  );

  return (
    <ControlsContainer>
      {isTrunkLink && (
        <Section title="VLAN-y na trunku">
          <Typography
            variant="body2"
            color="text.secondary"
            sx={{ mb: 1.25, fontSize: 12, lineHeight: 1.35 }}
          >
            Domyślnie zaznaczone są wszystkie VLAN-y ze switchy na końcach
            łącza. Odznacz, aby wyłączyć z trunku.
          </Typography>

          {availableVlans.length === 0 ? (
            <Typography
              variant="body2"
              color="text.secondary"
              sx={{ fontSize: 12, fontStyle: 'italic' }}
            >
              Brak VLAN-ów na podłączonych switchach. Dodaj VLAN na porcie lub
              SVI, a pojawi się na tej liście.
            </Typography>
          ) : (
            <Stack spacing={0.25}>
              <Stack direction="row" spacing={1} sx={{ mb: 0.5 }}>
                <Button
                  size="small"
                  onClick={() => {
                    writeAllowedVlans(availableVlans);
                  }}
                >
                  Zaznacz wszystkie
                </Button>
                <Button
                  size="small"
                  onClick={() => {
                    writeAllowedVlans([]);
                  }}
                >
                  Odznacz wszystkie
                </Button>
              </Stack>
              {availableVlans.map((vlan) => {
                return (
                  <FormControlLabel
                    key={vlan}
                    sx={{
                      mx: 0,
                      py: 0.15,
                      '& .MuiFormControlLabel-label': { fontSize: 13 }
                    }}
                    control={
                      <Checkbox
                        size="small"
                        checked={allowedVlans.includes(vlan)}
                        onChange={() => {
                          toggleVlan(vlan);
                        }}
                      />
                    }
                    label={`VLAN ${vlan}`}
                  />
                );
              })}
            </Stack>
          )}
        </Section>
      )}

      <Section>
        <Box>
          <DeleteButton
            onClick={() => {
              uiStateActions.setItemControls(null);
              deleteConnector(connector.id);
            }}
          />
        </Box>
      </Section>
    </ControlsContainer>
  );
};
