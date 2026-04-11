"""Extract editable text spans from a PDF using PyMuPDF.

For each text span we return its bounding box in pixel coordinates
matching a given render DPI, so the frontend can overlay an <input>
at the same position as the original glyphs on the rendered image.
Spans are stitched across pages by shifting Y by the accumulated
page height (same ordering as stitch_pages in pdf_to_ticket).
"""

from __future__ import annotations

from dataclasses import dataclass, asdict
from pathlib import Path
from typing import Any

import fitz  # PyMuPDF


@dataclass
class TextSpan:
    id: str
    x: float        # pixel coordinates at the render DPI
    y: float
    width: float
    height: float
    text: str
    font_size: float  # in pixels at render DPI
    bold: bool

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)


def extract_spans(pdf_path: Path, dpi: int = 150) -> list[TextSpan]:
    """Return every text span in reading order, positioned in pixels
    of the stitched render (page 2 is offset by page 1's height, etc.).
    """
    scale = dpi / 72.0
    spans: list[TextSpan] = []
    y_offset_px = 0.0

    with fitz.open(pdf_path) as doc:
        for page_index, page in enumerate(doc):
            # Page pixel height for the Y offset of subsequent pages.
            page_height_px = page.rect.height * scale

            raw = page.get_text("dict")
            for block in raw.get("blocks", []):
                if block.get("type") != 0:  # 0 = text, 1 = image
                    continue
                for line in block.get("lines", []):
                    for span in line.get("spans", []):
                        text = span.get("text", "")
                        if not text.strip():
                            continue
                        bbox = span.get("bbox", [0, 0, 0, 0])
                        x0, y0, x1, y1 = bbox
                        font_name = span.get("font", "") or ""
                        is_bold = "bold" in font_name.lower()
                        font_size = float(span.get("size", 10)) * scale

                        spans.append(
                            TextSpan(
                                id=f"p{page_index}-{len(spans)}",
                                x=x0 * scale,
                                y=y0 * scale + y_offset_px,
                                width=(x1 - x0) * scale,
                                height=(y1 - y0) * scale,
                                text=text,
                                font_size=font_size,
                                bold=is_bold,
                            )
                        )

            y_offset_px += page_height_px

    return spans
