import { Fingerprint, KeyRound, ShieldCheck, Trash2 } from "lucide-react";
import { FormEvent, useCallback, useEffect, useState } from "react";

import type { ProductSettings } from "../config/product";
import { supabase } from "../lib/supabase";

type TotpSetup = {
  factorId: string;
  qrCode: string;
  secret: string;
};

export default function SecurityPanel({
  settings,
  onMessage,
}: {
  settings: ProductSettings | null;
  onMessage: (message: string) => void;
}) {
  const [factors, setFactors] = useState<any[]>([]);
  const [passkeys, setPasskeys] = useState<any[]>([]);
  const [aal, setAal] = useState("aal1");
  const [setup, setSetup] = useState<TotpSetup | null>(null);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(async () => {
    const [factorResult, aalResult] = await Promise.all([
      supabase.auth.mfa.listFactors(),
      supabase.auth.mfa.getAuthenticatorAssuranceLevel(),
    ]);

    if (factorResult.error) throw factorResult.error;
    if (aalResult.error) throw aalResult.error;

    setFactors([
      ...(factorResult.data.totp ?? []),
      ...(factorResult.data.phone ?? []),
    ]);
    setAal(aalResult.data.currentLevel ?? "aal1");

    if (settings?.passkeys_enabled) {
      const result = await supabase.auth.passkey.list();
      if (result.error) throw result.error;
      setPasskeys(result.data ?? []);
    } else {
      setPasskeys([]);
    }
  }, [settings?.passkeys_enabled]);

  useEffect(() => {
    if (!settings) return;
    void refresh().catch((error) => {
      onMessage(error instanceof Error ? error.message : "Could not load security settings");
    });
  }, [refresh, settings, onMessage]);

  async function beginTotp() {
    setBusy(true);
    try {
      const { data, error } = await supabase.auth.mfa.enroll({
        factorType: "totp",
        friendlyName: "CloudVault Authenticator",
      });
      if (error) throw error;

      setSetup({
        factorId: data.id,
        qrCode: data.totp.qr_code,
        secret: data.totp.secret,
      });
      onMessage("Scan the QR code and verify one authenticator code to finish setup.");
    } catch (error) {
      onMessage(error instanceof Error ? error.message : "Could not start MFA enrollment");
    } finally {
      setBusy(false);
    }
  }

  async function verifyTotp(event: FormEvent) {
    event.preventDefault();
    if (!setup || code.trim().length < 6) return;

    setBusy(true);
    try {
      const { error } = await supabase.auth.mfa.challengeAndVerify({
        factorId: setup.factorId,
        code: code.trim(),
      });
      if (error) throw error;

      setSetup(null);
      setCode("");
      await refresh();
      onMessage("Authenticator MFA is now active for your account.");
    } catch (error) {
      onMessage(error instanceof Error ? error.message : "MFA verification failed");
    } finally {
      setBusy(false);
    }
  }

  async function removeFactor(factorId: string) {
    setBusy(true);
    try {
      const { error } = await supabase.auth.mfa.unenroll({ factorId });
      if (error) throw error;
      await supabase.auth.refreshSession();
      await refresh();
      onMessage("MFA factor removed.");
    } catch (error) {
      onMessage(
        error instanceof Error
          ? error.message
          : "Could not remove the factor. Verify this session with MFA first.",
      );
    } finally {
      setBusy(false);
    }
  }

  async function registerPasskey() {
    setBusy(true);
    try {
      const { error } = await supabase.auth.registerPasskey();
      if (error) throw error;
      await refresh();
      onMessage("Passkey registered.");
    } catch (error) {
      onMessage(error instanceof Error ? error.message : "Could not register passkey");
    } finally {
      setBusy(false);
    }
  }

  async function removePasskey(passkeyId: string) {
    setBusy(true);
    try {
      const { error } = await supabase.auth.passkey.delete({ passkeyId });
      if (error) throw error;
      await refresh();
      onMessage("Passkey removed.");
    } catch (error) {
      onMessage(error instanceof Error ? error.message : "Could not remove passkey");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="security-panel">
      <div className="security-panel-head">
        <div>
          <p className="eyebrow">Account security</p>
          <h2>Strong authentication, owned by the user.</h2>
          <p>
            TOTP MFA is supported now. Passkeys appear only when the deployment enables
            Supabase WebAuthn for the production domain.
          </p>
        </div>
        <span className={"aal-badge " + (aal === "aal2" ? "verified" : "")}>
          <ShieldCheck size={14} />
          {aal.toUpperCase()}
        </span>
      </div>

      <div className="security-method-grid">
        <article className="security-method">
          <span className="feature-icon"><KeyRound size={17} /></span>
          <div>
            <strong>Authenticator MFA</strong>
            <p>
              {factors.length > 0
                ? factors.length + " enrolled factor" + (factors.length === 1 ? "" : "s")
                : "No second factor enrolled"}
            </p>
          </div>
          {settings?.mfa_enabled && factors.length === 0 && !setup && (
            <button className="ghost-button compact" disabled={busy} onClick={() => void beginTotp()}>
              Set up TOTP
            </button>
          )}
        </article>

        <article className="security-method">
          <span className="feature-icon"><Fingerprint size={17} /></span>
          <div>
            <strong>Passkeys</strong>
            <p>
              {settings?.passkeys_enabled
                ? passkeys.length + " registered"
                : "Provider setup not enabled"}
            </p>
          </div>
          {settings?.passkeys_enabled && (
            <button className="ghost-button compact" disabled={busy} onClick={() => void registerPasskey()}>
              Add passkey
            </button>
          )}
        </article>
      </div>

      {setup && (
        <div className="totp-setup">
          <img src={setup.qrCode} alt="Authenticator app QR code" />
          <div>
            <strong>Scan with your authenticator app</strong>
            <p>If scanning is unavailable, enter this secret manually:</p>
            <code>{setup.secret}</code>
            <form onSubmit={verifyTotp}>
              <input
                inputMode="numeric"
                autoComplete="one-time-code"
                value={code}
                onChange={(event) => setCode(event.target.value.replace(/\D/g, "").slice(0, 8))}
                placeholder="6-digit code"
              />
              <button className="primary-button compact" disabled={busy}>Verify</button>
            </form>
          </div>
        </div>
      )}

      {factors.length > 0 && (
        <div className="security-list">
          {factors.map((factor) => (
            <div key={factor.id}>
              <span>
                <strong>{factor.friendly_name || factor.factor_type || "Authenticator"}</strong>
                <small>{factor.status}</small>
              </span>
              <button
                aria-label="Remove MFA factor"
                className="icon-button"
                disabled={busy}
                onClick={() => void removeFactor(factor.id)}
              >
                <Trash2 size={14} />
              </button>
            </div>
          ))}
        </div>
      )}

      {settings?.passkeys_enabled && passkeys.length > 0 && (
        <div className="security-list">
          {passkeys.map((passkey) => (
            <div key={passkey.id}>
              <span>
                <strong>{passkey.friendly_name || "Passkey"}</strong>
                <small>
                  Added {passkey.created_at ? new Date(passkey.created_at).toLocaleDateString() : ""}
                </small>
              </span>
              <button
                aria-label="Remove passkey"
                className="icon-button"
                disabled={busy}
                onClick={() => void removePasskey(passkey.id)}
              >
                <Trash2 size={14} />
              </button>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
