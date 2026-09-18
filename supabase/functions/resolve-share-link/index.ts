
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "@supabase/supabase-js";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "content-type",
};

async function sha256(value: string) {
  const data = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const { token } = await req.json();
    if (!token || typeof token !== "string") {
      return new Response(JSON.stringify({ error: "Missing share token" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );
    const tokenHash = await sha256(token);

    const { data: link, error: linkError } = await admin
      .from("share_links")
      .select("id, file_id, expires_at, max_uses, use_count, revoked_at")
      .eq("token_hash", tokenHash)
      .single();

    if (
      linkError || !link ||
      link.revoked_at ||
      new Date(link.expires_at).getTime() <= Date.now() ||
      (link.max_uses !== null && link.use_count >= link.max_uses)
    ) {
      return new Response(JSON.stringify({ error: "Share link is invalid or expired" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: file, error: fileError } = await admin
      .from("vault_files")
      .select("name, storage_path, mime_type, size_bytes, deleted_at")
      .eq("id", link.file_id)
      .single();

    if (fileError || !file || file.deleted_at) {
      return new Response(JSON.stringify({ error: "Shared file is unavailable" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: signed, error: signedError } = await admin.storage
      .from("cloudvault-files")
      .createSignedUrl(file.storage_path, 600);

    if (signedError) throw signedError;

    await admin
      .from("share_links")
      .update({ use_count: link.use_count + 1 })
      .eq("id", link.id);

    return new Response(JSON.stringify({
      name: file.name,
      mime_type: file.mime_type,
      size_bytes: file.size_bytes,
      signed_url: signed.signedUrl,
      expires_in_seconds: 600,
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("resolve-share-link failed", error);
    return new Response(JSON.stringify({ error: "Could not resolve share link" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
