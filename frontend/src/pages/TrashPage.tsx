import { RotateCcw } from "lucide-react";
import { useEffect, useState } from "react";

import { VaultFile, listTrash, restoreFile } from "../lib/cloudvault";

export default function TrashPage() {
  const [files, setFiles] = useState<VaultFile[]>([]);
  const [message, setMessage] = useState("");

  async function refresh() {
    try { setFiles(await listTrash()); } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not load trash");
    }
  }

  useEffect(() => { void refresh(); }, []);

  async function restore(id: string) {
    try { await restoreFile(id); await refresh(); setMessage("File restored."); }
    catch (error) { setMessage(error instanceof Error ? error.message : "Restore failed"); }
  }

  return (
    <div className="page-wrap">
      <header className="page-header"><div><p className="eyebrow">Recovery</p><h1>Trash</h1><p>Soft-deleted files remain recoverable until a permanent purge policy is added.</p></div></header>
      {message && <div className="inline-message">{message}</div>}
      <section className="table-card glass-panel">
        <div className="file-list">
          {files.map((file) => (
            <div className="file-row" key={file.id}>
              <div className="file-glyph">{file.name.slice(0,1).toUpperCase()}</div>
              <div className="file-main"><strong>{file.name}</strong><span>Deleted {file.deleted_at ? new Date(file.deleted_at).toLocaleString() : ""}</span></div>
              <button className="ghost-button compact" onClick={() => void restore(file.id)}><RotateCcw size={15}/> Restore</button>
            </div>
          ))}
          {files.length === 0 && <div className="empty-state">Trash is empty.</div>}
        </div>
      </section>
    </div>
  );
}
