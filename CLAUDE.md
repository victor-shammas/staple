# Staple (Chrome extension)

Staple staples a date range of Substack posts the user can read (free posts,
plus paid posts they subscribe to) into one PDF, EPUB or HTML file. Manifest
V3, plain ES modules, no build step, no dependencies. Open source (MIT), in
the public repo `victor-shammas/staple`, which also holds the website
(`docs/`) and the GitHub releases.

## Layout

- `manifest.json`, `background.js` (toolbar click → reuse or open the app tab)
- `app.html/css/js` — picker UI: publications, groups, filters, posts, output
- `book.html/css/js` — renders the collection; PDF via print, EPUB/HTML download
- `lib/substack.js` — Substack's undocumented JSON API, timeouts, rate limits
- `lib/clean.js` — sanitizes post HTML (attribute + URL allowlists), embeds
- `lib/epub*.js`, `lib/zip.js`, `lib/html-export.js`, `lib/images.js`
- `lib/config.js` — `SUPPORT_URL` (Buy Me a Coffee)
- `store/` — Chrome Web Store kit (`SUBMISSION.md`, screenshots, promo, brand)
- `docs/` — the website, served by GitHub Pages from `main` /docs at
  https://victorshammas.com/staple/ (see `docs/README.md`). Any push to main
  that touches `docs/` publishes the site.
- `LICENSE` — MIT

## Substack API notes

- Subscriptions: `substack.com/api/v1/subscriptions/page_v2?cursor=` (the old
  `/subscriptions` needs `?tvOnly=false` and lacks custom domains).
- Posts: `{pub}/api/v1/archive?sort=new&offset=&limit=25`; bodies via
  `substack.com/api/v1/posts/by-id/{id}` (uses the main sign-in, so paid
  posts on custom domains unlock), falling back to `{pub}/api/v1/posts/{slug}`.
- A paywalled post the reader can't open returns a preview (<80% of wordcount).
- Substack rate-limits quickly (HTTP 429). Test with stubbed fetch / cached
  fixtures rather than hammering live endpoints.

## Testing

No test runner yet. Changes were verified with headless Chrome (CDP) driving
`app.html`/`book.html` served over http with a stubbed `chrome.*` API, plus
`xmllint` on EPUB output. `--load-extension` doesn't work in branded Chrome.

## Design

The book looks like a literary review (LRB, NYRB), not a newspaper; the same
direction as the owner's Broadsheet app (2026-10-18). The contents are the
cover: `cover-line` (dates · essays · reading time), the reader's own title as
`cover-title` only if it isn't one of the app's defaults (`DEFAULT_TITLES` in
book.js), then the contents (`.toc`, inside the cover; the first entry `lead`,
with its subtitle via `summary()`). Titles in the text face's regular weight,
publications in muted small capitals, hairlines between entries, no accent
colour in the book; adjacent footnote anchors get `footnote-next` (a comma).
The EPUB's title page holds the contents (`contentsPage` may be null in
`buildEpub`); its drawn cover lists the titles too. The app's UI uses one ink
for actions (`--accent` is ink, not orange). Typeface (1.1.0): `lib/fonts.js`
`TYPEFACES`, each a stack with Windows/Linux fallbacks; `job.typeface` sets
`--serif` in the book and the HTML file, `body { font-family }` in the EPUB
(a publisher font) and the drawn cover. Store screenshots and promo tiles are
made in headless Chrome from a stubbed `chrome.*` (2026-10-18; not in the repo).

## Conventions

- Plain, concrete, unhyped prose in UI and docs; no emoji.
- Wording: "staple … into one collection", not "book", in marketing copy.
- Contact: contact+staple@victorshammas.com. Owner's Substack for examples:
  www.theorybrief.com.
- Releases: follow `RELEASING.md`; keep `docs/privacy.html` identical to
  `store/privacy-policy.md`.
