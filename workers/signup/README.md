# quips-signup Worker

Every signup form on quipsapp.com (Quote Unquote and the email course) posts to
`https://quipsapp.com/api/subscribe`, which this Worker serves. It checks a
Cloudflare Turnstile token server-side and only then adds the address to the
right MailerLite group through MailerLite's REST API. MailerLite then sends the
double opt-in confirmation, and joining the group starts the welcome or course
automation.

**Why:** until November 2026 the site posted straight to MailerLite's public
form endpoint, and its URL was in `js/main.js`. Bots posted strangers'
addresses to it directly, skipping the page's honeypot and timer, so MailerLite
emailed confirmations to people who never signed up (29 of 33 newsletter
"signups" by Nov 2026).

**Why the REST API and not the form endpoint:** MailerLite's form endpoint
(`assets.mailerlite.com/jsonp/...`) sits behind MailerLite's own Cloudflare bot
protection and answers 403 to requests from a Worker (found on launch,
2026-11-22). `connect.mailerlite.com/api` is meant for servers.

The static site is still GitHub Pages; this Worker is deployed separately and a
site deploy does not touch it.

## One-time setup

1. **Turnstile widget.** Cloudflare dashboard → Turnstile → Add widget.
   Hostname `quipsapp.com`, mode **Managed**. Its **site key** is
   `TURNSTILE_SITE_KEY` in `js/main.js` (public; PR builds fail without it).
   Keep the **secret key** for step 4.
2. **MailerLite API token.** MailerLite → Integrations → MailerLite API → Use →
   Generate new token. Name it `quips-signup Worker`. Copy it once; it is not
   shown again.
3. **Double opt-in for the API.** MailerLite → Account settings → Subscribe
   settings → turn **Double opt-in for API and integrations** ON. That setting
   has its own confirmation email, shared by the newsletter and the course, so
   edit its copy to fit both (the group's automation sends the specific
   welcome after confirmation). Without this, API signups are added as active
   with no confirmation email.
4. **Deploy the Worker** (needs a Cloudflare login with Workers on the
   `quipsapp.com` zone):

   ```sh
   cd workers/signup
   npx wrangler login
   npx wrangler secret put TURNSTILE_SECRET       # Turnstile secret key
   npx wrangler secret put MAILERLITE_API_TOKEN   # MailerLite API token
   npx wrangler deploy
   ```

   Group ids are plain vars in `wrangler.toml`. The route
   `quipsapp.com/api/subscribe` is there too; the zone is already proxied by
   Cloudflare.
5. **Test** a signup on the homepage and on `course.html` with an address you
   own and confirm both emails arrive. `npx wrangler tail` shows why a request
   was rejected (Turnstile error codes, MailerLite status).
6. **Delete the old MailerLite forms.** Their ids were public in `main.js`, and
   bots post to them directly. Deleting a form keeps its group and subscribers.

## Responses

| Status | Body | Meaning |
|--------|------|---------|
| 200 | `{ok: true}` | Passed to MailerLite |
| 400 | `{ok: false, error: "input"}` | Bad body, bad address, or MailerLite rejected it (422) |
| 403 | `{ok: false, error: "challenge"}` | Turnstile token missing, wrong site/action, or rejected |
| 403 | `{ok: false, error: "origin"}` | Not posted from https://quipsapp.com |
| 502 | `{ok: false, error: "upstream"}` | Turnstile or MailerLite unreachable |

The page shows one generic "didn't go through, email me" line for any failure.

## Testing a change locally

`npx wrangler dev` runs it on localhost. Turnstile publishes test keys that
always pass (site key `1x00000000000000000000AA`, secret
`1x0000000000000000000000000000000AA`); use them with `wrangler dev --var`
and a throwaway MailerLite group and token, never the real ones.
