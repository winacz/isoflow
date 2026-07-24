import domtoimage from 'dom-to-image';
import { jsPDF } from 'jspdf';
import type { Model } from 'src/types';
import { getModelItemPorts, getShape2dPortIfaceName } from 'src/config';
import { downloadFile, generateProjectFilename } from './exportOptions';
import { findPlanView } from './plan2dv2';
import { buildHtmlExportHoverGraph } from './htmlExportHover';
import {
  getVlanColor,
  VLAN_1_COLOR,
  TRUNK_RAINBOW_COLORS,
  collectModelItemVlans
} from './vlanColors';
import { isSwitchLikeIcon } from './shape2dLayout';
import { isPatchPanelItem } from './patchPanel';
import {
  mountOffscreenPlanView,
  unmountOffscreenStage,
  type OffscreenStage
} from './offscreenPlanRenderer';

/**
 * Colour, offline PDF export of the Plan (2D) view — a network report:
 * page 1 is a rasterised (colour) snapshot of the diagram, followed by a
 * per-device appendix. Connected port rows link to the peer device's card
 * in the same PDF (table → table), so you can jump from a switch port to
 * the node it terminates on.
 */

const MARGIN = 40;
const ROW_H = 15;
const CARD_HEADER_H = 22;
const COL_HEADER_H = 13;
const SVI_HEADER_H = 15;
const CARD_GAP = 14;
const SECTION_HEADER_H = 26;
// Title + one-line click hint sit above the first card.
const PAGE_TOP = MARGIN + 42;
const CHIP_H = 11;
const CHIP_GAP_X = 3;
const CHIP_GAP_Y = 3;
const ROW_PAD_Y = 3;
const TRUNK_LABEL_H = 10;

type Column = { header: string; x: number; width: number };

type PortRowData = {
  label: string;
  vlan: string;
  vlanColor: string | null;
  type: 'access' | 'trunk';
  /** Tagged VLANs carried on a trunk (empty until the picker is wired up). */
  allowedVlans: string[];
  peerName: string;
  peerPort: string;
  /** Far peer device id — used for in-table PDF jump links. */
  peerItemId: string | null;
  /** Patch-panel hop(s), e.g. "PP-IDF-1 — 5". Empty/"—" when direct. */
  via: string;
  /** Template PoE on this jack (switch workshop). */
  poe: 'IN' | 'OUT' | null;
};

type SviRowData = { vlan: string; ip: string };

type DeviceGroup = {
  itemId: string;
  name: string;
  isSwitch: boolean;
  usedPorts: number;
  totalPorts: number;
  ports: PortRowData[];
  svis: SviRowData[];
};

type DeviceAnchor = { pageNumber: number; y: number };

type PendingPeerLink = {
  sourcePage: number;
  x: number;
  y: number;
  w: number;
  h: number;
  peerItemId: string;
};

// jsPDF's built-in standard fonts (Helvetica etc.) only support
// WinAnsiEncoding (Latin-1), which does NOT include Polish diacritics —
// ą/ć/ę/ł/ń/ó/ś/ź/ż silently render as garbage glyphs. Rather than embed a
// custom Unicode font (heavy, more fragile offline), transliterate to the
// closest ASCII letter so every label stays legible.
const PL_DIACRITICS: Record<string, string> = {
  ą: 'a',
  ć: 'c',
  ę: 'e',
  ł: 'l',
  ń: 'n',
  ó: 'o',
  ś: 's',
  ź: 'z',
  ż: 'z',
  Ą: 'A',
  Ć: 'C',
  Ę: 'E',
  Ł: 'L',
  Ń: 'N',
  Ó: 'O',
  Ś: 'S',
  Ź: 'Z',
  Ż: 'Z'
};

const pdfSafe = (text: string): string => {
  return text.replace(/[ąćęłńóśźżĄĆĘŁŃÓŚŹŻ]/g, (ch) => {
    return PL_DIACRITICS[ch] ?? ch;
  });
};

const fitText = (doc: jsPDF, text: string, maxWidth: number): string => {
  const safe = pdfSafe(text);
  if (doc.getTextWidth(safe) <= maxWidth) return safe;

  let s = safe;
  while (s.length > 1 && doc.getTextWidth(`${s}...`) > maxWidth) {
    s = s.slice(0, -1);
  }
  return `${s}...`;
};

