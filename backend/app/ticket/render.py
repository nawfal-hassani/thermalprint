"""Render a TicketData into a thermal-ready PNG.

We draw directly with Pillow at the target printer width so the output
goes straight into the existing print pipeline. Two font sizes are used:
a larger one for the shop name, a monospace for alignment of items and
totals (so columns line up like a cash-register receipt).
"""

from __future__ import annotations

from io import BytesIO
from pathlib import Path
from typing import Optional

from PIL import Image, ImageDraw, ImageFont

from .models import TicketData


def _load_font(size: int, mono: bool = False) -> ImageFont.ImageFont:
    """Pick the best available font on the system."""
    candidates = (
        [
            "/usr/share/fonts/truetype/dejavu/DejaVuSansMono-Bold.ttf"
            if mono
            else "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf",
            "/usr/share/fonts/truetype/dejavu/DejaVuSansMono.ttf"
            if mono
            else "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",
            "/usr/share/fonts/truetype/liberation/LiberationMono-Regular.ttf"
            if mono
            else "/usr/share/fonts/truetype/liberation/LiberationSans-Regular.ttf",
        ]
    )
    for path in candidates:
        try:
            return ImageFont.truetype(path, size)
        except OSError:
            continue
    return ImageFont.load_default()


def _text_height(draw: ImageDraw.ImageDraw, text: str, font) -> int:
    bbox = draw.textbbox((0, 0), text, font=font)
    return bbox[3] - bbox[1]


def _wrap(text: str, width_chars: int) -> list[str]:
    """Word-wrap a string to a character budget."""
    out: list[str] = []
    for line in text.splitlines() or [""]:
        while len(line) > width_chars:
            cut = line.rfind(" ", 0, width_chars)
            if cut <= 0:
                cut = width_chars
            out.append(line[:cut])
            line = line[cut:].lstrip()
        out.append(line)
    return out


def render_ticket(data: TicketData, out_path: Path) -> Path:
    width = data.width_dots
    margin = 12

    # Font sizing scales with printer width so 58mm (384) and 80mm (512)
    # both look right.
    base = max(18, width // 22)
    font_title = _load_font(base * 2, mono=False)
    font_small = _load_font(int(base * 0.85), mono=True)
    font_item = _load_font(base, mono=True)
    font_total = _load_font(int(base * 1.2), mono=True)

    # First pass on a throwaway canvas to measure height.
    tmp = Image.new("L", (width, 4000), 255)
    draw = ImageDraw.Draw(tmp)

    # Character width for the monospace columns.
    item_char_w = draw.textbbox((0, 0), "0", font=font_item)[2]
    usable = width - 2 * margin
    cols = max(16, usable // max(item_char_w, 1))

    y = margin

    # --- Header ---
    title_w = draw.textbbox((0, 0), data.shop_name, font=font_title)[2]
    draw.text(((width - title_w) // 2, y), data.shop_name, font=font_title, fill=0)
    y += _text_height(draw, data.shop_name, font_title) + 8

    for line in filter(None, [data.address, data.phone]):
        for wrapped in _wrap(line, cols):
            tw = draw.textbbox((0, 0), wrapped, font=font_small)[2]
            draw.text(((width - tw) // 2, y), wrapped, font=font_small, fill=0)
            y += _text_height(draw, wrapped, font_small) + 2
    y += 6

    draw.line((margin, y, width - margin, y), fill=0, width=2)
    y += 10

    # --- Items ---
    subtotal = 0.0
    for item in data.items:
        line_total = round(item.quantity * item.unit_price, 2)
        subtotal += line_total
        name_lines = _wrap(item.name, cols - 12)
        for idx, ln in enumerate(name_lines):
            draw.text((margin, y), ln, font=font_item, fill=0)
            y += _text_height(draw, ln, font_item) + 2

        qty_line = f"{item.quantity:g} x {item.unit_price:.2f}"
        total_str = f"{line_total:>8.2f}"
        draw.text((margin, y), qty_line, font=font_item, fill=0)
        tw = draw.textbbox((0, 0), total_str, font=font_item)[2]
        draw.text((width - margin - tw, y), total_str, font=font_item, fill=0)
        y += _text_height(draw, qty_line, font_item) + 6

    draw.line((margin, y, width - margin, y), fill=0, width=1)
    y += 8

    # --- Totals ---
    tax_amount = round(subtotal * data.tax_rate / 100.0, 2)
    total = round(subtotal + tax_amount, 2)

    def _row(label: str, value: str, font) -> int:
        nonlocal y
        draw.text((margin, y), label, font=font, fill=0)
        tw = draw.textbbox((0, 0), value, font=font)[2]
        draw.text((width - margin - tw, y), value, font=font, fill=0)
        h = _text_height(draw, label, font) + 4
        y += h
        return h

    _row("Sous-total", f"{subtotal:.2f} {data.currency}", font_item)
    if data.tax_rate:
        _row(f"TVA {data.tax_rate:.1f}%", f"{tax_amount:.2f} {data.currency}", font_item)
    y += 4
    draw.line((margin, y, width - margin, y), fill=0, width=2)
    y += 6
    _row("TOTAL", f"{total:.2f} {data.currency}", font_total)
    y += 10

    # --- QR code ---
    if data.qr_url:
        try:
            import qrcode

            qr = qrcode.QRCode(box_size=4, border=2)
            qr.add_data(data.qr_url)
            qr.make(fit=True)
            qr_img = qr.make_image(fill_color="black", back_color="white").convert("L")
            qx = (width - qr_img.width) // 2
            tmp.paste(qr_img, (qx, y))
            y += qr_img.height + 6
        except Exception:
            pass

    # --- Footer ---
    if data.footer:
        for line in _wrap(data.footer, cols):
            tw = draw.textbbox((0, 0), line, font=font_small)[2]
            draw.text(((width - tw) // 2, y), line, font=font_small, fill=0)
            y += _text_height(draw, line, font_small) + 2
    y += margin

    # --- Crop to final height ---
    final = tmp.crop((0, 0, width, y))
    final = final.convert("1", dither=Image.FLOYDSTEINBERG)
    final.save(out_path, "PNG", optimize=True)
    return out_path
