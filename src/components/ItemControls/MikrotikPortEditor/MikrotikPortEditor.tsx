import React, { useCallback, useMemo, useState } from 'react';
import {
  Box,
  Button,
  Stack,
  Typography,
  ToggleButton,
  ToggleButtonGroup,
  IconButton
} from '@mui/material';
import {
  DeleteOutline as DeleteIcon
} from '@mui/icons-material';
import { ControlsContainer } from 'src/components/ItemControls/components/ControlsContainer';
import { Section } from 'src/components/ItemControls/components/Section';
import { Rj45Port } from 'src/components/Shapes2d/Rj45Port';
import {
  TILE_SIZE_2D,
  Shape2dPort,
  Shape2dPortMedia,
  getShape2dSize
} from 'src/config';
import { getMikrotikIcon } from 'src/fixtures/mikrotikIcons';
import {
  getMikrotikPorts,
  setMikrotikPorts,
  clearMikrotikPorts,
  generateId
} from 'src/utils';

interface Props {
  iconId: string;
  onCancel: () => void;
  onSaved: () => void;
}

/**
 * Click tiles on the Mikrotik SVG faceplate to place RJ45 / SFP jacks.
 * Saved layouts are used by the canvas for cabling hit-tests.
 */
export const MikrotikPortEditor = ({ iconId, onCancel, onSaved }: Props) => {
  const icon = getMikrotikIcon(iconId);
  const [ports, setPorts] = useState<Shape2dPort[]>(() => {
    return getMikrotikPorts(iconId).map((port) => {
      return { ...port, tile: { ...port.tile } };
    });
  });
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [media, setMedia] = useState<Shape2dPortMedia>('RJ45');

  const size = getShape2dSize(iconId) ?? { width: 60, height: 9 };
  const naturalW = size.width * TILE_SIZE_2D;
  const naturalH = size.height * TILE_SIZE_2D;
  const previewWidth = Math.min(420, naturalW * 0.28);
  const scale = previewWidth / naturalW;
  const previewHeight = Math.round(naturalH * scale);

  const renumber = useCallback((list: Shape2dPort[]) => {
    const sorted = [...list].sort((a, b) => {
      if (a.tile.y !== b.tile.y) return a.tile.y - b.tile.y;
      return a.tile.x - b.tile.x;
    });
    return sorted.map((port, index) => {
      return { ...port, label: String(index + 1) };
    });
  }, []);

  const onCanvasClick = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      const rect = e.currentTarget.getBoundingClientRect();
      const localX = (e.clientX - rect.left) / scale;
      const localY = (e.clientY - rect.top) / scale;
      const tileX = Math.max(
        0,
        Math.min(size.width - 1, Math.floor(localX / TILE_SIZE_2D))
      );
      const tileY = Math.max(
        0,
        Math.min(size.height - 1, Math.floor(localY / TILE_SIZE_2D))
      );

      const existing = ports.find((port) => {
        return port.tile.x === tileX && port.tile.y === tileY;
      });
      if (existing) {
        setSelectedId(existing.id);
        return;
      }

      const side = tileY < size.height / 2 ? 'TOP' : 'BOTTOM';
      const next: Shape2dPort = {
        id: generateId(),
        tile: { x: tileX, y: tileY },
        side,
        media,
        label: String(ports.length + 1)
      };
      setPorts((prev) => {
        return renumber([...prev, next]);
      });
      setSelectedId(next.id);
    },
    [ports, scale, size, media, renumber]
  );

  const removeSelected = useCallback(() => {
    if (!selectedId) return;
    setPorts((prev) => {
      return renumber(
        prev.filter((port) => {
          return port.id !== selectedId;
        })
      );
    });
    setSelectedId(null);
  }, [selectedId, renumber]);

  const onSave = useCallback(() => {
    setMikrotikPorts(iconId, renumber(ports));
    onSaved();
  }, [iconId, ports, renumber, onSaved]);

  const onClear = useCallback(() => {
    clearMikrotikPorts(iconId);
    setPorts([]);
    setSelectedId(null);
  }, [iconId]);

  const selected = useMemo(() => {
    return ports.find((port) => {
      return port.id === selectedId;
    });
  }, [ports, selectedId]);

  if (!icon) {
    return (
      <Typography sx={{ p: 2 }} color="text.secondary" variant="body2">
        Nie znaleziono urządzenia Mikrotik.
      </Typography>
    );
  }

  return (
    <ControlsContainer>
      <Box sx={{ px: 2, pt: 2, pb: 1 }}>
        <Typography variant="subtitle1" fontWeight={700}>
          Edytuj porty · {icon.name}
        </Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
          Kliknij na panelu (siatka 1U {size.width}×{size.height}), żeby
          dodać jack. Klik w istniejący — zaznacza.
        </Typography>
      </Box>

      <Section>
        <Stack spacing={1.5}>
          <ToggleButtonGroup
            exclusive
            size="small"
            value={media}
            onChange={(_e, value: Shape2dPortMedia | null) => {
              if (value) setMedia(value);
            }}
          >
            <ToggleButton value="RJ45">RJ45</ToggleButton>
            <ToggleButton value="SFP">SFP</ToggleButton>
          </ToggleButtonGroup>

          <Box
            onClick={onCanvasClick}
            sx={{
              position: 'relative',
              width: previewWidth,
              height: previewHeight,
              borderRadius: 1,
              border: '1px solid',
              borderColor: 'divider',
              bgcolor: '#f8fafc',
              overflow: 'hidden',
              cursor: 'crosshair',
              userSelect: 'none'
            }}
          >
            <Box
              sx={{
                position: 'absolute',
                left: 0,
                top: 0,
                width: naturalW,
                height: naturalH,
                transform: `scale(${scale})`,
                transformOrigin: 'top left'
              }}
            >
              <Box
                component="img"
                src={icon.url}
                alt={icon.name}
                sx={{
                  position: 'absolute',
                  inset: 0,
                  width: '100%',
                  height: '100%',
                  objectFit: 'fill',
                  pointerEvents: 'none'
                }}
              />
              {ports.map((port) => {
                return (
                  <Box
                    key={port.id}
                    sx={{
                      position: 'absolute',
                      left: port.tile.x * TILE_SIZE_2D,
                      top: port.tile.y * TILE_SIZE_2D,
                      width: TILE_SIZE_2D,
                      height: TILE_SIZE_2D,
                      outline:
                        port.id === selectedId
                          ? '2px solid #2563eb'
                          : undefined,
                      outlineOffset: -2,
                      zIndex: 2
                    }}
                  >
                    <Rj45Port
                      side={port.side}
                      portLabel={port.label}
                      media={port.media ?? 'RJ45'}
                      compactLabel
                    />
                  </Box>
                );
              })}
            </Box>
          </Box>

          <Stack direction="row" spacing={1} alignItems="center">
            <Typography variant="body2" color="text.secondary">
              Portów: {ports.length}
              {selected
                ? ` · zaznaczony #${selected.label} (${selected.tile.x},${selected.tile.y})`
                : ''}
            </Typography>
            <Box sx={{ flex: 1 }} />
            <IconButton
              size="small"
              disabled={!selectedId}
              onClick={removeSelected}
              title="Usuń zaznaczony"
            >
              <DeleteIcon fontSize="small" />
            </IconButton>
          </Stack>

          <Stack direction="row" spacing={1}>
            <Button variant="outlined" onClick={onCancel}>
              Anuluj
            </Button>
            <Button color="warning" variant="text" onClick={onClear}>
              Przywróć domyślne
            </Button>
            <Box sx={{ flex: 1 }} />
            <Button variant="contained" onClick={onSave}>
              Zapisz porty
            </Button>
          </Stack>
        </Stack>
      </Section>
    </ControlsContainer>
  );
};