const hexToRgb = (hex: string): [number, number, number] => {
  const clean = hex.replace('#', '').trim();
  const full =
    clean.length === 3
      ? clean
          .split('')
          .map((c) => {
            return c + c;
          })
          .join('')
      : clean;
  const value = parseInt(full || '94a3b8', 16);
  const r = Math.floor(value / 65536) % 256;
  const g = Math.floor(value / 256) % 256;
  const b = value % 256;
  return [r, g, b];
};

/** Static red used for TRUNK port labels — matches the diagram's trunk rainbow. */
const TRUNK_TEXT_RGB = hexToRgb(TRUNK_RAINBOW_COLORS[0]);

/** Black or white text — whichever reads better on `bgHex`. */
const readableTextColor = (bgHex: string): [number, number, number] => {
  const [r, g, b] = hexToRgb(bgHex);
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return luminance > 0.6 ? [25, 25, 25] : [255, 255, 255];
};

const addFooters = (doc: jsPDF, title: string) => {
  const total = doc.getNumberOfPages();
  for (let p = 1; p <= total; p += 1) {
    doc.setPage(p);
    const w = doc.internal.pageSize.getWidth();
    const h = doc.internal.pageSize.getHeight();
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(150, 150, 150);
    doc.text(pdfSafe(title), MARGIN, h - 18);
    doc.text(`${p} / ${total}`, w - MARGIN, h - 18, { align: 'right' });
  }
};

/** Small filled/rounded VLAN badge — ties the report back to the diagram's own VLAN colours. */
const vlanChipLabel = (vlan: string, suffix?: string) => {
  return pdfSafe(suffix ? `VLAN ${vlan} ${suffix}` : `VLAN ${vlan}`);
};

const measureVlanChipWidth = (
  doc: jsPDF,
  vlan: string,
  suffix?: string
): number => {
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7.5);
  return doc.getTextWidth(vlanChipLabel(vlan, suffix)) + 8;
};

const drawVlanChip = (
  doc: jsPDF,
  vlan: string,
  vlanColor: string | null,
  x: number,
  baselineY: number,
  opts?: { suffix?: string }
): number => {
  const bgHex = vlanColor ?? VLAN_1_COLOR;
  const label = vlanChipLabel(vlan, opts?.suffix);
  const chipW = measureVlanChipWidth(doc, vlan, opts?.suffix);

  const [r, g, b] = hexToRgb(bgHex);
  doc.setFillColor(r, g, b);
  doc.roundedRect(x, baselineY - CHIP_H + 2.5, chipW, CHIP_H, 2, 2, 'F');

  const [tr, tg, tb] = readableTextColor(bgHex);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7.5);
  doc.setTextColor(tr, tg, tb);
  doc.text(label, x + 4, baselineY - 1);
  return chipW;
};

/** Pack trunk VLAN chips into wrapped lines that fit `maxWidth`. */
const layoutVlanChipLines = (
  doc: jsPDF,
  vlans: string[],
  maxWidth: number
): { vlan: string; width: number }[][] => {
  const lines: { vlan: string; width: number }[][] = [];
  let current: { vlan: string; width: number }[] = [];
  let used = 0;

  vlans.forEach((vlan) => {
    const width = measureVlanChipWidth(doc, vlan);
    const gap = current.length > 0 ? CHIP_GAP_X : 0;
    if (current.length > 0 && used + gap + width > maxWidth) {
      lines.push(current);
      current = [{ vlan, width }];
      used = width;
      return;
    }
    current.push({ vlan, width });
    used += gap + width;
  });

  if (current.length > 0) lines.push(current);
  return lines;
};

const measurePortRowHeight = (
  doc: jsPDF,
  port: PortRowData,
  trybColWidth: number
): number => {
  if (port.type !== 'trunk' || port.allowedVlans.length === 0) {
    return ROW_H;
  }

  const lines = layoutVlanChipLines(doc, port.allowedVlans, trybColWidth);
  const chipsH =
    lines.length > 0
      ? lines.length * CHIP_H + (lines.length - 1) * CHIP_GAP_Y
      : 0;
  return Math.max(
    ROW_H,
    ROW_PAD_Y + TRUNK_LABEL_H + CHIP_GAP_Y + chipsH + ROW_PAD_Y
  );
};

