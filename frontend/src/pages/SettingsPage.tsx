import { Database, Gauge, LockKeyhole } from "lucide-react";
import { useEffect, useState } from "react";

import { supabase } from "../lib/supabase";

export default function SettingsPage() {
  const [email, setEmail] = useState("");

  useEffect(() => {
    void supabase.auth.getUser().then(({ data }) => setEmail(data.user?.email ?? ""));
  }, []);

  return (
    <div className="page-wrap">
      <header className="page-header"><div><p className="eyebrow">Workspace configuration</p><h1>Settings</h1><p>Account context and production architecture.</p></div></header>
      <section className="settings-grid">
        <article className="settings-card glass-panel"><LockKeyhole size={18}/><div><strong>Identity</strong><p>{email || "Authenticated user"}</p><span>Supabase Auth + RLS</span></div></article>
        <article className="settings-card glass-panel"><Database size={18}/><div><strong>Data region</strong><p>Mumbai · ap-south-1</p><span>Postgres + Storage + pgvector</span></div></article>
        <article className="settings-card glass-panel"><Gauge size={18}/><div><strong>Cost guardrail</strong><p>$0 subscription target</p><span>Free-tier services only</span></div></article>
      </section>
    </div>
  );
}
