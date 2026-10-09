// Turn a Substack post's body_html into print-friendly HTML: drop subscribe /
// share chrome, flatten interactive embeds into static equivalents, and make
// element ids unique so several posts can live in one document.

const DROP = [
  'script', 'style', 'link', 'meta', 'base', 'object', 'embed', 'form', 'input',
  'button', 'svg', 'iframe', 'video', 'audio', 'noscript', 'template', 'frame', 'frameset',
  'applet', 'portal', 'canvas', 'textarea', 'select', 'dialog',
  '.subscription-widget-wrap', '.subscription-widget-wrap-editor', '.subscription-widget',
  '.subscribe-widget', '.captioned-button-wrap', '.share-dialog', '.paywall', '.paywall-jump',
  '.install-substack-app-embed', '.poll-embed', '.image-link-expand', '.community-chat',
  '[data-component-name*="Subscribe"]', '[data-component-name*="Share"]',
  '[data-component-name*="Install"]', '[data-component-name*="Poll"]',
];

// Buttons that are Substack chrome rather than content.
const CHROME_BUTTON = /\b(subscribe|upgrade|share|leave a comment|get the app|gift|refer|pledge|sign up)\b/i;
const CHROME_URL = /\/subscribe\b|[?&]action=share|\/share\b|\/comments\b|\/app\b|\/leaderboard|\/gift\b|utm_source=substack&utm_medium=email/i;

function attrs(el) {
  try {
    return JSON.parse(el.getAttribute('data-attrs') || '{}') || {};
  } catch {
    return {};
  }
}

// Some data-attrs strings (e.g. tweet text) arrive HTML-escaped.
function decodeEntities(doc, text) {
  const t = doc.createElement('textarea');
  t.innerHTML = text;
  return t.value;
}

function linkPara(doc, cls, label, href, text) {
  const p = doc.createElement('p');
  p.className = cls;
  if (label) {
    const s = doc.createElement('span');
    s.className = 'embed-label';
    s.textContent = label;
    p.append(s, ' ');
  }
  if (href) {
    const a = doc.createElement('a');
    a.href = href;
    a.textContent = text || href;
    p.append(a);
  } else {
    p.append(text || '');
  }
  return p;
}

function fmtDate(iso) {
  const d = new Date(iso);
  return isNaN(d) ? '' : d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
}

