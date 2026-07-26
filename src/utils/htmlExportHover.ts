import type { ModelItem, Coords } from 'src/types';
import { TILE_SIZE_2D, getShape2dPortIfaceName } from 'src/config';
import {
  expandConnectorIdsThroughPatchPanels,
  isPatchPanelItem
} from './patchPanel';
import {
  findConnectorStackBadges,
  getStackFanOffsetsPx
} from './connectorStacks';
import { getConnectorGlobalTiles } from './connectorJumps';
import { getConnectorRelationSummary } from './vlanColors';

export type HtmlExportPortPeer = {
  peerItemId: string;
  peerPortId: string | null;
  /** Cable ids in the path (incl. patch-panel bridge siblings). */
  cableIds: string[];
  /**
   * Intermediate patch-panel jack(s) on the path (device → panel → peer).
   * Empty when the cable goes directly to the peer.
   */
  via: { itemId: string; portId: string | null }[];
};

export type HtmlExportNodePortInfo = {
  portLabel: string;
  vlan: string;
  type: 'access' | 'trunk';
  /** Tagged VLANs on trunk ports (native stays in `vlan`). */
  allowedVlans?: string[];
};

/** Text summary of a node — powers the click/hover info panel in the export. */
export type HtmlExportNodeInfo = {
  name: string;
  ports: Record<string, HtmlExportNodePortInfo>;
  svis: { vlan: string; ip?: string }[];
};

/** Text summary of a cable — powers the click/hover info panel in the export. */
export type HtmlExportCableInfo = {
  vlanLabel: string;
  linkMode: string;
  endpoints: {
    itemId: string;
    itemName: string;
    portLabel: string;
    ip?: string | null;
  }[];
};

export type HtmlExportHoverGraph = {
  /** cableId → endpoint item ids */
  cableEndpoints: Record<string, string[]>;
  /** cableId → bridge sibling cable ids (incl. self) */
  cableGroup: Record<string, string[]>;
  /** nodeId → direct cable ids touching the node */
  nodeCables: Record<string, string[]>;
  /** node ids that are patch panels */
  patchPanelIds: string[];
  /**
   * `${itemId}::${portId}` → far peer (through patch-panel bridges).
   */
  portPeers: Record<string, HtmlExportPortPeer>;
  /** nodeId → ports on that node that have a cable */
  nodePorts: Record<string, string[]>;
  /** nodeId → human-readable name/port/VLAN summary (info panel) */
  nodeInfo: Record<string, HtmlExportNodeInfo>;
  /** cableId → human-readable VLAN/link-mode summary (info panel) */
  cableInfo: Record<string, HtmlExportCableInfo>;
};

export type HtmlExportStack = {
  key: string;
  connectorIds: string[];
  along: Coords;
  offsets: Record<string, Coords>;
};

export type HtmlExportGraph = HtmlExportHoverGraph & {
  stacks: HtmlExportStack[];
  fanSpacingPx: number;
};

const FAN_SPACING_PX = Math.round(TILE_SIZE_2D * 0.55);

const portKey = (itemId: string, portId: string) => {
  return `${itemId}::${portId}`;
};

type ConnectorLike = {
  id: string;
  anchors: {
    ref: { item?: string; port?: string; tile?: Coords };
  }[];
  path?: {
    tiles: Coords[];
    rectangle?: { from: Coords; to?: Coords };
  };
};

/**
 * Relation + stack + port graph for interactive HTML exports.
 */
type ExportModelItem = Partial<ModelItem> & { id: string };

