import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { motion } from "framer-motion";
import {
  BrainCircuit,
  Cloud,
  FileText,
  HardDrive,
  LogOut,
  Search,
  ShieldCheck,
  Sparkles,
  Upload,
} from "lucide-react";

import {
  CloudFile,
  SearchHit,
  listFiles,
  login,
  register,
  searchFiles,
  uploadFile,
} from "./lib/api";

function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  const units = ["KB", "MB", "GB", "TB"];
  let value = bytes / 1024;
  let unit = units[0];

  for (let i = 1; i < units.length && value >= 1024; i += 1) {
    value /= 1024;
    unit = units[i];
  }

  return `${value.toFixed(value >= 10 ? 0 : 1)} ${unit}`;
}

function AuthScreen({ onAuthenticated }: { onAuthenticated: (token: string) => void }) {
  const [mode, setMode] = useState<"login" | "register">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");

    try {
      const tokens =
        mode === "login" ? await login(email, password) : await register(email, password);
      localStorage.setItem("cloudvault_access_token", tokens.access_token);
      onAuthenticated(tokens.access_token);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to continue");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="min-h-screen bg-[#0b0d0c] px-5 py-8 text-stone-100">
      <div className="mx-auto grid min-h-[calc(100vh-4rem)] max-w-6xl overflow-hidden rounded-[32px] border border-white/10 bg-[#111411] lg:grid-cols-[1.15fr_0.85fr]">
        <section className="relative hidden overflow-hidden border-r border-white/10 p-12 lg:flex lg:flex-col lg:justify-between">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_20%_20%,rgba(183,214,172,.16),transparent_34%),radial-gradient(circle_at_85%_75%,rgba(214,180,140,.10),transparent_28%)]" />
          <div className="relative">
            <div className="flex items-center gap-3 text-sm font-medium text-stone-300">
              <span className="grid size-9 place-items-center rounded-xl border border-white/10 bg-white/5">
                <Cloud className="size-4" />
              </span>
              CloudVault
            </div>
          </div>

          <div className="relative max-w-xl">
            <p className="mb-5 text-xs font-semibold uppercase tracking-[0.24em] text-[#b7d6ac]">
              Private by architecture
            </p>
            <h1 className="text-5xl font-medium leading-[1.04] tracking-[-0.045em]">
              Your files, indexed for meaning—not exposed for convenience.
            </h1>
            <p className="mt-6 max-w-lg text-base leading-7 text-stone-400">
              Durable object storage, tenant-scoped semantic retrieval, asynchronous AI indexing,
              and observable infrastructure in one focused platform.
            </p>
          </div>

          <div className="relative grid grid-cols-3 gap-3 text-xs text-stone-400">
            <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
              <ShieldCheck className="mb-5 size-5 text-[#b7d6ac]" />
              Access controlled
            </div>
            <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
              <BrainCircuit className="mb-5 size-5 text-[#d6b48c]" />
              Semantic retrieval
            </div>
            <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
              <HardDrive className="mb-5 size-5 text-stone-300" />
              S3-compatible
            </div>
          </div>
        </section>

        <section className="flex items-center p-7 sm:p-10 lg:p-14">
          <form onSubmit={submit} className="mx-auto w-full max-w-sm">
            <p className="text-sm text-stone-500">CloudVault account</p>
            <h2 className="mt-2 text-3xl font-medium tracking-tight">
              {mode === "login" ? "Welcome back" : "Create your vault"}
            </h2>
            <p className="mt-3 text-sm leading-6 text-stone-500">
              {mode === "login"
                ? "Sign in to manage and intelligently search your private files."
                : "Create an account to start storing and indexing files securely."}
            </p>

            <label className="mt-8 block text-xs font-medium text-stone-400">
              Email
              <input
                required
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                className="mt-2 w-full rounded-xl border border-white/10 bg-black/20 px-4 py-3 text-sm outline-none transition focus:border-[#b7d6ac]/60"
              />
            </label>

            <label className="mt-4 block text-xs font-medium text-stone-400">
              Password
              <input
                required
                minLength={10}
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                className="mt-2 w-full rounded-xl border border-white/10 bg-black/20 px-4 py-3 text-sm outline-none transition focus:border-[#b7d6ac]/60"
              />
            </label>

            {error && <p className="mt-4 text-sm text-red-300">{error}</p>}

            <button
              disabled={busy}
              className="mt-6 w-full rounded-xl bg-[#d9e8d3] px-4 py-3 text-sm font-semibold text-[#101510] transition hover:bg-[#e4f0df] disabled:opacity-60"
            >
              {busy ? "Working…" : mode === "login" ? "Sign in" : "Create account"}
            </button>

            <button
              type="button"
              onClick={() => setMode(mode === "login" ? "register" : "login")}
              className="mt-4 w-full text-sm text-stone-500 transition hover:text-stone-300"
            >
              {mode === "login"
                ? "New to CloudVault? Create an account"
                : "Already have an account? Sign in"}
            </button>
          </form>
        </section>
      </div>
    </main>
  );
}

