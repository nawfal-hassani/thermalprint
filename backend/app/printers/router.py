from fastapi import APIRouter, Query

from .detect import detect_all, detect_network_printers
from .models import Printer

router = APIRouter(prefix="/api/printers", tags=["printers"])


@router.get("", response_model=list[Printer])
def list_printers(
    scan_network: bool = Query(False, description="Also scan the local subnet"),
) -> list[Printer]:
    return detect_all(scan_network=scan_network)


@router.post("/scan-network", response_model=list[Printer])
def scan_network(subnet: str | None = None) -> list[Printer]:
    """Explicit subnet scan. Slow (~1s) — trigger from a UI button."""
    return detect_network_printers(subnet=subnet)
