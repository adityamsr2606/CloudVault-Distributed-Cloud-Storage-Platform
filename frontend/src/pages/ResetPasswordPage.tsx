import { FormEvent, useState } from "react";
import { KeyRound } from "lucide-react";
import { useNavigate } from "react-router-dom";

import LiveBackdrop from "../components/LiveBackdrop";
import { passwordPolicyError } from "../lib/passwordPolicy";
import { supabase } from "../lib/supabase";

export default function ResetPasswordPage() {
  const navigate = useNavigate();
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setMessage("");

    const policyError = passwordPolicyError(password);
    if (policyError) {
      setMessage(policyError);
      setBusy(false);
      return;
    }

    const { error } = await supabase.auth.updateUser({ password });
    if (error) {
      setMessage(error.message);
      setBusy(false);
      return;
    }

    setMessage("Password updated.");
    setBusy(false);
    window.setTimeout(() => navigate("/app"), 700);
  }

  return (
    <div className="share-resolve-page">
      <LiveBackdrop />
      <section className="share-resolve-card glass-panel">
        <KeyRound size={26} />
        <p className="eyebrow">Account recovery</p>
        <h1>Choose a new password</h1>
        <p>The recovery session from your email link authorizes this change.</p>
        <form className="auth-form" onSubmit={submit}>
          <label>
            New password
            <input
              required
              minLength={12}
              type="password"
              placeholder="12+ chars, upper/lower/number/symbol"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
            />
          </label>
          {message && <div className="inline-message">{message}</div>}
          <button className="primary-button" disabled={busy}>
            {busy ? "Updating…" : "Update password"}
          </button>
        </form>
      </section>
    </div>
  );
}
