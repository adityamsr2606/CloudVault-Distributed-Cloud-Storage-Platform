import { BrainCircuit, Database, Fingerprint, Gauge, Palette, Share2 } from "lucide-react";
import { useCallback, useEffect, useState } from "react";

import ThemeSwitcher from "../components/ThemeSwitcher";
import { getProductSettings, type ProductSettings } from "../config/product";
import { useRealtimeRefresh } from "../hooks/useRealtimeRefresh";
import { supabase } from "../lib/supabase";

function mb(bytes: number) {
  return `${Math.round(bytes / 1024 / 1024)} MB`;
}

export default function SettingsPage() {
  const [email, setEmail] = useState("");
  const [settings, setSettings] = useState<ProductSettings | null>(null);

  const refresh = useCallback(async () => {
    const [user, product] = await Promise.all([
      supabase.auth.getUser(),
      getProductSettings({ force: true }),
    ]);
    setEmail(user.data.user?.email ?? "");
    setSettings(product);
  }, []);

  useEffect(() => { void refresh(); }, [refresh]);
  useRealtimeRefresh(["product_settings"], refresh);

  return (
    <div className="page-wrap">
      <header className="page-header">
        <div>
          <p className="eyebrow">Live workspace configuration</p>
          <h1>Settings</h1>
          <p>Appearance, identity boundary, feature policy, and deployment limits.</p>
        </div>
      </header>

      <section className="settings-grid settings-grid-wide">
        <article className="settings-card appearance-card">
          <Palette size={18} />
          <div><strong>Appearance</strong><p>Light, dark, or system.</p><ThemeSwitcher /></div>
        </article>

        <article className="settings-card">
          <Fingerprint size={18} />
          <div><strong>Personal identity</strong><p>{email || "Authenticated user"}</p><span>Supabase Auth + owner-based RLS + private object paths</span></div>
        </article>

        <article className="settings-card">
          <Database size={18} />
          <div><strong>Data region</strong><p>{settings?.data_region_label ?? "Loading…"}</p><span>Postgres + private Storage + pgvector</span></div>
        </article>

        <article className="settings-card">
          <Gauge size={18} />
          <div><strong>Upload policy</strong><p>{settings ? mb(settings.max_upload_bytes) : "Loading…"}</p><span>Storage bucket limit follows the live product configuration</span></div>
        </article>

        <article className="settings-card">
          <BrainCircuit size={18} />
          <div><strong>Private intelligence</strong><p>{settings?.ai_enabled ? "Enabled" : "Disabled"}</p><span>Semantic search limit: {settings?.semantic_search_limit ?? "—"} results</span></div>
        </article>

        <article className="settings-card">
          <Share2 size={18} />
          <div><strong>Sharing</strong><p>{settings?.sharing_enabled ? "Enabled" : "Disabled"}</p><span>Default expiry: {settings?.default_share_expiry_hours ?? "—"} hours · default uses: {settings?.default_share_max_uses ?? "—"}</span></div>
        </article>
      </section>

      <section className="privacy-explainer">
        <div><p className="eyebrow">Isolation model</p><h2>Your account is the security boundary.</h2></div>
        <p>
          File metadata, folders, versions, activity events, vector chunks, and Storage
          objects are protected by owner-aware database or Storage policies. Public access
          only exists when you deliberately create a temporary share token for a specific file.
        </p>
      </section>
    </div>
  );
}
