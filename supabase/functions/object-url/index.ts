import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.116.0";
import { GetObjectCommand, S3Client } from "npm:@aws-sdk/client-s3@3.888.0";
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

function objectStore(provider: string) {
  if (provider === "b2") {
    const endpoint = Deno.env.get("B2_S3_ENDPOINT");
    const region = Deno.env.get("B2_REGION");
    const accessKeyId = Deno.env.get("B2_APPLICATION_KEY_ID");
    const secretAccessKey = Deno.env.get("B2_APPLICATION_KEY");
    const bucket = Deno.env.get("B2_BUCKET");

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
    const accountId = Deno.env.get("R2_ACCOUNT_ID");
    const accessKeyId = Deno.env.get("R2_ACCESS_KEY_ID");
    const secretAccessKey = Deno.env.get("R2_SECRET_ACCESS_KEY");
    const bucket = Deno.env.get("R2_BUCKET");

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
    const fileId = body.file_id ? String(body.file_id) : null;
    const requestedPath = body.storage_path ? String(body.storage_path) : null;

    let file: {
      id?: string;
      storage_path: string;
      storage_provider: "supabase" | "r2" | "b2";
    } | null = null;

    if (fileId) {
      const { data, error } = await supabase
        .from("vault_files")
        .select("id,storage_path,storage_provider")
        .eq("id", fileId)
        .is("deleted_at", null)
        .single();

      if (error || !data) return json({ error: "File not found." }, 404);
      file = data;
    } else if (requestedPath) {
      const { data: current } = await supabase
        .from("vault_files")
        .select("id,storage_path,storage_provider")
        .eq("storage_path", requestedPath)
        .is("deleted_at", null)
        .maybeSingle();

      if (current) {
        file = current;
      } else {
        const { data: version, error: versionError } = await supabase
          .from("file_versions")
          .select("file_id,storage_path,storage_provider")
          .eq("storage_path", requestedPath)
          .maybeSingle();

        if (versionError || !version) return json({ error: "Version not found." }, 404);

        const { data: parent, error: parentError } = await supabase
          .from("vault_files")
          .select("id")
          .eq("id", version.file_id)
          .is("deleted_at", null)
          .single();

        if (parentError || !parent) return json({ error: "File not found." }, 404);

        file = {
          id: version.file_id,
          storage_path: version.storage_path,
          storage_provider: version.storage_provider,
        };
      }
    } else {
      return json({ error: "file_id or storage_path is required." }, 400);
    }

    const { data: settings, error: settingsError } = await supabase
      .from("product_settings")
      .select("share_signed_url_seconds")
      .eq("id", "default")
      .single();

    if (settingsError || !settings) throw settingsError ?? new Error("Missing product settings");
    const seconds = Number(settings.share_signed_url_seconds);

    if (file.storage_provider !== "supabase") {
      const { client, bucket } = objectStore(file.storage_provider);
      const signedUrl = await getSignedUrl(
        client,
        new GetObjectCommand({ Bucket: bucket, Key: file.storage_path }),
        { expiresIn: seconds },
      );

      return json({ signed_url: signedUrl, expires_in_seconds: seconds });
    }

    const { data: signed, error: signedError } = await supabase.storage
      .from("cloudvault-files")
      .createSignedUrl(file.storage_path, seconds);

    if (signedError) throw signedError;
    return json({ signed_url: signed.signedUrl, expires_in_seconds: seconds });
  } catch (error) {
    console.error("object-url failed", error);
    return json({ error: "Could not create object URL." }, 500);
  }
});
