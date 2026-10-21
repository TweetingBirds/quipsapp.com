#!/usr/bin/env node
// Checks the dates on the Save to Quips pages (scripts/build-save-pages.mjs) against the
// shapes quoteDate takes in the collections, the query page's filter on the `date` it
// passes to quips://add, and the link from a quote's page to its Quote Unquote issue: that
// every issue page is matched to one quote, that each link lands on a file in this repo, and
// that an unsent issue's link stays hidden until its time. Exits non-zero on the first failure.
// CI runs it before the build.
// Run locally with: node scripts/check-save-pages.mjs

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import { APP_DATE, issuePages, queryPage, quotePage } from './build-save-pages.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', '#39': "'", mdash: '—' };

// The credit as a reader sees it, plus the machine-readable dates.
function render(quoteDate, source = 'A Source') {
    const html = quotePage({ id: 'check-001', content: 'Words.', authorName: 'Someone', source, quoteDate });
    const caption = html.match(/<figcaption id="credit">([\s\S]*?)<\/figcaption>/)[1];
    const ld = JSON.parse(html.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/)[1]);
    return {
        text: caption.replace(/<[^>]+>/g, '').replace(/&(\w+|#\d+);/g, (all, name) => ENTITIES[name] ?? all)
            .replace(/\s+/g, ' ').trim(),
        datetime: caption.match(/datetime="([^"]*)"/)?.[1] ?? null,
        datePublished: ld.isPartOf?.datePublished ?? null,
    };
}

const quoteCases = [
    // [quoteDate, source, visible credit, datetime and datePublished]
    ['c. 1906', 'A Source', '— Someone, A Source (c. 1906)', null],
    ['c. 431 BCE', 'A Source', '— Someone, A Source (c. 431 BCE)', null],
    ['c. 4th century BCE', 'A Source', '— Someone, A Source (c. 4th century BCE)', null],
    ['2014-03', 'A Source', '— Someone, A Source (2014-03)', '2014-03'],
    ['1997-06-30', 'A Source', '— Someone, A Source (1997-06-30)', '1997-06-30'],
    ['1997', 'A Source', '— Someone, A Source (1997)', '1997'],
    // The source already ends in the year: no second "(1997)", but the value stays.
    ['1997', "Pooh's Grand Adventure: The Search for Christopher Robin (1997)",
        "— Someone, Pooh's Grand Adventure: The Search for Christopher Robin (1997)", '1997'],
    ['c. 1906', 'The Friends of Voltaire (1906), written under the pen name S. G. Tallentyre',
        '— Someone, The Friends of Voltaire (1906), written under the pen name S. G. Tallentyre', null],
    ['c. 170-180 CE', 'Meditations, Book 2 (c. 170-180 CE)', '— Someone, Meditations, Book 2 (c. 170-180 CE)', null],
    ['1991', "'No Peaceful Warriors!', Gnosis magazine #21 (Fall 1991)",
        "— Someone, 'No Peaceful Warriors!', Gnosis magazine #21 (Fall 1991)", '1991'],
    ['c. 44 BCE', 'Laelius de Amicitia, VI.20 (44 BC)', '— Someone, Laelius de Amicitia, VI.20 (44 BC)', null],
    ['c. 13th century', 'Attributed (13th century)', '— Someone, Attributed (13th century)', null],
    ['1913-08-09', 'Indian Opinion (Gujarati), August 9, 1913', '— Someone, Indian Opinion (Gujarati), August 9, 1913 (1913-08-09)', '1913-08-09'],
    // A year in the source that isn't the quote's date doesn't hide it.
    ['1995', 'A Book (1997)', '— Someone, A Book (1997) (1995)', '1995'],
    [undefined, 'A Source', '— Someone, A Source', null],
];

let checks = 0;
for (const [quoteDate, source, text, machine] of quoteCases) {
    const got = render(quoteDate, source);
    assert.deepEqual(got, { text, datetime: machine, datePublished: machine }, `quoteDate ${JSON.stringify(quoteDate)}`);
    checks += 1;
}

// What the query page's own script puts in the Open in Quips link, run against stand-ins
// for the few DOM pieces it touches.
function forwardedDate(date) {
    const script = queryPage().match(/<script>([\s\S]*?)<\/script>/)[1];
    const elements = {};
    const element = (id) => (elements[id] ??= { hidden: true, textContent: '', href: '', addEventListener() {} });
    const search = '?' + new URLSearchParams({ text: 'Words.', author: 'Someone', date });
    vm.runInNewContext(script, {
        window: { location: { search } },
        document: { getElementById: element, querySelector: () => ({ textContent: '' }) },
        navigator: {},
        URLSearchParams,
    });
    const href = elements['open-in-app'].href;
    assert.ok(href.startsWith('quips://add?'), `query page set no app link for date ${JSON.stringify(date)}`);
    return new URLSearchParams(href.slice('quips://add?'.length)).get('date');
}

const forwarded = ['1997', 'c. 1906', 'c. 431 BCE', '44 BC', '1066 AD', '1997-06', '1997-06-30',
    '1950s', 'c. 1950s', '4th century BCE', 'c. 21st century', 'c. 30 CE', 'C. 1906', ' 1997 '];
const dropped = ['99999999999999999th century', '123rd century', '12345', '19999 BCE', 'c. 1950s-1960s',
    '1997-06-30T00:00', '14 Jan 1970', 'yesterday', '1997-6'];

