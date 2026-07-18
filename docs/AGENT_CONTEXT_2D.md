# Kontekst rozmowy — Isoflow 2D (handoff dla innego modelu)

Dokument z sesji rozwojowej wokół edytora topologii 2D w repozytorium **isoflow**. Ma pozwolić innemu modelowi/agentowi szybko wejść w kontekst bez odtwarzania całej historii.

**Data kontekstu:** 2026-07-18  
**Repo:** `C:\Users\Winacz\Projects\isoflow`  
**Język komunikacji z użytkownikiem:** polski, zwięźle.

---

## 1. Produkt

Reactowy edytor diagramów sieciowych (Isoflow) z dwoma trybami projekcji:

| Tryb | `projectionMode` | Zawartość |
|------|------------------|-----------|
| Izometryczny | `ISOMETRIC` | klasyczne ikony iso / isopack |
| Plan 2D | `TWO_D` | kształty urządzeń (SWITCH, PC), porty RJ45, kable na siatce |

Bootstrap danych: [`src/examples/createEditorInitialData.ts`](src/examples/createEditorInitialData.ts) — scala demo izometryczne + topologię 2D jako **dwa widoki** (`Isometric`, `Plan`). Przełączanie widoku zmienia też `projectionMode`.

**Ważne:** izometria nie miała być ruszana przy feature’ach 2D. Anti-overlap w `syncConnector` jest gated przez `viewUsesShape2d` (`isShape2dIcon` na itemach widoku).

---

## 2. Ustalenia UX / reguły domenowe (2D)

### Nodów
- Brak nakładania footprintów urządzeń (`isShape2dPlacementFree`).
- Drag noda: pozycjonowanie **absolutne** względem startu przeciągania (`itemOrigins` + delta od `mousedown`) — nod „przeskakuje” na drugą stronę przeszkody zamiast zostawać w tyle za kursorem.
- Jedno połączenie na port (`isShape2dPortInUse`).
- Snap kursora do portu (`SHAPE_2D_PORT_SNAP_DISTANCE`).

### Kable / waypoints
- Tworzenie WP: dblclick na kablu (także nad body urządzenia).
- Usuwanie WP: dblclick na WP.
- **PPM na kablu** → „Resetuj waypointy” (zostawia tylko końce portów, path A* ze skosami).
- Uchwyt segmentu (OpenWith) do przesuwania odcinka; Shift → ortogonalne L/U (`applyOrthogonalBendAnchors`), nie schody A*.
- Max ~2 helper WP między końcami → czyste L lub U.
- Przy drag segmentu port↔port WP materializowane na **exit tiles** (nie na komórce portu), potem `untangleAnchorHairpins`.

### Styl kabla przez obce nody
- Tile na footprintcie **obcego** noda → dash drobniejszy.
- Endpointy własnego połączenia → **solid**.
- Przejście solid↔dash dokładnie na zewnętrznej krawędzi AABB (`splitConnectorPathByNodeBodies` + przecięcie z rect).

### Przeskok (hop) przy przecięciu
- Konflikt wizualny X: jedna linia robi półokrąg, druga **bez przerwy** (ciągła pod spodem).
- Wykrywanie: przecięcia segmentów (ortogonalne i skośne), nie tylko wspólny tile.
- Plik: [`src/utils/connectorJumps.ts`](src/utils/connectorJumps.ts).

### Anti-overlap ścieżek
- **Konflikt** = wspólna **krawędź** (para sąsiednich tile’i), nie sam wspólny wierzchołek.
- Przecięcie X (wspólny tile bez wspólnej krawędzi) = OK + hop.
- Przy drag **noda**: `pruneAnchorsAfterNodeMove` → `sync off` (zachowaj skos/WP). **Bez** bump/`orthogonalDetour` przy node move.
- Gdy kable **dzielą krawędź**: czerwony **stack badge** (`ConnectorStackBadges` nad warstwą interakcji). Fan: kursor w zasięgu tile badge’a albo hover DOM; klik paska → drag segmentu.
- Tworzenie / rysowanie kabla: `overlapResolve: 'off'`.
- Przy uchwycie segmentu/WP: **bez** snap anti-overlap (stack badge zamiast); Shift → czyste L/U.
- Przy **usunięciu WP**: tylko `off` — łączy sąsiadów (A*), bez przebudowy całej trasy na L/U.

### Wygląd kabli 2D
- Cieńsze i mniej przezroczyste niż wcześniej (`Connector2d`: width ~`1.65`, opacity ~`0.72` / emphasize `0.92`).

