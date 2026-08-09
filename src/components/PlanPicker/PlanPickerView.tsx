import React, { useCallback, useMemo } from 'react';
import { Box, ButtonBase, Stack, Typography } from '@mui/material';
import AddOutlined from '@mui/icons-material/AddOutlined';
import { VIEW_MODE_TABS_BAR_HEIGHT } from 'src/components/ViewModeTabs/ViewModeTabs';
import { useModelStore, useModelStoreApi } from 'src/stores/modelStore';
import { useUiStateStore } from 'src/stores/uiStateStore';
import { useView } from 'src/hooks/useView';
import { useDiagramUtils } from 'src/hooks/useDiagramUtils';
import {
  SHAPE_2D_AP_ID,
  SHAPE_2D_BLANKING_ID,
  SHAPE_2D_CABINET_ID,
  SHAPE_2D_CAMERA_ID,
  SHAPE_2D_CAMERA_V2_ID,
  SHAPE_2D_IOT_ID,
  SHAPE_2D_NAS_ID,
  SHAPE_2D_PATCH_PANEL_ID,
  SHAPE_2D_PC_ID,
  SHAPE_2D_PRINTER_ID,
  SHAPE_2D_SMARTPHONE_ID,
  SHAPE_2D_SWITCH_ID,
  SHAPE_2D_TABLET_ID,
  SHAPE_2D_VOIP_ID,
  getModelItemSize
} from 'src/config';
import { parseDeviceColor } from 'src/utils/deviceColor';
import {
  ViewKindEnum,
  createPlan2dTab,
  getProjectTabs,
  projectionModeForKind,
  type ProjectTab
} from 'src/utils';
import type { ModelItem, View } from 'src/types';

/** Visible gallery: 3 columns × 2 rows, then scroll. */
const COLS = 3;
const VISIBLE_ROWS = 2;
const GAP_PX = 20;
const TILE_MIN_H = 220;
/** Preview SVG units per plan tile — keeps strokes/edges crisp when scaled. */
const PREVIEW_TILE = 40;

type Bounds = { minX: number; minY: number; maxX: number; maxY: number };

type PreviewNode = {
  id: string;
  tileX: number;
  tileY: number;
  tileW: number;
  tileH: number;
  x: number;
  y: number;
  w: number;
  h: number;
  fill: string;
  kind: 'device' | 'cabinet' | 'rack';
};

const emptyBounds = (): Bounds => ({
  minX: Infinity,
  minY: Infinity,
  maxX: -Infinity,
  maxY: -Infinity
});

const expandBounds = (
  bounds: Bounds,
  x: number,
  y: number,
  w: number,
  h: number
) => {
  bounds.minX = Math.min(bounds.minX, x);
  bounds.minY = Math.min(bounds.minY, y);
  bounds.maxX = Math.max(bounds.maxX, x + w);
  bounds.maxY = Math.max(bounds.maxY, y + h);
};

const boundsArea = (b: Bounds) => {
  if (!Number.isFinite(b.minX)) return 0;
  return Math.max(0, b.maxX - b.minX) * Math.max(0, b.maxY - b.minY);
};

const ICON_PREVIEW_FILL: Record<string, string> = {
  [SHAPE_2D_SWITCH_ID]: '#2563eb',
  [SHAPE_2D_PC_ID]: '#16a34a',
  [SHAPE_2D_CAMERA_ID]: '#ca8a04',
  [SHAPE_2D_CAMERA_V2_ID]: '#ca8a04',
  [SHAPE_2D_PRINTER_ID]: '#0d9488',
  [SHAPE_2D_VOIP_ID]: '#7c3aed',
  [SHAPE_2D_SMARTPHONE_ID]: '#db2777',
  [SHAPE_2D_IOT_ID]: '#ea580c',
  [SHAPE_2D_AP_ID]: '#0891b2',
  [SHAPE_2D_NAS_ID]: '#4f46e5',
  [SHAPE_2D_TABLET_ID]: '#059669',
  [SHAPE_2D_CABINET_ID]: '#64748b',
  [SHAPE_2D_BLANKING_ID]: '#94a3b8',
  [SHAPE_2D_PATCH_PANEL_ID]: '#475569'
};

