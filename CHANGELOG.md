# Changelog

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
