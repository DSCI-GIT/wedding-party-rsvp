# Sunyoung & Eric Wedding Party RSVP

A cute static RSVP site for quickly estimating wedding party attendance while Sunyoung and Eric choose a venue.

The public site is safe for GitHub Pages: it does not commit raw contacts, invite tokens, admin keys, phone numbers, or emails. Personalized invite data and contact edits live in a private Google Sheet behind a Google Apps Script endpoint.

## What is included

- Public RSVP page with personalized invite-token lookup.
- Named partner checkbox when the invite household has a partner.
- Contact helper page for Eric, Sunyoung, Sia, and Seijin at `#contacts`, including detail confirmation, couple/single confirmation, share-link actions, sent tracking, and latest RSVP status.
- Google Apps Script backend source in `google-apps-script/Code.gs`.
- Private contact matching generator in `scripts/generate-invites.mjs`.
- GitHub Pages deployment workflow.

## Local preview

```bash
npm install
npm run dev
```

Open the local URL and use `#invite=demo` for the demo RSVP. Use `#contacts&admin=demo-admin` to preview the helper page before the backend is connected.

## Generate private Google Sheet seed files

The generator reads the exported contacts from Downloads by default:

- `C:/Users/er1c_/Downloads/contacts.csv`
- `C:/Users/er1c_/Downloads/Phone Link/Sunyoung Contacts.vcf`

Run:

```bash
npm run generate:invites
```

It writes ignored files under `private/google-sheet-seed/`:

- `invitees.csv`
- `contacts.csv`
- `responses.csv`
- `generated-links.csv`

Import the first three CSV files into a private Google Sheet with tabs named exactly `Invitees`, `Contacts`, and `Responses`. The `Contacts` tab includes confirmation, share method, sent status, and last-shared columns. Keep `generated-links.csv` private; it contains the personal invite URLs.

Set a real site URL when generating links:

```bash
SITE_URL="https://YOUR-GITHUB-USERNAME.github.io/wedding-party-rsvp/" npm run generate:invites
```

## Google Apps Script setup

1. Create or open the private Google Sheet.
2. Add the three tabs: `Invitees`, `Contacts`, and `Responses`.
3. Import the generated CSV files into matching tabs.
4. Open Extensions > Apps Script.
5. Paste `google-apps-script/Code.gs` into the script editor.
6. Set Script Properties:
   - `SHEET_ID`: the private Google Sheet ID.
   - `ADMIN_KEY`: a long private key shared only with Eric, Sunyoung, Sia, and Seijin.
7. Run `setupSheets` once if you need headers created.
8. Deploy as a Web App with access set to anyone with the link.
9. Copy the Web App URL into `.env.local`:

```bash
VITE_RSVP_API_URL=https://script.google.com/macros/s/YOUR_DEPLOYMENT_ID/exec
```

Then rebuild the site.

## GitHub Pages

The workflow in `.github/workflows/deploy.yml` builds and deploys the static site from `dist` when pushed to `main`.

In the GitHub repository settings, enable Pages with GitHub Actions as the source. Add `VITE_RSVP_API_URL` as a repository variable or secret if you want the deployed build connected to the live Apps Script endpoint.

## Security notes

- Invite tokens are only in the private Google Sheet and private generated links file.
- The frontend sends invite tokens in the URL fragment, not the query string.
- The contact helper requires the Apps Script `ADMIN_KEY` and can mark links as sent while showing who is still waiting to RSVP.
- Do not commit anything under `private/`.
- Do not commit `.env.local`, raw contact exports, phone numbers, emails, or generated invite links.