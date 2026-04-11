"""Send a rendered PNG to a detected printer via python-escpos."""

from __future__ import annotations

from pathlib import Path

from escpos.printer import File as EscposFile
from escpos.printer import Network as EscposNetwork
from escpos.printer import Serial as EscposSerial

from ..printers.detect import detect_all
from ..printers.models import Printer


class PrintError(RuntimeError):
    pass


def _find_printer(printer_id: str) -> Printer:
    # Include network in the search so /api/print can target previously
    # scanned network printers too.
    for p in detect_all(scan_network=printer_id.startswith("net:")):
        if p.id == printer_id:
            return p
    raise PrintError(f"Printer '{printer_id}' not found")


def _open(printer: Printer):
    if printer.connection == "usb":
        return EscposFile(printer.device_path)
    if printer.connection == "network":
        host, _, port = printer.device_path.partition(":")
        return EscposNetwork(host, port=int(port or 9100), timeout=5)
    if printer.connection == "serial":
        return EscposSerial(devfile=printer.device_path, baudrate=9600, timeout=2)
    raise PrintError(f"Unsupported connection: {printer.connection}")


def print_image(printer_id: str, image_path: Path, cut: bool = True) -> None:
    printer = _find_printer(printer_id)

    try:
        p = _open(printer)
    except Exception as e:
        raise PrintError(
            f"Could not open {printer.device_path}: {e}. "
            "Check permissions (USB: 'lp' group) or network reachability."
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
