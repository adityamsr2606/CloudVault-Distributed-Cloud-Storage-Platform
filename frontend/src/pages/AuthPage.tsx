import { FormEvent, useEffect, useState } from "react";
import { Fingerprint, KeyRound, LockKeyhole, Search } from "lucide-react";
import { Navigate, useNavigate } from "react-router-dom";

import CloudVaultLogo from "../components/CloudVaultLogo";
import LiveBackdrop from "../components/LiveBackdrop";
import ThemeSwitcher from "../components/ThemeSwitcher";
import { getProductSettings, type ProductSettings } from "../config/product";
import { supabase } from "../lib/supabase";

export default function AuthPage({ sessionReady }: { sessionReady: boolean }) {
  const navigate = useNavigate();
  const [mode, setMode] = useState<"login" | "register">("login");
  const [settings, setSettings] = useState<ProductSettings | null>(null);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    void getProductSettings().then(setSettings).catch(() => setSettings(null));
  }, []);

  if (sessionReady) return <Navigate to="/app" replace />;

  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setMessage("");

    try {
      if (mode === "login") {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        navigate("/app");
      } else {
        const { data, error } = await supabase.auth.signUp({ email, password });
        if (error) throw error;
        if (data.session) navigate("/app");
        else setMessage("Account created. Check your email if confirmation is enabled.");
      }
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Authentication failed");
    } finally {
      setBusy(false);
    }
  }

  async function signInWithPasskey() {
    setBusy(true);
    setMessage("");

    try {
      const { error } = await supabase.auth.signInWithPasskey();
      if (error) throw error;
      navigate("/app");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Passkey sign-in failed");
    } finally {
      setBusy(false);
    }
  }

  async function resetPassword() {
    if (!email) {
      setMessage("Enter your email first.");
      return;
    }

    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: window.location.origin + "/reset-password",
    });
    setMessage(error ? error.message : "Password reset email sent.");
  }

  return (
    <div className="auth-page">
      <LiveBackdrop />

      <div className="auth-theme">
        <ThemeSwitcher compact />
      </div>

      <section className="auth-showcase">
        <CloudVaultLogo />

        <div className="auth-copy">
          <p className="eyebrow">Private cloud storage · personal AI retrieval</p>
          <h1>Keep the files. Find the meaning.</h1>
          <p>
            CloudVault is a private workspace for your own files: encrypted transport,
            database-enforced ownership, versioned storage, expiring shares, hybrid search,
            and optional grounded AI that respects your account boundary.
          </p>
        </div>

        <div className="auth-capabilities">
          <div>
            <span><Fingerprint size={17} /></span>
            <strong>Identity isolated</strong>
            <small>Every row, vector and object path is scoped to its owner.</small>
          </div>
          <div>
            <span><Search size={17} /></span>
            <strong>Hybrid retrieval</strong>
            <small>Meaning-aware and lexical search work together inside your vault.</small>
          </div>
          <div>
            <span><LockKeyhole size={17} /></span>
            <strong>Private sharing</strong>
            <small>Revocable links resolve to short-lived signed object URLs.</small>
          </div>
        </div>
      </section>

      <section className="auth-card">
        <div className="auth-card-top">
          <p className="eyebrow">{mode === "login" ? "Private workspace" : "Your own vault"}</p>
          <h2>{mode === "login" ? "Welcome back" : "Create your CloudVault"}</h2>
          <p>
            {mode === "login"
              ? "Your account opens only your files and activity."
              : "A new account starts with an empty, isolated workspace."}
          </p>
        </div>

        {mode === "login" && settings?.passkeys_enabled && (
          <>
            <button
              className="passkey-button"
              type="button"
              disabled={busy}
              onClick={() => void signInWithPasskey()}
            >
              <Fingerprint size={16} />
              Sign in with a passkey
            </button>
            <div className="auth-divider"><span>or use email</span></div>
          </>
        )}

        <form onSubmit={submit} className="auth-form">
          <label>
            Email
            <input
              required
              autoComplete="email"
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="you@example.com"
            />
          </label>
          <label>
            Password
            <input
              required
              minLength={8}
              autoComplete={mode === "login" ? "current-password" : "new-password"}
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              placeholder="At least 8 characters"
            />
          </label>

          {message && <div className="inline-message">{message}</div>}

          <button className="primary-button auth-submit" disabled={busy}>
            {busy ? "Working…" : mode === "login" ? "Open my vault" : "Create private vault"}
          </button>
        </form>

        <div className="auth-links">
          <button
            className="text-button"
            onClick={() => setMode(mode === "login" ? "register" : "login")}
          >
            {mode === "login" ? "Create an account" : "I already have an account"}
          </button>
          {mode === "login" && (
            <button className="text-button" onClick={resetPassword}>
              <KeyRound size={13} /> Forgot password?
            </button>
          )}
        </div>

        <p className="auth-privacy-footnote">
          CloudVault is personal storage. Other signed-in users cannot browse, search,
          download, or list your private files.
        </p>
      </section>
    </div>
  );
}
