import { Download, History, RefreshCcw, X } from "lucide-react";
import { ChangeEvent, useEffect, useRef, useState } from "react";

import {
  FileVersion,
  RelatedFile,
  VaultFile,
  getVersionDownloadUrl,
  listFileVersions,
  relatedFiles,
  replaceVaultFile,
} from "../lib/cloudvault";

function formatBytes(value: number) {
  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) return `${Math.round(value / 1024)} KB`;
  return `${(value / 1024 / 1024).toFixed(1)} MB`;
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
  const picker = useRef<HTMLInputElement>(null);

  useEffect(() => {
    void Promise.all([listFileVersions(file.id), relatedFiles(file.id)])
      .then(([nextVersions, nextRelated]) => {
        setVersions(nextVersions);
        setRelated(nextRelated);
      })
      .catch((error) => onMessage(error instanceof Error ? error.message : "Could not load file intelligence"));
  }, [file.id, onMessage]);

  async function replace(event: ChangeEvent<HTMLInputElement>) {
    const replacement = event.target.files?.[0];
    if (!replacement) return;

    setBusy(true);
    try {
      await replaceVaultFile(file, replacement);
      onMessage(`Uploaded version ${file.current_version + 1}.`);
      onChanged();
      onClose();
    } catch (error) {
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

  return (
    <div className="inspector-overlay" role="dialog" aria-modal="true" aria-label={`${file.name} details`}>
      <button className="inspector-scrim" aria-label="Close file details" onClick={onClose} />
      <aside className="file-inspector">
        <header>
          <div>
            <p className="eyebrow">File details</p>
            <h2>{file.name}</h2>
            <span>{file.mime_type} · {formatBytes(file.size_bytes)}</span>
          </div>
          <button className="icon-button" onClick={onClose}><X size={17} /></button>
        </header>

        <section className="inspector-summary">
          <div><span>Current version</span><strong>v{file.current_version}</strong></div>
          <div><span>AI status</span><strong className="capitalize">{file.status}</strong></div>
          <div><span>Added</span><strong>{new Date(file.created_at).toLocaleDateString()}</strong></div>
        </section>

        <button className="primary-button inspector-replace" disabled={busy} onClick={() => picker.current?.click()}>
          <RefreshCcw size={15} /> {busy ? "Uploading…" : "Upload new version"}
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
              <button key={version.id} className="version-row" onClick={() => void download(version)}>
                <span><strong>v{version.version_number}</strong><small>{new Date(version.created_at).toLocaleString()}</small></span>
                <span>{formatBytes(version.size_bytes)} <Download size={13} /></span>
              </button>
            ))}
          </div>
        </section>
      </aside>
    </div>
  );
}
