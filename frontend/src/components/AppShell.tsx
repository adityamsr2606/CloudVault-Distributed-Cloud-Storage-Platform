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
import { AnimatePresence, motion } from "framer-motion";
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
          <ThemeSwitcher compact />
        </header>

        <main className="content-stage">
          <AnimatePresence mode="wait">
            <motion.div
              key={location.pathname}
              initial={{ opacity: 0, y: 8, filter: "blur(3px)" }}
              animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
              exit={{ opacity: 0, y: -5, filter: "blur(2px)" }}
              transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
            >
              <Outlet />
            </motion.div>
          </AnimatePresence>
        </main>
      </section>
    </div>
  );
}
