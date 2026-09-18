import { BrainCircuit, Search, ShieldCheck, Sparkles } from "lucide-react";
import { FormEvent, useEffect, useState } from "react";

import { getProductSettings, type ProductSettings } from "../config/product";
import {
  GroundedAnswer,
  SearchResult,
  askGroundedQuestion,
  getExternalAiConsent,
  semanticSearch,
  setExternalAiConsent,
} from "../lib/cloudvault";

export default function IntelligencePage() {
  const [query, setQuery] = useState("");
  const [question, setQuestion] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [answer, setAnswer] = useState<GroundedAnswer | null>(null);
  const [settings, setSettings] = useState<ProductSettings | null>(null);
  const [consent, setConsent] = useState(false);
  const [busySearch, setBusySearch] = useState(false);
  const [busyAnswer, setBusyAnswer] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    void Promise.all([getProductSettings(), getExternalAiConsent()])
      .then(([product, externalConsent]) => {
        setSettings(product);
        setConsent(externalConsent);
      })
      .catch((error) => {
        setMessage(error instanceof Error ? error.message : "Could not load AI settings");
      });
  }, []);

  async function search(event: FormEvent) {
    event.preventDefault();
    if (query.trim().length < 2) return;

    setBusySearch(true);
    setMessage("");
    try {
      setResults(await semanticSearch(query.trim()));
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Search failed");
    } finally {
      setBusySearch(false);
    }
  }

  async function ask(event: FormEvent) {
    event.preventDefault();
    if (question.trim().length < 3) return;

    setBusyAnswer(true);
    setMessage("");
    try {
      setAnswer(await askGroundedQuestion(question.trim()));
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Grounded answer failed");
    } finally {
      setBusyAnswer(false);
    }
  }

  async function changeConsent(allowed: boolean) {
    try {
      await setExternalAiConsent(allowed);
      setConsent(allowed);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not update AI consent");
    }
  }

  return (
    <div className="page-wrap">
      <header className="page-header">
        <div>
          <p className="eyebrow">CloudVault Intelligence v2</p>
          <h1>Retrieve first. Generate only when grounded.</h1>
          <p>
            Hybrid vector + full-text retrieval stays inside your owner boundary. External
            generative AI is separately controlled and opt-in.
          </p>
        </div>
        <div className="ai-badge">
          <BrainCircuit size={16} />
          hybrid · pgvector + FTS
        </div>
      </header>

      <section className="intelligence-grid">
        <article className="intelligence-hero glass-panel">
          <div className="feature-icon large"><Search size={22} /></div>
          <div>
            <p className="eyebrow">Hybrid retrieval</p>
            <h2>Search meaning and exact language together.</h2>
            <p>
              Semantic similarity handles concepts while PostgreSQL full-text search catches
              precise terminology, names, identifiers and phrases.
            </p>
          </div>

          <form onSubmit={search} className="semantic-search">
            <Search size={18} />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search your indexed knowledge…"
            />
            <button disabled={busySearch}>
              {busySearch ? "Searching…" : "Search"}
            </button>
          </form>
        </article>

        <article className="intelligence-hero glass-panel">
          <div className="feature-icon large"><Sparkles size={22} /></div>
          <div>
            <p className="eyebrow">Grounded Q&A</p>
            <h2>Ask your vault, with evidence attached.</h2>
            <p>
              CloudVault retrieves private evidence first. A generative provider is called
              only when the deployment enables it and you explicitly allow external AI.
            </p>
          </div>

          <form onSubmit={ask} className="semantic-search">
            <BrainCircuit size={18} />
            <input
              value={question}
              onChange={(event) => setQuestion(event.target.value)}
              placeholder="Ask a question about your files…"
            />
            <button disabled={busyAnswer}>
              {busyAnswer ? "Grounding…" : "Ask"}
            </button>
          </form>

          <div className="ai-consent-row">
            <div>
              <ShieldCheck size={15} />
              <span>
                <strong>External AI consent</strong>
                <small>
                  {settings?.generative_ai_enabled
                    ? "When enabled, retrieved snippets may be sent to the configured Gemini model."
                    : "Generative AI is currently disabled at deployment level; retrieval remains local to CloudVault."}
                </small>
              </span>
            </div>
            <label className="consent-switch">
              <input
                type="checkbox"
                checked={consent}
                disabled={!settings?.generative_ai_enabled}
                onChange={(event) => void changeConsent(event.target.checked)}
              />
              <span>{consent ? "Allowed" : "Not allowed"}</span>
            </label>
          </div>
        </article>
      </section>

      {message && <div className="inline-message">{message}</div>}

      {answer && (
        <section className="grounded-answer glass-panel">
          <div className="grounded-answer-head">
            <div>
              <p className="eyebrow">Grounded response</p>
              <h2>
                {answer.answer
                  ? "Answer generated from your retrieved evidence"
                  : "Evidence retrieved — generation not enabled"}
              </h2>
            </div>
            {answer.model && <span className="ai-badge">{answer.model}</span>}
          </div>

          {answer.answer ? (
            <p className="answer-copy">{answer.answer}</p>
          ) : (
            <p className="answer-copy">
              {answer.status === "user_consent_required"
                ? "External AI consent is off. CloudVault stopped after private retrieval."
                : answer.status === "provider_not_configured"
                  ? "Gemini is enabled in policy but no server-side API key is configured."
                  : "Generative AI is disabled. The retrieved evidence below is still available."}
            </p>
          )}

          <div className="evidence-stack">
            {answer.evidence.map((item, index) => (
              <article key={item.file_id + "-" + index} className="evidence-item">
                <span className="evidence-number">[{index + 1}]</span>
                <div>
                  <strong>{item.name}</strong>
                  <p>{item.content}</p>
                </div>
                <em>{Math.round(Math.max(0, item.score) * 100)}%</em>
              </article>
            ))}
          </div>
        </section>
      )}

      <section className="result-stack">
        {results.map((result, index) => (
          <article className="search-result glass-panel" key={result.file_id + "-" + index}>
            <div className="score-ring">
              {Math.max(0, Math.min(99, Math.round(result.similarity * 100)))}%
            </div>
            <div>
              <strong>{result.name}</strong>
              <p>{result.content}</p>
              <div className="rank-breakdown">
                <span>semantic {Math.round((result.semantic_score ?? 0) * 100)}%</span>
                <span>lexical {Math.round((result.lexical_score ?? 0) * 100)}%</span>
              </div>
            </div>
          </article>
        ))}

        {!busySearch && results.length === 0 && !answer && (
          <div className="empty-state glass-panel">
            Search results and grounded evidence appear here. CloudVault does not invent
            answers when evidence is missing.
          </div>
        )}
      </section>
    </div>
  );
}
