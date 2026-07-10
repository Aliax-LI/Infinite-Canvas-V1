import json

from fastapi import APIRouter, WebSocket, WebSocketDisconnect

from backend.services.ws_manager import manager

router = APIRouter(tags=["websocket"])


@router.websocket("/ws/stats")
async def websocket_endpoint(websocket: WebSocket, client_id: str | None = None) -> None:
    await manager.connect(websocket, client_id)
    try:
        while True:
            data = await websocket.receive_text()
            if data == "ping":
                await websocket.send_text(json.dumps({"type": "pong"}))
    except WebSocketDisconnect:
        await manager.disconnect(websocket, client_id)
    except Exception:
        await manager.disconnect(websocket, client_id)
