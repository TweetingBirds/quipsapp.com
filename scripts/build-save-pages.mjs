#!/usr/bin/env node
// Build script: renders the Save to Quips landing pages.
//
//   /save/q/<id>   one page per quote in newsletter-picks.json (the Quote Unquote
//                  featured quotes), the target of each issue's "Save to Quips" button
//   /save/         the page for `https://quipsapp.com/save?text=...` links, which fills
//                  itself from the query string in the browser
//
// With Quips installed iOS opens the app directly (Universal Links; see
// .well-known/apple-app-site-association) and none of these pages load. Without it, the
// same URL lands here: the quote, an App Store link, and a Copy button.
//
// The quote is marked up as microformats2 `h-cite` plus schema.org `Quotation` JSON-LD,
// the profile the app's Quote Markup spec publishes, so these pages are its first
// real-world example.
//
// Output is gitignored (`/save/`). Reads newsletter-picks.json, which CI pulls from
// data.quipsapp.com before this runs; with no feed the build still writes /save/.
// Run locally with: node scripts/build-save-pages.mjs

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SITE = 'https://quipsapp.com';
const OUT = path.join(ROOT, 'save');
// Public collection ids; anything else is not a file name this script will write.
const SAFE_ID = /^[A-Za-z0-9_-]{1,128}$/;

