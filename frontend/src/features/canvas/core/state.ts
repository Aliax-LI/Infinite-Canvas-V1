import { create } from "zustand";
import { immer } from "zustand/middleware/immer";
import { filterValidConnections } from "./layout";
import { arrangeGrid } from "./viewport";
import {
  DEFAULT_VIEWPORT,
  createLegacyNode,
  defaultTitleForKind,
  type GeneratePanelSettings,
  type LegacyConnection,
  type LegacyNode,
  type ViewportState,
} from "./types";

interface LegacyCanvasState {
  canvasId: string;
  title: string;
  nodes: LegacyNode[];
  connections: LegacyConnection[];
  viewport: ViewportState;
  settings: Record<string, unknown>;
  generate: GeneratePanelSettings;
  selectedNodeId: string | null;
  connectFromId: string | null;
  dirty: boolean;
  baseUpdatedAt: number;
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
  addNodeAtKind: (kind: string, x: number, y: number) => LegacyNode;
  updateNode: (id: string, patch: Partial<LegacyNode>) => void;
  removeNode: (id: string) => void;
  moveNode: (id: string, x: number, y: number) => void;
  selectNode: (id: string | null) => void;
  arrangeNodes: () => void;
  addConnection: (from: string, to: string) => LegacyConnection | null;
  removeConnection: (id: string) => void;
  startConnect: (fromId: string) => void;
  completeConnect: (toId: string) => void;
  cancelConnect: () => void;
  setSettings: (patch: Record<string, unknown>) => void;
  setGenerate: (patch: Partial<GeneratePanelSettings>) => void;
  setTitle: (title: string) => void;
  markClean: (updatedAt: number) => void;
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
    selectedNodeId: null,
    connectFromId: null,
    dirty: false,
    baseUpdatedAt: 0,

    init: (payload) =>
      set((s) => {
        s.canvasId = payload.canvasId;
        s.title = payload.title;
        s.nodes = payload.nodes;
        s.connections = payload.connections ?? [];
        s.viewport = payload.viewport ?? { ...DEFAULT_VIEWPORT };
        s.settings = payload.settings ?? {};
        s.baseUpdatedAt = payload.updated_at ?? 0;
        s.dirty = false;
        s.selectedNodeId = null;
        s.connectFromId = null;
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
        s.selectedNodeId = node.id;
        s.dirty = true;
      });
      return node;
    },

    addNodeAtKind: (kind, x, y) => {
      return get().addNode({
        kind,
        x,
        y,
        title: defaultTitleForKind(kind),
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

    removeNode: (id) =>
      set((s) => {
        s.nodes = s.nodes.filter((n) => n.id !== id);
        s.connections = s.connections.filter((c) => c.from !== id && c.to !== id);
        if (s.selectedNodeId === id) s.selectedNodeId = null;
        if (s.connectFromId === id) s.connectFromId = null;
        s.dirty = true;
      }),

    moveNode: (id, x, y) =>
      set((s) => {
        const node = s.nodes.find((n) => n.id === id);
        if (node) {
          node.x = x;
          node.y = y;
          s.dirty = true;
        }
      }),

    selectNode: (id) => set((s) => { s.selectedNodeId = id; }),

    arrangeNodes: () =>
      set((s) => {
        s.nodes = arrangeGrid(s.nodes);
        s.dirty = true;
      }),

    addConnection: (from, to) => {
      if (from === to) return null;
      const exists = get().connections.some(
        (c) => c.from === from && c.to === to,
      );
      if (exists) return null;
      const conn: LegacyConnection = {
        id: crypto.randomUUID(),
        from,
        to,
      };
      set((s) => {
        s.connections.push(conn);
        s.dirty = true;
      });
      return conn;
    },

    removeConnection: (id) =>
      set((s) => {
        s.connections = s.connections.filter((c) => c.id !== id);
        s.dirty = true;
      }),

    startConnect: (fromId) =>
      set((s) => {
        s.connectFromId = fromId;
        s.selectedNodeId = fromId;
      }),

    completeConnect: (toId) => {
      const fromId = get().connectFromId;
      if (!fromId || fromId === toId) {
        set((s) => { s.connectFromId = null; });
        return;
      }
      get().addConnection(fromId, toId);
      set((s) => {
        s.connectFromId = null;
        s.selectedNodeId = toId;
      });
    },

    cancelConnect: () => set((s) => { s.connectFromId = null; }),

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
  })),
);

export function pruneConnections(
  connections: LegacyConnection[],
  nodes: LegacyNode[],
): LegacyConnection[] {
  const ids = new Set(nodes.map((n) => n.id));
  return filterValidConnections(connections, ids);
}
