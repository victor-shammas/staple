# Staple

A Chrome extension that binds a week (or any range) of Substack essays into one
print-ready PDF, an EPUB for your e-reader, or a single self-contained HTML file. It uses your own Substack sign-in, so it
includes free posts plus any paid posts you subscribe to; paywalled posts you
can't read are shown as "preview only" and left out by default.

## Install (developer mode)

1. Open `chrome://extensions` and turn on **Developer mode** (top right).
2. Click **Load unpacked** and choose this `Staple` folder.
3. Pin Staple from the puzzle-piece menu and click its icon to open it.

Be signed in to substack.com in the same Chrome profile if you want
**Import my subscriptions** and paid posts to work.

## Use

1. **Publications** — import your subscriptions, or add any Substack by URL
   (`name.substack.com` or a custom domain like `theorybrief.com`). Custom
   domains ask for permission to read that site the first time. The list is
   saved; **Refresh subscriptions** picks up new ones.
   - **Groups**: *All* ticks everything; **+ New group** starts from nothing
     ticked — tick the publications, name it, save. Picking a group later ticks
     exactly its members; change the ticks and you can update the group or save
     a new one. *Selected only* filters the list to what's ticked.
2. **Which posts** — date range (defaults to the last 7 days) and a minimum
   length (default 400 words). Podcasts, threads and short notes are skipped.
3. **Posts** — tick what you want. Paid posts are checked for access.
4. **Make PDF / EPUB / HTML** — pick image size (full width, 75%, 50%, 25% or
   none; smaller sizes also download smaller files), then:
   - **PDF** opens the book and the print dialog. Choose **Save as PDF**; under
     *More settings*, untick **Headers and footers**.
   - **EPUB** downloads a `.epub` (cover, contents, one chapter per post, images
     embedded) for Apple Books, Kobo, Calibre or Send to Kindle.
   - **HTML** downloads one `.html` file with the stylesheet inlined and images
     embedded — opens in any browser, offline, and prints like the PDF.

## How it works

- `lib/substack.js` — calls Substack's undocumented JSON API with your cookies:
  `/api/v1/subscriptions/page_v2` (cursor-paginated), `{pub}/api/v1/archive`, and
  `substack.com/api/v1/posts/by-id/{id}` for bodies. A post counts as
  "preview only" when its body has under 80% of its listed word count.
- `lib/clean.js` — strips subscribe/share widgets, turns tweets, videos and
  embedded posts into static equivalents, and namespaces footnote ids.
- `book.html` / `book.css` — cover, contents, one article per chapter, print
  typography (`@page` size, page numbers). Image scale resizes via Substack's
  CDN (`w_` parameter) and caps display width.
- `lib/epub-export.js`, `lib/epub.js`, `lib/zip.js`, `epub.css` — EPUB 3 (with
  NCX fallback) built in the browser: images downloaded and embedded, a cover
  drawn on a canvas, zipped with `CompressionStream`.
- `lib/html-export.js`, `lib/images.js` — standalone HTML export and the image
  downloader shared with EPUB.
- `lib/notice.js` — the "Substack is rate-limiting — resuming in N s" banner.
- `app.html` / `app.js` — the picker UI. Settings, publications and groups live
  in `chrome.storage.local`.
- `lib/config.js` — `SUPPORT_URL`, the Buy Me a Coffee link shown in the app
  footer and for a minute on the finished book page (hidden while empty).

## Known limits

- The Substack API is unofficial and may change.
- Substack rate-limits bursts; requests are throttled to 3 at a time with
  retry/backoff, but importing 100+ publications will be slow.
- PDF goes through Chrome's print dialog (one extra click).
- EPUBs are checked for well-formed XHTML and a consistent manifest, but not
  yet run through epubcheck.

## Website

`site/` is the public website (home, support, privacy policy), published from
the `victor-shammas/staple` repository with GitHub Pages at
https://victorshammas.com/staple/. See `site/README.md`.

## Publishing

`store/` holds the Chrome Web Store kit: the upload zip, screenshots, promo
tiles, listing and privacy-form text, a privacy policy, and a Notes
announcement draft. Start with `store/SUBMISSION.md`. Rebuild the zip after
code changes (the command leaves out `store/` and this README):

    zip -r -X store/staple-1.0.0.zip manifest.json background.js app.html app.css app.js \
      book.html book.css book.js epub.css icons lib -x "*.DS_Store"
