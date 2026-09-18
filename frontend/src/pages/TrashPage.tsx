import { RotateCcw, Trash2 } from "lucide-react";
import { useCallback, useEffect, useState } from "react";

import { useRealtimeRefresh } from "../hooks/useRealtimeRefresh";
import { VaultFile, listTrash, purgeFile, restoreFile } from "../lib/cloudvault";

export default function TrashPage() {
  const [files, setFiles] = useState<VaultFile[]>([]);
  const [message, setMessage] = useState("");

  const refresh = useCallback(async () => {
    try {
      setFiles(await listTrash());
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not load trash");
    }
  }, []);

  useEffect(() => { void refresh(); }, [refresh]);
  useRealtimeRefresh(["vault_files"], refresh);

  async function restore(id: string) {
    try {
      await restoreFile(id);
      setMessage("File restored.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Restore failed");
    }
  }

  async function purge(file: VaultFile) {
    if (!window.confirm(`Permanently delete "${file.name}" and every stored version? This cannot be undone.`)) return;
    try {
      await purgeFile(file.id);
      setMessage("File and all stored versions permanently deleted.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Permanent delete failed");
    }
  }

  return (
    <div className="page-wrap">
      <header className="page-header"><div><p className="eyebrow">Recovery</p><h1>Trash</h1><p>Restore soft-deleted files or permanently remove every stored version.</p></div></header>
      {message && <div className="inline-message">{message}</div>}
      <section className="table-card">
        <div className="file-list">
          {files.map((file) => (
            <div className="file-row" key={file.id}>
              <div className="file-glyph">{file.name.slice(0,1).toUpperCase()}</div>
              <div className="file-main"><strong>{file.name}</strong><span>Deleted {file.deleted_at ? new Date(file.deleted_at).toLocaleString() : ""}</span></div>
              <div className="trash-actions">
                <button className="ghost-button compact" onClick={() => void restore(file.id)}><RotateCcw size={15}/> Restore</button>
                <button className="danger-button compact" onClick={() => void purge(file)}><Trash2 size={15}/> Delete forever</button>
              </div>
            </div>
          ))}
          {files.length === 0 && <div className="empty-state">Trash is empty.</div>}
        </div>
      </section>
    </div>
  );
}
