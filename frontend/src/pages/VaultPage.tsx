import {
  ChevronRight,
  Folder,
  FolderPlus,
  Grid2X2,
  List,
  Trash2,
  Upload,
} from "lucide-react";
import {
  ChangeEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import FileActions from "../components/FileActions";
import FileInspector from "../components/FileInspector";
import UploadDock from "../components/UploadDock";
import {
  formatCapacity,
  getProductSettings,
  type ProductSettings,
} from "../config/product";
import { useRealtimeRefresh } from "../hooks/useRealtimeRefresh";
import {
  VaultFile,
  VaultFolder,
  createFolder,
  listFiles,
  listFolders,
  trashFolder,
} from "../lib/cloudvault";
import {
  CloudUploadTask,
  UploadProgress,
  startVaultUpload,
} from "../lib/uploads";

function bytes(value: number) {
  return value < 1024 * 1024
    ? Math.max(1, Math.round(value / 1024)) + " KB"
    : (value / 1024 / 1024).toFixed(1) + " MB";
}

export default function VaultPage({ starredOnly = false }: { starredOnly?: boolean }) {
  const [allFiles, setAllFiles] = useState<VaultFile[]>([]);
  const [folders, setFolders] = useState<VaultFolder[]>([]);
  const [settings, setSettings] = useState<ProductSettings | null>(null);
  const [activeFolder, setActiveFolder] = useState<string | null>(null);
  const [selectedFile, setSelectedFile] = useState<VaultFile | null>(null);
  const [message, setMessage] = useState("");
  const [view, setView] = useState<"list" | "grid">("list");
  const [uploadTask, setUploadTask] = useState<CloudUploadTask | null>(null);
  const [uploadName, setUploadName] = useState("");
  const [uploadProgress, setUploadProgress] = useState<UploadProgress | null>(null);
  const picker = useRef<HTMLInputElement>(null);

  const refresh = useCallback(async () => {
    try {
      const [nextFiles, nextFolders, nextSettings] = await Promise.all([
        listFiles(),
        listFolders(),
        getProductSettings(),
      ]);
      setAllFiles(starredOnly ? nextFiles.filter((file) => file.is_starred) : nextFiles);
      setFolders(nextFolders);
      setSettings(nextSettings);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not load files");
    }
  }, [starredOnly]);

  useEffect(() => {
    setActiveFolder(null);
    void refresh();
  }, [refresh]);

  useRealtimeRefresh(["vault_files", "vault_folders", "product_settings"], refresh);

  const activeFolderRecord = folders.find((folder) => folder.id === activeFolder) ?? null;
  const files = useMemo(
    () => allFiles.filter((file) => file.folder_id === activeFolder),
    [activeFolder, allFiles],
  );
  const visibleFolders = useMemo(
    () => folders.filter((folder) => folder.parent_id === activeFolder),
    [activeFolder, folders],
  );

  async function upload(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;

    setMessage("");
    setUploadName(file.name);

    let latestProgress: UploadProgress | null = null;
    const task = startVaultUpload(file, activeFolder, (progress) => {
      latestProgress = progress;
      setUploadProgress(progress);
    });

    setUploadTask(task);

    try {
      await task.completion;
      setMessage(
        settings?.ai_enabled
          ? "Upload complete. Eligible text content is indexed privately."
          : "Upload complete.",
      );
      await refresh();
    } catch (error) {
      setUploadProgress((current) =>
        current
          ? { ...current, state: "failed" }
          : latestProgress
            ? { ...latestProgress, state: "failed" }
            : null,
      );
      setMessage(error instanceof Error ? error.message : "Upload failed");
    } finally {
      event.target.value = "";
    }
  }

  async function newFolder() {
    const name = window.prompt("Folder name");
    if (!name?.trim()) return;

    try {
      await createFolder(name, activeFolder);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not create folder");
    }
  }

  async function moveFolderToTrash(folder: VaultFolder) {
    const confirmed = window.confirm(
      'Move "' +
        folder.name +
        '" and its active files/subfolders to Trash? You can restore the folder later.',
    );
    if (!confirmed) return;

    try {
      const result = await trashFolder(folder.id);
      if (activeFolder === folder.id) setActiveFolder(null);
      await refresh();
      setMessage(
        'Folder moved to Trash with ' +
          result.filesTrashed +
          ' file' +
          (result.filesTrashed === 1 ? '' : 's') +
          '.',
      );
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not move folder to Trash");
    }
  }

  const uploadBusy =
    uploadProgress != null &&
    ["preparing", "uploading", "paused", "completing"].includes(uploadProgress.state);

  return (
    <div className="page-wrap">
      <header className="page-header">
        <div>
          <p className="eyebrow">{starredOnly ? "Pinned workspace" : "Personal object browser"}</p>
          <h1>{starredOnly ? "Starred" : "My vault"}</h1>
          <p>
            Only files owned by your signed-in account can appear here.
            {!starredOnly && settings
              ? " Upload policy: " + formatCapacity(settings.max_upload_bytes) + " per file."
              : ""}
          </p>
        </div>

        <div className="header-actions">
          {!starredOnly && activeFolderRecord && (
            <button
              className="danger-button compact"
              onClick={() => void moveFolderToTrash(activeFolderRecord)}
              disabled={uploadBusy}
            >
              <Trash2 size={15} /> Move folder to Trash
            </button>
          )}
          {!starredOnly && settings?.folders_enabled !== false && (
            <button className="ghost-button" onClick={newFolder}>
              <FolderPlus size={16} /> New folder
            </button>
          )}
          {!starredOnly && (
            <button
              className="primary-button compact"
              onClick={() => picker.current?.click()}
              disabled={uploadBusy}
            >
              <Upload size={16} /> {uploadBusy ? "Upload active" : "Upload"}
            </button>
          )}
          <input ref={picker} hidden type="file" onChange={upload} />
        </div>
      </header>

      {message && <div className="inline-message">{message}</div>}

      {!starredOnly && settings && !settings.r2_enabled && (
        <div className="provider-notice">
          <span>
            <strong>1.5 GiB policy is configured.</strong>
            Large-file R2 credentials are not connected yet, so the active hosted provider
            currently accepts direct files up to{" "}
            {formatCapacity(settings.supabase_direct_upload_max_bytes)}.
          </span>
        </div>
      )}

      {!starredOnly && settings?.folders_enabled !== false && (
        <div className="vault-breadcrumb">
          <button className={!activeFolder ? "active" : ""} onClick={() => setActiveFolder(null)}>
            My vault
          </button>
          {activeFolderRecord && (
            <>
              <ChevronRight size={13} />
              <span>{activeFolderRecord.name}</span>
            </>
          )}
        </div>
      )}

      {!starredOnly && settings?.folders_enabled !== false && visibleFolders.length > 0 && (
        <section className="folder-strip">
          {visibleFolders.map((folder) => (
            <div className="folder-chip-shell" key={folder.id}>
              <button
                className="folder-chip folder-open"
                onClick={() => setActiveFolder(folder.id)}
              >
                <Folder size={16} />
                <span>{folder.name}</span>
              </button>
              <button
                className="folder-trash-button"
                aria-label={"Move " + folder.name + " to Trash"}
                title="Move folder to Trash"
                onClick={() => void moveFolderToTrash(folder)}
                disabled={uploadBusy}
              >
                <Trash2 size={13} />
                <span>Trash</span>
              </button>
            </div>
          ))}
        </section>
      )}

      <section className="table-card">
        <div className="section-head">
          <div>
            <p className="eyebrow">{activeFolderRecord ? activeFolderRecord.name : "Files"}</p>
            <h2>{files.length} objects</h2>
          </div>
          <div className="view-toggle">
            <button
              aria-label="List view"
              className={view === "list" ? "active" : ""}
              onClick={() => setView("list")}
            >
              <List size={16} />
            </button>
            <button
              aria-label="Grid view"
              className={view === "grid" ? "active" : ""}
              onClick={() => setView("grid")}
            >
              <Grid2X2 size={16} />
            </button>
          </div>
        </div>

        <div className={view === "grid" ? "file-grid" : "file-list"}>
          {files.map((file) => (
            <div className={view === "grid" ? "file-tile" : "file-row"} key={file.id}>
              <button className="file-glyph" onClick={() => setSelectedFile(file)}>
                {file.name.slice(0, 1).toUpperCase()}
              </button>
              <button className="file-main file-open" onClick={() => setSelectedFile(file)}>
                <strong>{file.name}</strong>
                <span>
                  {bytes(file.size_bytes)} · v{file.current_version}
                  {file.storage_provider === "r2" ? " · R2" : ""}
                </span>
              </button>
              <span className={"status-pill " + file.status}>{file.status}</span>
              <FileActions file={file} onChange={() => void refresh()} onMessage={setMessage} />
            </div>
          ))}

          {files.length === 0 && (
            <div className="empty-state">
              {starredOnly
                ? "No starred files yet."
                : activeFolderRecord
                  ? "This folder is empty."
                  : "Your vault is empty. Upload the first file."}
            </div>
          )}
        </div>
      </section>

      {selectedFile && (
        <FileInspector
          file={selectedFile}
          onClose={() => setSelectedFile(null)}
          onChanged={() => void refresh()}
          onMessage={setMessage}
        />
      )}

      {uploadTask && uploadProgress && (
        <UploadDock
          fileName={uploadName}
          progress={uploadProgress}
          task={uploadTask}
        />
      )}
    </div>
  );
}
