import {
  BrainCircuit,
  Cloud,
  Database,
  Fingerprint,
  Gauge,
  Palette,
  Share2,
} from "lucide-react";
import { useCallback, useEffect, useState } from "react";

import SecurityPanel from "../components/SecurityPanel";
import ThemeSwitcher from "../components/ThemeSwitcher";
import {
  formatCapacity,
  getProductSettings,
  type ProductSettings,
} from "../config/product";
import { useRealtimeRefresh } from "../hooks/useRealtimeRefresh";
import { supabase } from "../lib/supabase";

export default function SettingsPage() {
  const [email, setEmail] = useState("");
  const [settings, setSettings] = useState<ProductSettings | null>(null);
  const [message, setMessage] = useState("");

  const refresh = useCallback(async () => {
    const [user, product] = await Promise.all([
      supabase.auth.getUser(),
      getProductSettings({ force: true }),
    ]);
    setEmail(user.data.user?.email ?? "");
    setSettings(product);
  }, []);

  useEffect(() => {
    void refresh().catch((error) => {
      setMessage(error instanceof Error ? error.message : "Could not load settings");
    });
  }, [refresh]);

  useRealtimeRefresh(["product_settings"], refresh);

  return (
    <div className="page-wrap">
      <header className="page-header">
        <div>
          <p className="eyebrow">Live workspace configuration</p>
          <h1>Settings</h1>
          <p>
            Appearance, identity security, storage-provider policy, retrieval controls and
            privacy boundaries.
          </p>
        </div>
      </header>

      {message && <div className="inline-message">{message}</div>}

      <section className="settings-grid settings-grid-wide">
        <article className="settings-card appearance-card">
          <Palette size={18} />
          <div>
            <strong>Appearance</strong>
            <p>Light, dark, or system.</p>
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
            <p>{settings?.data_region_label ?? "Loading…"}</p>
            <span>Postgres + Realtime + pgvector + private metadata</span>
          </div>
        </article>

        <article className="settings-card">
          <Gauge size={18} />
          <div>
            <strong>Product upload ceiling</strong>
            <p>{settings ? formatCapacity(settings.max_upload_bytes) : "Loading…"}</p>
            <span>
              Large objects use the configured multipart provider; AI extraction has its own
              smaller independent limit.
            </span>
          </div>
        </article>

        <article className="settings-card">
          <Cloud size={18} />
          <div>
            <strong>Large-file provider</strong>
            <p>
              {settings?.large_upload_provider === "b2"
                ? settings.b2_enabled
                  ? "Backblaze B2 ready"
                  : "Backblaze B2 integration ready · credentials not connected"
                : settings?.r2_enabled
                  ? "Cloudflare R2 ready"
                  : "Large-object provider not connected"}
            </p>
            <span>
              Supabase direct limit:{" "}
              {settings ? formatCapacity(settings.supabase_direct_upload_max_bytes) : "—"} ·
              multipart parts:{" "}
              {settings ? formatCapacity(settings.multipart_part_size_bytes) : "—"}
            </span>
          </div>
        </article>

        <article className="settings-card">
          <BrainCircuit size={18} />
          <div>
            <strong>CloudVault Intelligence</strong>
            <p>{settings?.ai_enabled ? "Hybrid retrieval enabled" : "Disabled"}</p>
            <span>
              Vector weight {settings ? Math.round(settings.hybrid_semantic_weight * 100) : "—"}%
              {" · "}lexical weight{" "}
              {settings ? Math.round(settings.hybrid_lexical_weight * 100) : "—"}%
            </span>
          </div>
        </article>

        <article className="settings-card">
          <Share2 size={18} />
          <div>
            <strong>Grounded generation</strong>
            <p>
              {settings?.generative_ai_enabled
                ? settings.generative_ai_model
                : "Retrieval-only by default"}
            </p>
            <span>
              Gemini remains separate from storage/search and requires explicit per-user consent.
            </span>
          </div>
        </article>
      </section>

      <SecurityPanel settings={settings} onMessage={setMessage} />

      <section className="privacy-explainer">
        <div>
          <p className="eyebrow">Isolation model</p>
          <h2>Your account is the security boundary.</h2>
        </div>
        <p>
          File metadata, folders, versions, activity events, vector chunks, upload sessions,
          and private object keys are owner-scoped. Public access exists only when you
          deliberately create a temporary share token for a specific file.
        </p>
      </section>
    </div>
  );
}
