import { Folder, RotateCcw, Trash2 } from "lucide-react";
import { useCallback, useEffect, useState } from "react";

import { useRealtimeRefresh } from "../hooks/useRealtimeRefresh";
import {
  VaultFile,
  VaultFolder,
  listTrash,
  listTrashFolders,
  purgeFile,
  purgeFolder,
  restoreFile,
  restoreFolder,
} from "../lib/cloudvault";

export default function TrashPage() {
  const [files, setFiles] = useState<VaultFile[]>([]);
  const [folders, setFolders] = useState<VaultFolder[]>([]);
  const [message, setMessage] = useState("");

  const refresh = useCallback(async () => {
    try {
      const [nextFiles, nextFolders] = await Promise.all([
        listTrash(),
        listTrashFolders(),
      ]);
      setFiles(nextFiles);
      setFolders(nextFolders);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not load trash");
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useRealtimeRefresh(["vault_files", "vault_folders"], refresh);

  async function restoreFileItem(id: string) {
    try {
      await restoreFile(id);
      setMessage("File restored.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Restore failed");
    }
  }

  async function purgeFileItem(file: VaultFile) {
    if (
      !window.confirm(
        'Permanently delete "' +
          file.name +
          '" and every stored version? This cannot be undone.',
      )
    ) {
      return;
    }

    try {
      await purgeFile(file.id);
      setMessage("File and all stored versions permanently deleted.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Permanent delete failed");
    }
  }

  async function restoreFolderItem(folder: VaultFolder) {
    try {
      const result = await restoreFolder(folder.id);
      setMessage(
        'Restored "' +
          folder.name +
          '" with ' +
          result.filesRestored +
          ' file' +
          (result.filesRestored === 1 ? "" : "s") +
          ".",
      );
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Folder restore failed");
    }
  }

  async function purgeFolderItem(folder: VaultFolder) {
    if (
      !window.confirm(
        'Permanently delete "' +
          folder.name +
          '" and all files/subfolders that were moved to Trash with it? ' +
          "This cannot be undone.",
      )
    ) {
      return;
    }

    try {
      const result = await purgeFolder(folder.id);
      setMessage(
        'Permanently deleted "' +
          folder.name +
          '" and ' +
          Number(result.files_deleted ?? 0) +
          ' file' +
          (Number(result.files_deleted ?? 0) === 1 ? "" : "s") +
          ".",
      );
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Folder purge failed");
    }
  }

  return (
    <div className="page-wrap">
      <header className="page-header">
        <div>
          <p className="eyebrow">Recovery</p>
          <h1>Trash</h1>
          <p>
            Restore folders as complete units, restore individual files, or permanently
            delete storage objects and version history.
          </p>
        </div>
      </header>

      {message && <div className="inline-message">{message}</div>}

      {folders.length > 0 && (
        <section className="table-card">
          <div className="section-head">
            <div>
              <p className="eyebrow">Folders</p>
              <h2>{folders.length} trashed folder{folders.length === 1 ? "" : "s"}</h2>
            </div>
          </div>

          <div className="file-list">
            {folders.map((folder) => (
              <div className="file-row" key={folder.id}>
                <div className="file-glyph">
                  <Folder size={16} />
                </div>
                <div className="file-main">
                  <strong>{folder.name}</strong>
                  <span>
                    Deleted{" "}
                    {folder.deleted_at
                      ? new Date(folder.deleted_at).toLocaleString()
                      : ""}
                  </span>
                </div>
                <div className="trash-actions">
                  <button
                    className="ghost-button compact"
                    onClick={() => void restoreFolderItem(folder)}
                  >
                    <RotateCcw size={15} /> Restore folder
                  </button>
                  <button
                    className="danger-button compact"
                    onClick={() => void purgeFolderItem(folder)}
                  >
                    <Trash2 size={15} /> Delete forever
                  </button>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      <section className="table-card">
        <div className="section-head">
          <div>
            <p className="eyebrow">Files</p>
            <h2>{files.length} trashed file{files.length === 1 ? "" : "s"}</h2>
          </div>
        </div>

        <div className="file-list">
          {files.map((file) => (
            <div className="file-row" key={file.id}>
              <div className="file-glyph">{file.name.slice(0, 1).toUpperCase()}</div>
              <div className="file-main">
                <strong>{file.name}</strong>
                <span>
                  Deleted{" "}
                  {file.deleted_at
                    ? new Date(file.deleted_at).toLocaleString()
                    : ""}
                </span>
              </div>
              <div className="trash-actions">
                <button
                  className="ghost-button compact"
                  onClick={() => void restoreFileItem(file.id)}
                >
                  <RotateCcw size={15} /> Restore
                </button>
                <button
                  className="danger-button compact"
                  onClick={() => void purgeFileItem(file)}
                >
                  <Trash2 size={15} /> Delete forever
                </button>
              </div>
            </div>
          ))}

          {files.length === 0 && folders.length === 0 && (
            <div className="empty-state">Trash is empty.</div>
          )}
        </div>
      </section>
    </div>
  );
}
