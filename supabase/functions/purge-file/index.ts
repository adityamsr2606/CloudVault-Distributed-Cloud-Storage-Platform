import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.116.0";
import { DeleteObjectsCommand, S3Client } from "npm:@aws-sdk/client-s3@3.888.0";

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
    if (!fileId) return json({ error: "file_id is required." }, 400);

    const [{ data: file, error: fileError }, { data: versions, error: versionsError }] =
      await Promise.all([
        supabase
          .from("vault_files")
          .select("id,storage_path,storage_provider")
          .eq("id", fileId)
          .single(),
        supabase
          .from("file_versions")
          .select("storage_path,storage_provider")
          .eq("file_id", fileId),
      ]);

    if (fileError || !file) return json({ error: "File not found." }, 404);
    if (versionsError) throw versionsError;

    const entries = [
      { storage_path: file.storage_path, storage_provider: file.storage_provider },
      ...(versions ?? []),
    ];

    const supabasePaths = [
      ...new Set(
        entries
          .filter((entry) => entry.storage_provider !== "r2")
          .map((entry) => entry.storage_path),
      ),
    ];

    const r2Paths = [
      ...new Set(
        entries
          .filter((entry) => entry.storage_provider === "r2")
          .map((entry) => entry.storage_path),
      ),
    ];

    if (supabasePaths.length > 0) {
      const { error: storageError } = await supabase.storage
        .from("cloudvault-files")
        .remove(supabasePaths);
      if (storageError) throw storageError;
    }

    if (r2Paths.length > 0) {
      const { client, bucket } = r2Client();
      await client.send(
        new DeleteObjectsCommand({
          Bucket: bucket,
          Delete: {
            Objects: r2Paths.map((Key) => ({ Key })),
            Quiet: true,
          },
        }),
      );
    }

    const { error: deleteError } = await supabase
      .from("vault_files")
      .delete()
      .eq("id", fileId);

    if (deleteError) throw deleteError;

    return json({ ok: true });
  } catch (error) {
    console.error("purge-file failed", error);
    return json({ error: "Permanent delete failed." }, 500);
  }
});
