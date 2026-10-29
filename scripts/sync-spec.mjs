#!/usr/bin/env node
// Keeps spec/quote-markup.md a verbatim copy of SPEC.md in TweetingBirds/quote-markup, which
// owns the specification. .spec-version pins the quote-markup commit the copy was taken from
// and the sha256 of the copy:
//
//     commit=<40-hex quote-markup commit>
//     sha256=<hex sha256 of spec/quote-markup.md>
//
// Modes:
//   node scripts/sync-spec.mjs --check          Fails if the committed copy does not match its
//                                               recorded sha256 (no network). When a token is
//                                               available, also fetches SPEC.md at the pinned
//                                               commit and fails if the copy differs from it.
//   node scripts/sync-spec.mjs --update [SHA]   Copies SPEC.md at SHA (default: the head of
//                                               quote-markup's main) over spec/quote-markup.md
//                                               and rewrites .spec-version.
//
// quote-markup is a private repo, so reading it needs a token with contents:read on it:
// QUOTE_MARKUP_TOKEN, else GH_TOKEN, else `gh auth token`. CI passes the QUOTE_MARKUP_TOKEN
// secret; without one --check still verifies the checksum and says so (a fork's pull request
// cannot read secrets). Run --check with --require-source to fail instead of skipping the
// comparison with the source.
//
// The copy is verbatim: build-spec.mjs renders spec/quote-markup.html from it as is.

import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SPEC = path.join(ROOT, 'spec/quote-markup.md');
const PIN = path.join(ROOT, '.spec-version');
const REPO = 'TweetingBirds/quote-markup';

const sha256 = (text) => createHash('sha256').update(text).digest('hex');

export function parsePin(text) {
    const pin = Object.fromEntries(
        text.split('\n').map((line) => line.trim()).filter((line) => line && !line.startsWith('#'))
            .map((line) => line.split('=').map((part) => part.trim()))
    );
    if (!/^[0-9a-f]{40}$/.test(pin.commit ?? '')) throw new Error('.spec-version: commit must be a 40-character hex SHA');
    if (!/^[0-9a-f]{64}$/.test(pin.sha256 ?? '')) throw new Error('.spec-version: sha256 must be 64 hex characters');
    return pin;
}

function token() {
    const fromEnv = process.env.QUOTE_MARKUP_TOKEN || process.env.GH_TOKEN;
    if (fromEnv) return fromEnv;
    try {
        return execFileSync('gh', ['auth', 'token'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim() || null;
    } catch {
        return null;
    }
}

async function github(url, authToken, accept) {
    const response = await fetch(`https://api.github.com/repos/${REPO}/${url}`, {
        headers: { Authorization: `Bearer ${authToken}`, Accept: accept, 'X-GitHub-Api-Version': '2022-11-28' }
    });
    if (!response.ok) throw new Error(`GitHub API ${response.status} for ${REPO}/${url}`);
    return response;
}

async function specAt(commit, authToken) {
    const response = await github(`contents/SPEC.md?ref=${commit}`, authToken, 'application/vnd.github.raw+json');
    return response.text();
}

async function check(requireSource) {
    const pin = parsePin(fs.readFileSync(PIN, 'utf8'));
    const local = fs.readFileSync(SPEC, 'utf8');
    if (sha256(local) !== pin.sha256) {
        throw new Error(
            `spec/quote-markup.md does not match the sha256 in .spec-version. It is a verbatim copy of ` +
            `${REPO} SPEC.md; do not edit it here. Edit SPEC.md in quote-markup, then run: node scripts/sync-spec.mjs --update`
        );
    }
    console.log(`sync-spec: spec/quote-markup.md matches the recorded sha256 (${pin.commit.slice(0, 7)})`);

    const authToken = token();
    if (!authToken) {
        if (requireSource) throw new Error('no token to read quote-markup with (QUOTE_MARKUP_TOKEN, GH_TOKEN or gh auth)');
        console.log('::warning::sync-spec: no token for the private quote-markup repo, so the copy was not compared with the source');
        return;
    }
    const source = await specAt(pin.commit, authToken);
    if (source !== local) {
        throw new Error(`spec/quote-markup.md differs from SPEC.md at ${REPO}@${pin.commit}. Run: node scripts/sync-spec.mjs --update ${pin.commit}`);
    }
    console.log(`sync-spec: spec/quote-markup.md is identical to SPEC.md at ${REPO}@${pin.commit.slice(0, 7)}`);
}

async function update(requested) {
    const authToken = token();
    if (!authToken) throw new Error('no token to read quote-markup with (QUOTE_MARKUP_TOKEN, GH_TOKEN or gh auth)');
    const commit = requested ?? (await (await github('commits/main', authToken, 'application/vnd.github.sha')).text()).trim();
    if (!/^[0-9a-f]{40}$/.test(commit)) throw new Error('give the full 40-character commit SHA');
    const source = await specAt(commit, authToken);
    fs.writeFileSync(SPEC, source, 'utf8');
    fs.writeFileSync(PIN, `commit=${commit}\nsha256=${sha256(source)}\n`, 'utf8');
    console.log(`sync-spec: copied SPEC.md at ${REPO}@${commit.slice(0, 7)}; now run node scripts/build-spec.mjs and commit`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
    const [mode, arg] = process.argv.slice(2).filter((a) => a !== '--require-source');
    const requireSource = process.argv.includes('--require-source');
    try {
        if (mode === '--check') await check(requireSource);
        else if (mode === '--update') await update(arg);
        else throw new Error('usage: sync-spec.mjs --check [--require-source] | --update [commit]');
    } catch (error) {
        console.error(`sync-spec: ${error.message}`);
        process.exitCode = 1;
    }
}
