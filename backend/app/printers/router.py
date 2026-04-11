from fastapi import APIRouter

from .detect import detect_all
from .models import Printer

router = APIRouter(prefix="/api/printers", tags=["printers"])


@router.get("", response_model=list[Printer])
def list_printers() -> list[Printer]:
    return detect_all()
