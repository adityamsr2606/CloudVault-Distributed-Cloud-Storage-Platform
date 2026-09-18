# Backblaze B2 large-file setup

CloudVault uses the Backblaze B2 **S3-Compatible API** for large objects. The application
keeps Supabase for Auth, PostgreSQL, RLS, Realtime, vectors and small direct uploads.

The large-file code is safe to deploy before credentials exist because
`product_settings.b2_enabled` defaults to `false`.

## Why B2 fits CloudVault

Backblaze's S3-Compatible API supports the operations CloudVault uses:

- Create Multipart Upload
- Upload Part
- List Parts
- Complete Multipart Upload
- Abort Multipart Upload
- Get Object
- Copy Object
- Delete Objects
- bucket CORS

Backblaze currently includes the first 10 GB of B2 storage free. Provider pricing and
quotas can change, so CloudVault treats this as a free-tier integration rather than a
guaranteed permanently-free resource.

Official references:

- https://www.backblaze.com/docs/cloud-storage-s3-compatible-api
- https://www.backblaze.com/docs/en/cloud-storage-call-the-s3-compatible-api
- https://www.backblaze.com/docs/cloud-storage-s3-compatible-app-keys
- https://www.backblaze.com/docs/cloud-storage-enable-cors-with-the-s3-compatible-api

## 1. Create a private bucket

In the Backblaze B2 console:

1. Enable B2 Cloud Storage on the account.
2. Create a **private** bucket, for example `cloudvault-files`.
3. Copy the bucket's S3 endpoint. It has this shape:

   `https://s3.<region>.backblazeb2.com`

4. Copy the region portion as well, for example `us-west-004`.

Do not make the bucket public. CloudVault serves objects through short-lived signed URLs.

## 2. Create a bucket-scoped application key

Do not use the master application key.

Create an application key restricted to the CloudVault bucket with the capabilities
required by the application:

- `listAllBucketNames` for S3 SDK compatibility with a bucket-restricted key
- `readFiles`
- `writeFiles`
- `deleteFiles`

Backblaze terminology maps to S3 terminology like this:

- **Application Key ID** -> Access Key ID
- **Application Key** -> Secret Access Key

Copy the generated Application Key once and store it only in a secret manager / Supabase
Edge Function secrets. Never put it in Vite variables, React source, Git, screenshots, or
chat messages.

## 3. Configure CORS

Browser multipart uploads use presigned S3 UploadPart URLs. The B2 bucket must allow the
CloudVault web origin and must expose `ETag`.

Use the exact stable production origin, not an immutable preview/deployment URL.

Example S3 CORS configuration:

```json
{
  "CORSRules": [
    {
      "AllowedOrigins": [
        "https://cloudvault-distributed-cloud-storag-srivastavaadityamohan0-6847.vercel.app",
        "http://localhost:5173"
      ],
      "AllowedMethods": ["GET", "PUT", "HEAD"],
      "AllowedHeaders": ["*"],
      "ExposeHeaders": ["ETag", "Content-Length"],
      "MaxAgeSeconds": 3600
    }
  ]
}
```

If configuring with an S3-compatible CLI, point it at the exact B2 endpoint for the
account.

## 4. Edge Function secrets

Set these values in the trusted Supabase Edge Function environment:

```text
B2_S3_ENDPOINT=https://s3.<region>.backblazeb2.com
B2_REGION=<region>
B2_APPLICATION_KEY_ID=<application-key-id>
B2_APPLICATION_KEY=<application-key>
B2_BUCKET=cloudvault-files
```

Only `B2_S3_ENDPOINT`, `B2_REGION`, and the bucket name are non-secret metadata. Treat
both key values as secrets.

## 5. Enable B2 in CloudVault

Only after the credentials and CORS policy are verified:

```sql
update public.product_settings
set large_upload_provider = 'b2',
    b2_enabled = true,
    max_upload_bytes = 1610612736,
    updated_at = now()
where id = 'default';
```

Default product policy:

- product upload ceiling: 1.5 GiB
- Supabase direct threshold: 50 MB
- multipart part size: 16 MiB
- parallel parts: 3
- retry attempts per failed part: 4

Storage capacity and AI extraction are independent. A 1.5 GiB object can be stored without
attempting to embed its full body.

## 6. Resume behavior

The browser stores only the CloudVault multipart session id. B2 remains the source of
truth for uploaded parts.

After a tab refresh, selecting the same local file lets CloudVault:

1. recover the session id
2. call ListParts through the authenticated Edge Function
3. mark existing parts complete
4. upload only missing parts
5. complete the multipart object

## 7. Required end-to-end verification

Do not call 1.5 GiB uploads production-verified until all of these pass:

1. Upload a file larger than 50 MB.
2. Pause while parts are uploading.
3. Resume without restarting completed parts.
4. Refresh the page, select the same file and recover the multipart session.
5. Complete and download the object.
6. Create and consume an expiring share link.
7. Upload a replacement version.
8. Download an older B2-backed version.
9. Restore an older version as a new current version.
10. Move the file/folder to Trash and restore it.
11. Permanently purge the file/folder and verify all B2 versions are gone.
12. Complete an actual file upload of at least 1.5 GB / the configured 1.5 GiB ceiling.


## Completion recovery

Multipart completion is designed to recover from the boundary between object storage and
PostgreSQL.

CloudVault now:

- records the provider on every multipart session
- resumes a session against that recorded provider even if the product default changes later
- validates an exact 1..N part set before completion
- uses a provider HEAD check when ListParts or completion reports that the multipart upload no longer exists
- atomically finalizes the file, immutable version, and multipart-session status in PostgreSQL
- treats an already-finalized session as idempotently complete
- keeps browser resume keys scoped by folder/replacement context to avoid collisions between identical local files

This means a network interruption after B2 finishes the object but before the browser sees
the response can be repaired on the next status/completion attempt instead of creating a
second upload or leaving inconsistent metadata.
