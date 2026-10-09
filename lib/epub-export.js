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

// A typographic cover, drawn on a canvas so readers have a thumbnail.
async function drawCover({ title, range, stats, pubs }) {
  const W = 1600;
  const H = 2400;
  const X = 150;
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const g = canvas.getContext('2d');
  const serif = 'Charter, "Iowan Old Style", Palatino, Georgia, serif';
  const sans = '-apple-system, "Helvetica Neue", Arial, sans-serif';

  g.fillStyle = '#f3efe6';
  g.fillRect(0, 0, W, H);
  g.fillStyle = '#c25a1f';
  g.fillRect(0, 0, W, 36);

  // Staple mark
  g.fillStyle = '#c25a1f';
  g.fillRect(X, 250, 110, 18);
  g.fillRect(X, 250, 18, 64);
  g.fillRect(X + 92, 250, 18, 64);

  g.fillStyle = '#8a3b12';
  g.font = `600 44px ${sans}`;
  g.letterSpacing = '9px';
  g.fillText('STAPLE', X, 420);
  g.letterSpacing = '0px';

  g.fillStyle = '#1b1a17';
  g.font = `bold 150px ${serif}`;
  let y = 640;
  for (const line of wrapText(g, title, W - 2 * X).slice(0, 4)) {
    g.fillText(line, X, y);
    y += 165;
  }

  g.fillStyle = '#6b675f';
  g.font = `italic 68px ${serif}`;
  g.fillText(range, X, y + 30);
  g.font = `44px ${sans}`;
  g.fillText(stats, X, y + 110);

  g.fillText(`from ${pubs.length} ${pubs.length === 1 ? 'publication' : 'publications'}`, X, y + 170);

  g.fillStyle = '#d9d5cc';
  g.fillRect(X, H - 260, W - 2 * X, 3);

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
 * meta  = { title, range, stats, pubs, creators, language, imageScale, description }
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

  const toc = inertClone(parts.toc);
  toc.querySelectorAll('a[href^="#post-"]').forEach((a) => {
    const i = Number(a.getAttribute('href').slice('#post-'.length));
    a.setAttribute('href', `chapter-${i + 1}.xhtml`);
  });

  const baseCss = await fetch('epub.css').then((r) => r.text());
  const scale = meta.imageScale || 100;
  const css = `${baseCss}\n.post-body img { max-width: ${scale}%; }\n`;

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
    titlePage: serialize(parts.cover),
    contentsPage: serialize(toc),
    chapters,
    images,
  });
}
