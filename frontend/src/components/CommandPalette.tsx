import {
  Activity,
  BrainCircuit,
  File,
  FolderClosed,
  Search,
  Settings,
  Share2,
  Star,
  Trash2,
  X,
} from "lucide-react";
import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";

import { SearchResult, semanticSearch } from "../lib/cloudvault";

const destinations = [
  ["/app/vault", "My vault", FolderClosed],
  ["/app/starred", "Starred", Star],
  ["/app/intelligence", "Intelligence", BrainCircuit],
  ["/app/shared", "Shared links", Share2],
  ["/app/activity", "Activity", Activity],
  ["/app/trash", "Trash", Trash2],
  ["/app/settings", "Settings", Settings],
] as const;

export default function CommandPalette() {
  const navigate = useNavigate();
  const input = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setOpen((value) => !value);
      }
      if (event.key === "Escape") setOpen(false);
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  useEffect(() => {
    if (open) window.setTimeout(() => input.current?.focus(), 40);
    if (!open) {
      setQuery("");
      setResults([]);
      setMessage("");
    }
  }, [open]);

  const filteredDestinations = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return destinations;
    return destinations.filter(([, label]) => label.toLowerCase().includes(q));
  }, [query]);

  async function submit(event: FormEvent) {
    event.preventDefault();
    const value = query.trim();
    if (value.length < 2) return;

    setBusy(true);
    setMessage("");
    try {
      setResults(await semanticSearch(value));
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Search failed");
    } finally {
      setBusy(false);
    }
  }

  if (!open) {
    return (
      <button className="command-trigger" onClick={() => setOpen(true)}>
        <Search size={15} />
        <span>Search your vault</span>
        <kbd>⌘K</kbd>
      </button>
    );
  }

  return (
    <div className="command-overlay" role="dialog" aria-modal="true" aria-label="CloudVault command palette">
      <button className="command-scrim" aria-label="Close command palette" onClick={() => setOpen(false)} />
      <section className="command-panel">
        <form className="command-search" onSubmit={submit}>
          <Search size={18} />
          <input
            ref={input}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Find a file by meaning, or jump somewhere…"
          />
          {busy ? <span className="command-working">Searching</span> : <button type="button" onClick={() => setOpen(false)}><X size={16} /></button>}
        </form>

        {message && <div className="command-message">{message}</div>}

        <div className="command-content">
          {results.length > 0 && (
            <div className="command-group">
              <p>AI results · only your vault</p>
              {results.slice(0, 6).map((result) => (
                <button key={result.file_id} className="command-result" onClick={() => { navigate("/app/intelligence"); setOpen(false); }}>
                  <span className="command-result-icon"><File size={15} /></span>
                  <span><strong>{result.name}</strong><small>{result.content.slice(0, 88)}</small></span>
                  <em>{Math.round(Math.max(0, result.similarity) * 100)}%</em>
                </button>
              ))}
            </div>
          )}

          <div className="command-group">
            <p>{query ? "Navigation matches" : "Quick navigation"}</p>
            {filteredDestinations.map(([path, label, Icon]) => (
              <button key={path} className="command-result" onClick={() => { navigate(path); setOpen(false); }}>
                <span className="command-result-icon"><Icon size={15} /></span>
                <span><strong>{label}</strong><small>Open section</small></span>
              </button>
            ))}
          </div>
        </div>

        <footer className="command-footer">
          <span><kbd>Enter</kbd> semantic search</span>
          <span><kbd>Esc</kbd> close</span>
          <span className="personal-only">Results are scoped to your account</span>
        </footer>
      </section>
    </div>
  );
}
