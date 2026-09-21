import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.116.0";
import {
  AbortMultipartUploadCommand,
  CompleteMultipartUploadCommand,
  CreateMultipartUploadCommand,
  HeadObjectCommand,
  ListPartsCommand,
  S3Client,
  UploadPartCommand,
} from "npm:@aws-sdk/client-s3@3.888.0";
import { getSignedUrl } from "npm:@aws-sdk/s3-request-presigner@3.888.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function safeName(value: string) {
  return value.replaceAll("/", "_").replaceAll("\\", "_").slice(0, 180) || "file";
}

function objectStore(provider: string) {
  if (provider === "b2") {
    const endpoint = Deno.env.get("B2_S3_ENDPOINT")?.trim();
    const region = Deno.env.get("B2_REGION")?.trim();
    const accessKeyId = Deno.env.get("B2_APPLICATION_KEY_ID")?.trim();
    const secretAccessKey = Deno.env.get("B2_APPLICATION_KEY")?.trim();
    const bucket = Deno.env.get("B2_BUCKET")?.trim();

    if (!endpoint || !region || !accessKeyId || !secretAccessKey || !bucket) {
      throw new Error("Backblaze B2 is not configured on this deployment.");
    }

    return {
      bucket,
      client: new S3Client({
        region,
        endpoint,
        forcePathStyle: true,
        credentials: { accessKeyId, secretAccessKey },
      }),
    };
  }

  if (provider === "r2") {
    const accountId = Deno.env.get("R2_ACCOUNT_ID")?.trim();
    const accessKeyId = Deno.env.get("R2_ACCESS_KEY_ID")?.trim();
    const secretAccessKey = Deno.env.get("R2_SECRET_ACCESS_KEY")?.trim();
    const bucket = Deno.env.get("R2_BUCKET")?.trim();

    if (!accountId || !accessKeyId || !secretAccessKey || !bucket) {
      throw new Error("Cloudflare R2 is not configured on this deployment.");
    }

    return {
      bucket,
      client: new S3Client({
        region: "auto",
        endpoint: "https://" + accountId + ".r2.cloudflarestorage.com",
        credentials: { accessKeyId, secretAccessKey },
      }),
    };
  }

  throw new Error("Unsupported large-object provider.");
}

function textLike(name: string, mimeType: string) {
  const lower = name.toLowerCase();
  const type = mimeType.toLowerCase();
  return (
    type.startsWith("text/") ||
    type.includes("json") ||
    type.includes("csv") ||
    lower.endsWith(".md") ||
    lower.endsWith(".log")
  );
}

function shouldIndexSession(
  settings: Record<string, unknown>,
  session: Record<string, unknown>,
) {
  return (
    Boolean(settings.ai_enabled) &&
    Number(session.size_bytes) <= Number(settings.max_indexable_text_bytes) &&
    textLike(String(session.file_name ?? ""), String(session.mime_type ?? ""))
  );
}

async function objectExists(
  client: S3Client,
  bucket: string,
  key: string,
) {
  try {
    await client.send(new HeadObjectCommand({ Bucket: bucket, Key: key }));
    return true;
  } catch {
    return false;
  }
}

