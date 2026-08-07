import { createEditorInitialData } from 'src/examples/createEditorInitialData';
import { syncDeviceTemplateCache } from '../deviceTemplateRegistry';
import { snapModelToGrid } from '../snapModelToGrid';
import { buildLayoutGraph } from '../autoLayout/graph';
import { placeNodes } from '../autoLayout/place';
import { routeCables } from '../autoLayout/router';
import { getShape2dPorts, getShape2dSize } from 'src/config';

test('phone path', () => {
  const d: any = createEditorInitialData();
  syncDeviceTemplateCache(d.deviceTemplates);
  const s = snapModelToGrid(d, { gridStyle: 'rack' as any, projectionMode: d.projectionMode });
  const plan = s.views[0];
  let items = plan.items as any[];
  const nameOf = (id: string) => d.items.find((m: any) => m.id === id)?.name ?? id;

  let graph = buildLayoutGraph({ scopeItems: items, allItems: items, modelItems: d.items, connectors: (plan.connectors ?? []) as any });
  const { targets } = placeNodes({ graph, gridStep: { x: 9, y: 9 } });
  items = items.map((i) => targets[i.id] ? { ...i, tile: targets[i.id] } : i);
  graph = buildLayoutGraph({ scopeItems: items, allItems: items, modelItems: d.items, connectors: (plan.connectors ?? []) as any });

  const r = routeCables({ graph, items: items as any, style: 'ORTHOGONAL' });

  graph.edges.forEach((e) => {
    const leaf = nameOf(e.aId).startsWith('PHONE') ? e.aId : nameOf(e.bId).startsWith('PHONE') ? e.bId : null;
    if (!leaf) return;
    const it = items.find((i) => i.id === leaf);
    const m = d.items.find((x: any) => x.id === leaf);
    const port = getShape2dPorts(m?.icon).find((p) => p.id === (e.aId === leaf ? e.aPort : e.bPort));
    console.log('LEAF', nameOf(leaf), 'tile', JSON.stringify(it.tile), 'size', JSON.stringify(getShape2dSize(m?.icon)),
      'portLocal', JSON.stringify(port?.tile), 'side', port?.side,
      'portWorld', JSON.stringify({x: it.tile.x + (port?.tile.x ?? 0), y: it.tile.y + (port?.tile.y ?? 0)}));
    console.log('   WAYPOINTS', JSON.stringify(r.routes[e.connectorId]));
  });
});
