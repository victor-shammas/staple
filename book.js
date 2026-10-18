import { countWords, describeError, fetchPostBody, mapLimit, readingMinutes } from './lib/substack.js';
import { cleanPostHtml, safeUrl } from './lib/clean.js';
import { showRateLimitNotices } from './lib/notice.js';
import { exportEpub } from './lib/epub-export.js';
import { exportHtml } from './lib/html-export.js';
import { SUPPORT_URL } from './lib/config.js';
import { el, fmtDate, fmtHours, fmtNumber, fmtRange, summary } from './lib/format.js';
import { typefaceStack } from './lib/fonts.js';

const $ = (id) => document.getElementById(id);

function status(text, value, max) {
  $('status').textContent = text;
  if (max) {
    $('progress').max = max;
    $('progress').value = value;
  }
}

function sortPosts(posts, order) {
  const byDate = (a, b) => new Date(a.date) - new Date(b.date);
  const sorted = [...posts];
  if (order === 'oldest') sorted.sort(byDate);
  else if (order === 'publication') sorted.sort((a, b) => a.pubName.localeCompare(b.pubName) || byDate(a, b));
  else sorted.sort((a, b) => byDate(b, a));
  return sorted;
}

function byline(post) {
  const parts = [];
  if (post.authors?.length) parts.push(`By ${post.authors.join(' and ')}`);
  parts.push(fmtDate(post.date));
  parts.push(`${readingMinutes(post.words)} min read`);
  return parts.join(' · ');
}

function bookStats(articles) {
  const words = articles.reduce((n, a) => n + a.words, 0);
  const n = articles.length;
  return `${n} ${n === 1 ? 'essay' : 'essays'} · ${fmtNumber(words)} words · about ${fmtHours(readingMinutes(words))} of reading`;
}

function publications(articles) {
  return [...new Set(articles.map((a) => a.pubName))].sort((a, b) => a.localeCompare(b));
}

// The titles the app gives a collection until the reader names it: the cover
// shows a heading only for a title of the reader's own.
const DEFAULT_TITLES = new Set(['The Week’s Reading', 'Collected Reading']);

function ownTitle(job) {
  const t = (job.title || '').trim();
  return t && !DEFAULT_TITLES.has(t) ? t : null;
}

// "Oct 11 – Oct 18, 2026 · 7 essays · about 1 h 40 min of reading"
function coverLine(job, articles) {
  const words = articles.reduce((n, a) => n + a.words, 0);
  const n = articles.length;
  return `${fmtRange(job.from, job.to)} · ${n} ${n === 1 ? 'essay' : 'essays'} · about ${fmtHours(readingMinutes(words))} of reading`;
}

// The contents are the cover: a quiet line, the reader's own title if there is
// one, then the essays, the first a little larger with its summary.
function renderCover(job, articles) {
  const own = ownTitle(job);
  return el('section', { class: 'cover' },
    el('header', { class: 'cover-head' },
      el('p', { class: 'cover-line', text: coverLine(job, articles) }),
      own && el('h1', { class: 'cover-title', text: own }),
    ),
    renderToc(articles),
    el('p', { class: 'cover-colophon',
      text: `Compiled ${fmtDate(new Date())} from Substack posts available to you. Each piece belongs to its author; links lead back to the originals.` }),
  );
}

function renderToc(articles) {
  return el('nav', { class: 'toc', 'aria-label': 'Contents' },
    el('ol', {}, articles.map((a, i) => el('li', { class: i === 0 ? 'lead' : null },
      el('a', { href: `#post-${i}` },
        el('span', { class: 'toc-pub', text: a.pubName }),
        el('span', { class: 'toc-title', text: a.title }),
        el('span', { class: 'toc-meta',
          text: `${a.authors?.length ? `${a.authors.join(', ')} · ` : ''}${fmtDate(a.date, { month: 'short', day: 'numeric' })} · ${readingMinutes(a.words)} min` }),
        i === 0 && a.subtitle && el('span', { class: 'toc-dek', text: summary(a.subtitle, 280) }),
      ),
    ))),
  );
}

