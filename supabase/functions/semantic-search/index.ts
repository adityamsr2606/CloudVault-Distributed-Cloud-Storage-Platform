
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "@supabase/supabase-js";

type SearchRequest = {
  query: string;
  limit?: number;
};

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

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

    const body = (await req.json()) as SearchRequest;
    const query = body.query?.trim();
    if (!query || query.length < 2) {
      return new Response(JSON.stringify({ error: "Query is too short" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const model = new Supabase.ai.Session("gte-small");
    const embedding = await model.run(query, {
      mean_pool: true,
      normalize: true,
    });

    const { data, error } = await supabase.rpc("match_vault_chunks", {
      query_embedding: embedding,
      match_count: Math.min(Math.max(body.limit ?? 12, 1), 30),
    });

    if (error) throw error;

    const bestByFile = new Map<string, unknown>();
    for (const hit of data ?? []) {
      const current = bestByFile.get(hit.file_id) as { similarity?: number } | undefined;
      if (!current || Number(hit.similarity) > Number(current.similarity ?? -1)) {
        bestByFile.set(hit.file_id, hit);
      }
    }

    return new Response(JSON.stringify({ results: [...bestByFile.values()] }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("semantic-search failed", error);
    return new Response(JSON.stringify({ error: "Search failed" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
