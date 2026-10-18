// Turn the rendered book page into one self-contained HTML file: the book's
// stylesheet inlined and every image embedded as a data: URL, no scripts.

import { collectImages, inertClone, swapImageSources } from './images.js';
import { xmlEscape } from './epub.js';

function blobToDataUrl(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}

/**
 * parts = { cover: Element, toc: Element (may be inside the cover), articles: Element[] }
 * meta  = { title, language, pageCss, imageScale, typeface }   (typeface: a CSS font stack)
 */
export async function exportHtml(parts, meta, onProgress = () => {}) {
  const found = await collectImages(parts.articles.flatMap((a) => [...a.querySelectorAll('img')]), onProgress);
  onProgress('Assembling HTML…');
  for (const file of found.values()) file.dataUrl = await blobToDataUrl(file.blob);

  // One Blob part per article: a single giant string can exceed the
  // browser's maximum string length for image-heavy books.
  const articles = parts.articles.map((article) => {
    const clone = inertClone(article);
    swapImageSources(clone, found, (file) => file.dataUrl);
    return `${clone.outerHTML}\n`;
  });

  const css = await fetch('book.css').then((r) => r.text());
  const scale = meta.imageScale || 100;
  const head = `<!doctype html>
<html lang="${xmlEscape(meta.language || 'en')}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="generator" content="Staple">
<title>${xmlEscape(meta.title)}</title>
<style>
${css}
${meta.pageCss || ''}
:root { --img-scale: ${scale}%; --img-k: ${scale / 100};${meta.typeface ? ` --serif: ${meta.typeface};` : ''} }
</style>
</head>
<body>
<main id="book">
${parts.cover.outerHTML}
${parts.toc && !parts.cover.contains(parts.toc) ? parts.toc.outerHTML : ''}
`;
  const tail = `${parts.afterword ? parts.afterword.outerHTML : ''}
</main>
</body>
</html>
`;
  return new Blob([head, ...articles, tail], { type: 'text/html' });
}
