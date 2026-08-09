import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Box,
  Dialog,
  DialogContent,
  DialogTitle,
  Typography,
  Stack
} from '@mui/material';
import {
  TILE_SIZE_2D,
  getModelItemSize,
  isShape2dIcon,
  MARKDOWN_EMPTY_VALUE,
  NODE_LABEL_SCALE_DEFAULT,
  clampNodeLabelScale
} from 'src/config';
import {
  getDescriptionSummary,
  getDescriptionTitle,
  getShape2dCenterPosition,
  getShape2dInfoSlotMetrics,
  hasNodeDescription,
  hasNodeDescriptionBadge,
  hasNodeDescriptionNotes,
  isPlanProjection,
  parseDeviceColor
} from 'src/utils';
import { ViewItem } from 'src/types';
import { useModelStore } from 'src/stores/modelStore';
import { useUiStateStore } from 'src/stores/uiStateStore';
import { useNodeDragStore } from 'src/stores/nodeDragStore';
import { useScene } from 'src/hooks/useScene';
import { getLiveViewport } from 'src/utils/liveViewport';
import { ExpandableLabel } from 'src/components/Label/ExpandableLabel';
import { MarkdownEditor } from 'src/components/MarkdownEditor/MarkdownEditor';

interface Props {
  nodes: ViewItem[];
}

/** Plan plakietka base width at default scale (~2.5× old card — longer before wrap). */
const PLAN_LABEL_BASE_WIDTH = 640;

const MIN_LABEL_LIFT = 40;
/** Max stem length (world px) — free placement around the node. */
const MAX_LABEL_LIFT = 1100;

type Pt = { x: number; y: number };
/** `offset` = callout tip (node-centre relative); `lift` = stem length. */
type LabelPose = { offset: Pt; lift: number };

let measureCanvasCtx: CanvasRenderingContext2D | null | undefined;

const measureTextWidth = (
  text: string,
  fontSize: number,
  fontWeight: number
): number => {
  if (!text) return 0;
  if (typeof document === 'undefined') {
    return text.length * fontSize * 0.58;
  }
  if (measureCanvasCtx === undefined) {
    measureCanvasCtx = document.createElement('canvas').getContext('2d');
  }
  if (!measureCanvasCtx) {
    return text.length * fontSize * 0.58;
  }
  measureCanvasCtx.font = `${fontWeight} ${fontSize}px Roboto, "Helvetica Neue", Arial, sans-serif`;
  return measureCanvasCtx.measureText(text).width;
};

const fitsWithinLines = (
  text: string,
  maxWidth: number,
  fontSize: number,
  maxLines: number,
  fontWeight: number
): boolean => {
  const trimmed = text.trim();
  if (!trimmed) return true;
  const words = trimmed.split(/\s+/);
  const spaceW = measureTextWidth(' ', fontSize, fontWeight);
  let lines = 1;
  let lineW = 0;

  for (const word of words) {
    const wordW = measureTextWidth(word, fontSize, fontWeight);
    if (wordW > maxWidth) return false;
    if (lineW === 0) {
      lineW = wordW;
      continue;
    }
    if (lineW + spaceW + wordW <= maxWidth) {
      lineW += spaceW + wordW;
      continue;
    }
    lines += 1;
    if (lines > maxLines) return false;
    lineW = wordW;
  }
  return true;
};

const fitTitleFont = (
  text: string,
  maxWidth: number,
  preferred: number,
  minSize: number,
  fontWeight = 700
): number => {
  const trimmed = text.trim();
  if (!trimmed) return preferred;
  if (fitsWithinLines(trimmed, maxWidth, preferred, 2, fontWeight)) {
    return preferred;
  }
  let lo = minSize;
  let hi = preferred;
  let best = minSize;
  while (lo <= hi) {
    const mid = Math.floor((lo + hi) / 2);
    if (fitsWithinLines(trimmed, maxWidth, mid, 2, fontWeight)) {
      best = mid;
      lo = mid + 1;
    } else {
      hi = mid - 1;
    }
  }
  return best;
};

const clampLabelLift = (labelHeight?: number) => {
  return Math.max(
    MIN_LABEL_LIFT,
    Math.min(MAX_LABEL_LIFT, labelHeight ?? 72)
  );
};

