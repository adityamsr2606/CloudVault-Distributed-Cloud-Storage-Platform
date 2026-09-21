import { Pause, Play, X } from "lucide-react";
import { useEffect } from "react";

import type { CloudUploadTask, UploadProgress } from "../lib/uploads";

function formatBytes(value: number) {
  if (value < 1024 * 1024) return Math.max(1, Math.round(value / 1024)) + " KB";
  if (value < 1024 * 1024 * 1024) {
    return (value / 1024 / 1024).toFixed(1) + " MB";
  }
  return (value / 1024 / 1024 / 1024).toFixed(2) + " GB";
}

export default function UploadDock({
  fileName,
  progress,
  task,
  onDismiss,
}: {
  fileName: string;
  progress: UploadProgress;
  task: CloudUploadTask;
  onDismiss?: () => void;
}) {
  const active = progress.state === "uploading" || progress.state === "paused";
  const complete = progress.state === "completed";
  const cancelled = progress.state === "cancelled";
  const failed = progress.state === "failed";

  useEffect(() => {
    if ((!complete && !cancelled) || !onDismiss) return;

    const timer = window.setTimeout(onDismiss, 2500);
    return () => window.clearTimeout(timer);
  }, [complete, cancelled, onDismiss]);

  return (
    <aside
      className={
        "upload-dock " +
        (complete ? "complete" : failed ? "failed" : "")
      }
    >
      <div className="upload-dock-head">
        <div>
          <strong>{fileName}</strong>
          <span>
            {progress.provider === "b2"
              ? "Resumable multipart · Backblaze B2"
              : progress.provider !== "supabase"
                ? "Resumable multipart · R2"
                : "Direct upload · Supabase"}
          </span>
        </div>

        {(active || complete || cancelled || failed) && (
          <div className="upload-dock-actions">
            {progress.state === "paused" ? (
              <button aria-label="Resume upload" onClick={() => task.resume()}>
                <Play size={14} />
              </button>
            ) : (
              <button aria-label="Pause upload" onClick={() => task.pause()}>
                <Pause size={14} />
              </button>
            )}
            {active ? (
              <button aria-label="Cancel upload" onClick={() => void task.cancel()}>
                <X size={14} />
              </button>
            ) : (
              <button aria-label="Dismiss upload notification" onClick={onDismiss}>
                <X size={14} />
              </button>
            )}
          </div>
        )}
      </div>

      <div className="upload-progress-track" aria-label={"Upload " + progress.percent + "%"}>
        <span style={{ width: progress.percent + "%" }} />
      </div>

      <div className="upload-progress-meta">
        <span>
          {progress.state === "paused"
            ? "Paused"
            : progress.state === "preparing"
              ? "Preparing"
              : progress.state === "completing"
                ? "Finalizing"
                : progress.state === "failed"
                  ? "Failed"
                  : complete
                    ? "Complete"
                    : "Uploading"}{" "}
          · {progress.percent}%
        </span>
        <span>
          {formatBytes(progress.loadedBytes)} / {formatBytes(progress.totalBytes)}
          {progress.provider !== "supabase" && progress.totalParts > 1
            ? " · " + progress.uploadedParts + "/" + progress.totalParts + " parts"
            : ""}
        </span>
      </div>
    </aside>
  );
}
