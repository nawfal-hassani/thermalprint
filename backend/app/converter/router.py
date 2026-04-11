from __future__ import annotations

import uuid
from pathlib import Path

from fastapi import APIRouter, File, Form, HTTPException, UploadFile
from fastapi.responses import FileResponse

from .pdf_to_ticket import ConversionError, pdf_to_thermal_png

router = APIRouter(prefix="/api/convert", tags=["convert"])

UPLOAD_DIR = Path("/tmp/thermalprint")
UPLOAD_DIR.mkdir(parents=True, exist_ok=True)


@router.post("/pdf")
async def convert_pdf(
    file: UploadFile = File(...),
    width_dots: int = Form(512),
    trim: bool = Form(True),
):
    if not file.filename or not file.filename.lower().endswith(".pdf"):
        raise HTTPException(400, "Only PDF files are accepted")

    job_id = uuid.uuid4().hex[:12]
    pdf_path = UPLOAD_DIR / f"{job_id}.pdf"
    png_path = UPLOAD_DIR / f"{job_id}.png"

    pdf_path.write_bytes(await file.read())

    try:
        pdf_to_thermal_png(pdf_path, png_path, width_dots=width_dots, trim=trim)
    except ConversionError as e:
        raise HTTPException(500, str(e))

    return {
        "job_id": job_id,
        "preview_url": f"/api/convert/preview/{job_id}",
        "width_dots": width_dots,
    }


@router.get("/preview/{job_id}")
def preview(job_id: str):
    png_path = UPLOAD_DIR / f"{job_id}.png"
    if not png_path.exists():
        raise HTTPException(404, "Preview not found")
    return FileResponse(png_path, media_type="image/png")
