import { BrainCircuit, FolderClosed, HardDrive, Search, ShieldCheck, Sparkles } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";

import FileActions from "../components/FileActions";
import { useRealtimeRefresh } from "../hooks/useRealtimeRefresh";
import { VaultFile, listFiles } from "../lib/cloudvault";

function bytes(value: number) {
  if (value < 1024) return `${value} B`;
  const units = ["KB", "MB", "GB"];
  let size = value / 1024;
  let unit = units[0];
  for (let i = 1; i < units.length && size >= 1024; i += 1) {
    size /= 1024;
    unit = units[i];
  }
  return `${size.toFixed(size >= 10 ? 0 : 1)} ${unit}`;
}

export default function DashboardPage() {
  const [files, setFiles] = useState<VaultFile[]>([]);
  const [message, setMessage] = useState("");

  const refresh = useCallback(async () => {
    try {
      setFiles(await listFiles());
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not load vault");
    }
  }, []);

  useEffect(() => { void refresh(); }, [refresh]);
  useRealtimeRefresh(["vault_files"], refresh);

  const used = useMemo(() => files.reduce((sum, file) => sum + file.size_bytes, 0), [files]);
  const indexed = files.filter((file) => file.status === "ready").length;
  const starred = files.filter((file) => file.is_starred).length;

  return (
    <div className="page-wrap">
      <header className="page-header">
        <div>
          <p className="eyebrow">Live operational overview</p>
          <h1>Your vault, right now.</h1>
          <p>Storage and indexing state refresh automatically as your workspace changes.</p>
        </div>
        <Link className="primary-button compact" to="/app/vault">Open vault</Link>
      </header>

      {message && <div className="inline-message">{message}</div>}

      <section className="metric-grid">
        <article className="metric-card"><HardDrive size={18}/><span>Storage</span><strong>{bytes(used)}</strong><small>current vault usage</small></article>
        <article className="metric-card"><FolderClosed size={18}/><span>Files</span><strong>{files.length}</strong><small>active objects</small></article>
        <article className="metric-card"><BrainCircuit size={18}/><span>AI ready</span><strong>{indexed}</strong><small>search-ready files</small></article>
        <article className="metric-card"><Sparkles size={18}/><span>Starred</span><strong>{starred}</strong><small>quick access</small></article>
      </section>

      <section className="dashboard-grid">
        <article className="feature-card">
          <div className="feature-icon"><Search size={18}/></div>
          <div><p className="eyebrow">Private intelligence</p><h2>Search by meaning</h2><p>Vector retrieval stays scoped to the signed-in owner at query time.</p></div>
          <Link className="ghost-button" to="/app/intelligence">Open Intelligence</Link>
        </article>

        <article className="feature-card">
          <div className="feature-icon"><ShieldCheck size={18}/></div>
          <div><p className="eyebrow">Access boundary</p><h2>Private below the UI</h2><p>RLS protects metadata and Storage policies protect object paths. Sharing is explicit and temporary.</p></div>
          <Link className="ghost-button" to="/app/shared">Manage sharing</Link>
        </article>
      </section>

      <section className="table-card">
        <div className="section-head"><div><p className="eyebrow">Latest</p><h2>Recent files</h2></div><Link to="/app/vault">View all</Link></div>
        <div className="file-list">
          {files.slice(0, 6).map((file) => (
            <div className="file-row" key={file.id}>
              <div className="file-glyph">{file.name.slice(0, 1).toUpperCase()}</div>
              <div className="file-main"><strong>{file.name}</strong><span>{file.mime_type} · {bytes(file.size_bytes)}</span></div>
              <span className={`status-pill ${file.status}`}>{file.status}</span>
              <FileActions file={file} onChange={() => void refresh()} onMessage={setMessage} />
            </div>
          ))}
          {files.length === 0 && <div className="empty-state">Upload your first file from My vault.</div>}
        </div>
      </section>
    </div>
  );
}
