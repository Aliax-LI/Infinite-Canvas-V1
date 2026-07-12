# Canvas Module Migration Plan

> Updated: 2026-07-12  
> Baseline: `history/static/` (canvas-list, canvas, smart-canvas)  
> Target: `frontend/src/features/canvas-list/`, `canvas/`, `smart-canvas/`

## Product boundary

| Canvas | Route | Generation UX | Primary metaphor |
|--------|-------|---------------|------------------|
| **Classic / legacy** | `/legacy-canvas/:id` | **In-graph nodes only** (generator / comfy / LTX Director / …). No right-sidebar quick generate. | Node workflow, connections, cascade |
| **Smart** | `/canvas/:id` | Composer + card-style nodes; fewer manual wires | Composer / card orchestration |

History (`canvas.js`) has **no** sidebar Generate panel — generation is on generator nodes. React Option B (2026-07-12): unmounted `GeneratePanel` + `LtxTimelinePanel` from `LegacyCanvasPage`; right column hidden when empty. Component files retained for potential reuse; LTX remains a classic **node** capability (not “go to smart canvas”).

---

## Executive summary

The React app already had **scaffold** routes and API clients for canvases, plus substantial **smart-canvas** and **legacy-canvas** core logic. Phase 1 closes the gap on the **project workspace / canvas list** (`canvas-list.html`) — the entry point before opening any canvas editor.

---

## Phase 0 — Discovery (completed)

### Current React stack

| Area | Path | Status |
|------|------|--------|
| Canvas list page | `frontend/src/features/canvas-list/` | **Phase 1 upgraded** (was minimal cards, no pan/zoom) |
| Smart canvas editor | `frontend/src/features/smart-canvas/` | Substantial — nodes, composer, assets, WS, generation |
| Legacy canvas editor | `frontend/src/features/canvas/` + `LegacyCanvasPage.tsx` | Partial — timeline, layout, viewport utils; UI incomplete |
| Routes | `frontend/src/app/router.tsx` | `/canvases`, `/canvas/:id`, `/legacy-canvas/:id` |
| Backend API | `backend/routers/canvases.py`, `projects.py` | Complete CRUD + trash + meta + assets |
| Storage | `backend/repositories/{json,sqlite}/canvas_repository.py` | Dual backend via factory |
| Tests | `frontend/tests/canvas*`, `backend/tests/integration/test_canvases_api*.py` | Core + list tests exist |

### History reference (`history/static/`)

| File | Role |
|------|------|
| `canvas-list.html` + `js/canvas-list.js` | **Project workspace**: sidebar projects, pannable board, canvas cards, trash |
| `smart-canvas.html` + `js/smart-canvas.js` | **Smart canvas**: nodes, connections, composer, asset panel, generation, cascade, workflows (~16k LOC) |
| `canvas.html` + `js/canvas.js` | **Classic canvas**: image nodes, layers, tools, export |
| `css/canvas-list.css`, `smart-canvas.css`, `canvas.css` | Studio visual system |

### History smart-canvas feature inventory (for later phases)

- Viewport pan/zoom, minimap, selection box, multi-select
- Node kinds: upload, prompt, LLM, Comfy/MS/API/RH/video/LTX/loop/group
- Connection graph + cascade run
- Composer + mention picker + prompt templates/libraries
- Asset panel (library + local folders)
- Image edit modal (crop/mask/brush/grid/outpaint)
- WebSocket multi-client sync
- Workflow import/export (ZIP)
- Generation logs, shortcuts modal
- i18n (zh/en)

### History classic canvas feature inventory

- Layer stack, tool palette
- Image placement / transform
- Export to file
- Generation hooks to output folder

### Product / architecture docs

- `docs/TOOLS_MIGRATION.md` — toolbox pages migration pattern (reference for fork-first)
- `docs/LOCAL_STORAGE_ARCHITECTURE.md` — json/sqlite + object store (canvas data uses same repos)
- No dedicated canvas section in product definition yet (add when editor phases ship)

---

## Gap analysis: history canvas-list vs React (before Phase 1)

| Feature | History | React (before) | Phase 1 |
|---------|---------|----------------|---------|
| Project sidebar + counts | ✅ | List only | ✅ CRUD + rename + delete |
| Board pan/zoom | ✅ | ❌ static | ✅ |
| Card drag → persist `board_x/y` | ✅ | ❌ | ✅ |
| Reset view | ✅ | ❌ | ✅ |
| Double-click create at point | ✅ | ❌ | ✅ |
| Create popover (classic/smart) | ✅ | smart only, center | ✅ |
| Card kind badge + node count | ✅ | partial | ✅ |
| Context menu (rename/export/cut/delete) | ✅ | inline delete link | ✅ |
| Cut/paste across projects | ✅ | ❌ | ✅ |
| Trash restore + purge | ✅ | restore only | ✅ |
| Auto-layout null positions | ✅ | ❌ | ✅ |
| Export canvas JSON | ✅ | ❌ | ✅ |
| Export canvas + assets ZIP | ✅ client ZIP | ❌ | 🔲 Phase 1.5 |
| i18n | ✅ | partial keys | partial |
| Studio brand UI | ✅ | mixed CSS vars | ✅ Tailwind serif/black |

### API alignment fixes (Phase 1)

- `projectApi.update` was `PUT`; backend expects **`POST /api/projects/{id}`** — fixed.

---

## Phased migration plan

### Phase 1 — Canvas list / project workspace ✅ (this task)

**Goal:** Parity with `history/static/canvas-list.*` for create/open/delete/organize.

**Deliverables:**
- Pan/zoom board, draggable cards, project CRUD, trash purge, export JSON
- Tests: `boardViewport`, `autoLayout`, extended `state`

### Phase 2 — Basic canvas viewport + image nodes ✅ (2026-07-12)

**Goal:** Classic canvas (`canvas.html`) usable in React at MVP: viewport, image nodes, save/reload.

**History audit (`canvas.js`) — Phase 2 scope vs deferred**

