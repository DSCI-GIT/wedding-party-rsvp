# Wedding Thank-You Page

The thank-you page replaces every guest-facing invitation and jam route, preserving existing `#invite=` links. The unlinked `#contacts=` route retains the historical admin tools. No RSVP records, contact details, messages, or Apps Script deployments are modified.

## Personal Notes

`public/thank-you-guests.json` contains encrypted first-person greeting records, not a readable guest list. Each record is authenticated AES-256-GCM ciphertext under a key derived from that guest's high-entropy invitation token, indexed by a separately domain-separated SHA-256 token hash. No raw invitation tokens, gift-household list, email addresses, or phone numbers are published. The bearer link remains the secret, so anyone with a guest's link can read that guest's note.

Both individual links in a couple include both first names in viewer order. Gift acknowledgment is enabled for both partners only in the privately confirmed gift households. General visitors get no gift line. Guests whose recorded household RSVP was not yes receive wording that does not imply they attended.

To refresh names and gift settings, update the ignored `private/thank-you/gift-households.json`, then run:

```powershell
node scripts/prepare-thank-you.mjs --refresh-guests --personalize
```

This reads the existing admin key file and backend URL, exports only the needed name/token/status fields to ignored private storage, and creates the encrypted public manifest. An unknown/new token may fall back to the existing invite API for its greeting; regenerate the manifest to include any newly added gift recipients. No new Apps Script is required.

## Photos

The gallery contains 24 optimized wedding photos, 12 initially shown. All gallery images are public GitHub Pages assets, not token-protected downloads. A photo of paperwork is deliberately excluded. The preparation script auto-orients, resizes, and exports WebP without original EXIF/location metadata. Originals are unchanged. Full-size gallery images are capped at 1800px; thumbnails at 640px. Set `SHARP_PATH` to the installed Sharp package path before running `node scripts/prepare-thank-you.mjs --photos`.

The gallery includes scroll reveals, full-screen native dialog, previous/next, keyboard arrows, swipe, five-second slideshow, pause, individual downloads, Escape close, focus restoration, and reduced-motion support.

## Verification

`node --test tests/thank-you.test.mjs` tests crypto separation, gift state, greetings, guest route replacement, and gallery assets. `tests/thank-you-browser.mjs` is an opt-in private browser test requiring local guest snapshots, `PLAYWRIGHT_PATH`, and optionally `CHROME_PATH`. It checks all personal links without printing tokens, all gift households, gallery interactions, mobile overflow, reduced motion, and the admin route. Set `THANK_YOU_TEST_URL` to verify the published site; omit it for the local Vite server on port 5175.
