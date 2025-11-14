# yt-playlist-manager

🎬 **Project Introduction & Demo Video**  
https://www.youtube.com/watch?v=2swJjpv5rZk&feature=youtu.be

A Next.js (App Router) application for managing YouTube playlists in bulk. Sign in with Google, fetch your playlists, and perform batch add/move/remove operations with a single interface.

## Features

- Google OAuth 2.0 login with secure, signed sessions
- Live YouTube Data API v3 integration (playlists & playlist items)
- Bulk add, move, and remove actions with idempotency + action history
- React Query powered UI with optimistic refresh, toasts, and loading/error states
- Mock mode fallback with seeded sample data when credentials are not configured

## Prerequisites

- Node.js 18.18 or newer (see `.nvmrc`)
- npm (recommended) or pnpm/yarn/bun
- A Google Cloud project with the YouTube Data API v3 and OAuth consent screen configured

### Google OAuth setup

1. In the Google Cloud Console create (or reuse) an OAuth 2.0 Client ID of type **Web application**.
2. Add `http://localhost:3000/api/auth/callback` to the authorised redirect URIs.
3. Enable the **YouTube Data API v3** for the same project.
4. Copy the client ID and client secret for use in your environment variables.

## Environment variables

| Variable               | Required | Description                                                                   |
| ---------------------- | -------- | ----------------------------------------------------------------------------- | --- |
| `GOOGLE_CLIENT_ID`     | Yes      | OAuth client ID issued by Google.                                             |
| `GOOGLE_CLIENT_SECRET` | Yes      | OAuth client secret.                                                          |
| `GOOGLE_REDIRECT_URI`  | Yes      | Redirect URL (defaults to `http://localhost:3000/api/auth/callback`).         |
| `SESSION_SECRET`       | Yes      | Secret used to sign session cookies (use a long random string in production). |
| `APP_BASE_URL`         | Yes      | Base URL used for redirects and links (e.g. `http://localhost:3000`).         |     |
| `LOG_LEVEL`            | No       | Pino logger level (`debug`, `info`, `warn`, `error`).                         |

### Getting started

1. Install dependencies:

   ```bash
   npm install
   ```

2. Create a `.env.local` from the template and fill in your credentials:

   ```bash
   cp .env.example .env.local
   ```

3. Start the development server:

   ```bash
   npm dev
   ```

4. Open [http://localhost:3000](http://localhost:3000) in your browser.

## Using the app

1. **Sign in:** click _Sign in with Google_. In mock mode (missing env vars) the UI loads sample data.
2. **Pick playlists:** the left column lists your playlists from `/api/playlists`. Selecting one loads its items.
3. **Select videos:** check the videos you want to edit; the toolbar shows how many are selected.
4. **Run a bulk action:**
   - _Add videos:_ paste video IDs, choose a target playlist, and press _Add videos_.
   - _Remove selected:_ removes the checked videos from the current playlist.
   - _Move selected:_ pick another playlist in the dropdown and press _Move selected_.
5. **Review history:** open [/action-log](http://localhost:3000/action-log) to inspect past actions, retry failed items, or undo a batch.

## Testing & linting

```bash
npm lint
npm typecheck
```

## Production checklist

- Provide production values for the environment variables above.
- Publish the OAuth consent screen and monitor YouTube Data API quota.
- Rotate `SESSION_SECRET` and refresh tokens as needed.
- Consider exporting/importing your SQLite database for backups.

## Troubleshooting

| Issue                                | Hint                                                                                                                                     |
| ------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------- |
| Missing environment variables        | Mock mode will activate; fill `.env.local` with valid Google credentials for live data.                                                  |
| Login redirects to an error          | Make sure the redirect URI matches `GOOGLE_REDIRECT_URI` exactly.                                                                        |
| OAuth callback missing refresh token | Revoke the app in [Google Account settings](https://myaccount.google.com/permissions) and sign in again to force a fresh consent screen. |
| API calls return `quotaExceeded`     | Bulk operations consume ~50 quota units per insert/delete. Check usage in Google Cloud Console.                                          |

## License

This project is provided as-is for internal tooling demos. Adapt before using in production.