| Feature | History | Phase 2 React |
|---------|---------|---------------|
| Pan/zoom viewport | ✅ session + in-memory | ✅ wired + **PUT viewport** (backend fix) |
| Image upload (`/api/ai/upload`) | ✅ drop + node upload | ✅ drop on board + per-node upload |
| Image node CRUD | ✅ create/delete | ✅ context menu, sidebar, Delete key |
| Node drag | ✅ | ✅ LegacyNodeCard drag |
| Connections | ✅ | ✅ connect ports (existing) |
| Minimap | ✅ | ✅ existing component |
| Generate panel | ❌ History: **no** sidebar generate (nodes only) | ❌ **Removed** from sidebar (Option B, 2026-07-12); use in-graph generator nodes |
| Layers stack | ✅ | 🔲 Phase 2+ |
| Image edit modal | ✅ crop/mask/… | 🔲 Phase 4 |
| LTX timeline | ✅ `ltxDirector` node + `ltx-director-timeline.js` | ❌ sidebar panel **removed** (misleading); use `ltxDirector` node |
| Multi-select / R key | ✅ | 🔲 later |
| Export canvas | ✅ | 🔲 Phase 3 |

**Backend fix:** `canvas_service.update_canvas` now persists `viewport` for **classic** canvases when provided in PUT payload (previously smart-only).

### Phase 3 — Tool integration (generate → canvas)

**Goal:** Tools hub outputs land on canvas nodes (parity with history generate hooks).

- Reuse `ToolResultStage` patterns from `docs/TOOLS_MIGRATION.md`
- `POST /api/generate` → place result node / update selection

### Phase 4 — Smart canvas advanced parity

**Goal:** Close gaps vs `smart-canvas.js` (asset panel polish, cascade UX, workflow ZIP, image edit modes).

- Incremental: composer → assets → cascade → workflows → modals
- Keep single code path (smart vs legacy only where product requires)

### Phase 5 — Persistence parity json/sqlite

**Goal:** Migration tests green; no behavioral drift between storage backends.

- Extend `backend/tests/integration/test_migration_parity.py` for canvas list + editor saves
- Orphan scanner for canvas media refs

---

## Phase 1 implementation log

### Files added

- `docs/CANVAS_MIGRATION.md` (this file)
- `frontend/src/features/canvas-list/boardViewport.ts`
- `frontend/src/features/canvas-list/autoLayout.ts`
- `frontend/src/features/canvas-list/exportCanvas.ts`
- `frontend/src/features/canvas-list/components/ProjectSidebar.tsx`
- `frontend/src/features/canvas-list/components/CanvasCard.tsx`
- `frontend/src/features/canvas-list/components/TrashPanel.tsx`
- `frontend/tests/canvas-list/boardViewport.test.ts`
- `frontend/tests/canvas-list/autoLayout.test.ts`

### Files modified

- `frontend/src/features/canvas-list/CanvasListPage.tsx` — full workspace UI
- `frontend/src/features/canvas-list/api.ts` — POST project update, `getCanvas`
- `frontend/src/features/canvas-list/state.ts` — `sortProjects`, `projectCanvasCount`
- `frontend/src/types/api.d.ts` — `node_count`
- `frontend/tests/canvas-list/state.test.ts` — extended coverage

### Verify manually

1. Open `/canvases` — project sidebar, grid board
2. Pan (drag empty board), zoom (wheel)
3. Double-click board → create popover → classic vs smart
4. Drag card → refresh → position persisted
5. Card ⋯ menu → rename, export JSON, cut → switch project → paste
6. Trash → restore / purge
7. New project, rename, delete (non-default)

### Run tests

```bash
cd frontend && npm test -- tests/canvas-list
cd backend && pytest tests/integration/test_canvases_api_contract.py -q
```

---

## Phase 2 implementation log

### Files added

- `frontend/src/features/canvas/core/uploadMedia.ts`
- `frontend/tests/canvas/persistence.test.ts`
- `backend/tests/integration/test_classic_canvas_api.py`

### Files modified

- `frontend/src/features/canvas/LegacyCanvasPage.tsx` — drop upload, keyboard delete, studio UI, cursor-zoom
- `frontend/src/features/canvas/components/LegacyNodeCard.tsx` — upload/delete, preview, brand styling
- `frontend/src/features/canvas/components/ContextMenu.tsx` — studio styling
- `frontend/src/features/canvas/core/types.ts` — history `type`/`url` normalization
- `backend/services/canvas_service.py` — classic viewport persistence on PUT
- `frontend/tests/canvas/persistence-types.test.ts` — history node shape test
- `docs/CANVAS_MIGRATION.md` — this section

### Verify manually

1. Create **普通画布** from `/canvases` → opens `/legacy-canvas/:id`
2. Right-click → add image node; drag to move; Delete to remove
3. Drop image files onto board → nodes appear with previews
4. Click empty node → upload; save button / auto-save after 3s
5. Reload page → nodes + viewport restored

### Run tests

```bash
cd frontend && npm test -- tests/canvas
cd backend && pytest tests/integration/test_classic_canvas_api.py tests/integration/test_canvases_api.py -q
```

### Phase 3 — Generate panel fix (2026-07-12)

**Root cause:** `submitLegacyGeneration` only read `url`/`urls` from API responses. Backend `/api/online-image` and `/api/generate` return **`images`** (and Comfy also `outputs`). Successful calls therefore produced no canvas nodes and no error UI — felt like a no-op.

**History reference:** `runGeneratorLegacy()` in `history/static/js/canvas.js` POSTs `/api/online-image` with `{ prompt, provider_id, model, size, reference_images }` and reads `result.images`.

**Fix:**
- `buildLegacyPayload` — API engine sends `OnlineImageRequest` fields; Comfy sends `GenerateRequest` fields; `reference_images` as `{ url }` objects
- `extractGenerationUrls` — parse `images`, `outputs`, `url`, `urls`
- `LegacyCanvasPage` — loading state, error alert, poll async tasks, append nodes via `legacyNodesFromResultUrls` + `nextAppendPosition`
- Tests: `frontend/tests/canvas/generation.test.ts` (mock fetch)

**Manual verify:** Open classic canvas → enter prompt → Generate → new image node appears; on failure, red error under panel.

---

### Phase 2.5 — Product clarity + drag freeze + connections (2026-07-12)

