# CloudVault v2

CloudVault v2 focuses on security, retrieval quality, large-object reliability and
measurable production behavior.

## Implemented architecture

### Large uploads

- 1.5 GiB configurable product ceiling
- provider abstraction between Supabase and R2
- direct small-file uploads
- B2 S3 multipart uploads for large files
- presigned part URLs
- pause/resume/cancel
- browser session recovery
- ListParts reconciliation
- configurable 5 MiB+ part sizing
- configurable upload parallelism
- retry/backoff per failed part
- provider-recorded resume sessions across provider-default changes
- exact multipart part validation
- provider HEAD-based completion recovery after interrupted responses
- atomic multipart metadata finalization in PostgreSQL
- idempotent completed-session recovery
- version replacements through the same multipart engine
- provider-aware download, sharing and purge

The R2 path remains disabled until credentials and CORS are configured.

### Security

- TOTP MFA enrollment and factor management
- AAL2 gate for users with an enrolled MFA factor
- experimental Supabase passkey support behind a deployment flag
- passkey registration, sign-in, listing and deletion
- password login remains the fallback

Passkeys also require the Supabase project WebAuthn settings for the final production
domain.

### Retrieval

- gte-small vector embeddings
- PostgreSQL full-text search
- configurable hybrid semantic/lexical weighting
- owner filtering inside the retrieval RPC
- related-file retrieval
- grounded Q&A evidence retrieval
- no answer generation when evidence/provider/consent is unavailable

### External generative AI

Gemini is optional. Three gates must all pass before private evidence leaves CloudVault:

1. deployment setting \`generative_ai_enabled=true\`
2. a server-side \`GEMINI_API_KEY\`
3. the signed-in user's \`allow_external_ai=true\` preference

This intentionally keeps the default product retrieval-only.

### Measurement and observability

- structured Edge Function events
- query duration/result-count metadata in \`ai_query_events\`
- no query text stored in the observability table
- retrieval evaluation script for Precision@K, Recall@K, MRR and nDCG
- Locust workload for search and metadata APIs

No performance or retrieval-quality number is a product claim until one of these
measurement paths produces it.
