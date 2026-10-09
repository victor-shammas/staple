// Package already-rendered XHTML fragments into an EPUB 3 file (with an NCX
// table of contents too, for older readers).

import { makeZip } from './zip.js';

// Characters XML 1.0 forbids (control codes, lone surrogates, U+FFFE/FFFF).
const XML_INVALID = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\uFFFE\uFFFF]|[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/g;

export function xmlClean(s) {
  return String(s).replace(XML_INVALID, '');
}

export function xmlEscape(s) {
  return xmlClean(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function xhtml(title, body, lang) {
  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops" xml:lang="${lang}" lang="${lang}">
<head>
<meta charset="UTF-8"/>
<title>${xmlEscape(title)}</title>
<link rel="stylesheet" type="text/css" href="style.css"/>
</head>
<body>
${body}
</body>
</html>
`;
}

const CONTAINER = `<?xml version="1.0" encoding="UTF-8"?>
<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
  <rootfiles>
    <rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/>
  </rootfiles>
</container>
`;

/**
 * book = {
 *   title, description, language, creators: string[],
 *   css,                                   // stylesheet text
 *   cover: { data, mediaType, ext } | null, // cover image
 *   titlePage, contentsPage,               // XHTML body fragments
 *   chapters: [{ title, body }],           // XHTML body fragments
 *   afterword: string | null,              // XHTML body fragment, last in reading order
 *   images: [{ href, mediaType, data }],   // hrefs relative to OEBPS/
 * }
 */
export async function buildEpub(book) {
  const lang = book.language || 'en';
  const uid = `urn:uuid:${crypto.randomUUID()}`;
  const modified = new Date().toISOString().replace(/\.\d+Z$/, 'Z');
  const chapters = book.chapters.map((c, i) => ({ ...c, id: `ch${i + 1}`, href: `chapter-${i + 1}.xhtml` }));

  const manifest = [
    '<item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/>',
    '<item id="ncx" href="toc.ncx" media-type="application/x-dtbncx+xml"/>',
    '<item id="css" href="style.css" media-type="text/css"/>',
    '<item id="title-page" href="title.xhtml" media-type="application/xhtml+xml"/>',
    '<item id="contents" href="contents.xhtml" media-type="application/xhtml+xml"/>',
  ];
  const spine = [];
  const files = [];

  if (book.cover) {
    const href = `images/cover.${book.cover.ext}`;
    manifest.push(`<item id="cover-image" href="${href}" media-type="${book.cover.mediaType}" properties="cover-image"/>`);
    manifest.push('<item id="cover" href="cover.xhtml" media-type="application/xhtml+xml"/>');
    spine.push('<itemref idref="cover"/>');
    files.push({ name: `OEBPS/${href}`, data: book.cover.data, store: true });
    files.push({
      name: 'OEBPS/cover.xhtml',
      data: xhtml('Cover', `<div class="cover-image"><img src="${href}" alt="${xmlEscape(book.title)}"/></div>`, lang),
    });
  }
  spine.push('<itemref idref="title-page"/>', '<itemref idref="contents"/>');

  for (const c of chapters) {
    manifest.push(`<item id="${c.id}" href="${c.href}" media-type="application/xhtml+xml"/>`);
    spine.push(`<itemref idref="${c.id}"/>`);
    files.push({ name: `OEBPS/${c.href}`, data: xhtml(c.title, c.body, lang) });
  }
  if (book.afterword) {
    manifest.push('<item id="afterword" href="afterword.xhtml" media-type="application/xhtml+xml"/>');
    spine.push('<itemref idref="afterword"/>');
    files.push({ name: 'OEBPS/afterword.xhtml', data: xhtml('A note on supporting writers', book.afterword, lang) });
  }
  book.images.forEach((img, i) => {
    manifest.push(`<item id="img${i + 1}" href="${img.href}" media-type="${img.mediaType}"/>`);
    files.push({ name: `OEBPS/${img.href}`, data: img.data, store: true });
  });

  const creators = book.creators.length
    ? book.creators.map((c) => `<dc:creator>${xmlEscape(c)}</dc:creator>`).join('\n    ')
    : '<dc:creator>Various authors</dc:creator>';

  const opf = `<?xml version="1.0" encoding="UTF-8"?>
<package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="bookid" xml:lang="${lang}">
  <metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
    <dc:identifier id="bookid">${uid}</dc:identifier>
    <dc:title>${xmlEscape(book.title)}</dc:title>
    ${creators}
    <dc:language>${lang}</dc:language>
    <dc:date>${modified.slice(0, 10)}</dc:date>
    <dc:publisher>Staple</dc:publisher>
    <dc:description>${xmlEscape(book.description || '')}</dc:description>
    <meta property="dcterms:modified">${modified}</meta>
    ${book.cover ? '<meta name="cover" content="cover-image"/>' : ''}
  </metadata>
  <manifest>
    ${manifest.join('\n    ')}
  </manifest>
  <spine toc="ncx">
    ${spine.join('\n    ')}
  </spine>
  <guide>
    ${book.cover ? '<reference type="cover" title="Cover" href="cover.xhtml"/>' : ''}
    <reference type="toc" title="Contents" href="contents.xhtml"/>
    ${chapters[0] ? `<reference type="text" title="Start" href="${chapters[0].href}"/>` : ''}
  </guide>
</package>
`;

  const nav = xhtml('Contents', `<nav epub:type="toc" id="toc">
<h1>Contents</h1>
<ol>
${chapters.map((c) => `<li><a href="${c.href}">${xmlEscape(c.title)}</a></li>`).join('\n')}
</ol>
</nav>
<nav epub:type="landmarks" hidden="hidden">
<ol>
${book.cover ? '<li><a epub:type="cover" href="cover.xhtml">Cover</a></li>' : ''}
<li><a epub:type="toc" href="contents.xhtml">Contents</a></li>
${chapters[0] ? `<li><a epub:type="bodymatter" href="${chapters[0].href}">Start reading</a></li>` : ''}
</ol>
</nav>`, lang);

  const ncx = `<?xml version="1.0" encoding="UTF-8"?>
<ncx xmlns="http://www.daisy.org/z3986/2005/ncx/" version="2005-1">
  <head>
    <meta name="dtb:uid" content="${uid}"/>
    <meta name="dtb:depth" content="1"/>
    <meta name="dtb:totalPageCount" content="0"/>
    <meta name="dtb:maxPageNumber" content="0"/>
  </head>
  <docTitle><text>${xmlEscape(book.title)}</text></docTitle>
  <navMap>
${chapters.map((c, i) => `    <navPoint id="np${i + 1}" playOrder="${i + 1}"><navLabel><text>${xmlEscape(c.title)}</text></navLabel><content src="${c.href}"/></navPoint>`).join('\n')}
  </navMap>
</ncx>
`;

  return makeZip([
    { name: 'mimetype', data: 'application/epub+zip', store: true },
    { name: 'META-INF/container.xml', data: CONTAINER },
    { name: 'OEBPS/content.opf', data: opf },
    { name: 'OEBPS/nav.xhtml', data: nav },
    { name: 'OEBPS/toc.ncx', data: ncx },
    { name: 'OEBPS/style.css', data: book.css },
    { name: 'OEBPS/title.xhtml', data: xhtml(book.title, book.titlePage, lang) },
    { name: 'OEBPS/contents.xhtml', data: xhtml('Contents', book.contentsPage, lang) },
    ...files,
  ], 'application/epub+zip');
}