/** Height of a card slice: title + col headers + variable port rows. */
const measurePortsSliceHeight = (
  doc: jsPDF,
  ports: PortRowData[],
  trybColWidth: number
): number => {
  if (ports.length === 0) {
    return CARD_HEADER_H + COL_HEADER_H + ROW_H;
  }
  const rowsH = ports.reduce((sum, port) => {
    return sum + measurePortRowHeight(doc, port, trybColWidth);
  }, 0);
  return CARD_HEADER_H + COL_HEADER_H + rowsH;
};

const measureSviHeight = (sviCount: number): number => {
  if (sviCount <= 0) return 0;
  return SVI_HEADER_H + sviCount * ROW_H;
};

const drawCardTitleBar = (
  doc: jsPDF,
  group: DeviceGroup,
  top: number,
  usableW: number,
  continued: boolean
) => {
  const headerBg: [number, number, number] = group.isSwitch
    ? [15, 23, 42]
    : [226, 232, 240];
  const headerText: [number, number, number] = group.isSwitch
    ? [255, 255, 255]
    : [15, 23, 42];
  const subText: [number, number, number] = group.isSwitch
    ? [176, 186, 204]
    : [100, 110, 125];

  doc.setFillColor(headerBg[0], headerBg[1], headerBg[2]);
  doc.rect(MARGIN, top, usableW, CARD_HEADER_H, 'F');

  const title = continued ? `${group.name} (cd.)` : group.name;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10.5);
  doc.setTextColor(headerText[0], headerText[1], headerText[2]);
  doc.text(
    fitText(doc, title, usableW * 0.6),
    MARGIN + 8,
    top + CARD_HEADER_H / 2 + 3.5
  );

  if (!continued) {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8.5);
    doc.setTextColor(subText[0], subText[1], subText[2]);
    doc.text(
      pdfSafe(
        `${group.usedPorts} / ${Math.max(
          group.totalPorts,
          group.usedPorts
        )} portow aktywnych`
      ),
      MARGIN + usableW - 8,
      top + CARD_HEADER_H / 2 + 3.5,
      { align: 'right' }
    );
  }
};

const drawPortColumnHeaders = (
  doc: jsPDF,
  top: number,
  usableW: number,
  portCols: Column[]
) => {
  doc.setFillColor(246, 248, 251);
  doc.rect(MARGIN, top, usableW, COL_HEADER_H, 'F');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7.5);
  doc.setTextColor(140, 148, 162);
  portCols.forEach((col) => {
    doc.text(pdfSafe(col.header), col.x, top + COL_HEADER_H - 4);
  });
};

const drawPortRows = (
  doc: jsPDF,
  ports: PortRowData[],
  rowTop: number,
  usableW: number,
  portCols: Column[],
  opts?: {
    pageNumber: number;
    pendingLinks: PendingPeerLink[];
  }
) => {
  if (ports.length === 0) {
    doc.setFont('helvetica', 'italic');
    doc.setFontSize(9);
    doc.setTextColor(150, 150, 150);
    doc.text(pdfSafe('Brak portow'), portCols[0].x, rowTop + ROW_H - 5);
    return;
  }

  let yCursor = rowTop;
  ports.forEach((port, i) => {
    const rowH = measurePortRowHeight(doc, port, portCols[2].width);
    const textBaseline = yCursor + Math.min(ROW_H, rowH) - 5;

    if (i % 2 === 1) {
      doc.setFillColor(249, 250, 252);
      doc.rect(MARGIN, yCursor, usableW, rowH, 'F');
    }

    const hasPeerLink = Boolean(port.peerItemId);

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9);
    if (hasPeerLink) {
      doc.setTextColor(29, 78, 216);
    } else {
      doc.setTextColor(30, 30, 35);
    }
    doc.text(
      fitText(doc, port.label, portCols[0].width - 4),
      portCols[0].x,
      textBaseline
    );

    drawVlanChip(doc, port.vlan, port.vlanColor, portCols[1].x, textBaseline, {
      suffix: port.type === 'trunk' ? '(Native)' : undefined
    });

    if (port.type === 'trunk') {
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(9);
      doc.setTextColor(...TRUNK_TEXT_RGB);
      doc.text('TRUNK', portCols[2].x, textBaseline);

      if (port.allowedVlans.length > 0) {
        const lines = layoutVlanChipLines(
          doc,
          port.allowedVlans,
          portCols[2].width
        );
        let chipTop = yCursor + ROW_PAD_Y + TRUNK_LABEL_H + CHIP_GAP_Y;
        lines.forEach((line) => {
          let { x } = portCols[2];
          const chipBaseline = chipTop + CHIP_H - 2.5;
          line.forEach((chip) => {
            drawVlanChip(
              doc,
              chip.vlan,
              getVlanColor(chip.vlan),
              x,
              chipBaseline
            );
            x += chip.width + CHIP_GAP_X;
          });
          chipTop += CHIP_H + CHIP_GAP_Y;
        });
      }
    } else {
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(9);
      doc.setTextColor(120, 128, 140);
      doc.text('Access', portCols[2].x, textBaseline);
    }

    doc.setFont('helvetica', hasPeerLink ? 'bold' : 'normal');
    doc.setFontSize(9);
    if (hasPeerLink) {
      doc.setTextColor(29, 78, 216);
    } else {
      doc.setTextColor(60, 65, 75);
    }
    doc.text(
      fitText(doc, port.peerName, portCols[3].width - 4),
      portCols[3].x,
      textBaseline
    );
    doc.setFont('helvetica', 'normal');
    doc.text(
      fitText(doc, port.peerPort, portCols[4].width - 4),
      portCols[4].x,
      textBaseline
    );

    if (port.via !== '—') {
      doc.setFont('helvetica', 'italic');
      doc.setTextColor(95, 105, 125);
    } else {
      doc.setTextColor(60, 65, 75);
    }
    doc.text(
      fitText(doc, port.via, portCols[5].width - 4),
      portCols[5].x,
      textBaseline
    );

    if (hasPeerLink && port.peerItemId && opts) {
      opts.pendingLinks.push({
        sourcePage: opts.pageNumber,
        x: MARGIN,
        y: yCursor,
        w: usableW,
        h: rowH,
        peerItemId: port.peerItemId
      });
    }

    yCursor += rowH;
  });
};