**User feedback:** Legacy canvas drag freezes / ghost duplicates; no visible wires; sidebar generate panel unclear; expected ComfyUI-like node graph.

#### Which canvas is ComfyUI-like?

| Canvas | History entry | Primary UX | Connections | Generation |
|--------|---------------|------------|-------------|------------|
| **Smart canvas** | `smart-canvas.html` + `smart-canvas.js` | ComfyUI-style node graph, composer, cascade, workflows | ✅ port drag + `canvasUsesConnections` | Per-node engines + cascade run |
| **Classic / legacy** | `canvas.html` + `canvas.js` | Image cards + layers + tool palette | ✅ ports on generator/comfy/etc. nodes | **Generator nodes in graph** (not sidebar-only in history) |

**Conclusion:** Classic canvas is the **node-wire / cascade** surface (History parity: no sidebar quick generate). Smart canvas is **Composer / card-style** with fewer manual wires. React Option B removes the Phase 2 sidebar Generate shortcut so classic matches History.

#### Drag freeze root cause + fix

**Root cause (two bugs):**
1. `LegacyNodeCard` used per-frame incremental `dx/dy` as if cumulative offset from drag start → node jumped near origin each move (ghost/freeze).
2. Every `mousemove` called `moveNode` → Zustand `dirty` + full React re-render tree.

**Fix (fork-first from `canvas.js` `onNodeDrag`):**
- Cumulative world offset: `(clientX - startX) / scale`
- DOM `left/top` updates during drag; single `moveNode` commit on pointer up
- Unit test: `frontend/tests/canvas/nodeDrag.test.ts`

#### Connections status

| Item | Before | After |
|------|--------|-------|
| `ConnectionLayer` wires | Implemented but `var(--text)` invisible | Fixed stroke colors + 6000×4000 SVG |
| Port handles | Link button only | In/out port dots + drag temp wire |
| Context menu generator nodes | Types exist | Right-click → add generator/comfy/etc. (unchanged) |
| Sidebar vs generator nodes | Sidebar only | Help text + wired refs from connected images |

**Manual verify:**
1. Legacy canvas → drag image node smoothly (no ghost)
2. Right-click → add「生成器」→ drag from image out-port to generator in-port → wire visible
3. Header hint + generate panel help explain legacy vs smart
4. Create canvas popover shows kind descriptions; pick「智能」→ `/canvas/:id`

#### Files changed

- `frontend/src/features/canvas/core/nodeDrag.ts` (new)
- `frontend/src/features/canvas/components/LegacyNodeCard.tsx`
- `frontend/src/features/canvas/components/ConnectionLayer.tsx`
- `frontend/src/features/canvas/core/layout.ts` — `nodeOutPort` / `nodeInPort`
- `frontend/src/features/canvas/core/types.ts` — port kind helpers
- `frontend/src/features/canvas/LegacyCanvasPage.tsx`
- `frontend/src/features/canvas-list/components/CanvasCard.tsx`
- `frontend/src/shared/i18n/locales/{zh,en}/canvas.json`
- `frontend/tests/canvas/nodeDrag.test.ts` (new)

---

## Classic canvas parity checklist

> Audit baseline: `history/static/js/canvas.js` + `canvas.html` (2026-07-12).  
> React target: `frontend/src/features/canvas/` (`LegacyCanvasPage.tsx`).

### Viewport / navigation

| Feature | History | React | Status |
|---------|---------|-------|--------|
| Pan (drag empty board) | ✅ | ✅ | ✅ |
| Zoom (wheel, cursor-anchored) | ✅ | ✅ | ✅ |
| Minimap | ✅ | ✅ | ✅ |
| Fit viewport / reset view | ✅ | ✅ | ✅ |
| Grid background | ✅ | ✅ | ✅ |
| Z key zoom overview | ✅ | ✅ | ✅ (2026-07-12 batch 2) |
| Double-click create menu | ✅ | ✅ | ✅ (2026-07-12 batch 2) |

### Nodes

| Feature | History | React | Status |
|---------|---------|-------|--------|
| Image upload node CRUD | ✅ | ✅ | ✅ |
| All node kinds in create menu | ✅ | ✅ | ✅ |
| Node drag (no ghost) | ✅ | ✅ | ✅ |
| Multi-select (Ctrl box) | ✅ | ✅ | ✅ (2026-07-12) |
| Multi-select group drag | ✅ | ✅ | ✅ (2026-07-12) |
| Ctrl+click toggle select | ✅ | ✅ | ✅ |
| Resize nodes | ✅ | ✅ | ✅ (2026-07-12 batch 3) |
| Layer stack panel | ❌ (no separate panel in history) | — | N/A |
| Group / promptGroup nodes | ✅ | ✅ group + promptGroup + Ctrl+G | ✅ (2026-07-12 batch 4) |
| Output node + pending cards | ✅ | ✅ | ✅ (2026-07-12 batch 3) |
| Arrange selected | ✅ | ✅ | ✅ (2026-07-12 batch 3) |

### Connections

| Feature | History | React | Status |
|---------|---------|-------|--------|
| Port drag wires | ✅ | ✅ | ✅ |
| Link button connect | ✅ | ✅ | ✅ |
| Delete connection (knife mode) | ✅ | ✅ | ✅ (2026-07-12 batch 2) |
| Link-create menu from port | ✅ | ✅ | ✅ (2026-07-12 batch 3) |

### Generation (classic scope)

| Feature | History | React | Status |
|---------|---------|-------|--------|
| Sidebar API/Comfy quick generate | ✅ (shortcut) | ✅ | ✅ |
| Provider + model selection (generator node) | ✅ | ✅ | ✅ (sidebar generate removed Option B) |
| **Generator node in-graph run** (`runGeneratorLegacy`) | ✅ | ✅ | ✅ (2026-07-12) |
| Comfy node in-graph run | ✅ | ✅ | ✅ (2026-07-12) |
| Video node → `/api/canvas-video` | ✅ | ✅ | ✅ (2026-07-12) |
| MS / RH / LTX / LLM node bodies | ✅ | ✅ LTX timeline + run | ✅ (2026-07-12 batch 4) |
| Cascade run (`runNodeCascade`) | ✅ | ✅ + loop rounds | ✅ (2026-07-12 batch 4) |
| Generation logs modal | ✅ | ✅ | ✅ (2026-07-12 batch 2) |
| Generator run elapsed timer | ✅ | ✅ | ✅ (2026-07-12 batch 3) |
| Prompt template library modal | ✅ | ✅ | ✅ (2026-07-12 batch 3) |

