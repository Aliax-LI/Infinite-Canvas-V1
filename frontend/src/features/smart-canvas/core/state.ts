import { create } from "zustand";
import { immer } from "zustand/middleware/immer";
import {
  cloneSnapshot,
  popRedo,
  popUndo,
  pushUndo,
  type HistorySnapshot,
} from "./history";
import {
  DEFAULT_VIEWPORT,
  UNDO_LIMIT,
  createNode,
  normalizeNode,
  type CanvasConnection,
  type ComposerSettings,
  type LogEntry,
  type SmartNode,
  type ViewportState,
} from "./types";
import { autoArrangeNodes, getGroupMembers, smartGroupLayout } from "./layout";
import { canAutoConnectNodes } from "./legacyTypes";
import { cloneNode } from "./nodeFactory";
import { mergeCanvasPayload } from "./merge";

interface SmartCanvasState {
  canvasId: string;
  title: string;
  icon: string;
  nodes: SmartNode[];
  connections: CanvasConnection[];
  viewport: ViewportState;
  logs: LogEntry[];
  settings: Record<string, unknown>;
  composer: ComposerSettings;
  selectedNodeId: string | null;
  selectedIds: string[];
  activeComposerNodeId: string | null;
  clipboard: SmartNode[];
  undoStack: HistorySnapshot[];
  redoStack: HistorySnapshot[];
  dirty: boolean;
  baseUpdatedAt: number;
  init: (payload: {
    canvasId: string;
    title: string;
    icon: string;
    nodes: SmartNode[];
    connections: CanvasConnection[];
    viewport?: ViewportState;
    logs?: LogEntry[];
    settings?: Record<string, unknown>;
    updated_at?: number;
  }) => void;
  snapshot: () => HistorySnapshot;
  commitHistory: () => void;
  undo: () => void;
  redo: () => void;
  setViewport: (viewport: Partial<ViewportState>) => void;
  addNode: (partial: Partial<SmartNode> & { kind: string }) => SmartNode;
  updateNode: (id: string, patch: Partial<SmartNode>) => void;
  removeNode: (id: string) => void;
  removeNodes: (ids: string[]) => void;
  moveNode: (id: string, x: number, y: number) => void;
  moveNodes: (ids: string[], dx: number, dy: number) => void;
  selectNode: (id: string | null) => void;
  toggleSelectNode: (id: string, additive?: boolean) => void;
  setSelectedIds: (ids: string[]) => void;
  clearSelection: () => void;
  setActiveComposerNode: (id: string | null) => void;
  syncComposerFromNode: (id: string) => void;
  copySelectedNodes: () => void;
  pasteNodes: (offsetX?: number, offsetY?: number) => void;
  disconnectBetween: (fromId: string, toId: string) => void;
  disconnectAllForNode: (nodeId: string) => void;
  setComposer: (patch: Partial<ComposerSettings>) => void;
  addConnection: (conn: CanvasConnection) => void;
  removeConnection: (id: string) => void;
  connectNodes: (fromId: string, toId: string) => boolean;
  arrangeNodes: () => void;
  layoutGroup: (groupId: string) => void;
  toggleGroupCollapse: (groupId: string) => void;
  ungroupGroup: (groupId: string) => void;
  appendWorkflow: (
    nodes: SmartNode[],
    connections: CanvasConnection[],
    target: { x: number; y: number },
  ) => void;
  setTitle: (title: string) => void;
  addLog: (entry: LogEntry) => void;
  applyRemoteNodes: (nodes: SmartNode[]) => void;
  mergeRemoteCanvas: (payload: {
    nodes: SmartNode[];
    connections: CanvasConnection[];
    updatedAt: number;
  }) => void;
  markClean: (updatedAt: number) => void;
}

