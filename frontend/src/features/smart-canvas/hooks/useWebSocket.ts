import { useEffect, useRef, useState } from "react";
import { createWebSocket } from "../core/websocket";
import { getClientId } from "../../../shared/utils";

export function useWebSocket(
  canvasId: string,
  handlers: {
    onCanvasUpdated?: (updatedAt: number, clientId?: string) => void;
    onNewImage?: (url: string, nodeId?: string) => void;
    onAssetLibraryUpdated?: () => void;
  },
) {
  const [connected, setConnected] = useState(false);
  const socketRef = useRef<WebSocket | null>(null);
  const handlersRef = useRef(handlers);
  handlersRef.current = handlers;

  useEffect(() => {
    const clientId = getClientId();
    const socket = createWebSocket(
      {
        onOpen: () => setConnected(true),
        onClose: () => setConnected(false),
        onCanvasUpdated: (msg) => {
          if (msg.canvas_id !== canvasId) return;
          if (msg.client_id && msg.client_id === clientId) return;
          handlersRef.current.onCanvasUpdated?.(msg.updated_at, msg.client_id);
        },
        onNewImage: (msg) => {
          if (msg.canvas_id !== canvasId) return;
          handlersRef.current.onNewImage?.(msg.url, msg.node_id);
        },
        onAssetLibraryUpdated: () => {
          handlersRef.current.onAssetLibraryUpdated?.();
        },
      },
      { clientId },
    );
    socketRef.current = socket;
    return () => {
      socket.close();
      socketRef.current = null;
    };
  }, [canvasId]);

  return { connected, clientId: getClientId() };
}
