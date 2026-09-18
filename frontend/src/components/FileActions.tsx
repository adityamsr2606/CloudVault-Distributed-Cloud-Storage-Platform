import { Download, Share2, Star, Trash2 } from "lucide-react";

import {
  VaultFile,
  createShareLink,
  getDownloadUrl,
  softDelete,
  toggleStar,
} from "../lib/cloudvault";

export default function FileActions({
  file,
  onChange,
  onMessage,
}: {
  file: VaultFile;
  onChange: () => void;
  onMessage: (message: string) => void;
}) {
  async function download() {
    try {
      window.open(await getDownloadUrl(file), "_blank", "noopener,noreferrer");
    } catch (error) {
      onMessage(error instanceof Error ? error.message : "Download failed");
    }
  }

  async function share() {
    try {
      const link = await createShareLink(file.id);
      const url = `${window.location.origin}/s/${link.token}`;
      await navigator.clipboard.writeText(url);
      onMessage("Secure 24-hour share link copied.");
    } catch (error) {
      onMessage(error instanceof Error ? error.message : "Share link failed");
    }
  }

  async function star() {
    try {
      await toggleStar(file);
      onChange();
    } catch (error) {
      onMessage(error instanceof Error ? error.message : "Could not update file");
    }
  }

  async function remove() {
    try {
      await softDelete(file.id);
      onChange();
      onMessage("Moved to Trash.");
    } catch (error) {
      onMessage(error instanceof Error ? error.message : "Delete failed");
    }
  }

  return (
    <div className="hover-actions">
      <button aria-label={file.is_starred ? "Unstar file" : "Star file"} onClick={star}>
        <Star size={15} fill={file.is_starred ? "currentColor" : "none"} />
      </button>
      <button aria-label="Download file" onClick={download}><Download size={15} /></button>
      <button aria-label="Create share link" onClick={share}><Share2 size={15} /></button>
      <button aria-label="Move to trash" onClick={remove}><Trash2 size={15} /></button>
    </div>
  );
}