### Media

| Feature | History | React | Status |
|---------|---------|-------|--------|
| Drop upload on board | ✅ | ✅ | ✅ |
| Per-node upload | ✅ | ✅ | ✅ |
| Media preview proxy | ✅ | ✅ | ✅ |
| Output lightbox + compare slider | ✅ | ✅ compare in edit modal | ✅ (2026-07-12 batch 4) |
| **Image edit modal** (crop/mask/brush/grid/outpaint) | ✅ | ⚠️ crop/mask/outpaint | ⚠️ (2026-07-12 batch 2) |

### Video / LTX timeline

| Feature | History | React | Status |
|---------|---------|-------|--------|
| LTX Director node + timeline editor | ✅ | ✅ `LtxDirectorTimeline.tsx` | ✅ (2026-07-12 batch 4) |
| LTX sync wired images → segments | ✅ | ✅ `syncConnectedImagesToTimeline` | ✅ (2026-07-12 batch 4) |
| Loop node body + cascade rounds | ✅ | ✅ `LoopNodeBody.tsx` | ✅ (2026-07-12 batch 4) |

### Export / import

| Feature | History | React | Status |
|---------|---------|-------|--------|
| Export canvas JSON (editor) | ✅ | ✅ | ✅ |
| Workflow ZIP import/export | ✅ | ✅ | ✅ (2026-07-12 batch 3) |
| Export canvas + assets ZIP (list) | ✅ | ✅ `exportCanvasWithAssets` | ✅ (2026-07-12 batch 4) |

### Keyboard / UX

| Feature | History | React | Status |
|---------|---------|-------|--------|
| Delete selected | ✅ | ✅ | ✅ |
| Ctrl+C/V copy paste nodes | ✅ | ✅ | ✅ (2026-07-12 batch 2) |
| Ctrl+G group | ✅ | ✅ | ✅ (2026-07-12 batch 3) |
| Ctrl+Z undo | ✅ | ✅ | ✅ (2026-07-12 batch 2) |
| Shortcuts help modal | smart-canvas only | ✅ classic modal | ✅ (2026-07-12) |
| Asset library panel | ✅ | ✅ | ✅ (2026-07-12 batch 2) |
| Quick toolbar | ✅ | ✅ | ✅ (2026-07-12 batch 3) |

### Save / persistence

| Feature | History | React | Status |
|---------|---------|-------|--------|
| Auto-save debounce | ✅ | ✅ | ✅ |
| Manual save | ✅ | ✅ | ✅ |
| Viewport persist on PUT | ✅ | ✅ | ✅ |
| json/sqlite parity | ✅ | ⚠️ tests exist | ⚠️ |

---

## Phase 3 implementation log

- [x] Tool pages: "添加到画布" on generated results (`ToolResultStage` + `OnlinePage`)
- [x] Reuse result-stage action pattern (enhance / online / zimage / klein / angle via shared `ToolResultActions`)
- [x] In-editor JSON export on `LegacyCanvasPage` header (reuses `exportCanvasJson`)
- [x] Integration test: mock generate output → node persisted on classic canvas
- [x] This doc updated with Phase 3 record + Phase 4 checklist

### Files added

- `frontend/src/features/canvas/core/addResultToCanvas.ts` — append image nodes, resolve classic target canvas
- `frontend/src/shared/hooks/useCanvasSync.ts` — React Query mutation + status toast
- `frontend/src/features/tools/shared/ToolResultActions.tsx` — canvas / library / download actions
- `frontend/src/features/canvas/core/generation.ts` — payload + response parsing + poll helpers
- `frontend/tests/canvas/generation.test.ts` — mock API generate flow

### Files modified

- `frontend/src/features/tools/shared/ToolResultStage.tsx` — embed `ToolResultActions`
- `frontend/src/features/tools/pages/OnlinePage.tsx` — actions on custom result grid
- `frontend/src/features/canvas/LegacyCanvasPage.tsx` — remember last canvas id, JSON export button, **generate panel wired**
- `frontend/src/styles/studio.css` — action bar + status toast styles
- `frontend/src/shared/i18n/locales/{zh,en}/studio.json` — `addToCanvas*` strings
- `frontend/tests/tools/tool-result-multi.test.tsx` — action button assertions
- `backend/tests/integration/test_classic_canvas_api.py` — Phase 3 append test

### Behavior

1. Tool result stage shows **添加到画布** (grid icon) alongside **加入素材库** and download (single-image).
2. Target canvas: `localStorage` last opened classic canvas → newest classic canvas → auto-create empty classic canvas.
3. Nodes append at viewport center (empty canvas) or to the right of existing nodes; URLs are stored as-is (same as upload output paths).
4. Opening any classic canvas remembers its id for subsequent tool imports.

### Run tests

```bash
cd frontend && npm test -- tests/canvas/add-result-to-canvas.test.ts tests/tools/tool-result-multi.test.tsx
cd backend && pytest tests/integration/test_classic_canvas_api.py -q
```

---

## Phase 4 — Classic canvas parity (2026-07-12)

**Goal:** Full audit vs `history/static/js/canvas.js`; implement P0 gaps fork-first.

### Implemented this session

- **Parity checklist** — `Classic canvas parity checklist` section in this doc (✅ / ⚠️ / 🔲 matrix)
- **Generator node in-graph run** — `runNodeGeneration.ts` forks `runGeneratorLegacy` / `runCanvasGenerate`; `GeneratorNodeBody` with provider/model/ratio/resolution + Run
- **Comfy + video nodes in-graph** — Comfy POST `/api/generate`; video POST `/api/canvas-video`
- **Multi-select** — Ctrl+box select, Ctrl+click toggle, multi-drag, bulk Delete, `selectedIds` state
- **Shortcuts modal** — header keyboard button + `?` key (`ShortcutsModal.tsx`)
- **Image preview modal** — click image node → preview/download (full edit modal still 🔲)
- **LTX timeline** — remains history-accurate informational panel (not interactive editor)
- **i18n** — `shortcuts.*`, `multiSelect.*`, `imagePreview.hint` zh/en