export const buildHtmlExportHoverGraph = ({
  connectors,
  modelItems
}: {
  connectors: ConnectorLike[];
  modelItems: ExportModelItem[];
}): HtmlExportGraph => {
  const cableEndpoints: Record<string, string[]> = {};
  const cableGroup: Record<string, string[]> = {};
  const nodeCables: Record<string, string[]> = {};
  const patchPanelIds: string[] = [];
  const portPeers: Record<string, HtmlExportPortPeer> = {};
  const nodePorts: Record<string, string[]> = {};
  const modelById = new Map(
    modelItems.map((item) => {
      return [item.id, item];
    })
  );

  modelItems.forEach((item) => {
    if (isPatchPanelItem(item)) patchPanelIds.push(item.id);
  });
  const panelSet = new Set(patchPanelIds);

  connectors.forEach((connector) => {
    const endpoints = Array.from(
      new Set(
        connector.anchors
          .map((anchor) => {
            return anchor.ref.item;
          })
          .filter((id): id is string => {
            return Boolean(id);
          })
      )
    );
    cableEndpoints[connector.id] = endpoints;

    endpoints.forEach((itemId) => {
      if (!nodeCables[itemId]) nodeCables[itemId] = [];
      if (!nodeCables[itemId].includes(connector.id)) {
        nodeCables[itemId].push(connector.id);
      }
    });

    const group = Array.from(
      expandConnectorIdsThroughPatchPanels({
        connectorIds: [connector.id],
        connectors,
        modelItems
      })
    );
    cableGroup[connector.id] = group;
  });

  // Port ↔ far peer (prefer non-panel endpoints across bridge group).
  connectors.forEach((connector) => {
    const portAnchors = connector.anchors.filter((anchor) => {
      return Boolean(anchor.ref.item && anchor.ref.port);
    });

    portAnchors.forEach((anchor) => {
      const itemId = anchor.ref.item!;
      const portId = anchor.ref.port!;
      const key = portKey(itemId, portId);
      if (portPeers[key]) return;

      const groupIds = cableGroup[connector.id] ?? [connector.id];
      const groupSet = new Set(groupIds);

      type Far = { itemId: string; portId: string | null };
      const farCandidates: Far[] = [];

      connectors.forEach((candidate) => {
        if (!groupSet.has(candidate.id)) return;
        candidate.anchors.forEach((a) => {
          if (!a.ref.item) return;
          if (a.ref.item === itemId && a.ref.port === portId) return;
          farCandidates.push({
            itemId: a.ref.item,
            portId: a.ref.port ?? null
          });
        });
      });

      const nonPanel = farCandidates.filter((c) => {
        return !panelSet.has(c.itemId);
      });
      const pick = (nonPanel.length > 0 ? nonPanel : farCandidates)[0];
      if (!pick) return;

      // Prefer a far candidate that has a port id when possible.
      const withPort =
        (nonPanel.length > 0 ? nonPanel : farCandidates).find((c) => {
          return Boolean(c.portId);
        }) ?? pick;

      // Deduped patch-panel jacks on this path (A → PP jack → B).
      // Only when there is a real far peer beyond the panel — otherwise the
      // panel itself is the peer and shouldn't appear twice.
      const viaSeen = new Set<string>();
      const via: { itemId: string; portId: string | null }[] = [];
      if (nonPanel.length > 0) {
        farCandidates.forEach((c) => {
          if (!panelSet.has(c.itemId)) return;
          const viaKey = `${c.itemId}::${c.portId ?? ''}`;
          if (viaSeen.has(viaKey)) return;
          viaSeen.add(viaKey);
          via.push({ itemId: c.itemId, portId: c.portId });
        });
      }

      portPeers[key] = {
        peerItemId: withPort.itemId,
        peerPortId: withPort.portId,
        cableIds: groupIds,
        via
      };

      if (!nodePorts[itemId]) nodePorts[itemId] = [];
      if (!nodePorts[itemId].includes(portId)) {
        nodePorts[itemId].push(portId);
      }
    });
  });

  // --- Text summaries for the click/hover info panel -----------------------
  const resolvePortLabel = (itemId: string, portId: string): string => {
    const modelItem = modelById.get(itemId);
    return (
      (modelItem?.icon && getShape2dPortIfaceName(modelItem.icon, portId)) ||
      portId
    );
  };

  const nodeInfo: Record<string, HtmlExportNodeInfo> = {};
  modelItems.forEach((item) => {
    const ports: Record<string, HtmlExportNodePortInfo> = {};
    Object.entries(item.ports ?? {}).forEach(([portId, cfg]) => {
      const type = cfg?.type === 'trunk' ? 'trunk' : 'access';
      ports[portId] = {
        portLabel: resolvePortLabel(item.id, portId),
        vlan: cfg?.vlan?.trim() || '1',
        type,
        ...(type === 'trunk' && cfg?.allowedVlans?.length
          ? {
              allowedVlans: cfg.allowedVlans
                .map((v) => {
                  return String(v).trim();
                })
                .filter(Boolean)
            }
          : {})
      };
    });

    nodeInfo[item.id] = {
      name: item.name?.trim() || 'Urządzenie',
      ports,
      svis: (item.svis ?? []).map((svi) => {
        return { vlan: svi.vlan, ip: svi.ip };
      })
    };
  });

  const cableInfo: Record<string, HtmlExportCableInfo> = {};
  connectors.forEach((connector) => {
    const summary = getConnectorRelationSummary({
      anchors: connector.anchors,
      modelItems,
      connectors,
      connectorId: connector.id,
      resolvePortLabel
    });

    cableInfo[connector.id] = {
      vlanLabel: summary.vlanLabel,
      linkMode: summary.linkMode,
      endpoints: summary.endpoints.map((endpoint) => {
        return {
          itemId: endpoint.itemId,
          itemName: endpoint.itemName,
          portLabel: endpoint.portLabel,
          ip: endpoint.ip
        };
      })
    };
  });

  const pathInputs = connectors
    .filter((connector) => {
      return Boolean(
        connector.path?.tiles?.length && connector.path?.rectangle?.from
      );
    })
    .map((connector) => {
      return {
        id: connector.id,
        tiles: getConnectorGlobalTiles(
          connector as {
            path: { tiles: Coords[]; rectangle: { from: Coords } };
          }
        )
      };
    });

  const stacks: HtmlExportStack[] = findConnectorStackBadges(pathInputs).map(
    (badge) => {
      const key = `${badge.tile.x},${badge.tile.y}`;
      return {
        key,
        connectorIds: [...badge.connectorIds],
        along: { ...badge.along },
        offsets: getStackFanOffsetsPx(
          badge.connectorIds,
          badge.along,
          FAN_SPACING_PX
        )
      };
    }
  );

  return {
    cableEndpoints,
    cableGroup,
    nodeCables,
    patchPanelIds,
    portPeers,
    nodePorts,
    nodeInfo,
    cableInfo,
    stacks,
    fanSpacingPx: FAN_SPACING_PX
  };
};