const closestOnRectPerimeter = (
  px: number,
  py: number,
  halfW: number,
  halfH: number
): Pt => {
  const hw = Math.max(1, halfW);
  const hh = Math.max(1, halfH);
  const cx = Math.max(-hw, Math.min(hw, px));
  const cy = Math.max(-hh, Math.min(hh, py));
  const inside = Math.abs(px) < hw - 0.01 && Math.abs(py) < hh - 0.01;

  if (inside) {
    const dl = Math.abs(cx + hw);
    const dr = Math.abs(hw - cx);
    const dt = Math.abs(cy + hh);
    const db = Math.abs(hh - cy);
    const m = Math.min(dl, dr, dt, db);
    if (m === dl) return { x: -hw, y: cy };
    if (m === dr) return { x: hw, y: cy };
    if (m === dt) return { x: cx, y: -hh };
    return { x: cx, y: hh };
  }

  return { x: cx, y: cy };
};

const outwardNormal = (p: Pt, halfW: number, halfH: number): Pt => {
  const eps = 0.75;
  let nx = 0;
  let ny = 0;
  if (Math.abs(p.x + halfW) < eps) nx -= 1;
  if (Math.abs(p.x - halfW) < eps) nx += 1;
  if (Math.abs(p.y + halfH) < eps) ny -= 1;
  if (Math.abs(p.y - halfH) < eps) ny += 1;
  const len = Math.hypot(nx, ny) || 1;
  return { x: nx / len, y: ny / len };
};

/** Legacy constrained stem (perimeter attach + fixed angle) → tip. */
const legacyTipFromAttachment = (
  attach: Pt,
  halfW: number,
  halfH: number,
  lift: number
): Pt => {
  const n = outwardNormal(attach, halfW, halfH);
  let dx = n.x;
  let dy = n.y;
  if (Math.abs(n.x) > Math.abs(n.y) + 0.05) {
    const up = 0.45;
    const len = Math.hypot(n.x, up) || 1;
    dx = n.x / len;
    dy = -up / len;
  }
  return { x: attach.x + dx * lift, y: attach.y + dy * lift };
};

const isOnNodePerimeter = (p: Pt, halfW: number, halfH: number) => {
  return (
    Math.abs(Math.abs(p.x) - halfW) < 2 || Math.abs(Math.abs(p.y) - halfH) < 2
  );
};

/** Clamp tip so stem stays between min/max length from the chassis edge. */
const clampFreeTip = (tip: Pt, halfW: number, halfH: number): LabelPose => {
  const attach = closestOnRectPerimeter(tip.x, tip.y, halfW, halfH);
  let dx = tip.x - attach.x;
  let dy = tip.y - attach.y;
  let len = Math.hypot(dx, dy);
  if (len < 0.01) {
    const n = outwardNormal(attach, halfW, halfH);
    dx = n.x;
    dy = n.y;
    len = 1;
  }
  const lift = clampLabelLift(len);
  const scale = lift / len;
  return {
    offset: { x: attach.x + dx * scale, y: attach.y + dy * scale },
    lift
  };
};

/**
 * Resolve badge pose. New format: `labelOffset` = free tip.
 * Legacy: offset on perimeter + `labelHeight` along a fixed stem angle.
 */
const resolveBadgePose = (
  labelOffset: Pt | undefined | null,
  labelHeight: number | undefined,
  halfW: number,
  halfH: number
): { attach: Pt; tip: Pt; lift: number } => {
  const defaultLift = clampLabelLift(labelHeight);
  if (!labelOffset) {
    const attach = { x: 0, y: -halfH };
    const tip = { x: 0, y: -halfH - defaultLift };
    return { attach, tip, lift: defaultLift };
  }

  if (isOnNodePerimeter(labelOffset, halfW, halfH)) {
    const attach = closestOnRectPerimeter(
      labelOffset.x,
      labelOffset.y,
      halfW,
      halfH
    );
    const tip = legacyTipFromAttachment(attach, halfW, halfH, defaultLift);
    return { attach, tip, lift: defaultLift };
  }

  const clamped = clampFreeTip(labelOffset, halfW, halfH);
  const attach = closestOnRectPerimeter(
    clamped.offset.x,
    clamped.offset.y,
    halfW,
    halfH
  );
  return { attach, tip: clamped.offset, lift: clamped.lift };
};