### Files added

- `frontend/src/features/canvas/core/nodeSources.ts`
- `frontend/src/features/canvas/core/runNodeGeneration.ts`
- `frontend/src/features/canvas/components/GeneratorNodeBody.tsx`
- `frontend/src/features/canvas/components/ShortcutsModal.tsx`
- `frontend/src/features/canvas/components/ImagePreviewModal.tsx`
- `frontend/tests/canvas/node-generation.test.ts`

### Files modified

- `frontend/src/features/canvas/LegacyCanvasPage.tsx`
- `frontend/src/features/canvas/components/LegacyNodeCard.tsx`
- `frontend/src/features/canvas/components/ConnectionLayer.tsx`
- `frontend/src/features/canvas/core/state.ts`
- `frontend/src/features/canvas/core/uploadMedia.ts`
- `frontend/src/features/chat/providers.ts`
- `frontend/src/features/chat/types.ts`
- `frontend/src/shared/i18n/locales/{zh,en}/canvas.json`
- `docs/CANVAS_MIGRATION.md`

### Still 🔲 (classic scope, batch 5+)

- LTX audio segments + full `ltx-director-timeline.js` parity (waveform, drag-reorder all interactions)
- Image edit: advanced brush sizes, full history parity beyond crop/mask/outpaint/compare
- Loop node: video batch mode, parallel execution semantics (history full parity)
- WebSocket multi-client sync (if required for classic)

### Batch 4 — Implemented (2026-07-12)

- **LTX Director timeline editor** — `LtxDirectorTimeline.tsx` + `ltxTimeline.ts` (segments, sync images, run via `LTXDirectorv2-API.json`)
- **promptGroup node** — `promptGroup` kind + `PromptGroupNodeBody.tsx` + Ctrl+G when ≥2 prompts selected
- **Output compare slider** — `CompareSlider.tsx` in `ImageEditModal` + `imageComparisons` on output resolve
- **Loop node body** — `LoopNodeBody.tsx` + loop-aware `collectGenerationInput` + cascade rounds
- **Canvas list export ZIP** — `canvasZip.ts` + `exportCanvasWithAssets` + card context menu

### Batch 4 — Files added/updated

- `frontend/src/features/canvas/core/ltxTimeline.ts`
- `frontend/src/features/canvas/core/loop.ts`
- `frontend/src/features/canvas/components/LtxDirectorTimeline.tsx`
- `frontend/src/features/canvas/components/LoopNodeBody.tsx`
- `frontend/src/features/canvas/components/PromptGroupNodeBody.tsx`
- `frontend/src/features/canvas/components/CompareSlider.tsx`
- `frontend/src/features/canvas-list/canvasZip.ts`
- `frontend/tests/canvas/{ltxTimeline,loop,canvasZip}.test.ts`

### Still 🔲 (classic scope, batch 4+) — superseded by batch 5+ above

- ~~LTX Director full timeline editor~~ → ✅ batch 4 (core interactions; audio/advanced UI deferred)
- ~~promptGroup node kind~~ → ✅ batch 4
- ~~Output lightbox compare slider~~ → ✅ batch 4
- ~~Export canvas + assets ZIP from list page~~ → ✅ batch 4
- ~~Loop node body + full loop preview parity~~ → ✅ batch 4 (core body + rounds; video/parallel deferred)

### Batch 3 — Implemented (2026-07-12)

- **Output pending cards** — `pendingOutput.ts` + `OutputNodeBody.tsx`; auto output node on generator run; elapsed pills
- **Generator run elapsed timer** — `runStartedAt` + live duration in `GeneratorNodeBody`
- **Ctrl+G grouping** — `groupNodes.ts` + `GroupNodeBody.tsx` + quick toolbar / keyboard
- **Node resize** — bottom-right handle on image/output/group/prompt nodes
- **Link-create menu** — drag port to empty space → `LinkCreateMenu`; generator out-drag auto-creates output
- **Workflow ZIP** — `exportWorkflowZip` / `importWorkflowZipFile` via `/api/canvas-workflows/*`
- **Arrange selected** — `arrangeSelected.ts` + quick toolbar
- **Quick toolbar** — `QuickToolbar.tsx` (group, arrange, copy, delete, knife, fit)
- **Prompt template library** — `LegacyPromptTemplateModal.tsx` on prompt nodes
- **LTX advance** — `LtxDirectorNodeBody` wired image list + segment count (not full editor)

### Batch 2 — Implemented (2026-07-12)

- **Image edit modal** — `ImageEditModal.tsx`: preview, crop, mask brush, outpaint, grid guide
- **Cascade run** — `cascade.ts` + serial `handleRunCascade` + UI button on terminal generators
- **MS / LLM / RH node bodies** — `GeneratorNodeBody` + `runNodeGeneration` (`/api/ms/generate`, `/api/canvas-llm`, RunningHub submit/poll)
- **LTX Director** — node shell stub (sidebar timeline panel removed Option B)
- **Ctrl+C/V, Ctrl+Z** — `clipboard.ts` + undo stack in `state.ts`
- **Generation logs** — `GenerationLogPanel.tsx` + `generationLog.ts` persisted in `settings.generationLogs`
- **Asset library panel** — `LegacyAssetPanel.tsx` (fork smart-canvas `AssetPanel` APIs)
- **Workflow JSON import/export** — `workflowTransfer.ts` + header buttons
- **Knife mode** — scissors toolbar + clickable connection delete in `ConnectionLayer`
- **Z key overview** — fit-all toggle restore prior viewport
- **Double-click create** — opens same context menu at cursor

### Batch 2 — Files added

