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

## Publishing

This folder is served by GitHub Pages from the `main` branch, folder `/docs`, of the public repo `victor-shammas/staple` (which also holds the extension's source and releases). Edit the pages here and push to `main`; the site updates within a minute or two. If Pages ever needs setting up again: repo › **Settings › Pages** › Source: **Deploy from a branch**, Branch: **main**, folder **/docs**, and leave "Custom domain" empty.

## Store listing and assets

- **Chrome Web Store link:** Staple is live at https://chromewebstore.google.com/detail/staple/hakeoeghnpkdejinkkbopcmonhigpmdf. The "Add to Chrome" button in `index.html` and the first install step in `support.html` (Getting started › How do I install Staple?) link there; keep the URL free of `?authuser`/`hl` parameters.
- **Official badge (optional):** to use Google's "Available in the Chrome Web Store" badge instead of the text button, download it from the Chrome Web Store branding guidelines and follow their rules.
- **Screenshots:** replace `images/book.png` (a book's cover and contents) and `images/app.png` (the Publications step) with final 1280×800 screenshots under the same names. If what they show changes, update their `alt` text in `index.html`.
- **Privacy policy:** `privacy.html` is the text of `../store/privacy-policy.md`. If the policy changes, update both and the effective date.
- Regenerate the icons after an icon change (they are copies of `store/brand/icon-256.png`, `favicon.png` and `apple-touch-icon.png`).
- **The other sites:** Plainview, Gaugeline and Quoth carry the same four-tile app bar, including Staple; keep them in step when tiles change.
