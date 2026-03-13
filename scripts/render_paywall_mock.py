from __future__ import annotations

import math
from pathlib import Path

from PIL import Image, ImageDraw, ImageFilter, ImageFont


WIDTH = 1290
HEIGHT = 2796
OUTPUT_PATH = Path(__file__).resolve().parents[1] / "output" / "app-store" / "paywall-submission-1290x2796.png"
ICON_PATH = Path(__file__).resolve().parents[1] / "assets" / "icon.png"

PALETTE = {
    "background": "#F5EFE3",
    "card": "#FFFCF6",
    "card_muted": "#F0F6EA",
    "primary": "#1F5C4B",
    "primary_dark": "#174538",
    "sage": "#A5B990",
    "sage_soft": "#DDE7D5",
    "text": "#20251F",
    "text_muted": "#667364",
    "border": "#D9D6CE",
    "divider": "#E7E1D6",
    "accent": "#E8C768",
    "accent_soft": "#F5EED7",
    "white": "#FFFFFF",
}


def hex_color(value: str) -> tuple[int, int, int]:
    value = value.lstrip("#")
    return tuple(int(value[index : index + 2], 16) for index in (0, 2, 4))


def load_font(path: str, size: int) -> ImageFont.FreeTypeFont:
    return ImageFont.truetype(path, size=size)


DISPLAY_FONT = "/System/Library/Fonts/NewYork.ttf"
BODY_FONT = "/System/Library/Fonts/HelveticaNeue.ttc"


def make_canvas() -> Image.Image:
    base = Image.new("RGBA", (WIDTH, HEIGHT), hex_color(PALETTE["background"]) + (255,))
    glow = Image.new("RGBA", (WIDTH, HEIGHT), (0, 0, 0, 0))
    glow_draw = ImageDraw.Draw(glow)

    for bbox, color, alpha in (
        ((-180, 80, 660, 900), PALETTE["sage_soft"], 255),
        ((760, -120, 1440, 620), PALETTE["accent_soft"], 240),
        ((860, 1700, 1500, 2480), PALETTE["sage_soft"], 225),
    ):
        glow_draw.ellipse(bbox, fill=hex_color(color) + (alpha,))

    glow = glow.filter(ImageFilter.GaussianBlur(70))
    base.alpha_composite(glow)
    return base


def draw_shadow(canvas: Image.Image, box: tuple[int, int, int, int], radius: int, blur: int = 30, alpha: int = 28) -> None:
    shadow = Image.new("RGBA", canvas.size, (0, 0, 0, 0))
    shadow_draw = ImageDraw.Draw(shadow)
    x1, y1, x2, y2 = box
    shadow_draw.rounded_rectangle((x1, y1 + 18, x2, y2 + 18), radius=radius, fill=(20, 33, 26, alpha))
    shadow = shadow.filter(ImageFilter.GaussianBlur(blur))
    canvas.alpha_composite(shadow)


def rounded_card(canvas: Image.Image, box: tuple[int, int, int, int], fill: str, outline: str | None = None, width: int = 2, radius: int = 42) -> None:
    draw_shadow(canvas, box, radius)
    draw = ImageDraw.Draw(canvas)
    draw.rounded_rectangle(box, radius=radius, fill=hex_color(fill), outline=hex_color(outline) if outline else None, width=width)


def paste_icon(canvas: Image.Image, center_x: int, top: int) -> None:
    if not ICON_PATH.exists():
        return

    icon = Image.open(ICON_PATH).convert("RGBA").resize((92, 92))
    mask = Image.new("L", icon.size, 0)
    ImageDraw.Draw(mask).ellipse((0, 0, icon.size[0], icon.size[1]), fill=255)

    shadow = Image.new("RGBA", canvas.size, (0, 0, 0, 0))
    shadow_draw = ImageDraw.Draw(shadow)
    shadow_draw.ellipse((center_x - 46, top + 8, center_x + 46, top + 100), fill=(18, 32, 24, 36))
    shadow = shadow.filter(ImageFilter.GaussianBlur(18))
    canvas.alpha_composite(shadow)

    icon_holder = Image.new("RGBA", (108, 108), (0, 0, 0, 0))
    holder_mask = Image.new("L", (108, 108), 0)
    holder_draw = ImageDraw.Draw(icon_holder)
    holder_draw.rounded_rectangle((0, 0, 108, 108), radius=30, fill=hex_color(PALETTE["white"]) + (255,))
    ImageDraw.Draw(holder_mask).rounded_rectangle((0, 0, 108, 108), radius=30, fill=255)
    canvas.paste(icon_holder, (center_x - 54, top), holder_mask)
    canvas.paste(icon, (center_x - 46, top + 8), mask)


