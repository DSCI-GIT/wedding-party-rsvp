# Wedding Jam Planner

The music board is part of the existing Vite/React wedding site. The invitation page links to `#invite=<existing token>&view=jam`; `/jam/#invite=<existing token>` also redirects to that view. Invitations keep their existing credentials.

## Access And Saving

Every valid RSVP invite can read the board and vote for songs. Each guest has one vote per song and can remove it. The Night's favourites view ranks the shared shortlist by vote count. Both source lists refer to the same song IDs.

Every guest can switch their own musician status on or off. Simon Carroll, Katrusia, Matt Redman, Adam Muzzin, Jon Acheson, Sara Acheson, and Mike Brown default to on. Turning status off hides that guest's saved instrument claims from the active lineup; switching back on restores them. Voting does not require musician status.

Musicians can claim multiple instruments per song. Requests set the desired state rather than blindly toggling it, so retries do not reverse a choice. The backend derives the musician identity from the invite; it never accepts a caller-supplied member identity. Artist choices have a revision check so a stale browser cannot silently overwrite a newer choice.

## Backend

`google-apps-script/jam/Code.gs` is a separate Apps Script web app. Do not paste it into the RSVP script: it defines its own `doGet` and `doPost`. It reads the existing private Sheet's `Invitees` tab and writes only these music tables:

- `JamSongs`: canonical songs and original list positions.
- `JamParticipants`: each guest's musician switch.
- `JamClaims`: song/instrument/guest assignments.
- `JamArtists`: shared artist choice and revision.
- `JamVotes`: individual song votes.

All music data reads and writes require a valid invite token in a POST body. Responses contain song data, active musician names/initials, assignments, aggregated votes, and only the viewer's own vote selections. They contain no invite tokens, email addresses, phone numbers, or individual vote identities.

### Deploy Or Update

1. Run `node scripts/build-jam-backend.mjs <PRIVATE_RSVP_SHEET_ID>`. This generates the complete script with the song seed in ignored `private/jam-deployment/Code.gs`.
2. Use a separate Apps Script project named Wedding Jam Board. Replace its source with the generated file.
3. Run `setupJamBoard` as the owner and approve spreadsheet access. Setup adds missing tables and songs; it never clears existing data.
4. Deploy as a web app, executing as the owner, accessible to Anyone. The application still validates an existing invitation on every data request.
5. Set `VITE_JAM_API_URL` to its `/exec` deployment URL in the Pages workflow and `.env.local` for development. Keep the original `VITE_RSVP_API_URL` as it is.
6. For a later code update, edit the music deployment to use a new version; keep its URL to preserve the frontend configuration.

Requests use `Content-Type: text/plain;charset=utf-8` for compatibility with the site's existing Apps Script cross-origin request pattern. No browser storage is used as the shared source of truth. The board refreshes every 60 seconds while visible; successful writes return the current shared state. Failed requests display an error and ask for a refresh to check whether a delayed write completed.

## Source Import

`src/jam/songs.json` is the non-sensitive song dataset from the supplied archive. It has 94 canonical songs, 51 band entries, 53 distinct acoustic entries, and 10 songs shared between lists. The acoustic source repeats Last Kiss, so the displayed source positions skip one number. Uncertainty notes and proposed artist options are retained as supplied. The original archive's private invitation file, older Cloudflare implementation, and duplicate frontend are not included.

## Verification

`node --test tests/jam-backend.test.mjs` checks authentication, guest votes, deduplication, independent instrument claims, opting in/out, artist conflicts, and repeatable setup. `npm run build` checks the React application.

For local browser checks only, run `node tests/jam-preview.mjs`, then start Vite on port 5174 with `VITE_JAM_API_URL=http://127.0.0.1:8770`. The fixture uses invented guest tokens and memory-only test data. It is never deployed as a separate demo site.
