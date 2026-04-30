"""Playwright-driven screenshot capture for training-deck-builder.

Reads <deck>/routes.json, opens persistent Chromium, walks each entry, saves
PNGs into <deck>/screenshots/.

First run is interactive: opens headed browser, pauses for manual login,
then proceeds. Auth state persists in <deck>/capture-state/ for re-runs.

Usage:
    python capture.py --deck docs/training/action-tracker
    python capture.py --deck docs/training/hse-performance --headless

Routes file schema: see templates/routes-template.json.
"""
from __future__ import annotations

import argparse
import json
import sys
import time
from pathlib import Path

try:
    from playwright.sync_api import sync_playwright, Page, TimeoutError as PWTimeout
except ImportError:
    sys.exit("Install Playwright: pip install playwright && playwright install chromium")


def log(msg: str) -> None:
    print(f"[capture] {msg}", flush=True)


def perform_action(page: Page, action: dict) -> None:
    """Execute a single action step from routes.json."""
    if "click_text" in action:
        page.get_by_text(action["click_text"], exact=action.get("exact", False)).first.click()
    elif "click_selector" in action:
        page.locator(action["click_selector"]).first.click()
    elif "fill" in action:
        page.locator(action["fill"]["selector"]).fill(action["fill"]["value"])
    elif "press" in action:
        page.keyboard.press(action["press"])
    elif "wait_ms" in action:
        page.wait_for_timeout(action["wait_ms"])
    elif "scroll_to" in action:
        page.locator(action["scroll_to"]).scroll_into_view_if_needed()
    elif "hover" in action:
        page.locator(action["hover"]).hover()
    else:
        log(f"  unknown action: {action}")


def mask_elements(page: Page, selectors: list[str]) -> None:
    for sel in selectors:
        page.locator(sel).evaluate_all(
            "els => els.forEach(e => { e.style.filter = 'blur(8px)'; })"
        )


def capture_one(page: Page, entry: dict, base_url: str, out_dir: Path) -> None:
    sid = entry["id"]
    route = entry["route"]
    full_url = base_url.rstrip("/") + route
    log(f"  → {sid}: {route}")

    page.goto(full_url, wait_until="networkidle", timeout=30_000)

    for action in entry.get("actions", []):
        try:
            perform_action(page, action)
        except Exception as e:
            log(f"    action failed: {action} ({e})")

    if entry.get("wait_for"):
        try:
            page.wait_for_selector(entry["wait_for"], timeout=10_000)
        except PWTimeout:
            log(f"    wait_for selector never appeared: {entry['wait_for']} (continuing)")

    # Settle: small delay for animations/charts
    page.wait_for_timeout(entry.get("settle_ms", 600))

    if entry.get("mask"):
        mask_elements(page, entry["mask"])

    out = out_dir / f"{sid}.png"
    page.screenshot(path=str(out), full_page=entry.get("fullPage", False))
    log(f"    saved {out.name} ({out.stat().st_size // 1024} KB)")


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--deck", required=True, help="Path to deck folder containing routes.json")
    parser.add_argument("--base-url", default=None, help="Override baseUrl from routes.json")
    parser.add_argument("--headless", action="store_true", help="Run headless (skip manual login pause)")
    parser.add_argument("--only", default=None, help="Comma-separated screenshot ids to capture (skip rest)")
    args = parser.parse_args()

    deck_dir = Path(args.deck).resolve()
    routes_file = deck_dir / "routes.json"
    if not routes_file.exists():
        sys.exit(f"routes.json not found at {routes_file}")

    cfg = json.loads(routes_file.read_text())
    base_url = args.base_url or cfg.get("baseUrl", "http://localhost:3000")
    viewport = cfg.get("viewport", {"width": 1440, "height": 900})

    screenshots_dir = deck_dir / "screenshots"
    screenshots_dir.mkdir(exist_ok=True)
    state_dir = deck_dir / ".capture-state"
    state_dir.mkdir(exist_ok=True)

    only = set(args.only.split(",")) if args.only else None
    entries = cfg["screenshots"]
    if only:
        entries = [e for e in entries if e["id"] in only]
    log(f"Capturing {len(entries)} screenshots into {screenshots_dir}")

    with sync_playwright() as pw:
        ctx = pw.chromium.launch_persistent_context(
            user_data_dir=str(state_dir),
            headless=args.headless,
            viewport=viewport,
            ignore_https_errors=True,
        )
        page = ctx.new_page()

        if not args.headless:
            page.goto(base_url)
            input("\n[capture] Sign in to the app in the open browser, then press Enter to continue... ")

        last_role = None
        for entry in entries:
            role = entry.get("role")
            if role and role != last_role and not args.headless:
                log(f"\nNext role: {role}. Switch user in browser if needed, then press Enter.")
                input()
                last_role = role
            try:
                capture_one(page, entry, base_url, screenshots_dir)
            except Exception as e:
                log(f"  ✗ {entry.get('id')}: {e}")

        ctx.close()

    log("Done.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
