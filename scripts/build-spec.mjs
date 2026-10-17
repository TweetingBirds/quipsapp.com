#!/usr/bin/env node
// Build script: renders /spec/quote-markup.html from spec/quote-markup.md.
//
// The Markdown is the source of truth, so the spec can also be fetched as plain text
// (https://quipsapp.com/spec/quote-markup.md) by anything that wants to parse it.
// The page reuses the legal pages' shell (build-legal.mjs `pageHtml`), then adjusts it
// for a page that lives one directory down.
//
// Markdown subset: # / ## / ### headings (ids derived from the text), paragraphs,
// `-` lists, pipe tables, fenced code blocks, and inline `code`, **bold**, *italic*
// and [links](url).
//
// Output is gitignored. Run locally with: node scripts/build-spec.mjs

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { pageHtml, escapeHtml } from './build-legal.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SITE = 'https://quipsapp.com';

function inlineHtml(raw) {
    // Code spans are lifted out first so their contents are not parsed as emphasis or links.
    const spans = [];
    let text = raw.replace(/`([^`]+)`/g, (_match, code) => {
        spans.push(`<code>${escapeHtml(code)}</code>`);
        return `\u0000${spans.length - 1}\u0000`;
    });
    text = escapeHtml(text);
    text = text.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
    text = text.replace(/(^|[^*])\*([^*]+)\*/g, '$1<em>$2</em>');
    text = text.replace(/\[([^\]]+)\]\(([^)]+)\)/g, (_match, label, url) => {
        const external = /^https?:\/\//.test(url) && !url.startsWith(SITE);
        return `<a href="${url}"${external ? ' target="_blank" rel="noopener"' : ''}>${label}</a>`;
    });
    return text.replace(/\u0000(\d+)\u0000/g, (_match, index) => spans[Number(index)]);
}

function slug(text) {
    return text
        .toLowerCase()
        .replace(/`/g, '')
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-|-$/g, '');
}

function tableCells(line) {
    return line.trim().replace(/^\||\|$/g, '').split('|').map((cell) => cell.trim());
}

function render(source) {
    const lines = source.split('\n');
    const out = [];
    let i = 0;
    let first = true;

    while (i < lines.length) {
        const line = lines[i];

        if (line.trim() === '') {
            i += 1;
            continue;
        }

        const fence = line.match(/^```(\w*)\s*$/);
        if (fence) {
            const body = [];
            i += 1;
            while (i < lines.length && !/^```\s*$/.test(lines[i])) {
                body.push(lines[i]);
                i += 1;
            }
            i += 1;
            const lang = fence[1] ? ` class="language-${fence[1]}"` : '';
            out.push(`<pre><code${lang}>${escapeHtml(body.join('\n'))}</code></pre>`);
            continue;
        }

        const heading = line.match(/^(#{1,3})\s+(.*)$/);
        if (heading) {
            const level = heading[1].length;
            const text = heading[2].trim();
            const id = level === 1 ? '' : ` id="${slug(text)}"`;
            out.push(`<h${level}${id}>${inlineHtml(text)}</h${level}>`);
            i += 1;
            first = level === 1;
            continue;
        }

        if (/^\|/.test(line) && /^\|[\s:|-]+\|\s*$/.test(lines[i + 1] || '')) {
            const head = tableCells(line);
            i += 2;
            const rows = [];
            while (i < lines.length && /^\|/.test(lines[i])) {
                rows.push(tableCells(lines[i]));
                i += 1;
            }
            const th = head.map((cell) => `<th>${inlineHtml(cell)}</th>`).join('');
            const tr = rows
                .map((row) => `<tr>${row.map((cell) => `<td>${inlineHtml(cell)}</td>`).join('')}</tr>`)
                .join('\n');
            out.push(`<div class="table-wrap"><table>\n<thead><tr>${th}</tr></thead>\n<tbody>\n${tr}\n</tbody>\n</table></div>`);
            continue;
        }

        if (/^-\s+/.test(line)) {
            const items = [];
            while (i < lines.length && /^-\s+/.test(lines[i])) {
                let item = lines[i].replace(/^-\s+/, '');
                i += 1;
                // Continuation lines are indented.
                while (i < lines.length && /^\s+\S/.test(lines[i])) {
                    item += ` ${lines[i].trim()}`;
                    i += 1;
                }
                items.push(`    <li>${inlineHtml(item)}</li>`);
            }
            out.push(`<ul>\n${items.join('\n')}\n</ul>`);
            continue;
        }

        const para = [];
        while (
            i < lines.length &&
            lines[i].trim() !== '' &&
            !/^(#{1,3})\s+/.test(lines[i]) &&
            !/^```/.test(lines[i]) &&
            !/^-\s+/.test(lines[i]) &&
            !/^\|/.test(lines[i])
        ) {
            para.push(lines[i]);
            i += 1;
        }
        // The paragraph straight after the H1 is the version line.
        out.push(`<p${first ? ' class="last-updated"' : ''}>${inlineHtml(para.join(' '))}</p>`);
        first = false;
    }
    return out.join('\n');
}

const EXTRA_CSS = `
        .legal-content pre {
            background-color: var(--bg-secondary);
            border-radius: 8px;
            padding: 1rem 1.25rem;
            margin-bottom: 1.5rem;
            overflow-x: auto;
            font-size: 0.85rem;
            line-height: 1.55;
        }
        .legal-content code {
            font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
            font-size: 0.9em;
        }
        .legal-content p code, .legal-content li code, .legal-content td code {
            background-color: var(--bg-secondary);
            border-radius: 4px;
            padding: 0.1em 0.35em;
        }
        .legal-content pre code {
            background: none;
            padding: 0;
        }
        .table-wrap {
            overflow-x: auto;
            margin-bottom: 1.5rem;
        }
        .legal-content table {
            border-collapse: collapse;
            width: 100%;
            font-size: 0.9rem;
        }
        .legal-content th, .legal-content td {
            text-align: left;
            vertical-align: top;
            padding: 0.5rem 0.75rem;
            border-bottom: 1px solid var(--border-color, rgba(128, 128, 128, 0.25));
        }
`;

// The shell's links are relative to the site root; this page is one level down.
function rootRelative(html) {
    return html.replace(/(href|src)="(?!https?:|#|\/|mailto:)/g, '$1="/');
}

const source = fs.readFileSync(path.join(ROOT, 'spec/quote-markup.md'), 'utf8');
const description =
    'Quote Markup is a profile of microformats2 h-cite and schema.org Quotation for marking up a quotation: the speaker, the work, the source type and a save link.';

let html = pageHtml({
    title: 'Quote Markup — Quips',
    metaDescription: description,
    socialDescription: description,
    canonicalPath: 'spec/quote-markup.html',
    contentHtml: render(source)
});
html = html.replace('    </style>\n</head>', `${EXTRA_CSS}    </style>\n</head>`);
html = html.replace('"email": "feedback@quipsapp.com"', '"email": "nate@quipsapp.com"');
html = rootRelative(html);

fs.mkdirSync(path.join(ROOT, 'spec'), { recursive: true });
fs.writeFileSync(path.join(ROOT, 'spec/quote-markup.html'), html, 'utf8');
console.log('build-spec: wrote spec/quote-markup.html from spec/quote-markup.md');
