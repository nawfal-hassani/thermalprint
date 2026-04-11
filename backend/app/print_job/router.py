from pathlib import Path

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from ..history import store as history_store
from ..printers.detect import detect_all
from .service import PrintError, print_image

router = APIRouter(prefix="/api/print", tags=["print"])

UPLOAD_DIR = Path("/tmp/thermalprint")


class PrintRequest(BaseModel):
    printer_id: str
    job_id: str
    cut: bool = True
    title: str | None = None
    source: str = "pdf"  # 'pdf' | 'ticket'


@router.post("")
def print_job(req: PrintRequest):
    image_path = UPLOAD_DIR / f"{req.job_id}.png"
    if not image_path.exists():
        raise HTTPException(404, f"Job '{req.job_id}' not found")

    try:
        print_image(req.printer_id, image_path, cut=req.cut)
    except PrintError as e:
        raise HTTPException(500, str(e))

    # Persist to history so the user can reprint later.
    printer = next(
        (p for p in detect_all(scan_network=req.printer_id.startswith("net:"))
         if p.id == req.printer_id),
        None,
    )
    entry = history_store.save(
        source=req.source,
        title=req.title or f"{req.source.capitalize()} ticket",
        printer_id=req.printer_id,
        printer_name=printer.name if printer else req.printer_id,
        width_dots=printer.width_dots if printer else 512,
        image_path=image_path,
    )

    return {
        "status": "sent",
        "job_id": req.job_id,
        "printer_id": req.printer_id,
        "history_id": entry.id,
    }
