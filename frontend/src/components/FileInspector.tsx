import { Download, History, RefreshCcw, RotateCcw, X } from "lucide-react";
import { ChangeEvent, useEffect, useRef, useState } from "react";

import {
  FileVersion,
  RelatedFile,
  VaultFile,
  getVersionDownloadUrl,
  listFileVersions,
  relatedFiles,
  restoreFileVersion,
} from "../lib/cloudvault";
import {
  CloudUploadTask,
  UploadProgress,
  startVaultReplacement,
} from "../lib/uploads";
import UploadDock from "./UploadDock";

function formatBytes(value: number) {
  if (value < 1024) return value + " B";
  if (value < 1024 * 1024) return Math.round(value / 1024) + " KB";
  if (value < 1024 * 1024 * 1024) {
    return (value / 1024 / 1024).toFixed(1) + " MB";
  }
  return (value / 1024 / 1024 / 1024).toFixed(2) + " GB";
}

export default function FileInspector({
  file,
  onClose,
  onChanged,
  onMessage,
}: {
  file: VaultFile;
  onClose: () => void;
  onChanged: () => void;
  onMessage: (message: string) => void;
}) {
  const [versions, setVersions] = useState<FileVersion[]>([]);
  const [related, setRelated] = useState<RelatedFile[]>([]);
  const [busy, setBusy] = useState(false);
  const [uploadTask, setUploadTask] = useState<CloudUploadTask | null>(null);
  const [uploadProgress, setUploadProgress] = useState<UploadProgress | null>(null);
  const [uploadName, setUploadName] = useState("");
  const picker = useRef<HTMLInputElement>(null);

  useEffect(() => {
    void listFileVersions(file.id)
      .then(setVersions)
      .catch((error) => {
        onMessage(error instanceof Error ? error.message : "Could not load version history");
      });

    void relatedFiles(file.id)
      .then(setRelated)
      .catch(() => {
        // Related-file suggestions are optional. A retrieval failure should not
        // block file details, sharing, downloads, or version history.
        setRelated([]);
      });
  }, [file.id, onMessage]);

  async function replace(event: ChangeEvent<HTMLInputElement>) {
    const replacement = event.target.files?.[0];
    if (!replacement) return;

    setBusy(true);
    setUploadName(replacement.name);

    const task = startVaultReplacement(replacement, file, setUploadProgress);
    setUploadTask(task);

    try {
      await task.completion;
      onMessage("Uploaded version " + (file.current_version + 1) + ".");
      onChanged();
      onClose();
    } catch (error) {
      setUploadProgress((current) =>
        current ? { ...current, state: "failed" } : current,
      );
      onMessage(error instanceof Error ? error.message : "Could not upload new version");
    } finally {
      setBusy(false);
      event.target.value = "";
    }
  }

  async function download(version: FileVersion) {
    try {
      window.open(await getVersionDownloadUrl(version), "_blank", "noopener,noreferrer");
    } catch (error) {
      onMessage(error instanceof Error ? error.message : "Download failed");
    }
  }

  async function restore(version: FileVersion) {
    if (version.version_number === file.current_version) return;
    setBusy(true);
    try {
      await restoreFileVersion(file, version);
      onMessage("Restored v" + version.version_number + " as a new current version.");
      onChanged();
      onClose();
    } catch (error) {
      onMessage(error instanceof Error ? error.message : "Could not restore version");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="inspector-overlay" role="dialog" aria-modal="true" aria-label={file.name + " details"}>
      <button className="inspector-scrim" aria-label="Close file details" onClick={onClose} />
      <aside className="file-inspector">
        <header>
          <div>
            <p className="eyebrow">File details</p>
            <h2>{file.name}</h2>
            <span>
              {file.mime_type} · {formatBytes(file.size_bytes)}
              {file.storage_provider === "r2" ? " · R2" : ""}
            </span>
          </div>
          <button className="icon-button" onClick={onClose}><X size={17} /></button>
        </header>

        <section className="inspector-summary">
          <div><span>Current version</span><strong>v{file.current_version}</strong></div>
          <div><span>AI status</span><strong className="capitalize">{file.status}</strong></div>
          <div><span>Storage</span><strong>{file.storage_provider.toUpperCase()}</strong></div>
        </section>

        <button
          className="primary-button inspector-replace"
          disabled={busy}
          onClick={() => picker.current?.click()}
        >
          <RefreshCcw size={15} /> {busy ? "Working…" : "Upload new version"}
        </button>
        <input ref={picker} hidden type="file" onChange={replace} />

        {related.length > 0 && (
          <section className="related-section">
            <div className="version-title"><History size={15} /><strong>Related in your vault</strong></div>
            <div className="related-list">
              {related.map((item) => (
                <div key={item.file_id} className="related-row">
                  <span><strong>{item.name}</strong><small>Semantic similarity</small></span>
                  <em>{Math.round(Math.max(0, item.similarity) * 100)}%</em>
                </div>
              ))}
            </div>
          </section>
        )}

        <section className="version-section">
          <div className="version-title"><History size={15} /><strong>Version history</strong></div>
          <div className="version-list">
            {versions.map((version) => (
              <div key={version.id} className="version-row">
                <span>
                  <strong>v{version.version_number}</strong>
                  <small>
                    {new Date(version.created_at).toLocaleString()} ·{" "}
                    {version.storage_provider.toUpperCase()}
                  </small>
                </span>
                <div className="version-actions">
                  <span>{formatBytes(version.size_bytes)}</span>
                  <button aria-label="Download version" onClick={() => void download(version)}>
                    <Download size={13} />
                  </button>
                  {version.version_number !== file.current_version && (
                    <button
                      aria-label="Restore version"
                      disabled={busy}
                      onClick={() => void restore(version)}
                    >
                      <RotateCcw size={13} />
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </section>
      </aside>

      {uploadTask && uploadProgress && (
        <UploadDock fileName={uploadName} progress={uploadProgress} task={uploadTask} />
      )}
    </div>
  );
}
