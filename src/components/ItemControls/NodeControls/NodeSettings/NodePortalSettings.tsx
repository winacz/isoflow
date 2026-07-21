import React, { useCallback, useMemo, useState } from 'react';
import {
  Box,
  Button,
  List,
  ListItemButton,
  ListItemText,
  Stack,
  TextField,
  Typography
} from '@mui/material';
import LinkOutlined from '@mui/icons-material/LinkOutlined';
import OpenInNewOutlined from '@mui/icons-material/OpenInNewOutlined';
import LinkOffOutlined from '@mui/icons-material/LinkOffOutlined';
import EditOutlined from '@mui/icons-material/EditOutlined';
import CloseOutlined from '@mui/icons-material/CloseOutlined';
import { ModelItem } from 'src/types';
import { useModelStore } from 'src/stores/modelStore';
import { useUiStateStore } from 'src/stores/uiStateStore';
import { useView } from 'src/hooks/useView';
import { useResizeObserver } from 'src/hooks/useResizeObserver';
import {
  CoordsUtils,
  findPlan2dView,
  getPortalDisplayLabel,
  listPlan2dPortalTargets,
  planPortalJump,
  type PortalTarget
} from 'src/utils';
import { Section } from '../../components/Section';

interface Props {
  modelItem: ModelItem;
  onModelItemUpdated: (updates: Partial<ModelItem>) => void;
}

type CreatorMode = 'closed' | 'create' | 'edit';