function escapeHtml(text) {
    if (text === null || text === undefined) return '';
    return String(text)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

// JSON-LD sits inside <script>, so `<` must never appear literally.
function jsonLd(value) {
    return JSON.stringify(value, null, 2).replace(/</g, '\\u003c');
}

const STYLE = `
        body { font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
               background: #FFFFFF; color: #1A1A1A; margin: 0; padding: 1.5rem; line-height: 1.6;
               display: flex; justify-content: center; }
        @media (prefers-color-scheme: dark) { body { background: #121212; color: #F5F5F5; } }
        main { max-width: 34rem; width: 100%; padding-top: 3rem; }
        figure { margin: 0 0 2rem; }
        blockquote { margin: 0 0 1rem; padding: 0 0 0 1rem; border-left: 4px solid #00B8B2;
                     font-family: 'Baskerville', Georgia, serif; font-size: 1.5rem; line-height: 1.4; }
        figcaption { color: #5A5A5A; font-size: 0.95rem; }
        @media (prefers-color-scheme: dark) { figcaption { color: #B5B5B5; } }
        .actions { display: flex; flex-wrap: wrap; gap: 0.75rem; margin-bottom: 1.5rem; }
        .button { display: inline-block; padding: 0.65rem 1.1rem; border-radius: 0.6rem; border: 0;
                  background: #00B8B2; color: #04201F; font: inherit; font-weight: 600;
                  text-decoration: none; cursor: pointer; }
        .button.secondary { background: transparent; color: inherit; border: 1px solid #8A8A8A; }
        .note { color: #5A5A5A; font-size: 0.9rem; }
        @media (prefers-color-scheme: dark) { .note { color: #B5B5B5; } }
        a { color: #00B8B2; }
        [hidden] { display: none; }`;

const COPY_SCRIPT = `
    (function () {
        var button = document.getElementById('copy-quote');
        if (!button) return;
        button.addEventListener('click', function () {
            var text = document.querySelector('blockquote').textContent.trim();
            var credit = document.getElementById('credit').textContent.trim();
            var full = '\\u201C' + text + '\\u201D ' + credit;
            if (navigator.clipboard && navigator.clipboard.writeText) {
                navigator.clipboard.writeText(full).then(function () { button.textContent = 'Copied'; });
            }
        });
    })();`;

function page({ title, canonical, description, body, script, head = '' }) {
    return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <meta http-equiv="Content-Security-Policy" content="default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; base-uri 'self'; form-action 'none'; object-src 'none';">
    <meta name="robots" content="noindex">
    <title>${escapeHtml(title)}</title>
    <meta name="description" content="${escapeHtml(description)}">
    <link rel="canonical" href="${escapeHtml(canonical)}">
    <!-- TODO(launch): uncomment and set the App Store id; app-argument returns an
         installer to this quote.
    <meta name="apple-itunes-app" content="app-id=XXXXXXXXXX, app-argument=${escapeHtml(canonical)}">
    -->
    <style>${STYLE}
    </style>${head}
</head>
<body>
    <main>
${body}
    </main>
    <script>${script}
    </script>
</body>
</html>
`;
}

const ACTIONS = `        <div class="actions">
            <a class="button" href="/go/appstore.html?p=save">Get Quips</a>
            <button class="button secondary" id="copy-quote" type="button">Copy quote</button>
        </div>
        <p class="note">Quips saves quotes with their source, and checks whether the attribution holds up.
        Already have it? Open this link on your iPhone, iPad or Mac and the quote opens in the app.</p>`;

function quotePage(quote) {
    const date = quote.quoteDate ? String(quote.quoteDate) : '';
    const year = date.slice(0, 4);
    const credit = [quote.authorName, quote.source].filter(Boolean).join(', ');
    const canonical = `${SITE}/save/q/${quote.id}`;
    const issue = quote.newsletterIssue
        ? `\n        <p class="note">Featured in <a href="/quote-unquote.html">Quote Unquote</a>, issue ${Number(quote.newsletterIssue)}.</p>`
        : '';
    const ld = {
        '@context': 'https://schema.org',
        '@type': 'Quotation',
        text: quote.content,
        creator: { '@type': 'Person', name: quote.authorName },
    };
    if (quote.source) ld.isPartOf = { '@type': 'CreativeWork', name: quote.source, ...(year ? { datePublished: year } : {}) };

    const body = `        <figure class="h-cite">
            <blockquote class="p-content">${escapeHtml(quote.content)}</blockquote>
            <figcaption id="credit">
                &mdash; <span class="p-author h-card">${escapeHtml(quote.authorName)}</span>${quote.source ? `,
                <cite class="p-name">${escapeHtml(quote.source)}</cite>` : ''}${year ? `
                (<time class="dt-published" datetime="${escapeHtml(year)}">${escapeHtml(year)}</time>)` : ''}
            </figcaption>
        </figure>
${ACTIONS}${issue}`;

    return page({
        title: `${quote.authorName}: Save to Quips`,
        canonical,
        description: `Save this quote by ${quote.authorName} to Quips.`,
        body,
        script: COPY_SCRIPT,
        head: `\n    <script type="application/ld+json">\n${jsonLd(ld)}\n    </script>`,
    });
}

// The query-string form fills itself in the browser. Every value goes in through
// textContent, because the parameters are untrusted text.
const QUERY_BODY = `        <figure class="h-cite" id="quote" hidden>
            <blockquote class="p-content" id="text"></blockquote>
            <figcaption id="credit"></figcaption>
        </figure>
        <p id="empty">This link doesn't carry a quote. <a href="/">Explore Quips</a>.</p>
        <div id="actions" hidden>
${ACTIONS}
        </div>`;

const QUERY_SCRIPT = `
    (function () {
        var params = new URLSearchParams(window.location.search);
        var text = (params.get('text') || '').slice(0, 5000);
        if (!text) return;
        var parts = [];
        var author = (params.get('author') || '').slice(0, 200);
        var work = (params.get('work') || '').slice(0, 300);
        var date = (params.get('date') || '').slice(0, 64);
        var character = (params.get('character') || '').slice(0, 200);
        if (character) parts.push(character);
        if (author) parts.push(author);
        if (work) parts.push(work);
        var credit = (parts.length ? '\\u2014 ' + parts.join(', ') : '') + (date ? ' (' + date + ')' : '');
        document.getElementById('text').textContent = text;
        document.getElementById('credit').textContent = credit;
        document.getElementById('quote').hidden = false;
        document.getElementById('actions').hidden = false;
        document.getElementById('empty').hidden = true;
    })();` + COPY_SCRIPT;

function queryPage() {
    return page({
        title: 'Save to Quips',
        canonical: `${SITE}/save/`,
        description: 'Save this quote to Quips.',
        body: QUERY_BODY,
        script: QUERY_SCRIPT,
    });
}

function write(file, contents) {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, contents);
}

fs.rmSync(OUT, { recursive: true, force: true });
write(path.join(OUT, 'index.html'), queryPage());

let count = 0;
const feedPath = path.join(ROOT, 'newsletter-picks.json');
if (fs.existsSync(feedPath)) {
    const feed = JSON.parse(fs.readFileSync(feedPath, 'utf8'));
    for (const quote of feed.quotes || []) {
        if (!SAFE_ID.test(quote.id || '') || !quote.content) {
            console.warn(`build-save-pages: skipping quote with unusable id/content: ${quote.id}`);
            continue;
        }
        write(path.join(OUT, 'q', `${quote.id}.html`), quotePage(quote));
        count += 1;
    }
} else {
    console.warn('build-save-pages: newsletter-picks.json not found; wrote /save/ only');
}
console.log(`build-save-pages: wrote /save/ and ${count} quote page(s)`);
