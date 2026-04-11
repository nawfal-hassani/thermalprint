"""Printer detection.

Currently supports USB printers exposed by the Linux `usblp` kernel driver
(they show up as /dev/usb/lp*). For each device we read the IEEE 1284
device ID string from sysfs to extract manufacturer, model, and command
set, which lets us pick a sensible print width without the user guessing.
"""

from __future__ import annotations

import glob
import os
import re
from typing import Optional

from .models import Printer


# Widths (in dots) for the most common 80mm and 58mm thermal heads.
# When the IEEE1284 string doesn't tell us, we default to 512 which is
# safe for virtually every 80mm printer.
WIDTH_80MM = 512
WIDTH_58MM = 384


def _read_ieee1284_id(lp_name: str) -> Optional[str]:
    """Read the IEEE 1284 ID string for a /dev/usb/lpX device.

    On modern kernels usblp devices live under /sys/class/usbmisc/lpN/,
    and the id is on the parent USB interface (device/).
    """
    for candidate in (
        f"/sys/class/usbmisc/{lp_name}/device/ieee1284_id",
        f"/sys/class/usb/{lp_name}/device/ieee1284_id",
    ):
        try:
            with open(candidate, "r", encoding="utf-8", errors="replace") as f:
                return f.read().strip()
        except OSError:
            continue
    return None


def _parse_ieee1284(raw: str) -> dict:
    """Parse 'MFG:Epson;MDL:TM-T88;CMD:ESCPOS;' into a dict."""
    out: dict = {}
    for part in raw.split(";"):
        if ":" not in part:
            continue
        key, _, value = part.partition(":")
        out[key.strip().upper()] = value.strip()
    return out


def _guess_width(model: Optional[str]) -> int:
    if not model:
        return WIDTH_80MM
    m = model.lower()
    if "58" in m or "t20" in m:
        return WIDTH_58MM
    return WIDTH_80MM


def detect_usb_printers() -> list[Printer]:
    printers: list[Printer] = []
    for path in sorted(glob.glob("/dev/usb/lp*")):
        lp_name = os.path.basename(path)
        raw = _read_ieee1284_id(lp_name)
        fields = _parse_ieee1284(raw) if raw else {}

        vendor = fields.get("MFG") or fields.get("MANUFACTURER")
        model = fields.get("MDL") or fields.get("MODEL")

        # Fall back to a friendly name if we got nothing.
        name_parts = [p for p in (vendor, model) if p]
        name = " ".join(name_parts) if name_parts else f"USB Printer ({lp_name})"

        printers.append(
            Printer(
                id=f"usb:{lp_name}",
                name=name,
                vendor=vendor,
                model=model,
                connection="usb",
                device_path=path,
                width_dots=_guess_width(model),
                online=os.access(path, os.W_OK) or os.path.exists(path),
                raw_id=raw,
            )
        )
    return printers


def detect_all() -> list[Printer]:
    """Detect every printer we can see. Network + serial come later."""
    return detect_usb_printers()
