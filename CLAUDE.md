# Staple (Chrome extension)

Staple staples a date range of Substack posts the user can read (free posts,
plus paid posts they subscribe to) into one PDF, EPUB or HTML file. Manifest
V3, plain ES modules, no build step, no dependencies.

## Layout

- `manifest.json`, `background.js` (toolbar click → reuse or open the app tab)
- `app.html/css/js` — picker UI: publications, groups, filters, posts, output
- `book.html/css/js` — renders the collection; PDF via print, EPUB/HTML download
- `lib/substack.js` — Substack's undocumented JSON API, timeouts, rate limits
- `lib/clean.js` — sanitizes post HTML (attribute + URL allowlists), embeds
- `lib/epub*.js`, `lib/zip.js`, `lib/html-export.js`, `lib/images.js`
- `lib/config.js` — `SUPPORT_URL` (Buy Me a Coffee)
- `store/` — Chrome Web Store kit (`SUBMISSION.md`, screenshots, promo, brand)
- `site/` — **separate public repo** `victor-shammas/staple` (GitHub Pages at
  https://victorshammas.com/staple/); ignored here

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

## Conventions

- Plain, concrete, unhyped prose in UI and docs; no emoji.
- Wording: "staple … into one collection", not "book", in marketing copy.
- Contact: contact+staple@victorshammas.com. Owner's Substack for examples:
  www.theorybrief.com.
- Releases: follow `RELEASING.md`; keep `site/privacy.html` identical to
  `store/privacy-policy.md`.
