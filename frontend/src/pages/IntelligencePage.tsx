import { BrainCircuit, Search, Sparkles } from "lucide-react";
import { FormEvent, useState } from "react";

import { SearchResult, semanticSearch } from "../lib/cloudvault";

export default function IntelligencePage() {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  async function search(event: FormEvent) {
    event.preventDefault();
    if (query.trim().length < 2) return;
    setBusy(true);
    setMessage("");
    try { setResults(await semanticSearch(query.trim())); }
    catch (error) { setMessage(error instanceof Error ? error.message : "Search failed"); }
    finally { setBusy(false); }
  }

  return (
    <div className="page-wrap">
      <header className="page-header">
        <div><p className="eyebrow">CloudVault Intelligence</p><h1>Search intent, not filenames.</h1><p>Semantic retrieval powered by free built-in embeddings and pgvector.</p></div>
        <div className="ai-badge"><BrainCircuit size={16}/> gte-small · 384d</div>
      </header>

      <section className="intelligence-hero glass-panel">
        <div className="feature-icon large"><Sparkles size={22}/></div>
        <div>
          <h2>What are you trying to find?</h2>
          <p>Try concepts such as “database scaling notes”, “expense explanation”, or “authentication design”.</p>
        </div>
        <form onSubmit={search} className="semantic-search">
          <Search size={18}/>
          <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search your indexed knowledge…" />
          <button disabled={busy}>{busy ? "Searching…" : "Search"}</button>
        </form>
      </section>

      {message && <div className="inline-message">{message}</div>}

      <section className="result-stack">
        {results.map((result, index) => (
          <article className="search-result glass-panel" key={`${result.file_id}-${index}`}>
            <div className="score-ring">{Math.max(0, Math.min(99, Math.round(result.similarity * 100)))}%</div>
            <div><strong>{result.name}</strong><p>{result.content}</p></div>
          </article>
        ))}
        {!busy && results.length === 0 && <div className="empty-state glass-panel">Results will appear here with similarity evidence, not fabricated answers.</div>}
      </section>
    </div>
  );
}
