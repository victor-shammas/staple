# Staple website (GitHub Pages, custom domain)

The static marketing, support and privacy pages for Staple, the Chrome extension. The site is plain HTML and one stylesheet, with no build step, external fonts, scripts or trackers. It shares its design and `style.css` with the Plainview, Gaugeline and Quoth sites; the palette matches the extension icon: espresso (`#553E27` → `#261B10`) and amber (`#FFD27E` → `#F39C2F`), with a warm off-white (`#F4F1EC`) in light mode.

| File | Published URL |
|---|---|
| `index.html` | https://victorshammas.com/staple/ (website / homepage URL) |
| `support.html` | https://victorshammas.com/staple/support.html (support URL) |
| `privacy.html` | https://victorshammas.com/staple/privacy.html (privacy policy URL for the Chrome Web Store) |
| `style.css`, `icon.png`, `favicon.png`, `apple-touch-icon.png` | assets |
| `images/book.png`, `images/app.png` | screenshots (1280×800) for the home page |
| `.nojekyll` | tells Pages to serve files as-is |

The Chrome Web Store listing links to the privacy and support pages, so keep the paths stable.

## How the URL works

The GitHub Pages **user site** (the `victor-shammas.github.io` repo) uses the custom domain `victorshammas.com`. GitHub serves every **project site** of the same account under that domain at `/<repo-name>/`, so a public repo named **`staple`** with Pages turned on is published at `https://victorshammas.com/staple/`. The repo needs **no `CNAME` file**; don't add one.

## Deploy

1. Create a **public** repository named exactly **`staple`** on the **victor-shammas** account.
2. Copy the *contents* of this folder (including `.nojekyll`) to the root of that repo, then commit and push to `main`.
3. Repo › **Settings › Pages** › Source: **Deploy from a branch**, Branch: **main**, folder **/ (root)**. Leave "Custom domain" empty; it's inherited from the user site.
4. After a minute or two, open the three URLs above and check they load over HTTPS.

## At launch

- **Chrome Web Store link:** `index.html` shows a disabled "Coming soon to the Chrome Web Store" button. Once the listing is live, replace the `<span class="btn" aria-disabled="true">…</span>` line with the link in the HTML comment just above it, putting in the real listing URL (`https://chromewebstore.google.com/detail/staple/<extension ID>`, copied from the Developer Dashboard). `support.html` (Getting started › How do I install Staple?) points to the home page for the link, so it needs no change, but you can link the store directly there too.
- **Official badge (optional):** to use Google's "Available in the Chrome Web Store" badge instead of the text button, download it from the Chrome Web Store branding guidelines and follow their rules.
- **Screenshots:** replace `images/book.png` (a book's cover and contents) and `images/app.png` (the Publications step) with final 1280×800 screenshots under the same names. If what they show changes, update their `alt` text in `index.html`.
- **Privacy policy:** `privacy.html` is the text of `store/privacy-policy.md` in the Staple project. If the policy changes, update both and the effective date.
- Regenerate the icons after an icon change (they are copies of `store/brand/icon-256.png`, `favicon.png` and `apple-touch-icon.png`).
- **The other sites:** the app bar here lists four tiles under "Small, private apps by Victor Shammas". The Plainview, Gaugeline and Quoth sites still say "Small, private Mac apps" with three tiles; add the Staple tile (and the four-column `.app-tiles` rules from this `style.css`) there when Staple launches.