const previewFillFor = (model?: ModelItem | null): string => {
  const parsed = parseDeviceColor(model?.color);
  if (parsed.alpha > 0.12 && parsed.hex.toLowerCase() !== '#ffffff') {
    return parsed.hex;
  }
  const icon = model?.icon ?? '';
  return ICON_PREVIEW_FILL[icon] ?? '#64748b';
};

const nodeKind = (
  icon: string | undefined,
  tileW: number,
  tileH: number
): PreviewNode['kind'] => {
  if (icon === SHAPE_2D_CABINET_ID) return 'cabinet';
  if (
    icon === SHAPE_2D_BLANKING_ID ||
    icon === SHAPE_2D_PATCH_PANEL_ID ||
    tileW * tileH >= 48
  ) {
    return 'rack';
  }
  return 'device';
};

const PlanPreview = ({
  view,
  modelItems
}: {
  view: View;
  modelItems: ModelItem[];
}) => {
  const itemById = useMemo(() => {
    return new Map(modelItems.map((item) => [item.id, item]));
  }, [modelItems]);

  const preview = useMemo(() => {
    const u = PREVIEW_TILE;
    const nodes: PreviewNode[] = (view.items ?? []).map((viewItem) => {
      const model = itemById.get(viewItem.id);
      const size = model
        ? getModelItemSize(model) ?? { width: 1, height: 1 }
        : { width: 1, height: 1 };
      const gap = 2;
      const kind = nodeKind(model?.icon, size.width, size.height);
      return {
        id: viewItem.id,
        tileX: viewItem.tile.x,
        tileY: viewItem.tile.y,
        tileW: size.width,
        tileH: size.height,
        x: Math.round(viewItem.tile.x * u + gap),
        y: Math.round(viewItem.tile.y * u + gap),
        w: Math.max(6, Math.round(size.width * u - gap * 2)),
        h: Math.max(6, Math.round(size.height * u - gap * 2)),
        fill: previewFillFor(model),
        kind
      };
    });

    const areas = (view.rectangles ?? []).map((rect) => {
      const x = Math.min(rect.from.x, rect.to.x);
      const y = Math.min(rect.from.y, rect.to.y);
      const w = Math.abs(rect.to.x - rect.from.x) + 1;
      const h = Math.abs(rect.to.y - rect.from.y) + 1;
      return {
        tileX: x,
        tileY: y,
        tileW: w,
        tileH: h,
        x: Math.round(x * u),
        y: Math.round(y * u),
        w: Math.round(w * u),
        h: Math.round(h * u)
      };
    });

    // Frame around devices (+ compact areas). Huge cabinets alone would crush detail.
    const focusBounds = emptyBounds();
    nodes.forEach((node) => {
      if (node.kind === 'device') {
        expandBounds(focusBounds, node.tileX, node.tileY, node.tileW, node.tileH);
      }
    });
    areas.forEach((area) => {
      if (area.tileW * area.tileH <= 120) {
        expandBounds(focusBounds, area.tileX, area.tileY, area.tileW, area.tileH);
      }
    });

    const allBounds = emptyBounds();
    nodes.forEach((node) => {
      expandBounds(allBounds, node.tileX, node.tileY, node.tileW, node.tileH);
    });
    areas.forEach((area) => {
      expandBounds(allBounds, area.tileX, area.tileY, area.tileW, area.tileH);
    });

    const useFocus =
      Number.isFinite(focusBounds.minX) &&
      boundsArea(focusBounds) > 0 &&
      boundsArea(focusBounds) < boundsArea(allBounds) * 0.85;

    const bounds = useFocus ? focusBounds : allBounds;

    if (!Number.isFinite(bounds.minX)) {
      return {
        viewBox: `0 0 ${20 * u} ${14 * u}`,
        nodes: [] as PreviewNode[],
        cables: [] as { x1: number; y1: number; x2: number; y2: number }[],
        areas: [] as typeof areas,
        stroke: 3
      };
    }

    const pad = useFocus ? 2.2 : 1.4;
    const vbX = Math.round((bounds.minX - pad) * u);
    const vbY = Math.round((bounds.minY - pad) * u);
    const vbW = Math.round(
      Math.max(6, bounds.maxX - bounds.minX + pad * 2) * u
    );
    const vbH = Math.round(
      Math.max(5, bounds.maxY - bounds.minY + pad * 2) * u
    );
    const stroke = Math.max(3, Math.round(Math.min(vbW, vbH) / 90));

    const centerOf = (itemId: string) => {
      const node = nodes.find((n) => n.id === itemId);
      if (!node) return null;
      return { x: node.x + node.w / 2, y: node.y + node.h / 2 };
    };

    const visibleIds = new Set(
      nodes
        .filter((node) => {
          if (!useFocus || node.kind === 'device') return true;
          // Keep backdrop items that touch the focused crop for context.
          return !(
            node.tileX + node.tileW < bounds.minX - pad ||
            node.tileX > bounds.maxX + pad ||
            node.tileY + node.tileH < bounds.minY - pad ||
            node.tileY > bounds.maxY + pad
          );
        })
        .map((node) => node.id)
    );

    const cables: { x1: number; y1: number; x2: number; y2: number }[] = [];
    (view.connectors ?? []).forEach((connector) => {
      const anchors = connector.anchors ?? [];
      if (anchors.length < 2) return;
      const a = anchors[0]?.ref.item;
      const b = anchors[anchors.length - 1]?.ref.item;
      if (!a || !b) return;
      if (!visibleIds.has(a) && !visibleIds.has(b)) return;
      const ca = centerOf(a);
      const cb = centerOf(b);
      if (!ca || !cb) return;
      cables.push({
        x1: Math.round(ca.x),
        y1: Math.round(ca.y),
        x2: Math.round(cb.x),
        y2: Math.round(cb.y)
      });
    });

    return {
      viewBox: `${vbX} ${vbY} ${vbW} ${vbH}`,
      nodes: nodes.filter((node) => visibleIds.has(node.id)),
      cables,
      areas: areas.filter((area) => {
        if (!useFocus) return true;
        return !(
          area.tileX + area.tileW < bounds.minX - pad ||
          area.tileX > bounds.maxX + pad ||
          area.tileY + area.tileH < bounds.minY - pad ||
          area.tileY > bounds.maxY + pad
        );
      }),
      stroke
    };
  }, [view, itemById]);

  const empty = preview.nodes.length === 0 && preview.areas.length === 0;

  return (
    <Box
      sx={{
        position: 'relative',
        width: '100%',
        height: '100%',
        bgcolor: '#edf2f7',
        overflow: 'hidden'
      }}
    >
      {empty ? (
        <Box
          sx={{
            position: 'absolute',
            inset: 0,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center'
          }}
        >
          <Typography sx={{ fontSize: 13, color: 'text.secondary' }}>
            Pusty plan
          </Typography>
        </Box>
      ) : (
        <Box
          component="svg"
          viewBox={preview.viewBox}
          preserveAspectRatio="xMidYMid meet"
          shapeRendering="geometricPrecision"
          sx={{
            position: 'absolute',
            inset: 8,
            width: 'calc(100% - 16px)',
            height: 'calc(100% - 16px)',
            display: 'block'
          }}
        >
          {preview.areas.map((area, i) => (
            <rect
              key={`a-${i}`}
              x={area.x}
              y={area.y}
              width={area.w}
              height={area.h}
              fill="rgba(148, 163, 184, 0.2)"
              stroke="#64748b"
              strokeWidth={preview.stroke}
              shapeRendering="crispEdges"
            />
          ))}
          {preview.cables.map((cable, i) => (
            <line
              key={`c-${i}`}
              x1={cable.x1}
              y1={cable.y1}
              x2={cable.x2}
              y2={cable.y2}
              stroke="#1e293b"
              strokeWidth={preview.stroke + 1}
              strokeLinecap="round"
              opacity={0.55}
            />
          ))}
          {/* Backdrop (cabinets) first — muted, with rack stripes. */}
          {preview.nodes
            .filter((node) => node.kind !== 'device')
            .map((node) => (
              <g key={node.id}>
                <rect
                  x={node.x}
                  y={node.y}
                  width={node.w}
                  height={node.h}
                  fill="#94a3b8"
                  stroke="#334155"
                  strokeWidth={preview.stroke}
                  shapeRendering="crispEdges"
                  opacity={0.55}
                />
                {node.kind === 'cabinet' &&
                  Array.from({
                    length: Math.min(12, Math.max(3, Math.floor(node.h / 28)))
                  }).map((_, i, arr) => {
                    const y =
                      node.y +
                      Math.round(((i + 1) / (arr.length + 1)) * node.h);
                    return (
                      <line
                        key={`${node.id}-r-${i}`}
                        x1={node.x + 4}
                        y1={y}
                        x2={node.x + node.w - 4}
                        y2={y}
                        stroke="#475569"
                        strokeWidth={1.5}
                        opacity={0.7}
                      />
                    );
                  })}
              </g>
            ))}
          {/* Devices on top — saturated, crisp. */}
          {preview.nodes
            .filter((node) => node.kind === 'device')
            .map((node) => (
              <rect
                key={node.id}
                x={node.x}
                y={node.y}
                width={node.w}
                height={node.h}
                rx={Math.min(6, Math.round(Math.min(node.w, node.h) * 0.12))}
                fill={node.fill}
                stroke="#0f172a"
                strokeWidth={preview.stroke + 1}
              />
            ))}
        </Box>
      )}
    </Box>
  );
};