const stemColorsFromNode = (nodeColor?: string | null) => {
  const parsed = parseDeviceColor(nodeColor);
  const fill =
    parsed.alpha < 0.04 ? '#64748b' : parsed.hex || '#64748b';
  // Contrasting outline: light on dark fills, dark on light fills.
  let luminance = 0.5;
  try {
    const hex = fill.replace('#', '');
    const r = parseInt(hex.slice(0, 2), 16) / 255;
    const g = parseInt(hex.slice(2, 4), 16) / 255;
    const b = parseInt(hex.slice(4, 6), 16) / 255;
    luminance = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  } catch {
    luminance = 0.5;
  }
  return {
    fill,
    outline: luminance > 0.55 ? '#0f172a' : '#ffffff'
  };
};

interface PlanBadgeProps {
  nodeId: string;
  title: string;
  summary: string;
  description: string | null;
  labelScale: number;
  position: Pt;
  attachment: Pt;
  tipRest: Pt;
  nodeColor?: string | null;
  canDrag: boolean;
  onLabelMouseDown: (
    nodeId: string,
    attachment: Pt,
    tip: Pt,
    lift: number,
    halfW: number,
    halfH: number
  ) => (event: React.MouseEvent) => void;
  halfW: number;
  halfH: number;
  lift: number;
}

/**
 * Classic plan callout: title + skrót; expand for full notes excerpt.
 * Tip is freely placed; stem attaches to the nearest chassis edge.
 */
const PlanDescriptionBadge = ({
  nodeId,
  title,
  summary,
  description,
  labelScale,
  position,
  attachment,
  tipRest,
  nodeColor,
  halfW,
  halfH,
  lift,
  canDrag,
  onLabelMouseDown
}: PlanBadgeProps) => {
  const [contentExpanded, setContentExpanded] = useState(false);
  const tipLocal = {
    x: tipRest.x - attachment.x,
    y: tipRest.y - attachment.y
  };
  // Node-centre symmetry: tip on the left → curve left, else right.
  const stemCurveSide: -1 | 1 = tipRest.x < 0 ? -1 : 1;
  const stem = stemColorsFromNode(nodeColor);

  const scaleRatio = labelScale / NODE_LABEL_SCALE_DEFAULT;
  const labelMaxWidth = Math.round(PLAN_LABEL_BASE_WIDTH * scaleRatio);
  const preferredTitle = Math.round(5.5 * labelScale + 2);
  const preferredBody = Math.round(4.5 * labelScale + 2);
  const padY = Math.max(8, Math.round(preferredBody * 0.4));
  const padX = Math.max(12, Math.round(preferredBody * 0.5));
  const titleAreaWidth = Math.max(48, labelMaxWidth - padX * 2);

  const titleFontSize = fitTitleFont(
    title,
    titleAreaWidth,
    preferredTitle,
    Math.max(14, Math.round(preferredTitle * 0.28)),
    700
  );
  const bodyFontSize = preferredBody;

  const titleBlockH = title ? Math.ceil(titleFontSize * 1.25 * 2) : 0;
  const summaryCollapsedH = summary ? Math.ceil(bodyFontSize * 1.35 * 2) : 0;
  const labelCollapsedHeight = Math.max(
    titleBlockH + summaryCollapsedH + padY * 2 + 8,
    Math.round(32 * scaleRatio)
  );

  return (
    <Box
      data-plan-desc-badge={nodeId}
      sx={{
        position: 'absolute',
        left: position.x,
        top: position.y,
        zIndex: 1,
        pointerEvents: 'none'
      }}
    >
      <Box
        sx={{
          position: 'absolute',
          left: attachment.x,
          top: attachment.y
        }}
      >
        <ExpandableLabel
          maxWidth={labelMaxWidth}
          expandDirection="BOTTOM"
          stemDirection="diagonal"
          stemOffset={tipLocal}
          stemCurveSide={stemCurveSide}
          stemColor={stem.fill}
          stemOutlineColor={stem.outline}
          stemWidth={7}
          labelHeight={Math.max(
            1,
            Math.round(Math.hypot(tipLocal.x, tipLocal.y))
          )}
          collapsedMaxHeight={labelCollapsedHeight}
          interactive={canDrag}
          forceExpandControl={false}
          onToggleExpand={setContentExpanded}
          onMouseDown={onLabelMouseDown(
            nodeId,
            attachment,
            tipRest,
            lift,
            halfW,
            halfH
          )}
          sx={{
            py: `${padY}px`,
            px: `${padX}px`
          }}
        >
          <Stack
            spacing={0}
            sx={{
              gap: `${Math.max(4, Math.round(bodyFontSize * 0.28))}px`,
              width: '100%',
              minWidth: 0
            }}
          >
            {title ? (
              <Typography
                fontWeight={700}
                sx={{
                  fontSize: titleFontSize,
                  lineHeight: 1.25,
                  width: '100%',
                  minWidth: 0,
                  whiteSpace: 'normal',
                  overflowWrap: 'break-word',
                  wordBreak: 'normal',
                  display: '-webkit-box',
                  WebkitLineClamp: 2,
                  WebkitBoxOrient: 'vertical',
                  overflow: 'hidden'
                }}
              >
                {title}
              </Typography>
            ) : null}
            {summary ? (
              <Typography
                sx={{
                  fontSize: bodyFontSize,
                  lineHeight: 1.35,
                  color: 'text.secondary',
                  width: '100%',
                  whiteSpace: 'normal',
                  overflowWrap: 'break-word',
                  wordBreak: 'normal'
                }}
              >
                {summary}
              </Typography>
            ) : null}
            {contentExpanded && description ? (
              <MarkdownEditor
                value={description}
                readOnly
                styles={{
                  fontSize: Math.min(
                    bodyFontSize,
                    Math.max(14, Math.round(preferredBody * 0.55))
                  ),
                  lineHeight: 1.4,
                  width: '100%',
                  marginTop: 4
                }}
              />
            ) : null}
          </Stack>
        </ExpandableLabel>
      </Box>
    </Box>
  );
};

