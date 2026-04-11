from __future__ import annotations

import uuid
from pathlib import Path

from fastapi import APIRouter, File, Form, HTTPException, UploadFile
from fastapi.responses import FileResponse

from .pdf_to_ticket import (
    ConversionError,
    image_to_thermal_png,
    pdf_to_edit_png,
    pdf_to_thermal_png,
)
from .text_extract import extract_spans

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


@router.post("/pdf-edit")
async def convert_pdf_for_edit(file: UploadFile = File(...)):
    """Render a PDF as a tall grayscale PNG for the editor canvas."""
    if not file.filename or not file.filename.lower().endswith(".pdf"):
        raise HTTPException(400, "Only PDF files are accepted")

    job_id = uuid.uuid4().hex[:12]
    pdf_path = UPLOAD_DIR / f"{job_id}-src.pdf"
    png_path = UPLOAD_DIR / f"{job_id}-edit.png"
    pdf_path.write_bytes(await file.read())

    try:
        _, w, h = pdf_to_edit_png(pdf_path, png_path)
        spans = extract_spans(pdf_path, dpi=200)
    except ConversionError as e:
        raise HTTPException(500, str(e))
    except Exception as e:
        raise HTTPException(500, f"Text extraction failed: {e}")

    return {
        "edit_id": job_id,
        "image_url": f"/api/convert/edit-image/{job_id}",
        "width": w,
        "height": h,
        "spans": [s.to_dict() for s in spans],
    }


@router.get("/edit-image/{edit_id}")
def edit_image(edit_id: str):
    png_path = UPLOAD_DIR / f"{edit_id}-edit.png"
    if not png_path.exists():
        raise HTTPException(404, "Edit image not found")
    return FileResponse(png_path, media_type="image/png")


@router.post("/composite")
async def composite_to_print_job(
    file: UploadFile = File(...),
    width_dots: int = Form(512),
):
    """Accept a flattened PNG from the editor and turn it into a
    thermal-ready print job the existing /api/print endpoint can use.
    """
    job_id = uuid.uuid4().hex[:12]
    raw_path = UPLOAD_DIR / f"{job_id}-raw.png"
    png_path = UPLOAD_DIR / f"{job_id}.png"
    raw_path.write_bytes(await file.read())

    try:
        image_to_thermal_png(raw_path, png_path, width_dots=width_dots, trim=False)
    except ConversionError as e:
        raise HTTPException(500, str(e))

    return {
        "job_id": job_id,
        "preview_url": f"/api/convert/preview/{job_id}",
        "width_dots": width_dots,
    }
