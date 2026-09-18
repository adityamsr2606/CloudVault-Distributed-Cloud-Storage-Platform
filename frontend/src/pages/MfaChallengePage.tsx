import { FormEvent, useEffect, useState } from "react";
import { KeyRound, ShieldCheck } from "lucide-react";
import { Navigate, useNavigate } from "react-router-dom";
import type { Session } from "@supabase/supabase-js";

import CloudVaultLogo from "../components/CloudVaultLogo";
import LiveBackdrop from "../components/LiveBackdrop";
import { supabase } from "../lib/supabase";

export default function MfaChallengePage({ session }: { session: Session | null }) {
  const navigate = useNavigate();
  const [factorId, setFactorId] = useState<string | null>(null);
  const [code, setCode] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (!session) return;

    void Promise.all([
      supabase.auth.mfa.getAuthenticatorAssuranceLevel(),
      supabase.auth.mfa.listFactors(),
    ])
      .then(([aalResult, factorsResult]) => {
        if (aalResult.error) throw aalResult.error;
        if (factorsResult.error) throw factorsResult.error;

        if (aalResult.data.currentLevel === "aal2") {
          navigate("/app", { replace: true });
          return;
        }

        const verified = [
          ...(factorsResult.data.totp ?? []),
          ...(factorsResult.data.phone ?? []),
        ].find((factor) => factor.status === "verified");

        if (!verified) {
          setMessage("No verified second factor is available on this account.");
        } else {
          setFactorId(verified.id);
        }
        setReady(true);
      })
      .catch((error) => {
        setMessage(error instanceof Error ? error.message : "Could not load MFA challenge");
        setReady(true);
      });
  }, [navigate, session]);

  if (!session) return <Navigate to="/auth" replace />;

  async function verify(event: FormEvent) {
    event.preventDefault();
    if (!factorId || code.trim().length < 6) return;

    setBusy(true);
    setMessage("");

    try {
      const { error } = await supabase.auth.mfa.challengeAndVerify({
        factorId,
        code: code.trim(),
      });
      if (error) throw error;

      navigate("/app", { replace: true });
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Verification failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mfa-page">
      <LiveBackdrop />
      <section className="mfa-card">
        <CloudVaultLogo />
        <span className="feature-icon large"><ShieldCheck size={22} /></span>
        <div>
          <p className="eyebrow">Second factor required</p>
          <h1>Verify this session.</h1>
          <p>
            This account has MFA enabled. Enter the code from your authenticator before
            CloudVault opens the private workspace.
          </p>
        </div>

        {message && <div className="inline-message">{message}</div>}

        <form onSubmit={verify} className="auth-form">
          <label>
            Authenticator code
            <input
              inputMode="numeric"
              autoComplete="one-time-code"
              value={code}
              onChange={(event) => setCode(event.target.value.replace(/\D/g, "").slice(0, 8))}
              placeholder="6-digit code"
              disabled={!ready || !factorId}
            />
          </label>
          <button className="primary-button" disabled={busy || !factorId}>
            <KeyRound size={15} />
            {busy ? "Verifying…" : "Verify and open vault"}
          </button>
        </form>
      </section>
    </div>
  );
}
