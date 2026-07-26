import type { Model } from 'src/types';
import { downloadFile, generateProjectFilename } from './exportOptions';
import { findPlanView } from './plan2dv2';
import {
  buildHtmlExportHoverGraph,
  type HtmlExportGraph
} from './htmlExportHover';
import {
  mountOffscreenPlanView,
  unmountOffscreenStage,
  type OffscreenStage
} from './offscreenPlanRenderer';

/**
 * Interactive, self-contained, offline HTML export of the Plan (2D) view.
 *
 * Design notes (see chat history for the full write-up of why the previous
 * two implementations were fragile):
 * - We NEVER clone the live, currently-visible canvas. Instead we mount a
 *   dedicated, offscreen, non-interactive `<Isoflow>` instance forced onto
 *   the Plan view with `fitToView`, so the export is always correct
 *   regardless of which tab / pan / zoom the user happened to have open.
 * - CSS is filtered down to rules that actually match classes present in
 *   the cloned markup, instead of dumping every stylesheet in the document.
 * - No external font is referenced — text falls back to the next font in
 *   the stack (guaranteed to work fully offline, on any machine).
 */

const addCableHitStrokes = (root: HTMLElement) => {
  root.querySelectorAll('.isoflow-cable svg').forEach((svg) => {
    const polylines = Array.from(svg.querySelectorAll('polyline'));
    if (polylines.length === 0) return;
    const source = polylines[polylines.length - 1] || polylines[0];
    const hit = source.cloneNode(true) as SVGPolylineElement;
    hit.setAttribute('stroke', 'transparent');
    hit.setAttribute('stroke-opacity', '0');
    hit.setAttribute('stroke-width', '24');
    hit.setAttribute('fill', 'none');
    hit.style.pointerEvents = 'stroke';
    hit.classList.add('isoflow-cable-hit');
    svg.insertBefore(hit, svg.firstChild);
  });
};

/* eslint-disable no-param-reassign -- intentionally mutating a detached,
   offscreen DOM clone (never the live app DOM) before serializing it. */
const prepareInteractiveClone = (root: HTMLElement) => {
  root
    .querySelectorAll<HTMLElement>('.isoflow-cable, .isoflow-node')
    .forEach((el) => {
      el.style.opacity = '1';
      el.style.filter = 'none';
      el.style.transition =
        'opacity 0.18s ease, filter 0.18s ease, transform 0.18s ease';
    });

  root.querySelectorAll<HTMLElement>('.isoflow-cable').forEach((el) => {
    const existing = el.style.transform;
    if (existing && existing !== 'none') {
      el.dataset.baseTransform = existing;
    }
  });

  // Ports: enable clicks + tag owning node id.
  root.querySelectorAll<HTMLElement>('[data-port-id]').forEach((portEl) => {
    const node = portEl.closest('.isoflow-node');
    const itemId = node?.getAttribute('data-node-id');
    if (itemId) portEl.setAttribute('data-item-id', itemId);
    portEl.classList.add('isoflow-port');
    portEl.style.pointerEvents = 'auto';
    portEl.style.cursor = 'pointer';
  });
};
/* eslint-enable no-param-reassign */

const collectUsedClassNames = (root: HTMLElement): Set<string> => {
  const classes = new Set<string>();
  const addFrom = (el: Element) => {
    el.classList.forEach((cls) => {
      return classes.add(cls);
    });
  };
  addFrom(root);
  root.querySelectorAll('*').forEach(addFrom);
  return classes;
};

const CLASS_TOKEN_RE = /\.-?[_a-zA-Z][_a-zA-Z0-9-]*/g;

const selectorKeepsRule = (
  selectorText: string,
  usedClasses: Set<string>
): boolean => {
  const tokens = selectorText.match(CLASS_TOKEN_RE);
  if (!tokens || tokens.length === 0) {
    // No class in the selector (html, body, :root, [data-x], * …) — keep,
    // these are cheap and are often structurally required.
    return true;
  }
  return tokens.some((token) => {
    return usedClasses.has(token.slice(1));
  });
};

