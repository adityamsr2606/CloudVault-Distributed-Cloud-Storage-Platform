import { Database, Fingerprint, Gauge, Palette } from "lucide-react";
import { useEffect, useState } from "react";

import ThemeSwitcher from "../components/ThemeSwitcher";
import { supabase } from "../lib/supabase";

export default function SettingsPage() {
  const [email, setEmail] = useState("");

  useEffect(() => {
    void supabase.auth.getUser().then(({ data }) => setEmail(data.user?.email ?? ""));
  }, []);

  return (
    <div className="page-wrap">
      <header className="page-header">
        <div>
          <p className="eyebrow">Workspace configuration</p>
          <h1>Settings</h1>
          <p>Appearance, account isolation, infrastructure, and cost guardrails.</p>
        </div>
      </header>

      <section className="settings-grid settings-grid-wide">
        <article className="settings-card appearance-card">
          <Palette size={18} />
          <div>
            <strong>Appearance</strong>
            <p>Choose the interface that fits your environment.</p>
            <ThemeSwitcher />
          </div>
        </article>

        <article className="settings-card">
          <Fingerprint size={18} />
          <div>
            <strong>Personal identity</strong>
            <p>{email || "Authenticated user"}</p>
            <span>Supabase Auth + owner-based RLS + private object paths</span>
          </div>
        </article>

        <article className="settings-card">
          <Database size={18} />
          <div>
            <strong>Data region</strong>
            <p>Mumbai · ap-south-1</p>
            <span>Postgres + private Storage + pgvector</span>
          </div>
        </article>

        <article className="settings-card">
          <Gauge size={18} />
          <div>
            <strong>Cost guardrail</strong>
            <p>$0 subscription target</p>
            <span>Free-tier managed services and open-source local stack</span>
          </div>
        </article>
      </section>

      <section className="privacy-explainer">
        <div>
          <p className="eyebrow">Isolation model</p>
          <h2>Your account is the security boundary.</h2>
        </div>
        <p>
          File metadata, folders, versions, activity events, vector chunks, and Storage
          objects are protected by owner-aware database or Storage policies. Public access
          only exists when you deliberately create a temporary share token for a specific file.
        </p>
      </section>
    </div>
  );
}