/**
 * Visible “(i)” control above the interaction layer (matches chassis slot).
 * Opens on pointerdown; Cursor also opens via tile hit-test as a fallback.
 */
const NodeInfoButton = ({
  position,
  halfW,
  halfH,
  icon,
  onOpen
}: {
  position: Pt;
  halfW: number;
  halfH: number;
  icon?: string;
  onOpen: () => void;
}) => {
  const metrics = getShape2dInfoSlotMetrics({
    size: {
      width: (halfW * 2) / TILE_SIZE_2D,
      height: (halfH * 2) / TILE_SIZE_2D
    },
    icon
  });
  const { dim, hitPad, headerBandH, headerInset, padRight } = metrics;
  const hit = dim + hitPad * 2;
  const openedRef = useRef(false);

  return (
    <Box
      sx={{
        position: 'absolute',
        left: position.x,
        top: position.y,
        zIndex: 20,
        pointerEvents: 'none'
      }}
    >
      <Box
        component="button"
        type="button"
        title="Opis / notatka"
        aria-label="Otwórz opis"
        data-node-info-btn
        onPointerDown={(e) => {
          // Above the interaction layer — open before canvas gestures start.
          e.stopPropagation();
          e.preventDefault();
          openedRef.current = true;
          onOpen();
        }}
        onClick={(e) => {
          e.stopPropagation();
          e.preventDefault();
          if (!openedRef.current) onOpen();
          openedRef.current = false;
        }}
        sx={{
          position: 'absolute',
          left: halfW - headerInset - padRight - dim / 2,
          top: -halfH + headerBandH / 2,
          transform: 'translate(-50%, -50%)',
          width: hit,
          height: hit,
          minWidth: hit,
          minHeight: hit,
          borderRadius: '50%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          p: 0,
          m: 0,
          cursor: 'pointer',
          pointerEvents: 'auto',
          touchAction: 'none',
          bgcolor: 'rgba(37, 99, 235, 0.08)',
          border: 'none',
          lineHeight: 1,
          '&:hover': {
            bgcolor: 'rgba(37, 99, 235, 0.18)'
          }
        }}
      >
        <Box
          aria-hidden
          sx={{
            width: dim,
            height: dim,
            borderRadius: '50%',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            bgcolor: '#2563eb',
            border: `${Math.max(2, Math.round(dim * 0.06))}px solid #1d4ed8`,
            color: '#ffffff',
            fontSize: Math.max(14, Math.round(dim * 0.52)),
            fontWeight: 800,
            boxShadow: '0 1px 3px rgba(15,23,42,0.35)',
            pointerEvents: 'none',
            userSelect: 'none'
          }}
        >
          i
        </Box>
      </Box>
    </Box>
  );
};

