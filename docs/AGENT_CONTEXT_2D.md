# Kontekst agenta — Isoflow 2D (handoff)

Dokument handoff dla innego modelu/agenta Cursor. Cel: wejść w kontekst **planu 2D** bez odtwarzania całej historii czatu.

**Data kontekstu:** 2026-07-19  
**Repo lokalne (Windows):** `C:\Users\Winacz\Projects\isoflow`  
**Remote:** `https://github.com/winacz/isoflow.git` (branch `main`)  
**Język z użytkownikiem:** polski, zwięźle.  
**Uwaga Cursor:** sesje/czaty **nie synchronizują się** Win↔Mac — ten plik + GitHub to źródło prawdy między maszynami. Kod: `git clone` / `git pull`, potem `npm install`.

**Ostatnie commity istotne dla 2D:**
- `8db4670` — Smooth 2D node drag + floating descriptions
- `6cff595` — Improve 2D cable routing and multi-node layout tools
- `c6e147a` — rack cabinets, plan areas, smoother 2D zoom, peer-port focus

---

## 1. Produkt

Reactowy edytor diagramów sieciowych (Isoflow) z dwoma trybami projekcji:

| Tryb | `projectionMode` | Zawartość |
|------|------------------|-----------|
| Izometryczny | `ISOMETRIC` | klasyczne ikony iso / isopack + floating description |
| Plan 2D | `TWO_D` | kształty urządzeń, szafy RACK, porty RJ45/SFP, kable na siatce |

Bootstrap: [`src/examples/createEditorInitialData.ts`](../src/examples/createEditorInitialData.ts) — dwa widoki (`Isometric`, `Plan`). Przełączenie widoku ustawia też `projectionMode`.

**Zasada:** feature’y 2D **nie mają psuć izometrii**. Mutacje anti-overlap / shape2d w `syncConnector` są gated przez `viewUsesShape2d` (`isShape2dIcon` na itemach widoku).

---

## 2. Ustalenia UX / reguły domenowe (2D)

### 2.1 Node’y i placement
- Brak nakładania footprintów (`isShape2dPlacementFree`, `resolveShape2dDragOrigin`).
- Drag: pozycja **absolutna** względem startu (`itemOrigins` + delta od `mousedown`).
- Jedno połączenie na port (`isShape2dPortInUse`).
- Snap kursora do portu (`SHAPE_2D_PORT_SNAP_DISTANCE`).
- Szafy (`SHAPE_2D_CABINET_ID`) + montaż RACK (`parentId`, `rackUnit`, `resolveCabinetSnap`).

### 2.2 Drag node’ów — płynność (ważne, 2026-07-19)

**Problem:** zapis do modelu + `syncConnector` na każdy piksel → klatkowanie. Snap do siatki w trakcie drag też skakał.

**Rozwiązanie:**
1. Podczas drag 2D (same `ITEM`): pozycje idą do lekkiego [`src/stores/nodeDragStore.ts`](../src/stores/nodeDragStore.ts) — **bez** `updateViewItem`.
2. Współrzędne **ułamkowe** (`screenToTile2dContinuous`) — bez `Math.floor` w trakcie ruchu.
3. `Node.tsx` czyta `liveTile` z store; `Connector2d` robi tani preview (`getConnectorPathPreview` + `tileOverrides` + `stripToEndpointAnchors`).
4. **Mouseup:** snap `snapTile2dToGrid` (`Math.round`) + resolve kolizji + commit do modelu + mount szafy.
5. Jeśli faktycznie ruszył node i **nie** ma `simplePaths` → automatycznie **`runTestLayoutForItems`** (jak przycisk „Test”).
6. Przy `simplePaths` → zwykły rebuild A* bez fan/tidy.

Kluczowe: [`src/interaction/modes/DragItems.ts`](../src/interaction/modes/DragItems.ts) (`freePlacement`, `isNodeFreeDrag`).

W trakcie drag `updateViewItem` (gdyby coś jeszcze pisało tile) i tak stripuje mid WP (`stripToEndpointAnchors`) + `fastPath` — ale główna ścieżka free-drag **omija** to przez store.