def draw_text(draw: ImageDraw.ImageDraw, position: tuple[int, int], text: str, font: ImageFont.FreeTypeFont, fill: str, anchor: str | None = None) -> None:
    draw.text(position, text, font=font, fill=hex_color(fill), anchor=anchor)


def draw_status_bar(draw: ImageDraw.ImageDraw, body_semibold: ImageFont.FreeTypeFont) -> None:
    draw_text(draw, (110, 96), "9:41", body_semibold, PALETTE["text"])
    draw.rounded_rectangle((1042, 85, 1152, 127), radius=18, outline=hex_color(PALETTE["text"]), width=4)
    draw.rectangle((1156, 98, 1168, 114), fill=hex_color(PALETTE["text"]))
    draw.rounded_rectangle((1048, 91, 1134, 121), radius=12, fill=hex_color(PALETTE["text"]))
    draw.ellipse((948, 100, 964, 116), fill=hex_color(PALETTE["text"]))
    draw.ellipse((974, 96, 996, 120), fill=hex_color(PALETTE["text"]))


def draw_hero(canvas: Image.Image, draw: ImageDraw.ImageDraw, x1: int, y1: int, x2: int, y2: int, display: ImageFont.FreeTypeFont, body: ImageFont.FreeTypeFont, body_bold: ImageFont.FreeTypeFont) -> None:
    rounded_card(canvas, (x1, y1, x2, y2), PALETTE["primary"], radius=52)
    inner = ImageDraw.Draw(canvas)

    inner.rounded_rectangle((x1 + 40, y1 + 48, x1 + 282, y1 + 110), radius=28, fill=hex_color(PALETTE["white"]) + (36,))
    draw_text(inner, (x1 + 72, y1 + 64), "Premium", body_bold, PALETTE["accent"])

    draw_text(inner, (x1 + 58, y1 + 168), "Know before\nyou eat.", display, PALETTE["white"])
    inner.multiline_text(
        (x1 + 58, y1 + 356),
        "AI meal scans built for IBS,\nreflux, sensitivities, and\nsensitive stomachs.",
        font=body,
        fill=hex_color("#E7F0EB"),
        spacing=10,
    )

    plate_center = (x2 - 240, y1 + 245)
    inner.ellipse((plate_center[0] - 168, plate_center[1] - 168, plate_center[0] + 168, plate_center[1] + 168), fill=hex_color("#F7F4EC"))
    inner.ellipse((plate_center[0] - 132, plate_center[1] - 132, plate_center[0] + 132, plate_center[1] + 132), fill=hex_color(PALETTE["white"]))
    food_colors = ["#D46B4A", "#A5B990", "#E8C768", "#DB8F5D", "#6A927D"]
    offsets = [(-52, -26), (38, -44), (-12, 34), (58, 42), (-74, 52)]
    for index, (dx, dy) in enumerate(offsets):
        radius = 28 + (index % 2) * 10
        inner.ellipse(
            (
                plate_center[0] + dx - radius,
                plate_center[1] + dy - radius,
                plate_center[0] + dx + radius,
                plate_center[1] + dy + radius,
            ),
            fill=hex_color(food_colors[index]),
        )

    chip_x = x2 - 350
    chip_y = y2 - 132
    inner.rounded_rectangle((chip_x, chip_y, chip_x + 270, chip_y + 76), radius=34, fill=hex_color("#284F43"))
    draw_text(inner, (chip_x + 135, chip_y + 18), "Personalized score", body, PALETTE["white"], anchor="ma")


def draw_plan_card(
    canvas: Image.Image,
    draw: ImageDraw.ImageDraw,
    box: tuple[int, int, int, int],
    title: str,
    price: str,
    subtitle: str,
    badge: str | None,
    selected: bool,
    body: ImageFont.FreeTypeFont,
    body_semibold: ImageFont.FreeTypeFont,
    body_bold: ImageFont.FreeTypeFont,
) -> None:
    fill = PALETTE["card"]
    outline = PALETTE["primary"] if selected else PALETTE["border"]
    rounded_card(canvas, box, fill, outline=outline, width=5 if selected else 2, radius=40)
    x1, y1, x2, y2 = box
    if selected:
        draw.rounded_rectangle((x1 + 28, y1 + 24, x1 + 240, y1 + 84), radius=28, fill=hex_color(PALETTE["sage_soft"]))
        draw_text(draw, (x1 + 134, y1 + 42), "BEST VALUE", body_bold, PALETTE["primary"], anchor="ma")
    if badge:
        badge_w = 216 if "Save" in badge else 170
        draw.rounded_rectangle((x2 - badge_w - 28, y1 + 24, x2 - 28, y1 + 84), radius=28, fill=hex_color(PALETTE["accent_soft"]))
        draw_text(draw, (x2 - 28 - badge_w / 2, y1 + 42), badge, body_bold, PALETTE["primary"], anchor="ma")
    draw_text(draw, (x1 + 34, y1 + 118), title, body_bold, PALETTE["text"])
    draw_text(draw, (x1 + 34, y1 + 176), price, body_bold, PALETTE["primary"])
    draw_text(draw, (x1 + 34, y1 + 246), subtitle, body, PALETTE["text_muted"])
    if selected:
        draw.rounded_rectangle((x2 - 132, y2 - 116, x2 - 34, y2 - 18), radius=34, fill=hex_color(PALETTE["primary"]))
        draw.ellipse((x2 - 105, y2 - 89, x2 - 61, y2 - 45), fill=hex_color(PALETTE["white"]))
        draw.line((x2 - 92, y2 - 67, x2 - 78, y2 - 53), fill=hex_color(PALETTE["primary"]), width=8)
        draw.line((x2 - 78, y2 - 53, x2 - 56, y2 - 80), fill=hex_color(PALETTE["primary"]), width=8)
    else:
        draw.rounded_rectangle((x2 - 132, y2 - 116, x2 - 34, y2 - 18), radius=34, outline=hex_color(PALETTE["border"]), width=3)


