/**
 * quips-signup: the only way a signup form on quipsapp.com reaches MailerLite.
 *
 * Why this exists: the site used to post straight to MailerLite's public form
 * endpoint, whose URL was readable in js/main.js. Bots posted strangers'
 * addresses to it directly, skipping the page's honeypot and timer, and with
 * double opt-in on, MailerLite emailed each stranger a confirmation. Here every
 * signup must carry a Cloudflare Turnstile token that is checked server-side
 * before anything is sent, and the MailerLite form ids live only in this
 * Worker's secrets.
 *
 * POST /api/subscribe  {kind: "newsletter" | "course", email, name?, token}
 *   200 {ok: true}                  passed to MailerLite (it sends the confirmation)
 *   400 {ok: false, error: "input"} bad body or address
 *   403 {ok: false, error: "challenge"} Turnstile token missing or rejected
 *   502 {ok: false, error: "upstream"}  Turnstile or MailerLite unreachable
 */

const KINDS = {
  newsletter: 'NEWSLETTER_FORM_ID',
  course: 'COURSE_FORM_ID'
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
  return outcome.success === true &&
    outcome.hostname === env.TURNSTILE_HOSTNAME &&
    outcome.action === kind;
}

async function sendToMailerLite(env, formId, email, name) {
  const form = new FormData();
  form.append('fields[email]', email);
  if (name) form.append('fields[name]', name);
  form.append('ml-submit', '1');
  form.append('anticsrf', 'true');

  const url = `https://assets.mailerlite.com/jsonp/${env.MAILERLITE_ACCOUNT_ID}/forms/${formId}/subscribe`;
  const res = await fetch(url, { method: 'POST', body: form });
  if (!res.ok) throw new Error(`mailerlite ${res.status}`);
  // The endpoint answers 200 with {success: false, errors} for a rejected
  // address; read it so a real failure is not reported as a signup.
  const text = await res.text();
  try {
    const body = JSON.parse(text);
    if (body && body.success === false) return false;
  } catch (e) {
    // Not JSON (older JSONP shape): a 200 is the success signal.
  }
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
    const formId = KINDS[kind] ? env[KINDS[kind]] : undefined;
    const email = typeof body.email === 'string' ? body.email.trim() : '';
    const name = typeof body.name === 'string' ? body.name.trim().slice(0, 100) : '';
    const token = typeof body.token === 'string' ? body.token : '';

    if (!formId || email.length > 254 || !EMAIL_PATTERN.test(email)) {
      return json(400, { ok: false, error: 'input' });
    }
    if (!token || token.length > 2048) return json(403, { ok: false, error: 'challenge' });

    try {
      const ip = request.headers.get('cf-connecting-ip');
      if (!(await verifyTurnstile(env, token, ip, kind))) {
        return json(403, { ok: false, error: 'challenge' });
      }
      if (!(await sendToMailerLite(env, formId, email, name))) {
        return json(400, { ok: false, error: 'input' });
      }
    } catch (e) {
      console.error('signup failed', e && e.message);
      return json(502, { ok: false, error: 'upstream' });
    }

    return json(200, { ok: true });
  }
};
