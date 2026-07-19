import {
  MAX_SWITCH_TEMPLATE_PORTS,
  RACK_1U_HEIGHT_TILES,
  RACK_1U_WIDTH_TILES,
  Shape2dPort,
  Shape2dPortMedia
} from 'src/config';
import type { DeviceTemplate, Size } from 'src/types';

export type DeviceTemplateLayout = {
  size: Size;
  ports: Shape2dPort[];
  formFactor: DeviceTemplate['formFactor'];
  /** Vertical divider x positions (tile) between sections. */
  sectionDividers: number[];
  /** True when sections do not fit the fixed RACK width. */
  overflow: boolean;
};

const TOP_PORT_Y = 4;
const BOTTOM_PORT_Y = 7;
const PORT_PITCH = 2;
const SIDE_MARGIN = 2; // tiles left/right inside chassis
const SECTION_GAP = 1;

const sectionCols = (section: DeviceTemplate['sections'][number]) => {
  const rows = section.rows ?? 2;
  if (section.cols) return section.cols;
  return Math.max(1, Math.ceil(section.ports / rows));
};

const sectionWidthTiles = (section: DeviceTemplate['sections'][number]) => {
  return sectionCols(section) * PORT_PITCH;
};

export const countTemplatePorts = (template: DeviceTemplate): number => {
  return template.sections.reduce((sum, section) => {
    return sum + section.ports;
  }, 0);
};

/**
 * Assign display numbers for a section according to numbering scheme.
 * Returns array length = ports, index = visual slot (row-major top L→R then bottom).
 */
const numberSection = (
  ports: number,
  cols: number,
  rows: number,
  numbering: DeviceTemplate['numbering'],
  startAt: number
): number[] => {
  const labels = Array.from({ length: ports }, () => 0);

  if (numbering === 'ODD_EVEN') {
    // Top: startAt, startAt+2…; bottom: startAt+1, startAt+3… (SCALANCE / Cisco)
    for (let col = 0; col < cols; col += 1) {
      const topIdx = col;
      const bottomIdx = cols + col;
      if (topIdx < ports) {
        labels[topIdx] = startAt + col * 2;
      }
      if (bottomIdx < ports && rows >= 2) {
        labels[bottomIdx] = startAt + col * 2 + 1;
      }
    }
    return labels;
  }

  if (numbering === 'COLS_TTB') {
    // Column by column, top then bottom (MikroTik-ish)
    let n = startAt;
    for (let col = 0; col < cols; col += 1) {
      for (let row = 0; row < rows; row += 1) {
        const idx = row * cols + col;
        if (idx < ports) {
          labels[idx] = n;
          n += 1;
        }
      }
    }
    return labels;
  }

  // ROWS_LTR: top L→R, then bottom L→R
  for (let i = 0; i < ports; i += 1) {
    labels[i] = startAt + i;
  }
  return labels;
};

/**
 * Lay out a switch template into a tile footprint + port handles.
 * - RACK: fixed RACK_1U_WIDTH_TILES bay (cabinet slot), equalized side margins
 * - DIN/CUSTOM: width grows with ports; height always 1U (same as RACK)
 */
export const layoutDeviceTemplate = (
  template: DeviceTemplate
): DeviceTemplateLayout => {
  const sections = template.sections;
  const sectionWidths = sections.map(sectionWidthTiles);
  const gaps = Math.max(0, sections.length - 1) * SECTION_GAP;
  const sectionsSpan =
    sectionWidths.reduce((sum, w) => sum + w, 0) + gaps;

  /**
   * Bounding box of port tiles: first port at section start, last port at
   * sectionsSpan - PORT_PITCH (trailing pitch pad after the final column).
   * Internal section pads + gaps stay inside this span.
   */
  const portSpan = Math.max(1, sectionsSpan - (PORT_PITCH - 1));

  const isRack = template.formFactor === 'RACK';
  // Overflow only when ports cannot fit even with zero side margin.
  const overflow = isRack && portSpan > RACK_1U_WIDTH_TILES;

  // RACK: fixed bay width (cabinet slot). DIN/CUSTOM: grow with ports.
  // Height is always 1U for every form factor.
  const bay = isRack
    ? overflow
      ? portSpan + SIDE_MARGIN * 2
      : RACK_1U_WIDTH_TILES
    : Math.max(8, portSpan + SIDE_MARGIN * 2);
  const margin = isRack
    ? Math.max(0, Math.floor((bay - portSpan) / 2))
    : SIDE_MARGIN;

  const size: Size = {
    width: bay,
    height: RACK_1U_HEIGHT_TILES
  };

  let cursorX = isRack ? margin : SIDE_MARGIN;

  const ports: Shape2dPort[] = [];
  const sectionDividers: number[] = [];
  let nextNumber = 1;

  sections.forEach((section, sectionIndex) => {
    const rows = section.rows ?? 2;
    const cols = sectionCols(section);
    const labels = numberSection(
      section.ports,
      cols,
      rows,
      // Always sequential top L→R then bottom (1, 2, 3…) — not chassis ODD_EVEN.
      'ROWS_LTR',
      nextNumber
    );
    nextNumber += section.ports;

    const media: Shape2dPortMedia = section.media;

    for (let i = 0; i < section.ports; i += 1) {
      const row = Math.floor(i / cols);
      const col = i % cols;
      const y = row === 0 ? TOP_PORT_Y : BOTTOM_PORT_Y;
      const side = row === 0 ? ('TOP' as const) : ('BOTTOM' as const);

      ports.push({
        id: `${section.id}-p${i + 1}`,
        tile: {
          x: cursorX + col * PORT_PITCH,
          y
        },
        side,
        media,
        label: String(labels[i] || i + 1),
        sectionId: section.id
      });
    }

    cursorX += sectionWidths[sectionIndex];
    if (sectionIndex < sections.length - 1) {
      sectionDividers.push(cursorX);
      cursorX += SECTION_GAP;
    }
  });

  return {
    size,
    ports,
    formFactor: template.formFactor,
    sectionDividers,
    overflow
  };
};

export const validateDeviceTemplateFit = (
  template: DeviceTemplate
): string | null => {
  const total = countTemplatePorts(template);
  if (total > MAX_SWITCH_TEMPLATE_PORTS) {
    return `Maks. ${MAX_SWITCH_TEMPLATE_PORTS} portów na switch (komercyjne ~48–52). Masz ${total}.`;
  }

  const layout = layoutDeviceTemplate(template);
  if (layout.overflow) {
    return `Za dużo portów na RACK ${RACK_1U_WIDTH_TILES} kratek — zmniejsz sekcje lub użyj DIN/Custom.`;
  }

  return null;
};
