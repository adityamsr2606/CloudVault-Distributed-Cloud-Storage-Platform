# Production validation — 2026-09-18

This document records what was actually verified for the hosted CloudVault deployment.
It deliberately separates measured evidence from architectural capability.

## Source of truth

- Repository: `main`
- Validation hardening branch: `hardening/final-production-validation`
- Supabase project: `qodjrkkwvedkukyjiozv`
- Stable Vercel production alias:
  `https://cloudvault-distributed-cloud-storag-srivastavaadityamohan0-6847.vercel.app`

## CI evidence

The latest released CloudVault v2/hotfix path passed the repository quality gate before
promotion:

- backend Ruff lint
- backend Ruff formatting
- Pytest
- Python compile checks
- backend Docker image build
- npm high-severity audit
- TypeScript/Vite production build
- frontend Docker image build
- Deno typecheck for production Edge Functions

The repository does not claim a benchmark or coverage percentage that was not measured.

## Supabase security state

Verified:

- owner-scoped RLS remains enabled for private product tables
- Storage remains private
- share tokens are stored as hashes
- public share resolution uses controlled signed URLs
- folder trash/restore RPCs are authenticated and security-invoker
- `index-chunks` is a 410 Gone compatibility stub; `index-file` is the supported indexer
- B2 credentials are not exposed to the browser
- external generative AI remains opt-in and disabled by default

Current security advisor result:

- one warning: Supabase leaked-password protection is disabled

Supabase documents leaked-password protection as a Pro-plan feature. CloudVault keeps the
free-only deployment constraint, so this control cannot be enabled on the current plan.
As a free-plan mitigation, the CloudVault web UI now requires 12+ character mixed
passwords for new registrations and password resets. Existing users are not blocked from
signing in with previously accepted passwords.

## Supabase performance advisor

Fixed during final hardening:

- missing covering index for `multipart_uploads.folder_id`
- missing covering index for `multipart_uploads.replaces_file_id`

After the fix, the advisor reports only unused-index informational notices. The production
dataset is currently too small to use index-usage statistics as a removal signal.

## Real production database timings

Measured with PostgreSQL `EXPLAIN (ANALYZE, BUFFERS)` against the current production
dataset:

| Query | Execution time | Planning time | Current rows returned |
| --- | ---: | ---: | ---: |
| active folder listing | 0.152 ms | 0.512 ms | 2 |
| recent activity listing | 0.160 ms | 0.505 ms | 4 |

These are **database execution times only**. They are not HTTP, browser, Vercel, or
end-to-end latency measurements, and the dataset is tiny. They must not be presented as
scalability proof.

## Retrieval benchmark status

Current production data at validation time:

- files: 0
- file versions: 0
- indexed chunks: 0
- folders: 2
- activity events: 4
- share links: 0
- AI query events: 0

Because there are no indexed files/chunks, Precision@K, Recall@K, MRR and nDCG cannot be
measured meaningfully yet. The evaluation tooling is ready in
`evaluation/retrieval/evaluate.py`, but a representative real document corpus and
human-labelled relevance set are required before publishing any retrieval score.

## Large-file validation status

Configured product upload ceiling:

- 1.5 GiB per file

Active hosted-provider state:

- Supabase direct upload ceiling: 50 MB
- large-upload provider: R2
- `b2_enabled=false`

The multipart engine, provider-aware file lifecycle and R2 Edge Functions are implemented,
but no real B2 account credentials/bucket are connected in this environment. Therefore a
real >=1.5 GiB transfer has **not** been claimed as production-verified.

Activation requires the exact checklist in `docs/B2_SETUP.md`:

1. private B2 bucket
2. scoped B2 credentials stored only as Edge Function secrets
3. production CORS that exposes `ETag`
4. enable `b2_enabled`
5. test upload, pause, resume, refresh recovery, versioning, sharing, download and purge
6. complete an actual >=1.5 GiB upload

## Passkey status

The frontend integration for Supabase passkeys is implemented and explicitly opts into the
experimental client API.

Hosted-project passkeys remain disabled in `product_settings` until the Supabase Auth
Passkeys/WebAuthn dashboard configuration is set for the final production domain.

Supabase requires:

- passkeys enabled in Auth
- stable relying-party ID
- HTTPS production origin(s)

Do not set `passkeys_enabled=true` in CloudVault until that provider configuration has
been verified.

## Auth redirect status

CloudVault requests password recovery with:

`<current-origin>/reset-password`

Supabase requires that production destination to be present in Auth URL Configuration.
The connected Supabase toolset in this session does not expose hosted Auth URL mutation,
so the dashboard Site URL / Redirect URLs setting remains an account-level verification
item.

## Vercel verification status

Vercel accepted the production deployments and the application has been observed by the
user in a browser.

The connected Vercel read API is mis-scoped for the user's personal team: it returns an
empty team list and HTTP 403 when reading the same deployment scope that accepted writes.
Because of that connector issue, this validation does not fabricate an internal Vercel
READY state or console-log inspection.

Use the stable production alias rather than immutable deployment-specific URLs.

## Optional Gemini state

- configured model: `gemini-3.8-flash`
- `generative_ai_enabled=false`
- per-user external-AI consent defaults to false
- no Gemini key is required for CloudVault storage, hybrid retrieval, related files or
  grounded evidence retrieval

Generative answers should be enabled only after a server-side key is configured and the
privacy boundary is intentionally accepted.

## Release interpretation

CloudVault v2 is code-complete for its current free-first architecture.

The following are external activation/measurement gates, not hidden completed features:

- real B2 large-object account configuration and >=1.5 GiB E2E test
- Supabase hosted passkey/WebAuthn activation
- Supabase production Auth URL allowlist verification
- meaningful retrieval-quality benchmark after real files are indexed
- meaningful end-to-end load test after representative production data exists
