import { lazy, Suspense, useEffect, useState } from "react";
import { Navigate, Route, Routes } from "react-router-dom";
import type { Session } from "@supabase/supabase-js";

import { getProductSettings } from "./config/product";
import { supabase } from "./lib/supabase";

const AppShell = lazy(() => import("./components/AppShell"));
const ActivityPage = lazy(() => import("./pages/ActivityPage"));
const AuthPage = lazy(() => import("./pages/AuthPage"));
const DashboardPage = lazy(() => import("./pages/DashboardPage"));
const IntelligencePage = lazy(() => import("./pages/IntelligencePage"));
const LandingPage = lazy(() => import("./pages/LandingPage"));
const MfaChallengePage = lazy(() => import("./pages/MfaChallengePage"));
const ResetPasswordPage = lazy(() => import("./pages/ResetPasswordPage"));
const SettingsPage = lazy(() => import("./pages/SettingsPage"));
const ShareResolvePage = lazy(() => import("./pages/ShareResolvePage"));
const SharedPage = lazy(() => import("./pages/SharedPage"));
const TrashPage = lazy(() => import("./pages/TrashPage"));
const VaultPage = lazy(() => import("./pages/VaultPage"));

function RouteFallback() {
  return <div className="boot-screen">Loading CloudVault…</div>;
}

function Protected({ session }: { session: Session | null }) {
  const [checked, setChecked] = useState(false);
  const [needsMfa, setNeedsMfa] = useState(false);

  useEffect(() => {
    if (!session) {
      setChecked(true);
      setNeedsMfa(false);
      return;
    }

    let active = true;

    void Promise.all([
      getProductSettings(),
      supabase.auth.mfa.getAuthenticatorAssuranceLevel(),
    ])
      .then(([settings, aal]) => {
        if (!active) return;
        if (aal.error) throw aal.error;

        const enrolledButUnverified =
          aal.data.currentLevel !== "aal2" && aal.data.nextLevel === "aal2";

        setNeedsMfa(Boolean(settings.mfa_enabled && enrolledButUnverified));
        setChecked(true);
      })
      .catch(() => {
        if (!active) return;
        setNeedsMfa(false);
        setChecked(true);
      });

    return () => {
      active = false;
    };
  }, [session?.access_token]);

  if (!session) return <Navigate to="/auth" replace />;
  if (!checked) return <div className="boot-screen">Verifying CloudVault session…</div>;
  if (needsMfa) return <Navigate to="/mfa" replace />;

  return <AppShell />;
}

export default function App() {
  const [session, setSession] = useState<Session | null>(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    void supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setLoaded(true);
    });

    const { data } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession);
      setLoaded(true);
    });

    return () => data.subscription.unsubscribe();
  }, []);

  if (!loaded) return <div className="boot-screen">Opening CloudVault…</div>;

  return (
    <Suspense fallback={<RouteFallback />}>
      <Routes>
        <Route path="/" element={<LandingPage />} />
        <Route path="/auth" element={<AuthPage sessionReady={Boolean(session)} />} />
        <Route path="/mfa" element={<MfaChallengePage session={session} />} />
        <Route path="/s/:token" element={<ShareResolvePage />} />
        <Route path="/reset-password" element={<ResetPasswordPage />} />
        <Route element={<Protected session={session} />}>
          <Route path="/app" element={<DashboardPage />} />
          <Route path="/app/vault" element={<VaultPage />} />
          <Route path="/app/starred" element={<VaultPage starredOnly />} />
          <Route path="/app/intelligence" element={<IntelligencePage />} />
          <Route path="/app/shared" element={<SharedPage />} />
          <Route path="/app/activity" element={<ActivityPage />} />
          <Route path="/app/trash" element={<TrashPage />} />
          <Route path="/app/settings" element={<SettingsPage />} />
        </Route>
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Suspense>
  );
}
