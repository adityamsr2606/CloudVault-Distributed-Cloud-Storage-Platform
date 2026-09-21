import { Link2, X } from "lucide-react";
import { FormEvent, useEffect, useState } from "react";
import { createPortal } from "react-dom";

import { getProductSettings, type ProductSettings } from "../config/product";
import { VaultFile, createShareLink } from "../lib/cloudvault";

export default function ShareDialog({
  file,
  onClose,
  onMessage,
}: {
  file: VaultFile;
  onClose: () => void;
  onMessage: (message: string) => void;
}) {
  const [settings, setSettings] = useState<ProductSettings | null>(null);
  const [expiresHours, setExpiresHours] = useState(24);
  const [maxUses, setMaxUses] = useState(25);
  const [unlimitedUses, setUnlimitedUses] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    void getProductSettings().then((next) => {
      setSettings(next);
      setExpiresHours(next.default_share_expiry_hours);
      setMaxUses(next.default_share_max_uses);
    });
  }, []);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);

    try {
      const link = await createShareLink(file.id, {
        expiresHours,
        maxUses: unlimitedUses ? null : maxUses,
      });
      await navigator.clipboard.writeText(
        `${window.location.origin}/s/${link.token}`,
      );
      onMessage("Secure share link copied to your clipboard.");
      onClose();
    } catch (error) {
      onMessage(error instanceof Error ? error.message : "Could not create share link");
    } finally {
      setBusy(false);
    }
  }

  return createPortal(
    <div className="dialog-overlay" role="dialog" aria-modal="true" aria-label={`Share ${file.name}`}>
      <button className="dialog-scrim" onClick={onClose} aria-label="Close sharing dialog" />
      <form className="share-dialog" onSubmit={submit}>
        <header>
          <div>
            <p className="eyebrow">Secure sharing</p>
            <h2>{settings?.sharing_enabled === false ? "Sharing disabled" : file.name}</h2>
          </div>
          <button type="button" className="icon-button" onClick={onClose}><X size={16} /></button>
        </header>

        {settings?.sharing_enabled === false ? (
          <p className="dialog-copy">
            This deployment has disabled public share links through product configuration.
          </p>
        ) : (
          <>
            <p className="dialog-copy">
              The public token is stored only as a hash. Downloads resolve to a short-lived signed URL.
            </p>

            <label>
              Expires after
              <div className="field-with-unit">
                <input
                  type="number"
                  min={1}
                  max={settings?.max_share_expiry_hours ?? 168}
                  value={expiresHours}
                  onChange={(event) => setExpiresHours(Number(event.target.value))}
                />
                <span>hours</span>
              </div>
            </label>

            <label>
              Maximum uses
              <div className="field-with-unit">
                <input
                  type="number"
                  min={1}
                  max={settings?.max_share_uses ?? 1000}
                  value={maxUses}
                  disabled={unlimitedUses}
                  onChange={(event) => setMaxUses(Number(event.target.value))}
                />
                <span>downloads</span>
              </div>
            </label>

            <label className="toggle-line">
              <input
                type="checkbox"
                checked={unlimitedUses}
                onChange={(event) => setUnlimitedUses(event.target.checked)}
              />
              <span>No usage cap until expiry</span>
            </label>

            <button className="primary-button" disabled={busy || !settings}>
              <Link2 size={15} /> {busy ? "Creating…" : "Create and copy link"}
            </button>
          </>
        )}
      </form>
    </div>,
    document.body,
  );
}
