"""Playwright-driven screenshot capture for training-deck-builder.

Reads <deck>/routes.json, opens persistent Chromium, walks each entry, saves
PNGs into <deck>/screenshots/.

Auth modes (set via routes.json → `auth.mode`):
  * "manual" — opens a headed browser, pauses on stdin for the human to sign
    in, persists state in <deck>/.capture-state/ for headless re-runs.
  * "form"   — fills a username/password login form using selectors from
    routes.json, then proceeds. Credentials come from --username/--password
    CLI flags or the env vars named in auth.userEnv / auth.passEnv.

Usage:
    python capture.py --deck docs/training/action-tracker
    python capture.py --deck docs/training/hse-performance --headless
    python capture.py --deck docs/training/action-tracker --headless \
        --username admin@example.com --password 'secret'

Routes file schema: see templates/routes-template.json.
"""
from __future__ import annotations

import argparse
import json
import os
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
    log(f"  -> {sid}: {route}")

    wait_until = entry.get("wait_until", "networkidle")
    goto_timeout = entry.get("goto_timeout_ms", 45_000)
    try:
        page.goto(full_url, wait_until=wait_until, timeout=goto_timeout)
    except PWTimeout:
        log(f"    goto wait_until={wait_until} timed out; falling back to domcontentloaded")
        page.goto(full_url, wait_until="domcontentloaded", timeout=goto_timeout)

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


def discover_interpolations(page: Page, base_url: str, interpolations: dict) -> dict:
    """Resolve placeholder values by visiting list pages and extracting IDs.

    Recipe shape (per key):
        { "from": "/dashboard/...",          # route to visit (required)
          "wait_for": "table tbody tr",      # optional, wait before extracting
          "extract": {
              "selector": "...",             # CSS selector (required)
              "attr": "href",                # attribute to read; omit for textContent
              "regex": "/actions/([^/?#]+)"  # optional, capture group 1 from the value
          }
        }
    String values (e.g. {"ACTION_ID": "some-explanation"}) are treated as documentation
    and skipped — only object recipes are resolved.
    """
    import re
    resolved = {}
    for key, recipe in interpolations.items():
        if not isinstance(recipe, dict) or "from" not in recipe:
            continue
        try:
            url = base_url.rstrip("/") + recipe["from"]
            log(f"  discover {{{key}}} via {recipe['from']}")
            page.goto(url, wait_until="networkidle", timeout=30_000)
            if recipe.get("wait_for"):
                page.wait_for_selector(recipe["wait_for"], timeout=10_000)
            page.wait_for_timeout(800)
            ext = recipe.get("extract") or {}
            sel = ext.get("selector")
            if not sel:
                log(f"    no extract.selector for {key}; skipping")
                continue
            loc = page.locator(sel).first
            value = loc.get_attribute(ext["attr"]) if ext.get("attr") else loc.inner_text()
            if value and ext.get("regex"):
                m = re.search(ext["regex"], value)
                value = m.group(1) if m else None
            if value:
                resolved[key] = value.strip()
                log(f"    {{{key}}} = {resolved[key]}")
            else:
                log(f"    {{{key}}} not found")
        except Exception as e:
            log(f"    {{{key}}} discovery failed: {e}")
    return resolved


