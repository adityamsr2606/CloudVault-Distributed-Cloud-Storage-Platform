import {
  ArrowRight,
  Fingerprint,
  Layers3,
  LockKeyhole,
  Search,
  ShieldCheck,
  Sparkles,
} from "lucide-react";
import { Link } from "react-router-dom";

import CloudVaultLogo from "../components/CloudVaultLogo";
import LiveBackdrop from "../components/LiveBackdrop";
import ThemeSwitcher from "../components/ThemeSwitcher";

const features = [
  [Fingerprint, "Personal by default", "Every account gets an isolated metadata, storage, activity, and search boundary."],
  [Search, "Meaning-aware retrieval", "Find documents by intent using private embeddings and owner-scoped vector search."],
  [Layers3, "Versioned file history", "Replace files without overwriting history; inspect and download earlier versions."],
  [LockKeyhole, "Controlled sharing", "Explicit, expiring, revocable links resolve to short-lived signed object URLs."],
] as const;

export default function LandingPage() {
  return (
    <div className="landing-page">
      <LiveBackdrop />

      <header className="landing-nav">
        <CloudVaultLogo />
        <div className="landing-nav-actions">
          <ThemeSwitcher compact />
          <Link className="ghost-button compact" to="/auth">Sign in</Link>
          <Link className="primary-button compact" to="/auth">Create vault</Link>
        </div>
      </header>

      <main>
        <section className="landing-hero">
          <div className="landing-hero-copy">
            <p className="eyebrow">Personal cloud storage with private intelligence</p>
            <h1>Your files stay yours. Your search gets smarter.</h1>
            <p>
              CloudVault combines private object storage, file history, secure sharing,
              and semantic retrieval in a workspace designed around one rule:
              an authenticated user can only discover what they are allowed to access.
            </p>
            <div className="landing-cta">
              <Link className="primary-button" to="/auth">Open CloudVault <ArrowRight size={15} /></Link>
              <a className="ghost-button" href="#security">How privacy works</a>
            </div>
          </div>

          <div className="landing-vault-visual" aria-hidden="true">
            <div className="vault-orbit orbit-one" />
            <div className="vault-orbit orbit-two" />
            <div className="vault-core">
              <CloudVaultLogo compact />
            </div>
            <div className="floating-chip chip-search"><Search size={14} /> semantic search</div>
            <div className="floating-chip chip-lock"><ShieldCheck size={14} /> owner scoped</div>
            <div className="floating-chip chip-ai"><Sparkles size={14} /> private AI</div>
          </div>
        </section>

        <section className="landing-feature-grid">
          {features.map(([Icon, title, description]) => (
            <article key={title}>
              <span><Icon size={17} /></span>
              <h2>{title}</h2>
              <p>{description}</p>
            </article>
          ))}
        </section>

        <section className="landing-security" id="security">
          <div>
            <p className="eyebrow">Security model</p>
            <h2>Privacy is enforced below the interface.</h2>
          </div>
          <div className="landing-security-copy">
            <p>
              CloudVault does not rely on hiding buttons or filtering rows in React.
              Database row-level security limits files, folders, versions, activity,
              vector chunks, and share records to the signed-in owner.
            </p>
            <p>
              Storage paths are also owner scoped. Public access exists only when the
              owner deliberately creates a temporary share token for one file.
            </p>
          </div>
        </section>

        <footer className="landing-footer">
          <CloudVaultLogo compact />
          <span>Built around private ownership, measurable retrieval, and explicit sharing.</span>
        </footer>
      </main>
    </div>
  );
}
