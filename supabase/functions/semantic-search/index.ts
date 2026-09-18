import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.116.0";

declare const Supabase: {
  ai: {
    Session: new (model: string) => {
      run: (
        input: string,
        options: { mean_pool: boolean; normalize: boolean },
      ) => Promise<number[]>;
    };
  };
};


type SearchRequest = { query: string; limit?: number };

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

    const { data: userData, error: userError } = await supabase.auth.getUser();
    if (userError || !userData.user) return json({ error: "Invalid session" }, 401);

    const [{ data: settings, error: settingsError }, body] = await Promise.all([
      supabase
        .from("product_settings")
        .select("ai_enabled,semantic_search_limit,observability_enabled")
        .eq("id", "default")
        .single(),
      req.json() as Promise<SearchRequest>,
    ]);

    if (settingsError || !settings) throw settingsError ?? new Error("Missing product settings");
    if (!settings.ai_enabled) return json({ error: "AI search is disabled" }, 403);

    const query = body.query?.trim();
    if (!query || query.length < 2) {
      return json({ error: "Query is too short" }, 400);
    }

    const requested = Number(body.limit ?? settings.semantic_search_limit);
    const limit = Math.min(
      Math.max(Number.isFinite(requested) ? requested : settings.semantic_search_limit, 1),
      settings.semantic_search_limit,
    );

    const model = new Supabase.ai.Session("gte-small");
    const embedding = await model.run(query, {
      mean_pool: true,
      normalize: true,
    });

    const { data, error } = await supabase.rpc("hybrid_search_vault", {
      query_text: query,
      query_embedding: embedding,
      match_count: limit,
    });
    if (error) throw error;

    const bestByFile = new Map<string, Record<string, unknown>>();
    for (const hit of data ?? []) {
      const score = Number(hit.score ?? 0);
      const current = bestByFile.get(hit.file_id);
      if (!current || score > Number(current.score ?? -1)) {
        bestByFile.set(hit.file_id, hit);
      }
    }

    const results = [...bestByFile.values()]
      .sort((a, b) => Number(b.score ?? 0) - Number(a.score ?? 0))
      .slice(0, limit)
      .map((hit) => ({
        ...hit,
        similarity: Number(hit.score ?? 0),
      }));

    if (settings.observability_enabled) {
      const duration = Date.now() - started;
      void supabase.from("ai_query_events").insert({
        owner_id: userData.user.id,
        query_kind: "hybrid_search",
        provider: "gte-small+postgres-fts",
        result_count: results.length,
        duration_ms: duration,
        status: "success",
      });

      console.log(
        JSON.stringify({
          event: "hybrid_search",
          request_id: crypto.randomUUID(),
          owner_id: userData.user.id,
          result_count: results.length,
          duration_ms: duration,
        }),
      );
    }

    return json({ results });
  } catch (error) {
    console.error("semantic-search failed", error);
    return json({ error: "Search failed" }, 500);
  }
});
