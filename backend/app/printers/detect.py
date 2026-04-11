"""Printer detection.

Currently supports USB printers exposed by the Linux `usblp` kernel driver
(they show up as /dev/usb/lp*). For each device we read the IEEE 1284
device ID string from sysfs to extract manufacturer, model, and command
set, which lets us pick a sensible print width without the user guessing.
"""

from __future__ import annotations

import concurrent.futures
import glob
import ipaddress
import os
import re
import socket
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


def detect_serial_printers() -> list[Printer]:
    """Any /dev/ttyUSB* or /dev/ttyACM* is a candidate serial printer.

    We can't know for sure it's an ESC/POS device without probing, and
    probing blindly can confuse non-printer devices. For now we expose
    the candidates so the user can pick; the print step will send the
    ESC/POS bytes and fail loudly if it's the wrong device.
    """
    printers: list[Printer] = []
    for path in sorted(glob.glob("/dev/ttyUSB*") + glob.glob("/dev/ttyACM*")):
        name = f"Serial device ({os.path.basename(path)})"
        printers.append(
            Printer(
                id=f"serial:{os.path.basename(path)}",
                name=name,
                vendor=None,
                model=None,
                connection="serial",
                device_path=path,
                width_dots=WIDTH_80MM,
                online=os.path.exists(path),
            )
        )
    return printers


def _probe_raw_port(host: str, port: int = 9100, timeout: float = 0.4) -> bool:
    try:
        with socket.create_connection((host, port), timeout=timeout):
            return True
    except (OSError, socket.timeout):
        return False


def _local_subnet() -> Optional[ipaddress.IPv4Network]:
    """Best-effort: guess the primary /24 subnet of this host."""
    try:
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        s.connect(("8.8.8.8", 80))
        ip = s.getsockname()[0]
        s.close()
        return ipaddress.ip_network(f"{ip}/24", strict=False)
    except OSError:
        return None


def detect_network_printers(
    subnet: Optional[str] = None,
    port: int = 9100,
) -> list[Printer]:
    """Scan a subnet for raw-print (JetDirect/port 9100) listeners.

    This is opt-in because it walks 254 hosts. The default subnet is
    derived from the machine's primary interface. Callers can override
    with an explicit CIDR like '192.168.1.0/24'.
    """
    net = (
        ipaddress.ip_network(subnet, strict=False)
        if subnet
        else _local_subnet()
    )
    if net is None:
        return []

    hosts = [str(h) for h in net.hosts()]
    found: list[Printer] = []

    with concurrent.futures.ThreadPoolExecutor(max_workers=64) as ex:
        futures = {ex.submit(_probe_raw_port, h, port): h for h in hosts}
        for fut in concurrent.futures.as_completed(futures):
            host = futures[fut]
            try:
                if fut.result():
                    found.append(
                        Printer(
                            id=f"net:{host}:{port}",
                            name=f"Network printer ({host})",
                            vendor=None,
                            model=None,
                            connection="network",
                            device_path=f"{host}:{port}",
                            width_dots=WIDTH_80MM,
                            online=True,
                        )
                    )
            except Exception:
                continue

    return sorted(found, key=lambda p: p.device_path)


def detect_all(scan_network: bool = False) -> list[Printer]:
    """Detect every printer we can see.

    Network scanning is gated behind a flag because it's slow (~1s) and
    not always desired. The printers router exposes this toggle as a
    query parameter so the UI can offer an explicit 'Scan network' action.
    """
    printers = detect_usb_printers() + detect_serial_printers()
    if scan_network:
        printers += detect_network_printers()
    return printers
