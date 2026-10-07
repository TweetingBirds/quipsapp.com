#!/usr/bin/env node
// Build script: assembles images/quips-press-kit.zip for the press page.
//
// The kit's text (about copy, app details, contact) is extracted from
// press.html at build time so it can never drift from the page. Assets are
// copied from images/ (icons, marketing screenshots per screenshots.json,
// App Store badge, social preview). Output is gitignored — regenerate with:
//
//   node scripts/build-press-kit.mjs
//
// Runs in CI via .github/workflows/deploy.yml. Requires the `zip` CLI
// (present on macOS and ubuntu-latest runners). No npm dependencies.

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT_ZIP = path.join(ROOT, 'images', 'quips-press-kit.zip');
const KIT_NAME = 'quips-press-kit';

function fail(message) {
    console.error(`build-press-kit: ERROR: ${message}`);
    process.exit(1);
}

// ---------------------------------------------------------------------------
// 1. Extract the press page copy as plain text
// ---------------------------------------------------------------------------

function htmlToText(html) {
    return html
        .replace(/<(script|style)[\s\S]*?<\/\1>/gi, '')
        // keep mailto addresses visible: "<a href=mailto:X>label</a>" -> "label: X"
        .replace(/<a [^>]*href="mailto:([^"?]+)[^"]*"[^>]*>([\s\S]*?)<\/a>/gi, '$2: $1')
        .replace(/<h2[^>]*>/gi, '\n\n== ')
        .replace(/<\/h2>/gi, ' ==\n')
        .replace(/<h3[^>]*>/gi, '\n')
        .replace(/<\/(h1|h3|p|li|div)>/gi, '\n')
        .replace(/<\/th>/gi, ': ')
        .replace(/<\/(td|tr)>/gi, '\n')
        .replace(/<[^>]+>/g, '')
        // decode &amp; LAST so escaped entities (&amp;lt;) don't double-decode
        .replace(/&lt;/g, '<').replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&nbsp;/g, ' ')
        .replace(/&amp;/g, '&')
        .replace(/[ \t]+/g, ' ')
        .replace(/ ?\n ?/g, '\n')
        .replace(/\n{3,}/g, '\n\n')
        .trim();
}

const pressHtml = fs.readFileSync(path.join(ROOT, 'press.html'), 'utf8');
const mainMatch = pressHtml.match(/<main[^>]*>([\s\S]*?)<\/main>/);
if (!mainMatch) fail('could not find <main> in press.html');

// Drop the Brand Assets section (download links are meaningless in the zip)
// and the "Back to Home" nav link.
const mainWithoutAssets = mainMatch[1]
    .replace(/<section class="press-section">\s*<h2>Brand Assets[\s\S]*?<\/section>/, '')
    .replace(/<a [^>]*class="back-link"[\s\S]*?<\/a>/, '');

const factSheet = [
    'QUIPS — PRESS KIT',
    `Generated from https://quipsapp.com/press.html`,
    '',
    htmlToText(mainWithoutAssets),
    '',
    '== Included Files ==',
    'icons/          App icon at 1024 / 512 / 256 px (PNG), light and dark.',
    '                The dark variant is a separate design — black tile, teal',
    '                glyph — not a recolour. Use it on dark grounds.',
    'brand/          Wordmark and icon+wordmark lockup (SVG, outlined —',
    '                no font needed to render them correctly)',
    'screenshots/    Marketing screenshots, light + dark, foldered by platform (iphone/, ipad/, mac/, iphone-duo/)',
    'quips-social-preview.png  1200x630 social/OG image',
    '',
    'The wordmark is Libre Baskerville, supplied as outlines rather than live',
    'text so it renders identically everywhere. Please do not re-set it in',
    'another face, recolour it, or stretch it.',
    '',
    'For the "Download on the App Store" badge, use Apple\'s official artwork:',
    'https://developer.apple.com/app-store/marketing/guidelines/',
].join('\n') + '\n';

