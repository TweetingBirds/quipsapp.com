#!/usr/bin/env node
// Build script: renders the Save to Quips landing pages.
//
//   /save/q/<id>   one page per collection quote (the target of each Quote Unquote
//                  issue's "Save to Quips" button; newsletter-picks.json adds the issue number, and the
//                  issue pages in quote-unquote/ add a link to the issue itself)
//   /save/         the page for `https://quipsapp.com/save?text=...` links, which fills
//                  itself from the query string in the browser. Anyone can write such a link, so
//                  the page says the quote came from the link and has not been checked, and it
//                  makes no claim about checking attributions (that is true of /save/q/ pages only)
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
// pulls from data.quipsapp.com before this runs, and quote-unquote/ and quote-unquote.html from
// this repo; with no data the build still writes /save/.
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
// Hand-authored issue pages: quote-unquote/<n>-<slug>.html.
const ISSUE_FILE = /^(\d{1,3})-[a-z0-9-]+\.html$/;

// Which quote each Quote Unquote issue features, read from the issue pages themselves. Each
// quote-unquote/<n>-<slug>.html has one "Add quote to Quips" button, /save/q/<quoteId>, the same
// id as the issue's quoteId in the quote-unquote repo. That covers an issue from the moment its
// page is merged, before the email goes out, when newsletter-picks.json does not carry it yet.
//
// A page is linked only if quote-unquote.html lists it in the archive, the way readers get there.
// The archive entry of an issue that has not been sent carries `data-publish-at`, and its link
// stays hidden until then (js/main.js, "Timestamp Guard"); the page file is already deployed. The
// Save page's link uses the same time: `publishAt` is that time while it is still ahead, and null
// once it has passed or the entry has none.
//
//   Map<quoteId, { number, file, href, publishAt }>, plus `problems`: issue pages that cannot be
//   linked unambiguously (no or several save links, a quote or number claimed twice, a bad time).
export function issuePages(root = ROOT, now = Date.now()) {
    const byQuote = new Map();
    const problems = [];
    const dir = path.join(root, 'quote-unquote');
    const landing = path.join(root, 'quote-unquote.html');
    if (!fs.existsSync(dir) || !fs.existsSync(landing)) return { byQuote, problems };

    const archive = new Map();
    for (const [, file, attrs] of fs.readFileSync(landing, 'utf8').matchAll(/<a class="qu-archive-item" href="quote-unquote\/([^"]+)"([^>]*)>/g)) {
        archive.set(file, attrs.match(/\bdata-publish-at="([^"]*)"/)?.[1] ?? null);
    }

    const numbers = new Map();
    for (const file of fs.readdirSync(dir).sort()) {
        const named = file.match(ISSUE_FILE);
        if (!named) continue;
        const number = Number(named[1]);
        const ids = new Set([...fs.readFileSync(path.join(dir, file), 'utf8')
            .matchAll(/href="\/save\/q\/([^"]*)"/g)].map((match) => match[1]));
        if (ids.size !== 1 || ![...ids].every((id) => SAFE_ID.test(id))) {
            problems.push(`quote-unquote/${file}: expected exactly one /save/q/<id> link, found ${ids.size ? [...ids].join(', ') : 'none'}`);
            continue;
        }
        const [id] = ids;
        if (numbers.has(number)) problems.push(`quote-unquote/${file}: issue ${number} is also ${numbers.get(number)}`);
        numbers.set(number, file);
        if (byQuote.has(id)) problems.push(`quote-unquote/${file}: ${id} is also the quote of ${byQuote.get(id).file}`);
        if (!archive.has(file)) continue; // not announced yet: no link
        const stamp = archive.get(file);
        const at = stamp === null ? null : Date.parse(stamp);
        if (at !== null && Number.isNaN(at)) {
            problems.push(`quote-unquote.html: data-publish-at for ${file} is not a date: ${stamp}`);
            continue;
        }
        byQuote.set(id, { number, file, href: `/quote-unquote/${file}`, publishAt: at !== null && at > now ? stamp : null });
    }
    return { byQuote, problems };
}

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
            // Some in-app mail browsers have no Clipboard API, or refuse it. Select the
            // quote instead, so a long-press or Command-C copies it.
            function selectInstead() {
                var selection = window.getSelection && window.getSelection();
                if (selection) selection.selectAllChildren(document.querySelector('figure'));
                button.textContent = 'Select the text to copy';
            }
            if (navigator.clipboard && navigator.clipboard.writeText) {
                navigator.clipboard.writeText(full).then(function () { button.textContent = 'Copied'; }, selectInstead);
            } else {
                selectInstead();
            }
        });
    })();`;

// Reveals a [data-publish-at] element at that time, like js/main.js does on the other pages (the
// Save pages don't load it). The page is built before an unsent issue goes out, so the note
// about it ships hidden; without script it stays hidden.
const PUBLISH_GUARD_SCRIPT = `
    (function () {
        document.querySelectorAll('[data-publish-at]').forEach(function (node) {
            var at = Date.parse(node.getAttribute('data-publish-at'));
            if (isNaN(at)) return;
            var wait = at - Date.now();
            if (wait <= 0) node.hidden = false;
            else if (wait < 2147483647) setTimeout(function () { node.hidden = false; }, wait);
        });
    })();`;

function page({ title, canonical, description, body, script, head = '', style = '' }) {
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
    <!-- app-argument returns an installer to this quote. -->
    <meta name="apple-itunes-app" content="app-id=6752503448, app-argument=${escapeHtml(canonical)}">
    <style>${STYLE}${style}
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
// the Add Quote editor from the quote's own fields. Without the app it errors or does
// nothing, hence "(if installed)".
//
// `note` is the sentence under the buttons. The default describes Quips and its attribution
// research, which is true of a quote from the collections; the query page, whose quote is
// whatever the link says, passes its own.
const COLLECTION_NOTE = `Quips saves quotes with their source, and checks whether the attribution holds up.
        Already have it? Choose Open in Quips to review and save the quote. <a href="/support.html">What is this?</a>`;

function actions(openHref, note = COLLECTION_NOTE) {
    return `        <div class="actions">
            <a class="button" id="open-in-app" href="${openHref}">Open in Quips (if installed)</a>
            <a class="button secondary" href="/go/appstore.html?p=save">Get Quips</a>
            <button class="button secondary" id="copy-quote" type="button">Copy quote</button>
        </div>
        <p class="note">${note}</p>`;
}

function openHref(quote) {
    const q = new URLSearchParams({ content: quote.content, author: quote.authorName || '' });
    if (quote.source) q.set('source', quote.source);
    if (quote.quoteDate) q.set('date', String(quote.quoteDate));
    return escapeHtml(`quips://add?${q.toString().replace(/\+/g, '%20')}`);
}

