import type { CanvasRecord } from "../../types/api";

export const CANVAS_LIST_PROJECT_KEY = "canvasListCurrentProjectId";

export interface CanvasListState {
  currentProjectId: string;
  canvases: CanvasRecord[];
  deletedCanvases: CanvasRecord[];
}

export function filterCanvasesByProject(
  canvases: CanvasRecord[],
  projectId: string,
): CanvasRecord[] {
  return canvases.filter(
    (c) => (c.project || "default") === projectId && !c.deleted_at,
  );
}

export function canvasListReducer(
  state: CanvasListState,
  action:
    | { type: "set_project"; projectId: string }
    | { type: "set_canvases"; canvases: CanvasRecord[] }
    | { type: "set_deleted"; deleted: CanvasRecord[] }
    | { type: "add_canvas"; canvas: CanvasRecord }
    | { type: "remove_canvas"; id: string }
    | { type: "restore_canvas"; canvas: CanvasRecord },
): CanvasListState {
  switch (action.type) {
    case "set_project":
      return { ...state, currentProjectId: action.projectId };
    case "set_canvases":
      return { ...state, canvases: action.canvases };
    case "set_deleted":
      return { ...state, deletedCanvases: action.deleted };
    case "add_canvas":
      return { ...state, canvases: [...state.canvases, action.canvas] };
    case "remove_canvas":
      return {
        ...state,
        canvases: state.canvases.filter((c) => c.id !== action.id),
      };
    case "restore_canvas":
      return {
        ...state,
        deletedCanvases: state.deletedCanvases.filter(
          (c) => c.id !== action.canvas.id,
        ),
        canvases: [...state.canvases, action.canvas],
      };
    default:
      return state;
  }
}

export function rememberedProjectId(): string {
  try {
    return localStorage.getItem(CANVAS_LIST_PROJECT_KEY) || "default";
  } catch {
    return "default";
  }
}

export function rememberProjectId(pid: string) {
  try {
    localStorage.setItem(CANVAS_LIST_PROJECT_KEY, pid);
  } catch {
    /* ignore */
  }
}
