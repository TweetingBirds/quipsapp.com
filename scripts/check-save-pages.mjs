#!/usr/bin/env node
// Checks the dates on the Save to Quips pages (scripts/build-save-pages.mjs) against the
// shapes quoteDate takes in the collections, and the query page's filter on the `date` it
// passes to quips://add. Exits non-zero on the first failure. CI runs it before the build.
// Run locally with: node scripts/check-save-pages.mjs

import assert from 'node:assert/strict';
import vm from 'node:vm';
import { APP_DATE, queryPage, quotePage } from './build-save-pages.mjs';

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

console.log(`check-save-pages: ${checks} checks passed`);