def draw_feature_row(
    draw: ImageDraw.ImageDraw,
    y: int,
    icon_fill: str,
    label: str,
    font: ImageFont.FreeTypeFont,
) -> None:
    draw.ellipse((112, y, 176, y + 64), fill=hex_color(icon_fill))
    draw_text(draw, (208, y + 10), label, font, PALETTE["text"])


def main() -> None:
    OUTPUT_PATH.parent.mkdir(parents=True, exist_ok=True)

    image = make_canvas()
    draw = ImageDraw.Draw(image)

    display_large = load_font(DISPLAY_FONT, 96)
    display_medium = load_font(DISPLAY_FONT, 82)
    body = load_font(BODY_FONT, 42)
    body_semibold = load_font(BODY_FONT, 44)
    body_bold = load_font(BODY_FONT, 48)
    body_small = load_font(BODY_FONT, 34)

    draw_status_bar(draw, body_semibold)

    paste_icon(image, 190, 146)
    draw_text(draw, (274, 168), "MyTummyHurts", body_bold, PALETTE["primary"])
    draw_text(draw, (274, 226), "Food Scanner", body, PALETTE["text_muted"])

    draw.multiline_text(
        (108, 350),
        "Stop guessing what food\nwill do to your stomach.",
        font=display_large,
        fill=hex_color(PALETTE["text"]),
        spacing=6,
    )
    draw.multiline_text(
        (108, 610),
        "One quick scan gives you a personalized risk read before\nyou decide to eat.",
        font=body,
        fill=hex_color(PALETTE["text_muted"]),
        spacing=10,
    )

    draw_hero(image, draw, 84, 774, 1206, 1366, display_medium, body, body_bold)

    draw_text(draw, (108, 1468), "Choose your plan", body_bold, PALETTE["text"])
    draw_plan_card(
        image,
        draw,
        (84, 1540, 1206, 1846),
        "Annual",
        "$34.99/year",
        "$2.91/month billed once yearly",
        "Save 58%",
        True,
        body,
        body_semibold,
        body_bold,
    )
    draw_plan_card(
        image,
        draw,
        (84, 1880, 1206, 2144),
        "Monthly",
        "$6.99/month",
        "Cancel anytime",
        None,
        False,
        body,
        body_semibold,
        body_bold,
    )

    rounded_card(image, (84, 2190, 1206, 2520), PALETTE["card"], outline=PALETTE["border"], width=2, radius=40)
    draw_text(draw, (122, 2238), "Included with your subscription", body_bold, PALETTE["text"])
    draw_feature_row(draw, 2316, PALETTE["sage_soft"], "40 scans each month", body_small)
    draw_feature_row(draw, 2394, PALETTE["accent_soft"], "Unlimited history", body_small)
    draw_feature_row(draw, 2448, "#E5D0C8", "Trigger and safe-food insights", body_small)

    button_box = (104, 2552, 1186, 2700)
    draw_shadow(image, button_box, radius=42, blur=24, alpha=34)
    draw.rounded_rectangle(button_box, radius=42, fill=hex_color(PALETTE["primary"]))
    draw_text(draw, ((button_box[0] + button_box[2]) // 2, 2592), "Start 7-day free trial", body_bold, PALETTE["white"], anchor="ma")
    draw_text(draw, (645, 2738), "Then $34.99/year. Cancel anytime.", body_small, PALETTE["text_muted"], anchor="ma")

    image.convert("RGB").save(OUTPUT_PATH, quality=96)
    print(str(OUTPUT_PATH))


if __name__ == "__main__":
    main()
