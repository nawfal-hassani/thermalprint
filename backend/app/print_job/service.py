"""Send a rendered PNG to a detected printer via python-escpos."""

from __future__ import annotations

from pathlib import Path

from escpos.printer import File as EscposFile

from ..printers.detect import detect_all
from ..printers.models import Printer


class PrintError(RuntimeError):
    pass


def _find_printer(printer_id: str) -> Printer:
    for p in detect_all():
        if p.id == printer_id:
            return p
    raise PrintError(f"Printer '{printer_id}' not found")


def print_image(printer_id: str, image_path: Path, cut: bool = True) -> None:
    printer = _find_printer(printer_id)

    if printer.connection != "usb":
        raise PrintError(
            f"Connection '{printer.connection}' not supported yet"
        )

    try:
        p = EscposFile(printer.device_path)
    except Exception as e:
        raise PrintError(
            f"Could not open {printer.device_path}: {e}. "
            "Check that you are in the 'lp' group."
        ) from e

    try:
        p.image(str(image_path))
        p.text("\n\n")
        if cut:
            p.cut()
    finally:
        try:
            p.close()
        except Exception:
            pass
