"""Flat-file print-history store.

We persist each completed print job as a JSON record under
~/.thermalprint/history/<job_id>.json plus a copy of the rendered PNG
in the same folder, so reprint works even after a server restart that
would have wiped /tmp/thermalprint.
"""

from __future__ import annotations

import json
import shutil
import time
import uuid
from dataclasses import dataclass, asdict
from pathlib import Path
from typing import Optional

HISTORY_DIR = Path.home() / ".thermalprint" / "history"
HISTORY_DIR.mkdir(parents=True, exist_ok=True)


@dataclass
class HistoryEntry:
    id: str
    source: str          # 'pdf' | 'ticket'
    title: str
    printer_id: str
    printer_name: str
    width_dots: int
    created_at: float
    image_path: str

    def to_dict(self) -> dict:
        return asdict(self)


def _path(entry_id: str) -> Path:
    return HISTORY_DIR / f"{entry_id}.json"


def save(
    source: str,
    title: str,
    printer_id: str,
    printer_name: str,
    width_dots: int,
    image_path: Path,
) -> HistoryEntry:
    entry_id = uuid.uuid4().hex[:12]
    stored_image = HISTORY_DIR / f"{entry_id}.png"
    shutil.copy2(image_path, stored_image)

    entry = HistoryEntry(
        id=entry_id,
        source=source,
        title=title,
        printer_id=printer_id,
        printer_name=printer_name,
        width_dots=width_dots,
        created_at=time.time(),
        image_path=str(stored_image),
    )
    _path(entry_id).write_text(json.dumps(entry.to_dict(), indent=2))
    return entry


def list_entries(limit: int = 100) -> list[HistoryEntry]:
    entries: list[HistoryEntry] = []
    for path in sorted(HISTORY_DIR.glob("*.json"), reverse=True):
        try:
            entries.append(HistoryEntry(**json.loads(path.read_text())))
        except Exception:
            continue
        if len(entries) >= limit:
            break
    return sorted(entries, key=lambda e: e.created_at, reverse=True)


def get(entry_id: str) -> Optional[HistoryEntry]:
    path = _path(entry_id)
    if not path.exists():
        return None
    try:
        return HistoryEntry(**json.loads(path.read_text()))
    except Exception:
        return None


def rename(entry_id: str, title: str) -> Optional[HistoryEntry]:
    path = _path(entry_id)
    if not path.exists():
        return None
    try:
        data = json.loads(path.read_text())
    except Exception:
        return None
    data["title"] = title
    path.write_text(json.dumps(data, indent=2))
    return HistoryEntry(**data)


def delete(entry_id: str) -> bool:
    path = _path(entry_id)
    if not path.exists():
        return False
    try:
        entry = HistoryEntry(**json.loads(path.read_text()))
        Path(entry.image_path).unlink(missing_ok=True)
    except Exception:
        pass
    path.unlink(missing_ok=True)
    return True