// ---------------------------------------------------------------------------
// 2. Stage the kit
// ---------------------------------------------------------------------------

const stage = fs.mkdtempSync(path.join(os.tmpdir(), 'press-kit-'));
const kitDir = path.join(stage, KIT_NAME);
fs.mkdirSync(path.join(kitDir, 'icons'), { recursive: true });
fs.mkdirSync(path.join(kitDir, 'brand'), { recursive: true });
fs.mkdirSync(path.join(kitDir, 'screenshots'), { recursive: true });

fs.writeFileSync(path.join(kitDir, 'quips-press-kit.txt'), factSheet);

const skipped = [];
function copyAsset(src, dest) {
    const from = path.join(ROOT, 'images', src);
    if (!fs.existsSync(from)) {
        skipped.push(src);
        return;
    }
    // Screenshots are foldered per platform, so the destination directory may
    // not exist yet — the fixed mkdirs above only create the top-level folders.
    const to = path.join(kitDir, dest);
    fs.mkdirSync(path.dirname(to), { recursive: true });
    fs.copyFileSync(from, to);
}

copyAsset('app-icon@1024.png', 'icons/quips-app-icon-1024.png');
copyAsset('app-icon-dark@1024.png', 'icons/quips-app-icon-dark-1024.png');
// Journalists drop these straight into a layout, where a 1024 master is
// oversized and gets scaled badly by whatever tool they are using.
copyAsset('quips-app-icon-512.png', 'icons/quips-app-icon-512.png');
copyAsset('quips-app-icon-256.png', 'icons/quips-app-icon-256.png');
copyAsset('quips-app-icon-dark-512.png', 'icons/quips-app-icon-dark-512.png');
copyAsset('quips-app-icon-dark-256.png', 'icons/quips-app-icon-dark-256.png');
copyAsset('brand/quips-wordmark.svg', 'brand/quips-wordmark.svg');
copyAsset('brand/quips-wordmark-reverse.svg', 'brand/quips-wordmark-reverse.svg');
copyAsset('brand/quips-lockup.svg', 'brand/quips-lockup.svg');
copyAsset('og-image.png', 'quips-social-preview.png');

const manifest = JSON.parse(fs.readFileSync(path.join(ROOT, 'images', 'screenshots.json'), 'utf8'));
for (const screen of manifest.gallery || []) {
    // Entries predating the multi-platform manifest carry no "platform"; they
    // were all iPhone, so that is what an absent field means.
    const platform = screen.platform || 'iphone';
    const slug = (screen.source || screen.label || 'screen').toLowerCase().replace(/[^a-z0-9]+/g, '-');
    // Namespaced by platform, and foldered by it too: the same `source` now
    // appears once per platform ("main" is an iPhone, an iPad, and a Mac shot),
    // so a name built from the source alone would have the last platform
    // silently overwrite the others in the kit.
    copyAsset(screen.light, `screenshots/${platform}/quips-${platform}-${slug}-light.png`);
    copyAsset(screen.dark, `screenshots/${platform}/quips-${platform}-${slug}-dark.png`);
}

// Refuse to ship an incomplete kit — and bail BEFORE touching the existing
// zip, so a failed build never replaces a complete one on disk.
if (skipped.length) {
    fail(`missing assets, refusing to ship an incomplete kit: ${skipped.join(', ')}`);
}

// ---------------------------------------------------------------------------
// 3. Zip it
// ---------------------------------------------------------------------------

fs.mkdirSync(path.dirname(OUT_ZIP), { recursive: true });
fs.rmSync(OUT_ZIP, { force: true });
try {
    execFileSync('zip', ['-r', '-X', '-q', OUT_ZIP, KIT_NAME], { cwd: stage });
} catch (e) {
    fail(`zip failed (is the zip CLI installed?): ${e.message}`);
}
fs.rmSync(stage, { recursive: true, force: true });

const size = Math.round(fs.statSync(OUT_ZIP).size / 1024);
console.log(`build-press-kit: wrote images/quips-press-kit.zip (${size} KB)`);
