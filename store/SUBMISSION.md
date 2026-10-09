# Staple — Chrome Web Store submission kit

Everything needed to publish Staple 1.0.0. Work through the checklist in
order; the text to paste is below it.

| File | Use |
|---|---|
| `staple-1.0.0.zip` | The package you upload |
| `screenshots/*.png` (1280×800) | Listing screenshots, in numbered order |
| `promo-small-440x280.png` | Small promo tile (required) |
| `promo-marquee-1400x560.png` | Marquee promo tile (optional) |
| `brand/icon-1024.png`, `../icons/128.png` | Store icon (upload the 128 px one) |
| `privacy-policy.md` | Source text of the policy published at the URL below |
| `notes-post.md` | Draft announcement for Substack Notes |

The website (including the privacy policy) lives in `../site/` and is
published from the `victor-shammas/staple` repository to
**https://victorshammas.com/staple/**.

---

## Checklist

1. **Test the exact package.** Unzip `staple-1.0.0.zip` into an empty folder,
   remove your development copy in `chrome://extensions`, load the unzipped
   folder with Load unpacked, and make one PDF, one EPUB and one HTML.
2. **Developer account** (chrome.google.com/webstore/devconsole): pay the
   one-time $5 fee, turn on 2-step verification, verify the contact email, and
   make the **trader / non-trader declaration** (non-trader for a free
   extension with an optional tip link).
3. **Check the privacy policy is live** at
   https://victorshammas.com/staple/privacy.html.
4. **New item → upload** `staple-1.0.0.zip`.
5. **Store listing tab** — paste the description, choose the category, upload
   the icon, the four screenshots and the promo tiles.
6. **Privacy tab** — paste the single purpose and the permission
   justification, answer the data questions, add the privacy-policy URL.
7. **Test instructions tab** — paste the reviewer instructions below.
8. **Distribution tab** — Free, Public, all regions.
9. **Submit for review.** Expect a few days, possibly up to two weeks: you are
   a new developer, and the optional "any website" permission (for
   custom-domain publications) can mean a manual review.
10. When it's live, put the listing link in `../site/index.html` (see the
    comment above the hero button), push the site, and post `notes-post.md`.

---

## Store listing

**Summary** (from the manifest, 119/132 characters):
> Staple a week of Substack essays into one PDF, EPUB or HTML file — free posts, plus paid ones you already subscribe to.

**Category:** Tools

**Language:** English

**Description** (mentions "Substack" four times; the spam guideline is about
repeating keywords more than five times):

```
Staple collects your week of Substack reading into one EPUB, PDF or HTML collection.

Pick your publications — import your subscriptions in one click or add any publication by its address — choose a date range, and Staple gathers the longform posts you can read into one cleanly typeset file:

• PDF — print-ready, with a cover, linked contents, page numbers and footnotes
• EPUB — for Apple Books, Kobo, Calibre or Send to Kindle
• HTML — a single self-contained file that opens in any browser, even offline

FEATURES
• Works with your own sign-in: free posts, plus paid posts you already subscribe to.
• Never gets around paywalls. For paid posts you don't subscribe to, Staple can include only the free preview anyone can see, clearly marked "preview only" — handy for deciding what's worth subscribing to.
• Groups: save sets of publications ("AI", "Politics", "Culture") and switch between them in one click.
• Date range and minimum length filters, so you get essays rather than notes.
• Clean reading: subscribe buttons and share widgets removed; tweets, videos and embedded posts turned into tidy quotes and links; footnotes kept and linked.
• Image size: full width, 75%, 50%, 25% or none — smaller sizes make smaller files.
• Every post links back to the original so you can like, comment and restack.

PRIVATE BY DESIGN
Staple reads your subscription list and the posts you pick through your own sign-in, and builds the file on your device. It has no analytics, no server and no ads; nothing is sent to the developer or anyone else. Collections you make are for your own reading.

Free, with an optional tip link. Staple is independent and not affiliated with, endorsed by or sponsored by Substack Inc.; "Substack" is a trademark of Substack Inc.
```

**Screenshots** (upload in this order): `1-publications`, `2-posts`,
`3-book-cover`, `4-book-article`. They feature essays from The Theory Brief
(your own publication), shown with demo dates within one week.

**Homepage URL:** https://victorshammas.com/staple/
**Support URL:** https://victorshammas.com/staple/support.html

---

## Privacy tab

**Single purpose:**
> Staple compiles Substack posts that the user can already read into a single PDF, EPUB or HTML file for offline reading.

**Permission justifications:**

- **storage** —
  > Saves the user's publication list, publication groups, preferences and the books they've started, locally in the browser.

- **Host permission** (one combined field) —
  > substack.com and *.substack.com: read the signed-in user's subscription list and fetch post listings and post text through their existing Substack session, so posts they already have access to (including paid posts they subscribe to) can be compiled. Optional https://*/*: some Substack publications use their own domain (e.g. www.theorybrief.com). Staple requests access to one specific domain at a time (e.g. https://*.theorybrief.com/*), only when the user adds such a publication or clicks Find posts with one selected, and Chrome asks the user to approve each site. It never requests all-sites access, and it gives a domain's access back when the user removes that publication.

**Remote code:** No, I am not using remote code. (All scripts ship in the
package; the extension fetches only data — JSON from Substack and images from
Substack's image server.)

**Data usage:** tick **Website content** only (post text and images,
processed locally). Leave Authentication information unticked: Staple never
reads or stores credentials or cookies, and has no `cookies` permission — the
browser attaches the user's existing sign-in to requests. Then tick all three
certifications:
- I do not sell or transfer user data to third parties, outside of the approved use cases
- I do not use or transfer user data for purposes that are unrelated to my item's single purpose
- I do not use or transfer user data to determine creditworthiness or for lending purposes

**Privacy policy URL:** https://victorshammas.com/staple/privacy.html

---

## Test instructions tab

```
No account needed for the core flow:
1. Click the Staple toolbar icon (it opens a tab).
2. In "Add by URL", type www.theorybrief.com and click Add. Chrome asks permission to read that site (it's a Substack publication on its own domain) — click Allow.
3. Click Find posts (last 7 days, 400+ words).
4. Click Make EPUB (downloads a .epub), Make PDF (opens the print dialog; choose Save as PDF) or Make HTML.

For a publication on a substack.com address (no permission prompt), use thezvi.substack.com.

"Import my subscriptions" and paid posts require being signed in to substack.com in the same Chrome profile. Paid posts the reviewer doesn't subscribe to appear as "Paid · preview only" and are left out by default — Staple does not bypass paywalls.

Security notes: post HTML is parsed in an inert DOMParser document and sanitized (scripts, iframes, objects, forms, SVG and templates removed; only plain attributes kept; links limited to http(s), mailto and in-page anchors); the default MV3 CSP applies to all extension pages.
```
