# Site Conventions — quipsapp.com

Single source of truth for the shared pieces of every page. When adding or
editing a page, copy the snippets below verbatim. If you change a shared
snippet, update it here first, then apply it to **every** page listed in the
inventory. This file exists because pages drifted (privacy/terms were missing
the Email Course nav item, press.html had a different footer encoding, etc.).

## Page inventory

| Page | Purpose | Notes |
|------|---------|-------|
| `index.html` | Marketing homepage | Primary CTA = app download (Coming Soon until launch) |
| `collections.html` | Public collections index | Links to pre-rendered `/collections/<id>.html` pages; weekly featured card + search over collections/quotes/authors (`?q=` seeds the search box) |
| `collection.html` | Legacy client-rendered collection view (`?id=`) | Kept as fallback; canonical points to static page |
| `collections/<id>.html` | Pre-rendered collection pages | **Generated** by `scripts/build-collections.mjs` — never hand-edit; edit the script's template |
| `course.html` | 7-day email course landing | |
| `quote-unquote.html` | Quote Unquote newsletter landing page | Subscribe form + archive list; linked from the homepage newsletter section |
| `quote-unquote/<n>-<slug>.html` | Individual newsletter editions | Hand-authored (not generated); root-absolute paths like `collections/<id>.html`. See **Quote Unquote editions** below for the per-issue mailto subject and the no-pull-quote rule |
| `support.html` | Support + FAQ (renders `faqs.json`) | |
| `releases.html` | What's New / changelog | |
| `press.html` | Press kit | |
| `privacy.html` | Privacy policy | **Generated** by `scripts/build-legal.mjs` from `legal/privacy.md` — never hand-edit; edit the Markdown |
| `terms.html` | Terms & conditions | **Generated** by `scripts/build-legal.mjs` from `legal/terms.md` — never hand-edit; edit the Markdown |
| `404.html` | GitHub Pages not-found page | `noindex`; all paths root-absolute (it renders at any missing URL depth) |

## Canonical `<head>` requirements (every page)

In this order, after charset/viewport:

1. `<meta name="description">` — unique per page.
2. Canonical: `<link rel="canonical" href="https://quipsapp.com/<page>.html">`
   (homepage uses `https://quipsapp.com/`).
3. Open Graph — **absolute URLs only**:
   ```html
   <meta property="og:title" content="…">
   <meta property="og:description" content="…">
   <meta property="og:type" content="website">
   <meta property="og:url" content="https://quipsapp.com/<page>.html">
   <meta property="og:image" content="https://quipsapp.com/images/og-image.png">
   <meta property="og:image:width" content="1200">
   <meta property="og:image:height" content="630">
   ```
4. Twitter card (mirrors OG):
   ```html
   <meta name="twitter:card" content="summary_large_image">
   <meta name="twitter:title" content="…">
   <meta name="twitter:description" content="…">
   <meta name="twitter:image" content="https://quipsapp.com/images/og-image.png">
   ```
5. `<title>` — pattern: `<Page Name> — Quips` (homepage keeps its full marketing title).
6. Favicons, Google Fonts (with preconnects), `css/styles.css` — unchanged from
   existing pages. The Google Fonts link loads three families (identical on every
   page): **Inter** (UI/body), **Libre Baskerville** (display/headings — system
   `Baskerville` is preferred on Apple, Libre Baskerville is the cross-platform
   webfont, Georgia the last-resort fallback), and **Merriweather** (quote text,
   italic). Update the `<link>` on every page and in the `build-collections.mjs` /
   `build-legal.mjs` templates together if it changes.
7. Smart App Banner placeholder (uncomment at launch, one place to fill the id):
   ```html
   <!-- TODO(launch): uncomment and set the App Store id
   <meta name="apple-itunes-app" content="app-id=XXXXXXXXXX, app-argument=https://quipsapp.com/">
   -->
   ```
