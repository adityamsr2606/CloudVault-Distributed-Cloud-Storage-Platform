import { FormEvent, useEffect, useState } from "react";
import { BrainCircuit, Cloud, FileText, LogOut, Search, ShieldCheck, Upload } from "lucide-react";

type CloudFile = {
  id: string;
  name: string;
  mime_type: string;
  size_bytes: number;
  version_number: number;
  status: string;
  created_at: string;
};

type SearchHit = { file_id: string; name: string; score: number; snippet: string | null };
type Summary = { used_bytes: number; quota_bytes: number; file_count: number; ready_count: number };

const API = import.meta.env.VITE_API_URL ?? "";

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers);
  const token = localStorage.getItem("cloudvault_access");
  if (token) headers.set("Authorization", `Bearer ${token}`);
  if (!(init.body instanceof FormData)) headers.set("Content-Type", "application/json");

  const response = await fetch(`${API}${path}`, { ...init, headers });
  if (!response.ok) {
    const body = await response.json().catch(() => ({ detail: "Request failed" }));
    throw new Error(body.detail ?? "Request failed");
  }
  if (response.status === 204) return undefined as T;
  return response.json() as Promise<T>;
}

function bytes(value: number) {
  if (value < 1024) return `${value} B`;
  if (value < 1024 ** 2) return `${(value / 1024).toFixed(1)} KB`;
  return `${(value / 1024 ** 2).toFixed(1)} MB`;
}

function Auth({ ready }: { ready: () => void }) {
  const [registering, setRegistering] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");

  async function submit(event: FormEvent) {
    event.preventDefault();
    setError("");
    try {
      if (registering) {
        await request("/api/v1/auth/register", {
          method: "POST", body: JSON.stringify({ email, password })
        });
      }
      const tokens = await request<{ access_token: string }>("/api/v1/auth/login", {
        method: "POST", body: JSON.stringify({ email, password })
      });
      localStorage.setItem("cloudvault_access", tokens.access_token);
      ready();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to continue");
    }
  }

  return (
    <main className="auth">
      <section className="hero">
        <div className="brand"><Cloud size={21} /> CloudVault</div>
        <p className="eyebrow">SECURE OBJECT STORAGE · INTELLIGENT RETRIEVAL</p>
        <h1>Find the file you mean.</h1>
        <p className="lede">Encrypted-ready storage architecture with asynchronous indexing and semantic search built into the workflow.</p>
        <div className="trust">
          <span><ShieldCheck size={16} /> tenant-scoped access</span>
          <span><BrainCircuit size={16} /> hybrid AI retrieval</span>
        </div>
      </section>
      <form className="auth-card" onSubmit={submit}>
        <h2>{registering ? "Create your vault" : "Welcome back"}</h2>
        <label>Email<input type="email" value={email} onChange={e => setEmail(e.target.value)} required /></label>
        <label>Password<input type="password" minLength={10} value={password} onChange={e => setPassword(e.target.value)} required /></label>
        {error && <div className="error">{error}</div>}
        <button className="primary">{registering ? "Create account" : "Sign in"}</button>
        <button type="button" className="link" onClick={() => setRegistering(!registering)}>
          {registering ? "Already have an account?" : "Create an account"}
        </button>
      </form>
    </main>
  );
}

function Vault({ logout }: { logout: () => void }) {
  const [files, setFiles] = useState<CloudFile[]>([]);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [hits, setHits] = useState<SearchHit[]>([]);
  const [query, setQuery] = useState("");
  const [notice, setNotice] = useState("");

  async function refresh() {
    const [nextFiles, nextSummary] = await Promise.all([
      request<CloudFile[]>("/api/v1/files"),
      request<Summary>("/api/v1/files/summary")
    ]);
    setFiles(nextFiles);
    setSummary(nextSummary);
  }

  useEffect(() => { refresh().catch(err => setNotice(String(err))); }, []);

  async function upload(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    const form = new FormData();
    form.append("upload", file);
    setNotice(`Uploading ${file.name}…`);
    try {
      await request("/api/v1/files", { method: "POST", body: form });
      setNotice("Upload complete. Semantic indexing is continuing asynchronously.");
      await refresh();
    } catch (err) {
      setNotice(err instanceof Error ? err.message : "Upload failed");
    }
    event.target.value = "";
  }

  async function search(event: FormEvent) {
    event.preventDefault();
    if (query.trim().length < 2) return;
    setNotice("Running lexical + semantic retrieval…");
    try {
      setHits(await request<SearchHit[]>(`/api/v1/search?q=${encodeURIComponent(query)}`));
      setNotice("");
    } catch (err) {
      setNotice(err instanceof Error ? err.message : "Search failed");
    }
  }

  return (
    <div className="shell">
      <aside>
        <div className="brand"><Cloud size={20} /> CloudVault</div>
        <nav><span className="active"><FileText size={17} /> Files</span><span><BrainCircuit size={17} /> Intelligence</span></nav>
        <button className="logout" onClick={logout}><LogOut size={16} /> Sign out</button>
      </aside>
      <main className="workspace">
        <header><div><p className="eyebrow">PERSONAL VAULT</p><h1>Files</h1></div>
          <label className="upload"><Upload size={17} /> Upload<input type="file" onChange={upload} /></label>
        </header>
        <section className="stats">
          <article><span>Objects</span><strong>{summary?.file_count ?? 0}</strong></article>
          <article><span>Storage</span><strong>{bytes(summary?.used_bytes ?? 0)}</strong></article>
          <article><span>AI ready</span><strong>{summary?.ready_count ?? 0}</strong></article>
        </section>
        <form className="search" onSubmit={search}><Search size={18} /><input value={query} onChange={e => setQuery(e.target.value)} placeholder="Describe the file you're looking for…" /><button>Search</button></form>
        {notice && <p className="notice">{notice}</p>}
        {hits.length > 0 && <section className="list"><h2>Semantic results</h2>{hits.map(hit => <div className="row" key={hit.file_id}><BrainCircuit size={18} /><div><strong>{hit.name}</strong><p>{hit.snippet}</p></div><span>{hit.score.toFixed(2)}</span></div>)}</section>}
        <section className="list"><h2>Recent files</h2>{files.map(file => <div className="row" key={file.id}><FileText size={18} /><div><strong>{file.name}</strong><p>{file.mime_type} · {bytes(file.size_bytes)} · v{file.version_number}</p></div><span className={`pill ${file.status}`}>{file.status}</span></div>)}</section>
      </main>
    </div>
  );
}

export default function App() {
  const [authed, setAuthed] = useState(Boolean(localStorage.getItem("cloudvault_access")));
  if (!authed) return <Auth ready={() => setAuthed(true)} />;
  return <Vault logout={() => { localStorage.removeItem("cloudvault_access"); setAuthed(false); }} />;
}
