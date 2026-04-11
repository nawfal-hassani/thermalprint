from pathlib import Path

from fastapi import APIRouter, HTTPException
from fastapi.responses import FileResponse
from pydantic import BaseModel

from . import store
from ..print_job.service import PrintError, print_image

router = APIRouter(prefix="/api/history", tags=["history"])


@router.get("")
def list_history():
    return [e.to_dict() for e in store.list_entries()]


@router.get("/{entry_id}/preview")
def preview(entry_id: str):
    entry = store.get(entry_id)
    if not entry or not Path(entry.image_path).exists():
        raise HTTPException(404, "Entry not found")
    return FileResponse(entry.image_path, media_type="image/png")


class ReprintRequest(BaseModel):
    printer_id: str | None = None


@router.post("/{entry_id}/reprint")
def reprint(entry_id: str, req: ReprintRequest):
    entry = store.get(entry_id)
    if not entry:
        raise HTTPException(404, "Entry not found")
    image = Path(entry.image_path)
    if not image.exists():
        raise HTTPException(410, "Stored image missing")

    target = req.printer_id or entry.printer_id
    try:
        print_image(target, image)
    except PrintError as e:
        raise HTTPException(500, str(e))
    return {"status": "sent", "entry_id": entry_id, "printer_id": target}


class RenameRequest(BaseModel):
    title: str


@router.patch("/{entry_id}")
def rename_entry(entry_id: str, req: RenameRequest):
    title = req.title.strip()
    if not title:
        raise HTTPException(400, "Title cannot be empty")
    entry = store.rename(entry_id, title)
    if entry is None:
        raise HTTPException(404, "Entry not found")
    return entry.to_dict()


@router.delete("/{entry_id}")
def delete_entry(entry_id: str):
    if not store.delete(entry_id):
        raise HTTPException(404, "Entry not found")
    return {"status": "deleted"}
