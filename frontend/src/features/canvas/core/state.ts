import { create } from "zustand";
import { immer } from "zustand/middleware/immer";
import {
  buildClipboardFromSelection,
  pasteClipboardAt,
  type NodeClipboard,
} from "./clipboard";
import {
  createGenerationLogEntry,
  createRunningGenerationLogEntry,
  normalizePersistedGenerationLogs,
  prependGenerationLog,
  updateGenerationLogEntry,
  type GenerationLogEntry,
} from "./generationLog";
import { arrangeSelectedNodes } from "./arrangeSelected";
import { buildGroupFromSelection } from "./groupNodes";
import {
  canConnect,
  connectRejectMessage,
  sanitizeConnections,
} from "./connectRules";
import { filterValidConnections } from "./layout";
import { arrangeGrid } from "./viewport";
import { clampLegacyNodeSize } from "./nodeResize";
import { defaultSettingsForKind } from "./runNodeGeneration";
import { normalizePersistedCanvasNodes } from "./runState";
import { importWorkflowAt, type WorkflowPayload } from "./workflowTransfer";
import {
  DEFAULT_VIEWPORT,
  createLegacyNode,
  defaultTitleForKind,
  type GeneratePanelSettings,
  type LegacyConnection,
  type LegacyNode,
  type ViewportState,
} from "./types";

const UNDO_MAX = 50;

interface UndoSnapshot {
  nodes: LegacyNode[];
  connections: LegacyConnection[];
}

/** Fork history `deleteSelectedNodes` — deleting a group also removes its items. */
export function collectDeleteIds(
  ids: string[],
  nodes: LegacyNode[],
): Set<string> {
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const toDelete = new Set<string>();
  const collect = (id: string) => {
    if (toDelete.has(id)) return;
    toDelete.add(id);
    const n = byId.get(id);
    if (!n || (n.kind !== "group" && n.kind !== "promptGroup")) return;
    const items = n.settings?.items;
    if (!Array.isArray(items)) return;
    for (const item of items) {
      if (typeof item === "string") collect(item);
    }
  };
  for (const id of ids) collect(id);
  return toDelete;
}

interface LegacyCanvasState {
  canvasId: string;
  title: string;
  nodes: LegacyNode[];
  connections: LegacyConnection[];
  viewport: ViewportState;
  settings: Record<string, unknown>;
  generate: GeneratePanelSettings;
  selectedIds: string[];
  connectFromId: string | null;
  connectOriginKind: "in" | "out";
  /** Brief UI feedback when a connect attempt is rejected. */
  connectFeedback: string | null;
  dirty: boolean;
  baseUpdatedAt: number;
  undoStack: UndoSnapshot[];
  nodeClipboard: NodeClipboard | null;
  generationLogs: GenerationLogEntry[];
  lastPasteWorld: { x: number; y: number };
  init: (payload: {
    canvasId: string;
    title: string;
    nodes: LegacyNode[];
    connections?: LegacyConnection[];
    viewport?: ViewportState;
    settings?: Record<string, unknown>;
    updated_at?: number;
  }) => void;
  setViewport: (patch: Partial<ViewportState>) => void;
  addNode: (partial: Partial<LegacyNode> & { kind: string }) => LegacyNode;
  addNodeAtKind: (
    kind: string,
    x: number,
    y: number,
    config?: import("../../chat/types").AiConfig,
  ) => LegacyNode;
  updateNode: (id: string, patch: Partial<LegacyNode>) => void;
  removeNode: (id: string) => void;
  removeNodes: (ids: string[]) => void;
  moveNode: (id: string, x: number, y: number) => void;
  moveNodes: (ids: string[], dx: number, dy: number) => void;
  selectNode: (id: string | null, options?: { additive?: boolean }) => void;
  setSelectedIds: (ids: string[]) => void;
  toggleSelectNode: (id: string) => void;
  clearSelection: () => void;
  arrangeNodes: () => void;
  arrangeSelected: () => boolean;
  groupSelected: () => boolean;
  resizeNode: (id: string, width: number, height: number) => void;
  addConnection: (from: string, to: string) => LegacyConnection | null;
  removeConnection: (id: string) => void;
  startConnect: (fromId: string, originKind?: "in" | "out") => void;
  completeConnect: (toId: string) => boolean;
  cancelConnect: () => void;
  setConnectFeedback: (msg: string | null) => void;
  clearConnectFeedback: () => void;
  setSettings: (patch: Record<string, unknown>) => void;
  setGenerate: (patch: Partial<GeneratePanelSettings>) => void;
  setTitle: (title: string) => void;
  markClean: (updatedAt: number) => void;
  pushUndo: () => void;
  undo: () => boolean;
  copySelection: () => boolean;
  pasteClipboard: (worldX?: number, worldY?: number) => boolean;
  setLastPasteWorld: (x: number, y: number) => void;
  importWorkflow: (payload: WorkflowPayload, worldX?: number, worldY?: number) => boolean;
  appendGenerationLog: (input: Parameters<typeof createGenerationLogEntry>[0]) => void;
  startGenerationLog: (
    input: Parameters<typeof createRunningGenerationLogEntry>[0],
  ) => string;
  updateGenerationLog: (
    id: string,
    input: Parameters<typeof createGenerationLogEntry>[0],
  ) => void;
}

