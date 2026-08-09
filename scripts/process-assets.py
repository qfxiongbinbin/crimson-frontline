#!/usr/bin/env python3
"""Split the generated chroma-key concept sheets into Phaser-ready PNG sprites."""

from __future__ import annotations

import colorsys
from pathlib import Path

from PIL import Image, ImageOps


ROOT = Path(__file__).resolve().parents[1]
TMP = ROOT / "tmp" / "imagegen"
OUT = ROOT / "src" / "assets" / "generated"


def cell(sheet: Image.Image, cols: int, rows: int, col: int, row: int) -> Image.Image:
    left = round(col * sheet.width / cols)
    top = round(row * sheet.height / rows)
    right = round((col + 1) * sheet.width / cols)
    bottom = round((row + 1) * sheet.height / rows)
    return sheet.crop((left, top, right, bottom))


def fitted(sprite: Image.Image, size: tuple[int, int], fill: float = 0.9) -> Image.Image:
    alpha = sprite.getchannel("A")
    bbox = alpha.getbbox()
    if bbox is None:
      raise ValueError("sprite cell has no visible pixels")
    sprite = sprite.crop(bbox)
    max_w = max(1, round(size[0] * fill))
    max_h = max(1, round(size[1] * fill))
    scale = min(max_w / sprite.width, max_h / sprite.height)
    resized = sprite.resize(
        (max(1, round(sprite.width * scale)), max(1, round(sprite.height * scale))),
        Image.Resampling.LANCZOS,
    )
    canvas = Image.new("RGBA", size, (0, 0, 0, 0))
    x = (size[0] - resized.width) // 2
    y = (size[1] - resized.height) // 2
    canvas.alpha_composite(resized, (x, y))
    return canvas


def enemy_variant(image: Image.Image) -> Image.Image:
    """Shift only crimson armor tones to violet while preserving steel and amber lights."""
    out = image.copy()
    pixels = out.load()
    for y in range(out.height):
        for x in range(out.width):
            r, g, b, a = pixels[x, y]
            if a == 0:
                continue
            h, s, v = colorsys.rgb_to_hsv(r / 255, g / 255, b / 255)
            is_crimson = (h <= 0.065 or h >= 0.96) and s >= 0.32 and r >= g * 1.22 and r >= b * 1.12
            if not is_crimson:
                continue
            nr, ng, nb = colorsys.hsv_to_rgb(0.72, min(1, s * 0.9), min(1, v * 1.05))
            pixels[x, y] = (round(nr * 255), round(ng * 255), round(nb * 255), a)
    return out


def save_factions(image: Image.Image, group: str, name: str) -> None:
    directory = OUT / group
    directory.mkdir(parents=True, exist_ok=True)
    image.save(directory / f"{name}-player.png", optimize=True)
    enemy_variant(image).save(directory / f"{name}-enemy.png", optimize=True)


def main() -> None:
    buildings = Image.open(TMP / "buildings-alpha.png").convert("RGBA")
    construction = Image.open(TMP / "construction-alpha.png").convert("RGBA")
    turret = Image.open(TMP / "turret-alpha.png").convert("RGBA")
    units = Image.open(TMP / "units-alpha.png").convert("RGBA")
    props = Image.open(TMP / "props-alpha.png").convert("RGBA")

    building_specs = [
        ("warFactory", 0, 0, (384, 256), 0.94),
        ("barracks", 1, 0, (256, 256), 0.92),
        ("refinery", 0, 1, (384, 256), 0.94),
        ("powerPlant", 1, 1, (256, 256), 0.92),
    ]
    for name, col, row, size, fill in building_specs:
        save_factions(fitted(cell(buildings, 2, 2, col, row), size, fill), "buildings", name)

    save_factions(fitted(construction, (384, 384), 0.94), "buildings", "constructionYard")
    save_factions(fitted(cell(turret, 2, 1, 0, 0), (256, 256), 0.9), "buildings", "turret")
    save_factions(fitted(cell(turret, 2, 1, 1, 0), (256, 256), 0.9), "buildings", "turret-head")

    unit_specs = [
        ("infantry", 0, 0, 0.68),
        ("rocket", 1, 0, 0.72),
        ("lightTank", 2, 0, 0.9),
        ("heavyTank", 0, 1, 0.94),
        ("harvester", 1, 1, 0.94),
        ("mcv", 2, 1, 0.94),
    ]
    for name, col, row, fill in unit_specs:
        save_factions(fitted(cell(units, 3, 2, col, row), (256, 256), fill), "units", name)

    ground_cell = cell(props, 5, 2, 0, 0)
    ground_bbox = ground_cell.getchannel("A").getbbox()
    if ground_bbox is None:
        raise ValueError("ground cell has no visible pixels")
    ground_source = ground_cell.crop(ground_bbox)
    trim_x = round(ground_source.width * 0.2)
    trim_y = round(ground_source.height * 0.2)
    ground_source = ground_source.crop(
        (trim_x, trim_y, ground_source.width - trim_x, ground_source.height - trim_y),
    ).resize((32, 32), Image.Resampling.LANCZOS)
    terrain_dir = OUT / "terrain"
    terrain_dir.mkdir(parents=True, exist_ok=True)
    ground_variants = [
        ground_source,
        ImageOps.mirror(ground_source),
        ground_source.rotate(180),
        ImageOps.flip(ground_source),
    ]
    for index, variant in enumerate(ground_variants):
        base = Image.new("RGBA", (32, 32), (82, 86, 63, 255))
        base.alpha_composite(variant)
        base.save(terrain_dir / f"ground-{index}.png", optimize=True)

    old_ground = terrain_dir / "ground.png"
    if old_ground.exists():
        old_ground.unlink()

    prop_specs = [
        ("rock", 1, 0, (32, 32), 0.96),
        ("ore", 2, 0, (32, 32), 0.96),
        ("sandbags", 3, 0, (192, 128), 0.92),
        ("anti-tank", 4, 0, (128, 128), 0.86),
        ("crater", 0, 1, (128, 128), 0.94),
        ("wreck", 1, 1, (128, 160), 0.92),
        ("crates", 2, 1, (160, 128), 0.9),
        ("wall", 3, 1, (192, 128), 0.92),
        ("beacon", 4, 1, (96, 96), 0.78),
    ]
    for name, col, row, size, fill in prop_specs:
        directory = OUT / ("terrain" if name in {"rock", "ore"} else "props")
        directory.mkdir(parents=True, exist_ok=True)
        sprite = fitted(cell(props, 5, 2, col, row), size, fill)
        sprite.save(directory / f"{name}.png", optimize=True)


if __name__ == "__main__":
    main()