const drawSviBlock = (
  doc: jsPDF,
  svis: SviRowData[],
  top: number,
  usableW: number,
  sviCols: Column[]
) => {
  let rowTop = top;
  doc.setFillColor(239, 246, 255);
  doc.rect(MARGIN, rowTop, usableW, SVI_HEADER_H, 'F');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7.5);
  doc.setTextColor(29, 78, 216);
  doc.text(pdfSafe('INTERFEJSY SVI'), sviCols[0].x, rowTop + SVI_HEADER_H - 5);
  rowTop += SVI_HEADER_H;

  svis.forEach((svi, i) => {
    const y = rowTop + (i + 1) * ROW_H - 5;
    if (i % 2 === 1) {
      doc.setFillColor(245, 249, 255);
      doc.rect(MARGIN, rowTop + i * ROW_H, usableW, ROW_H, 'F');
    }
    drawVlanChip(doc, svi.vlan, getVlanColor(svi.vlan), sviCols[0].x, y);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    doc.setTextColor(40, 45, 55);
    doc.text(fitText(doc, svi.ip, sviCols[1].width - 4), sviCols[1].x, y);
  });
};

/**
 * Colour, offline PDF export of the Plan (2D) view: a rasterised snapshot
 * of the diagram followed by a per-device connections report.
 */
