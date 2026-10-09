// Download the images in rendered articles so they can be embedded in an
// EPUB or a standalone HTML file.

import { mapLimit } from './substack.js';

const IMAGE_EXT = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/gif': 'gif',
  'image/webp': 'webp',
  'image/svg+xml': 'svg',
};

async function downloadImage(src) {
  if (!src) return null;
  try {
    const res = await fetch(src, { credentials: 'omit', signal: AbortSignal.timeout(30_000) });
    if (!res.ok) return null;
    const blob = await res.blob();
    const type = (blob.type || res.headers.get('content-type') || '').split(';')[0].trim();
    const ext = IMAGE_EXT[type];
    if (!ext) return null;
    return { mediaType: type, ext, blob };
  } catch {
    return null;
  }
}

// Returns Map(src → { mediaType, ext, blob, index }) for every distinct image
// that could be downloaded (trying the original URL if the resized one fails).
export async function collectImages(imgEls, onProgress = () => {}) {
  const srcs = [...new Set(imgEls.map((i) => i.getAttribute('src')).filter(Boolean))];
  const originals = new Map(imgEls.map((i) => [i.getAttribute('src'), i.getAttribute('data-original')]));
  const found = new Map();
  let done = 0;
  await mapLimit(srcs, 4, async (src, index) => {
    const img = (await downloadImage(src)) || (await downloadImage(originals.get(src)));
    if (img) found.set(src, { ...img, index });
    done++;
    onProgress(`Packing images… ${done} of ${srcs.length}`, done, srcs.length);
  });
  return found;
}

// Copy an element into a detached, inert document: changing image sources
// there doesn't make the browser fetch anything.
const inert = document.implementation.createHTMLDocument('');
export function inertClone(el) {
  return inert.importNode(el, true);
}

// Point each <img> in `root` at its embedded copy (via `toSrc`), dropping
// images that couldn't be downloaded and the figures they leave empty.
export function swapImageSources(root, found, toSrc) {
  for (const img of root.querySelectorAll('img')) {
    const file = found.get(img.getAttribute('src'));
    const holder = img.closest('.captioned-image-container, figure');
    if (!file) {
      img.remove();
      if (holder && !holder.querySelector('img')) holder.remove();
      continue;
    }
    img.setAttribute('src', toSrc(file));
    for (const a of ['data-original', 'decoding', 'loading', 'srcset', 'sizes']) img.removeAttribute(a);
  }
}