8. Cloudflare Web Analytics placeholder (uncomment + set token only if the
   beacon is NOT auto-injected by the Cloudflare proxy — adding both
   double-counts):
   ```html
   <!-- Cloudflare Web Analytics (manual beacon; skip if auto-injected)
   <script defer src="https://static.cloudflareinsights.com/beacon.min.js" data-cf-beacon='{"token": "TODO"}'></script>
   -->
   ```
9. Organization JSON-LD (identical on every page):
   ```html
   <script type="application/ld+json">
   {
     "@context": "https://schema.org",
     "@type": "Organization",
     "name": "Tweeting Birds",
     "url": "https://quipsapp.com/",
     "logo": "https://quipsapp.com/images/app-icon.png",
     "email": "nate@quipsapp.com"
   }
   </script>
   ```
   Page-specific JSON-LD (SoftwareApplication on index, FAQPage where FAQs
   render) goes after it.

## Content Security Policy (every page)

Every page carries a CSP `<meta http-equiv>` tag. Two variants — the only
difference is MailerLite in `connect-src`/`form-action` on pages with signup
forms. Never add MailerLite hosts to `script-src` (we don't load their
scripts), and keep the Cloudflare Insights hosts so the analytics beacon works
when enabled.

Pages **with** MailerLite forms (`index.html`, `course.html`, `quote-unquote.html`,
and every `quote-unquote/<n>-<slug>.html` edition — each ends with a subscribe
form):

```
default-src 'self'; script-src 'self' 'unsafe-inline' https://static.cloudflareinsights.com; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; img-src 'self' data:; connect-src 'self' https://assets.mailerlite.com https://cloudflareinsights.com; form-action 'self' https://assets.mailerlite.com; base-uri 'self'; object-src 'none';
```

All other pages (and the generated collection template in
`scripts/build-collections.mjs`): same policy minus
`https://assets.mailerlite.com` in `connect-src` and `form-action`.

## Theme pre-paint script (every page)

The theme class lives on `<body>` (`light-theme` / `dark-theme`, stored in
`localStorage['quips-theme']`, falling back to `prefers-color-scheme`).
`js/main.js` applies it too late to avoid a light-mode flash, so every page
must have this **inline script as the very first child of `<body>`** (body tag
keeps its hardcoded `class="light-theme"`):

```html
<body class="light-theme">
    <script>
    (function () {
        try {
            var theme = localStorage.getItem('quips-theme') ||
                (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
            if (theme === 'dark') document.body.classList.replace('light-theme', 'dark-theme');
        } catch (e) { /* leave default light theme */ }
    })();
    </script>
```

## Canonical nav (every page)

Logo links to `index.html` (never `#`). Dropdown items, in this order:

```html
<a href="collections.html" class="nav-dropdown-item">Collections</a>
<a href="releases.html" class="nav-dropdown-item">What's New</a>
<a href="quote-unquote.html" class="nav-dropdown-item">Quote Unquote</a>
<a href="course.html" class="nav-dropdown-item">Email Course</a>
<a href="support.html" class="nav-dropdown-item">Support</a>
<a href="press.html" class="nav-dropdown-item">Press Kit</a>
<div class="nav-dropdown-divider"></div>
<button class="nav-dropdown-item theme-toggle-item" id="themeToggle">…</button>
```

The nav action button is `<a href="index.html#download" class="btn btn-primary">Get Quips</a>`
(`href="#download"` on index itself, `/index.html#download` on pages in
subdirectories). Pre-rendered collection pages and 404.html use root-absolute
paths (`/index.html`, `/css/styles.css`) since they render at non-root URLs.

## Canonical footer (every page)

Brand block, then links **in this order** (raw `&` — not `&amp;amp;`):

```html
<a href="privacy.html">Privacy Policy</a>
<a href="terms.html">Terms & Conditions</a>
<a href="press.html">Press Kit</a>
```