function renderArticle(post, i, job) {
  const url = safeUrl(post.url, undefined, { mail: false }) || safeUrl(`${post.pubBase}/p/${post.slug}`) || '';
  const body = el('div', { class: 'post-body' });
  body.innerHTML = cleanPostHtml(post.html, { prefix: `p${i}`, imageScale: job.imageScale, postUrl: url });
  // Notes side by side read 4, 5, not 45.
  for (const a of body.querySelectorAll('.footnote-anchor')) {
    let prev = a.previousSibling;
    while (prev && prev.nodeType === Node.TEXT_NODE && !prev.data.trim()) prev = prev.previousSibling;
    if (prev?.nodeType === Node.ELEMENT_NODE && prev.classList.contains('footnote-anchor')) a.classList.add('footnote-next');
  }
  return el('article', { id: `post-${i}`, class: 'post' },
    el('header', { class: 'post-header' },
      el('p', { class: 'post-pub', text: post.pubName }),
      el('h1', { class: 'post-title', text: post.title }),
      post.subtitle && el('p', { class: 'post-subtitle', text: summary(post.subtitle, 320) }),
      el('p', { class: 'post-byline', text: byline(post) }),
      url && el('p', { class: 'post-source' }, el('a', { href: url, text: url.replace(/^https?:\/\//, '') })),
      post.access === 'preview' &&
        el('p', { class: 'preview-note', text: 'Preview only — the rest of this post is for paid subscribers.' }),
    ),
    body,
    url && el('footer', { class: 'post-footer' },
      el('p', {},
        post.access === 'preview' ? 'Want the rest? ' : 'Enjoyed this? ',
        el('a', { href: url, text: post.access === 'preview' ? 'Read it on Substack' : 'Like, comment or restack it on Substack' }),
      ),
    ),
  );
}

// Closing page: a short thank-you that points readers back to the writers.
function renderAfterword() {
  return el('section', { class: 'afterword' },
    el('h2', { text: 'A note on supporting writers' }),
    el('p', { text: 'Everything in this collection is gathered here only for your own reading. Staple makes no copies for anyone else, and every piece links back to its original.' }),
    el('p', { text: 'If something here stayed with you, the best thanks is to go back to the source: like it, leave a comment, restack it or share it with a friend — and, where you can, become a paying supporter of the writers you keep coming back to.' }),
  );
}

function waitForImages(root, timeoutMs = 20000) {
  const imgs = [...root.querySelectorAll('img')];
  if (!imgs.length) return Promise.resolve();
  let done = 0;
  return Promise.all(imgs.map((img) => new Promise((resolve) => {
    let settled = false;
    let timer;
    const arm = () => {
      clearTimeout(timer);
      timer = setTimeout(() => finish(img.complete && img.naturalWidth > 0), timeoutMs);
    };
    const finish = (ok) => {
      if (settled) return;
      // If the resized CDN copy fails, fall back to the original once.
      if (!ok && img.dataset.original && img.getAttribute('src') !== img.dataset.original) {
        img.src = img.dataset.original;
        arm();
        return;
      }
      settled = true;
      clearTimeout(timer);
      if (!ok) img.remove();
      done++;
      status(`Loading images… ${done} of ${imgs.length}`, done, imgs.length);
      resolve();
    };
    img.addEventListener('load', () => finish(true));
    img.addEventListener('error', () => finish(false));
    arm();
    if (img.complete) finish(img.naturalWidth > 0);
  })));
}

// Once the book is ready, show the support link for a minute, then fade it
// out (but not while the pointer is on it).
function showSupportLink() {
  if (!SUPPORT_URL) return;
  const link = $('support');
  link.href = SUPPORT_URL;
  link.hidden = false;
  let hovering = false;
  let due = false;
  const fade = () => {
    if (hovering) { due = true; return; }
    link.classList.add('fading');
    link.addEventListener('transitionend', () => { link.hidden = true; }, { once: true });
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) link.hidden = true;
  };
  link.addEventListener('mouseenter', () => { hovering = true; });
  link.addEventListener('mouseleave', () => { hovering = false; if (due) fade(); });
  setTimeout(fade, 60_000);
}

function safeFilename(name) {
  return name.replace(/[\\/:*?"<>|]+/g, '-').replace(/\s+/g, ' ').trim();
}

function download(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = el('a', { href: url, download: filename });
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

function fmtBytes(n) {
  return n > 1e6 ? `${(n / 1e6).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1e3))} KB`;
}

// Older jobs stored a boolean `images`.
function imageScaleOf(job) {
  if (typeof job.imageScale === 'number') return job.imageScale;
  return job.images === false ? 0 : 100;
}

// Why posts were left out, e.g. "2 paywalled, 1 couldn’t load: Substack is rate-limiting…".
function skippedNote(fetched, includePreviews) {
  const paywalled = fetched.filter((p) => p.access === 'none' || (p.access === 'preview' && !includePreviews)).length;
  const failed = fetched.filter((p) => p.access === 'error');
  const parts = [];
  if (paywalled) parts.push(`${paywalled} paywalled`);
  if (failed.length) parts.push(`${failed.length} couldn’t load: ${failed[0].reason || 'network error'}`);
  return parts.length ? ` (skipped ${parts.join('; ')})` : '';
}

async function main() {
  showRateLimitNotices($('notice'));
  // Each book tab has its own job, so several can run side by side.
  const id = new URLSearchParams(location.search).get('job');
  const key = id ? `job:${id}` : 'job';
  const { [key]: job } = await chrome.storage.local.get(key);
  if (!job?.posts?.length) {
    status('Nothing to bind yet — open Staple and choose some posts first.');
    return;
  }
  const format = ['epub', 'html'].includes(job.format) ? job.format : 'pdf';
  job.imageScale = imageScaleOf(job);
  const range = fmtRange(job.from, job.to);
  document.title = `${job.title} — ${range}`;
  const pageCss = `@page { size: ${job.pageSize === 'a4' ? 'A4' : 'letter'}; }`;
  $('page-size').textContent = pageCss;
  document.documentElement.style.setProperty('--img-scale', `${job.imageScale || 100}%`);
  document.documentElement.style.setProperty('--img-k', String((job.imageScale || 100) / 100));
  document.documentElement.style.setProperty('--serif', typefaceStack(job.typeface));
  $('hint').innerHTML = {
    pdf: 'In the print dialog, choose <b>Save as PDF</b> and, under <i>More settings</i>, untick <b>Headers and footers</b>.',
    epub: 'The EPUB downloads automatically. Open it in Apple Books, Kobo or Calibre, or send it to your Kindle.',
    html: 'The HTML file downloads automatically — one file with images included, so it opens in any browser, even offline.',
  }[format];
  $('action').textContent = { pdf: 'Save as PDF…', epub: 'Download EPUB', html: 'Download HTML' }[format];

  let done = 0;
  const total = job.posts.length;
  status(`Fetching posts… 0 of ${total}`, 0, total);
  const fetched = await mapLimit(job.posts, 3, async (p) => {
    const body = await fetchPostBody(p).catch((e) => ({ html: '', access: 'error', reason: describeError(e) }));
    done++;
    status(`Fetching posts… ${done} of ${total}`, done, total);
    return {
      ...p,
      ...body,
      pubName: body.pubName || p.pubName,
      authors: body.authors?.length ? body.authors : p.authors,
      words: p.wordcount || countWords(body.html),
    };
  });

  const usable = fetched.filter((p) => p.access === 'full' || (job.includePreviews && p.access === 'preview'));
  const articles = sortPosts(usable, job.order);
  if (!articles.length) {
    const failed = fetched.find((p) => p.access === 'error');
    status(failed
      ? `Couldn’t load the selected posts (${failed.reason}). Reload this tab to try again.`
      : 'None of the selected posts could be read in full. Are you signed in to Substack in this browser?');
    return;
  }
  for (const a of articles) if (a.access === 'preview') a.words = countWords(a.html);

  const book = $('book');
  const cover = renderCover(job, articles);
  const toc = cover.querySelector('.toc');
  const articleEls = articles.map((a, i) => renderArticle(a, i, job));
  const afterword = renderAfterword();
  if (format !== 'pdf') {
    // The preview is just for looking; images are downloaded separately.
    for (const img of book.querySelectorAll('img')) img.loading = 'lazy';
  }
  book.append(cover, ...articleEls, afterword);

  const note = skippedNote(fetched, job.includePreviews);

  if (format === 'pdf') {
    await waitForImages(book);
    status(`Ready: ${articles.length} posts${note}.`, 1, 1);
    $('action').disabled = false;
    $('action').addEventListener('click', () => window.print());
    document.body.dataset.ready = 'true';
    showSupportLink();
    setTimeout(() => window.print(), 300);
    return;
  }

  const parts = { cover, toc, articles: articleEls, afterword };
  const languages = articles.map((a) => a.language).filter(Boolean);
  let blob;
  if (format === 'epub') {
    const authors = [...new Set(articles.flatMap((a) => a.authors || []))];
    blob = await exportEpub(parts, {
      title: job.title,
      ownTitle: ownTitle(job),
      range,
      line: coverLine(job, articles),
      entries: articles.map((a) => ({ pub: a.pubName, title: a.title, dek: a.subtitle ? summary(a.subtitle, 200) : '' })),
      stats: bookStats(articles),
      pubs: publications(articles),
      creators: authors.length <= 3 ? authors : [],
      language: languages[0] || 'en',
      description: `${range}: ${articles.map((a) => a.title).join(' · ')}`,
      imageScale: job.imageScale,
      typeface: typefaceStack(job.typeface),
    }, status);
  } else {
    blob = await exportHtml(parts, {
      title: document.title,
      language: languages[0] || 'en',
      pageCss,
      imageScale: job.imageScale,
      typeface: typefaceStack(job.typeface),
    }, status);
  }
  const filename = `${safeFilename(document.title)}.${format}`;
  download(blob, filename);
  status(`${format.toUpperCase()} ready: ${articles.length} posts, ${fmtBytes(blob.size)}${note}. Download started as “${filename}” — if nothing appeared, click ${$('action').textContent}.`, 1, 1);
  $('action').disabled = false;
  $('action').addEventListener('click', () => download(blob, filename));
  document.body.dataset.ready = 'true';
  showSupportLink();
}

main().catch((e) => {
  console.error(e);
  if (e instanceof RangeError && /string length/i.test(e.message)) {
    status('This book is too large to save as one HTML file. Try smaller images, or make an EPUB instead.');
  } else {
    status(`Something went wrong: ${e.message}`);
  }
});