for (const date of forwarded) {
    assert.ok(APP_DATE.test(date.trim()), `APP_DATE should accept ${JSON.stringify(date)}`);
    assert.equal(forwardedDate(date), date.trim(), `query page should forward ${JSON.stringify(date)}`);
    checks += 1;
}
for (const date of dropped) {
    assert.ok(!APP_DATE.test(date.trim()), `APP_DATE should reject ${JSON.stringify(date)}`);
    assert.equal(forwardedDate(date), null, `query page should drop ${JSON.stringify(date)}`);
    checks += 1;
}

// The link to the Quote Unquote issue. `issuePages` reads the real issue pages and the archive
// list; the cases below use the same shapes with a fixed clock.
const quote = { id: 'check-001', content: 'Words.', authorName: 'Someone', source: 'A Source' };
const noteOf = (html) => html.match(/<p class="note"[^>]*>Featured in [\s\S]*?<\/p>/)?.[0] ?? null;
const issue = { number: 3, file: '3-hall.html', href: '/quote-unquote/3-hall.html', publishAt: null };
const LANDING = '<a href="/quote-unquote.html">Quote Unquote</a>';

// A public issue links its number. Nothing hides it.
assert.equal(noteOf(quotePage(quote, issue)),
    `<p class="note">Featured in ${LANDING}, <a href="/quote-unquote/3-hall.html">issue 3</a>.</p>`);
assert.ok(!quotePage(quote, issue).includes('data-publish-at'), 'a public issue needs no guard');
// An issue that has not been sent keeps the whole note hidden until its time, and the page
// carries the script that reveals it.
const guarded = quotePage(quote, { ...issue, publishAt: '2026-10-22T13:00:00Z' });
assert.equal(noteOf(guarded),
    `<p class="note" hidden data-publish-at="2026-10-22T13:00:00Z">Featured in ${LANDING}, <a href="/quote-unquote/3-hall.html">issue 3</a>.</p>`);
checks += 3;

// That script, run on either side of the time.
function revealed(publishAt, now) {
    const node = { hidden: true, getAttribute: () => publishAt };
    const timers = [];
    vm.runInNewContext(guarded.match(/<script>([\s\S]*?)<\/script>/g).at(-1).replace(/<\/?script>/g, ''), {
        document: { querySelectorAll: () => [node], getElementById: () => null },
        Date: { parse: Date.parse, now: () => Date.parse(now) },
        setTimeout: (fn, wait) => timers.push({ fn, wait }),
        isNaN,
    });
    const before = !node.hidden;
    timers.forEach((timer) => timer.fn());
    return { before, after: !node.hidden, waits: timers.map((timer) => timer.wait) };
}
assert.deepEqual(revealed('2026-10-22T13:00:00Z', '2026-10-22T13:00:01Z'), { before: true, after: true, waits: [] });
assert.deepEqual(revealed('2026-10-22T13:00:00Z', '2026-10-22T12:00:00Z'), { before: false, after: true, waits: [3600000] });
assert.deepEqual(revealed('not a date', '2026-10-22T12:00:00Z'), { before: false, after: false, waits: [] });
checks += 3;

// With only the feed's issue number there is no page to link: the note reads as it always has.
assert.equal(noteOf(quotePage({ ...quote, newsletterIssue: 2 })), `<p class="note">Featured in ${LANDING}, issue 2.</p>`);
assert.equal(noteOf(quotePage(quote)), null);
// The page wins over the feed for the number it links, and nothing in it reaches the markup unescaped.
assert.equal(noteOf(quotePage({ ...quote, newsletterIssue: 9 }, issue)),
    `<p class="note">Featured in ${LANDING}, <a href="/quote-unquote/3-hall.html">issue 3</a>.</p>`);
assert.ok(!noteOf(quotePage(quote, { ...issue, href: '/x"><script>', publishAt: '"><b>' })).includes('<script>'));
checks += 4;

// Against the real files: every issue page is matched to exactly one quote, and each link
// lands on a page that exists here, is listed in the archive, and is not a stray file.
const { byQuote, problems } = issuePages(ROOT, Date.parse('2026-10-20T00:00:00Z'));
assert.deepEqual(problems, []);
assert.ok(byQuote.size > 0, 'no Quote Unquote issue page was matched to a quote');
const collections = path.join(ROOT, 'collections');
const quoteIds = new Set();
if (fs.existsSync(collections)) {
    for (const name of fs.readdirSync(collections).filter((file) => file.endsWith('.json'))) {
        for (const q of JSON.parse(fs.readFileSync(path.join(collections, name), 'utf8')).quotes || []) quoteIds.add(q.id);
    }
}
for (const [id, page] of byQuote) {
    assert.ok(fs.existsSync(path.join(ROOT, page.href.slice(1))), `${page.href} (the issue of ${id}) is not a file in this repo`);
    assert.ok(noteOf(quotePage({ ...quote, id }, page))?.includes(`href="${page.href}"`), `the page for ${id} does not link ${page.href}`);
    if (quoteIds.size) assert.ok(quoteIds.has(id), `${page.file} saves ${id}, which is not a quote in the collections: its Save page would 404`);
    checks += 2;
}

console.log(`check-save-pages: ${checks} checks passed`);
