// Thin client for Substack's (undocumented) JSON API.
//
// Requests are sent with the browser's cookies, so anything the signed-in user
// can read on substack.com — free posts, plus paid posts they subscribe to —
// comes back in full. Paywalled posts they can't read come back as a preview,
// which isPreview() detects.

const SUBSTACK = 'https://substack.com';
const WORDS_PER_MINUTE = 238;

export class HttpError extends Error {
  constructor(status, url) {
    super(`HTTP ${status}`);
    this.status = status;
    this.url = url;
  }
}

export class NotSignedInError extends Error {
  constructor() {
    super('Not signed in to Substack');
  }
}

// Substack answered with a bot-check page instead of data.
export class BlockedError extends Error {
  constructor() {
    super('Substack asked for a browser check');
  }
}

export class RateLimitError extends Error {
  constructor() {
    super('Substack is rate-limiting requests');
  }
}

export class NetworkError extends Error {}

// A short, human-readable reason for a failed request.
export function describeError(e) {
  if (e instanceof RateLimitError) return 'Substack is rate-limiting — try again in a few minutes';
  if (e instanceof BlockedError) return 'Substack asked for a browser check — open substack.com in a tab, then try again';
  if (e instanceof NotSignedInError) return 'not signed in to Substack';
  if (e instanceof HttpError) return e.status === 404 ? 'not found (HTTP 404)' : `HTTP ${e.status}`;
  return e?.message || String(e);
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const REQUEST_TIMEOUT = 20_000;
const RATE_LIMIT_BUDGET = 180_000; // keep retrying a rate-limited request for up to 3 minutes
const MAX_RETRY_AFTER = 120_000;

// When Substack rate-limits one request, every request waits it out, so
// parallel workers don't keep hammering it. Pages can listen to show a notice.
let cooldownUntil = 0;
// After a request has waited out its whole budget, fail fast for a while
// rather than making every queued request wait the full budget too.
let giveUpUntil = 0;
const cooldownListeners = new Set();

export function onRateLimit(fn) {
  cooldownListeners.add(fn);
  return () => cooldownListeners.delete(fn);
}

function parseRetryAfter(value) {
  if (!value) return 0;
  const seconds = Number(value);
  if (Number.isFinite(seconds)) return seconds * 1000;
  const date = Date.parse(value);
  return Number.isFinite(date) ? date - Date.now() : 0;
}

async function waitForCooldown() {
  // Re-check after sleeping: another request may have extended the cooldown.
  for (let wait; (wait = cooldownUntil - Date.now()) > 0;) {
    await sleep(wait + Math.random() * 1000);
  }
}

async function getJSON(url, { retries = 3 } = {}) {
  const started = Date.now();
  for (let attempt = 0; ; attempt++) {
    if (Date.now() < giveUpUntil) throw new RateLimitError();
    await waitForCooldown();
    let res;
    try {
      res = await fetch(url, {
        credentials: 'include',
        headers: { Accept: 'application/json' },
        signal: AbortSignal.timeout(REQUEST_TIMEOUT),
      });
    } catch (e) {
      // A request that timed out once rarely succeeds on the third try, so
      // give timeouts a single retry; other network errors get the full count.
      const timedOut = e?.name === 'TimeoutError';
      if (attempt < (timedOut ? Math.min(1, retries) : retries)) {
        await sleep(1500 * 2 ** attempt + Math.random() * 500);
        continue;
      }
      throw new NetworkError(e?.name === 'TimeoutError' ? 'Substack didn’t respond in time' : 'Couldn’t reach Substack');
    }
    if (res.status === 429) {
      if (Date.now() - started > RATE_LIMIT_BUDGET) {
        giveUpUntil = Date.now() + 60_000;
        throw new RateLimitError();
      }
      const wait = Math.min(MAX_RETRY_AFTER,
        parseRetryAfter(res.headers.get('retry-after')) || 2000 * 2 ** Math.min(attempt, 5));
      cooldownUntil = Math.max(cooldownUntil, Date.now() + wait);
      for (const fn of cooldownListeners) fn(cooldownUntil);
      continue;
    }
    if (res.status >= 500 && attempt < retries) {
      await sleep(1500 * 2 ** attempt + Math.random() * 500);
      continue;
    }
    const type = res.headers.get('content-type') || '';
    if (!type.includes('json')) {
      // Bot-check pages come back as HTML, usually with a 403 or 503.
      if (res.status === 403 || res.status === 503 || res.headers.get('cf-mitigated')) throw new BlockedError();
      if (!res.ok) throw new HttpError(res.status, url);
      const text = await res.text().catch(() => '');
      if (/just a moment|challenge-platform|cf-chl|captcha/i.test(text)) throw new BlockedError();
      throw new Error('didn’t respond like a Substack');
    }
    if (!res.ok) {
      const body = await res.json().catch(() => null);
      if (res.status === 401 || body?.errors?.some((e) => /sign in/i.test(e?.msg || ''))) throw new NotSignedInError();
      throw new HttpError(res.status, url);
    }
    return res.json();
  }
}

// Run fn over items with at most `limit` in flight. Results keep input order.
export async function mapLimit(items, limit, fn) {
  const results = new Array(items.length);
  let next = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const i = next++;
      results[i] = await fn(items[i], i);
    }
  });
  await Promise.all(workers);
  return results;
}