def form_login(page: Page, auth: dict, base_url: str, username: str, password: str) -> bool:
    """Sign in via an HTML form. Returns True on success."""
    login_route = auth.get("loginRoute", "/")
    user_sel = auth.get("userSelector") or "input[name='email'], input[type='email'], input[name='username']"
    pass_sel = auth.get("passwordSelector") or "input[name='password'], input[type='password']"
    submit_sel = auth.get("submitSelector") or "button[type='submit'], button:has-text('Sign in'), button:has-text('Login')"
    success_wait = auth.get("successWaitFor")

    full_url = base_url.rstrip("/") + login_route
    log(f"  form login -> {full_url}")
    page.goto(full_url, wait_until="domcontentloaded", timeout=30_000)

    try:
        page.locator(user_sel).first.fill(username, timeout=10_000)
        page.locator(pass_sel).first.fill(password, timeout=10_000)
        page.locator(submit_sel).first.click(timeout=10_000)
    except PWTimeout as e:
        log(f"    form-login selector timeout: {e}")
        return False

    success_url_contains = auth.get("successUrlContains")
    if success_wait:
        try:
            page.wait_for_selector(success_wait, timeout=20_000)
        except PWTimeout:
            log(f"    successWaitFor never appeared: {success_wait} (falling back to URL check)")
            try:
                marker = success_url_contains or "/dashboard"
                page.wait_for_url(lambda url: marker in url, timeout=10_000)
            except PWTimeout:
                log(f"    URL never reached '{marker}' either — auth may have failed")
                return False
    elif success_url_contains:
        try:
            page.wait_for_url(lambda url: success_url_contains in url, timeout=15_000)
        except PWTimeout:
            log(f"    URL never reached '{success_url_contains}' — auth may have failed")
            return False
    else:
        # No explicit success marker — settle for URL change away from a non-root login route.
        try:
            base = login_route.rstrip("/")
            if base:
                page.wait_for_url(lambda url: base not in url, timeout=15_000)
            else:
                page.wait_for_url(lambda url: "/dashboard" in url, timeout=15_000)
        except PWTimeout:
            log("    no URL change within 15s — auth may have failed")
            return False
    log("    signed in")
    return True


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--deck", required=True, help="Path to deck folder containing routes.json")
    parser.add_argument("--base-url", default=None, help="Override baseUrl from routes.json")
    parser.add_argument("--headless", action="store_true", help="Run headless (skip manual login pause)")
    parser.add_argument("--only", default=None, help="Comma-separated screenshot ids to capture (skip rest)")
    parser.add_argument("--username", default=None, help="Username for auth.mode=form (overrides auth.userEnv)")
    parser.add_argument("--password", default=None, help="Password for auth.mode=form (overrides auth.passEnv)")
    parser.add_argument("--set", action="append", default=[], metavar="KEY=VALUE",
                        help="Literal substitution for {KEY} placeholders in routes/actions. Repeatable.")
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

    auth_cfg = cfg.get("auth", {}) or {}
    auth_mode = (auth_cfg.get("mode") or "manual").lower()

    with sync_playwright() as pw:
        ctx = pw.chromium.launch_persistent_context(
            user_data_dir=str(state_dir),
            headless=args.headless,
            viewport=viewport,
            ignore_https_errors=True,
        )
        page = ctx.new_page()

        if auth_mode == "form":
            username = args.username or os.environ.get(auth_cfg.get("userEnv") or "CAPTURE_USER")
            password = args.password or os.environ.get(auth_cfg.get("passEnv") or "CAPTURE_PASS")
            if not username or not password:
                ctx.close()
                sys.exit(
                    "auth.mode=form requires credentials. Pass --username / --password or set "
                    f"env vars {auth_cfg.get('userEnv') or 'CAPTURE_USER'} / "
                    f"{auth_cfg.get('passEnv') or 'CAPTURE_PASS'}."
                )
            ok = form_login(page, auth_cfg, base_url, username, password)
            if not ok:
                log("WARNING: form login did not confirm — captures may show the login screen.")
        elif not args.headless:
            page.goto(base_url)
            input("\n[capture] Sign in to the app in the open browser, then press Enter to continue... ")

        # Resolve placeholder values (e.g. {ACTION_ID}). Precedence:
        #   1. CLI --set KEY=VALUE (highest)
        #   2. routes.json `interpolations` discovery recipes (object values)
        # String values in `interpolations` are documentation and ignored.
        interp_cfg = cfg.get("interpolations") or {}
        resolved = discover_interpolations(page, base_url, interp_cfg) if interp_cfg else {}
        for kv in args.set or []:
            if "=" not in kv:
                log(f"  ignoring --set {kv!r} (expected KEY=VALUE)")
                continue
            k, v = kv.split("=", 1)
            resolved[k.strip()] = v.strip()
            log(f"  override {{{k.strip()}}} = {v.strip()}")

        def substitute(s: str) -> str:
            for k, v in resolved.items():
                s = s.replace("{" + k + "}", v)
            return s

        import re as _re
        placeholder_re = _re.compile(r"\{[A-Z][A-Z0-9_]*\}")

        # Roles that don't require a user switch (any signed-in user can see these).
        NEUTRAL_ROLES = {"All", "All Users", "Any", "*", "", None}

        last_role = None
        first_specific_role_seen = False
        skipped_unresolved = 0
        for entry in entries:
            # Skip entries whose route still has unresolved placeholders after discovery.
            entry["route"] = substitute(entry.get("route", ""))
            unresolved = placeholder_re.findall(entry["route"])
            if unresolved:
                log(f"  - skip {entry.get('id')}: unresolved placeholders {unresolved}")
                skipped_unresolved += 1
                continue
            # Also substitute inside action click_text / click_selector / fill values.
            for action in entry.get("actions", []):
                for k, v in list(action.items()):
                    if isinstance(v, str):
                        action[k] = substitute(v)
                    elif isinstance(v, dict):
                        for kk, vv in list(v.items()):
                            if isinstance(vv, str):
                                v[kk] = substitute(vv)
            role = entry.get("role")
            role_is_specific = role not in NEUTRAL_ROLES

            if role_is_specific and role != last_role and not args.headless:
                if first_specific_role_seen:
                    # Genuine role transition — pause for user switch
                    log(f"\nNext role: {role}. Switch user in browser if needed, then press Enter.")
                    input()
                else:
                    # First specific role — user just logged in manually, no switch needed
                    log(f"  (first specific role: {role} — assuming you're already signed in as this role)")
                first_specific_role_seen = True
                last_role = role

            try:
                capture_one(page, entry, base_url, screenshots_dir)
            except Exception as e:
                log(f"  X {entry.get('id')}: {e}")

        ctx.close()

    if skipped_unresolved:
        log(f"Skipped {skipped_unresolved} entries with unresolved placeholders. "
            "Add a discovery recipe under routes.json `interpolations` to capture them.")
    log("Done.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