export const useSmartCanvasStore = create<SmartCanvasState>()(
  immer((set, get) => ({
    canvasId: "",
    title: "未命名画布",
    icon: "🧩",
    nodes: [],
    connections: [],
    viewport: { ...DEFAULT_VIEWPORT },
    logs: [],
    settings: {},
    composer: {
      engine: "api",
      prompt: "",
      kind: "image",
      params: {},
    },
    selectedNodeId: null,
    selectedIds: [],
    activeComposerNodeId: null,
    clipboard: [],
    undoStack: [],
    redoStack: [],
    dirty: false,
    baseUpdatedAt: 0,

    init: (payload) =>
      set((s) => {
        s.canvasId = payload.canvasId;
        s.title = payload.title;
        s.icon = payload.icon;
        s.nodes = payload.nodes;
        s.connections = payload.connections;
        s.viewport = payload.viewport ?? { ...DEFAULT_VIEWPORT };
        s.logs = payload.logs ?? [];
        s.settings = payload.settings ?? {};
        s.undoStack = [];
        s.redoStack = [];
        s.dirty = false;
        s.baseUpdatedAt = payload.updated_at ?? 0;
      }),

    snapshot: () => {
      const s = get();
      return cloneSnapshot({
        nodes: s.nodes,
        connections: s.connections,
        viewport: s.viewport,
      });
    },

    commitHistory: () =>
      set((s) => {
        s.undoStack = pushUndo(s.undoStack, get().snapshot(), UNDO_LIMIT);
        s.redoStack = [];
        s.dirty = true;
      }),

    undo: () =>
      set((s) => {
        const current = get().snapshot();
        const result = popUndo(s.undoStack, s.redoStack, current);
        if (!result.current) return;
        s.undoStack = result.undoStack;
        s.redoStack = result.redoStack;
        s.nodes = result.current.nodes;
        s.connections = result.current.connections;
        s.viewport = result.current.viewport;
        s.dirty = true;
      }),

    redo: () =>
      set((s) => {
        const current = get().snapshot();
        const result = popRedo(s.undoStack, s.redoStack, current);
        if (!result.current) return;
        s.undoStack = result.undoStack;
        s.redoStack = result.redoStack;
        s.nodes = result.current.nodes;
        s.connections = result.current.connections;
        s.viewport = result.current.viewport;
        s.dirty = true;
      }),

    setViewport: (viewport) =>
      set((s) => {
        Object.assign(s.viewport, viewport);
      }),

    addNode: (partial) => {
      get().commitHistory();
      const node = createNode(partial);
      set((s) => {
        s.nodes.push(node);
        s.dirty = true;
      });
      return node;
    },

    updateNode: (id, patch) =>
      set((s) => {
        const node = s.nodes.find((n) => n.id === id);
        if (!node) return;
        Object.assign(node, patch);
        s.dirty = true;
      }),

    removeNode: (id) => {
      get().removeNodes([id]);
    },

    removeNodes: (ids) => {
      const removing = new Set(ids.filter(Boolean));
      if (!removing.size) return;
      get().commitHistory();
      set((s) => {
        s.nodes = s.nodes.filter((node) => !removing.has(node.id));
        // Fork history deleteNode: scrub member_ids / group_id on survivors
        for (const node of s.nodes) {
          if (Array.isArray(node.member_ids)) {
            node.member_ids = node.member_ids.filter((mid) => !removing.has(mid));
          }
          if (node.group_id && removing.has(node.group_id)) {
            delete node.group_id;
          }
        }
        s.connections = s.connections.filter(
          (connection) => !removing.has(connection.from) && !removing.has(connection.to),
        );
        s.selectedIds = s.selectedIds.filter((id) => !removing.has(id));
        if (s.selectedNodeId && removing.has(s.selectedNodeId)) {
          s.selectedNodeId = s.selectedIds[s.selectedIds.length - 1] ?? null;
        }
        if (s.activeComposerNodeId && removing.has(s.activeComposerNodeId)) {
          s.activeComposerNodeId = null;
        }
        s.dirty = true;
      });
    },

    moveNode: (id, x, y) =>
      set((s) => {
        const node = s.nodes.find((n) => n.id === id);
        if (!node) return;
        node.x = x;
        node.y = y;
        s.dirty = true;
      }),

    moveNodes: (ids, dx, dy) =>
      set((s) => {
        const idSet = new Set(ids);
        for (const node of s.nodes) {
          if (!idSet.has(node.id)) continue;
          node.x += dx;
          node.y += dy;
        }
        s.dirty = true;
      }),

    selectNode: (id) =>
      set((s) => {
        s.selectedNodeId = id;
        s.selectedIds = id ? [id] : [];
        if (id) {
          s.activeComposerNodeId = id;
          const node = s.nodes.find((n) => n.id === id);
          if (node) {
            s.composer.prompt = node.prompt;
            const nodeSettings = node.settings as Partial<ComposerSettings>;
            if (nodeSettings.engine) s.composer.engine = nodeSettings.engine as ComposerSettings["engine"];
            if (nodeSettings.kind) s.composer.kind = nodeSettings.kind as ComposerSettings["kind"];
            if (nodeSettings.params) s.composer.params = nodeSettings.params as Record<string, unknown>;
          }
        }
      }),

    toggleSelectNode: (id, additive = false) =>
      set((s) => {
        if (!additive) {
          s.selectedIds = [id];
          s.selectedNodeId = id;
          return;
        }
        const idx = s.selectedIds.indexOf(id);
        if (idx >= 0) {
          s.selectedIds.splice(idx, 1);
          s.selectedNodeId = s.selectedIds[s.selectedIds.length - 1] ?? null;
        } else {
          s.selectedIds.push(id);
          s.selectedNodeId = id;
        }
      }),

    setSelectedIds: (ids) =>
      set((s) => {
        s.selectedIds = ids;
        s.selectedNodeId = ids[ids.length - 1] ?? null;
      }),

    clearSelection: () =>
      set((s) => {
        s.selectedIds = [];
        s.selectedNodeId = null;
      }),

    setActiveComposerNode: (id) =>
      set((s) => {
        s.activeComposerNodeId = id;
      }),

    syncComposerFromNode: (id) => {
      const node = get().nodes.find((n) => n.id === id);
      if (!node) return;
      set((s) => {
        s.composer.prompt = node.prompt;
        const ns = node.settings;
        if (ns.engine) s.composer.engine = ns.engine as ComposerSettings["engine"];
        if (ns.kind) s.composer.kind = ns.kind as ComposerSettings["kind"];
        if (ns.params) s.composer.params = ns.params as Record<string, unknown>;
        s.activeComposerNodeId = id;
      });
    },

    copySelectedNodes: () => {
      const s = get();
      const ids = s.selectedIds.length ? s.selectedIds : s.selectedNodeId ? [s.selectedNodeId] : [];
      const copied = ids
        .map((id) => s.nodes.find((n) => n.id === id))
        .filter((n): n is SmartNode => Boolean(n))
        .map((n) => cloneNode(n));
      set((st) => {
        st.clipboard = copied;
      });
    },

    pasteNodes: (offsetX = 24, offsetY = 24) => {
      const clip = get().clipboard;
      if (!clip.length) return;
      get().commitHistory();
      const newIds: string[] = [];
      set((s) => {
        for (const template of clip) {
          const node = cloneNode(template, offsetX, offsetY);
          s.nodes.push(node);
          newIds.push(node.id);
        }
        s.selectedIds = newIds;
        s.selectedNodeId = newIds[newIds.length - 1] ?? null;
        s.dirty = true;
      });
    },

    disconnectBetween: (fromId, toId) => {
      get().commitHistory();
      set((s) => {
        s.connections = s.connections.filter(
          (c) => !(c.from === fromId && c.to === toId),
        );
        s.dirty = true;
      });
    },

    disconnectAllForNode: (nodeId) => {
      get().commitHistory();
      set((s) => {
        s.connections = s.connections.filter(
          (c) => c.from !== nodeId && c.to !== nodeId,
        );
        s.dirty = true;
      });
    },

    setComposer: (patch) =>
      set((s) => {
        Object.assign(s.composer, patch);
      }),

    addConnection: (conn) =>
      set((s) => {
        s.connections.push(conn);
        s.dirty = true;
      }),

    removeConnection: (id) =>
      set((s) => {
        s.connections = s.connections.filter((c) => c.id !== id);
        s.dirty = true;
      }),

    connectNodes: (fromId, toId) => {
      if (fromId === toId) return false;
      const s = get();
      const from = s.nodes.find((n) => n.id === fromId);
      const to = s.nodes.find((n) => n.id === toId);
      if (!from || !to || !canAutoConnectNodes(from, to)) return false;
      const exists = s.connections.some(
        (connection) => connection.from === fromId && connection.to === toId,
      );
      if (exists) return true;
      get().commitHistory();
      set((st) => {
        st.connections.push({
          id: crypto.randomUUID(),
          from: fromId,
          to: toId,
        });
        st.dirty = true;
      });
      return true;
    },

    arrangeNodes: () => {
      get().commitHistory();
      set((s) => {
        s.nodes = autoArrangeNodes(s.nodes);
        s.dirty = true;
      });
    },

    layoutGroup: (groupId) => {
      get().commitHistory();
      set((s) => {
        const group = s.nodes.find((n) => n.id === groupId);
        if (!group || group.kind !== "group") return;
        const members = getGroupMembers(group, s.nodes);
        const result = smartGroupLayout(group, members);
        const idx = s.nodes.findIndex((n) => n.id === groupId);
        if (idx >= 0) s.nodes[idx] = result.group;
        for (const m of result.members) {
          const mi = s.nodes.findIndex((n) => n.id === m.id);
          if (mi >= 0) s.nodes[mi] = m;
        }
        s.dirty = true;
      });
    },

    toggleGroupCollapse: (groupId) =>
      set((s) => {
        const group = s.nodes.find((n) => n.id === groupId);
        if (!group) return;
        group.collapsed = !group.collapsed;
        s.dirty = true;
      }),

    ungroupGroup: (groupId) => {
      get().commitHistory();
      set((s) => {
        const group = s.nodes.find((node) => node.id === groupId);
        if (!group || group.kind !== "group") return;
        s.nodes.forEach((node) => {
          if (node.group_id === groupId || group.member_ids?.includes(node.id)) {
            delete node.group_id;
          }
        });
        s.nodes = s.nodes.filter((node) => node.id !== groupId);
        s.connections = s.connections.filter(
          (connection) => connection.from !== groupId && connection.to !== groupId,
        );
        s.selectedIds = [];
        s.selectedNodeId = null;
        if (s.activeComposerNodeId === groupId) s.activeComposerNodeId = null;
        s.dirty = true;
      });
    },

    appendWorkflow: (importedNodes, importedConnections, target) => {
      if (!importedNodes.length) return;
      get().commitHistory();
      set((s) => {
        const source = importedNodes.map(normalizeNode);
        const ids = new Map(source.map((node) => [node.id, crypto.randomUUID()]));
        const minX = Math.min(...source.map((node) => node.x));
        const minY = Math.min(...source.map((node) => node.y));
        const maxX = Math.max(...source.map((node) => node.x + node.width));
        const maxY = Math.max(...source.map((node) => node.y + node.height));
        const offsetX = target.x - (minX + (maxX - minX) / 2);
        const offsetY = target.y - (minY + (maxY - minY) / 2);
        const appended = source.map((node) => ({
          ...node,
          id: ids.get(node.id)!,
          x: Math.round(node.x + offsetX),
          y: Math.round(node.y + offsetY),
          group_id: node.group_id ? ids.get(node.group_id) : undefined,
          member_ids: node.member_ids?.map((id) => ids.get(id)).filter((id): id is string => Boolean(id)),
        }));
        s.nodes.push(...appended);
        s.connections.push(...importedConnections.flatMap((connection) => {
          const from = ids.get(connection.from);
          const to = ids.get(connection.to);
          return from && to ? [{ ...connection, id: crypto.randomUUID(), from, to }] : [];
        }));
        s.selectedIds = appended.map((node) => node.id);
        s.selectedNodeId = appended[appended.length - 1]?.id ?? null;
        s.dirty = true;
      });
    },

    setTitle: (title) =>
      set((s) => {
        s.title = title;
        s.dirty = true;
      }),

    addLog: (entry) =>
      set((s) => {
        s.logs.unshift(entry);
        s.dirty = true;
      }),

    applyRemoteNodes: (nodes) =>
      set((s) => {
        for (const remote of nodes) {
          const local = s.nodes.find((n) => n.id === remote.id);
          if (local) {
            local.images = remote.images ?? local.images;
            local.status = remote.status ?? local.status;
          }
        }
      }),

    mergeRemoteCanvas: (payload) =>
      set((s) => {
        const merged = mergeCanvasPayload(
          {
            nodes: s.nodes,
            connections: s.connections,
            updatedAt: s.baseUpdatedAt,
          },
          payload,
        );
        s.nodes = merged.nodes;
        s.connections = merged.connections;
        if (merged.acceptedRemote) {
          s.baseUpdatedAt = payload.updatedAt;
          s.dirty = false;
        }
      }),

    markClean: (updatedAt) =>
      set((s) => {
        s.dirty = false;
        s.baseUpdatedAt = updatedAt;
      }),
  })),
);