const collectRuleText = (
  rule: CSSRule,
  usedClasses: Set<string>
): string | null => {
  if (rule instanceof CSSStyleRule) {
    return selectorKeepsRule(rule.selectorText, usedClasses)
      ? rule.cssText
      : null;
  }

  if (typeof CSSMediaRule !== 'undefined' && rule instanceof CSSMediaRule) {
    const inner = Array.from(rule.cssRules)
      .map((child) => {
        return collectRuleText(child, usedClasses);
      })
      .filter((text): text is string => {
        return Boolean(text);
      });
    if (inner.length === 0) return null;
    return `@media ${rule.conditionText} {\n${inner.join('\n')}\n}`;
  }

  if (
    typeof CSSSupportsRule !== 'undefined' &&
    rule instanceof CSSSupportsRule
  ) {
    const inner = Array.from(rule.cssRules)
      .map((child) => {
        return collectRuleText(child, usedClasses);
      })
      .filter((text): text is string => {
        return Boolean(text);
      });
    if (inner.length === 0) return null;
    return `@supports ${rule.conditionText} {\n${inner.join('\n')}\n}`;
  }

  // @font-face / @keyframes / @page / etc. — keep as-is (rare + cheap, and
  // may be referenced indirectly, e.g. via animation-name on a kept class).
  return rule.cssText;
};

/** Only keep CSS rules that actually apply to the exported markup. */
const collectFilteredStyles = (usedClasses: Set<string>): string => {
  const chunks: string[] = [];

  Array.from(document.styleSheets).forEach((sheet) => {
    try {
      Array.from(sheet.cssRules ?? []).forEach((rule) => {
        const text = collectRuleText(rule, usedClasses);
        if (text) chunks.push(text);
      });
    } catch {
      // Cross-origin sheet (e.g. the Google Fonts <link>) — skip it. The
      // export intentionally never depends on a network font.
    }
  });

  return chunks.join('\n');
};

const escapeHtml = (value: string): string => {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
};

