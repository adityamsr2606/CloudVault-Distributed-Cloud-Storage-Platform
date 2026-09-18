
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "@supabase/supabase-js";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

async function sha256(value: string) {
  const data = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const authHeader = req.headers.get("Authorization");
  if (!authHeader) {
    return new Response(JSON.stringify({ error: "Missing authorization" }), {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } },
    );

    const { data: authData, error: authError } = await supabase.auth.getUser();
    if (authError || !authData.user) throw new Error("Invalid session");

    const { file_id, expires_hours = 24, max_uses = null } = await req.json();
    const hours = Math.min(Math.max(Number(expires_hours) || 24, 1), 168);

    const { data: file, error: fileError } = await supabase
      .from("vault_files")
      .select("id")
      .eq("id", file_id)
      .is("deleted_at", null)
      .single();

    if (fileError || !file) {
      return new Response(JSON.stringify({ error: "File not found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const token = crypto.randomUUID().replaceAll("-", "") + crypto.randomUUID().replaceAll("-", "");
    const tokenHash = await sha256(token);
    const expiresAt = new Date(Date.now() + hours * 60 * 60 * 1000).toISOString();

    const { data, error } = await supabase
      .from("share_links")
      .insert({
        file_id,
        owner_id: authData.user.id,
        token_hash: tokenHash,
        expires_at: expiresAt,
        max_uses: max_uses ? Math.min(Math.max(Number(max_uses), 1), 1000) : null,
      })
      .select("id, expires_at, max_uses")
      .single();

    if (error) throw error;

    return new Response(JSON.stringify({ ...data, token }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("create-share-link failed", error);
    return new Response(JSON.stringify({ error: "Could not create share link" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
