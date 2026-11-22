/**
 * quips-signup: the only way a signup form on quipsapp.com reaches MailerLite.
 *
 * Why this exists: the site used to post straight to MailerLite's public form
 * endpoint, whose URL was readable in js/main.js. Bots posted strangers'
 * addresses to it directly, skipping the page's honeypot and timer, and with
 * double opt-in on, MailerLite emailed each stranger a confirmation. Here every
 * signup must carry a Cloudflare Turnstile token that is checked server-side
 * before anything is sent. The Worker then adds the subscriber through
 * MailerLite's REST API (connect.mailerlite.com) with a token kept in its
 * secrets. Not the form endpoint: that sits behind MailerLite's own Cloudflare
 * bot protection, which answers 403 to requests from a Worker.
 *
 * Double opt-in comes from the account setting "Double opt-in for API and
 * integrations" (Account settings, Subscribe settings), which must be ON. It
 * sends one shared confirmation email for both kinds. The welcome and course
 * automations trigger on joining the group, so they still run.
 *
 * POST /api/subscribe  {kind: "newsletter" | "course", email, name?, token}
 *   200 {ok: true}                  added to MailerLite (it sends the confirmation)
 *   400 {ok: false, error: "input"} bad body or address
 *   403 {ok: false, error: "challenge"} Turnstile token missing or rejected
 *   502 {ok: false, error: "upstream"}  Turnstile or MailerLite unreachable
 */

// MailerLite group for each kind of signup (vars in wrangler.toml).
const KINDS = {
  newsletter: 'NEWSLETTER_GROUP_ID',
  course: 'COURSE_GROUP_ID'
};

// Same test as js/main.js isPlausibleEmail, so the two never disagree.
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const MAX_BODY_BYTES = 4096;

function json(status, body) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store'
    }
  });
}

async function verifyTurnstile(env, token, ip, kind) {
  const form = new FormData();
  form.append('secret', env.TURNSTILE_SECRET);
  form.append('response', token);
  if (ip) form.append('remoteip', ip);

  const res = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
    method: 'POST',
    body: form
  });
  if (!res.ok) throw new Error(`siteverify ${res.status}`);
  const outcome = await res.json();

  // A token minted for another site or another form is not good here.
  const ok = outcome.success === true &&
    outcome.hostname === env.TURNSTILE_HOSTNAME &&
    outcome.action === kind;
  if (!ok) {
    // Shows in `wrangler tail`. Error codes, hostname and action are not personal data.
    console.log('turnstile rejected', JSON.stringify({
      errors: outcome['error-codes'], hostname: outcome.hostname, action: outcome.action, kind
    }));
  }
  return ok;
}

async function sendToMailerLite(env, groupId, email, name) {
  // No "status": a new address starts unconfirmed and gets the API
  // confirmation email (account setting), and an address that is already
  // active is just added to the group, with no second confirmation. Sending
  // "status": "unconfirmed" would re-confirm active readers.
  const body = { email, groups: [groupId] };
  if (name) body.fields = { name };

  const res = await fetch('https://connect.mailerlite.com/api/subscribers', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      accept: 'application/json',
      authorization: `Bearer ${env.MAILERLITE_API_TOKEN}`
    },
    body: JSON.stringify(body)
  });
  if (res.status === 422) {
    const detail = await res.json().catch(() => ({}));
    console.log('mailerlite rejected', JSON.stringify(Object.keys(detail.errors || {})));
    return false;
  }
  if (!res.ok) throw new Error(`mailerlite ${res.status}: ${(await res.text()).slice(0, 200)}`);
  return true;
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname !== '/api/subscribe') return json(404, { ok: false, error: 'not_found' });
    if (request.method !== 'POST') {
      return new Response(null, { status: 405, headers: { allow: 'POST' } });
    }

    // Browsers always send Origin on a POST fetch. Anything else is a script.
    if (request.headers.get('origin') !== env.ALLOWED_ORIGIN) {
      return json(403, { ok: false, error: 'origin' });
    }

    const length = Number(request.headers.get('content-length') || 0);
    if (length > MAX_BODY_BYTES) return json(400, { ok: false, error: 'input' });

    let body;
    try {
      body = await request.json();
    } catch (e) {
      return json(400, { ok: false, error: 'input' });
    }

    const kind = typeof body.kind === 'string' ? body.kind : '';
    const groupId = KINDS[kind] ? env[KINDS[kind]] : undefined;
    const email = typeof body.email === 'string' ? body.email.trim() : '';
    const name = typeof body.name === 'string' ? body.name.trim().slice(0, 100) : '';
    const token = typeof body.token === 'string' ? body.token : '';

    if (!groupId || email.length > 254 || !EMAIL_PATTERN.test(email)) {
      return json(400, { ok: false, error: 'input' });
    }
    if (!token || token.length > 2048) return json(403, { ok: false, error: 'challenge' });

    try {
      const ip = request.headers.get('cf-connecting-ip');
      if (!(await verifyTurnstile(env, token, ip, kind))) {
        return json(403, { ok: false, error: 'challenge' });
      }
      if (!(await sendToMailerLite(env, groupId, email, name))) {
        return json(400, { ok: false, error: 'input' });
      }
    } catch (e) {
      console.error('signup failed', e && e.message);
      return json(502, { ok: false, error: 'upstream' });
    }

    return json(200, { ok: true });
  }
};
