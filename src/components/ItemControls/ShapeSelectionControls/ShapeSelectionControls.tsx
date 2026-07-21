import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Box,
  Button,
  Divider,
  Stack,
  Typography,
  Alert
} from '@mui/material';
import {
  ExpandMore as ChevronDownIcon,
  ExpandLess as ChevronUpIcon,
  Add as AddIcon,
  EditOutlined as EditIcon
} from '@mui/icons-material';
import { ControlsContainer } from 'src/components/ItemControls/components/ControlsContainer';
import { Section } from 'src/components/ItemControls/components/Section';
import { DeviceCreatorPanel } from 'src/components/ItemControls/DeviceCreator/DeviceCreatorPanel';
import { VirtualServerCreatorPanel } from 'src/components/ItemControls/VirtualServerCreator/VirtualServerCreatorPanel';
import { useUiStateStore } from 'src/stores/uiStateStore';
import { useModelStore } from 'src/stores/modelStore';
import { DeviceTemplate, Icon } from 'src/types';
import {
  SHAPES_2D,
  TILE_SIZE_2D,
  getShape2dSize,
  getShape2dPorts,
  SHAPE_2D_SWITCH_ID,
  SHAPE_2D_PC_ID,
  SHAPE_2D_CAMERA_ID,
  SHAPE_2D_CABINET_ID,
  CABINET_DEFAULT_UNITS,
  getCabinetSize
} from 'src/config';
import { DeviceShape2d } from 'src/components/Shapes2d/DeviceShape2d';
import { CabinetShape2d } from 'src/components/Shapes2d/CabinetShape2d';
import { DeviceTypeIcon } from 'src/components/Icons/DeviceTypeIcon';
import {
  deviceTemplateToIcon,
  upsertSavedDeviceTemplate,
  mergeDeviceTemplatesWithLibrary,
  ensureDeviceTemplateIcons,
  syncDeviceTemplateCache,
  isDeviceTemplateId
} from 'src/utils';

const CATEGORY_ORDER = ['Serwery', 'Switches', 'Stacje'] as const;

const shapeCaption = (shape: Icon) => {
  if (shape.id === SHAPE_2D_SWITCH_ID) return '16× RJ45';
  if (shape.id === SHAPE_2D_PC_ID) return '1× RJ45';
  if (shape.id === SHAPE_2D_CAMERA_ID) return '1× PoE RJ45';

  const ports = getShape2dPorts(shape.id);
  if (!ports.length) {
    return null;
  }

  const rj45 = ports.filter((port) => {
    return (port.media ?? 'RJ45') === 'RJ45';
  }).length;
  const sfp = ports.length - rj45;

  const parts: string[] = [];
  if (rj45) parts.push(`${rj45}× RJ45`);
  if (sfp) parts.push(`${sfp}× SFP`);
  return parts.join(' · ');
};

const ShapePreview = ({ shape }: { shape: Icon }) => {
  if (shape.id === SHAPE_2D_CABINET_ID) {
    const size = getCabinetSize(Math.min(8, CABINET_DEFAULT_UNITS));
    const naturalW = size.width * TILE_SIZE_2D;
    const naturalH = size.height * TILE_SIZE_2D;
    const previewWidth = 120;
    const scale = previewWidth / naturalW;
    const previewHeight = Math.round(naturalH * scale);

    return (
      <Box
        sx={{
          width: previewWidth,
          height: Math.min(72, previewHeight),
          flexShrink: 0,
          overflow: 'hidden',
          borderRadius: 1,
          border: '1px solid',
          borderColor: 'divider',
          bgcolor: '#f8fafc'
        }}
      >
        <Box
          sx={{
            width: naturalW,
            height: naturalH,
            transform: `scale(${scale})`,
            transformOrigin: 'top left'
          }}
        >
          <CabinetShape2d
            centered={false}
            name="SZAFA"
            rackUnits={Math.min(8, CABINET_DEFAULT_UNITS)}
          />
        </Box>
      </Box>
    );
  }

  const size = getShape2dSize(shape.id) ?? { width: 8, height: 7 };
  const naturalW = size.width * TILE_SIZE_2D;
  const naturalH = size.height * TILE_SIZE_2D;
  const previewWidth =
    shape.id === SHAPE_2D_PC_ID || shape.id === SHAPE_2D_CAMERA_ID
      ? 72
      : Math.min(168, naturalW * 0.28);
  const scale = previewWidth / naturalW;
  const previewHeight = Math.round(naturalH * scale);

  return (
    <Box
      sx={{
        width: previewWidth,
        height: previewHeight,
        flexShrink: 0,
        overflow: 'hidden',
        borderRadius: 1,
        border: '1px solid',
        borderColor: 'divider',
        bgcolor: '#f8fafc'
      }}
    >
      <Box
        sx={{
          width: naturalW,
          height: naturalH,
          transform: `scale(${scale})`,
          transformOrigin: 'top left'
        }}
      >
        <DeviceShape2d
          shapeId={shape.id}
          centered={false}
          name={
            shape.id === SHAPE_2D_SWITCH_ID
              ? 'SW-CORE-01'
              : shape.id === SHAPE_2D_PC_ID
                ? 'PC-01'
                : shape.id === SHAPE_2D_CAMERA_ID
                  ? 'CAM-01'
                  : shape.name
          }
        />
      </Box>
    </Box>
  );
};