export const exportAsInteractivePdf = async ({
  model,
  filename
}: {
  model: Model;
  filename?: string;
}): Promise<void> => {
  const planView = findPlanView(model.views);

  if (!planView) {
    window.alert(
      'Nie znaleziono widoku Plan (2D) do wyeksportowania. Dodaj przynajmniej jedno urządzenie w widoku Plan.'
    );
    return;
  }

  let stage: OffscreenStage | null = null;

  try {
    stage = await mountOffscreenPlanView(model, planView);

    const canvasRect = stage.canvasEl.getBoundingClientRect();
    const { width } = canvasRect;
    const { height } = canvasRect;

    const computedBg = getComputedStyle(stage.canvasEl).backgroundColor;
    // JPEG has no alpha channel — a transparent bg would otherwise
    // rasterise as black once composited onto the canvas.
    const isTransparent =
      !computedBg ||
      computedBg === 'transparent' ||
      /rgba\([^)]*,\s*0\s*\)/.test(computedBg);
    const bg = isTransparent ? '#f6faff' : computedBg;

    // JPEG, not PNG: a raw/PNG bitmap this large (offscreen canvases can be
    // up to 6000×6000px) balloons into a 100MB+ PDF once jsPDF embeds it.
    // The diagram is a flat-colour vector-ish rendering, not a photo, but
    // JPEG at a high quality is visually indistinguishable here and keeps
    // the exported file small enough to actually download/open/email.
    const imageDataUrl = await domtoimage.toJpeg(stage.canvasEl, {
      width,
      height,
      bgcolor: bg,
      quality: 0.92,
      cacheBust: true
    });

    const graph = buildHtmlExportHoverGraph({
      connectors: planView.connectors ?? [],
      modelItems: model.items
    });

    const planItemIds = new Set(
      planView.items.map((item) => {
        return item.id;
      })
    );
    const title = model.title?.trim() || 'Projekt';
    const modelById = new Map(
      model.items.map((item) => {
        return [item.id, item];
      })
    );

    const resolvePortLabel = (itemId: string, portId: string | null) => {
      if (!portId) return null;
      const fromGraph = graph.nodeInfo[itemId]?.ports[portId]?.portLabel;
      if (fromGraph) return fromGraph;
      const modelItem = modelById.get(itemId);
      if (!modelItem) return portId;
      const layoutPort = getModelItemPorts(modelItem).find((candidate) => {
        return candidate.id === portId;
      });
      if (layoutPort?.label) return layoutPort.label;
      if (modelItem.icon) {
        return getShape2dPortIfaceName(modelItem.icon, portId) || portId;
      }
      return portId;
    };

    // --- Build per-device report data ---------------------------------
    // Switches / end devices: every physical port (incl. unused VLAN 1).
    // Patch panels: only jacks that actually have a cable (passive bridge).
    // Cabinets / blanking plates (no ports) are skipped.
    const deviceGroups: DeviceGroup[] = model.items
      .filter((item) => {
        return planItemIds.has(item.id);
      })
      .map((item) => {
        const info = graph.nodeInfo[item.id];
        const layoutPorts = getModelItemPorts(item);
        const usedPortIds = new Set(graph.nodePorts[item.id] ?? []);
        const isPanel = isPatchPanelItem(item);
        return { item, info, layoutPorts, usedPortIds, isPanel };
      })
      .filter(({ layoutPorts }) => {
        return layoutPorts.length > 0;
      })
      .map(({ item, info, layoutPorts, usedPortIds, isPanel }) => {
        const portsToList = isPanel
          ? layoutPorts.filter((p) => {
              return usedPortIds.has(p.id);
            })
          : layoutPorts;

        const ports: PortRowData[] = portsToList
          .map((layoutPort) => {
            const portId = layoutPort.id;
            const configured = info?.ports[portId];
            const modelPort = item.ports?.[portId];
            const vlan =
              configured?.vlan?.trim() || modelPort?.vlan?.trim() || '1';
            const type: 'access' | 'trunk' =
              configured?.type === 'trunk' || modelPort?.type === 'trunk'
                ? 'trunk'
                : 'access';
            const label =
              configured?.portLabel ||
              layoutPort.label ||
              resolvePortLabel(item.id, portId) ||
              portId;

            const allowedVlans =
              type === 'trunk'
                ? Array.from(
                    new Set(
                      (modelPort?.allowedVlans ?? collectModelItemVlans(item))
                        .map((v) => {
                          return String(v).trim();
                        })
                        .filter(Boolean)
                    )
                  ).sort((a, b) => {
                    return a.localeCompare(b, undefined, { numeric: true });
                  })
                : [];

            const peerInfo = graph.portPeers[`${item.id}::${portId}`];
            const peerItemId = peerInfo?.peerItemId ?? null;
            const peerName = peerItemId
              ? graph.nodeInfo[peerItemId]?.name ?? 'Urzadzenie'
              : '—';
            const peerPort = peerInfo
              ? resolvePortLabel(peerInfo.peerItemId, peerInfo.peerPortId) ??
                '—'
              : '—';

            const viaParts =
              peerInfo?.via?.map((hop) => {
                const panelName =
                  graph.nodeInfo[hop.itemId]?.name ?? 'Patch panel';
                const jack = resolvePortLabel(hop.itemId, hop.portId);
                return jack ? `${panelName} — ${jack}` : panelName;
              }) ?? [];
            const via = viaParts.length > 0 ? viaParts.join(', ') : '—';
            const poe = layoutPort.poe ?? null;
            const poeSuffix =
              poe === 'OUT' ? ' · PoE Out' : poe === 'IN' ? ' · PoE IN' : '';

            return {
              label: `${label}${poeSuffix}`,
              vlan,
              vlanColor: getVlanColor(vlan),
              type,
              allowedVlans,
              peerName,
              peerPort,
              peerItemId,
              via,
              poe
            };
          })
          .sort((a, b) => {
            return a.label.localeCompare(b.label, undefined, {
              numeric: true
            });
          });

        const svis: SviRowData[] = (info?.svis ?? [])
          .filter((svi): svi is { vlan: string; ip: string } => {
            return Boolean(svi.ip);
          })
          .map((svi) => {
            return { vlan: svi.vlan, ip: svi.ip };
          });

        const connectedCount = layoutPorts.filter((p) => {
          return usedPortIds.has(p.id);
        }).length;

        return {
          itemId: item.id,
          name: info?.name ?? item.name?.trim() ?? 'Urządzenie',
          isSwitch: isSwitchLikeIcon(item.icon),
          usedPorts: connectedCount,
          totalPorts: layoutPorts.length,
          ports,
          svis
        };
      })
      .sort((a, b) => {
        if (a.isSwitch !== b.isSwitch) return a.isSwitch ? -1 : 1;
        return a.name.localeCompare(b.name);
      });

    // --- Page geometry for the appendix ---------------------------------
    // eslint-disable-next-line new-cap -- jsPDF's constructor is lower-camel-cased by the library.
    const probe = new jsPDF({
      unit: 'pt',
      format: 'a4',
      orientation: 'landscape'
    });
    const tablePageW = probe.internal.pageSize.getWidth();
    const tablePageH = probe.internal.pageSize.getHeight();
    const usableW = tablePageW - MARGIN * 2;

    const portCols: Column[] = [
      { header: 'PORT', x: MARGIN + 8, width: usableW * 0.14 },
      { header: 'VLAN', x: MARGIN + usableW * 0.16, width: usableW * 0.12 },
      { header: 'TRYB', x: MARGIN + usableW * 0.3, width: usableW * 0.18 },
      {
        header: 'POLACZONY Z',
        x: MARGIN + usableW * 0.5,
        width: usableW * 0.16
      },
      {
        header: 'PORT',
        x: MARGIN + usableW * 0.68,
        width: usableW * 0.06
      },
      {
        header: 'PRZEZ (PATCH)',
        x: MARGIN + usableW * 0.76,
        width: usableW * 0.22
      }
    ];
    const trybColWidth = portCols[2].width;
    const sviCols: Column[] = [
      { header: 'VLAN', x: MARGIN + 8, width: usableW * 0.16 },
      {
        header: 'ADRES IP',
        x: MARGIN + usableW * 0.16,
        width: usableW * 0.5
      }
    ];

    // --- Page 1: diagram -------------------------------------------------
    const diagramOrientation = width >= height ? 'landscape' : 'portrait';
    // eslint-disable-next-line new-cap -- jsPDF's constructor is lower-camel-cased by the library.
    const doc = new jsPDF({
      unit: 'pt',
      format: 'a4',
      orientation: diagramOrientation
    });
    const pageW = doc.internal.pageSize.getWidth();
    const pageH = doc.internal.pageSize.getHeight();

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(16);
    doc.setTextColor(20, 20, 20);
    doc.text(fitText(doc, title, pageW - MARGIN * 2), MARGIN, MARGIN);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    doc.setTextColor(120, 120, 120);
    doc.text(
      pdfSafe(`Wygenerowano ${new Date().toLocaleString('pl-PL')}`),
      MARGIN,
      MARGIN + 16
    );

    const imgTop = MARGIN + 32;
    const availW = pageW - MARGIN * 2;
    const availH = pageH - imgTop - MARGIN;
    const scale =
      width > 0 && height > 0 ? Math.min(availW / width, availH / height) : 1;
    const imgW = width * scale;
    const imgH = height * scale;
    const imgX = MARGIN + (availW - imgW) / 2;
    const imgY = imgTop + (availH - imgH) / 2;

    if (width > 0 && height > 0) {
      doc.addImage(imageDataUrl, 'JPEG', imgX, imgY, imgW, imgH);
    } else {
      doc.setFont('helvetica', 'italic');
      doc.setFontSize(11);
      doc.setTextColor(140, 140, 140);
      doc.text(pdfSafe('Brak elementów w widoku Plan.'), pageW / 2, pageH / 2, {
        align: 'center'
      });
    }

    // --- Appendix: per-device report --------------------------------------
    let page = 1;
    let cursorY = PAGE_TOP;
    let currentSection: 'switch' | 'end' | null = null;
    const deviceAnchors = new Map<string, DeviceAnchor>();
    const pendingPeerLinks: PendingPeerLink[] = [];

    const ensurePage = () => {
      while (doc.getNumberOfPages() < page) {
        doc.addPage('a4', 'landscape');
      }
      doc.setPage(page);
    };

    const drawPageTitle = () => {
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(13);
      doc.setTextColor(30, 30, 30);
      doc.text(pdfSafe('Raport urządzeń i połączeń'), MARGIN, MARGIN);
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8);
      doc.setTextColor(120, 130, 145);
      doc.text(
        pdfSafe(
          'Kliknij wiersz portu z polaczeniem, aby przeskoczyc do urzadzenia po drugiej stronie.'
        ),
        MARGIN,
        MARGIN + 14
      );
    };

    const startNewAppendixPage = () => {
      page += 1;
      cursorY = PAGE_TOP;
      ensurePage();
      drawPageTitle();
      // Section heading must be repeated so a continued page still reads alone.
      currentSection = null;
    };

    const ensureSectionHeader = (
      sectionKey: 'switch' | 'end',
      sectionLabel: string
    ) => {
      if (sectionKey === currentSection) return;
      if (
        cursorY +
          SECTION_HEADER_H +
          measurePortsSliceHeight(doc, [], trybColWidth) >
        tablePageH - MARGIN
      ) {
        startNewAppendixPage();
      }
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(10.5);
      doc.setTextColor(95, 105, 120);
      doc.text(pdfSafe(sectionLabel), MARGIN, cursorY + 8);
      doc.setDrawColor(205, 210, 220);
      doc.setLineWidth(0.6);
      doc.line(MARGIN, cursorY + 13, tablePageW - MARGIN, cursorY + 13);
      cursorY += SECTION_HEADER_H;
      currentSection = sectionKey;
    };

    /** Pack as many ports as fit into `spaceForRows`, always taking at least one. */
    const packPortSlice = (
      ports: PortRowData[],
      fromIndex: number,
      spaceForRows: number
    ): { slice: PortRowData[]; rowsHeight: number; nextIndex: number } => {
      const slice: PortRowData[] = [];
      let rowsHeight = 0;
      let index = fromIndex;

      while (index < ports.length) {
        const rowH = measurePortRowHeight(doc, ports[index], trybColWidth);
        if (slice.length > 0 && rowsHeight + rowH > spaceForRows) {
          break;
        }
        slice.push(ports[index]);
        rowsHeight += rowH;
        index += 1;
        if (slice.length === 1 && rowH > spaceForRows) {
          break;
        }
      }

      return {
        slice,
        rowsHeight: rowsHeight || ROW_H,
        nextIndex: index
      };
    };

    if (deviceGroups.length > 0) {
      page = 2;
      ensurePage();
      drawPageTitle();
    }

    deviceGroups.forEach((group) => {
      const sectionKey: 'switch' | 'end' = group.isSwitch ? 'switch' : 'end';
      const sectionLabel = group.isSwitch
        ? 'SWITCHE I URZĄDZENIA SIECIOWE'
        : 'URZĄDZENIA KOŃCOWE';

      ensurePage();
      ensureSectionHeader(sectionKey, sectionLabel);

      let portIndex = 0;
      let continued = false;
      const totalPorts = group.ports.length;
      const hasPorts = totalPorts > 0;

      while (!hasPorts ? !continued : portIndex < totalPorts) {
        const headerOverhead = CARD_HEADER_H + COL_HEADER_H;
        const minSlice = headerOverhead + ROW_H;
        if (cursorY + minSlice > tablePageH - MARGIN) {
          startNewAppendixPage();
          ensureSectionHeader(sectionKey, sectionLabel);
        }

        const spaceLeft = tablePageH - MARGIN - cursorY;
        const sviH = measureSviHeight(group.svis.length);
        const spaceForRows = Math.max(ROW_H, spaceLeft - headerOverhead);

        let portsThisSlice: PortRowData[] = [];
        let portsBlockH = ROW_H;

        if (hasPorts) {
          const packed = packPortSlice(group.ports, portIndex, spaceForRows);
          portsThisSlice = packed.slice;
          portsBlockH = packed.rowsHeight;
          portIndex = packed.nextIndex;
        }

        let includeSvi = false;
        if (hasPorts && sviH > 0 && portIndex >= totalPorts) {
          if (headerOverhead + portsBlockH + sviH <= spaceLeft) {
            includeSvi = true;
          } else if (portsThisSlice.length > 1) {
            // Drop trailing rows until ports + SVI fit on this page.
            let keep = portsThisSlice.length;
            let keepH = portsBlockH;
            while (keep > 1 && headerOverhead + keepH + sviH > spaceLeft) {
              keep -= 1;
              keepH = portsThisSlice.slice(0, keep).reduce((sum, port) => {
                return sum + measurePortRowHeight(doc, port, trybColWidth);
              }, 0);
            }
            if (headerOverhead + keepH + sviH <= spaceLeft) {
              const overflow = portsThisSlice.length - keep;
              portsThisSlice = portsThisSlice.slice(0, keep);
              portsBlockH = keepH;
              portIndex -= overflow;
              includeSvi = portIndex >= totalPorts;
            }
          }
        } else if (!hasPorts && sviH > 0) {
          includeSvi = headerOverhead + ROW_H + sviH <= spaceLeft;
        }

        const isLastPortsSlice = !hasPorts || portIndex >= totalPorts;
        const sliceH = headerOverhead + portsBlockH + (includeSvi ? sviH : 0);

        doc.setDrawColor(222, 226, 233);
        doc.setLineWidth(0.6);
        doc.rect(MARGIN, cursorY, usableW, sliceH);

        if (!continued && !deviceAnchors.has(group.itemId)) {
          deviceAnchors.set(group.itemId, {
            pageNumber: page,
            y: cursorY
          });
        }

        drawCardTitleBar(doc, group, cursorY, usableW, continued);
        drawPortColumnHeaders(doc, cursorY + CARD_HEADER_H, usableW, portCols);
        drawPortRows(
          doc,
          portsThisSlice,
          cursorY + CARD_HEADER_H + COL_HEADER_H,
          usableW,
          portCols,
          { pageNumber: page, pendingLinks: pendingPeerLinks }
        );

        if (includeSvi) {
          drawSviBlock(
            doc,
            group.svis,
            cursorY + headerOverhead + portsBlockH,
            usableW,
            sviCols
          );
        }

        cursorY += sliceH + CARD_GAP;
        continued = true;

        if (!hasPorts) {
          if (sviH > 0 && !includeSvi) {
            if (cursorY + CARD_HEADER_H + sviH > tablePageH - MARGIN) {
              startNewAppendixPage();
              ensureSectionHeader(sectionKey, sectionLabel);
            }
            const sviCardH = CARD_HEADER_H + sviH;
            doc.setDrawColor(222, 226, 233);
            doc.setLineWidth(0.6);
            doc.rect(MARGIN, cursorY, usableW, sviCardH);
            drawCardTitleBar(doc, group, cursorY, usableW, true);
            drawSviBlock(
              doc,
              group.svis,
              cursorY + CARD_HEADER_H,
              usableW,
              sviCols
            );
            cursorY += sviCardH + CARD_GAP;
          }
          break;
        }

        if (isLastPortsSlice && sviH > 0 && !includeSvi) {
          if (cursorY + CARD_HEADER_H + sviH > tablePageH - MARGIN) {
            startNewAppendixPage();
            ensureSectionHeader(sectionKey, sectionLabel);
          }
          const sviCardH = CARD_HEADER_H + sviH;
          doc.setDrawColor(222, 226, 233);
          doc.setLineWidth(0.6);
          doc.rect(MARGIN, cursorY, usableW, sviCardH);
          drawCardTitleBar(doc, group, cursorY, usableW, true);
          drawSviBlock(
            doc,
            group.svis,
            cursorY + CARD_HEADER_H,
            usableW,
            sviCols
          );
          cursorY += sviCardH + CARD_GAP;
        }
      }
    });

    // Resolve peer jumps after every device has an anchor (first card slice).
    pendingPeerLinks.forEach((link) => {
      const dest = deviceAnchors.get(link.peerItemId);
      if (!dest) return;
      doc.setPage(link.sourcePage);
      doc.link(link.x, link.y, link.w, link.h, {
        pageNumber: dest.pageNumber,
        top: Math.max(0, dest.y - 8)
      });
    });

    addFooters(doc, title);

    downloadFile(
      doc.output('blob'),
      filename || generateProjectFilename(title, 'pdf')
    );
  } finally {
    if (stage) {
      unmountOffscreenStage(stage);
    }
  }
};
