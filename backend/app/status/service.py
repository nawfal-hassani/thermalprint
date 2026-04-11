"""Query real-time status from an ESC/POS printer.

ESC/POS defines a set of "Real-time status transmission" commands
DLE EOT n (0x10 0x04 n) where:
  n=1  Printer status      bit 3: online(0)/offline(1), bit 5: drawer
  n=2  Offline cause       bit 2: cover open, bit 3: paper feed, bit 5: err, bit 6: auto recoverable err
  n=3  Error cause         bit 2: auto-cutter error, bit 5: unrecoverable, bit 6: auto-recoverable
  n=4  Paper sensor        bit 2+3: roll end sensor, bit 5+6: paper-near-end

Each returns a single byte where bit 4 is always 0 (framing) and
bits 0/1 are fixed at 0/1. We decode only the bits we care about.
"""

from __future__ import annotations

from dataclasses import dataclass, asdict
from typing import Optional

from ..printers.detect import detect_all
from ..printers.models import Printer


@dataclass
class PrinterStatus:
    printer_id: str
    online: bool
    cover_open: bool
    paper_ok: bool
    paper_near_end: bool
    paper_empty: bool
    error: bool
    cutter_error: bool
    reachable: bool
    message: Optional[str] = None

    def to_dict(self) -> dict:
        return asdict(self)

    @classmethod
    def unreachable(cls, printer_id: str, message: str) -> "PrinterStatus":
        return cls(
            printer_id=printer_id,
            online=False,
            cover_open=False,
            paper_ok=False,
            paper_near_end=False,
            paper_empty=False,
            error=True,
            cutter_error=False,
            reachable=False,
            message=message,
        )


def _read_status_usb(device_path: str) -> PrinterStatus:
    """Send DLE EOT n over a bidirectional USB printer device."""
    import os

    try:
        fd = os.open(device_path, os.O_RDWR | os.O_NONBLOCK)
    except OSError as e:
        return PrinterStatus.unreachable("", f"open failed: {e}")

    def query(n: int) -> Optional[int]:
        try:
            os.write(fd, bytes([0x10, 0x04, n]))
        except OSError:
            return None
        # Small blocking-ish read with retries.
        import select

        r, _, _ = select.select([fd], [], [], 0.5)
        if not r:
            return None
        try:
            data = os.read(fd, 1)
            return data[0] if data else None
        except OSError:
            return None

    try:
        s1 = query(1)
        s2 = query(2)
        s3 = query(3)
        s4 = query(4)
    finally:
        os.close(fd)

    if s1 is None:
        return PrinterStatus.unreachable("", "no status response")

    online = not bool(s1 & 0b0000_1000)  # bit 3: 1 = offline
    cover_open = bool((s2 or 0) & 0b0000_0100)
    error = bool((s2 or 0) & 0b0010_0000)
    cutter_error = bool((s3 or 0) & 0b0000_1000)
    paper_near_end = bool((s4 or 0) & 0b0000_1100)
    paper_empty = bool((s4 or 0) & 0b0110_0000)
    paper_ok = not paper_empty

    return PrinterStatus(
        printer_id="",
        online=online,
        cover_open=cover_open,
        paper_ok=paper_ok,
        paper_near_end=paper_near_end,
        paper_empty=paper_empty,
        error=error,
        cutter_error=cutter_error,
        reachable=True,
    )


def get_status(printer_id: str) -> PrinterStatus:
    printer: Optional[Printer] = None
    for p in detect_all():
        if p.id == printer_id:
            printer = p
            break
    if printer is None:
        return PrinterStatus.unreachable(printer_id, "printer not found")

    if printer.connection == "usb":
        st = _read_status_usb(printer.device_path)
        st.printer_id = printer_id
        return st

    # Network/serial status isn't implemented yet; report reachable but
    # without detailed flags so the UI can still show "online".
    return PrinterStatus(
        printer_id=printer_id,
        online=printer.online,
        cover_open=False,
        paper_ok=True,
        paper_near_end=False,
        paper_empty=False,
        error=False,
        cutter_error=False,
        reachable=printer.online,
        message="status probing not implemented for this connection",
    )