- `frontend/src/features/canvas/core/clipboard.ts`
- `frontend/src/features/canvas/core/cascade.ts`
- `frontend/src/features/canvas/core/generationLog.ts`
- `frontend/src/features/canvas/core/workflowTransfer.ts`
- `frontend/src/features/canvas/core/imageEdit.ts`
- `frontend/src/features/canvas/components/ImageEditModal.tsx`
- `frontend/src/features/canvas/components/GenerationLogPanel.tsx`
- `frontend/src/features/canvas/components/LegacyAssetPanel.tsx`
- `frontend/tests/canvas/{clipboard,cascade,generationLog,workflowTransfer,imageEdit}.test.ts`

### Batch 2 — Tests

```bash
cd frontend && npm test -- tests/canvas   # 134 passed (2026-07-12 batch 2)
```

### Batch 2 — Manual verify

1. Select nodes → Ctrl+C → Ctrl+V at mouse position → duplicates appear
2. Delete nodes → Ctrl+Z → restored
3. Wire image→generator→generator chain → terminal node shows「级联运行」
4. Click scissors → click a wire → connection removed
5. Press Z → fit overview; Z again → restore viewport
6. Double-click empty board → create menu
7. Click image → edit modal → crop tab → apply
8. Header: asset panel, generation logs, workflow export/import (JSON)
9. Add MS/LLM/RH nodes → minimal body + run (needs API keys configured)

### Manual verify (batch 1)

1. Open `/legacy-canvas/:id` → right-click → add「生成器」
2. Wire image out-port → generator in-port; add prompt in generator textarea
3. Select provider/model → click「API生成」→ result image node appears
4. Ctrl+drag empty board → box selects multiple nodes → drag together
5. Click image node → preview modal; header keyboard icon → shortcuts list
6. LTX: add「LTX Director」node from context menu (no right sidebar panel)

### Tests

```bash
cd frontend && npm test -- tests/canvas
cd backend && python -m pytest backend/tests/integration/test_classic_canvas_api.py backend/tests/integration/test_canvases_api.py -q
```

---

## Smart canvas parity checklist

> Audit baseline: `history/static/js/smart-canvas.js` + `smart-canvas.html` + `docs/新手运行与使用教程.md` §十一（2026-07-12）.  
> React target: `frontend/src/features/smart-canvas/` (`SmartCanvasPage.tsx`).  
> Product boundary: Composer / card workflow, `@` mentions, fewer manual wires — **do not regress classic**.

### Viewport / cards / selection

| Feature | History | React | Status |
|---------|---------|-------|--------|
| Pan / zoom / minimap | ✅ | ✅ | ✅ |
| Right-click create menu (导入/分组/Prompt/Loop) | ✅ | ✅ | ✅（导入节点标题对齐 history） |
| Card select + drag (scale-aware) | ✅ | ✅ | ✅ |
| Multi-select (Ctrl/⌘ drag box, Shift click) | ✅ | ✅ | ✅ |
| Delete selected (header trash / multi toolbar≥2 / Delete key / undo) | ✅ | ✅ | ✅（单选仅卡片垃圾桶；≥2 才显示「已选 N」浮动栏） |
| Top toolbar (no duplicate Upload; grouped actions) | ✅ floating | ✅ | ✅（本轮：`SmartCanvasToolbar` 合并导入导出） |
| Empty import card upload zone | ✅ | ✅ | ✅（本轮：点击/拖放 → `/api/ai/upload`） |
| Group toolbar (layout / collapse / export / delete) | ✅ | ✅ | ✅ |

### Composer（engine / prompt / @assets / run）

| Feature | History | React | Status |
|---------|---------|-------|--------|
| Engine switch (API / 火山 / MS / Comfy / RH / OpenAI) | ✅ | ✅ | ✅ |
| Provider + model dropdown from `/api/config` | ✅ | ✅ | ✅（本轮：复用 classic `providers.ts`） |
| Prompt + run button | ✅ | ✅ | ✅（本轮：主次按钮层级 + loading + 缺配置禁用提示） |
| `@` mention → attach image URL as ref | ✅ token+URL | ✅ | ✅（本轮：素材库+画布图，写入 refs；popover 定位样式） |
| Asset panel → reference thumb | ✅ | ✅ | ✅ |
| Prompt library / templates | ✅ | ✅ Partial | ⚠️ |
| Dynamic image-params fields | ✅ | ✅ Partial | ⚠️ |

### Generation run path

| Feature | History | React | Status |
|---------|---------|-------|--------|
| API → `POST /api/canvas-image-tasks` + poll | ✅ | ✅ | ✅（禁止阻塞 online-image） |
| Require provider_id + model before submit | ✅ toast | ✅ | ✅（本轮校验，错误上浮） |
| Empty card: write result in-place | ✅ | ✅ | ✅（本轮 `planApplyImageResult`） |
| Card with media: branch output + connect | ✅ | ✅ | ✅（本轮） |
| No subject: auto-create import card | 需先选卡 | ✅ 自动建卡 | ✅（新手友好） |
| Running / error status on card + banner | ✅ toast | ✅ | ✅（本轮 pageError + status） |
| Video / LLM / Comfy / RH paths | ✅ | ✅ Partial | ⚠️（链路在，UX/字段仍薄） |
| Jimeng pending resume | ✅ | ✅ | ✅（batch2：`jimeng.ts` + 卡片查询 + 载入续询） |

### Asset panel / mentions

| Feature | History | React | Status |
|---------|---------|-------|--------|
| Asset panel library + local | ✅ | ✅ | ✅ |
| `@` from assets + canvas images | ✅ | ✅ | ✅ |
| Local folder browser CRUD | ✅ | ✅ | ✅（batch2：新建/上传/删除 + 文件夹切换） |

### Connections

| Feature | History | React | Status |
|---------|---------|-------|--------|
| Connect mode + ports | ✅ | ✅ | ✅ |
| Cascade edge highlight | ✅ | ✅ | ✅ |
| Auto-connect near loop (Ctrl+drag) | ✅ | ✅ | ✅（batch2：`autoConnect.ts`） |

### Save / load persistence

| Feature | History | React | Status |
|---------|---------|-------|--------|
| GET/PUT `/api/canvases/:id` | ✅ | ✅ | ✅ |
| Auto-save debounce | ✅ | ✅ (3s) | ✅ |
| Conflict / base_updated_at | ✅ | ✅ | ✅ |
| WS remote merge | ✅ | ✅ Partial | ⚠️ |

