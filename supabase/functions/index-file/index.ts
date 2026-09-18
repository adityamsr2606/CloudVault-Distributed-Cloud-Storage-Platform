
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "@supabase/supabase-js";

type IndexRequest = {
  file_id: string;
  text: string;
};

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function chunkText(text: string, size = 1400, overlap = 220): string[] {
  const clean = text.replace(/\s+/g, " ").trim();
  if (!clean) return [];
  if (clean.length <= size) return [clean];

  const chunks: string[] = [];
  let start = 0;

  while (start < clean.length) {
    let end = Math.min(start + size, clean.length);
    if (end < clean.length) {
      const boundary = clean.lastIndexOf(" ", end);
      if (boundary > start + Math.floor(size / 2)) end = boundary;
    }

    const chunk = clean.slice(start, end).trim();
    if (chunk) chunks.push(chunk);
    if (end >= clean.length) break;
    start = Math.max(end - overlap, start + 1);
  }

  return chunks.slice(0, 120);
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Missing authorization" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } },
    );

    const { data: userData, error: userError } = await supabase.auth.getUser();
    if (userError || !userData.user) {
      return new Response(JSON.stringify({ error: "Invalid session" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = (await req.json()) as IndexRequest;
    if (!body.file_id || typeof body.text !== "string") {
      return new Response(JSON.stringify({ error: "file_id and text are required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: file, error: fileError } = await supabase
      .from("vault_files")
      .select("id, owner_id")
      .eq("id", body.file_id)
      .single();

    if (fileError || !file) {
      return new Response(JSON.stringify({ error: "File not found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const chunks = chunkText(body.text);
    if (chunks.length === 0) {
      await supabase.from("vault_files").update({ status: "ready" }).eq("id", body.file_id);
      return new Response(JSON.stringify({ indexed_chunks: 0 }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    await supabase.from("vault_files").update({ status: "indexing" }).eq("id", body.file_id);
    await supabase.from("file_chunks").delete().eq("file_id", body.file_id);

    const model = new Supabase.ai.Session("gte-small");
    const rows = [];

    for (let index = 0; index < chunks.length; index += 1) {
      const embedding = await model.run(chunks[index], {
        mean_pool: true,
        normalize: true,
      });

      rows.push({
        file_id: body.file_id,
        owner_id: userData.user.id,
        chunk_index: index,
        content: chunks[index],
        embedding,
        embedding_model: "gte-small",
      });
    }

    const { error: insertError } = await supabase.from("file_chunks").insert(rows);
    if (insertError) throw insertError;

    const { error: statusError } = await supabase
      .from("vault_files")
      .update({ status: "ready", updated_at: new Date().toISOString() })
      .eq("id", body.file_id);

    if (statusError) throw statusError;

    return new Response(JSON.stringify({ indexed_chunks: rows.length }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("index-file failed", error);
    return new Response(JSON.stringify({ error: "Indexing failed" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
