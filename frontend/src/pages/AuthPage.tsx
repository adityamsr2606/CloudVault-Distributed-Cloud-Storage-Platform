import { FormEvent, useState } from "react";
import { Cloud, KeyRound, ShieldCheck } from "lucide-react";
import { Navigate, useNavigate } from "react-router-dom";

import LiveBackdrop from "../components/LiveBackdrop";
import { supabase } from "../lib/supabase";

export default function AuthPage({ sessionReady }: { sessionReady: boolean }) {
  const navigate = useNavigate();
  const [mode, setMode] = useState<"login" | "register">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

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

  return (
    <div className="auth-page">
      <LiveBackdrop />
      <section className="auth-showcase glass-panel">
        <div className="brand-mark large">
          <span className="brand-icon"><Cloud size={20} /></span>
          <div><strong>CloudVault</strong><span>distributed storage, intelligent retrieval</span></div>
        </div>

        <div className="auth-copy">
          <p className="eyebrow">Secure by default · AI where it earns its place</p>
          <h1>Your private file system, built like a real platform.</h1>
          <p>
            Versioned object storage, RLS-enforced access, expiring share links,
            activity history, and semantic retrieval—without a paid AI API.
          </p>
        </div>

        <div className="auth-trust-grid">
          <div><ShieldCheck size={18} /><span>Row-level security</span></div>
          <div><KeyRound size={18} /><span>Short-lived signed access</span></div>
        </div>
      </section>

      <section className="auth-card glass-panel">
        <div>
          <p className="eyebrow">{mode === "login" ? "Welcome back" : "Create your vault"}</p>
          <h2>{mode === "login" ? "Sign in" : "Start securely"}</h2>
        </div>

        <form onSubmit={submit} className="auth-form">
          <label>Email<input required type="email" value={email} onChange={(e) => setEmail(e.target.value)} /></label>
          <label>Password<input required minLength={8} type="password" value={password} onChange={(e) => setPassword(e.target.value)} /></label>
          {message && <div className="inline-message">{message}</div>}
          <button className="primary-button" disabled={busy}>
            {busy ? "Working…" : mode === "login" ? "Sign in" : "Create account"}
          </button>
        </form>

        <button className="text-button" onClick={() => setMode(mode === "login" ? "register" : "login")}>
          {mode === "login" ? "Need an account? Register" : "Already registered? Sign in"}
        </button>
        {mode === "login" && (
          <button
            className="text-button"
            onClick={async () => {
              if (!email) {
                setMessage("Enter your email first.");
                return;
              }
              const { error } = await supabase.auth.resetPasswordForEmail(email, {
                redirectTo: `${window.location.origin}/reset-password`,
              });
              setMessage(error ? error.message : "Password reset email sent.");
            }}
          >
            Forgot password?
          </button>
        )}
      </section>
    </div>
  );
}