Then a `.footer-social` block, immediately after `.footer-links`, listing only
the accounts that are actually operated (the dormant Tier 2 placeholders and the
defensive `quipsapp` handles are deliberately **not** linked — a dead account
reads worse than no link):

```html
<div class="footer-social">
    <a href="https://www.instagram.com/thequipsapp" target="_blank" rel="me noopener" aria-label="Instagram" title="Instagram"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="…"/></svg></a>
    <a href="https://www.threads.com/@thequipsapp" target="_blank" rel="me noopener" aria-label="Threads" title="Threads"><svg …></svg></a>
    <a href="https://www.pinterest.com/thequipsapp" target="_blank" rel="me noopener" aria-label="Pinterest" title="Pinterest"><svg …></svg></a>
    <a href="https://bsky.app/profile/quipsapp.com" target="_blank" rel="me noopener" aria-label="Bluesky" title="Bluesky"><svg …></svg></a>
<a href="https://mastodon.social/@thequipsapp" target="_blank" rel="me noopener" aria-label="Mastodon" title="Mastodon"><svg …></svg></a>
</div>
```

Each link is a monochrome inline SVG brand glyph (the Simple Icons path for
that network, `viewBox="0 0 24 24"`, filled with `currentColor` by
`.footer-social svg` in `css/styles.css`) rather than a text label. The
`aria-label` and `title` carry the network name for assistive tech and
tooltips. Copy the full `<path d="…">` from any existing page when adding one.

X is deliberately **not** linked, and should not be re-added: the account is
still claimed defensively, but the site takes a principled stand against
supporting it. That decision has since been carried through the rest of the
site — the `twitter:site` meta tag is gone from every page, and the press-kit
Social row no longer names the account. The rest of the `twitter:*` card tags
stay: other platforms read them as Open Graph fallbacks, and only
`twitter:site` exists purely to credit an X account.

These are absolute external URLs, so they are byte-identical in both the
relative-path and root-absolute footer variants and in both build templates.
`rel="me"` is deliberate: it is the identity-verification relation. The Mastodon
link is what makes it load-bearing — Mastodon marks the `quipsapp.com` field on
`@thequipsapp@mastodon.social` as verified only while this page links back to
the profile with `rel="me"`. Removing the Mastodon link, or dropping `rel="me"`
from it, silently un-verifies that profile field.

Copyright line: `&copy; <span id="copyright-year">2025</span> Tweeting Birds. All rights reserved.`
(year is updated by `js/main.js`).

## App Store links & click tracking

- Until launch, download CTAs render as a non-link "Coming Soon to the
  App Store" pill (`.btn-coming-soon`), NOT an `href="#"` badge.
- At launch, every badge points to the local redirect page
  `/go/appstore.html?p=<placement>` (placements: `hero`, `cta`, `nav`,
  `collection`). The redirect page holds the single real App Store URL and
  appends `ct=website-<placement>` campaign tokens. Cloudflare Web Analytics
  pageviews of `/go/appstore.html` = badge clicks (CF WA has no custom
  events), so visits vs. clicks gives the conversion funnel.
- Collection page badges (`p=collection`, in `scripts/build-collections.mjs`)
  additionally carry `data-collection-id="<id>"`. `js/main.js`'s
  `initDeepLinkBadges()` uses it to try the native
  `quips://public-collection/<id>` scheme first (for users who already have
  the app) and falls back to the badge's normal `/go/appstore.html?p=collection`
  href after 1.5s if the app doesn't open (detected via
  `visibilitychange`/`pagehide`). This only activates once the badge's
  `TODO(launch)` comment is uncommented — until then it's inert markup inside
  the comment, same as every other badge.

## Forms (MailerLite)

- We POST directly to MailerLite's subscribe endpoints from `js/main.js`.
  **Never** load MailerLite scripts (`webforms.min.js`) or their `takel`
  tracking pixel — the site must not run third-party trackers.