### Workflow import / export

| Feature | History | React | Status |
|---------|---------|-------|--------|
| ZIP export/import | ✅ | ✅ | ✅ |
| Transfer modal | ✅ | ✅ | ✅ |
| RunningHub workflow picker → card | ✅ | ✅ | ✅ |

### Cascade / one-click run

| Feature | History | React | Status |
|---------|---------|-------|--------|
| Cascade from Composer | ✅ | ✅ | ✅ |
| Loop rounds / parallel | ✅ | ✅ Partial | ⚠️ |
| Loop auto-wire to nearest card | ✅ Ctrl-drag | ✅ | ✅（batch2） |

### Image edit

| Feature | History | React | Status |
|---------|---------|-------|--------|
| Preview / crop / mask / outpaint / grid | ✅ | ✅ | ✅（batch2：复用 classic `imageEdit.ts`） |
| Advanced brush sizes / history parity | ✅ | ⚠️ | ⚠️ |

### Error surfacing

| Feature | History | React | Status |
|---------|---------|-------|--------|
| Toast / banner on fail | ✅ | ✅ banner | ✅ |
| Composer inline error | ✅ | ✅ | ✅ |
| Jimeng queue banner + 查询结果 | ✅ | ✅ | ✅ |

### Usable now vs still scaffold (honesty)

| Area | After batch 2 |
|------|----------------|
| Composer API run → card image | **Usable** |
| 导入节点 + 上传 / `@` refs / 保存 | **Usable** |
| Jimeng 排队卡 + 手动查询 + 刷新续询 | **Usable**（需即梦 Provider） |
| Ctrl+拖 Loop 吸附到图片卡 | **Usable** |
| ImageEdit crop/mask/outpaint | **Usable**（上传结果回写） |
| AssetPanel 本地文件夹 CRUD | **Usable** |
| RH 完整字段映射 / Loop 多轮并行精修 | **仍 ⚠️** |
| ImageEdit 高级笔刷/历史 parity | **仍 ⚠️** |
| insertLoopIntoConnection / 分组拖入合并 | **仍 🔲** |

### Files touched (batch 1 + 2)

**Batch 1:** applyRunResult / generation validate / Composer providers / Mention / import upload  
**Batch 2:**
- `core/jimeng.ts` — query-media + poll resume
- `core/autoConnect.ts` — Ctrl-drag loop snap
- `core/generation.ts` — `jimeng_pending` → submitId（不再假挂起）
- `components/ImageEditModal.tsx` — fork classic crop/mask/outpaint
- `components/AssetPanel.tsx` — local folder CRUD
- `components/NodeCard.tsx` — jimeng UI + drag-end info
- `SmartCanvasPage.tsx` — wire jimeng/autosnap/query
- `tests/smart-canvas/jimeng-autoconnect.test.ts`

### Manual verify (smart canvas)

1. 打开 `/canvas/:id` → 右键「导入节点」→ 上传；Composer 生成出图  
2. `@` 引用素材 → 缩略图 → 再生成  
3. **Jimeng**：用即梦 Provider 触发排队 → 卡片显示排队 +「查询结果」；刷新后仍续询  
4. **Loop 吸附**：创建 Loop，按住 Ctrl 拖到图片卡上松开 → 自动连线且 Loop 弹回原位  
5. **ImageEdit**：点卡片预览 → 裁剪/蒙版/扩图 → 应用后图更新  
6. **本地素材**：素材面板「本地文件夹」→ 新建文件夹 → 上传 → 删除  
7. **删除节点**：单选 → 卡片头垃圾桶或 Delete；Ctrl+框选/多选（≥2）→「已选 N」浮动栏删除；Ctrl+Z 撤销  
8. **顶栏**：确认无重复 Upload；「导入/导出」走 `PackageOpen` → 传输弹窗；RH 工作流用 `Workflow` 图标  
9. **视口**：空白拖动画布平移；滚轮缩放；双击/右键空白打开创建菜单；Ctrl+拖空白框选  

### Tests

```bash
cd frontend && npm test -- tests/smart-canvas
```

---

## Next phase checklist (Phase 4 — Smart canvas advanced parity)

- [x] Asset panel in smart canvas (library + local folders browse/import) — CRUD done batch2
- [x] Cascade run across connected nodes (basic serial; loop parallel still ⚠️)
- [x] Workflow ZIP import/export from smart canvas
- [x] Image edit modal (crop / mask / grid / outpaint) — batch2; advanced brush still ⚠️
- [ ] WebSocket multi-client sync polish
- [x] Generation logs panel parity with history (basic LogModal)
- [x] Shortcuts modal + keyboard map
- [ ] Smart canvas: duplicate node media to canvas (history `duplicateSmartNodeMediaToCanvas`)
- [ ] Export canvas + assets ZIP from canvas list (Phase 1.5 item)
- [ ] Product definition: document canvas module user flows
- [x] **P0 session 2026-07-12**: Composer async run → card attach / branch; `@` refs; import upload; provider defaults; error banner
- [x] Jimeng pending resume on smart cards (batch2)
- [x] Loop auto-wire to nearest card via Ctrl+drag (batch2)
- [x] **P0 2026-07-12**: node delete (all kinds) + Composer bar studio polish
- [x] **P0 2026-07-12**: top toolbar dedupe (SmartCanvasToolbar)
- [ ] insertLoopIntoConnection / smart-group drag-merge
- [ ] RH full nodeInfoList mapping
- [ ] Loop multi-round parallel polish

---

## Next phase checklist (Phase 3 — completed)

- [x] Tool result → classic canvas: place image node at viewport center / stack offset
- [x] Shared `ToolResultStage` "添加到画布" for `/enhance`, `/online`, `/zimage`, `/klein`, `/angle`
- [x] Export classic canvas JSON from editor header
- [x] Integration test: mock generate → node appears after save
- [x] Update this doc Phase 3 section

---

## Phase 2 follow-up — Generate panel + LTX sidebar (2026-07-12)

### Problem