const ShapeCategory = ({
  title,
  shapes,
  activeId,
  onSelect,
  onEdit,
  footer,
  defaultExpanded = false
}: {
  title: string;
  shapes: Icon[];
  activeId: string | null;
  onSelect: (shape: Icon) => void;
  onEdit?: (shape: Icon) => void;
  footer?: React.ReactNode;
  defaultExpanded?: boolean;
}) => {
  const [isExpanded, setIsExpanded] = useState(defaultExpanded);

  return (
    <Box>
      <Button
        variant="text"
        fullWidth
        onClick={() => {
          setIsExpanded(!isExpanded);
        }}
        sx={{ px: 0.5, py: 0.75, minHeight: 0 }}
      >
        <Stack
          sx={{ width: '100%' }}
          direction="row"
          spacing={1}
          justifyContent="space-between"
          alignItems="center"
        >
          <Typography
            variant="body2"
            color="text.secondary"
            textTransform="uppercase"
            fontWeight={600}
            fontSize={11}
            letterSpacing={0.4}
          >
            {title}
          </Typography>
          {isExpanded ? (
            <ChevronUpIcon color="action" fontSize="small" />
          ) : (
            <ChevronDownIcon color="action" fontSize="small" />
          )}
        </Stack>
      </Button>
      <Divider />

      {isExpanded && (
        <Stack spacing={0.75} sx={{ pt: 1, pb: 0.5 }}>
          {shapes.map((shape) => {
            const isActive = activeId === shape.id;
            const caption = shapeCaption(shape);
            const canEdit = Boolean(onEdit && isDeviceTemplateId(shape.id));

            return (
              <Stack
                key={shape.id}
                direction="row"
                spacing={0.5}
                alignItems="stretch"
              >
                <Button
                  variant={isActive ? 'contained' : 'outlined'}
                  onClick={() => {
                    onSelect(shape);
                  }}
                  sx={{
                    flex: 1,
                    justifyContent: 'flex-start',
                    textTransform: 'none',
                    py: 1.25,
                    px: 1.25,
                    alignItems: 'center',
                    minWidth: 0
                  }}
                >
                  <Stack direction="column" spacing={1} alignItems="stretch" sx={{ width: '100%' }}>
                    <Box sx={{ display: 'flex', justifyContent: 'center', width: '100%' }}>
                      <ShapePreview shape={shape} />
                    </Box>
                    <Box sx={{ textAlign: 'left', minWidth: 0, width: '100%' }}>
                      <Stack direction="row" spacing={0.75} alignItems="center">
                        <DeviceTypeIcon
                          iconId={shape.id}
                          sx={{ fontSize: 18, opacity: 0.85, flexShrink: 0 }}
                        />
                        <Typography fontWeight={600} fontSize={13} noWrap>
                          {shape.name}
                        </Typography>
                      </Stack>
                      {caption && (
                        <Typography
                          variant="caption"
                          color={isActive ? 'inherit' : 'text.secondary'}
                          sx={{ opacity: isActive ? 0.85 : 1 }}
                        >
                          {caption}
                        </Typography>
                      )}
                    </Box>
                  </Stack>
                </Button>
                {canEdit && (
                  <Button
                    variant="outlined"
                    onClick={(event) => {
                      event.stopPropagation();
                      onEdit?.(shape);
                    }}
                    sx={{
                      textTransform: 'none',
                      px: 1,
                      minWidth: 0,
                      flexDirection: 'column',
                      gap: 0.25,
                      fontSize: 10,
                      fontWeight: 700,
                      letterSpacing: 0.3
                    }}
                    title={`Edytuj szablon „${shape.name}”`}
                  >
                    <EditIcon sx={{ fontSize: 16 }} />
                    Edytuj
                  </Button>
                )}
              </Stack>
            );
          })}
          {footer}
        </Stack>
      )}
    </Box>
  );
};

