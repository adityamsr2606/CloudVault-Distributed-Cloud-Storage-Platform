import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.116.0";

type GroundedRequest = {
  question: string;
  limit?: number;
};

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

function buildContext(
  evidence: Array<{ name: string; content: string; score: number }>,
) {
  return evidence
    .map(
      (item, index) =>
        "[" +
        (index + 1) +
        "] " +
        item.name +
        "\n" +
        item.content.slice(0, 2200),
    )
    .join("\n\n");
}

function extractText(payload: any) {
  const parts = payload?.candidates?.[0]?.content?.parts;
  if (!Array.isArray(parts)) return "";
  return parts.map((part: any) => String(part?.text ?? "")).join("").trim();
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const started = Date.now();
  const requestId = crypto.randomUUID();

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

    const [{ data: settings, error: settingsError }, body] = await Promise.all([
      supabase
        .from("product_settings")
        .select(
          "ai_enabled,generative_ai_enabled,generative_ai_provider,generative_ai_model,grounded_answer_context_limit,observability_enabled",
        )
        .eq("id", "default")
        .single(),
      req.json() as Promise<GroundedRequest>,
    ]);

    if (settingsError || !settings) throw settingsError ?? new Error("Missing product settings");
    if (!settings.ai_enabled) return json({ error: "CloudVault Intelligence is disabled." }, 403);

    const question = body.question?.trim();
    if (!question || question.length < 3) {
      return json({ error: "Question is too short." }, 400);
    }

    const contextLimit = Math.min(
      Math.max(
        Number(body.limit ?? settings.grounded_answer_context_limit),
        2,
      ),
      Number(settings.grounded_answer_context_limit),
    );

    const model = new Supabase.ai.Session("gte-small");
    const embedding = await model.run(question, {
      mean_pool: true,
      normalize: true,
    });

    const { data: hits, error: searchError } = await supabase.rpc("hybrid_search_vault", {
      query_text: question,
      query_embedding: embedding,
      match_count: contextLimit,
    });
    if (searchError) throw searchError;

    const evidence = (hits ?? []).slice(0, contextLimit).map((hit: any) => ({
      file_id: hit.file_id,
      name: hit.name,
      content: hit.content,
      semantic_score: Number(hit.semantic_score ?? 0),
      lexical_score: Number(hit.lexical_score ?? 0),
      score: Number(hit.score ?? 0),
    }));

    const { data: preference } = await supabase
      .from("user_preferences")
      .select("allow_external_ai")
      .eq("owner_id", authData.user.id)
      .maybeSingle();

    const externalAiAllowed = Boolean(preference?.allow_external_ai);
    const geminiKey = Deno.env.get("GEMINI_API_KEY");

    if (
      !settings.generative_ai_enabled ||
      settings.generative_ai_provider !== "gemini" ||
      !externalAiAllowed ||
      !geminiKey
    ) {
      const status = !settings.generative_ai_enabled
        ? "generative_ai_disabled"
        : !externalAiAllowed
          ? "user_consent_required"
          : !geminiKey
            ? "provider_not_configured"
            : "provider_unavailable";

      if (settings.observability_enabled) {
        void supabase.from("ai_query_events").insert({
          owner_id: authData.user.id,
          query_kind: "grounded_answer",
          provider: "retrieval-only",
          result_count: evidence.length,
          duration_ms: Date.now() - started,
          status,
        });
      }

      return json({
        status,
        answer: null,
        evidence,
        request_id: requestId,
      });
    }

    const context = buildContext(evidence);
    const prompt =
      "You are CloudVault Intelligence. Answer only from the private evidence below. " +
      "Do not use outside knowledge. If the evidence is insufficient, say exactly that. " +
      "Every factual claim must cite one or more evidence numbers such as [1] or [2]. " +
      "Never invent filenames, dates, people, metrics, or facts.\n\n" +
      "Question:\n" +
      question +
      "\n\nPrivate evidence:\n" +
      context;

    const endpoint =
      "https://generativelanguage.googleapis.com/v1beta/models/" +
      encodeURIComponent(settings.generative_ai_model) +
      ":generateContent";

    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-goog-api-key": geminiKey,
      },
      body: JSON.stringify({
        contents: [{ role: "user", parts: [{ text: prompt }] }],
        generationConfig: {
          temperature: 0.1,
          maxOutputTokens: 1400,
        },
      }),
    });

    if (!response.ok) {
      const detail = await response.text();
      console.error("Gemini request failed", response.status, detail);
      throw new Error("The configured generative provider did not return a usable response.");
    }

    const payload = await response.json();
    const answer = extractText(payload);

    if (!answer) throw new Error("The generative provider returned an empty answer.");

    if (settings.observability_enabled) {
      void supabase.from("ai_query_events").insert({
        owner_id: authData.user.id,
        query_kind: "grounded_answer",
        provider: settings.generative_ai_model,
        result_count: evidence.length,
        duration_ms: Date.now() - started,
        status: "success",
      });

      console.log(
        JSON.stringify({
          event: "grounded_answer",
          request_id: requestId,
          owner_id: authData.user.id,
          provider: settings.generative_ai_model,
          evidence_count: evidence.length,
          duration_ms: Date.now() - started,
        }),
      );
    }

    return json({
      status: "success",
      answer,
      evidence,
      model: settings.generative_ai_model,
      request_id: requestId,
    });
  } catch (error) {
    console.error("grounded-answer failed", error);
    return json(
      {
        error: error instanceof Error ? error.message : "Grounded answer failed.",
        request_id: requestId,
      },
      500,
    );
  }
});
