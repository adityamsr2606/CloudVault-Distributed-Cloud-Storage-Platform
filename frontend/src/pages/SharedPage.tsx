import { Ban, Copy, Share2 } from "lucide-react";
import { useEffect, useState } from "react";

import { ShareLink, listShareLinks, revokeShareLink } from "../lib/cloudvault";

export default function SharedPage() {
  const [links, setLinks] = useState<ShareLink[]>([]);
  const [message, setMessage] = useState("");

  async function refresh() {
    try { setLinks(await listShareLinks()); } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not load share links");
    }
  }

  useEffect(() => { void refresh(); }, []);

  async function revoke(id: string) {
    try { await revokeShareLink(id); await refresh(); setMessage("Share link revoked."); }
    catch (error) { setMessage(error instanceof Error ? error.message : "Could not revoke link"); }
  }

  return (
    <div className="page-wrap">
      <header className="page-header"><div><p className="eyebrow">External access</p><h1>Shared</h1><p>Expiring, revocable links with usage counters. Raw tokens are never stored.</p></div><div className="ai-badge"><Share2 size={16}/> signed access</div></header>
      {message && <div className="inline-message">{message}</div>}
      <section className="table-card glass-panel">
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