### Undo
- Ctrl/Cmd+Z + ikona Undo; historia max 5; transakcje przy drag/connector/place ([`src/stores/historyStore.ts`](src/stores/historyStore.ts)).

---

## 3. Kluczowe pliki

| Obszar | Plik |
|--------|------|
| Path build | `src/utils/renderer.ts` (`getConnectorPath`, split by node bodies, placement) |
| Pathfinding | `src/utils/pathfinder.ts`, `src/utils/pathOptions.ts` |
| Segmenty / WP | `src/utils/connectorSegments.ts` |
| Node-move WP prune | `src/utils/connectorNodeMove.ts` (`pruneAnchorsAfterNodeMove`) |
| Anti-overlap | `src/utils/connectorOverlap.ts` |
| Hop przy X | `src/utils/connectorJumps.ts` |
| Stack badge (N kabli) | `src/utils/connectorStacks.ts` |
| Sync kabli | `src/stores/reducers/connector.ts` (`overlapResolve` domyślnie `off`; `orthogonalDetour` przy delete WP) |
| Update item → sync | `src/stores/reducers/viewItem.ts` |
| Drag | `src/interaction/modes/DragItems.ts` |
| Cursor / dblclick WP | `src/interaction/modes/Cursor.ts` |
| Rysowanie 2D | `src/components/SceneLayers/Connectors/Connector2d.tsx`, `Connectors.tsx` |
| Scene API | `src/hooks/useScene.ts` (`updateConnector(id, updates, options?)`) |
| Config 2D | `src/config.ts` (`TILE_SIZE_2D`, `getShape2dSize`, `isShape2dIcon`) |

---

## 4. Przepływ danych: anchory → path

```
Connector.anchors (porty + opcjonalne ref.tile WP)
    → getConnectorPath (segmenty między kolejnymi anchorami)
    → findPath / buildOrthogonalTiles
    → scene.connectors[id].path { tiles, rectangle }
    → Connector2d: global tiles, style runs, jumps
```

`syncConnector` po walidacji:
1. (tylko widok 2D) resolve overlap wg flagi,
2. zapis path do `scene.connectors`.

---

## 5. Znane pułapki

1. **Izometria:** nie uruchamiać mutacji anti-overlap na widokach bez shape2d; wcześniej `syncConnector` psuł anchory iso.
2. **Delete WP + default resolve:** powodowało „zamęt” (rys. zygzaków przez PC) — zawsze `orthogonalDetour` + `removedTile`.
3. **A* domyślnie z diagonalami** (`DiagonalMovement.Always`) — przy detour po delete wymuszać `orthogonal: true` / `withOrthogonalPath`.
4. **Kolejność anchorów** ma znaczenie dla `getConnectorPath`.
5. Scene connectors vs model connectors: path jest w `scene`; model trzyma anchory.

---

## 6. Preferencje użytkownika (Cursor rules istotne tu)

- Nie commitować / nie pushować bez prośby.
- Małe, celowe diffy; nie pisać markdownów „przy okazji” (ten plik jest wyjątkiem — poproszony).
- Frontend: unikać generycznych AI-layoutów (tu głównie edytor, nie landing).
- Odpowiedzi: krótko, po polsku.

---

## 7. Co było ostatnio zrobione

- Anti-overlap krawędzi + snap uchwytu + resolve przy sync (2D only).
- Fix: izometria wyłączona z resolve.
- Fix: usuwanie WP → `orthogonalDetour` zamiast bumpów.
- Node drag: prune + `sync off` (hybryda bump cofnięta — psuła create).
- Fix: nowe połączenia / rubber-band z `overlapResolve: 'off'`.
- Fix Shift: bez snap anti-overlap przy drag kabla (stack badge zamiast); sync domyślnie `off`.
- Stack badge: gdy ≥2 kable dzielą krawędź → liczba na środku runu (`connectorStacks.ts`).
- Handoff: ten plik.

---

## 8. Sensowne następne kroki (jeśli użytkownik wróci)

- Ręczny test: 3 skośne PC↔Switch → Switch o 1 kafelek → skos + rozjazd (nie L/U flip).
- Jeśli bump dokłada za dużo WP: ograniczyć `MAX_RESOLVE_ITERS` / offset tylko dla node-move.
- Stack-badge „N kabli” — odłożone (alternatywa do pełnego rozjazdu).
- Migracja już nachodzących starych kabli (świadomie poza zakresem wcześniejszego planu).