- Every email input needs an associated visually-hidden `<label>`
  (`class="sr-only"`), not just a placeholder.
- Success copy must say "check your inbox to confirm" (double opt-in), since
  `no-cors` POSTs can't verify acceptance.

## Copy & naming

- App name is **Quips** everywhere. "Quotebook" is the retired codename —
  the only permitted use is the legacy SEO keyword in index.html meta keywords.
- Marketing prose says "curated collections" (lowercase); the capitalized UI
  label "Public Collections" appears only in the press kit fact sheet.
- Feature names: Share Studio, Quote Style, Daily Quote, Private Collections.
- Voice: first person singular ("I", indie developer) on support/press/
  collections pages; avoid corporate "we".
- Public contact email: `nate@quipsapp.com` everywhere a person is invited to
  write in — support, press, collections, newsletter, the course. The legal
  pages (`privacy.html`, `terms.html`, and `legal/*.md` they build from) keep
  `feedback@quipsapp.com` as the formal contact address.
- Pricing: free tier = 100 saved quotes; Premium = $2.49/month or $19.99/year,
  unlocking unlimited quotes, all Quote Style colors and typefaces, and
  watermark-free Share Studio sharing. Keep faqs.json, terms.html, press.html,
  and the homepage pricing strip in sync.

## Quote Unquote editions (`quote-unquote/<n>-<slug>.html`)

Hand-authored from the Markdown drafts in the `quote-unquote` repo — there is
no generator, so both conventions below have to be applied by hand on every new
edition.

- **The feedback mailto carries a per-issue subject.** The closing line of the
  "One Question for You" section links to
  `mailto:nate@quipsapp.com?subject=<encoded>`, where the subject reads
  `Quote Unquote #<n>: <headline>` — the headline being the `<title>` text
  before the ` — Quote Unquote — Quips` suffix. Percent-encode the whole value
  (`#` → `%23`, `:` → `%3A`, space → `%20`, plus any quotes, commas or em
  dashes in the headline). Without it, replies give no clue which edition they
  are about; clients that ignore `mailto` params just open a blank compose to
  the same address, so nothing is lost.
- **No pull-quote boxes in the prose.** A bolded line standing alone in the
  Markdown is emphasis, not a callout — render it as `<p><strong>…</strong></p>`
  inside `.qu-prose`, like any other paragraph. The former `.qu-highlight` box
  was applied inconsistently (the same page had identical standalone bold lines
  both boxed and unboxed), so its markup and CSS rule were removed outright.
  `<blockquote>` remains correct for quoting someone; the box is not.

## Screenshot gallery (`images/screenshots.json`)

The home page's "See it in action" gallery is data-driven: `js/main.js`
(`initScreenshotGallery`) reads `images/screenshots.json` and builds the whole
section, so adding or removing a screen is a JSON edit, never an HTML one. The
same manifest drives `scripts/build-press-kit.mjs` and, in the app repo,
`bin/screenshots` / `bin/mac-screenshot` / `bin/widget-screenshot`.

- **`platforms[]`** declares the tabs, in the order they render (iPhone, iPad,
  Mac). Each carries the `device` to capture on, how it is captured (`fastlane`
  or `manual`), whether the shot ships with a device bezel (`frame`), and the
  `maxWidth` the publish step downscales to. Tabs are only drawn when more than
  one platform has screenshots.
- **`gallery[]`** is flat, and every entry names its `platform`. An entry with
  no `platform` means iPhone — that is what the pre-2.0 manifest's entries were,
  and every consumer still reads them that way.
- **`source`** is the Fastlane snapshot base name from
  `UITests/SnapshotUITests.swift` (`main`, `search`, `story-share`, …); the
  capture step looks for `<device>-<source>-light/-dark.png`. A `source` with no
  matching test is skipped with a warning, so a screen deleted from the suite
  leaves a stale image on the site rather than an error — check the run output.
