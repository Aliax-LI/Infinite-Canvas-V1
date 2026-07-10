export type WsMessage =
  | { type: "canvas_updated"; canvas_id: string; updated_at: number; client_id?: string }
  | { type: "new_image"; canvas_id: string; node_id?: string; url: string; kind?: string }
  | { type: "asset_library_updated"; library_id?: string }
  | { type: "stats"; clients: number }
  | { type: string; [key: string]: unknown };

export interface WsHandlers {
  onCanvasUpdated?: (msg: Extract<WsMessage, { type: "canvas_updated" }>) => void;
  onNewImage?: (msg: Extract<WsMessage, { type: "new_image" }>) => void;
  onAssetLibraryUpdated?: (msg: Extract<WsMessage, { type: "asset_library_updated" }>) => void;
  onOpen?: () => void;
  onClose?: () => void;
  onError?: (err: Event) => void;
}

const RECONNECT_MS = 3000;

export function wsUrl(path = "/ws/stats", clientId?: string): string {
  const proto = window.location.protocol === "https:" ? "wss:" : "ws:";
  const host = window.location.host;
  const qs = clientId ? `?client_id=${encodeURIComponent(clientId)}` : "";
  return `${proto}//${host}${path}${qs}`;
}

export function createWebSocket(
  handlers: WsHandlers,
  options?: { clientId?: string; path?: string },
): WebSocket {
  const socket = new WebSocket(wsUrl(options?.path, options?.clientId));
  let closed = false;
  let reconnectTimer: ReturnType<typeof setTimeout> | null = null;

  const bind = (sock: WebSocket) => {
    sock.addEventListener("open", () => handlers.onOpen?.());
    sock.addEventListener("close", () => {
      handlers.onClose?.();
      if (!closed) {
        reconnectTimer = setTimeout(() => {
          if (closed) return;
          const next = new WebSocket(wsUrl(options?.path, options?.clientId));
          bind(next);
        }, RECONNECT_MS);
      }
    });
    sock.addEventListener("error", (e) => handlers.onError?.(e));
    sock.addEventListener("message", (event) => {
      try {
        const msg = JSON.parse(event.data as string) as WsMessage;
        if (msg.type === "canvas_updated") handlers.onCanvasUpdated?.(msg);
        if (msg.type === "new_image") handlers.onNewImage?.(msg);
        if (msg.type === "asset_library_updated")
          handlers.onAssetLibraryUpdated?.(msg);
      } catch {
        /* ignore malformed */
      }
    });
  };

  bind(socket);

  const originalClose = socket.close.bind(socket);
  socket.close = (...args) => {
    closed = true;
    if (reconnectTimer) clearTimeout(reconnectTimer);
    originalClose(...args);
  };

  return socket;
}