export const PlanPickerView = () => {
  const views = useModelStore((state) => state.views);
  const modelItems = useModelStore((state) => state.items);
  const projectTitle = useModelStore((state) => state.title);
  const modelActions = useModelStore((state) => state.actions);
  const modelApi = useModelStoreApi();
  const activeViewId = useUiStateStore((state) => state.view);
  const uiStateActions = useUiStateStore((state) => state.actions);
  const { changeView } = useView();
  const { fitToView } = useDiagramUtils();

  const planTabs = useMemo(() => {
    return getProjectTabs(views, projectTitle).filter(
      (tab) =>
        tab.kind === ViewKindEnum.PLAN_2D ||
        tab.kind === ViewKindEnum.PLAN_2D_V3
    );
  }, [views, projectTitle]);

  const viewById = useMemo(() => {
    return new Map(views.map((view) => [view.id, view]));
  }, [views]);

  const openPlan = useCallback(
    (tab: ProjectTab) => {
      const model = modelApi.getState();
      const target = model.views.find((view) => view.id === tab.viewId);
      if (!target) return;
      changeView(target.id, model);
      uiStateActions.setProjectionMode(projectionModeForKind(tab.kind));
      uiStateActions.setPlanPickerOpen(false);
      uiStateActions.setWorkshopOpen(false);
      uiStateActions.setItemControls(null);
      uiStateActions.setMode({
        type: 'CURSOR',
        showCursor: true,
        mousedownItem: null
      });
      window.setTimeout(() => {
        void fitToView();
      }, 80);
    },
    [modelApi, changeView, uiStateActions, fitToView]
  );

  const onAddPlan = useCallback(() => {
    const model = modelApi.getState();
    const label = window.prompt('Nazwa nowego planu', 'Nowy plan');
    if (label === null) return;
    const tab = createPlan2dTab(model.views, label.trim() || undefined);
    const nextViews = [...model.views, tab];
    modelActions.set({ views: nextViews });
    changeView(tab.id, { ...model, views: nextViews });
    uiStateActions.setProjectionMode('TWO_D');
    uiStateActions.setPlanPickerOpen(false);
    uiStateActions.setWorkshopOpen(false);
    uiStateActions.setItemControls(null);
    window.setTimeout(() => {
      void fitToView();
    }, 80);
  }, [modelApi, modelActions, changeView, uiStateActions, fitToView]);

  return (
    <Box
      sx={{
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        zIndex: 10,
        display: 'flex',
        flexDirection: 'column',
        pt: `${VIEW_MODE_TABS_BAR_HEIGHT}px`,
        boxSizing: 'border-box',
        background:
          'linear-gradient(165deg, #eef2f7 0%, #e8edf4 45%, #e2e8f0 100%)'
      }}
    >
      <Box sx={{ px: 3, pt: 2.5, pb: 1.5, flexShrink: 0 }}>
        <Typography sx={{ fontSize: 22, fontWeight: 750, letterSpacing: 0.01 }}>
          Plany
        </Typography>
        <Typography sx={{ mt: 0.5, fontSize: 13.5, color: 'text.secondary' }}>
          Wybierz plan, aby otworzyć go na canvasie.
        </Typography>
      </Box>

      <Box
        sx={{
          flex: 1,
          minHeight: 0,
          px: 3,
          pb: 3,
          overflowY: 'auto',
          // Cap visible area roughly to 2 rows of large tiles.
          maxHeight: `calc(100% - ${VIEW_MODE_TABS_BAR_HEIGHT}px)`,
          '&::-webkit-scrollbar': { width: 10 },
          '&::-webkit-scrollbar-thumb': {
            bgcolor: 'rgba(100, 116, 139, 0.45)',
            borderRadius: 8
          }
        }}
      >
        <Box
          sx={{
            display: 'grid',
            gridTemplateColumns: `repeat(${COLS}, minmax(0, 1fr))`,
            gap: `${GAP_PX}px`,
            // Each row fills half of the first viewport-ish height (~2 rows).
            gridAutoRows: `minmax(${TILE_MIN_H}px, calc((100vh - ${
              VIEW_MODE_TABS_BAR_HEIGHT + 120
            }px - ${GAP_PX}px) / ${VISIBLE_ROWS}))`
          }}
        >
          {planTabs.map((tab) => {
            const view = viewById.get(tab.viewId);
            if (!view) return null;
            const selected = activeViewId === tab.viewId;
            const deviceCount = view.items?.length ?? 0;

            return (
              <ButtonBase
                key={tab.viewId}
                onClick={() => openPlan(tab)}
                sx={{
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'stretch',
                  textAlign: 'left',
                  borderRadius: 3,
                  overflow: 'hidden',
                  bgcolor: 'background.paper',
                  border: '2px solid',
                  borderColor: selected
                    ? 'primary.main'
                    : 'rgba(148, 163, 184, 0.45)',
                  boxShadow: selected
                    ? '0 10px 28px rgba(37, 99, 235, 0.22)'
                    : '0 8px 22px rgba(15, 23, 42, 0.08)',
                  transition:
                    'border-color 120ms ease, box-shadow 120ms ease, transform 120ms ease',
                  '&:hover': {
                    borderColor: 'primary.main',
                    transform: 'translateY(-2px)',
                    boxShadow: '0 14px 32px rgba(15, 23, 42, 0.14)'
                  }
                }}
              >
                <Box sx={{ flex: 1, minHeight: 0, position: 'relative' }}>
                  <PlanPreview view={view} modelItems={modelItems} />
                </Box>
                <Stack
                  spacing={0.25}
                  sx={{
                    px: 1.75,
                    py: 1.35,
                    borderTop: '1px solid',
                    borderColor: 'divider',
                    bgcolor: 'rgba(248, 250, 252, 0.95)'
                  }}
                >
                  <Typography
                    sx={{
                      fontSize: 15,
                      fontWeight: 700,
                      color: 'text.primary',
                      lineHeight: 1.25
                    }}
                  >
                    {tab.label}
                  </Typography>
                  <Typography sx={{ fontSize: 12, color: 'text.secondary' }}>
                    {deviceCount === 0
                      ? 'Brak urządzeń'
                      : deviceCount === 1
                        ? '1 urządzenie'
                        : deviceCount < 5
                          ? `${deviceCount} urządzenia`
                          : `${deviceCount} urządzeń`}
                    {selected ? ' · otwarty' : ''}
                  </Typography>
                </Stack>
              </ButtonBase>
            );
          })}

          <ButtonBase
            onClick={onAddPlan}
            sx={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 1,
              borderRadius: 3,
              border: '2px dashed',
              borderColor: 'rgba(100, 116, 139, 0.45)',
              bgcolor: 'rgba(255,255,255,0.45)',
              color: 'text.secondary',
              minHeight: TILE_MIN_H,
              '&:hover': {
                borderColor: 'primary.main',
                color: 'primary.main',
                bgcolor: 'rgba(37, 99, 235, 0.06)'
              }
            }}
          >
            <AddOutlined sx={{ fontSize: 36 }} />
            <Typography sx={{ fontSize: 14, fontWeight: 650 }}>
              Nowy plan…
            </Typography>
          </ButtonBase>
        </Box>
      </Box>
    </Box>
  );
};