// "noahpinion", "noahpinion.substack.com", "https://www.slowboring.com/p/foo"
// and "open.substack.com/pub/noahpinion/p/foo" all become an origin like
// "https://noahpinion.substack.com". substack.com itself (profiles, the
// reader) isn't a publication, so it returns null.
export function normalizeBase(input) {
  let s = (input || '').trim();
  if (!s) return null;
  if (!/^https?:\/\//i.test(s)) {
    if (!s.includes('.')) s = `${s}.substack.com`;
    s = `https://${s}`;
  }
  try {
    const u = new URL(s);
    let host = u.hostname.toLowerCase();
    if (host === 'open.substack.com') {
      const pub = u.pathname.match(/^\/pub\/([a-z0-9-]+)/i)?.[1];
      if (!pub) return null;
      host = `${pub.toLowerCase()}.substack.com`;
    }
    if (!host.includes('.') || host === 'substack.com' || host === 'www.substack.com') return null;
    if (!/^[a-z0-9.-]+$/.test(host)) return null;
    return `https://${host}`;
  } catch {
    return null;
  }
}

export function isSubstackHost(base) {
  const host = new URL(base).hostname;
  return host === 'substack.com' || host.endsWith('.substack.com');
}

// Host-permission pattern covering a custom domain and its www/apex variant.
export function originPattern(base) {
  const host = new URL(base).hostname.replace(/^www\./, '');
  return `https://*.${host}/*`;
}

