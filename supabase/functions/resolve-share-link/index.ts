import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.116.0";
import { GetObjectCommand, S3Client } from "npm:@aws-sdk/client-s3@3.888.0";
import { getSignedUrl } from "npm:@aws-sdk/s3-request-presigner@3.888.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

async function sha256(value: string) {
  const data = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
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

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const { token } = await req.json();
    if (!token || typeof token !== "string") {
      return json({ error: "Missing share token" }, 400);
    }

    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const { data: settings, error: settingsError } = await admin
      .from("product_settings")
      .select("sharing_enabled,share_signed_url_seconds")
      .eq("id", "default")
      .single();

    if (settingsError || !settings) throw settingsError ?? new Error("Missing product settings");
    if (!settings.sharing_enabled) {
      return json({ error: "Shared access is unavailable" }, 404);
    }

    const tokenHash = await sha256(token);
    const { data: consumed, error: consumeError } = await admin.rpc("consume_share_link", {
      p_token_hash: tokenHash,
    });
    if (consumeError) throw consumeError;

    const file = consumed?.[0];
    if (!file) {
      return json({ error: "Share link is invalid or expired" }, 404);
    }

    const seconds = Number(settings.share_signed_url_seconds);
    let signedUrl: string;

    if (file.storage_provider !== "supabase") {
      const { client, bucket } = objectStore(String(file.storage_provider));
      signedUrl = await getSignedUrl(
        client,
        new GetObjectCommand({ Bucket: bucket, Key: file.storage_path }),
        { expiresIn: seconds },
      );
    } else {
      const { data: signed, error: signedError } = await admin.storage
        .from("cloudvault-files")
        .createSignedUrl(file.storage_path, seconds);
      if (signedError) throw signedError;
      signedUrl = signed.signedUrl;
    }

    return json({
      name: file.file_name,
      mime_type: file.mime_type,
      size_bytes: file.size_bytes,
      signed_url: signedUrl,
      expires_in_seconds: seconds,
    });
  } catch (error) {
    console.error("resolve-share-link failed", error);
    return json({ error: "Could not resolve share link" }, 500);
  }
});