function replaceEmbeds(doc, root, opts) {
  // Tweets → quoted text with attribution.
  for (const el of root.querySelectorAll('.twitter-embed, .tweet')) {
    const a = attrs(el);
    const q = doc.createElement('blockquote');
    q.className = 'embed-tweet';
    const body = doc.createElement('p');
    body.textContent = a.full_text
      ? decodeEntities(doc, a.full_text).replace(/\n{2,}/g, '\n').trim()
      : el.textContent.trim();
    const cite = doc.createElement('p');
    cite.className = 'embed-cite';
    const who = [a.name, a.username && `@${a.username}`].filter(Boolean).join(' ');
    cite.append(`— ${who || 'Post on X'}${a.date ? `, ${fmtDate(a.date)}` : ''} `);
    if (a.url) {
      const link = doc.createElement('a');
      link.href = a.url;
      link.textContent = '(link)';
      cite.append(link);
    }
    q.append(body, cite);
    el.replaceWith(q);
  }

  // Video / audio players → a link.
  for (const el of root.querySelectorAll(
    '.youtube-wrap, .vimeo-wrap, .spotify-wrap, .apple-podcast-container, .tiktok-wrap, .native-video-embed, .native-audio-embed, .video-embed',
  )) {
    const a = attrs(el);
    let href = a.url || '';
    if (!href && a.videoId && el.classList.contains('youtube-wrap')) href = `https://www.youtube.com/watch?v=${a.videoId}`;
    if (!href && a.videoId && el.classList.contains('vimeo-wrap')) href = `https://vimeo.com/${a.videoId}`;
    if (!href) href = opts.postUrl;
    const label = el.className.includes('audio') || el.className.includes('spotify') || el.className.includes('podcast')
      ? 'Audio' : 'Video';
    el.replaceWith(linkPara(doc, 'embed-media', `▶ ${label}:`, href, a.title || href.replace(/^https?:\/\//, '')));
  }

  // Embedded / digest posts → a "see also" line.
  for (const el of root.querySelectorAll('.embedded-post-wrap, .digest-post-embed, .embedded-publication-wrap')) {
    const a = attrs(el);
    const link = el.querySelector('a[href]');
    const href = a.url || link?.getAttribute('href') || '';
    const title = a.title || el.querySelector('.embedded-post-title')?.textContent?.trim() || href;
    const pub = a.publication_name || el.querySelector('.embedded-post-publication-name')?.textContent?.trim();
    const p = linkPara(doc, 'embed-post', '↗', href, title);
    if (pub) p.append(` — ${pub}`);
    el.replaceWith(p);
  }

  // Image galleries → plain images.
  for (const el of root.querySelectorAll('.image-gallery-embed')) {
    const images = attrs(el)?.gallery?.images || [];
    const fig = doc.createElement('figure');
    fig.className = 'gallery';
    for (const img of images) {
      if (!img?.src) continue;
      const i = doc.createElement('img');
      i.src = img.src;
      fig.append(i);
    }
    const caption = attrs(el)?.gallery?.caption;
    if (caption) {
      const fc = doc.createElement('figcaption');
      fc.textContent = caption;
      fig.append(fc);
    }
    el.replaceWith(fig);
  }

  // @mentions are empty spans carrying the name in data-attrs.
  for (const el of root.querySelectorAll('.mention-wrap')) {
    const name = attrs(el).name;
    el.replaceWith(doc.createTextNode(name || el.textContent));
  }

  // LaTeX blocks → their source expression.
  for (const el of root.querySelectorAll('.latex-rendered')) {
    const a = attrs(el);
    const code = doc.createElement('pre');
    code.className = 'latex';
    code.textContent = a.persistentExpression || a.expression || el.textContent;
    el.replaceWith(code);
  }

  // Button paragraphs: drop Substack chrome, keep real content links as links.
  for (const el of root.querySelectorAll('.button-wrapper')) {
    const link = el.querySelector('a[href]');
    const text = (link?.textContent || el.textContent || '').trim();
    const href = link?.getAttribute('href') || attrs(el).url || '';
    if (!href || CHROME_BUTTON.test(text) || CHROME_URL.test(href)) el.remove();
    else el.replaceWith(linkPara(doc, 'embed-link', '→', href, text));
  }
}

// Pixel width to request from Substack's image CDN for each display scale.
const CDN = 'https://substackcdn.com/image/fetch/';
const SCALE_WIDTH = { 25: 424, 50: 848, 75: 1272, 100: 1456 };

// Ask Substack's CDN for an image at the given width. Its own URLs get their
// w_ parameter swapped (the $s_ signature doesn't cover it); anything else is
// routed through the CDN's fetch proxy, which also makes it downloadable for
// EPUB. f_auto is dropped so the CDN returns JPEG/PNG rather than AVIF/WebP,
// which many e-readers can't show.
export function resizedImageUrl(src, width) {
  if (src.startsWith(CDN)) {
    const rest = src.slice(CDN.length);
    const slash = rest.indexOf('/');
    if (slash > 0) {
      const params = rest.slice(0, slash).split(',').filter((p) => !/^(w_\d+|f_\w+)$/.test(p));
      params.splice(params[0]?.startsWith('$s_') ? 1 : 0, 0, `w_${width}`);
      if (!params.includes('c_limit')) params.push('c_limit');
      return CDN + params.join(',') + rest.slice(slash);
    }
    return src;
  }
  return `${CDN}w_${width},c_limit,q_auto:good/${encodeURIComponent(src)}`;
}

function fixImages(doc, root, opts) {
  if (!opts.imageScale) {
    for (const el of root.querySelectorAll('.captioned-image-container, .image-gallery-embed, figure, picture, img')) {
      el.remove();
    }
    return;
  }
  for (const pic of root.querySelectorAll('picture')) {
    const img = pic.querySelector('img');
    if (img) pic.replaceWith(img);
    else pic.remove();
  }
  // Unwrap the lightbox links around images.
  for (const a of root.querySelectorAll('a.image-link')) a.replaceWith(...a.childNodes);
  for (const div of root.querySelectorAll('.image2-inset')) div.replaceWith(...div.childNodes);
  for (const img of root.querySelectorAll('img')) {
    const src = img.getAttribute('src') || '';
    if (!/^https?:/i.test(src)) {
      img.remove();
      continue;
    }
    img.setAttribute('src', resizedImageUrl(src, SCALE_WIDTH[opts.imageScale] || SCALE_WIDTH[100]));
    // Fall back to the original only when it is also on Substack's servers.
    if (isSubstackImageHost(src)) img.setAttribute('data-original', src);
    img.removeAttribute('srcset');
    img.removeAttribute('sizes');
    img.removeAttribute('loading');
    img.removeAttribute('style');
    img.setAttribute('decoding', 'sync');
    img.setAttribute('alt', img.getAttribute('alt') || '');
  }
}

// Prefix ids and in-page links so footnotes from different posts don't clash.
function scopeIds(root, prefix) {
  for (const el of root.querySelectorAll('[id]')) el.id = `${prefix}-${el.id}`;
  for (const a of root.querySelectorAll('a[href^="#"]')) {
    const target = a.getAttribute('href').slice(1);
    if (target) a.setAttribute('href', `#${prefix}-${target}`);
  }
}

function isSubstackImageHost(src) {
  try {
    const host = new URL(src).hostname;
    return host === 'substackcdn.com' || host === 'substack.com' || host.endsWith('.substack.com');
  } catch {
    return false;
  }
}

// Post HTML is untrusted: keep only plain, static attributes, and only links
// to web pages, email addresses or anchors in the same document.
const ALLOWED_ATTRS = new Set([
  'href', 'src', 'alt', 'title', 'id', 'class', 'lang', 'dir', 'cite', 'datetime',
  'colspan', 'rowspan', 'headers', 'scope', 'abbr', 'start', 'reversed', 'type',
  'width', 'height', 'decoding', 'data-original',
]);
const URL_ATTRS = new Set(['href', 'src', 'cite', 'data-original']);

export function safeUrl(value, base, { mail = true } = {}) {
  const v = String(value || '').trim();
  if (v.startsWith('#')) return v;
  try {
    const u = new URL(v, base || undefined);
    if (u.protocol === 'https:' || u.protocol === 'http:' || (mail && u.protocol === 'mailto:')) return u.href;
  } catch {
    // Not a usable URL.
  }
  return null;
}

function sanitize(root, base) {
  for (const el of root.querySelectorAll('*')) {
    for (const { name, value } of [...el.attributes]) {
      if (!ALLOWED_ATTRS.has(name)) {
        el.removeAttribute(name);
      } else if (URL_ATTRS.has(name)) {
        const isImage = name !== 'href' && name !== 'cite';
        const url = safeUrl(value, base, { mail: !isImage });
        if (!url || (isImage && url.startsWith('#'))) el.removeAttribute(name);
        else if (url !== value) el.setAttribute(name, url);
      }
    }
  }
}

// Remove elements left empty by the clean-up (e.g. a <div><hr></div> is fine,
// but an empty <p> or <div> is not).
function dropEmpty(root) {
  for (const el of [...root.querySelectorAll('p, div, span')].reverse()) {
    if (!el.textContent.trim() && !el.querySelector('img, hr, br, pre')) el.remove();
  }
}

// imageScale: 0 (no images), 25, 50, 75 or 100 (% of the text width).
export function cleanPostHtml(html, { prefix, imageScale = 100, postUrl = '' } = {}) {
  const doc = new DOMParser().parseFromString(`<div id="root">${html}</div>`, 'text/html');
  const root = doc.getElementById('root');
  replaceEmbeds(doc, root, { postUrl });
  for (const el of root.querySelectorAll(DROP.join(','))) el.remove();
  fixImages(doc, root, { imageScale });
  sanitize(root, postUrl);
  dropEmpty(root);
  scopeIds(root, prefix);
  return root.innerHTML;
}
