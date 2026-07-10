/** Minimal OpenAPI-derived types for Phase 2. Regenerate via scripts/generate-openapi-types.ts */

export interface CanvasRecord {
  id: string;
  title: string;
  icon: string;
  kind: "smart" | "classic" | string;
  project?: string;
  board_x?: number;
  board_y?: number;
  updated_at?: number;
  created_at?: number;
  deleted_at?: number;
  owner?: string;
  color?: string;
  pinned?: boolean;
}

export interface CanvasDoc extends CanvasRecord {
  nodes: SmartNode[];
  connections: CanvasConnection[];
  viewport: ViewportState;
  logs?: LogEntry[];
  settings?: Record<string, unknown>;
}

export interface SmartNode {
  id: string;
  kind: string;
  x: number;
  y: number;
  width?: number;
  height?: number;
  title?: string;
  prompt?: string;
  images?: NodeImage[];
  settings?: Record<string, unknown>;
  group_id?: string;
  status?: string;
}

export interface NodeImage {
  url: string;
  kind?: string;
  name?: string;
}

export interface CanvasConnection {
  id?: string;
  from: string;
  to: string;
  fromPort?: string;
  toPort?: string;
}

export interface ViewportState {
  x: number;
  y: number;
  scale: number;
}

export interface LogEntry {
  id?: string;
  ts?: number;
  prompt?: string;
  kind?: string;
  url?: string;
  engine?: string;
}

export interface ProjectRecord {
  id: string;
  name: string;
  order?: number;
}

export interface AppInfo {
  version: string;
  desktop_build_id?: string;
  is_electron?: boolean;
  repo_url?: string;
  release_url?: string;
}

export interface PromptTemplate {
  id: string;
  title: string;
  content: string;
  tags?: string[];
}

export interface RunningHubWorkflow {
  id: string;
  name: string;
  description?: string;
}

export interface ImageParamField {
  key: string;
  label?: string;
  type?: string;
  required?: boolean;
  options?: Array<{ value: string; label: string }>;
}