const templateToIcon = deviceTemplateToIcon;

export const ShapeSelectionControls = () => {
  const [isCreating, setIsCreating] = useState(false);
  const [isCreatingServer, setIsCreatingServer] = useState(false);
  const uiStateActions = useUiStateStore((state) => {
    return state.actions;
  });
  const mode = useUiStateStore((state) => {
    return state.mode;
  });
  const icons = useModelStore((state) => {
    return state.icons;
  });
  const deviceTemplates = useModelStore((state) => {
    return state.deviceTemplates ?? [];
  });
  const modelActions = useModelStore((state) => {
    return state.actions;
  });

  // Restore library templates if the current model is missing any.
  useEffect(() => {
    const merged = mergeDeviceTemplatesWithLibrary(deviceTemplates);
    const modelIds = new Set(
      deviceTemplates.map((template) => {
        return template.id;
      })
    );
    const hasMissing = merged.some((template) => {
      return !modelIds.has(template.id);
    });
    if (!hasMissing) return;

    syncDeviceTemplateCache(merged);
    modelActions.set({
      deviceTemplates: merged,
      icons: ensureDeviceTemplateIcons(icons, merged)
    });
    // Only when opening the add-device panel
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const categories = useMemo(() => {
    const byCollection = new Map<string, Icon[]>();

    SHAPES_2D.forEach((shape) => {
      // Cabinet lives under Obiekty section, not device categories.
      if (shape.id === SHAPE_2D_CABINET_ID) return;
      const key = shape.collection || 'Inne';
      const list = byCollection.get(key) ?? [];
      list.push(shape);
      byCollection.set(key, list);
    });

    deviceTemplates.forEach((template) => {
      const icon = templateToIcon(template);
      if (template.kind === 'SERVER') {
        const list = byCollection.get('Serwery') ?? [];
        list.push(icon);
        byCollection.set('Serwery', list);
      } else {
        const list = byCollection.get('Switches') ?? [];
        list.push(icon);
        byCollection.set('Switches', list);
      }
    });

    const ordered: { title: string; shapes: Icon[] }[] = [];

    CATEGORY_ORDER.forEach((name) => {
      const shapes = byCollection.get(name);
      if (!shapes && name !== 'Serwery' && name !== 'Switches') return;
      ordered.push({ title: name, shapes: shapes ?? [] });
      byCollection.delete(name);
    });

    byCollection.forEach((shapes, title) => {
      if (title === 'Obiekty') return;
      ordered.push({ title, shapes });
    });

    return ordered;
  }, [deviceTemplates]);

  const startRectangleDraw = useCallback(
    (kind: 'area' | 'building') => {
      uiStateActions.setMode({
        type: 'RECTANGLE.DRAW',
        showCursor: true,
        id: null,
        kind
      });
    },
    [uiStateActions]
  );

  const cabinetShape = useMemo(() => {
    return SHAPES_2D.find((shape) => {
      return shape.id === SHAPE_2D_CABINET_ID;
    })!;
  }, []);

  const ensureShapeIcon = useCallback(
    (shape: Icon) => {
      const existing = icons.find((icon) => {
        return icon.id === shape.id;
      });
      if (existing && existing.url === shape.url) return;

      modelActions.set({
        icons: existing
          ? icons.map((icon) => {
              return icon.id === shape.id ? shape : icon;
            })
          : [...icons, shape]
      });
    },
    [icons, modelActions]
  );

  const onSelectShape = useCallback(
    (shape: Icon) => {
      ensureShapeIcon(shape);

      uiStateActions.setMode({
        type: 'PLACE_ICON',
        showCursor: true,
        id: shape.id
      });
    },
    [uiStateActions, ensureShapeIcon]
  );

  const onEditTemplate = useCallback(
    (shape: Icon) => {
      uiStateActions.setItemControls({
        type: 'EDIT_DEVICE_TEMPLATE',
        templateId: shape.id
      });
    },
    [uiStateActions]
  );

  const onSaveTemplate = useCallback(
    (template: DeviceTemplate) => {
      const icon = templateToIcon(template);
      const nextTemplates = [...deviceTemplates, template];
      const nextIcons = icons.some((item) => item.id === icon.id)
        ? icons
        : [...icons, icon];

      upsertSavedDeviceTemplate(template);
      syncDeviceTemplateCache(nextTemplates);

      modelActions.set({
        deviceTemplates: nextTemplates,
        icons: nextIcons
      });

      setIsCreating(false);
      setIsCreatingServer(false);

      uiStateActions.setMode({
        type: 'PLACE_ICON',
        showCursor: true,
        id: template.id
      });
    },
    [deviceTemplates, icons, modelActions, uiStateActions]
  );

  const activeId =
    mode.type === 'PLACE_ICON' && mode.id ? mode.id : null;

  if (isCreating) {
    return (
      <DeviceCreatorPanel
        onCancel={() => {
          setIsCreating(false);
        }}
        onSave={onSaveTemplate}
      />
    );
  }

  if (isCreatingServer) {
    return (
      <VirtualServerCreatorPanel
        onCancel={() => {
          setIsCreatingServer(false);
        }}
        onSave={onSaveTemplate}
      />
    );
  }

  return (
    <ControlsContainer
      header={
        <Section sx={{ position: 'sticky', top: 0, pt: 6, pb: 3 }}>
          <Stack spacing={2}>
            <Typography variant="body2" color="text.secondary">
              Urządzenia
            </Typography>
            <Alert severity="info">
              Wybierz urządzenie, potem kliknij na canvas. Connector łączy
              porty RJ45.
            </Alert>
          </Stack>
        </Section>
      }
    >
      <Section>
        <Stack spacing={1.5}>
          {categories.map((category) => {
            const isSwitches = category.title === 'Switches';
            const isServers = category.title === 'Serwery';

            return (
              <ShapeCategory
                key={category.title}
                title={category.title}
                shapes={category.shapes}
                activeId={activeId}
                onSelect={onSelectShape}
                onEdit={(isSwitches || isServers) ? onEditTemplate : undefined}
                footer={
                  (isSwitches || isServers) ? (
                    <Button
                      variant="outlined"
                      startIcon={<AddIcon />}
                      onClick={() => {
                        if (isServers) setIsCreatingServer(true);
                        else setIsCreating(true);
                      }}
                      sx={{
                        justifyContent: 'flex-start',
                        textTransform: 'none',
                        py: 1,
                        borderStyle: 'dashed'
                      }}
                    >
                      Dodaj nowy…
                    </Button>
                  ) : null
                }
              />
            );
          })}

          <ShapeCategory
            title="Kształty"
            shapes={[]}
            activeId={null}
            onSelect={() => {}}
            footer={
              <Button
                variant={
                  mode.type === 'RECTANGLE.DRAW' &&
                  (mode.kind ?? 'area') === 'area'
                    ? 'contained'
                    : 'outlined'
                }
                onClick={() => {
                  startRectangleDraw('area');
                }}
                sx={{
                  justifyContent: 'flex-start',
                  textTransform: 'none',
                  py: 1.25,
                  px: 1.25
                }}
              >
                <Stack direction="row" spacing={1.25} alignItems="center">
                  <DeviceTypeIcon kind="area" sx={{ fontSize: 22 }} />
                  <Box sx={{ textAlign: 'left' }}>
                    <Typography fontWeight={600} fontSize={13}>
                      Obszar
                    </Typography>
                    <Typography variant="caption" color="text.secondary">
                      Kolorowy prostokąt pod urządzeniami
                    </Typography>
                  </Box>
                </Stack>
              </Button>
            }
          />

          <ShapeCategory
            title="Obiekty"
            shapes={[cabinetShape]}
            activeId={activeId}
            onSelect={onSelectShape}
            footer={
              <Button
                variant={
                  mode.type === 'RECTANGLE.DRAW' && mode.kind === 'building'
                    ? 'contained'
                    : 'outlined'
                }
                onClick={() => {
                  startRectangleDraw('building');
                }}
                sx={{
                  justifyContent: 'flex-start',
                  textTransform: 'none',
                  py: 1.25,
                  px: 1.25
                }}
              >
                <Stack direction="row" spacing={1.25} alignItems="center">
                  <DeviceTypeIcon kind="building" sx={{ fontSize: 22 }} />
                  <Box sx={{ textAlign: 'left' }}>
                    <Typography fontWeight={600} fontSize={13}>
                      Budynek
                    </Typography>
                    <Typography variant="caption" color="text.secondary">
                      Obszar z obrysem budynku
                    </Typography>
                  </Box>
                </Stack>
              </Button>
            }
          />
        </Stack>
      </Section>
    </ControlsContainer>
  );
};
