import { Ban, Copy, Share2 } from "lucide-react";
import { useCallback, useEffect, useState } from "react";

import { useRealtimeRefresh } from "../hooks/useRealtimeRefresh";
import { ShareLink, listShareLinks, revokeShareLink } from "../lib/cloudvault";

export default function SharedPage() {
  const [links, setLinks] = useState<ShareLink[]>([]);
  const [message, setMessage] = useState("");

  const refresh = useCallback(async () => {
    try {
      setLinks(await listShareLinks());
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not load share links");
    }
  }, []);

  useEffect(() => { void refresh(); }, [refresh]);
  useRealtimeRefresh(["share_links"], refresh);

  async function revoke(id: string) {
    try {
      await revokeShareLink(id);
      setMessage("Share link revoked.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not revoke link");
    }
  }

  return (
    <div className="page-wrap">
      <header className="page-header">
        <div><p className="eyebrow">External access</p><h1>Shared</h1><p>Live usage counters, expiry, and revocation state for every public link you created.</p></div>
        <div className="ai-badge"><Share2 size={16}/> realtime access state</div>
      </header>
      {message && <div className="inline-message">{message}</div>}
      <section className="table-card">
        <div className="file-list">
          {links.map((link) => (
            <div className="file-row" key={link.id}>
              <div className="file-glyph"><Share2 size={16}/></div>
              <div className="file-main"><strong>{link.vault_files?.name ?? "Shared file"}</strong><span>{link.use_count}{link.max_uses ? ` / ${link.max_uses}` : ""} uses · expires {new Date(link.expires_at).toLocaleString()}</span></div>
              <span className={`status-pill ${link.revoked_at ? "failed" : "ready"}`}>{link.revoked_at ? "revoked" : "active"}</span>
              {!link.revoked_at && <button className="ghost-button compact" onClick={() => void revoke(link.id)}><Ban size={15}/> Revoke</button>}
            </div>
          ))}
          {links.length === 0 && <div className="empty-state"><Copy size={18}/> Create a link from a file’s hover actions.</div>}
        </div>
      </section>
    </div>
  );
}