### 2.3 Kable / waypoints
- Tworzenie WP: dblclick na kablu (także nad body).
- Usuwanie WP: dblclick na WP.
- PPM → „Resetuj waypointy” (same endpointy portów).
- Uchwyt segmentu (OpenWith); Shift → ortogonalne L/U (`applyOrthogonalBendAnchors`).
- Przy drag segmentu port↔port WP na **exit tiles**, potem `untangleAnchorHairpins`.
- Stack badge gdy ≥2 kable dzielą **krawędź** (`connectorStacks.ts`); fan-out na hover.
- Hop (półokrąg) przy przecięciu X (`connectorJumps.ts`) — wyłączony w trakcie `DRAG_ITEMS` (perf).

### 2.4 Tryb „Wyłącz obliczanie” (`simplePaths`)
- UI: MultiNodeControls — „Wyłącz / Włącz obliczanie”.
- Flaga: `uiState.simplePaths` + `setSimplePathsEnabled` w [`pathOptions.ts`](../src/utils/pathOptions.ts).
- Sync: prosta linia port↔port (`getConnectorPathPreview`), bez A*/fan.
- Przyciski „Mój algorytm” / „Test” są **disabled** przy `simplePaths`.
- Auto-Test po drag też pomijany.

### 2.5 Narzędzia layoutu (multi-select)
Panel [`MultiNodeControls.tsx`](../src/components/ItemControls/MultiNodeControls/MultiNodeControls.tsx):

| Przycisk | API (`useScene`) | Zachowanie |
|----------|------------------|------------|
| Porządkuj | `tidyItems` | Swap zaznaczonych node’ów między **istniejącymi** slotami (bez nowego stackowania); uncross wg portów + 2-opt |
| Mój algorytm | `routeDiagonalFanForItems` | Diagonal fan z huba (`diagonalFanShape2dRoutes` w `shape2dLayout.ts`) |
| **Test** | `runTestLayoutForItems` | Porządkuj (jeśli ≥2) + Mój algorytm w jednej transakcji historii |
| Porządkuj w miejscu | `tidyItemsInPlace` | Warianty in-place |
| Wyłącz obliczanie | `setSimplePathsMode` | patrz wyżej |

Implementacja: [`src/hooks/useScene.ts`](../src/hooks/useScene.ts), algorytmy: [`src/utils/shape2dLayout.ts`](../src/utils/shape2dLayout.ts).

**Po przeniesieniu node’ów** (mouseup drag 2D) → automatycznie to samo co **Test** (o ile ruch + nie `simplePaths`).

### 2.6 Opisy (description) w 2D
- W izometrii: floating `ExpandableLabel` (nazwa + markdown).
- W 2D plan shapes: etykieta **tylko gdy jest opis** (nazwa jest już na chassis).
- Ukośna linia callout (`Label` `stemDirection: 'diagonal'`) z góry shape’a.
- Panel `NodeControls2d`: edycja Opis (MarkdownEditor) + suwaki:
  - **Wielkość opisu** `labelScale`: **3×–10×** (domyślnie 3), krok 0.5
  - **Długość linii** `labelHeight`: 60–320 (domyślnie 140)
- Schema: `viewItem.labelScale` opcjonalne ([`schemas/views.ts`](../src/schemas/views.ts)).
- Render: [`Node.tsx`](../src/components/SceneLayers/Nodes/Node/Node.tsx), [`Label.tsx`](../src/components/Label/Label.tsx).

### 2.7 Wygląd / misc kabli 2D
- Cieńsze linie (`Connector2d`), VLAN colors, trunk rainbow, mismatch.
- Hover relation panel, waypoint guides.
- Undo: Ctrl/Cmd+Z; historia max 5; transakcje przy drag ([`historyStore.ts`](../src/stores/historyStore.ts)).

---

## 3. Kluczowe pliki

| Obszar | Plik |
|--------|------|
| Drag 2D + freePlacement + auto-Test | `src/interaction/modes/DragItems.ts` |
| Transient drag tiles | `src/stores/nodeDragStore.ts` |
| Continuous tile / snap / placement | `src/utils/renderer.ts` (`screenToTile2dContinuous`, `snapTile2dToGrid`, `getAnchorTile` + overrides) |
| Update item → strip WP + fastPath | `src/stores/reducers/viewItem.ts` |
| Sync kabli / simplePaths / fastPath | `src/stores/reducers/connector.ts` |
| Layout / fan / tidy | `src/utils/shape2dLayout.ts`, `src/hooks/useScene.ts` |
| Scene UI multi | `src/components/ItemControls/MultiNodeControls/MultiNodeControls.tsx` |
| Node + description 2D | `src/components/SceneLayers/Nodes/Node/Node.tsx` |
| Panel 2D (opis, porty, szafa) | `src/components/ItemControls/NodeControls/NodeControls2d.tsx` |
| Label callout | `src/components/Label/Label.tsx`, `ExpandableLabel.tsx` |
| Connector render + live drag preview | `src/components/SceneLayers/Connectors/Connector2d.tsx` |
| Config / TILE_SIZE_2D / shapes | `src/config.ts` |
| Simple paths flag | `src/utils/pathOptions.ts`, `uiStateStore` |
| Cabinets | `src/utils/cabinet.ts`, `CabinetShape2d.tsx` |
| Segmenty / WP / jumps / stacks | `connectorSegments.ts`, `connectorBendWaypoints.ts`, `connectorJumps.ts`, `connectorStacks.ts` |

