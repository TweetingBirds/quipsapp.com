# quips-signup Worker

Every signup form on quipsapp.com (Quote Unquote and the email course) posts to
`https://quipsapp.com/api/subscribe`, which this Worker serves. It checks a
Cloudflare Turnstile token server-side and only then passes the address to
MailerLite, which sends its double opt-in confirmation as before.

**Why:** until November 2026 the site posted straight to MailerLite's public
form endpoint, and its URL was in `js/main.js`. Bots posted strangers'
addresses to it directly, skipping the page's honeypot and timer, so MailerLite
emailed confirmations to people who never signed up (29 of 33 newsletter
"signups" by Nov 2026). The MailerLite form ids now live only in this Worker's
secrets.

The static site is still GitHub Pages; this Worker is deployed separately and a
site deploy does not touch it.

## One-time setup (do this before merging the site change)

1. **Turnstile widget.** Cloudflare dashboard → Turnstile → Add widget.
   Hostname `quipsapp.com`, mode **Managed**. Copy the **site key** into
   `TURNSTILE_SITE_KEY` in `js/main.js` (it is public). Keep the **secret key**
   for step 3. PR builds fail until the site key is set.
2. **New MailerLite forms.** The old form ids were public, so bots will keep
   posting to them. In MailerLite → Forms → Embedded, duplicate
   "Quote Unquote Newsletter" and "The Art Of Quote Collecting Course" (a
   duplicate keeps the group, double opt-in and confirmation email). Note each
   new form's id (the number in its dashboard URL). The course's welcome
   automation is triggered by the group, not the form, so it keeps working.
3. **Deploy the Worker** (needs a Cloudflare login with Workers on the
   `quipsapp.com` zone):

   ```sh
   cd workers/signup
   npx wrangler login
   npx wrangler secret put TURNSTILE_SECRET     # Turnstile secret key
   npx wrangler secret put NEWSLETTER_FORM_ID   # new newsletter form id
   npx wrangler secret put COURSE_FORM_ID       # new course form id
   npx wrangler deploy
   ```

   The route `quipsapp.com/api/subscribe` is in `wrangler.toml`; the zone is
   already proxied by Cloudflare, so nothing else changes.
4. **Merge the site PR**, then sign up once on the homepage and once on
   `course.html` with a test address and confirm both emails arrive.
5. **Retire the old forms.** Once the test signups work, delete the two old
   forms in MailerLite (their groups and subscribers stay) so the public ids
   stop accepting posts.

## Responses

| Status | Body | Meaning |
|--------|------|---------|
| 200 | `{ok: true}` | Passed to MailerLite |
| 400 | `{ok: false, error: "input"}` | Bad body, bad address, or MailerLite rejected it |
| 403 | `{ok: false, error: "challenge"}` | Turnstile token missing, wrong site/action, or rejected |
| 403 | `{ok: false, error: "origin"}` | Not posted from https://quipsapp.com |
| 502 | `{ok: false, error: "upstream"}` | Turnstile or MailerLite unreachable |

The page shows one generic "didn't go through, email me" line for any failure.

## Testing a change locally

`npx wrangler dev` runs it on localhost. Turnstile publishes test keys that
always pass (site key `1x00000000000000000000AA`, secret
`1x0000000000000000000000000000000AA`); use them with `wrangler dev --var`
and a throwaway MailerLite form, never the real ones.
