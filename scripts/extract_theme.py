"""Extract brand tokens from a webapp project.

Looks for, in order:
  1. tailwind.config.{js,ts,cjs,mjs} — theme.colors / theme.extend.colors
  2. src/**/constants/theme.{ts,js} — exported COLORS / colors / theme objects
  3. src/**/theme.{css,scss} — :root CSS variables
  4. index.css / global.css :root vars

Outputs brand.json with at minimum: primary, primaryDark, primaryLight, text,
muted, border, success, warning, error, font, logoPath.

Usage:
    python extract_theme.py /path/to/project           # prints JSON
    python extract_theme.py /path/to/project --write   # writes brand.json next to script
"""
from __future__ import annotations

import argparse
import json
import re
import sys
from pathlib import Path

DEFAULT_TOKENS = {
    "primary": "#37A130",
    "primaryDark": "#2F8E2A",
    "primaryLight": "#E9FFF3",
    "text": "#000000",
    "muted": "#9CA3AF",
    "border": "#D2D7E0",
    "success": "#04A850",
    "warning": "#D97706",
    "error": "#B81719",
    "font": "Roboto",
    "logoPath": "",
}

HEX = re.compile(r"#[0-9a-fA-F]{3,8}")


def find_files(root: Path, patterns: list[str]) -> list[Path]:
    out: list[Path] = []
    for pat in patterns:
        out.extend(root.rglob(pat))
    return [p for p in out if "node_modules" not in p.parts and ".git" not in p.parts]


def extract_from_ts_constants(root: Path) -> dict:
    """Look for an exported `COLORS = { primary: '#...', ... }` object."""
    files = find_files(root, ["theme.ts", "theme.js", "colors.ts", "colors.js"])
    for f in files:
        try:
            text = f.read_text(encoding="utf-8", errors="ignore")
        except Exception:
            continue
        # Find the COLORS or theme block
        m = re.search(r"(?:COLORS|colors|theme)\s*=\s*\{([^}]+)\}", text, re.S)
        if not m:
            continue
        body = m.group(1)
        out: dict = {}
        for key, hex_val in re.findall(r"(\w+)\s*:\s*[\"']([^\"']+)[\"']", body):
            if HEX.fullmatch(hex_val):
                out[key] = hex_val
        if out:
            out["_source"] = str(f.relative_to(root))
            return out
    return {}


def extract_from_css_vars(root: Path) -> dict:
    files = find_files(root, ["index.css", "global.css", "globals.css", "app.css", "theme.css"])
    out: dict = {}
    for f in files:
        try:
            text = f.read_text(encoding="utf-8", errors="ignore")
        except Exception:
            continue
        for var, val in re.findall(r"--([\w-]+)\s*:\s*([^;]+);", text):
            val = val.strip()
            if HEX.fullmatch(val):
                out[var] = val
    return out


def extract_font(root: Path) -> str | None:
    files = find_files(root, ["index.css", "global.css", "globals.css", "tailwind.config.js", "tailwind.config.ts"])
    for f in files:
        try:
            text = f.read_text(encoding="utf-8", errors="ignore")
        except Exception:
            continue
        m = re.search(r"font-family\s*:\s*[\"']?([\w\s\-,]+)", text)
        if m:
            primary = m.group(1).split(",")[0].strip().strip("'\"")
            if primary:
                return primary
    # Try tailwind config theme.fontFamily
    files = find_files(root, ["tailwind.config.js", "tailwind.config.ts"])
    for f in files:
        try:
            text = f.read_text(encoding="utf-8", errors="ignore")
        except Exception:
            continue
        m = re.search(r"fontFamily\s*:\s*\{[^}]*sans\s*:\s*\[\s*[\"']([^\"']+)[\"']", text, re.S)
        if m:
            return m.group(1)
    return None


def find_logo(root: Path) -> str:
    candidates: list[Path] = []
    for pat in [
        "**/public/**/*logo*.svg",
        "**/public/**/*logo*.png",
        "**/assets/**/*logo*.svg",
        "**/src/**/*logo*.svg",
    ]:
        candidates.extend(root.glob(pat))
    candidates = [c for c in candidates if "node_modules" not in c.parts]
    if not candidates:
        return ""
    candidates.sort(key=lambda p: (len(p.parts), len(p.name)))
    return str(candidates[0].relative_to(root)).replace("\\", "/")


def map_extracted_to_brand(consts: dict, css_vars: dict) -> dict:
    out = dict(DEFAULT_TOKENS)
    aliases = {
        "primary": ["primary", "brand", "primaryColor", "brand-primary"],
        "primaryDark": ["primaryDark", "primary-dark", "brand-primary-dark"],
        "primaryLight": ["primaryLight", "primary-light", "brand-primary-light"],
        "text": ["textPrimary", "text", "text-primary", "fg"],
        "muted": ["textMuted", "muted", "text-muted"],
        "border": ["border", "borderColor", "border-color"],
        "success": ["success"],
        "warning": ["warning"],
        "error": ["error", "danger"],
    }
    for key, names in aliases.items():
        for name in names:
            if name in consts:
                out[key] = consts[name]
                break
            if name in css_vars:
                out[key] = css_vars[name]
                break
    return out


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("project_root")
    ap.add_argument("--write", action="store_true")
    args = ap.parse_args()

    root = Path(args.project_root).resolve()
    if not root.is_dir():
        sys.exit(f"not a directory: {root}")

    consts = extract_from_ts_constants(root)
    css_vars = extract_from_css_vars(root)
    brand = map_extracted_to_brand(consts, css_vars)

    font = extract_font(root)
    if font:
        brand["font"] = font

    logo = find_logo(root)
    if logo:
        brand["logoPath"] = logo

    if consts.get("_source"):
        brand["_source"] = consts["_source"]

    output = json.dumps(brand, indent=2)
    if args.write:
        out_path = Path(__file__).parent.parent / "brand.json"
        out_path.write_text(output)
        print(f"wrote {out_path}")
    else:
        print(output)
    return 0


if __name__ == "__main__":
    sys.exit(main())
