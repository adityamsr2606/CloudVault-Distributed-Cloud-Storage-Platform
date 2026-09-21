# Public Netlify deployment

CloudVault uses Netlify only for the public React/Vite frontend. Supabase remains the
production backend for authentication, PostgreSQL, RLS, Realtime, Edge Functions,
private storage metadata and retrieval.

## Repository settings

The repository contains a root `netlify.toml` with:

- base directory: `frontend`
- build command: `npm install && npm run build`
- publish directory: `frontend/dist`
- Node.js 22
- SPA rewrite to `/index.html`
- immutable caching for Vite fingerprinted assets
- basic browser security headers

The SPA rewrite is required so direct visits to routes such as:

- `/auth`
- `/app`
- `/app/vault`
- `/app/settings`
- `/s/:token`
- `/reset-password`

do not return a Netlify 404.

## One-time Netlify account setup

1. Sign in to Netlify.
2. Choose **Add new project > Import an existing project**.
3. Select GitHub.
4. Install/authorize the Netlify GitHub App for only:
   `adityamsr2606/CloudVault-Distributed-Cloud-Storage-Platform`
5. Select that repository.
6. Netlify should read `netlify.toml`; do not replace the configured build values.
7. Publish the project.

## Make the production site public

New Netlify teams can default new projects to private.

After the first successful production deploy:

1. Open the Netlify project.
2. Go to **Project configuration > General > Visitor access > Project visibility**.
3. Set **Production deploys** to **Public**.
4. Keep Deploy Previews private if desired.
5. Save.

A public production deployment can be opened by anyone who has the URL and does not
require a Netlify team login.

## Production domain

Use the project's production `*.netlify.app` domain from:

**Domain management > Production domains**

Do not distribute Deploy Preview URLs as the main CloudVault link.

After the final production domain exists, update the repository README/live-app link to
that domain.

## Supabase Auth redirect

CloudVault generates recovery redirects from `window.location.origin`, so a Netlify-hosted
recovery request points to:

`https://<your-netlify-domain>/reset-password`

The Netlify production origin must also be allowed in Supabase Auth.

In Supabase:

1. Open the CloudVault project.
2. Go to **Authentication > URL Configuration**.
3. Set the Site URL to the public production origin if Netlify is now the canonical host,
   or keep the existing canonical Site URL and add Netlify as an allowed redirect.
4. Add:
   `https://<your-netlify-domain>/**`
   to Redirect URLs.
5. Save.

Do not remove localhost redirects that are still needed for development.

## Supabase frontend variables

CloudVault currently has safe publishable fallbacks in the frontend, but the preferred
Netlify configuration is to set these public build variables:

`VITE_SUPABASE_URL`
`VITE_SUPABASE_PUBLISHABLE_KEY`

Never add `SUPABASE_SERVICE_ROLE_KEY`, Backblaze application keys, or any other server
secret to Netlify frontend environment variables.

## Large-file uploads

Moving the frontend to Netlify does **not** change storage-provider limits.

The current product state remains:

- product file policy: 1.5 GiB
- Supabase direct path: 50 MB
- large-file provider target: Backblaze B2
- B2 feature flag: disabled until the private bucket/application key is configured

Therefore the Netlify deployment fixes public frontend access, but a 64 MiB file still
requires the Backblaze large-file provider to be activated before it can upload live.

## Verification

After publishing:

1. Open the production Netlify URL in a signed-out/incognito browser.
2. Confirm the landing page loads without a Netlify login prompt.
3. Open `/auth` directly in a new tab.
4. Open `/reset-password` directly and confirm the SPA loads.
5. Sign in with a normal CloudVault account.
6. Confirm My Vault remains user-isolated.
7. Test phone/tablet layouts.
8. Confirm the stable Netlify production URL works on a separate device/network.
