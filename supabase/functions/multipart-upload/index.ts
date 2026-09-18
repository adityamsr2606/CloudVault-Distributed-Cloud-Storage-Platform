import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.116.0";
import {
  AbortMultipartUploadCommand,
  CompleteMultipartUploadCommand,
  CreateMultipartUploadCommand,
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

function r2Client() {
  const accountId = Deno.env.get("R2_ACCOUNT_ID");
  const accessKeyId = Deno.env.get("R2_ACCESS_KEY_ID");
  const secretAccessKey = Deno.env.get("R2_SECRET_ACCESS_KEY");
  const bucket = Deno.env.get("R2_BUCKET");

  if (!accountId || !accessKeyId || !secretAccessKey || !bucket) {
    throw new Error("R2 is not configured on this deployment.");
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

    if (settingsError || !settings) throw settingsError ?? new Error("Missing product settings");
    if (!settings.r2_enabled) {
      return json({ error: "R2 large-file uploads are not enabled yet." }, 503);
    }

    const body = await req.json();
    const action = String(body.action ?? "");
    const { client, bucket } = r2Client();

    if (action === "initiate") {
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

      if (!initiated.UploadId) throw new Error("R2 did not return an upload id.");

      const { data: session, error: sessionError } = await supabase
        .from("multipart_uploads")
        .insert({
          owner_id: authData.user.id,
          file_id: fileId,
          folder_id: effectiveFolderId,
          provider: "r2",
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
        .select("id,file_id,part_size_bytes")
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

    const totalParts = Math.ceil(
      Number(session.size_bytes) / Number(session.part_size_bytes),
    );

    if (action === "sign_parts") {
      const numbers: number[] = Array.isArray(body.part_numbers)
        ? body.part_numbers.map((value: unknown) => Number(value))
        : [];
      if (numbers.length === 0 || numbers.length > 8) {
        return json({ error: "Request between 1 and 8 part numbers." }, 400);
      }
      if (numbers.some((part) => !Number.isInteger(part) || part < 1 || part > totalParts)) {
        return json({ error: "Invalid part number." }, 400);
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

      return json({
        session_id: session.id,
        file_id: session.file_id,
        part_size_bytes: session.part_size_bytes,
        total_parts: totalParts,
        status: session.status,
        parts,
      });
    }

    if (action === "abort") {
      if (session.status !== "completed" && session.status !== "aborted") {
        await client.send(
          new AbortMultipartUploadCommand({
            Bucket: bucket,
            Key: session.object_key,
            UploadId: session.provider_upload_id,
          }),
        );
      }

      await supabase
        .from("multipart_uploads")
        .update({ status: "aborted", updated_at: new Date().toISOString() })
        .eq("id", session.id);

      return json({ ok: true });
    }

    if (action === "complete") {
      const parts: Array<Record<string, unknown>> = Array.isArray(body.parts)
        ? body.parts
        : [];
      if (parts.length !== totalParts) {
        return json({ error: "Every uploaded part must be supplied before completion." }, 400);
      }

      const completedParts: Array<{ PartNumber: number; ETag: string }> = parts
        .map((part) => ({
          PartNumber: Number(part.part_number),
          ETag: String(part.etag ?? ""),
        }))
        .sort((a, b) => a.PartNumber - b.PartNumber);

      await client.send(
        new CompleteMultipartUploadCommand({
          Bucket: bucket,
          Key: session.object_key,
          UploadId: session.provider_upload_id,
          MultipartUpload: { Parts: completedParts },
        }),
      );

      const shouldIndex =
        Boolean(settings.ai_enabled) &&
        Number(session.size_bytes) <= Number(settings.max_indexable_text_bytes) &&
        textLike(session.file_name, session.mime_type);

      let file;

      if (session.replaces_file_id) {
        if (settings.versioning_enabled) {
          const { error: versionError } = await supabase.from("file_versions").insert({
            file_id: session.file_id,
            owner_id: authData.user.id,
            version_number: session.version_number,
            storage_path: session.object_key,
            storage_provider: "r2",
            mime_type: session.mime_type,
            size_bytes: session.size_bytes,
            sha256: null,
          });
          if (versionError) throw versionError;
        }

        const { data: updated, error: updateError } = await supabase
          .from("vault_files")
          .update({
            name: session.file_name,
            storage_path: session.object_key,
            storage_provider: "r2",
            mime_type: session.mime_type,
            size_bytes: session.size_bytes,
            sha256: null,
            current_version: session.version_number,
            status: shouldIndex ? "uploaded" : "ready",
            updated_at: new Date().toISOString(),
          })
          .eq("id", session.file_id)
          .select("*")
          .single();

        if (updateError) throw updateError;
        file = updated;
      } else {
        const { data: created, error: fileError } = await supabase
          .from("vault_files")
          .insert({
            id: session.file_id,
            owner_id: authData.user.id,
            folder_id: session.folder_id,
            name: session.file_name,
            storage_path: session.object_key,
            storage_provider: "r2",
            mime_type: session.mime_type,
            size_bytes: session.size_bytes,
            sha256: null,
            current_version: 1,
            status: shouldIndex ? "uploaded" : "ready",
          })
          .select("*")
          .single();

        if (fileError) throw fileError;
        file = created;

        if (settings.versioning_enabled) {
          const { error: versionError } = await supabase.from("file_versions").insert({
            file_id: session.file_id,
            owner_id: authData.user.id,
            version_number: 1,
            storage_path: session.object_key,
            storage_provider: "r2",
            mime_type: session.mime_type,
            size_bytes: session.size_bytes,
            sha256: null,
          });
          if (versionError) throw versionError;
        }
      }

      await supabase
        .from("multipart_uploads")
        .update({
          status: "completed",
          completed_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq("id", session.id);

      if (settings.observability_enabled) {
        console.log(
          JSON.stringify({
            event: "multipart_upload_completed",
            owner_id: authData.user.id,
            file_id: session.file_id,
            size_bytes: session.size_bytes,
            parts: totalParts,
            duration_ms: Date.now() - started,
          }),
        );
      }

      return json({ file, should_index: shouldIndex });
    }

    return json({ error: "Unsupported multipart action." }, 400);
  } catch (error) {
    console.error("multipart-upload failed", error);
    return json({ error: error instanceof Error ? error.message : "Multipart upload failed." }, 500);
  }
});
