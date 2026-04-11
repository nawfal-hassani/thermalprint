from pathlib import Path
import uuid

from fastapi import APIRouter

from .models import TicketData
from .render import render_ticket

router = APIRouter(prefix="/api/ticket", tags=["ticket"])

UPLOAD_DIR = Path("/tmp/thermalprint")
UPLOAD_DIR.mkdir(parents=True, exist_ok=True)


@router.post("/render")
def render(data: TicketData):
    job_id = uuid.uuid4().hex[:12]
    out_path = UPLOAD_DIR / f"{job_id}.png"
    render_ticket(data, out_path)
    return {
        "job_id": job_id,
        "preview_url": f"/api/convert/preview/{job_id}",
        "width_dots": data.width_dots,
    }