/**
 * Plan-view description callouts + per-node (i) note buttons.
 * Plakietki are opt-in (Pokazuj plakietkę); notes open from the (i) by default.
 */
export const NodeDescriptionLabels = ({ nodes }: Props) => {
  const projectionMode = useUiStateStore((state) => {
    return state.projectionMode;
  });
  const editorMode = useUiStateStore((state) => {
    return state.editorMode;
  });
  const showDescriptionLabels = useUiStateStore((state) => {
    return state.showDescriptionLabels;
  });
  const modelItems = useModelStore((state) => {
    return state.items;
  });
  const uiActions = useUiStateStore((state) => {
    return state.actions;
  });
  const { updateViewItem } = useScene();
  const liveTiles = useNodeDragStore((state) => {
    return state.tiles;
  });

  const [livePoses, setLivePoses] = useState<Record<string, LabelPose>>({});
  const notesNodeId = useUiStateStore((state) => {
    return state.nodeDescriptionDialogItemId;
  });
  const dragRef = useRef<{
    id: string;
    startClientX: number;
    startClientY: number;
    originTip: Pt;
    halfW: number;
    halfH: number;
  } | null>(null);
  const liveDragPoseRef = useRef<LabelPose | null>(null);

  const canDrag = editorMode === 'EDITABLE';

  const notesEntry = useMemo(() => {
    if (!notesNodeId) return null;
    const modelItem = modelItems.find((item) => item.id === notesNodeId);
    if (!modelItem) return null;
    const description =
      modelItem.description && modelItem.description !== MARKDOWN_EMPTY_VALUE
        ? modelItem.description
        : null;
    return {
      name: modelItem.name?.trim() || 'urządzenie',
      title: getDescriptionTitle(modelItem),
      summary: getDescriptionSummary(modelItem),
      description
    };
  }, [notesNodeId, modelItems]);

  useEffect(() => {
    const onMove = (event: MouseEvent) => {
      const drag = dragRef.current;
      if (!drag) return;
      const zoom = getLiveViewport().zoom || 1;
      const desiredTip = {
        x: drag.originTip.x + (event.clientX - drag.startClientX) / zoom,
        y: drag.originTip.y + (event.clientY - drag.startClientY) / zoom
      };
      // Free tip — any angle; stem length clamped; attach = nearest edge.
      const next = clampFreeTip(desiredTip, drag.halfW, drag.halfH);
      liveDragPoseRef.current = next;
      setLivePoses((prev) => {
        return { ...prev, [drag.id]: next };
      });
    };

    const onUp = () => {
      const drag = dragRef.current;
      if (!drag) return;
      const finalPose = liveDragPoseRef.current;
      dragRef.current = null;
      liveDragPoseRef.current = null;
      if (finalPose) {
        updateViewItem(drag.id, {
          // Persist free tip (not perimeter attach).
          labelOffset: finalPose.offset,
          labelHeight: finalPose.lift
        });
      }
      setLivePoses((prev) => {
        const { [drag.id]: _removed, ...rest } = prev;
        return rest;
      });
    };

    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    return () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
  }, [updateViewItem]);

  const nodeLayouts = useMemo(() => {
    if (!isPlanProjection(projectionMode)) return [];

    return nodes.flatMap((node) => {
      const modelItem = modelItems.find((item) => item.id === node.id);
      if (!modelItem || !isShape2dIcon(modelItem.icon)) return [];

      const shapeSize = getModelItemSize(modelItem);
      const tile = liveTiles[node.id] ?? node.tile;
      const size = shapeSize ?? { width: 1, height: 1 };
      const position = getShape2dCenterPosition(tile, size);
      const halfW = (size.width * TILE_SIZE_2D) / 2;
      const halfH = (size.height * TILE_SIZE_2D) / 2;
      const showInfo = hasNodeDescription(modelItem);
      const showBadge =
        showDescriptionLabels &&
        node.showDescriptionLabel === true &&
        hasNodeDescriptionBadge(modelItem);

      if (!showInfo && !showBadge) return [];

      const title = getDescriptionTitle(modelItem);
      const summary = getDescriptionSummary(modelItem);
      const hasNotes = hasNodeDescriptionNotes(modelItem);
      const description =
        hasNotes &&
        modelItem.description &&
        modelItem.description !== MARKDOWN_EMPTY_VALUE
          ? modelItem.description
          : null;

      const live = livePoses[node.id];
      const pose = resolveBadgePose(
        live?.offset ?? node.labelOffset,
        live?.lift ?? node.labelHeight,
        halfW,
        halfH
      );

      return [
        {
          node,
          title,
          summary,
          description,
          hasNotes,
          showInfo,
          showBadge,
          labelScale: clampNodeLabelScale(node.labelScale),
          position,
          attachment: pose.attach,
          tipRest: pose.tip,
          halfW,
          halfH,
          lift: pose.lift,
          nodeColor: modelItem.color,
          icon: modelItem.icon
        }
      ];
    });
  }, [
    projectionMode,
    showDescriptionLabels,
    nodes,
    modelItems,
    liveTiles,
    livePoses
  ]);

  const onOpenNotes = useCallback(
    (nodeId: string) => {
      // Always open the description dialog — even when only title/skrót exist.
      uiActions.setSelectedItemIds([nodeId]);
      uiActions.setItemControls({ type: 'ITEM', id: nodeId });
      uiActions.setNodeDescriptionDialogItemId(nodeId);
    },
    [uiActions]
  );

  const onLabelMouseDown = useCallback(
    (
      nodeId: string,
      _attachment: Pt,
      tip: Pt,
      _lift: number,
      halfW: number,
      halfH: number
    ) => {
      return (event: React.MouseEvent) => {
        if (!canDrag) return;
        if (event.button !== 0) return;
        event.preventDefault();
        event.stopPropagation();
        const pose = clampFreeTip(tip, halfW, halfH);
        dragRef.current = {
          id: nodeId,
          startClientX: event.clientX,
          startClientY: event.clientY,
          originTip: tip,
          halfW,
          halfH
        };
        liveDragPoseRef.current = pose;
        setLivePoses((prev) => {
          return { ...prev, [nodeId]: pose };
        });
      };
    },
    [canDrag]
  );

  if (nodeLayouts.length === 0 && !notesEntry) return null;

  return (
    <>
      {nodeLayouts.map((entry) => {
        return (
          <React.Fragment key={`desc-${entry.node.id}`}>
            {entry.showInfo && (
              <NodeInfoButton
                position={entry.position}
                halfW={entry.halfW}
                halfH={entry.halfH}
                icon={entry.icon}
                onOpen={() => onOpenNotes(entry.node.id)}
              />
            )}
            {entry.showBadge && (
              <PlanDescriptionBadge
                nodeId={entry.node.id}
                title={entry.title}
                summary={entry.summary}
                description={entry.description}
                labelScale={entry.labelScale}
                position={entry.position}
                attachment={entry.attachment}
                tipRest={entry.tipRest}
                halfW={entry.halfW}
                halfH={entry.halfH}
                lift={entry.lift}
                nodeColor={entry.nodeColor}
                canDrag={canDrag}
                onLabelMouseDown={onLabelMouseDown}
              />
            )}
          </React.Fragment>
        );
      })}

      <Dialog
        open={Boolean(notesEntry)}
        onClose={() => uiActions.setNodeDescriptionDialogItemId(null)}
        fullWidth
        maxWidth="md"
        PaperProps={{
          sx: {
            height: 'min(82vh, 720px)',
            display: 'flex',
            flexDirection: 'column'
          }
        }}
      >
        {notesEntry && (
          <>
            <DialogTitle sx={{ fontSize: 16, fontWeight: 700, pb: 1 }}>
              Opis — {notesEntry.title || notesEntry.name}
            </DialogTitle>
            <DialogContent
              sx={{
                display: 'flex',
                flexDirection: 'column',
                flex: 1,
                minHeight: 0,
                pt: 1,
                gap: 1.25
              }}
            >
              {notesEntry.summary ? (
                <Typography sx={{ fontSize: 14, color: 'text.secondary' }}>
                  {notesEntry.summary}
                </Typography>
              ) : null}
              {notesEntry.description ? (
                <MarkdownEditor
                  variant="notebook"
                  height={520}
                  value={notesEntry.description}
                  readOnly
                />
              ) : (
                <Typography sx={{ color: 'text.secondary', fontSize: 14 }}>
                  Brak pełnej notatki — uzupełnisz ją w zakładce Opis.
                </Typography>
              )}
            </DialogContent>
          </>
        )}
      </Dialog>
    </>
  );
};
