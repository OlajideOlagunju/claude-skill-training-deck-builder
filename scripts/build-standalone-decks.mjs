#!/usr/bin/env node
// ===================================================================
// Build self-contained standalone training decks
// ===================================================================
//
// For each training module under docs/training/<module>/ that has a
// slides.md file, emit TWO self-contained HTML decks into
// docs/training/standalone-builds/:
//
//   <module>-with-screenshots.html   — screenshots base64-inlined
//   <module>-text-only.html          — screenshot blocks stripped
//
// Plus copy already-standalone decks (general-onboarding) as-is.
// Plus generate an index.html landing page + a README.md.
//
// Each output file is a true standalone — open by double-click anywhere.
// Reveal.js still loads from a CDN (no internet required after first
// open, since the CDN response is cacheable).
//
// USAGE
//   node docs/training/scripts/build-standalone-decks.mjs
//   or:  npm run build-standalone     (from hssems-frontend/shared-frontend)
//
// HOW IT WORKS
//   1. Reads the shared deck.css once.
//   2. For each module with slides.md:
//        a. inlineScreenshots() — base64 every <img src="screenshots/..."> ref
//        b. stripScreenshotBlocks() — regex-remove every <div class="screenshot-wrap">
//        c. renderDeck() — wrap markdown in the standalone HTML template
//   3. Writes index.html + README.md describing each output file.
//
// EDITING
//   Edit the source slides.md (or capture new screenshots) and re-run.
//   The standalone-builds/ folder is regenerated from scratch each run —
//   never hand-edit files in there, they'll be overwritten.
// ===================================================================

