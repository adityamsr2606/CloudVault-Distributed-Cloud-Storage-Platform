
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
    const { data: consumed, error: consumeError } = await admin.rpc("consume_share_link", {
      p_token_hash: tokenHash,
    });

    if (consumeError) throw consumeError;
    const file = consumed?.[0];

    if (!file) {
      return new Response(JSON.stringify({ error: "Share link is invalid or expired" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: signed, error: signedError } = await admin.storage
      .from("cloudvault-files")
      .createSignedUrl(file.storage_path, 600);

    if (signedError) throw signedError;

    return new Response(JSON.stringify({
      name: file.file_name,
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
