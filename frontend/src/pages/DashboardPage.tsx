import { BrainCircuit, FolderClosed, HardDrive, Search, ShieldCheck, Sparkles } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";

import FileActions from "../components/FileActions";
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

  async function refresh() {
    try { setFiles(await listFiles()); } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not load vault");
    }
  }

  useEffect(() => { void refresh(); }, []);

  const used = useMemo(() => files.reduce((sum, file) => sum + file.size_bytes, 0), [files]);
  const indexed = files.filter((file) => file.status === "ready").length;
  const starred = files.filter((file) => file.is_starred).length;

  return (
    <div className="page-wrap">
      <header className="page-header">
        <div><p className="eyebrow">Operational overview</p><h1>Good to see your vault.</h1><p>Storage, intelligence, and access activity in one place.</p></div>
        <Link className="primary-button compact" to="/app/vault">Open vault</Link>
      </header>

      {message && <div className="inline-message">{message}</div>}

      <section className="metric-grid">
        <article className="metric-card glass-panel"><HardDrive size={18}/><span>Storage</span><strong>{bytes(used)}</strong><small>free-tier usage</small></article>
        <article className="metric-card glass-panel"><FolderClosed size={18}/><span>Files</span><strong>{files.length}</strong><small>active objects</small></article>
        <article className="metric-card glass-panel"><BrainCircuit size={18}/><span>AI ready</span><strong>{indexed}</strong><small>searchable files</small></article>
        <article className="metric-card glass-panel"><Sparkles size={18}/><span>Starred</span><strong>{starred}</strong><small>quick access</small></article>
      </section>

      <section className="dashboard-grid">
        <article className="feature-card glass-panel">
          <div className="feature-icon"><Search size={18}/></div>
          <div><p className="eyebrow">Semantic retrieval</p><h2>Search by meaning</h2><p>CloudVault embeds indexed content using Supabase’s free built-in model and filters results to your identity at query time.</p></div>
          <Link className="ghost-button" to="/app/intelligence">Open Intelligence</Link>
        </article>

        <article className="feature-card glass-panel">
          <div className="feature-icon"><ShieldCheck size={18}/></div>
          <div><p className="eyebrow">Access boundary</p><h2>Private by database policy</h2><p>RLS protects metadata and storage. Shared downloads use expiring signed URLs rather than public buckets.</p></div>
          <Link className="ghost-button" to="/app/shared">Manage sharing</Link>
        </article>
      </section>

      <section className="table-card glass-panel">
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
