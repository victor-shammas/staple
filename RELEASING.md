# Releasing Staple

Staple ships through two channels from this repo:

- **Chrome Web Store** — the main channel (auto-updates for users).
- **GitHub release** on this repo (`victor-shammas/staple`), for manual
  installs.

## Checklist

1. **Version.** Bump `"version"` in `manifest.json` (semver: fixes → patch,
   features → minor).
2. **Changelog.** Add an entry at the top of `CHANGELOG.md`.
3. **Test.** Load the folder unpacked in `chrome://extensions` and make one
   PDF, one EPUB and one HTML from a couple of publications (one on
   substack.com, one on a custom domain such as www.theorybrief.com). Check
   Import my subscriptions while signed in.
4. **Build the zip** (from the repo root):

       zip -r -X store/staple-X.Y.Z.zip manifest.json background.js app.html app.css app.js \
         book.html book.css book.js epub.css icons lib -x "*.DS_Store"

   Then unzip it into an empty folder, load *that* unpacked, and repeat a quick
   test — it's exactly what reviewers and users get.
5. **Chrome Web Store.** Developer Dashboard → Staple → Package → Upload new
   package. If permissions, data handling or the listing changed, update the
   Store listing / Privacy tabs too (text in `store/SUBMISSION.md`).
   Submit for review.
6. **GitHub release** (manual-install copy):

       gh release create vX.Y.Z store/staple-X.Y.Z.zip --repo victor-shammas/staple \
         --title "Staple X.Y.Z" --notes "…what changed…"

7. **Tag this repo:** `git tag vX.Y.Z && git push --tags`.
8. **Website** (`docs/`): update anything that changed — support answers,
   screenshots, and `docs/privacy.html` if `store/privacy-policy.md` changed
   (keep them identical). Pushing to main publishes it.

## If a review is rejected

The email names a violation ID (e.g. "Purple Lithium" = privacy policy,
"Yellow Magnesium" = didn't work for the reviewer). Fix, bump the patch
version, and resubmit; the reviewer test instructions are in
`store/SUBMISSION.md`.
