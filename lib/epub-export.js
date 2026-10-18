// Turn the rendered book page (cover, contents, articles) into an EPUB:
// download images, draw a cover, serialize each part as XHTML.

import { buildEpub } from './epub.js';
import { collectImages, inertClone, swapImageSources } from './images.js';
import { xmlClean } from './epub.js';

function wrapText(g, text, maxWidth) {
  const words = text.split(/\s+/);
  const lines = [];
  let line = '';
  for (const w of words) {
    const test = line ? `${line} ${w}` : w;
    if (g.measureText(test).width > maxWidth && line) {
      lines.push(line);
      line = w;
    } else {
      line = test;
    }
  }
  if (line) lines.push(line);
  return lines;
}

// A typographic cover, drawn on a canvas so readers have a thumbnail: as the
// book's own first page, a quiet line, the reader's title if they gave one,
// then the essays' titles while they fit, the first a little larger.
async function drawCover({ ownTitle, line, entries = [], typeface }) {
  const W = 1600;
  const H = 2400;
  const X = 150;
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const g = canvas.getContext('2d');
  const serif = typeface || 'Charter, "Iowan Old Style", Palatino, Georgia, serif';
  const sans = '-apple-system, "Helvetica Neue", Arial, sans-serif';
  const ink = '#1b1a17';
  const muted = '#6b675f';
  const rule = '#d9d5cc';
  const width = W - 2 * X;

  g.fillStyle = '#f6f3ec';
  g.fillRect(0, 0, W, H);
  g.textBaseline = 'alphabetic';

  let y = 230;
  g.fillStyle = muted;
  g.font = `40px ${sans}`;
  for (const l of wrapText(g, line, width).slice(0, 2)) { g.fillText(l, X, y); y += 54; }
  y += 6;
  g.fillStyle = ink;
  g.fillRect(X, y, width, 3);
  y += ownTitle ? 200 : 130;

  if (ownTitle) {
    let size = 140;
    g.font = `${size}px ${serif}`;
    while (size > 80 && wrapText(g, ownTitle, width).length > 2) { size -= 10; g.font = `${size}px ${serif}`; }
    for (const l of wrapText(g, ownTitle, width).slice(0, 3)) { g.fillText(l, X, y); y += size * 1.08; }
    y += 70;
  }

  entries.forEach((e, i) => {
    if (y > H - 260) return;
    const lead = i === 0;
    const size = lead ? 84 : 72;
    g.font = `${size}px ${serif}`;
    const lines = wrapText(g, e.title, width).slice(0, 3);
    if (y + 50 + lines.length * size * 1.12 > H - 160) { y = H; return; }
    if (i > 0) { g.fillStyle = rule; g.fillRect(X, y - 62, width, 2); }
    g.fillStyle = muted;
    g.font = `34px ${serif}`;
    g.letterSpacing = '4px';
    g.fillText(e.pub.toUpperCase(), X, y);
    g.letterSpacing = '0px';
    y += 30 + size;
    g.fillStyle = ink;
    g.font = `${size}px ${serif}`;
    for (const l of lines) { g.fillText(l, X, y); y += size * 1.12; }
    if (lead && e.dek) {
      g.fillStyle = muted;
      g.font = `italic 46px ${serif}`;
      y += 10;
      for (const l of wrapText(g, e.dek, width).slice(0, 3)) { g.fillText(l, X, y); y += 60; }
    }
    y += 110;
  });

  const blob = await new Promise((r) => canvas.toBlob(r, 'image/jpeg', 0.9));
  return { mediaType: 'image/jpeg', ext: 'jpg', data: new Uint8Array(await blob.arrayBuffer()) };
}

// Make an HTML subtree safe to serialize as XHTML: drop characters XML
// forbids, attributes whose names aren't valid XML names, and unwrap
// namespaced leftovers like Word's <o:p>.
function xmlSafe(root) {
  for (const el of [root, ...root.querySelectorAll('*')]) {
    for (const { name, value } of [...el.attributes]) {
      if (!/^[A-Za-z_][A-Za-z0-9._-]*$/.test(name)) el.removeAttribute(name);
      else if (xmlClean(value) !== value) el.setAttribute(name, xmlClean(value));
    }
  }
  for (const el of [...root.querySelectorAll('*')].reverse()) {
    if (el.localName.includes(':')) el.replaceWith(...el.childNodes);
  }
  const walker = root.ownerDocument.createTreeWalker(root, NodeFilter.SHOW_TEXT | NodeFilter.SHOW_COMMENT);
  const comments = [];
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    if (node.nodeType === Node.COMMENT_NODE) comments.push(node);
    else if (xmlClean(node.data) !== node.data) node.data = xmlClean(node.data);
  }
  comments.forEach((c) => c.remove());
  return root;
}

function serialize(el) {
  return new XMLSerializer().serializeToString(xmlSafe(inertClone(el)));
}

/**
 * Build an EPUB Blob from the rendered page.
 * parts = { cover: Element, toc: Element, articles: Element[] }
 * meta  = { title, ownTitle, line, entries, range, stats, pubs, creators, language, imageScale, description, typeface }
 */
export async function exportEpub(parts, meta, onProgress = () => {}) {
  const found = await collectImages(parts.articles.flatMap((a) => [...a.querySelectorAll('img')]), onProgress);
  const hrefOf = (file) => `images/img-${file.index + 1}.${file.ext}`;

  onProgress('Assembling EPUB…');
  const chapters = parts.articles.map((article) => {
    const clone = inertClone(article);
    swapImageSources(clone, found, hrefOf);
    for (const img of clone.querySelectorAll('img')) {
      img.removeAttribute('width');
      img.removeAttribute('height');
    }
    return {
      title: clone.querySelector('.post-title')?.textContent || 'Untitled',
      body: serialize(clone),
    };
  });

  // The contents are on the title page (the cover of the book); their links go to the chapters.
  const linkChapters = (root) => root.querySelectorAll('a[href^="#post-"]').forEach((a) => {
    const i = Number(a.getAttribute('href').slice('#post-'.length));
    a.setAttribute('href', `chapter-${i + 1}.xhtml`);
  });
  const titlePage = inertClone(parts.cover);
  linkChapters(titlePage);
  const separateToc = parts.toc && !parts.cover.contains(parts.toc);
  const toc = separateToc ? inertClone(parts.toc) : null;
  if (toc) linkChapters(toc);

  const baseCss = await fetch('epub.css').then((r) => r.text());
  const scale = meta.imageScale || 100;
  // The chosen typeface, as a publisher's font: readers that offer "Original" use it.
  const font = meta.typeface ? `body { font-family: ${meta.typeface}; }\n` : '';
  const css = `${baseCss}\n${font}.post-body img { max-width: ${scale}%; }\n`;

  const images = await Promise.all([...found.values()].map(async (file) => ({
    href: hrefOf(file),
    mediaType: file.mediaType,
    data: new Uint8Array(await file.blob.arrayBuffer()),
  })));
  const cover = await drawCover(meta);

  return buildEpub({
    title: meta.title,
    description: meta.description,
    language: meta.language,
    creators: meta.creators,
    css,
    cover,
    afterword: parts.afterword ? serialize(parts.afterword) : null,
    titlePage: serialize(titlePage),
    contentsPage: toc ? serialize(toc) : null,
    chapters,
    images,
  });
}
