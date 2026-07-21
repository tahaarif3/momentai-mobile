# Webapp handoff — Multi-target playlist output

This cloud agent **implemented** the MomentAi web changes locally but **could not push** to `tahaarif3/MomentAi` (403 for `cursor[bot]`). Apply the companion patch, or paste this prompt into an agent with write access to that repo.

## Apply the patch (fastest)

From a clone of https://github.com/tahaarif3/MomentAi on `master`:

```bash
git checkout -b cursor/multi-target-playlist-output-0d0e
git apply path/to/webapp-multi-target-output.patch   # shipped in momentai-mobile docs/
# or: git am < webapp-multi-target-output.patch
npm install   # pulls jose
git push -u origin HEAD
# open PR → base master
```

Patch file: `docs/webapp-multi-target-output.patch` (also under `/opt/cursor/artifacts/` on the agent machine).

## Prompt for a webapp agent

```
Implement multi-target playlist output on MomentAi (https://github.com/tahaarif3/MomentAi).

Companion mobile PR is on momentai-mobile branch cursor/multi-target-playlist-output-0d0e.

### Goals
1. Canonical track fields: extend slimTrack with isrc, appleCatalogId, odesliLink (JSON on generations.tracks — no Prisma column change).
2. At generation time: backfill ISRC via Spotify GET /v1/tracks?ids=; enrich Odesli links; resolve Apple catalog IDs when APPLE_MUSIC_* env is set.
3. Always persist generations (user_id may be null) so share URLs work; return generationId + shareUrl always.
4. Public GET /api/playlist/generation/:id/links (lazy backfill) + SSR GET /p/:id with Open Graph tags.
5. GET /api/apple/dev-token — ES256 JWT via jose; private key server-only.
6. Compatibility features: multiTargetLinks, appleMusicSave, appleMusicDevToken.
7. Soft-retire interactive web UI behind WEB_INTERACTIVE_UI_ENABLED=false (default ON). Keep landing-app.html, continue-in-app.html, /p/:id, privacy/terms/auth callback.
8. Update docs/mobile-api.md and tests/mobile_api.spec.js.

### Key files already designed
- src/utils/moments.js — slimTrack + publicPlaylistUrl
- src/clients/spotifyClient.js — getTracksByIds
- src/clients/appleMusicClient.js — getDeveloperToken, resolveCatalogIdByIsrc
- src/services/trackLinkService.js — ensureIsrcs, enrichTrackLinks, ensureGenerationTrackLinks
- src/services/publicPlaylistPage.js — SSR HTML
- src/routes/apple.js, src/routes/playlist.js links route
- src/workers/playlistWorker.js — always persist + enrich
- src/server.js — /p/:id before SPA catch-all; landing flag
- src/public/landing-app.html, continue-in-app.html
- .env.example — APPLE_MUSIC_*, ODESLI_API_BASE, WEB_INTERACTIVE_UI_ENABLED
- dependency: jose

Prefer applying docs/webapp-multi-target-output.patch from the mobile PR if available.
Do NOT delete API routes. Flag-off interactive UI only.
```

## Env to set on production after merge

```
APPLE_MUSIC_ENABLED=true          # when ready
APPLE_MUSIC_TEAM_ID=Y6PG237H4X
APPLE_MUSIC_KEY_ID=…              # from MusicKit key in Apple Developer
APPLE_MUSIC_PRIVATE_KEY=…         # PEM; never in mobile bundle
# WEB_INTERACTIVE_UI_ENABLED=true  # leave on until analytics cycle; then false
```

## Contract mobile already expects

- `shareUrl` / `generationId` on job complete
- `GET /api/playlist/generation/:id/links`
- `GET /p/:id`
- `GET /api/apple/dev-token`
- compatibility `features.multiTargetLinks` / `appleMusicSave` / `appleMusicDevToken`
