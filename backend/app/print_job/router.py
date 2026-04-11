from pathlib import Path

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from .service import PrintError, print_image

router = APIRouter(prefix="/api/print", tags=["print"])

UPLOAD_DIR = Path("/tmp/thermalprint")


class PrintRequest(BaseModel):
    printer_id: str
    job_id: str
    cut: bool = True


@router.post("")
def print_job(req: PrintRequest):
    image_path = UPLOAD_DIR / f"{req.job_id}.png"
    if not image_path.exists():
        raise HTTPException(404, f"Job '{req.job_id}' not found")

    try:
        print_image(req.printer_id, image_path, cut=req.cut)
    except PrintError as e:
        raise HTTPException(500, str(e))

    return {"status": "sent", "job_id": req.job_id, "printer_id": req.printer_id}
