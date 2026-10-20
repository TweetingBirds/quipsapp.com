#!/usr/bin/env node
// Build script: renders the Save to Quips landing pages.
//
//   /save/q/<id>   one page per collection quote (the target of each Quote Unquote
//                  issue's "Save to Quips" button; newsletter-picks.json adds the issue number)
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
// Output is gitignored (`/save/`). Reads collections/ and newsletter-picks.json, which CI
// pulls from data.quipsapp.com before this runs; with no data the build still writes /save/.
// Run locally with: node scripts/build-save-pages.mjs. scripts/check-save-pages.mjs imports
// the page functions to check their dates, so the build only runs when this file is the
// script node was started with.

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

// quoteDate comes in many shapes: "1997", "1933-03-04", "c. 1906", "c. 431 BCE",
// "c. 4th century BCE", "c. 1950s-1960s". The credit shows it as written. Only an ISO 8601
// date, full or partial (what the Quote Markup spec allows in dt-published), also goes into
// <time datetime> and the JSON-LD; the other shapes have no honest machine-readable value.
const ISO_DATE = /^\d{4}(-\d{2}(-\d{2})?)?$/;

function machineDate(date) {
    return ISO_DATE.test(date) ? date : '';
}

// Many sources already carry the date in parentheses: "Pooh's Grand Adventure: The Search
// for Christopher Robin (1997)", "Meditations, Book 2 (c. 170-180 CE)", "Laelius de
// Amicitia, VI.20 (44 BC)", "The Friends of Voltaire (1906), written under ...". Printing
// it again after one of those reads as a typo. The date is compared without its "c." or
// era, and a full date by its year.
function sourceHasDate(source, date) {
    if (!source || !date) return false;
    const core = date.replace(/^c\.\s*/i, '').replace(/\s*\b(BCE|CE|BC|AD)$/i, '').replace(/^(\d{4})-\d{2}(-\d{2})?$/, '$1');
    const escaped = core.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return new RegExp(`\\([^()]*(?<!\\w)${escaped}(?!\\w)[^()]*\\)`).test(source);
}

// The dates the query page passes on to quips://add. Anyone can write a /save link, and
// Quips 2.0 and 2.1 trap on an overflowing century ("99999999999999999th century"), so only
// the shapes a person writes for a quote's date get through: a year of up to four digits
// with an optional era, YYYY-MM or YYYY-MM-DD, a decade ("1950s") or a one- or two-digit
// century ("4th century BCE"), each optionally after "c.". Anything else is left out of the
// app link; the page still shows it.
export const APP_DATE = /^(?:c\.\s*)?(?:\d{4}-\d{2}(?:-\d{2})?|(?:\d{1,4}|\d{3}0s|\d{1,2}(?:st|nd|rd|th)\s+century)(?:\s*(?:BCE|CE|BC|AD))?)$/i;

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

// "Open in Quips" is a quips:// link because a Universal Link tapped on a quipsapp.com page
// opens Safari, not the app, so this page is where someone who has the app lands. It fills
// the Add Quote editor from the quote's own fields.
function actions(openHref) {
    return `        <div class="actions">
            <a class="button" id="open-in-app" href="${openHref}">Open in Quips</a>
            <a class="button secondary" href="/go/appstore.html?p=save">Get Quips</a>
            <button class="button secondary" id="copy-quote" type="button">Copy quote</button>
        </div>
        <p class="note">Quips saves quotes with their source, and checks whether the attribution holds up.
        Already have it? Choose Open in Quips to review and save the quote.</p>`;
}

function openHref(quote) {
    const q = new URLSearchParams({ content: quote.content, author: quote.authorName || '' });
    if (quote.source) q.set('source', quote.source);
    if (quote.quoteDate) q.set('date', String(quote.quoteDate));
    return escapeHtml(`quips://add?${q.toString().replace(/\+/g, '%20')}`);
}

export function quotePage(quote) {
    const date = quote.quoteDate ? String(quote.quoteDate).trim() : '';
    const iso = machineDate(date);
    // When the source already shows the date, an ISO value still goes in as an empty
    // <time>, so microformats readers keep it.
    let dateHtml = '';
    if (date && !sourceHasDate(quote.source, date)) {
        dateHtml = iso
            ? `\n                (<time class="dt-published" datetime="${escapeHtml(iso)}">${escapeHtml(date)}</time>)`
            : `\n                (${escapeHtml(date)})`;
    } else if (iso) {
        dateHtml = `<time class="dt-published" datetime="${escapeHtml(iso)}"></time>`;
    }
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
    if (quote.source) ld.isPartOf = { '@type': 'CreativeWork', name: quote.source, ...(iso ? { datePublished: iso } : {}) };

    const body = `        <figure class="h-cite">
            <blockquote class="p-content">${escapeHtml(quote.content)}</blockquote>
            <figcaption id="credit">
                &mdash; <span class="p-author h-card">${escapeHtml(quote.authorName)}</span>${quote.source ? `,
                <cite class="p-name">${escapeHtml(quote.source)}</cite>` : ''}${dateHtml}
            </figcaption>
        </figure>
${actions(openHref(quote))}${issue}`;

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
${actions('quips://add')}
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
        var open = new URLSearchParams({ content: text, author: author });
        if (work) open.set('source', work);
        if (${APP_DATE}.test(date.trim())) open.set('date', date.trim());
        document.getElementById('open-in-app').href = 'quips://add?' + open.toString().replace(/\\+/g, '%20');
        document.getElementById('quote').hidden = false;
        document.getElementById('actions').hidden = false;
        document.getElementById('empty').hidden = true;
    })();` + COPY_SCRIPT;

export function queryPage() {
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

function build() {
    fs.rmSync(OUT, { recursive: true, force: true });
    write(path.join(OUT, 'index.html'), queryPage());

    // Every collection quote gets a page, not only the sent Newsletter Picks: an issue's email
    // is built while the issue is still `scheduled`, when the picks feed does not carry it yet,
    // and its Save to Quips link has to work from the moment it goes out. The picks feed only
    // adds the issue number.
    const issueByQuote = new Map();
    const feedPath = path.join(ROOT, 'newsletter-picks.json');
    if (fs.existsSync(feedPath)) {
        const feed = JSON.parse(fs.readFileSync(feedPath, 'utf8'));
        for (const quote of feed.quotes || []) issueByQuote.set(quote.id, quote.newsletterIssue);
    }

    let count = 0;
    const collectionsDir = path.join(ROOT, 'collections');
    if (fs.existsSync(collectionsDir)) {
        for (const name of fs.readdirSync(collectionsDir).sort()) {
            if (!name.endsWith('.json')) continue;
            const collection = JSON.parse(fs.readFileSync(path.join(collectionsDir, name), 'utf8'));
            for (const quote of collection.quotes || []) {
                if (!SAFE_ID.test(quote.id || '') || !quote.content) {
                    console.warn(`build-save-pages: skipping quote with unusable id/content: ${quote.id}`);
                    continue;
                }
                const issue = issueByQuote.get(quote.id);
                write(path.join(OUT, 'q', `${quote.id}.html`),
                    quotePage(issue ? { ...quote, newsletterIssue: issue } : quote));
                count += 1;
            }
        }
    } else {
        console.warn('build-save-pages: collections/ not found; wrote /save/ only');
    }
    console.log(`build-save-pages: wrote /save/ and ${count} quote page(s)`);
}

if (process.argv[1] && fs.realpathSync(process.argv[1]) === fileURLToPath(import.meta.url)) build();