export const NodePortalSettings = ({
  modelItem,
  onModelItemUpdated
}: Props) => {
  const model = useModelStore((state) => {
    return state;
  });
  const uiStateActions = useUiStateStore((state) => {
    return state.actions;
  });
  const rendererEl = useUiStateStore((state) => {
    return state.rendererEl;
  });
  const { size: rendererSize } = useResizeObserver(rendererEl);
  const { changeView } = useView();
  const [mode, setMode] = useState<CreatorMode>('closed');
  const [query, setQuery] = useState('');

  const targets = useMemo(() => {
    return listPlan2dPortalTargets(model);
  }, [model]);

  const selectedLabel = useMemo(() => {
    if (!modelItem.portal) return null;
    return getPortalDisplayLabel(modelItem.portal, model);
  }, [modelItem.portal, model]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return targets;
    return targets.filter((target: PortalTarget) => {
      return (
        target.label.toLowerCase().includes(q) ||
        target.kindLabel.toLowerCase().includes(q)
      );
    });
  }, [targets, query]);

  const jumpToPortal = useCallback(() => {
    const portal = modelItem.portal;
    if (!portal) return;

    const jump = planPortalJump({
      portal,
      model,
      rendererSize
    });
    if (!jump) return;

    changeView(jump.planViewId, model);
    uiStateActions.setProjectionMode('TWO_D');
    uiStateActions.setZoom(jump.zoom);
    uiStateActions.setScroll({
      position: jump.scroll,
      offset: CoordsUtils.zero()
    });
    uiStateActions.setMode({
      type: 'CURSOR',
      showCursor: true,
      mousedownItem: null
    });
    uiStateActions.clearSelectedItemIds();

    if (jump.select.type === 'ITEM') {
      uiStateActions.setItemControls({ type: 'ITEM', id: jump.select.id });
      uiStateActions.setSelectedItemIds([jump.select.id]);
    } else {
      uiStateActions.setItemControls({
        type: 'RECTANGLE',
        id: jump.select.id
      });
    }
  }, [modelItem.portal, model, changeView, uiStateActions, rendererSize]);

  const closeCreator = () => {
    setMode('closed');
    setQuery('');
  };

  const applyTarget = (target: PortalTarget) => {
    onModelItemUpdated({
      portal: {
        targetType: target.targetType,
        targetId: target.targetId,
        label: target.label
      }
    });
    closeCreator();
  };

  const removePortal = () => {
    onModelItemUpdated({ portal: undefined });
    closeCreator();
  };

  const planMissing = !findPlan2dView(model);
  const creatorOpen = mode === 'create' || mode === 'edit';

  return (
    <Section title="Portal 2D">
      <Stack spacing={1.25}>
        {planMissing ? (
          <Typography sx={{ fontSize: 12, color: 'text.secondary' }}>
            Brak widoku „Plan” — portal wymaga mapy 2D.
          </Typography>
        ) : creatorOpen ? (
          <Stack spacing={1}>
            <Typography sx={{ fontSize: 12, fontWeight: 600 }}>
              {mode === 'edit' ? 'Zmień cel portalu' : 'Utwórz portal'}
            </Typography>
            <TextField
              size="small"
              autoFocus
              fullWidth
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
              }}
              placeholder="Szukaj urządzenia, szafy, obszaru…"
              inputProps={{ 'aria-label': 'Szukaj celu portalu' }}
            />
            <List
              dense
              disablePadding
              sx={{
                maxHeight: 220,
                overflowY: 'auto',
                border: '1px solid',
                borderColor: 'divider',
                borderRadius: 1
              }}
            >
              {filtered.length === 0 ? (
                <Typography
                  sx={{
                    px: 1.5,
                    py: 1.5,
                    fontSize: 12,
                    color: 'text.secondary'
                  }}
                >
                  Brak wyników
                </Typography>
              ) : (
                filtered.map((target: PortalTarget) => {
                  const isCurrent =
                    modelItem.portal?.targetType === target.targetType &&
                    modelItem.portal?.targetId === target.targetId;
                  return (
                    <ListItemButton
                      key={`${target.targetType}:${target.targetId}`}
                      selected={isCurrent}
                      onClick={() => {
                        applyTarget(target);
                      }}
                      sx={{ alignItems: 'flex-start', py: 0.75 }}
                    >
                      <ListItemText
                        primary={target.label}
                        secondary={target.kindLabel}
                        primaryTypographyProps={{
                          fontSize: 13,
                          fontWeight: 600
                        }}
                        secondaryTypographyProps={{ fontSize: 11 }}
                      />
                    </ListItemButton>
                  );
                })
              )}
            </List>
            <Button
              size="small"
              color="inherit"
              startIcon={<CloseOutlined />}
              onClick={closeCreator}
              sx={{ justifyContent: 'flex-start', textTransform: 'none' }}
            >
              Anuluj
            </Button>
          </Stack>
        ) : modelItem.portal ? (
          <Stack spacing={0.75}>
            <Button
              variant="contained"
              size="small"
              startIcon={<OpenInNewOutlined />}
              onClick={jumpToPortal}
              sx={{ justifyContent: 'flex-start', textTransform: 'none' }}
            >
              Przejdź: {selectedLabel}
            </Button>
            <Stack direction="row" spacing={0.5}>
              <Button
                size="small"
                color="inherit"
                startIcon={<EditOutlined />}
                onClick={() => {
                  setQuery('');
                  setMode('edit');
                }}
                sx={{ textTransform: 'none' }}
              >
                Zmień
              </Button>
              <Button
                size="small"
                color="inherit"
                startIcon={<LinkOffOutlined />}
                onClick={removePortal}
                sx={{ textTransform: 'none' }}
              >
                Usuń
              </Button>
            </Stack>
          </Stack>
        ) : (
          <Box>
            <Button
              variant="outlined"
              size="small"
              fullWidth
              startIcon={<LinkOutlined />}
              onClick={() => {
                setQuery('');
                setMode('create');
              }}
              sx={{ justifyContent: 'flex-start', textTransform: 'none' }}
            >
              Utwórz portal
            </Button>
            <Typography
              sx={{ mt: 0.75, fontSize: 11, color: 'text.secondary' }}
            >
              Skrót do urządzenia, szafy lub obszaru na mapie Plan.
            </Typography>
          </Box>
        )}
      </Stack>
    </Section>
  );
};
