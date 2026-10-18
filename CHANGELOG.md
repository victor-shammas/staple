# Changelog

## 1.1.1 — 2026-10-18

- The step numbers are in circles again (in ink on the paper tone, not orange).
- The typeface menu has a sample line beneath it: the first chosen essay's
  title and subtitle in that face, so the names mean something.

## 1.1.0 — 2026-10-18

- A quieter look, like a literary review rather than a newspaper: the contents
  are the cover (a line with the dates, the number of essays and the reading
  time, the collection's own title only if you gave it one, then the essays,
  the first a little larger with its summary). Titles in regular weight,
  publications in small capitals, no orange in the book; note numbers in muted
  ink, and notes side by side read "1, 2". The EPUB's drawn cover and title
  page follow (the contents are on the title page), and summaries end at a
  sentence. The app's own page uses the same quiet ink instead of orange.
- Typeface: Charter (as before), Palatino, Baskerville, Iowan Old Style,
  Georgia or a sans serif, for the PDF, the HTML file, the EPUB (as its
  publisher font) and its drawn cover. Each falls back to the nearest face on
  Windows and Linux.

## 1.0.0 — 2026-10-09

First release. Submitted to the Chrome Web Store on 2026-10-09; also published
as a GitHub release on victor-shammas/staple for manual install.

- Staple a date range of Substack posts into one PDF (print dialog), EPUB or
  self-contained HTML file: cover, linked contents, one chapter per post,
  footnotes, a closing note on supporting writers.
- Import subscriptions (`/api/v1/subscriptions/page_v2`), or add publications
  by URL, including custom domains (host permission requested per site).
- Groups of publications; "Selected only" filter; Refresh subscriptions.
- Filters: date range, minimum length (default 400 words), text posts only.
- Paid posts: full text when the reader subscribes; otherwise optional,
  clearly marked previews.
- Image size: full, 75%, 50%, 25% or none (resized via Substack's image CDN).
- Robustness: request timeouts, shared rate-limit cooldown with a countdown
  banner, Retry for failed publications, bot-check detection, per-tab book
  jobs, sync between open Staple tabs.
- Security: post HTML sanitized with attribute and URL allowlists; templates
  and scripts dropped; EPUB output kept valid XML.