function Dashboard({ token, onLogout }: { token: string; onLogout: () => void }) {
  const [files, setFiles] = useState<CloudFile[]>([]);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchHit[]>([]);
  const [error, setError] = useState("");
  const [searching, setSearching] = useState(false);
  const [uploading, setUploading] = useState(false);
  const picker = useRef<HTMLInputElement>(null);

  const usedBytes = useMemo(
    () => files.reduce((total, file) => total + file.size_bytes, 0),
    [files],
  );
  const indexed = files.filter((file) => file.status === "ready").length;
  const stats: Array<[string, string, typeof FileText]> = [
    ["Files", files.length.toString(), FileText],
    ["Indexed", indexed.toString(), BrainCircuit],
    ["Storage", formatBytes(usedBytes), HardDrive],
  ];

  async function refresh() {
    try {
      setFiles(await listFiles(token));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to load files");
    }
  }

  useEffect(() => {
    void refresh();
  }, [token]);

  async function runSearch(event: FormEvent) {
    event.preventDefault();
    if (query.trim().length < 2) return;

    setSearching(true);
    setError("");
    try {
      setResults(await searchFiles(token, query.trim()));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Search failed");
    } finally {
      setSearching(false);
    }
  }

  async function selected(file?: File) {
    if (!file) return;
    setUploading(true);
    setError("");

    try {
      await uploadFile(token, file);
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setUploading(false);
      if (picker.current) picker.current.value = "";
    }
  }

  return (
    <div className="min-h-screen bg-[#0b0d0c] text-stone-100">
      <div className="mx-auto grid min-h-screen max-w-[1600px] lg:grid-cols-[240px_1fr]">
        <aside className="hidden border-r border-white/8 bg-[#0d100e] p-5 lg:flex lg:flex-col">
          <div className="flex items-center gap-3 px-2 py-3 text-sm font-semibold">
            <span className="grid size-9 place-items-center rounded-xl border border-white/10 bg-white/5">
              <Cloud className="size-4 text-[#b7d6ac]" />
            </span>
            CloudVault
          </div>

          <nav className="mt-8 space-y-2 text-sm">
            <button className="flex w-full items-center gap-3 rounded-xl bg-white/[0.06] px-3 py-2.5 text-stone-200">
              <HardDrive className="size-4" /> My vault
            </button>
            <button className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-stone-500">
              <Sparkles className="size-4" /> Intelligence
            </button>
          </nav>

          <div className="mt-auto">
            <div className="rounded-2xl border border-white/8 bg-white/[0.025] p-4">
              <p className="text-xs text-stone-500">Storage used</p>
              <p className="mt-2 text-lg font-medium">{formatBytes(usedBytes)}</p>
              <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-white/8">
                <div
                  className="h-full rounded-full bg-[#b7d6ac]"
                  style={{ width: `${Math.min((usedBytes / (1024 ** 3)) * 100, 100)}%` }}
                />
              </div>
              <p className="mt-2 text-[11px] text-stone-600">of 1 GB default quota</p>
            </div>
            <button
              onClick={onLogout}
              className="mt-3 flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm text-stone-500 transition hover:bg-white/[0.04] hover:text-stone-300"
            >
              <LogOut className="size-4" /> Sign out
            </button>
          </div>
        </aside>

        <main className="p-5 sm:p-8 lg:p-10">
          <header className="flex flex-col justify-between gap-6 md:flex-row md:items-end">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[#b7d6ac]">
                Secure workspace
              </p>
              <h1 className="mt-3 text-3xl font-medium tracking-[-0.035em]">My vault</h1>
              <p className="mt-2 text-sm text-stone-500">
                Durable storage with asynchronous semantic indexing.
              </p>
            </div>

            <input
              ref={picker}
              type="file"
              className="hidden"
              onChange={(event) => void selected(event.target.files?.[0])}
            />
            <button
              onClick={() => picker.current?.click()}
              disabled={uploading}
              className="inline-flex items-center justify-center gap-2 rounded-xl bg-[#d9e8d3] px-4 py-2.5 text-sm font-semibold text-[#101510] transition hover:bg-[#e4f0df] disabled:opacity-60"
            >
              <Upload className="size-4" />
              {uploading ? "Uploading…" : "Upload file"}
            </button>
          </header>

          <section className="mt-8 grid gap-4 sm:grid-cols-3">
            {stats.map(([label, value, Icon]) => (
              <div key={String(label)} className="rounded-2xl border border-white/8 bg-[#111411] p-5">
                <div className="flex items-center justify-between text-stone-500">
                  <span className="text-xs">{String(label)}</span>
                  <Icon className="size-4" />
                </div>
                <p className="mt-5 text-2xl font-medium tracking-tight">{String(value)}</p>
              </div>
            ))}
          </section>

          <section className="mt-6 rounded-2xl border border-[#b7d6ac]/15 bg-[linear-gradient(135deg,rgba(183,214,172,.07),rgba(17,20,17,.8))] p-5 sm:p-6">
            <div className="flex items-center gap-2 text-sm font-medium">
              <Sparkles className="size-4 text-[#b7d6ac]" />
              Semantic search
            </div>
            <p className="mt-2 text-xs leading-5 text-stone-500">
              Search by intent and meaning. Results remain scoped to your authenticated vault.
            </p>

            <form onSubmit={runSearch} className="mt-5 flex gap-2">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-stone-600" />
                <input
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="e.g. architecture notes about database scaling"
                  className="w-full rounded-xl border border-white/10 bg-black/20 py-3 pl-10 pr-4 text-sm outline-none transition focus:border-[#b7d6ac]/50"
                />
              </div>
              <button
                disabled={searching}
                className="rounded-xl border border-white/10 bg-white/[0.05] px-4 text-sm text-stone-300 transition hover:bg-white/[0.08]"
              >
                {searching ? "Searching…" : "Search"}
              </button>
            </form>

            {results.length > 0 && (
              <div className="mt-4 grid gap-2">
                {results.map((result) => (
                  <motion.div
                    key={result.file_id}
                    initial={{ opacity: 0, y: 4 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="rounded-xl border border-white/8 bg-black/15 p-4"
                  >
                    <div className="flex items-center justify-between gap-4">
                      <p className="text-sm font-medium">{result.name}</p>
                      <span className="text-[11px] text-stone-600">
                        score {result.score.toFixed(3)}
                      </span>
                    </div>
                    {result.snippet && (
                      <p className="mt-2 line-clamp-2 text-xs leading-5 text-stone-500">
                        {result.snippet}
                      </p>
                    )}
                  </motion.div>
                ))}
              </div>
            )}
          </section>

          {error && (
            <p className="mt-4 rounded-xl border border-red-400/15 bg-red-400/5 px-4 py-3 text-sm text-red-300">
              {error}
            </p>
          )}

          <section className="mt-6 overflow-hidden rounded-2xl border border-white/8 bg-[#111411]">
            <div className="flex items-center justify-between border-b border-white/8 px-5 py-4">
              <h2 className="text-sm font-medium">Recent files</h2>
              <span className="text-xs text-stone-600">{files.length} total</span>
            </div>

            {files.length === 0 ? (
              <div className="px-5 py-12 text-center text-sm text-stone-600">
                Your vault is empty. Upload the first file to begin.
              </div>
            ) : (
              <div className="divide-y divide-white/6">
                {files.map((file) => (
                  <div key={file.id} className="grid grid-cols-[1fr_auto] gap-4 px-5 py-4 sm:grid-cols-[1fr_130px_100px]">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-stone-200">{file.name}</p>
                      <p className="mt-1 text-xs text-stone-600">{file.mime_type}</p>
                    </div>
                    <span className="hidden self-center text-xs text-stone-500 sm:block">
                      {formatBytes(file.size_bytes)}
                    </span>
                    <span className="self-center justify-self-end rounded-full border border-white/8 px-2.5 py-1 text-[11px] capitalize text-stone-400">
                      {file.status}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </section>
        </main>
      </div>
    </div>
  );
}

export default function App() {
  const [token, setToken] = useState(() => localStorage.getItem("cloudvault_access_token") ?? "");

  if (!token) return <AuthScreen onAuthenticated={setToken} />;

  return (
    <Dashboard
      token={token}
      onLogout={() => {
        localStorage.removeItem("cloudvault_access_token");
        setToken("");
      }}
    />
  );
}
