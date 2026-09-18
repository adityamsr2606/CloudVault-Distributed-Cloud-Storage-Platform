import { FolderPlus, Grid2X2, List, Upload } from "lucide-react";
import { ChangeEvent, useEffect, useRef, useState } from "react";

import FileActions from "../components/FileActions";
import {
  VaultFile,
  VaultFolder,
  createFolder,
  listFiles,
  listFolders,
  uploadVaultFile,
} from "../lib/cloudvault";

function bytes(value: number) {
  return value < 1024 * 1024 ? `${Math.max(1, Math.round(value / 1024))} KB` : `${(value / 1024 / 1024).toFixed(1)} MB`;
}

export default function VaultPage({ starredOnly = false }: { starredOnly?: boolean }) {
  const [files, setFiles] = useState<VaultFile[]>([]);
  const [folders, setFolders] = useState<VaultFolder[]>([]);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [view, setView] = useState<"list" | "grid">("list");
  const picker = useRef<HTMLInputElement>(null);

  async function refresh() {
    try {
      const [nextFiles, nextFolders] = await Promise.all([listFiles(), listFolders()]);
      setFiles(starredOnly ? nextFiles.filter((file) => file.is_starred) : nextFiles);
      setFolders(nextFolders);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not load files");
    }
  }

  useEffect(() => { void refresh(); }, [starredOnly]);

  async function upload(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    setBusy(true);
    setMessage("");
    try {
      await uploadVaultFile(file);
      setMessage("Uploaded. AI indexing continues in the background.");
      await refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Upload failed");
    } finally {
      setBusy(false);
      event.target.value = "";
    }
  }

  async function newFolder() {
    const name = window.prompt("Folder name");
    if (!name?.trim()) return;
    try {
      await createFolder(name);
      await refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not create folder");
    }
  }

  return (
    <div className="page-wrap">
      <header className="page-header">
        <div><p className="eyebrow">{starredOnly ? "Pinned workspace" : "Object browser"}</p><h1>{starredOnly ? "Starred" : "My vault"}</h1><p>Private objects, versions, folders, and secure actions.</p></div>
        <div className="header-actions">
          {!starredOnly && <button className="ghost-button" onClick={newFolder}><FolderPlus size={16}/> New folder</button>}
          {!starredOnly && <button className="primary-button compact" onClick={() => picker.current?.click()} disabled={busy}><Upload size={16}/>{busy ? "Uploading…" : "Upload"}</button>}
          <input ref={picker} hidden type="file" onChange={upload} />
        </div>
      </header>

      {message && <div className="inline-message">{message}</div>}

      {!starredOnly && folders.length > 0 && (
        <section className="folder-strip">
          {folders.map((folder) => <button className="folder-chip glass-panel" key={folder.id}><span>◫</span>{folder.name}</button>)}
        </section>
      )}

      <section className="table-card glass-panel">
        <div className="section-head">
          <div><p className="eyebrow">Files</p><h2>{files.length} objects</h2></div>
          <div className="view-toggle">
            <button className={view === "list" ? "active" : ""} onClick={() => setView("list")}><List size={16}/></button>
            <button className={view === "grid" ? "active" : ""} onClick={() => setView("grid")}><Grid2X2 size={16}/></button>
          </div>
        </div>

        <div className={view === "grid" ? "file-grid" : "file-list"}>
          {files.map((file) => (
            <div className={view === "grid" ? "file-tile" : "file-row"} key={file.id}>
              <div className="file-glyph">{file.name.slice(0, 1).toUpperCase()}</div>
              <div className="file-main"><strong>{file.name}</strong><span>{bytes(file.size_bytes)} · v{file.current_version}</span></div>
              <span className={`status-pill ${file.status}`}>{file.status}</span>
              <FileActions file={file} onChange={() => void refresh()} onMessage={setMessage} />
            </div>
          ))}
          {files.length === 0 && <div className="empty-state">{starredOnly ? "No starred files yet." : "Drop in your first file with Upload."}</div>}
        </div>
      </section>
    </div>
  );
}