- **`orientation`** (fastlane platforms) is `portrait` unless stated. iPad is
  `landscape` — the app is used that way at that size, and a portrait shot
  leaves a third of a wide gallery slot empty. `bin/screenshots` passes it as
  `TEST_RUNNER_QUIPS_SNAPSHOT_ORIENTATION`, an environment variable rather than
  an xcarg: that prefix is how xcodebuild reaches the XCUITest *runner*, and the
  test is what rotates the device. Passed as an xcarg it becomes an inert build
  setting and every shot comes out portrait with no error anywhere. Note the App
  Store set (`quips-marketing/appstore/appstore-assets.json`) is still portrait
  on iPad and is unaffected by this field.
- **`managed: false`** means the images are produced outside `bin/screenshots`
  and must never be overwritten by it: the iOS widget gallery (SpringBoard,
  captured by `bin/widget-screenshot`) and every Mac entry (captured by
  `bin/mac-screenshot`).
- Each entry names a `light` and a `dark` file. Both are rendered and the active
  theme shows one via CSS, the same pairing the app icons use.
- Mac shots come from `bin/mac-screenshot`, which has no simulator or UI
  automation to work with — the `UITests` target is iOS-only. It launches the
  real Debug app with the marketing seed, reaches each screen by launch argument
  or `quips://` deep link, and photographs the window with `screencapture -l`.
  It needs **Screen Recording** permission for the terminal running it. The
  window it captures is selected by title, so a navigation that silently did
  nothing fails the screen instead of publishing the library three times.
- iPhone shots carry a frameit device bezel baked into the PNG. iPad and Mac
  shots do not — the pinned frameit frame set has no bezel for either — so they
  get `.is-unframed` and take their rounded corners and shadow from CSS. Never
  put `.is-unframed` on a framed shot: the bezel is already rounded and a second
  radius clips its corners.

## App icon assets

- `images/app-icon.png` (512px, light/default) and `images/app-icon-dark.png`
  (512px, dark variant) are the site-chrome icons. Every logo/footer/CTA icon
  renders BOTH as a pair — `class="… app-icon-light"` then the dark img with
  `class="… app-icon-dark"` — and the active theme shows one via CSS
  (`.light-theme .app-icon-dark { display: none }` etc.), same pattern as the
  screenshot pairs.
- `images/app-icon@1024.png` / `images/app-icon-dark@1024.png` are full-res
  originals, linked only from the press kit downloads.
- `images/apple-touch-icon.png` (180px) and `images/favicon-64.png` (64px) are
  derived from the light/default icon (`sips -z`). Regenerate all derivatives
  whenever the icon changes.
- JSON-LD `logo` and OG images always use the light/default icon.

## Social preview (og-image)

`images/og-image.svg` is the editable source; `images/og-image.png` (exactly
1200×630) is what every page's `og:image`/`twitter:image` points at and what
the press kit bundles. To regenerate after editing the SVG: render it in
headless Chromium at a 1200×630 viewport with `deviceScaleFactor: 2`
(Playwright screenshot), downscale to 1200×630 (`sips -z 630 1200`), replace
og-image.png, then rerun `node scripts/build-press-kit.mjs`. Design notes:
brand teal gradient (#00D7D0 → #00B8B2), "Quips" in Baskerville (the site's
heading serif), tagline "QUOTES DESERVE MORE THAN A SCREENSHOT".

## Images

- Every `<img>` gets explicit `width`/`height` attributes (intrinsic pixel
  size — check with `sips -g pixelWidth -g pixelHeight <file>`); CSS keeps
  them responsive.
- Below-the-fold images get `loading="lazy"`. Above-the-fold hero images stay
  eager. PNG format (no WebP conversion — owner preference).

## Collection tint colors (Quips Palette 2.0)