import { readFile, writeFile, mkdir, rm, copyFile, stat } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { dirname, join, extname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const TRAINING_ROOT = dirname(__dirname);
const SHARED_CSS_PATH = join(TRAINING_ROOT, '_shared/deck.css');
const OUT_DIR = join(TRAINING_ROOT, 'standalone-builds');

// Modules with slides.md (auto-built into 2 variants each).
const MODULES = [
  { slug: 'action-tracker',        title: 'Action Tracker',             estimate: '~70 slides · 30 min' },
  { slug: 'hse-performance',       title: 'HSE Performance Management', estimate: '~50 slides · 25 min' },
  { slug: 'audit-inspection',      title: 'Audit and Inspection',       estimate: '~50 slides · 30 min' },
  { slug: 'contractor-management', title: 'Contractor Management',      estimate: '~45 slides · 25 min' },
];

// Already-standalone decks — copied to standalone-builds/ as-is.
const COPY_AS_IS = [
  {
    srcPath: 'general-onboarding/deck.html',
    dest: 'general-onboarding.html',
    title: 'General Onboarding',
    variant: 'standalone',
    estimate: '~25 slides · 15 min',
  },
];

async function main() {
  console.log(`[build] cleaning ${rel(OUT_DIR)}`);
  await rm(OUT_DIR, { recursive: true, force: true });
  await mkdir(OUT_DIR, { recursive: true });

  if (!existsSync(SHARED_CSS_PATH)) {
    throw new Error(`Shared CSS missing: ${SHARED_CSS_PATH}\nThis script reads it from docs/training/_shared/deck.css — the same chrome the live decks use.`);
  }
  const sharedCss = await readFile(SHARED_CSS_PATH, 'utf8');

  const results = [];

  for (const mod of MODULES) {
    const moduleDir = join(TRAINING_ROOT, mod.slug);
    const slidesPath = join(moduleDir, 'slides.md');
    if (!existsSync(slidesPath)) {
      console.warn(`[build] skip ${mod.slug} — no slides.md at ${rel(slidesPath)}`);
      continue;
    }
    const slidesMd = await readFile(slidesPath, 'utf8');

    // Variant 1: with screenshots, base64-inlined.
    const withMd = await inlineScreenshots(slidesMd, moduleDir);
    const withFile = `${mod.slug}-with-screenshots.html`;
    await writeFile(
      join(OUT_DIR, withFile),
      renderDeck({ title: mod.title, sharedCss, slidesMd: withMd, includeScreenshots: true })
    );
    results.push({ ...mod, variant: 'with screenshots', file: withFile, sizeMb: await sizeMb(join(OUT_DIR, withFile)) });

    // Variant 2: text-only (strip every screenshot-wrap block).
    const textMd = stripScreenshotBlocks(slidesMd);
    const textFile = `${mod.slug}-text-only.html`;
    await writeFile(
      join(OUT_DIR, textFile),
      renderDeck({ title: mod.title, sharedCss, slidesMd: textMd, includeScreenshots: false })
    );
    results.push({ ...mod, variant: 'text-only', file: textFile, sizeMb: await sizeMb(join(OUT_DIR, textFile)) });
  }

  for (const item of COPY_AS_IS) {
    const src = join(TRAINING_ROOT, item.srcPath);
    const dest = join(OUT_DIR, item.dest);
    if (!existsSync(src)) {
      console.warn(`[build] skip ${item.srcPath} — file missing`);
      continue;
    }
    await copyFile(src, dest);
    results.push({ ...item, file: item.dest, sizeMb: await sizeMb(dest) });
  }

  await writeFile(join(OUT_DIR, 'index.html'), renderIndex(results));
  await writeFile(join(OUT_DIR, 'README.md'), renderReadme(results));

  // Console summary
  console.log('\n[build] outputs:');
  for (const r of results) {
    console.log(`  ${r.file.padEnd(48)} ${r.variant.padEnd(20)} ${r.sizeMb.padStart(10)}`);
  }
  console.log(`\n[build] done — ${rel(OUT_DIR)}`);
}

// ─── helpers ────────────────────────────────────────────────────────

function rel(p) {
  // Print a path relative to the repo root for human-readable logs.
  const repoRoot = dirname(dirname(TRAINING_ROOT));
  return p.startsWith(repoRoot) ? p.slice(repoRoot.length + 1).replace(/\\/g, '/') : p;
}

async function sizeMb(path) {
  const s = await stat(path);
  return (s.size / 1024 / 1024).toFixed(2) + ' MB';
}

// Strip every <div class="screenshot-wrap">...</div> block (multiline, lazy).
function stripScreenshotBlocks(md) {
  return md.replace(/<div class="screenshot-wrap">[\s\S]*?<\/div>\s*/g, '');
}

// Replace every <img src="screenshots/foo.png"> reference with a data: URL.
// Caches per-filename so duplicate references don't re-encode the file.
async function inlineScreenshots(md, moduleDir) {
  const screenshotsDir = join(moduleDir, 'screenshots');
  if (!existsSync(screenshotsDir)) return md;

  const pattern = /(<img\s+[^>]*?src=")screenshots\/([^"]+)("[^>]*?>)/g;
  const matches = [...md.matchAll(pattern)];
  if (matches.length === 0) return md;

  const cache = new Map(); // filename -> data URL (or null if missing)
  let inlined = 0;
  let missing = 0;
  for (const m of matches) {
    const filename = m[2];
    if (cache.has(filename)) continue;
    const filePath = join(screenshotsDir, filename);
    if (!existsSync(filePath)) {
      console.warn(`    missing screenshot: ${rel(filePath)}`);
      cache.set(filename, null);
      missing++;
      continue;
    }
    const data = await readFile(filePath);
    const ext = extname(filename).toLowerCase().slice(1);
    const mime = ext === 'jpg' ? 'image/jpeg' : `image/${ext}`;
    cache.set(filename, `data:${mime};base64,${data.toString('base64')}`);
    inlined++;
  }
  console.log(`  ${rel(moduleDir)}: ${inlined} screenshot(s) inlined${missing ? `, ${missing} missing` : ''}`);

  return md.replace(pattern, (match, before, filename, after) => {
    const dataUrl = cache.get(filename);
    if (!dataUrl) return match; // keep original ref → "Screenshot pending" fallback card kicks in client-side
    return `${before}${dataUrl}${after}`;
  });
}

// ─── HTML rendering ─────────────────────────────────────────────────

function renderDeck({ title, sharedCss, slidesMd, includeScreenshots }) {
  // Escape any literal </script> inside the markdown so the browser doesn't
  // close the embedding <script type="text/template"> prematurely. The
  // markdown plugin reads textContent so this becomes <\/script in the
  // output too — but we don't actually have any </script> tags in our
  // slides.md so this is purely defensive.
  const safeMd = slidesMd.replace(/<\/script/gi, '<\\/script');
  const bodyClass = includeScreenshots ? '' : ' class="no-screenshots"';
  const variantBanner = includeScreenshots
    ? 'with screenshots (base64-inlined)'
    : 'text-only (screenshots stripped at build time)';

  return `<!DOCTYPE html>
<!--
  ${escapeHtml(title)} — Standalone Training Deck
  ================================================================
  Generated by docs/training/scripts/build-standalone-decks.mjs.
  Variant: ${variantBanner}.

  Open by double-click — no server, no fetch, no build step.

  To regenerate after editing the source slides.md, run:
      node docs/training/scripts/build-standalone-decks.mjs
  ================================================================
-->
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(title)} — Training</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Roboto:wght@300;400;500;600;700&family=Manrope:wght@400;500;600;700;800&display=swap">
<link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/reveal.js@5.1.0/dist/reveal.css">
<link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/reveal.js@5.1.0/dist/theme/white.css" id="theme">
<script>
  // PDF export — load reveal.js's print stylesheet synchronously when ?print-pdf
  // is in the URL. Without this the print output is broken (one long scrolling
  // page instead of one print page per slide).
  (function () {
    var isPrint = /print-pdf/gi.test(window.location.search);
    var link = document.createElement('link');
    link.rel = 'stylesheet';
    link.type = 'text/css';
    link.href = 'https://cdn.jsdelivr.net/npm/reveal.js@5.1.0/css/print/' +
                (isPrint ? 'pdf.css' : 'paper.css');
    document.head.appendChild(link);
  })();
</script>
<style>
${sharedCss}

/* ─── Standalone-build overrides ───────────────────────────────────────
   These adjust the shared chrome so it works when the file is opened
   from any directory (no /fep-logo/ asset to resolve). */
.reveal .slides::after { display: none !important; }
</style>
</head>
<body${bodyClass}>
<div class="reveal">
  <div class="slides">
    <section data-markdown
             data-separator="^---$"
             data-separator-vertical="^--$"
             data-separator-notes="^Note:"
             data-charset="utf-8">
      <script type="text/template">
${safeMd}
      </script>
    </section>
  </div>
</div>

<aside class="toc-panel collapsed" id="tocPanel" aria-label="Slide navigation">
  <div class="toc-panel__header">
    <span>Quick Nav</span>
    <button class="toc-panel__toggle" id="tocToggle" type="button" aria-label="Collapse navigation" title="Collapse">&laquo;</button>
  </div>
  <ol class="toc-panel__list" id="tocList"></ol>
  <div class="toc-panel__footer">
    <button class="toc-export" id="tocExport" type="button" title="Export this deck as a landscape PDF">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
        <path d="M12 3v12"/><path d="m7 12 5 5 5-5"/><path d="M5 21h14"/>
      </svg>
      Export as PDF
    </button>
  </div>
</aside>
<button class="toc-fab" id="tocFab" type="button" aria-label="Open slide navigation" title="Slide navigation">
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
    <line x1="4" y1="7"  x2="20" y2="7"/>
    <line x1="4" y1="12" x2="20" y2="12"/>
    <line x1="4" y1="17" x2="14" y2="17"/>
  </svg>
</button>
<div class="lightbox" id="lightbox" role="dialog" aria-modal="true" aria-label="Enlarged screenshot" hidden>
  <span class="lightbox__hint">Click or press Esc to close</span>
  <img id="lightboxImg" alt="">
</div>

<script>
  // Inlined deck-runtime. We don't fetch config.json — the variant is baked
  // at build time (body class set on the <body> tag above). We keep the same
  // broken-image fallback, lightbox, TOC, and PDF-export plumbing as the
  // live decks so the experience is identical.
  (function () {
    // Broken-image fallback — img error events don't bubble, capture phase.
    window.addEventListener('error', function (e) {
      if (e.target && e.target.tagName === 'IMG' && e.target.classList.contains('screenshot')) {
        e.target.style.display = 'none';
        var wrap = e.target.closest('.screenshot-wrap');
        if (wrap) wrap.classList.add('screenshot-missing');
      }
    }, true);

    window.HsseStandaloneDeck = function () {
      // ─── Lightbox ────────────────────────────────────────────────────
      var lb = document.getElementById('lightbox');
      var lbImg = document.getElementById('lightboxImg');
      if (lb && lbImg) {
        document.addEventListener('click', function (e) {
          var shot = e.target.closest && e.target.closest('img.screenshot');
          if (shot && !lb.contains(shot)) {
            e.preventDefault();
            e.stopPropagation();
            lbImg.src = shot.currentSrc || shot.src;
            lbImg.alt = shot.alt || '';
            lb.hidden = false;
            return;
          }
          if (!lb.hidden && lb.contains(e.target)) {
            e.preventDefault();
            e.stopPropagation();
            lb.hidden = true;
            lbImg.src = '';
          }
        }, true);
        document.addEventListener('keydown', function (e) {
          if (!lb.hidden && e.key === 'Escape') {
            e.preventDefault();
            e.stopPropagation();
            lb.hidden = true;
            lbImg.src = '';
          }
        }, true);
      }

      // ─── TOC ─────────────────────────────────────────────────────────
      var list = document.getElementById('tocList');
      var panel = document.getElementById('tocPanel');
      var toggle = document.getElementById('tocToggle');
      var fab = document.getElementById('tocFab');
      if (!list || !panel || !toggle || !fab) return;

      function syncFab() {
        fab.classList.toggle('is-hidden', !panel.classList.contains('collapsed'));
      }
      function deriveLabel(s) {
        if (s.classList.contains('role-cover')) {
          var h1 = s.querySelector('h1');
          return { kind: 'section', text: h1 ? h1.textContent.trim() : 'Section' };
        }
        if (s.classList.contains('title-slide')) {
          var th = s.querySelector('h1');
          return { kind: 'slide', text: th ? th.textContent.trim() : 'Title' };
        }
        var heading = s.querySelector('h1, h2, h3');
        if (heading) return { kind: 'slide', text: heading.textContent.trim() };
        return { kind: 'slide', text: ((s.textContent || '').trim().split('\\n')[0].slice(0, 60) || 'Slide') };
      }
      function addRow(s, h, v, num) {
        var info = deriveLabel(s);
        var li = document.createElement('li');
        if (info.kind === 'section') {
          li.className = 'toc-section';
          li.textContent = info.text;
        } else {
          var a = document.createElement('a');
          a.href = '#';
          a.dataset.h = h;
          a.dataset.v = v;
          a.innerHTML = '<span class="toc-num"></span><span class="toc-label"></span>';
          a.querySelector('.toc-num').textContent = num;
          a.querySelector('.toc-label').textContent = info.text;
          a.addEventListener('click', function (e) {
            e.preventDefault();
            Reveal.slide(Number(a.dataset.h), Number(a.dataset.v));
          });
          li.appendChild(a);
        }
        list.appendChild(li);
      }
      function build() {
        list.innerHTML = '';
        var sections = document.querySelectorAll('.reveal .slides > section');
        var n = 0;
        sections.forEach(function (s, i) {
          var v = s.querySelectorAll(':scope > section');
          if (v.length) v.forEach(function (vs, vi) { addRow(vs, i, vi, ++n); });
          else addRow(s, i, 0, ++n);
        });
      }
      function highlight() {
        var idx = Reveal.getIndices();
        list.querySelectorAll('a').forEach(function (a) {
          var c = Number(a.dataset.h) === idx.h && Number(a.dataset.v) === (idx.v || 0);
          a.classList.toggle('is-current', c);
          if (c) a.scrollIntoView({ block: 'center', behavior: 'smooth' });
        });
      }
      toggle.addEventListener('click', function () {
        var collapsed = panel.classList.toggle('collapsed');
        toggle.textContent = collapsed ? '»' : '«';
        toggle.title = collapsed ? 'Expand' : 'Collapse';
        toggle.setAttribute('aria-label', collapsed ? 'Expand navigation' : 'Collapse navigation');
        syncFab();
      });
      fab.addEventListener('click', function () {
        panel.classList.remove('collapsed');
        toggle.textContent = '«';
        toggle.title = 'Collapse';
        toggle.setAttribute('aria-label', 'Collapse navigation');
        syncFab();
      });

      // ─── PDF export ──────────────────────────────────────────────────
      var exportBtn = document.getElementById('tocExport');
      if (exportBtn) {
        exportBtn.addEventListener('click', function (e) {
          e.preventDefault();
          var url = new URL(location.href);
          url.hash = '';
          url.searchParams.set('print-pdf', '');
          var win = window.open(url.toString(), '_blank', 'noopener');
          if (!win) location.href = url.toString();
        });
      }
      if (/print-pdf/gi.test(location.search)) {
        document.body.classList.add('is-print-pdf');
        var printed = false;
        var printOnce = function () {
          if (printed) return;
          printed = true;
          setTimeout(function () { window.print(); }, 250);
        };
        Reveal.on('pdf-ready', printOnce);
        // Safety timeout — pdf-ready may never fire in odd contexts.
        setTimeout(printOnce, 4000);
      }

      build();
      highlight();
      syncFab();
      Reveal.on('slidechanged', highlight);
      Reveal.on('ready', highlight);
    };
  })();
</script>
<script src="https://cdn.jsdelivr.net/npm/reveal.js@5.1.0/dist/reveal.js"></script>
<script src="https://cdn.jsdelivr.net/npm/reveal.js@5.1.0/plugin/markdown/markdown.js"></script>
<script src="https://cdn.jsdelivr.net/npm/reveal.js@5.1.0/plugin/notes/notes.js"></script>
<script src="https://cdn.jsdelivr.net/npm/reveal.js@5.1.0/plugin/highlight/highlight.js"></script>
<script>
  Reveal.initialize({
    width: 1280, height: 720, margin: 0.06,
    minScale: 0.2, maxScale: 2.0,
    hash: true, history: true, slideNumber: 'c/t',
    progress: true, controls: true,
    controlsLayout: 'bottom-right',
    transition: 'slide', backgroundTransition: 'fade',
    plugins: [RevealMarkdown, RevealNotes, RevealHighlight]
  }).then(window.HsseStandaloneDeck);
</script>
</body>
</html>
`;
}

function renderIndex(results) {
  // Group results by module for a cleaner landing page.
  const byModule = new Map();
  for (const r of results) {
    const key = r.slug || r.dest || r.file;
    if (!byModule.has(key)) byModule.set(key, []);
    byModule.get(key).push(r);
  }

  const groups = [...byModule.values()].map(rs => {
    const first = rs[0];
    const variants = rs.map(r => `
        <a class="variant" href="${r.file}">
          <span class="variant-label">${r.variant}</span>
          <span class="variant-size">${r.sizeMb}</span>
        </a>`).join('');
    return `
    <article class="module">
      <div class="module-header">
        <div class="module-title">${escapeHtml(first.title)}</div>
        <div class="module-estimate">${first.estimate || ''}</div>
      </div>
      <div class="variants">${variants}
      </div>
    </article>`;
  }).join('');

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>HSSE-MS Standalone Training Decks</title>
<style>
  * { box-sizing: border-box; }
  body { font-family: 'Roboto', system-ui, -apple-system, sans-serif; margin: 0; background: #FCFCFC; color: #000; }
  header {
    background: linear-gradient(135deg, #37A130 0%, #2F8E2A 100%);
    color: white; padding: 3rem 2rem 4rem; text-align: center;
  }
  header h1 { margin: 0 0 0.5rem; font-size: 2.4rem; font-weight: 700; letter-spacing: -0.015em; }
  header p { margin: 0; opacity: 0.92; font-size: 1.05rem; }
  main { max-width: 1100px; margin: -2.5rem auto 3rem; padding: 0 2rem; }
  .modules { display: flex; flex-direction: column; gap: 1rem; }
  .module {
    background: white; border: 1px solid #D2D7E0; border-radius: 8px;
    box-shadow: 0 1px 2px rgba(0,0,0,0.06), 0 4px 12px rgba(0,0,0,0.05);
    overflow: hidden;
  }
  .module-header {
    display: flex; justify-content: space-between; align-items: center;
    padding: 1rem 1.5rem; background: #F8FAF6; border-bottom: 1px solid #D2D7E0;
  }
  .module-title { font-size: 1.15rem; font-weight: 700; color: #2F8E2A; }
  .module-estimate { font-size: 0.78rem; color: #9CA3AF; font-family: ui-monospace, Consolas, monospace; }
  .variants { display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 0; }
  .variant {
    display: flex; flex-direction: column; gap: 0.25rem;
    padding: 1rem 1.5rem;
    text-decoration: none; color: inherit;
    border-right: 1px solid #E5E7EB;
    transition: background 0.12s;
  }
  .variant:last-child { border-right: none; }
  .variant:hover { background: #E9FFF3; color: #2F8E2A; }
  .variant-label {
    font-size: 0.92rem; font-weight: 600; color: #000;
    text-transform: capitalize;
  }
  .variant:hover .variant-label { color: #2F8E2A; }
  .variant-size {
    font-size: 0.78rem; color: #9CA3AF;
    font-family: ui-monospace, Consolas, monospace;
  }
  section.howto {
    margin-top: 2rem; background: white; border: 1px solid #D2D7E0;
    border-radius: 8px; padding: 1.5rem 2rem;
  }
  section.howto h2 { margin: 0 0 0.7rem; color: #2F8E2A; font-size: 1.15rem; }
  section.howto p, section.howto li { font-size: 0.92rem; line-height: 1.55; color: #333; }
  section.howto ul { margin: 0.3rem 0 0.8rem; padding-left: 1.2rem; }
  code {
    background: #E9FFF3; color: #2F8E2A;
    padding: 0.1em 0.4em; border-radius: 3px;
    font-family: ui-monospace, Consolas, monospace; font-size: 0.88em;
  }
  .footer { text-align: center; margin: 2rem 0 1rem; color: #9CA3AF; font-size: 0.78rem; }
</style>
</head>
<body>
<header>
  <h1>Standalone Training Decks</h1>
  <p>Self-contained HTML — open by double-click anywhere. No server required.</p>
</header>
<main>
  <div class="modules">${groups}
  </div>

  <section class="howto">
    <h2>How to use these</h2>
    <ul>
      <li><strong>with-screenshots</strong> — every screenshot is base64-inlined directly into the HTML. File size is larger (5–15 MB) but you get a single portable file with no broken image links.</li>
      <li><strong>text-only</strong> — every screenshot block is stripped at build time. Designed to be paired side-by-side with the live app open in another window. Small (~200–400 KB) and emails cleanly.</li>
      <li><strong>General Onboarding</strong> — first-day tour of the whole app. Text-only by design.</li>
    </ul>

    <h2>To regenerate after editing slide content</h2>
    <p>Edit <code>docs/training/&lt;module&gt;/slides.md</code> (or capture new screenshots) and run:</p>
    <p><code>node docs/training/scripts/build-standalone-decks.mjs</code></p>
    <p>Or from <code>hssems-frontend/shared-frontend</code>: <code>npm run build-standalone</code></p>

    <h2>PDF export</h2>
    <p>Open any deck and click <strong>Export as PDF</strong> in the floating side panel. Or append <code>?print-pdf</code> to the URL — the browser print dialog opens automatically. In the print dialog choose <strong>Landscape</strong>, <strong>Margins: None</strong>, and turn on <strong>Background graphics</strong>.</p>
  </section>
</main>
<div class="footer">Generated by docs/training/scripts/build-standalone-decks.mjs</div>
</body>
</html>
`;
}

function renderReadme(results) {
  const rows = results.map(r =>
    `| \`${r.file}\` | ${r.title} | ${r.variant} | ${r.sizeMb} |`
  ).join('\n');

  return `# Standalone Training Decks (build output)

**Auto-generated.** Do not hand-edit files in this folder — they're
overwritten on every build. Edit the source under
\`docs/training/<module>/slides.md\` instead.

## Files

| File | Module | Variant | Size |
|---|---|---|---|
${rows}

## Regenerate

After editing any \`slides.md\` (or capturing new screenshots):

\`\`\`bash
node docs/training/scripts/build-standalone-decks.mjs
\`\`\`

Or from \`hssems-frontend/shared-frontend\`:

\`\`\`bash
npm run build-standalone
\`\`\`

The script reads each module's \`slides.md\` + \`screenshots/\` and emits
two HTML files per module:

- \`*-with-screenshots.html\` — screenshots base64-inlined (single portable file, larger)
- \`*-text-only.html\` — every \`<div class="screenshot-wrap">…</div>\` block stripped (small, pair side-by-side with the live app)

\`general-onboarding.html\` is copied straight from
\`general-onboarding/deck.html\` because it's already standalone and has
no \`slides.md\`.

## Opening

Double-click any \`.html\` file. Reveal.js loads from a CDN — an internet
connection is required on first open only.

| Key | Action |
|---|---|
| \`F\` | Fullscreen |
| \`S\` | Speaker notes pop-out |
| \`Esc\` / \`O\` | Slide overview |
| \`?\` | Show all shortcuts |
| Space / → | Next slide |
| ← | Previous slide |

## PDF export

Click **Export as PDF** in the floating side-panel footer. The button
navigates to \`?print-pdf\` in a new tab; reveal.js's print stylesheet
(loaded synchronously in \`<head>\`) renders one print page per slide;
the browser print dialog opens automatically.

In the print dialog: **Layout: Landscape**, **Margins: None**,
**Background graphics: ON**.
`;
}

function escapeHtml(s) {
  return s.replace(/[&<>"']/g, c => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;',
    '"': '&quot;', "'": '&#39;',
  }[c]));
}

main().catch(err => {
  console.error('\n[build] FAILED');
  console.error(err.stack || err.message || err);
  process.exit(1);
});