---

## 4. Przepływy danych

### 4.1 Anchory → path (normalnie)
```
Connector.anchors (porty + opcjonalne ref.tile WP)
  → getConnectorPath / getConnectorPathPreview
  → scene.connectors[id].path { tiles, rectangle }
  → Connector2d
```

### 4.2 Drag node’a 2D (aktualny)
```
mousemove
  → screenToTile2dContinuous
  → nextTiles (freePlacement, bez kolizji)
  → nodeDragStore.setLive
  → Node + Connector2d czytają store (bez setState modelu)

mouseup
  → snap + resolve + updateViewItem (+ mounts)
  → clear nodeDragStore
  → runTestLayoutForItems(draggedIds)  // lub rebuild A* jeśli simplePaths / brak ruchu
  → endHistoryTransaction
```

### 4.3 syncConnector (skrót)
1. Walidacja; przy `simplePaths` → preview port↔port i return.
2. Opcjonalny overlap resolve (zwykle `off`).
3. `fastPath` → preview; inaczej pełny `getConnectorPath` (+ elbow guides w 2D).

---

## 5. Znane pułapki

1. **Izometria:** nie odpalać mutacji shape2d/anti-overlap na widokach bez shape2d.
2. **Perf drag:** nigdy nie wołać `updateViewItem` co piksel dla free-drag — tylko `nodeDragStore`.
3. **Nested history:** drag trzyma transakcję; `runTestLayoutForItems` robi begin/end wewnętrznie (depth++) — OK.
4. **A\* z diagonalami** domyślnie; Shift / orthogonalDetour wymusza 90°.
5. **Scene vs model:** path w `scene.connectors`; anchory w modelu.
6. **labelScale < 3** ze starych danych: clamp do 3–10 w UI i renderze.
7. Czaty Cursor lokalne — między komputerami tylko Git + ten dokument.

---

## 6. Preferencje użytkownika

- Commit / push **tylko na prośbę** (ten plik + push: wyjątek, bo poproszone).
- Małe, celowe diffy; bez zbędnych markdownów.
- Odpowiedzi: krótko, po polsku.
- Nie ruszać izometrii „przy okazji” feature’ów 2D.
- Layout tools: Porządkuj = swap slotów (nie re-seat w kupę); Test = tidy + fan.

---

## 7. Co jest „done” (stan na 2026-07-19)

- Plan 2D: urządzenia, porty, VLAN, trunk, szafy RACK, obszary.
- Stack badges, hops, waypoint guides, relation hover.
- Layout: Porządkuj, Mój algorytm, Test, simple paths.
- **Płynny drag** node’ów (transient store + continuous tiles + snap on release).
- **Auto-Test** po przeniesieniu node’ów.
- **Opisy 2D** z ukośną linią, skala 3×–10×, długość linii.
- Przy drag: mid WP strip + preview (bez hold nearest WP).

---

## 8. Sensowne następne kroki (jeśli wrócić)

- Ręczny smoke: drag wielu node’ów z kablami → płynność + Test na mouseup.
- Opis: czy ukośna linia ma iść z rogu chassis zamiast ze środka góry.
- Fan (`diagonalFanShape2dRoutes`): jeśli user zgłosi złe korytarze lane — czytać ostatnie uwagi w historii wokół leaf-side corridors.
- Sync czatów Cursor Win↔Mac: brak natywnego; ewentualnie narzędzia community (cursaves) — nie w scope produktu.

---

## 9. Szybki start na innej maszynie (np. Mac)

```bash
git clone https://github.com/winacz/isoflow.git
cd isoflow
npm install
npm start
```

Przeczytaj ten plik przed kontynuacją feature’ów 2D. Otwórz widok **Plan** (`TWO_D`).
