import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.116.0";
import {
  CopyObjectCommand,
  GetObjectCommand,
  S3Client,
} from "npm:@aws-sdk/client-s3@3.888.0";

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

function encodeCopySource(bucket: string, key: string) {
  return (
    bucket +
    "/" +
    key
      .split("/")
      .map((segment) => encodeURIComponent(segment))
      .join("/")
  );
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

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

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

    const body = await req.json();
    const fileId = String(body.file_id ?? "");
    const versionId = String(body.version_id ?? "");
    if (!fileId || !versionId) {
      return json({ error: "file_id and version_id are required." }, 400);
    }

    const [
      { data: current, error: currentError },
      { data: version, error: versionError },
      { data: settings, error: settingsError },
    ] = await Promise.all([
      supabase
        .from("vault_files")
        .select("*")
        .eq("id", fileId)
        .is("deleted_at", null)
        .single(),
      supabase
        .from("file_versions")
        .select("*")
        .eq("id", versionId)
        .eq("file_id", fileId)
        .single(),
      supabase.from("product_settings").select("*").eq("id", "default").single(),
    ]);

    if (currentError || !current) return json({ error: "File not found." }, 404);
    if (versionError || !version) return json({ error: "Version not found." }, 404);
    if (settingsError || !settings) throw settingsError ?? new Error("Missing product settings");

    const nextVersion = Number(current.current_version) + 1;
    const nextPath =
      authData.user.id +
      "/" +
      current.id +
      "/v" +
      nextVersion +
      "/" +
      safeName(current.name);

    if (version.storage_provider === "r2") {
      const { client, bucket } = r2Client();
      await client.send(
        new CopyObjectCommand({
          Bucket: bucket,
          Key: nextPath,
          CopySource: encodeCopySource(bucket, version.storage_path),
          ContentType: version.mime_type,
          MetadataDirective: "COPY",
        }),
      );
    } else {
      const { error: copyError } = await supabase.storage
        .from("cloudvault-files")
        .copy(version.storage_path, nextPath);
      if (copyError) throw copyError;
    }

    const shouldIndex =
      Boolean(settings.ai_enabled) &&
      Number(version.size_bytes) <= Number(settings.max_indexable_text_bytes) &&
      textLike(current.name, version.mime_type);

    const { error: newVersionError } = await supabase.from("file_versions").insert({
      file_id: current.id,
      owner_id: authData.user.id,
      version_number: nextVersion,
      storage_path: nextPath,
      storage_provider: version.storage_provider,
      mime_type: version.mime_type,
      size_bytes: version.size_bytes,
      sha256: version.sha256,
    });
    if (newVersionError) throw newVersionError;

    const { data: updated, error: updateError } = await supabase
      .from("vault_files")
      .update({
        storage_path: nextPath,
        storage_provider: version.storage_provider,
        mime_type: version.mime_type,
        size_bytes: version.size_bytes,
        sha256: version.sha256,
        current_version: nextVersion,
        status: shouldIndex ? "uploaded" : "ready",
        updated_at: new Date().toISOString(),
      })
      .eq("id", current.id)
      .select("*")
      .single();

    if (updateError) throw updateError;

    if (shouldIndex) {
      let text = "";

      if (version.storage_provider === "r2") {
        const { client, bucket } = r2Client();
        const object = await client.send(
          new GetObjectCommand({ Bucket: bucket, Key: nextPath }),
        );
        text = object.Body ? await object.Body.transformToString() : "";
      } else {
        const { data: blob, error: downloadError } = await supabase.storage
          .from("cloudvault-files")
          .download(nextPath);
        if (downloadError) throw downloadError;
        text = await blob.text();
      }

      const response = await fetch(
        Deno.env.get("SUPABASE_URL")! + "/functions/v1/index-file",
        {
          method: "POST",
          headers: {
            Authorization: authHeader,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            file_id: current.id,
            text: text.slice(0, Number(settings.max_indexable_text_chars)),
          }),
        },
      );

      if (!response.ok) {
        await supabase
          .from("vault_files")
          .update({ status: "failed" })
          .eq("id", current.id);
      }
    }

    return json({ file: updated });
  } catch (error) {
    console.error("restore-version failed", error);
    return json({ error: "Could not restore file version." }, 500);
  }
});
