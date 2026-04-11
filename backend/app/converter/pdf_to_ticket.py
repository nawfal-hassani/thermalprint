"""Convert a PDF into a monochrome PNG sized for a thermal printer.

Pipeline:
  1. Render the PDF at 203 dpi via pdftoppm (matches thermal head density).
  2. Trim surrounding whitespace so A4 invoices don't shrink to a postage
     stamp on an 80mm ticket.
  3. Resize to the printer's head width (e.g. 512 dots for 80mm).
  4. Convert to grayscale + Floyd-Steinberg dithered 1-bit for crisp text.
"""

from __future__ import annotations

import shutil
import subprocess
import tempfile
import uuid
from pathlib import Path
from typing import Optional

from PIL import Image


class ConversionError(RuntimeError):
    pass


def _require_tool(name: str) -> str:
    path = shutil.which(name)
    if not path:
        raise ConversionError(
            f"Required tool '{name}' is not installed. "
            "Install poppler-utils (pdftoppm) and imagemagick."
        )
    return path


def render_pdf_pages(pdf_path: Path, out_dir: Path, dpi: int = 203) -> list[Path]:
    """Render every page of a PDF to PNG using pdftoppm."""
    _require_tool("pdftoppm")
    prefix = out_dir / "page"
    subprocess.run(
        [
            "pdftoppm",
            "-r", str(dpi),
            "-png",
            str(pdf_path),
            str(prefix),
        ],
        check=True,
        capture_output=True,
    )
    pages = sorted(out_dir.glob("page-*.png"))
    if not pages:
        raise ConversionError("pdftoppm produced no output")
    return pages


def stitch_pages(pages: list[Path], out_path: Path, gap: int = 0) -> Path:
    """Stack multiple rendered pages vertically into one image."""
    imgs = [Image.open(p).convert("L") for p in pages]
    # All pages from the same PDF share the same width at a fixed DPI.
    width = max(img.width for img in imgs)
    total_height = sum(img.height for img in imgs) + gap * max(0, len(imgs) - 1)

    canvas = Image.new("L", (width, total_height), 255)
    y = 0
    for idx, img in enumerate(imgs):
        # Center narrower pages (rare, but possible with mixed sizes).
        x = (width - img.width) // 2
        canvas.paste(img, (x, y))
        y += img.height + (gap if idx < len(imgs) - 1 else 0)

    canvas.save(out_path, "PNG")
    return out_path


def trim_and_resize(
    src: Path,
    dst: Path,
    width_dots: int,
    trim: bool = True,
) -> None:
    """Crop whitespace, resize to width_dots, output 1-bit PNG."""
    img = Image.open(src).convert("L")

    if trim:
        # Manual trim: find bounding box of non-white pixels (threshold 245).
        bw = img.point(lambda p: 0 if p < 245 else 255, mode="L")
        bbox = bw.point(lambda p: 255 - p, mode="L").getbbox()
        if bbox:
            pad = 10
            left = max(0, bbox[0] - pad)
            top = max(0, bbox[1] - pad)
            right = min(img.width, bbox[2] + pad)
            bottom = min(img.height, bbox[3] + pad)
            img = img.crop((left, top, right, bottom))

    if img.width != width_dots:
        ratio = width_dots / img.width
        new_height = int(img.height * ratio)
        img = img.resize((width_dots, new_height), Image.LANCZOS)

    # 1-bit with Floyd-Steinberg dithering for sharp thermal output.
    img = img.convert("1", dither=Image.FLOYDSTEINBERG)
    img.save(dst, "PNG", optimize=True)


def pdf_to_thermal_png(
    pdf_path: Path,
    out_path: Path,
    width_dots: int = 512,
    trim: bool = True,
) -> Path:
    """High-level entry point: PDF → thermal-ready PNG on disk.

    Every page of the PDF is rendered and stacked vertically so a
    multi-page invoice prints as one continuous receipt.
    """
    with tempfile.TemporaryDirectory(prefix="thermalprint-") as tmp:
        tmp_dir = Path(tmp)
        pages = render_pdf_pages(pdf_path, tmp_dir)
        stitched = tmp_dir / "stitched.png"
        stitch_pages(pages, stitched)
        trim_and_resize(stitched, out_path, width_dots=width_dots, trim=trim)
    return out_path


def pdf_to_edit_png(pdf_path: Path, out_path: Path, dpi: int = 300) -> tuple[Path, int, int]:
    """Render a PDF as one tall grayscale PNG for the web editor.

    No trimming, no dithering: the frontend needs crisp pixels to
    render on a canvas and overlay annotations before we send the
    composite through the print pipeline.
    """
    with tempfile.TemporaryDirectory(prefix="thermalprint-") as tmp:
        tmp_dir = Path(tmp)
        pages = render_pdf_pages(pdf_path, tmp_dir, dpi=dpi)
        stitch_pages(pages, out_path)

    img = Image.open(out_path).convert("L")
    img.save(out_path, "PNG")
    return out_path, img.width, img.height


def image_to_thermal_png(
    src: Path,
    dst: Path,
    width_dots: int = 512,
    trim: bool = False,
) -> Path:
    """Take an arbitrary PNG (e.g. a composite from the editor) and
    produce a thermal-ready 1-bit PNG."""
    trim_and_resize(src, dst, width_dots=width_dots, trim=trim)
    return dst
