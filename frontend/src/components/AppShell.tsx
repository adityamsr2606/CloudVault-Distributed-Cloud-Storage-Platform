import {
  Activity,
  BrainCircuit,
  FolderClosed,
  LayoutDashboard,
  LogOut,
  Settings,
  Share2,
  Star,
  Trash2,
} from "lucide-react";
import { NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";

import { supabase } from "../lib/supabase";
import CloudVaultLogo from "./CloudVaultLogo";
import CommandPalette from "./CommandPalette";
import LiveBackdrop from "./LiveBackdrop";
import ThemeSwitcher from "./ThemeSwitcher";

const nav = [
  ["/app", "Overview", LayoutDashboard],
  ["/app/vault", "My vault", FolderClosed],
  ["/app/starred", "Starred", Star],
  ["/app/intelligence", "Intelligence", BrainCircuit],
  ["/app/shared", "Shared", Share2],
  ["/app/activity", "Activity", Activity],
  ["/app/trash", "Trash", Trash2],
  ["/app/settings", "Settings", Settings],
] as const;

export default function AppShell() {
  const navigate = useNavigate();
  const location = useLocation();

  async function logout() {
    await supabase.auth.signOut();
    navigate("/auth");
  }

  return (
    <div className="app-frame">
      <LiveBackdrop />

      <aside className="side-rail">
        <CloudVaultLogo />

        <nav className="side-nav" aria-label="Primary">
          {nav.map(([to, label, Icon]) => (
            <NavLink
              end={to === "/app"}
              key={to}
              to={to}
              className={({ isActive }) => `nav-item ${isActive ? "active" : ""}`}
              aria-label={label}
              title={label}
            >
              <Icon size={17} />
              <span>{label}</span>
            </NavLink>
          ))}
        </nav>

        <div className="side-footer">
          <div className="privacy-note">
            <span className="privacy-pulse" />
            <span>
              <strong>Personal vault</strong>
              <small>Database-isolated workspace</small>
            </span>
          </div>
          <button className="ghost-button nav-logout" onClick={logout}>
            <LogOut size={16} /> <span>Sign out</span>
          </button>
        </div>
      </aside>

      <section className="workspace">
        <header className="workspace-bar">
          <CommandPalette />
          <div className="workspace-actions">
            <ThemeSwitcher compact />
            <button
              className="icon-button mobile-signout"
              onClick={logout}
              aria-label="Sign out"
              title="Sign out"
            >
              <LogOut size={16} />
            </button>
          </div>
        </header>

        <main className="content-stage">
          <div key={location.pathname} className="route-stage">
            <Outlet />
          </div>
        </main>
      </section>
    </div>
  );
}
