# Cloudflare R2 large-file setup

CloudVault v2 supports a 1.5 GiB default product upload policy through R2 multipart
uploads. The code is safe to deploy before R2 is configured because the product setting
\`r2_enabled\` defaults to \`false\`.

## Required Edge Function secrets

Set these only in the trusted Supabase Edge Function environment:

- \`R2_ACCOUNT_ID\`
- \`R2_ACCESS_KEY_ID\`
- \`R2_SECRET_ACCESS_KEY\`
- \`R2_BUCKET\`

Never expose those values through Vite variables or browser code.

The R2 credentials should be scoped to the CloudVault bucket and only the object
permissions the application actually needs.

## Bucket CORS

Browser multipart uploads use presigned S3 UploadPart URLs. The bucket must permit the
actual CloudVault web origins and must expose \`ETag\`, because S3 multipart completion
requires each uploaded part's ETag.

Example dashboard CORS policy:

\`\`\`json
[
  {
    "AllowedOrigins": [
      "https://your-cloudvault-domain.example",
      "http://localhost:5173"
    ],
    "AllowedMethods": ["GET", "PUT", "HEAD"],
    "AllowedHeaders": ["Content-Type", "x-amz-*"],
    "ExposeHeaders": ["ETag", "Content-Length"],
    "MaxAgeSeconds": 3600
  }
]
\`\`\`

Replace the production origin with the exact deployed origin. Keep the bucket private.

## Enable large uploads

After the bucket, credentials and CORS policy are verified:

\`\`\`sql
update public.product_settings
set r2_enabled = true,
    large_upload_provider = 'r2',
    max_upload_bytes = 1610612736,
    updated_at = now()
where id = 'default';
\`\`\`

The default policy values are:

- max file size: 1.5 GiB
- direct Supabase threshold: 50 MB
- multipart part size: 16 MiB
- parallel parts: 3
- maximum retry attempts per part: 4

Changing multipart size or parallelism is a product-settings change, not a frontend
source edit.

## Resume behavior

CloudVault stores the multipart session id in browser storage using the selected file's
name, size and last-modified timestamp. R2 remains the source of truth for uploaded
parts. If the tab is refreshed, re-selecting the same local file lets the client query
R2's ListParts state and upload only missing parts.

## Verification checklist

Before setting \`r2_enabled=true\`:

1. Upload a file larger than the Supabase direct threshold.
2. Pause while parts are uploading.
3. Resume and verify only missing/aborted parts continue.
4. Refresh, re-select the same file and verify recovery.
5. Download the completed object through CloudVault's signed URL function.
6. Create and consume a public share link.
7. Upload a replacement version.
8. Download an older version.
9. Permanently purge the file and verify every version object is gone.