function normalizeParts(
  rawParts: unknown,
  totalParts: number,
) {
  if (!Array.isArray(rawParts) || rawParts.length !== totalParts) {
    throw new Error("Every uploaded part must be supplied before completion.");
  }

  const parts = rawParts
    .map((value) => {
      const part = value as Record<string, unknown>;
      return {
        PartNumber: Number(part.part_number),
        ETag: String(part.etag ?? "").trim(),
      };
    })
    .sort((a, b) => a.PartNumber - b.PartNumber);

  const valid =
    parts.length === totalParts &&
    parts.every(
      (part, index) =>
        Number.isInteger(part.PartNumber) &&
        part.PartNumber === index + 1 &&
        part.ETag.length > 0,
    );

  if (!valid) {
    throw new Error("Multipart completion data is incomplete or invalid.");
  }

  return parts;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const started = Date.now();

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return json({ error: "Missing authorization" }, 401);

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } },
    );

    const { data: authData, error: authError } = await supabase.auth.getUser();
    if (authError || !authData.user) return json({ error: "Invalid session" }, 401);

    const { data: settings, error: settingsError } = await supabase
      .from("product_settings")
      .select("*")
      .eq("id", "default")
      .single();

    if (settingsError || !settings) {
      throw settingsError ?? new Error("Missing product settings");
    }

    const body = await req.json();
    const action = String(body.action ?? "");

    if (action === "initiate") {
      const provider = String(settings.large_upload_provider ?? "");
      const providerEnabled =
        provider === "b2"
          ? Boolean(settings.b2_enabled)
          : provider === "r2"
            ? Boolean(settings.r2_enabled)
            : false;

      if (!providerEnabled) {
        return json({ error: "The configured large-file provider is not enabled yet." }, 503);
      }

      const { client, bucket } = objectStore(provider);
      const fileName = safeName(String(body.file_name ?? ""));
      const mimeType = String(body.mime_type ?? "application/octet-stream");
      const sizeBytes = Number(body.size_bytes ?? 0);
      const folderId = body.folder_id ? String(body.folder_id) : null;

      if (!fileName || !Number.isFinite(sizeBytes) || sizeBytes <= 0) {
        return json({ error: "Invalid file metadata." }, 400);
      }
      if (sizeBytes > Number(settings.max_upload_bytes)) {
        return json({ error: "File exceeds this deployment's upload policy." }, 413);
      }

      const replaceFileId = body.replace_file_id ? String(body.replace_file_id) : null;
      let fileId = crypto.randomUUID();
      let versionNumber = 1;
      let effectiveFolderId = folderId;

      if (replaceFileId) {
        const { data: current, error: currentError } = await supabase
          .from("vault_files")
          .select("id,current_version,folder_id")
          .eq("id", replaceFileId)
          .is("deleted_at", null)
          .single();

        if (currentError || !current) {
          return json({ error: "File to replace was not found." }, 404);
        }

        fileId = current.id;
        versionNumber = Number(current.current_version) + 1;
        effectiveFolderId = current.folder_id;
      }

      const partSize = Number(settings.multipart_part_size_bytes);
      const totalParts = Math.ceil(sizeBytes / partSize);

      if (!Number.isFinite(partSize) || partSize <= 0 || totalParts <= 0) {
        return json({ error: "Invalid multipart configuration." }, 500);
      }
      if (totalParts > 10_000) {
        return json({ error: "Configured part size would exceed the provider part-count limit." }, 400);
      }

      const objectKey =
        authData.user.id + "/" + fileId + "/v" + versionNumber + "/" + fileName;

      const initiated = await client.send(
        new CreateMultipartUploadCommand({
          Bucket: bucket,
          Key: objectKey,
          ContentType: mimeType,
          Metadata: {
            owner: authData.user.id,
            fileid: fileId,
          },
        }),
      );

      if (!initiated.UploadId) {
        throw new Error("The object store did not return an upload id.");
      }

      const { data: session, error: sessionError } = await supabase
        .from("multipart_uploads")
        .insert({
          owner_id: authData.user.id,
          file_id: fileId,
          folder_id: effectiveFolderId,
          provider,
          provider_upload_id: initiated.UploadId,
          object_key: objectKey,
          file_name: fileName,
          mime_type: mimeType,
          size_bytes: sizeBytes,
          part_size_bytes: partSize,
          version_number: versionNumber,
          replaces_file_id: replaceFileId,
          status: "initiated",
        })
        .select("id,file_id,part_size_bytes,provider")
        .single();

      if (sessionError) {
        await client.send(
          new AbortMultipartUploadCommand({
            Bucket: bucket,
            Key: objectKey,
            UploadId: initiated.UploadId,
          }),
        );
        throw sessionError;
      }

      return json({
        session_id: session.id,
        file_id: session.file_id,
        provider: session.provider,
        part_size_bytes: session.part_size_bytes,
        total_parts: totalParts,
      });
    }

    const sessionId = String(body.session_id ?? "");
    if (!sessionId) return json({ error: "session_id is required." }, 400);

    const { data: session, error: sessionError } = await supabase
      .from("multipart_uploads")
      .select("*")
      .eq("id", sessionId)
      .single();

    if (sessionError || !session || session.owner_id !== authData.user.id) {
      return json({ error: "Upload session not found." }, 404);
    }

    const sessionProvider = String(session.provider ?? "");
    const totalParts = Math.ceil(
      Number(session.size_bytes) / Number(session.part_size_bytes),
    );

    const completedPayload = async () => {
      const { data: file, error: fileError } = await supabase
        .from("vault_files")
        .select("*")
        .eq("id", session.file_id)
        .single();

      if (fileError || !file) {
        throw fileError ?? new Error("Completed upload metadata is missing.");
      }

      return {
        session_id: session.id,
        file_id: session.file_id,
        provider: sessionProvider,
        part_size_bytes: session.part_size_bytes,
        total_parts: totalParts,
        status: "completed",
        parts: [],
        file,
      };
    };

    if (session.status === "completed") {
      if (action === "abort") {
        return json({ ok: true, status: "completed" });
      }
      if (action === "status" || action === "complete") {
        return json(await completedPayload());
      }
      return json({ error: "Upload session is already completed." }, 409);
    }

    if (session.status === "aborted" || session.status === "failed") {
      if (action === "status") {
        return json({
          session_id: session.id,
          file_id: session.file_id,
          provider: sessionProvider,
          part_size_bytes: session.part_size_bytes,
          total_parts: totalParts,
          status: session.status,
          parts: [],
        });
      }
      if (action === "abort") {
        return json({ ok: true, status: session.status });
      }
      return json({ error: "Upload session is no longer active." }, 409);
    }

    const { client, bucket } = objectStore(sessionProvider);

    const finalizeMetadata = async () => {
      const shouldIndex = shouldIndexSession(
        settings as Record<string, unknown>,
        session as Record<string, unknown>,
      );

      const { data, error } = await supabase.rpc("finalize_multipart_upload", {
        p_session_id: session.id,
        p_should_index: shouldIndex,
      });

      if (error) throw error;

      const file = Array.isArray(data) ? data[0] : data;
      if (!file) throw new Error("Multipart metadata finalization returned no file.");

      return { file, shouldIndex };
    };

    if (action === "sign_parts") {
      const numbers: number[] = Array.isArray(body.part_numbers)
        ? body.part_numbers.map((value: unknown) => Number(value))
        : [];

      if (numbers.length === 0 || numbers.length > 8) {
        return json({ error: "Request between 1 and 8 part numbers." }, 400);
      }

      const uniqueNumbers = [...new Set(numbers)];
      if (
        uniqueNumbers.length !== numbers.length ||
        numbers.some(
          (part) => !Number.isInteger(part) || part < 1 || part > totalParts,
        )
      ) {
        return json({ error: "Invalid or duplicate part number." }, 400);
      }

      const urls = await Promise.all(
        numbers.map(async (partNumber) => ({
          part_number: partNumber,
          url: await getSignedUrl(
            client,
            new UploadPartCommand({
              Bucket: bucket,
              Key: session.object_key,
              UploadId: session.provider_upload_id,
              PartNumber: partNumber,
            }),
            { expiresIn: 1800 },
          ),
        })),
      );

      if (session.status === "initiated") {
        await supabase
          .from("multipart_uploads")
          .update({ status: "uploading", updated_at: new Date().toISOString() })
          .eq("id", session.id);
      }

      return json({ urls });
    }

    if (action === "status") {
      const parts: Array<{ part_number: number; etag: string; size: number }> = [];
      let marker: string | undefined;

      try {
        do {
          const listed = await client.send(
            new ListPartsCommand({
              Bucket: bucket,
              Key: session.object_key,
              UploadId: session.provider_upload_id,
              PartNumberMarker: marker,
            }),
          );

          for (const part of listed.Parts ?? []) {
            if (part.PartNumber && part.ETag) {
              parts.push({
                part_number: part.PartNumber,
                etag: part.ETag,
                size: Number(part.Size ?? 0),
              });
            }
          }

          marker = listed.IsTruncated
            ? String(listed.NextPartNumberMarker ?? "")
            : undefined;
        } while (marker);
      } catch (error) {
        if (await objectExists(client, bucket, session.object_key)) {
          const finalized = await finalizeMetadata();
          return json({
            session_id: session.id,
            file_id: session.file_id,
            provider: sessionProvider,
            part_size_bytes: session.part_size_bytes,
            total_parts: totalParts,
            status: "completed",
            parts: [],
            file: finalized.file,
          });
        }
        throw error;
      }

      return json({
        session_id: session.id,
        file_id: session.file_id,
        provider: sessionProvider,
        part_size_bytes: session.part_size_bytes,
        total_parts: totalParts,
        status: session.status,
        parts,
      });
    }

    if (action === "abort") {
      try {
        await client.send(
          new AbortMultipartUploadCommand({
            Bucket: bucket,
            Key: session.object_key,
            UploadId: session.provider_upload_id,
          }),
        );
      } catch (error) {
        if (await objectExists(client, bucket, session.object_key)) {
          return json(
            { error: "Upload already completed at the object provider and cannot be aborted." },
            409,
          );
        }
        throw error;
      }

      await supabase
        .from("multipart_uploads")
        .update({ status: "aborted", updated_at: new Date().toISOString() })
        .eq("id", session.id);

      return json({ ok: true, status: "aborted" });
    }

    if (action === "complete") {
      let completedParts;
      try {
        completedParts = normalizeParts(body.parts, totalParts);
      } catch (error) {
        return json(
          { error: error instanceof Error ? error.message : "Invalid multipart data." },
          400,
        );
      }

      try {
        await client.send(
          new CompleteMultipartUploadCommand({
            Bucket: bucket,
            Key: session.object_key,
            UploadId: session.provider_upload_id,
            MultipartUpload: { Parts: completedParts },
          }),
        );
      } catch (error) {
        if (!(await objectExists(client, bucket, session.object_key))) {
          throw error;
        }
      }

      const finalized = await finalizeMetadata();

      if (settings.observability_enabled) {
        console.log(
          JSON.stringify({
            event: "multipart_upload_completed",
            owner_id: authData.user.id,
            file_id: session.file_id,
            size_bytes: session.size_bytes,
            parts: totalParts,
            duration_ms: Date.now() - started,
            provider: sessionProvider,
          }),
        );
      }

      return json({
        file: finalized.file,
        should_index: finalized.shouldIndex,
        recovered: session.status !== "completed",
      });
    }

    return json({ error: "Unsupported multipart action." }, 400);
  } catch (error) {
    console.error("multipart-upload failed", error);
    return json({
      error: error instanceof Error ? error.message : "Multipart upload failed.",
    }, 500);
  }
});