export function countWords(html) {
  if (!html) return 0;
  return html
    .replace(/<(script|style|svg)[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .split(/\s+/)
    .filter(Boolean).length;
}

export function readingMinutes(words) {
  return Math.max(1, Math.round(words / WORDS_PER_MINUTE));
}

// A paywalled post the reader can't access returns only its free preview
// (typically a quarter of the text or less).
export function isPreview(post) {
  if (!post?.body_html) return true;
  if (!post.wordcount) return false;
  return countWords(post.body_html) < post.wordcount * 0.8;
}

// Prefer the substack.com subdomain whenever it still serves the API (it
// redirects only when the custom domain is mandatory), since custom domains
// need an extra host permission.
function pubBase(pub) {
  if (pub.custom_domain && !pub.custom_domain_optional) return `https://${pub.custom_domain}`;
  return `https://${pub.subdomain}.substack.com`;
}

async function getSignedIn(url) {
  const data = await getJSON(url);
  if (data?.errors?.some((e) => /sign in/i.test(e?.msg || ''))) throw new NotSignedInError();
  return data;
}

// The signed-in user's subscriptions, free and paid. /subscriptions/page_v2
// is what substack.com itself uses: cursor-paginated, with custom domains.
// The older /subscriptions endpoint is a fallback if page_v2 disappears.
// Returns { publications: [{ base, name }], partial } — partial when Substack
// stopped answering after some pages had already arrived.
export async function fetchSubscriptions() {
  const pubs = new Map();
  let partial = false;
  try {
    let cursor = null;
    for (let page = 0; page < 100; page++) {
      const query = cursor ? `?cursor=${encodeURIComponent(cursor)}` : '';
      const data = await getSignedIn(`${SUBSTACK}/api/v1/subscriptions/page_v2${query}`);
      for (const p of data?.publications || []) pubs.set(p.id, p);
      if (!data?.nextCursor || data.nextCursor === cursor) break;
      cursor = data.nextCursor;
    }
  } catch (e) {
    if (pubs.size) {
      partial = true;
    } else if (e instanceof HttpError && (e.status === 400 || e.status === 404)) {
      const data = await getSignedIn(`${SUBSTACK}/api/v1/subscriptions?tvOnly=false`);
      for (const p of data?.publications || []) pubs.set(p.id, p);
    } else {
      throw e;
    }
  }
  const publications = [];
  for (const p of pubs.values()) {
    if (!p.subdomain && !p.custom_domain) continue;
    const base = normalizeBase(pubBase(p));
    if (base) publications.push({ base, name: String(p.name || p.subdomain).trim() });
  }
  return { publications, partial };
}

// Posts published between since and until, newest first.
export async function listPosts(base, since, until) {
  const out = [];
  for (let offset = 0; offset < 1000; ) {
    const page = await getJSON(`${base}/api/v1/archive?sort=new&offset=${offset}&limit=25`);
    if (!Array.isArray(page) || page.length === 0) break;
    for (const p of page) {
      const d = new Date(p.post_date);
      if (d >= since && d <= until) out.push(p);
    }
    if (new Date(page[page.length - 1].post_date) < since) break;
    offset += page.length;
  }
  return out;
}

// The fields we carry around for a post before its body is fetched.
export function summarize(post, source) {
  return {
    id: post.id,
    slug: post.slug,
    title: post.title || 'Untitled',
    subtitle: post.subtitle || '',
    date: post.post_date,
    wordcount: post.wordcount || 0,
    audience: post.audience || 'everyone',
    type: post.type,
    url: post.canonical_url || `${source.base}/p/${post.slug}`,
    authors: (post.publishedBylines || []).map((b) => b.name).filter(Boolean),
    pubBase: source.base,
    pubName: source.name?.trim() || new URL(source.base).hostname,
  };
}

// Fetch a post's body. Tries substack.com first (uses the main Substack
// sign-in, which also unlocks paid posts on custom domains), then the
// publication's own domain.
// Returns { html, access: 'full' | 'preview' | 'none' | 'error', reason?, pubName? }.
// 'error' means Substack couldn't be asked (rate limit, network, bot check),
// as opposed to 'none': Substack answered, but there's nothing readable.
export async function fetchPostBody(summary) {
  let post = null;
  let publication = null;
  let failure = null;
  const transient = (e) => !(e instanceof HttpError);
  try {
    const data = await getJSON(`${SUBSTACK}/api/v1/posts/by-id/${summary.id}`);
    post = data?.post || null;
    publication = data?.publication || null;
  } catch (e) {
    if (transient(e)) failure = e;
  }
  // The publication's own address shares Substack's rate limit and bot
  // checks, so only try it when the first request got a real answer.
  const throttled = failure instanceof RateLimitError || failure instanceof BlockedError;
  if (!throttled && (!post?.body_html || isPreview(post))) {
    try {
      const direct = await getJSON(`${summary.pubBase}/api/v1/posts/${encodeURIComponent(summary.slug)}`);
      if (direct?.body_html && (!post?.body_html || !isPreview(direct) ||
          countWords(direct.body_html) > countWords(post.body_html))) {
        post = direct;
      }
    } catch (e) {
      if (transient(e)) failure ??= e;
    }
  }
  if (!post?.body_html) {
    return failure ? { html: '', access: 'error', reason: describeError(failure) } : { html: '', access: 'none' };
  }
  // A preview after a failed request may just mean the full-text request
  // never got through, so don't conclude "no access" yet.
  const preview = isPreview(post);
  if (preview && failure) return { html: post.body_html, access: 'error', reason: describeError(failure) };
  return {
    html: post.body_html,
    access: preview ? 'preview' : 'full',
    pubName: publication?.name?.trim(),
    language: post.language || null,
    authors: (post.publishedBylines || []).map((b) => b.name).filter(Boolean),
  };
}

// Check that a URL someone typed is a Substack, and learn its name. Custom
// domains often only serve the API on www (the bare domain 404s), so try that
// too. Returns { base, name }.
export async function resolvePublication(base) {
  const host = new URL(base).hostname;
  const candidates = [base];
  if (!isSubstackHost(base) && !host.startsWith('www.')) candidates.push(`https://www.${host}`);
  let lastError;
  for (const candidate of candidates) {
    try {
      const page = await getJSON(`${candidate}/api/v1/archive?sort=new&offset=0&limit=1`, { retries: 1 });
      if (!Array.isArray(page)) throw new Error('not a Substack');
      let name = null;
      if (page[0]) {
        const data = await getJSON(`${SUBSTACK}/api/v1/posts/by-id/${page[0].id}`).catch(() => null);
        name = data?.publication?.name?.trim() || null;
      }
      return { base: candidate, name };
    } catch (e) {
      lastError = e;
    }
  }
  throw lastError;
}
