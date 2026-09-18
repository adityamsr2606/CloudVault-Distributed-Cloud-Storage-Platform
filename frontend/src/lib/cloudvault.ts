import { supabase } from "./supabase";

export type VaultFile = {
  id: string;
  owner_id: string;
  folder_id: string | null;
  name: string;
  storage_path: string;
  mime_type: string;
  size_bytes: number;
  sha256: string | null;
  current_version: number;
  status: "uploaded" | "indexing" | "ready" | "failed" | "deleted";
  is_starred: boolean;
  deleted_at: string | null;
  created_at: string;
  updated_at: string;
};

export type VaultFolder = {
  id: string;
  parent_id: string | null;
  name: string;
  created_at: string;
};

export type ActivityEvent = {
  id: number;
  file_id: string | null;
  event_type: string;
  detail: Record<string, unknown>;
  created_at: string;
};

export type SearchResult = {
  file_id: string;
  name: string;
  content: string;
  similarity: number;
};

export type ShareLink = {
  id: string;
  file_id: string;
  expires_at: string;
  max_uses: number | null;
  use_count: number;
  revoked_at: string | null;
  created_at: string;
  vault_files?: { name?: string } | null;
};

function safeName(name: string) {
  return name.replaceAll("/", "_").replaceAll("\\", "_").slice(0, 180) || "file";
}

async function currentUserId() {
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) throw new Error("Your session has expired.");
  return data.user.id;
}

async function digestSha256(file: File) {
  const bytes = await file.arrayBuffer();
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function indexableText(file: File) {
  const type = file.type.toLowerCase();
  const lower = file.name.toLowerCase();
  const textLike =
    type.startsWith("text/") ||
    type.includes("json") ||
    type.includes("csv") ||
    lower.endsWith(".md") ||
    lower.endsWith(".log");

  if (textLike && file.size <= 2 * 1024 * 1024) {
    return (await file.text()).slice(0, 160_000);
  }

  return `${file.name} ${file.type || "file"}`;
}

export async function listFiles() {
  const { data, error } = await supabase
    .from("vault_files")
    .select("*")
    .is("deleted_at", null)
    .order("created_at", { ascending: false });

  if (error) throw error;
  return (data ?? []) as VaultFile[];
}

export async function listTrash() {
  const { data, error } = await supabase
    .from("vault_files")
    .select("*")
    .not("deleted_at", "is", null)
    .order("deleted_at", { ascending: false });

  if (error) throw error;
  return (data ?? []) as VaultFile[];
}

export async function listFolders() {
  const { data, error } = await supabase
    .from("vault_folders")
    .select("id,parent_id,name,created_at")
    .is("deleted_at", null)
    .order("name");

  if (error) throw error;
  return (data ?? []) as VaultFolder[];
}

export async function createFolder(name: string, parentId: string | null = null) {
  const ownerId = await currentUserId();
  const { data, error } = await supabase
    .from("vault_folders")
    .insert({ owner_id: ownerId, parent_id: parentId, name: name.trim() })
    .select("id,parent_id,name,created_at")
    .single();

  if (error) throw error;
  return data as VaultFolder;
}

export async function uploadVaultFile(file: File, folderId: string | null = null) {
  const ownerId = await currentUserId();
  const fileId = crypto.randomUUID();
  const name = safeName(file.name);
  const storagePath = `${ownerId}/${fileId}/v1/${name}`;
  const sha256 = await digestSha256(file);

  const { error: storageError } = await supabase.storage
    .from("cloudvault-files")
    .upload(storagePath, file, { contentType: file.type || "application/octet-stream" });

  if (storageError) throw storageError;

  const { data: record, error: recordError } = await supabase
    .from("vault_files")
    .insert({
      id: fileId,
      owner_id: ownerId,
      folder_id: folderId,
      name,
      storage_path: storagePath,
      mime_type: file.type || "application/octet-stream",
      size_bytes: file.size,
      sha256,
      current_version: 1,
      status: "uploaded",
    })
    .select("*")
    .single();

  if (recordError) {
    await supabase.storage.from("cloudvault-files").remove([storagePath]);
    throw recordError;
  }

  const { error: versionError } = await supabase.from("file_versions").insert({
    file_id: fileId,
    owner_id: ownerId,
    version_number: 1,
    storage_path: storagePath,
    mime_type: file.type || "application/octet-stream",
    size_bytes: file.size,
    sha256,
  });

  if (versionError) throw versionError;

  const text = await indexableText(file);
  void supabase.functions.invoke("index-file", {
    body: { file_id: fileId, text },
  });

  return record as VaultFile;
}

export async function toggleStar(file: VaultFile) {
  const { error } = await supabase
    .from("vault_files")
    .update({ is_starred: !file.is_starred, updated_at: new Date().toISOString() })
    .eq("id", file.id);

  if (error) throw error;
}

export async function softDelete(fileId: string) {
  const { error } = await supabase
    .from("vault_files")
    .update({
      status: "deleted",
      deleted_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("id", fileId);

  if (error) throw error;
}

export async function restoreFile(fileId: string) {
  const { error } = await supabase
    .from("vault_files")
    .update({
      status: "uploaded",
      deleted_at: null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", fileId);

  if (error) throw error;
}

export async function getDownloadUrl(file: VaultFile) {
  const { data, error } = await supabase.storage
    .from("cloudvault-files")
    .createSignedUrl(file.storage_path, 60);

  if (error) throw error;
  return data.signedUrl;
}

export async function semanticSearch(query: string) {
  const { data, error } = await supabase.functions.invoke("semantic-search", {
    body: { query, limit: 18 },
  });

  if (error) throw error;
  return ((data as { results?: SearchResult[] })?.results ?? []) as SearchResult[];
}

export async function listActivity() {
  const { data, error } = await supabase
    .from("activity_events")
    .select("id,file_id,event_type,detail,created_at")
    .order("created_at", { ascending: false })
    .limit(100);

  if (error) throw error;
  return (data ?? []) as ActivityEvent[];
}

export async function listShareLinks() {
  const { data, error } = await supabase
    .from("share_links")
    .select("id,file_id,expires_at,max_uses,use_count,revoked_at,created_at,vault_files(name)")
    .order("created_at", { ascending: false });

  if (error) throw error;
  return (data ?? []) as unknown as ShareLink[];
}

export async function createShareLink(fileId: string) {
  const { data, error } = await supabase.functions.invoke("create-share-link", {
    body: { file_id: fileId, expires_hours: 24, max_uses: 25 },
  });
  if (error) throw error;
  return data as { id: string; token: string; expires_at: string; max_uses: number };
}

export async function revokeShareLink(linkId: string) {
  const { error } = await supabase
    .from("share_links")
    .update({ revoked_at: new Date().toISOString() })
    .eq("id", linkId);

  if (error) throw error;
}

export async function resolveShareLink(token: string) {
  const { data, error } = await supabase.functions.invoke("resolve-share-link", {
    body: { token },
  });
  if (error) throw error;
  return data as {
    name: string;
    mime_type: string;
    size_bytes: number;
    signed_url: string;
    expires_in_seconds: number;
  };
}