// "Featured in Quote Unquote, issue 3." The issue number links to the issue when its page is
// known (see issuePages); otherwise the number comes from newsletter-picks.json and is plain text.
function issueNote(quote, issuePage) {
    if (!issuePage && !quote.newsletterIssue) return '';
    const issue = issuePage
        ? `<a href="${escapeHtml(issuePage.href)}">issue ${Number(issuePage.number)}</a>`
        : `issue ${Number(quote.newsletterIssue)}`;
    const guard = issuePage && issuePage.publishAt ? ` hidden data-publish-at="${escapeHtml(issuePage.publishAt)}"` : '';
    return `\n        <p class="note"${guard}>Featured in <a href="/quote-unquote.html">Quote Unquote</a>, ${issue}.</p>`;
}

export function quotePage(quote, issuePage = null) {
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
    const issue = issueNote(quote, issuePage);
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
        script: COPY_SCRIPT + (issuePage && issuePage.publishAt ? PUBLISH_GUARD_SCRIPT : ''),
        head: `\n    <script type="application/ld+json">\n${jsonLd(ld)}\n    </script>`,
    });
}

// The query-string form fills itself in the browser. Every value goes in through
// textContent, because the parameters are untrusted text.
//
// Anyone can write this link, so the quote on it is the link author's claim and nothing more.
// The page says so right above the quote, inside the figure, so a screenshot of the quote
// carries the label. It has no `h-cite` or `p-content` class: it is not a citation Quips
// publishes, and the share extension would otherwise read it as one. It also drops the brand
// teal rule and the display serif that the /save/q/ pages use for a quote Quips stands behind,
// and it makes no claim to check the attribution.
const QUERY_NOTE = `Already have Quips? Choose Open in Quips to review the quote. Nothing is saved until you
        confirm. <a href="/support.html">What is this?</a>`;