Per-collection accents (listing card border/icon/badge, detail-page hero,
quote-item borders) are driven by the collection's `colorName`, emitted as a
`data-color` attribute and mapped to a hex in `css/styles.css`. The site brand
accent stays teal (`--accent-primary`); only these collection/quote accents use
the palette.

- The palette is the app's **Quips Palette 2.0** — 16 OKLCH tokens, each with a
  light + dark pair (`--c-rose … --c-gray`, defined in `:root` and `.dark-theme`).
  Source of truth is the app's `ColorTintOption.hexPair`; if the app retunes,
  update the `--c-*` values (see `app/proposals/quips-website-palette-update.md`).
- `[data-color="<token>"]` selectors cover all 16 new tokens **and** keep the
  old quips-collections data tokens (`gold`, `navyBlue`, `mint`, `forestGreen`,
  `lemon`, `brown`, `primaryBlue`, `cloudy`, …) as aliases to the nearest new
  hue, so pages render correctly both before and after the data repo migrates
  to the new token names (`app/proposals/quips-collections-token-migration.md`).
  When the data is fully migrated, the aliases can be dropped.
- The detail hero fills a large area with the tint under text, so it sets
  `--collection-ink` (near-black on light-fill tints and on every tint in dark
  theme, white otherwise) to hold WCAG AA. Card accents sit on neutral
  backgrounds and don't need it.
- The Palette 2.0 `teal` token was renamed **`jade`** (`--c-jade`) so "Teal"
  unambiguously means the brand color; `[data-color="jade"]` is canonical, with
  `teal`/`mint` kept as aliases to `--c-jade`.
- **Tints are for fills, icons, and borders — never text.** Saturated mid-tones
  fail contrast as text on white (Yellow is 1.3:1). Badge labels and card CTAs
  use `--text-primary` / `--accent-ink`, not `--collection-color`; the tint stays
  on the border, icon, and card top-rule.

## Brand color usage & accessibility