export const useLegacyCanvasStore = create<LegacyCanvasState>()(
  immer((set, get) => ({
    canvasId: "",
    title: "未命名画布",
    nodes: [],
    connections: [],
    viewport: { ...DEFAULT_VIEWPORT },
    settings: {},
    generate: {
      prompt: "",
      engine: "api",
      kind: "image",
      params: {},
    },
    selectedIds: [],
    connectFromId: null,
    connectOriginKind: "out",
    connectFeedback: null,
    dirty: false,
    baseUpdatedAt: 0,
    undoStack: [],
    nodeClipboard: null,
    generationLogs: [],
    lastPasteWorld: { x: 200, y: 200 },

    init: (payload) =>
      set((s) => {
        s.canvasId = payload.canvasId;
        s.title = payload.title;
        s.nodes = normalizePersistedCanvasNodes(payload.nodes);
        const rawConns = payload.connections ?? [];
        s.connections = sanitizeConnections(rawConns, payload.nodes);
        s.viewport = payload.viewport ?? { ...DEFAULT_VIEWPORT };
        s.settings = payload.settings ?? {};
        s.baseUpdatedAt = payload.updated_at ?? 0;
        s.dirty = false;
        s.selectedIds = [];
        s.connectFromId = null;
        s.connectOriginKind = "out";
        s.connectFeedback = null;
        s.undoStack = [];
        const rawLogs = payload.settings?.generationLogs;
        s.generationLogs = Array.isArray(rawLogs)
          ? normalizePersistedGenerationLogs(rawLogs as GenerationLogEntry[])
          : [];
      }),

    setViewport: (patch) =>
      set((s) => {
        Object.assign(s.viewport, patch);
        s.dirty = true;
      }),

    addNode: (partial) => {
      const node = createLegacyNode(partial);
      set((s) => {
        s.nodes.push(node);
        s.selectedIds = [node.id];
        s.dirty = true;
      });
      return node;
    },

    addNodeAtKind: (kind, x, y, config) => {
      return get().addNode({
        kind,
        x,
        y,
        title: defaultTitleForKind(kind),
        settings: defaultSettingsForKind(kind, config),
        height:
          kind === "generator" || kind === "comfy" || kind === "video"
            ? 320
            : undefined,
      });
    },

    updateNode: (id, patch) =>
      set((s) => {
        const idx = s.nodes.findIndex((n) => n.id === id);
        if (idx >= 0) {
          Object.assign(s.nodes[idx], patch);
          s.dirty = true;
        }
      }),

    removeNode: (id) => {
      get().removeNodes([id]);
    },

    removeNodes: (ids) => {
      if (!ids.length) return;
      const current = get().nodes;
      const drop = collectDeleteIds(ids, current);
      if (!drop.size) return;
      get().pushUndo();
      set((s) => {
        s.nodes = s.nodes.filter((n) => !drop.has(n.id));
        s.connections = s.connections.filter(
          (c) => !drop.has(c.from) && !drop.has(c.to),
        );
        s.selectedIds = s.selectedIds.filter((id) => !drop.has(id));
        if (s.connectFromId && drop.has(s.connectFromId)) s.connectFromId = null;
        s.dirty = true;
      });
    },

    moveNode: (id, x, y) =>
      set((s) => {
        const node = s.nodes.find((n) => n.id === id);
        if (node) {
          node.x = x;
          node.y = y;
          s.dirty = true;
        }
      }),

    moveNodes: (ids, dx, dy) =>
      set((s) => {
        const move = new Set(ids);
        s.nodes.forEach((node) => {
          if (move.has(node.id)) {
            node.x += dx;
            node.y += dy;
          }
        });
        s.dirty = true;
      }),

    selectNode: (id, options) =>
      set((s) => {
        if (!id) {
          s.selectedIds = [];
          return;
        }
        if (options?.additive) {
          if (s.selectedIds.includes(id)) {
            s.selectedIds = s.selectedIds.filter((sid) => sid !== id);
          } else {
            s.selectedIds.push(id);
          }
          return;
        }
        s.selectedIds = [id];
      }),

    setSelectedIds: (ids) => set((s) => { s.selectedIds = [...ids]; }),

    toggleSelectNode: (id) =>
      set((s) => {
        if (s.selectedIds.includes(id)) {
          s.selectedIds = s.selectedIds.filter((sid) => sid !== id);
        } else {
          s.selectedIds.push(id);
        }
      }),

    clearSelection: () => set((s) => { s.selectedIds = []; }),

    arrangeNodes: () =>
      set((s) => {
        s.nodes = arrangeGrid(s.nodes);
        s.dirty = true;
      }),

    arrangeSelected: () => {
      const s = get();
      const next = arrangeSelectedNodes(s.selectedIds, s.nodes, s.connections);
      if (!next) return false;
      get().pushUndo();
      set((state) => {
        state.nodes = next;
        state.dirty = true;
      });
      return true;
    },

    groupSelected: () => {
      const s = get();
      const ids = s.selectedIds.length
        ? s.selectedIds
        : s.nodes.filter((n) => n.kind === "image" || n.kind === "prompt").map((n) => n.id);
      if (!ids.length && !s.selectedIds.length) {
        const anchor = s.lastPasteWorld;
        const built = buildGroupFromSelection([], s.nodes, s.connections, anchor.x, anchor.y);
        if (!built) return false;
        get().pushUndo();
        set((state) => {
          state.nodes.push(built.group);
          state.connections = built.connections;
          state.selectedIds = [built.group.id];
          state.dirty = true;
        });
        return true;
      }
      get().pushUndo();
      const built = buildGroupFromSelection(ids, s.nodes, s.connections);
      if (!built) return false;
      set((state) => {
        state.nodes.push(built.group);
        state.connections = built.connections;
        state.selectedIds = [built.group.id];
        state.dirty = true;
      });
      return true;
    },

    resizeNode: (id, width, height) =>
      set((s) => {
        const node = s.nodes.find((n) => n.id === id);
        if (!node) return;
        const next = clampLegacyNodeSize(width, height);
        node.width = next.width;
        node.height = next.height;
        node.settings = { ...node.settings, sized: true };
        s.dirty = true;
      }),

    addConnection: (from, to) => {
      if (from === to) return null;
      const { nodes, connections } = get();
      if (!canConnect(from, to, nodes, connections)) return null;
      const exists = connections.some((c) => c.from === from && c.to === to);
      if (exists) return null;
      const conn: LegacyConnection = {
        id: crypto.randomUUID(),
        from,
        to,
      };
      set((s) => {
        s.connections.push(conn);
        s.dirty = true;
        s.connectFeedback = null;
      });
      return conn;
    },

    removeConnection: (id) =>
      set((s) => {
        s.connections = s.connections.filter((c) => c.id !== id);
        s.dirty = true;
      }),

    startConnect: (fromId, originKind = "out") =>
      set((s) => {
        s.connectFromId = fromId;
        s.connectOriginKind = originKind;
        s.selectedIds = [fromId];
        s.connectFeedback = null;
      }),

    completeConnect: (toId) => {
      const fromId = get().connectFromId;
      const originKind = get().connectOriginKind;
      if (!fromId || fromId === toId) {
        set((s) => {
          s.connectFromId = null;
          s.connectOriginKind = "out";
        });
        return false;
      }
      const actualFrom = originKind === "out" ? fromId : toId;
      const actualTo = originKind === "out" ? toId : fromId;
      const { nodes, connections } = get();
      if (!canConnect(actualFrom, actualTo, nodes, connections)) {
        const msg =
          connectRejectMessage(actualFrom, actualTo, nodes, connections) ??
          "无法连接这两个节点";
        set((s) => {
          s.connectFromId = null;
          s.connectOriginKind = "out";
          s.connectFeedback = msg;
        });
        return false;
      }
      get().addConnection(actualFrom, actualTo);
      set((s) => {
        s.connectFromId = null;
        s.connectOriginKind = "out";
        s.selectedIds = [toId];
        s.connectFeedback = null;
      });
      return true;
    },

    cancelConnect: () =>
      set((s) => {
        s.connectFromId = null;
        s.connectOriginKind = "out";
      }),

    setConnectFeedback: (msg) =>
      set((s) => {
        s.connectFeedback = msg;
      }),

    clearConnectFeedback: () =>
      set((s) => {
        s.connectFeedback = null;
      }),

    setSettings: (patch) =>
      set((s) => {
        s.settings = { ...s.settings, ...patch };
        s.dirty = true;
      }),

    setGenerate: (patch) =>
      set((s) => {
        Object.assign(s.generate, patch);
      }),

    setTitle: (title) =>
      set((s) => {
        s.title = title;
        s.dirty = true;
      }),

    markClean: (updatedAt) =>
      set((s) => {
        s.dirty = false;
        s.baseUpdatedAt = updatedAt;
      }),

    pushUndo: () =>
      set((s) => {
        s.undoStack.push({
          nodes: JSON.parse(JSON.stringify(s.nodes)) as LegacyNode[],
          connections: JSON.parse(
            JSON.stringify(s.connections),
          ) as LegacyConnection[],
        });
        if (s.undoStack.length > UNDO_MAX) s.undoStack.shift();
      }),

    undo: () => {
      const stack = get().undoStack;
      if (!stack.length) return false;
      const snapshot = stack[stack.length - 1];
      set((s) => {
        s.undoStack.pop();
        s.nodes = snapshot.nodes;
        s.connections = snapshot.connections;
        s.selectedIds = [];
        s.connectFromId = null;
        s.connectOriginKind = "out";
        s.dirty = true;
      });
      return true;
    },

    copySelection: () => {
      const s = get();
      const clip = buildClipboardFromSelection(
        s.selectedIds,
        s.nodes,
        s.connections,
      );
      if (!clip) return false;
      set((state) => {
        state.nodeClipboard = clip;
      });
      return true;
    },

    pasteClipboard: (worldX, worldY) => {
      const s = get();
      if (!s.nodeClipboard) return false;
      const anchor = {
        x: worldX ?? s.lastPasteWorld.x,
        y: worldY ?? s.lastPasteWorld.y,
      };
      get().pushUndo();
      const pasted = pasteClipboardAt(s.nodeClipboard, anchor.x, anchor.y);
      set((state) => {
        pasted.nodes.forEach((n) => state.nodes.push(n));
        pasted.connections.forEach((c) => state.connections.push(c));
        state.selectedIds = pasted.selectedIds;
        state.dirty = true;
      });
      return true;
    },

    setLastPasteWorld: (x, y) =>
      set((s) => {
        s.lastPasteWorld = { x, y };
      }),

    importWorkflow: (payload, worldX, worldY) => {
      const s = get();
      const anchor = {
        x: worldX ?? s.lastPasteWorld.x,
        y: worldY ?? s.lastPasteWorld.y,
      };
      get().pushUndo();
      const imported = importWorkflowAt(payload, anchor.x, anchor.y);
      set((state) => {
        imported.nodes.forEach((n) => state.nodes.push(n));
        imported.connections.forEach((c) => state.connections.push(c));
        state.selectedIds = imported.selectedIds;
        state.dirty = true;
      });
      return true;
    },

    appendGenerationLog: (input) =>
      set((s) => {
        const entry = createGenerationLogEntry(input);
        s.generationLogs = prependGenerationLog(s.generationLogs, entry);
        s.settings = { ...s.settings, generationLogs: s.generationLogs };
        s.dirty = true;
      }),

    startGenerationLog: (input) => {
      const entry = createRunningGenerationLogEntry(input);
      set((s) => {
        s.generationLogs = prependGenerationLog(s.generationLogs, entry);
        s.settings = { ...s.settings, generationLogs: s.generationLogs };
        s.dirty = true;
      });
      return entry.id;
    },

    updateGenerationLog: (id, input) =>
      set((s) => {
        s.generationLogs = updateGenerationLogEntry(s.generationLogs, id, input);
        s.settings = { ...s.settings, generationLogs: s.generationLogs };
        s.dirty = true;
      }),
  })),
);

export function pruneConnections(
  connections: LegacyConnection[],
  nodes: LegacyNode[],
): LegacyConnection[] {
  const ids = new Set(nodes.map((n) => n.id));
  return filterValidConnections(connections, ids, nodes);
}
