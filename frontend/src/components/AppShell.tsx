import {
  Activity,
  BrainCircuit,
  Cloud,
  FolderClosed,
  LayoutDashboard,
  LogOut,
  Settings,
  Share2,
  Star,
  Trash2,
} from "lucide-react";
import { NavLink, Outlet, useNavigate } from "react-router-dom";

import { supabase } from "../lib/supabase";
import LiveBackdrop from "./LiveBackdrop";

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

  async function logout() {
    await supabase.auth.signOut();
    navigate("/auth");
  }

  return (
    <div className="app-frame">
      <LiveBackdrop />
      <aside className="side-rail glass-panel">
        <div className="brand-mark">
          <span className="brand-icon"><Cloud size={18} /></span>
          <div>
            <strong>CloudVault</strong>
            <span>private workspace</span>
          </div>
        </div>

        <nav className="side-nav" aria-label="Primary">
          {nav.map(([to, label, Icon]) => (
            <NavLink
              end={to === "/app"}
              key={to}
              to={to}
              className={({ isActive }) => `nav-item ${isActive ? "active" : ""}`}
            >
              <Icon size={17} />
              <span>{label}</span>
            </NavLink>
          ))}
        </nav>

        <div className="side-footer">
          <div className="privacy-note">
            <span className="privacy-pulse" />
            RLS protected
          </div>
          <button className="ghost-button nav-logout" onClick={logout}>
            <LogOut size={16} /> Sign out
          </button>
        </div>
      </aside>

      <main className="content-stage">
        <Outlet />
      </main>
    </div>
  );
}