- Legacy sidebar only exposed a raw **API / ComfyUI** `<select>` — not the provider/model/size controls from history `canvas.js` generator nodes or tools `OnlinePage`.
- **LTX Timeline** sidebar showed an interactive clip scaffold with no backend wiring, confusing users ("LTX 时间线又是什么？").

### History reference

| Topic | History location | Behavior |
|-------|------------------|----------|
| API generate | `canvas.js` `renderGeneratorBody` | Provider → model → ratio/resolution → quality → count; POST `/api/online-image` |
| Comfy generate | `canvas.js` comfy nodes | Workflow JSON + dimensions; POST `/api/generate` |
| LTX Director | `ltx-director-timeline.js` + `ltxDirector` node | Multi-segment timeline → ComfyUI `LTXDirectorv2-API.json` video output |

### React changes (superseded by Option B)

| File | Change |
|------|--------|
| `GeneratePanel.tsx` / `LtxTimelinePanel.tsx` | Built as sidebar panels |
| `LegacyCanvasPage.tsx` | Mounted them in a right `aside` |

### Option B — remove sidebar generate (2026-07-12)

| File | Change |
|------|--------|
| `LegacyCanvasPage.tsx` | **Unmounted** `GeneratePanel` + `LtxTimelinePanel`; removed empty right column |
| `GeneratePanel.tsx` | File kept unused (in-graph `GeneratorNodeBody` is the generate UX) |
| `LtxTimelinePanel.tsx` | File kept unused; copy no longer points users to Smart Canvas for LTX |
| i18n `canvas.json` zh/en | Fixed reversed classic/smart descriptions; `generatePanel.help` reflects node-only generate |
| `frontend/tests/canvas/generate-panel.test.tsx` | Asserts page does not mount sidebar panels |

`frontend/src/features/canvas/timeline/Timeline.tsx` retained for future LTX port on the **ltxDirector node**, not a sidebar.

---

## Classic node readiness audit (2026-07-12)

> Goal: stop “scaffold-looking” nodes — each kind either **usable** or **honestly incomplete**.

| Kind | Inputs | Outputs | Run path | History parity | React status | Gap |
|------|--------|---------|----------|----------------|--------------|-----|
| **image** | Upload / drop | out → generators | n/a | High | **Usable** | Aspect via naturalW/H |
| **prompt** | Textarea | out → generators/LLM | n/a | High | **Usable** | Wired text collected |
| **generator** | Wired prompt/image + local prompt; provider/model/ratio | → Output (auto) | `POST /api/online-image` | High | **Usable** | Input thumbnails + **适配比例(source)** + size in payload |
| **msgen** | Same + W/H or source ratio | → Output | `POST /api/ms/generate` | Medium | **Usable** | Model tabs/LoRA still thinner than history |
| **comfy** | Wired + preset workflow | → Output | `POST /api/generate` | Medium | **Usable** | Presets only (zimage/upscale), not full workflow picker |
| **video** | Wired + provider/model | → Output | `POST /api/canvas-video` | Medium | **Usable\*** | *Needs video API provider; empty list shows warning |
| **rh** | workflowId/webappId + saved `nodeInfoList` | → Output | RH submit/poll | Low–Med | **Partial** | Wired inputs **preview only**; no auto field mapping |
| **llm** | Wired prompts | `settings.outputText` → generators | `POST /api/canvas-llm` | Medium | **Usable** | Output text written back on run |
| **output** | from generators | images + pending | receive only | High | **Usable** | **Fixed**: run now writes pending→images (was empty forever) |
| **loop** | toggles + cascade target | cascade rounds | cascade helper | Medium | **Usable** | Orchestrates cascade, not standalone generate |
| **group** / **promptGroup** | child items | out as bundle | n/a | Medium | **Usable** | Aggregation via `nodeSources` |
| **ltxDirector** | timeline + wired images | → Output | Comfy LTX workflow | Medium | **Partial** | Timeline UI + run path exist; needs Comfy LTX workflow on server |

### Fixes in this session

1. **Run → Output**: `beginGenerationOutput` / `finishGenerationOutput` wired in `LegacyCanvasPage.handleRunNode` (no longer only `addNode(resultNodes)` leaving Output empty).
2. **Multi-input UX**: `ConnectedInputsSummary` on generator/comfy/msgen/video/rh/llm.
3. **Aspect follow**: ratio `source` + `sourceRatio.ts` → API `size` / MS W×H.
4. **Wire colors**: prompt=green, image=blue on `ConnectionLayer`.
5. **RH honesty**: hint that nodeInfoList mapping is incomplete; still submits if workflowId set.
6. **LLM**: `outputText` persisted after run.

### Manual verify matrix

| Check | Steps |
|-------|-------|
| Generator happy path | Prompt → Generator → Run → Output shows pending then image |
| Multi-input | Image+Prompt → Generator: thumbnails + prompt chips visible; refs in request |
| Aspect follow | Connect image, set 适配比例, Run → payload size matches input aspect |
| LLM | Prompt → LLM → Run → output textarea fills; wire to Generator uses text |
| Comfy | Comfy node Run with Comfy online → Output |
| Video | With video provider configured → Run; without → amber warning |
| RH | Fill workflowId → Run (needs RH key); expect submit/poll or clear error |
| No Option B regression | No sidebar GeneratePanel |

### Tests

- `frontend/tests/canvas/apply-generation-result.test.ts` — output pending resolve + sourceRatio
- Existing `node-generation.test.ts`, `pendingOutput.test.ts`, `generator-node-body.test.tsx`

---

## Next phase checklist (Phase 2 — completed)

- [x] Audit `LegacyCanvasPage.tsx` vs `history/static/js/canvas.js` feature list
- [x] Wire viewport + world transform (`features/canvas/core/viewport.ts`)
- [x] Image node upload + CRUD + persistence round-trip test
- [x] Integration test: create classic → add node → save → reload
- [x] Update this doc Phase 2 section with file list

---

## Principles (ongoing)

1. **Fork-first** — port behavior from history JS; do not redesign interaction
2. **Reuse storage** — `canvas_service` + repositories; no parallel data model
3. **Studio brand** — `font-serif`, black/white, `rounded-lg` (see `frontend-brand-guard`)
4. **API contract** — keep `test_canvases_api_contract.py` green when changing payloads
