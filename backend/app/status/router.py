import asyncio
import json

from fastapi import APIRouter, WebSocket, WebSocketDisconnect

from .service import get_status

router = APIRouter(prefix="/api/status", tags=["status"])


@router.get("/{printer_id:path}")
def status_once(printer_id: str):
    return get_status(printer_id).to_dict()


@router.websocket("/ws/{printer_id:path}")
async def status_ws(ws: WebSocket, printer_id: str):
    await ws.accept()
    try:
        while True:
            # Offload the blocking I/O to a thread so the event loop
            # stays responsive for other clients.
            status = await asyncio.to_thread(get_status, printer_id)
            await ws.send_text(json.dumps(status.to_dict()))
            await asyncio.sleep(2)
    except WebSocketDisconnect:
        return
    except Exception as e:
        try:
            await ws.send_text(json.dumps({"error": str(e)}))
            await ws.close()
        except Exception:
            pass