const QUERY_BODY = `        <figure id="quote" hidden>
            <p class="origin">From the link you followed, not from the Quips collections. Quips hasn't checked it.</p>
            <blockquote id="text" dir="auto"></blockquote>
            <figcaption id="credit" dir="auto"></figcaption>
        </figure>
        <p id="empty">This link doesn't carry a quote. <a href="/">Explore Quips</a>.</p>
        <div id="actions" hidden>
${actions('quips://add', QUERY_NOTE)}
        </div>`;

// The plain look of a quote that came from a link: the body face at a reading size, a neutral
// rule, and long unbroken strings wrapped instead of widening the page.
const QUERY_STYLE = `
        .origin { margin: 0 0 1rem; padding: 0.5rem 0.75rem; border: 1px solid #8A8A8A;
                  border-radius: 0.4rem; font-size: 0.9rem; }
        #quote blockquote { border-left-color: #8A8A8A; font-family: inherit; font-size: 1.15rem;
                            line-height: 1.5; overflow-wrap: anywhere; }
        #quote figcaption { overflow-wrap: anywhere; }`;

// The values shown on the page lose the bidirectional embedding, override and isolate
// controls (U+202A-202E, U+2066-2069), which can make text read as something else. The
// link to the app carries the values as written.
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
        function shown(value) { return value.replace(/[\\u202A-\\u202E\\u2066-\\u2069]/g, ''); }
        if (character) parts.push(shown(character));
        if (author) parts.push(shown(author));
        if (work) parts.push(shown(work));
        var credit = (parts.length ? '\\u2014 ' + parts.join(', ') : '') + (date ? ' (' + shown(date) + ')' : '');
        document.getElementById('text').textContent = shown(text);
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
        title: 'Quote from a link — Quips',
        canonical: `${SITE}/save/`,
        description: 'A quote carried in a link. It is not from the Quips collections, and Quips has not checked it.',
        body: QUERY_BODY,
        script: QUERY_SCRIPT,
        style: QUERY_STYLE,
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

    // The issue pages say which quote each issue features, including issues not sent yet.
    const { byQuote: issueByPage, problems } = issuePages();
    for (const problem of problems) console.warn(`build-save-pages: ${problem}`);

    let count = 0;
    let linked = 0;
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
                let issuePage = issueByPage.get(quote.id) || null;
                if (issuePage && issue) {
                    // The feed lists sent issues only, so the note is public whatever the archive says.
                    if (issue !== issuePage.number) {
                        console.warn(`build-save-pages: ${quote.id} is issue ${issue} in newsletter-picks.json but ${issuePage.file} is issue ${issuePage.number}`);
                    }
                    issuePage = { ...issuePage, publishAt: null };
                }
                if (issuePage) linked += 1;
                write(path.join(OUT, 'q', `${quote.id}.html`),
                    quotePage(issue ? { ...quote, newsletterIssue: issue } : quote, issuePage));
                count += 1;
            }
        }
    } else {
        console.warn('build-save-pages: collections/ not found; wrote /save/ only');
    }
    console.log(`build-save-pages: wrote /save/ and ${count} quote page(s), ${linked} linked to their Quote Unquote issue`);
}

if (process.argv[1] && fs.realpathSync(process.argv[1]) === fileURLToPath(import.meta.url)) build();