const buildHtmlDocument = ({
  title,
  styles,
  bg,
  bodyHtml,
  graph
}: {
  title: string;
  styles: string;
  bg: string;
  bodyHtml: string;
  graph: HtmlExportGraph;
}): string => {
  const graphJson = JSON.stringify(graph).replace(/</g, '\\u003c');
  const safeTitle = escapeHtml(title || 'Projekt');
  const generatedAt = new Date().toLocaleString('pl-PL');

  return `<!DOCTYPE html>
<html lang="pl">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${safeTitle} — eksport interaktywny</title>
  <style>
${styles}
  </style>
  <style>
    html, body {
      margin: 0; padding: 0; width: 100%; height: 100%;
      overflow: hidden; background: ${bg};
      font-family: ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
    }
    #viewer-container {
      width: 100%; height: 100%; position: relative;
      overflow: hidden; cursor: grab; background: ${bg};
    }
    #viewer-container:active { cursor: grabbing; }
    #viewer-canvas {
      position: absolute; inset: 0; width: 100%; height: 100%;
      transform-origin: center center;
    }
    .isoflow-node {
      pointer-events: auto !important;
      cursor: pointer;
      opacity: 1;
      transition: opacity 0.18s ease, filter 0.18s ease !important;
    }
    .isoflow-cable {
      pointer-events: auto !important;
      cursor: pointer;
      opacity: 1;
      transition: opacity 0.18s ease, filter 0.18s ease, transform 0.18s ease !important;
      will-change: transform, opacity, filter;
    }
    .isoflow-cable svg, .isoflow-cable svg * { pointer-events: stroke; }
    .isoflow-cable-hit { pointer-events: stroke !important; }
    .isoflow-port, [data-port-handle-root] {
      pointer-events: auto !important;
      cursor: pointer !important;
      z-index: 8 !important;
    }
    .isoflow-stack-badge {
      pointer-events: auto !important;
      cursor: pointer !important;
      z-index: 30 !important;
    }
    .isoflow-stack-badge.is-pinned {
      outline: 2px solid #2563eb;
      outline-offset: 2px;
    }
    body.is-focus .isoflow-node { opacity: 0.68 !important; filter: none; }
    body.is-focus .isoflow-cable { opacity: 0.32 !important; filter: grayscale(40%); }
    body.is-focus .isoflow-node.is-active-node {
      opacity: 1 !important;
      filter: drop-shadow(0 0 6px rgba(37, 99, 235, 0.65))
        drop-shadow(0 2px 6px rgba(37, 99, 235, 0.4)) !important;
      z-index: 9998 !important;
    }
    body.is-focus .isoflow-cable.is-active-cable {
      opacity: 1 !important;
      filter: drop-shadow(0 0 4px rgba(37, 99, 235, 0.4)) !important;
      z-index: 9999 !important;
    }
    .isoflow-port.is-active-port,
    [data-port-handle-root].is-active-port {
      outline: 2px solid #dc2626 !important;
      outline-offset: 1px;
      border-radius: 3px;
      box-shadow: 0 0 0 3px rgba(220, 38, 38, 0.35),
        0 0 10px rgba(220, 38, 38, 0.55) !important;
      z-index: 10000 !important;
      filter: drop-shadow(0 0 4px rgba(220, 38, 38, 0.8));
    }

    #export-header {
      position: absolute; top: 0; left: 0; right: 0; z-index: 40;
      display: flex; align-items: center; justify-content: space-between;
      padding: 8px 14px; box-sizing: border-box;
      background: rgba(255,255,255,0.92);
      border-bottom: 1px solid rgba(0,0,0,0.08);
      font-size: 13px; color: #1f2937;
      pointer-events: none;
    }
    #export-header .title { font-weight: 600; }
    #export-header .meta { color: #6b7280; font-size: 12px; }
    #export-header button {
      pointer-events: auto;
      border: 1px solid rgba(0,0,0,0.15);
      background: #fff; border-radius: 6px;
      padding: 5px 10px; font-size: 12px; cursor: pointer;
    }
    #export-header button:hover { background: #f3f4f6; }

    #export-warning {
      position: absolute; top: 52px; left: 14px; right: 14px; z-index: 40;
      background: #fef2f2; border: 1px solid #fecaca; color: #991b1b;
      border-radius: 8px; padding: 10px 12px; font-size: 13px;
      display: none;
    }

    #export-info-panel {
      position: absolute; left: 14px; bottom: 14px; z-index: 40;
      max-width: 360px; max-height: 45%; overflow: auto;
      background: rgba(255,255,255,0.97);
      border: 1px solid rgba(0,0,0,0.1);
      border-radius: 10px; box-shadow: 0 6px 20px rgba(0,0,0,0.12);
      padding: 12px 14px; font-size: 13px; color: #1f2937;
      display: none;
      pointer-events: auto;
    }
    #export-info-panel h4 { margin: 0 0 6px; font-size: 14px; }
    #export-info-panel .row { display: flex; justify-content: space-between; gap: 10px; padding: 2px 0; }
    #export-info-panel .row .k { color: #6b7280; }
    #export-info-panel .row .v { font-weight: 600; text-align: right; }
    #export-info-panel .endpoint { padding: 4px 0; border-top: 1px solid rgba(0,0,0,0.06); }
    #export-info-panel .endpoint:first-of-type { border-top: none; }
  </style>
</head>
<body>
  <script type="application/json" id="isoflow-hover-graph">${graphJson}</script>
  <div id="export-header">
    <div>
      <div class="title">${safeTitle}</div>
      <div class="meta">Wygenerowano ${escapeHtml(
        generatedAt
      )} — tylko podgląd, bez edycji</div>
    </div>
    <button id="export-fit-btn" type="button">Dopasuj widok</button>
  </div>
  <div id="export-warning">Nie znaleziono elementów do wyświetlenia w tym eksporcie.</div>
  <div id="export-info-panel"></div>
  <div id="viewer-container">
    <div id="viewer-canvas">${bodyHtml}</div>
  </div>
  <script>
    document.addEventListener('DOMContentLoaded', () => {
      const graph = JSON.parse(
        document.getElementById('isoflow-hover-graph').textContent || '{}'
      );
      const cableEndpoints = graph.cableEndpoints || {};
      const cableGroup = graph.cableGroup || {};
      const nodeCables = graph.nodeCables || {};
      const patchPanelSet = new Set(graph.patchPanelIds || []);
      const portPeers = graph.portPeers || {};
      const nodePorts = graph.nodePorts || {};
      const nodeInfo = graph.nodeInfo || {};
      const cableInfo = graph.cableInfo || {};
      const stacks = graph.stacks || [];
      const stackByKey = new Map(stacks.map((s) => [s.key, s]));

      const nodes = Array.from(document.querySelectorAll('.isoflow-node'));
      const cables = Array.from(document.querySelectorAll('.isoflow-cable'));
      const badges = Array.from(document.querySelectorAll('.isoflow-stack-badge'));
      const ports = Array.from(document.querySelectorAll('.isoflow-port, [data-port-handle-root]'));

      const warningEl = document.getElementById('export-warning');
      if (nodes.length === 0) {
        warningEl.style.display = 'block';
      }

      const infoPanel = document.getElementById('export-info-panel');

      const nodeById = new Map();
      nodes.forEach((n) => {
        const id = n.getAttribute('data-node-id');
        if (id) nodeById.set(id, n);
      });
      const cableById = new Map();
      cables.forEach((c) => {
        const id = c.getAttribute('data-cable-id');
        if (id) cableById.set(id, c);
      });
      const portByKey = new Map();
      ports.forEach((p) => {
        const itemId = p.getAttribute('data-item-id');
        const portId = p.getAttribute('data-port-id');
        if (itemId && portId) portByKey.set(itemId + '::' + portId, p);
      });

      let pinnedStackKey = null;
      // Sticky click selection (survives mouseleave)
      let sticky = null; // { type: 'port'|'node'|'cable', id, portId? }

      const esc = (s) => String(s == null ? '' : s)
        .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

      const showInfoPanel = (html) => {
        infoPanel.innerHTML = html;
        infoPanel.style.display = 'block';
      };
      const hideInfoPanel = () => {
        infoPanel.style.display = 'none';
        infoPanel.innerHTML = '';
      };

      const renderNodeInfo = (nodeId) => {
        const info = nodeInfo[nodeId];
        if (!info) { hideInfoPanel(); return; }
        const portRows = Object.entries(info.ports || {}).map(([portId, p]) => {
          return '<div class="row"><span class="k">' + esc(p.portLabel) + '</span>' +
            '<span class="v">VLAN ' + esc(p.vlan) + (p.type === 'trunk' ? ' · trunk' : '') + '</span></div>';
        }).join('');
        const sviRows = (info.svis || []).filter((s) => s.ip).map((s) => {
          return '<div class="row"><span class="k">VLAN ' + esc(s.vlan) + '</span><span class="v">' + esc(s.ip) + '</span></div>';
        }).join('');
        showInfoPanel(
          '<h4>' + esc(info.name) + '</h4>' + portRows + sviRows
        );
      };

      const renderCableInfo = (cableId) => {
        const info = cableInfo[cableId];
        if (!info) { hideInfoPanel(); return; }
        const endpointRows = (info.endpoints || []).map((e) => {
          return '<div class="endpoint">' + esc(e.itemName) + ' — ' + esc(e.portLabel) +
            (e.ip ? '<div style="margin-top:2px;font-weight:600">IP ' + esc(e.ip) + '</div>' : '') +
            '</div>';
        }).join('');
        showInfoPanel(
          '<h4>' + esc(info.vlanLabel) + (info.linkMode === 'mismatch' ? ' (niezgodność trunk/access)' : '') + '</h4>' + endpointRows
        );
      };

      const renderPortInfo = (itemId, portId) => {
        const info = nodeInfo[itemId];
        const port = info?.ports?.[portId];
        if (!info) { hideInfoPanel(); return; }
        const peer = portPeers[itemId + '::' + portId];
        const peerName = peer ? (nodeInfo[peer.peerItemId]?.name || peer.peerItemId) : null;
        showInfoPanel(
          '<h4>' + esc(info.name) + ' — ' + esc(port ? port.portLabel : portId) + '</h4>' +
          (port ? '<div class="row"><span class="k">VLAN</span><span class="v">' + esc(port.vlan) + (port.type === 'trunk' ? ' · trunk' : '') + '</span></div>' : '') +
          (peerName ? '<div class="endpoint">Połączony z: ' + esc(peerName) + (peer.peerPortId ? ' — ' + esc(peer.peerPortId) : '') + '</div>' : '')
        );
      };

      const setCableTransform = (cableEl, offset) => {
        const base = cableEl.dataset.baseTransform || '';
        if (offset && (offset.x || offset.y)) {
          const fan = 'translate(' + offset.x + 'px, ' + offset.y + 'px)';
          cableEl.style.transform = base ? base + ' ' + fan : fan;
        } else {
          cableEl.style.transform = base || '';
        }
      };

      const applyFan = (key) => {
        cables.forEach((c) => setCableTransform(c, null));
        badges.forEach((b) => b.classList.remove('is-pinned'));
        if (!key) {
          document.body.classList.remove('is-stack-fanned');
          return;
        }
        const stack = stackByKey.get(key);
        if (!stack) return;
        Object.keys(stack.offsets || {}).forEach((id) => {
          const el = cableById.get(id);
          if (el) setCableTransform(el, stack.offsets[id]);
        });
        badges.forEach((b) => {
          if (b.getAttribute('data-stack-key') === key) {
            b.classList.add('is-pinned');
          }
        });
        document.body.classList.add('is-stack-fanned');
      };

      const clearVisualFocus = () => {
        document.body.classList.remove('is-focus');
        nodes.forEach((n) => n.classList.remove('is-active-node'));
        cables.forEach((c) => c.classList.remove('is-active-cable'));
        ports.forEach((p) => p.classList.remove('is-active-port'));
      };

      const paintCables = (ids) => {
        ids.forEach((id) => {
          const el = cableById.get(id);
          if (el) el.classList.add('is-active-cable');
        });
      };

      const paintNodes = (ids, preferNonPanel) => {
        let list = Array.from(ids);
        if (preferNonPanel) {
          const nonPanel = list.filter((id) => !patchPanelSet.has(id));
          if (nonPanel.length) list = nonPanel;
        }
        list.forEach((id) => {
          const el = nodeById.get(id);
          if (el) el.classList.add('is-active-node');
        });
      };

      const paintPort = (itemId, portId) => {
        if (!itemId || !portId) return;
        const el = portByKey.get(itemId + '::' + portId);
        if (el) el.classList.add('is-active-port');
      };

      const showFocus = (fn) => {
        clearVisualFocus();
        document.body.classList.add('is-focus');
        fn();
      };

      const focusCable = (cableId) => {
        const group = cableGroup[cableId] || [cableId];
        const nodeIds = new Set();
        group.forEach((id) => {
          (cableEndpoints[id] || []).forEach((n) => nodeIds.add(n));
        });
        showFocus(() => {
          paintCables(group);
          paintNodes(nodeIds, true);
        });
        renderCableInfo(cableId);
      };

      const focusNode = (nodeId) => {
        const direct = nodeCables[nodeId] || [];
        const groupIds = new Set();
        direct.forEach((cid) => {
          (cableGroup[cid] || [cid]).forEach((id) => groupIds.add(id));
        });
        const peerNodes = new Set([nodeId]);
        groupIds.forEach((cid) => {
          (cableEndpoints[cid] || []).forEach((id) => peerNodes.add(id));
        });

        const localPorts = nodePorts[nodeId] || [];
        showFocus(() => {
          paintCables(Array.from(groupIds));
          paintNodes(peerNodes, true);
          localPorts.forEach((portId) => paintPort(nodeId, portId));
          localPorts.forEach((portId) => {
            const peer = portPeers[nodeId + '::' + portId];
            if (peer && peer.peerPortId) {
              paintPort(peer.peerItemId, peer.peerPortId);
            }
          });
        });
        renderNodeInfo(nodeId);
      };

      const focusPort = (itemId, portId) => {
        const peer = portPeers[itemId + '::' + portId];
        if (!peer) {
          showFocus(() => paintPort(itemId, portId));
          renderPortInfo(itemId, portId);
          return;
        }
        showFocus(() => {
          paintCables(peer.cableIds || []);
          paintNodes(new Set([itemId, peer.peerItemId]), true);
          paintPort(itemId, portId);
          if (peer.peerPortId) paintPort(peer.peerItemId, peer.peerPortId);
        });
        renderPortInfo(itemId, portId);
      };

      const applySticky = () => {
        if (!sticky) {
          clearVisualFocus();
          hideInfoPanel();
          return;
        }
        if (sticky.type === 'cable') focusCable(sticky.id);
        else if (sticky.type === 'node') focusNode(sticky.id);
        else if (sticky.type === 'port') focusPort(sticky.id, sticky.portId);
      };

      cables.forEach((cable) => {
        const cableId = cable.getAttribute('data-cable-id');
        if (!cableId) return;
        cable.addEventListener('mouseenter', () => {
          if (sticky) return;
          focusCable(cableId);
        });
        cable.addEventListener('mouseleave', () => {
          if (sticky) return;
          clearVisualFocus();
          hideInfoPanel();
        });
        cable.addEventListener('click', (e) => {
          e.stopPropagation();
          if (pinnedStackKey) {
            pinnedStackKey = null;
            applyFan(null);
          }
          if (sticky && sticky.type === 'cable' && sticky.id === cableId) {
            sticky = null;
          } else {
            sticky = { type: 'cable', id: cableId };
          }
          applySticky();
        });
      });

      nodes.forEach((node) => {
        const nodeId = node.getAttribute('data-node-id');
        if (!nodeId) return;
        node.addEventListener('mouseenter', (e) => {
          if (sticky) return;
          if (e.target && e.target.closest && e.target.closest('.isoflow-port, [data-port-handle-root]')) {
            return;
          }
          focusNode(nodeId);
        });
        node.addEventListener('mouseleave', () => {
          if (sticky) return;
          clearVisualFocus();
          hideInfoPanel();
        });
        node.addEventListener('click', (e) => {
          if (e.target && e.target.closest && e.target.closest('.isoflow-port, [data-port-handle-root]')) {
            return;
          }
          e.stopPropagation();
          if (sticky && sticky.type === 'node' && sticky.id === nodeId) {
            sticky = null;
          } else {
            sticky = { type: 'node', id: nodeId };
          }
          applySticky();
        });
      });

      ports.forEach((portEl) => {
        const itemId = portEl.getAttribute('data-item-id');
        const portId = portEl.getAttribute('data-port-id');
        if (!itemId || !portId) return;

        portEl.addEventListener('mouseenter', (e) => {
          e.stopPropagation();
          if (sticky) return;
          focusPort(itemId, portId);
        });
        portEl.addEventListener('mouseleave', (e) => {
          e.stopPropagation();
          if (sticky) return;
          clearVisualFocus();
          hideInfoPanel();
        });
        portEl.addEventListener('click', (e) => {
          e.preventDefault();
          e.stopPropagation();
          const same =
            sticky &&
            sticky.type === 'port' &&
            sticky.id === itemId &&
            sticky.portId === portId;
          sticky = same ? null : { type: 'port', id: itemId, portId: portId };
          applySticky();
        });
      });

      badges.forEach((badge) => {
        const key = badge.getAttribute('data-stack-key');
        if (!key) return;
        badge.addEventListener('mousedown', (e) => e.stopPropagation());
        badge.addEventListener('click', (e) => {
          e.preventDefault();
          e.stopPropagation();
          pinnedStackKey = pinnedStackKey === key ? null : key;
          applyFan(pinnedStackKey);
          if (pinnedStackKey) {
            const stack = stackByKey.get(pinnedStackKey);
            sticky = null;
            if (stack) {
              showFocus(() => {
                paintCables(stack.connectorIds);
                const nodeIds = new Set();
                stack.connectorIds.forEach((cid) => {
                  (cableEndpoints[cid] || []).forEach((n) => nodeIds.add(n));
                });
                paintNodes(nodeIds, true);
              });
            }
          } else {
            clearVisualFocus();
            hideInfoPanel();
          }
        });
      });

      const canvas = document.getElementById('viewer-canvas');
      const container = document.getElementById('viewer-container');
      container.addEventListener('click', (e) => {
        if (
          e.target.closest &&
          (e.target.closest('.isoflow-node') ||
            e.target.closest('.isoflow-cable') ||
            e.target.closest('.isoflow-port') ||
            e.target.closest('[data-port-handle-root]') ||
            e.target.closest('.isoflow-stack-badge'))
        ) {
          return;
        }
        sticky = null;
        clearVisualFocus();
        hideInfoPanel();
      });

      let isDragging = false;
      let startX = 0, startY = 0, translateX = 0, translateY = 0, scale = 1;
      const updateTransform = () => {
        canvas.style.transform =
          'translate(' + translateX + 'px, ' + translateY + 'px) scale(' + scale + ')';
      };

      // Isoflow's own "node"/"cable" wrapper elements are zero-size absolute
      // positioning anchors (their actual visible content lives a few
      // levels deep, offset via inline left/top). Measuring the wrapper
      // itself always yields a 0x0 rect, which breaks fit-to-content. Union
      // the rects of every descendant that actually has size instead.
      const unionRect = (el) => {
        let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
        let found = false;
        const consider = (r) => {
          if (r.width === 0 && r.height === 0) return;
          found = true;
          minX = Math.min(minX, r.left);
          minY = Math.min(minY, r.top);
          maxX = Math.max(maxX, r.right);
          maxY = Math.max(maxY, r.bottom);
        };
        consider(el.getBoundingClientRect());
        el.querySelectorAll('*').forEach((child) => consider(child.getBoundingClientRect()));
        return found ? { left: minX, top: minY, right: maxX, bottom: maxY } : null;
      };

      const fitToContent = () => {
        scale = 1; translateX = 0; translateY = 0;
        updateTransform();

        const targets = nodes.length ? nodes : cables;
        if (!targets.length) return;

        let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
        targets.forEach((el) => {
          const r = unionRect(el);
          if (!r) return;
          minX = Math.min(minX, r.left);
          minY = Math.min(minY, r.top);
          maxX = Math.max(maxX, r.right);
          maxY = Math.max(maxY, r.bottom);
        });
        if (minX === Infinity) return;

        const contentW = Math.max(1, maxX - minX);
        const contentH = Math.max(1, maxY - minY);
        const containerRect = container.getBoundingClientRect();
        const pad = 72;
        const availW = Math.max(50, containerRect.width - pad * 2);
        const availH = Math.max(50, containerRect.height - pad * 2);

        scale = Math.max(0.05, Math.min(availW / contentW, availH / contentH, 2.5));

        const contentCenterX = (minX + maxX) / 2 - containerRect.left;
        const contentCenterY = (minY + maxY) / 2 - containerRect.top;
        const containerCenterX = containerRect.width / 2;
        const containerCenterY = containerRect.height / 2;

        // #viewer-canvas uses transform-origin: center center (so wheel-zoom
        // stays visually centered), which means scale() pivots around the
        // canvas's own center — NOT (0,0). Since the canvas is inset:0 over
        // the container, that pivot point equals the container's center, so
        // translateX/Y must only account for the *difference* between the
        // container center and the content center, scaled — not the naive
        // "translate = target - source * scale" formula that assumes a
        // top-left transform-origin.
        translateX = scale * (containerCenterX - contentCenterX);
        translateY = scale * (containerCenterY - contentCenterY);
        updateTransform();
      };

      document.getElementById('export-fit-btn').addEventListener('click', fitToContent);

      window.addEventListener('mousedown', (e) => {
        if (e.button !== 0) return;
        if (e.target.closest && (
          e.target.closest('.isoflow-stack-badge') ||
          e.target.closest('.isoflow-port') ||
          e.target.closest('[data-port-handle-root]') ||
          e.target.closest('#export-header') ||
          e.target.closest('#export-info-panel')
        )) return;
        isDragging = true;
        startX = e.clientX - translateX;
        startY = e.clientY - translateY;
      });
      window.addEventListener('mousemove', (e) => {
        if (!isDragging) return;
        translateX = e.clientX - startX;
        translateY = e.clientY - startY;
        updateTransform();
      });
      window.addEventListener('mouseup', () => { isDragging = false; });
      window.addEventListener('wheel', (e) => {
        if (e.target && e.target.closest && e.target.closest('#export-info-panel')) return;
        e.preventDefault();
        scale = Math.min(Math.max(0.05, scale - e.deltaY * 0.0015), 5);
        updateTransform();
      }, { passive: false });

      fitToContent();
    });
  </script>
</body>
</html>`;
};

/**
 * Self-contained, offline, read-only interactive HTML export of the Plan
 * (2D) view: switches, devices, cables and patch panels. Click/hover a
 * node, port or cable to see how everything is wired.
 */
export const exportAsInteractiveHtml = async ({
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

    const clone = stage.canvasEl.cloneNode(true) as HTMLElement;
    clone.querySelectorAll('.isoflow-interaction-layer').forEach((el) => {
      return el.remove();
    });
    addCableHitStrokes(clone);
    prepareInteractiveClone(clone);

    const usedClasses = collectUsedClassNames(clone);
    const styles = collectFilteredStyles(usedClasses);

    const graph = buildHtmlExportHoverGraph({
      connectors: planView.connectors ?? [],
      modelItems: model.items
    });

    const bg = getComputedStyle(stage.canvasEl).backgroundColor || '#f6faff';

    const html = buildHtmlDocument({
      title: model.title || 'Projekt',
      styles,
      bg,
      bodyHtml: clone.outerHTML,
      graph
    });

    downloadFile(
      new Blob([html], { type: 'text/html;charset=utf-8' }),
      filename || generateProjectFilename(model.title || 'Untitled', 'html')
    );
  } finally {
    if (stage) {
      unmountOffscreenStage(stage);
    }
  }
};