The brand accent `--accent-primary` (#00D7D0) is a bright teal — great as a
**fill/border/icon/focus** color, but too light for text (1.8:1 white-on-teal,
1.8:1 teal-on-white). Two derived tokens keep it accessible:

- `--accent-ink` — a darkened teal (#00726E light / #00D7D0 dark, theme-aware)
  for **teal text and links**. Use it, not `--accent-primary`, for any
  `color:` on text. Filled controls (`.btn-primary`, `.filter-pill.active`,
  badges) use a fixed dark ink label (`#1A1A1A`) on the bright fill, never white.
- `--danger` — a dedicated error red (#B3261E light / #FF5C4E dark), distinct
  from Coral (`--accent-complement`). **Coral = action/warmth; Danger = errors
  and "not included."** Never signal errors with Coral.
- `--cta-from` / `--cta-to` — the **brand Coral gradient** (`--accent-complement`
  → `--accent-complement-dark`, #FF6B6B → #E55A5A) used only by the large filled
  sections (`.cta`, `.course-final-cta`). Coral is too light for white text at
  any scale, so these bands set `--cta-ink` (#1A1A1A) as their text color —
  6.3:1 on the light end, 4.9:1 on the dark end. That headroom is thin: text on
  Coral runs at **full opacity**, never faded (dimmed ink lands near 3.5:1), and
  the ink is never lightened toward white. Small Coral controls (pricing badge)
  follow the same rule — bright fill, dark ink label.
- Color is never the sole differentiator: collections read by icon + name +
  color together, so the palette stays usable in color-blind vision.

See the living brand guide (published Artifact, "Quips Brand Guide") for the
full swatch set and rules.

## Generated files (never hand-edit)

`collections/*.html`, `sitemap.xml` and `collections-stats.json` are generated
by `scripts/build-collections.mjs` (run in CI by `.github/workflows/deploy.yml`
after the collections data pull; run locally with `node scripts/build-collections.mjs`).
All three are gitignored. `robots.txt` is static and committed.

`collections-stats.json` holds the dataset totals for the cards at the top of
`collections.html`: `collections`, `quotes`, and a `verification` object
counting the four `verificationStatus` values (`verified`, `attributed`,
`unverified`, `folk-wisdom`). Those statuses live per-quote inside
`collections/<id>.json`, never in the manifest, so the page would otherwise
have to fetch all 80+ files to show one number — hence the build-time tally.
The build fails on an unrecognised status rather than silently dropping a card.
The cards are hidden until the file loads, so a version that predates it (or a
failed fetch) leaves no empty shell.

The deploy workflow (and `serve.sh`) also pull five optional artifacts next to
the index: `recently-added.json`, `on-this-day.json`, `newsletter-picks.json`,
`featured-collections.json`, and `search-index.json`. All five are gitignored,
and a data version that doesn't publish one is **not** a build failure — the
page drops that feature and shows nothing in its place. `search-index.json` is
~1 MB and is fetched only on the first keystroke in the collections search box,
never on page load.

The pulled `collections.json` carries two per-collection dates from
`data.quipsapp.com`: `addedAt` (when the collection was first published, since
data v1.8.0) and `lastUpdated` (its most recent change). The collections page
sorts newest-added first by `addedAt`, falling back to `lastUpdated`. See
`docs/CONSUMING-COLLECTIONS-MANIFEST.md` for the full manifest/feed contract.

`images/quips-press-kit.zip` is generated by `scripts/build-press-kit.mjs`
(also in CI + locally). Its fact-sheet text is extracted from press.html at
build time and its screenshots come from `images/screenshots.json`, so editing
those sources is all that's needed — never hand-edit the zip.

`terms.html` and `privacy.html` are generated by `scripts/build-legal.mjs`
(also in CI + locally; run with `node scripts/build-legal.mjs`) from
`legal/terms.md` and `legal/privacy.md`. Edit the Markdown, not the HTML —
see "Legal documents" below.

## Legal documents (Markdown source)

`legal/terms.md` and `legal/privacy.md` are the source of truth for the
Terms and Privacy Policy. They're Markdown for two reasons: they stay
human-readable/diffable as a source, and the same file is fetched and
rendered natively by the iOS app — at `https://quipsapp.com/legal/terms.md`
and `/legal/privacy.md` — instead of showing a WebView (mirrors the existing
pattern of the app fetching `announcements.json`/`faqs.json` directly from
this repo).

`scripts/build-legal.mjs` converts each file to HTML at build time, using a
small hand-rolled, zero-dependency parser (matches the no-npm-deps
convention of `build-collections.mjs`/`build-press-kit.mjs`). It only
supports the subset these documents actually need — keep new edits inside
this subset so both the website and the app's native Markdown renderer
display them identically:

- `#` / `##` / `###` — headings. Add an explicit anchor with
  `## Heading {#custom-id}` (needed for the Privacy Policy's
  `#website-newsletter` cross-reference); there's no auto-slug fallback.
- Blank-line-separated paragraphs. A single `\n` inside one becomes `<br>`.
- `- item` / `1. item` — flat (non-nested) unordered/ordered lists only.
- `> line` — blockquote; renders as the "In simple terms" summary-box
  callout on the website. A bare `>` line is a blank line *inside* the
  quote (needed to separate the lead-in paragraph, the list, and the
  closing "Questions?" line without ending the callout early).
- `**bold**` and `[text](url)` inline. Links to `http(s)://` URLs outside
  `quipsapp.com` automatically get `target="_blank" rel="noopener"`.
- No italics, tables, or nested lists — the docs don't need them; don't add
  syntax to the parser without adding a document that actually uses it.
- Conspicuous disclaimers (e.g. the "AS IS" warranty section) are written
  in literal ALL CAPS in the Markdown itself, not via a CSS class — that
  way the emphasis survives being rendered by the app instead of a browser.
