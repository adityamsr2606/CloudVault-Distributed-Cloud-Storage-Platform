import { getProductSettings } from "../config/product";
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

export type FileVersion = {
  id: string;
  version_number: number;
  storage_path: string;
  mime_type: string;
  size_bytes: number;
  sha256: string | null;
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

export type RelatedFile = {
  file_id: string;
  name: string;
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
  return [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

async function indexableText(file: File) {
  const settings = await getProductSettings();
  const type = file.type.toLowerCase();
  const lower = file.name.toLowerCase();
  const textLike =
    type.startsWith("text/") ||
    type.includes("json") ||
    type.includes("csv") ||
    lower.endsWith(".md") ||
    lower.endsWith(".log");

  if (textLike && file.size <= settings.max_indexable_text_bytes) {
    return (await file.text()).slice(0, settings.max_indexable_text_chars);
  }

  return `${file.name} ${file.type || "file"}`;
}

async function validateUpload(file: File) {
  const settings = await getProductSettings();
  if (file.size <= 0) throw new Error("Empty files are not accepted.");
  if (file.size > settings.max_upload_bytes) {
    const maxMb = Math.round(settings.max_upload_bytes / 1024 / 1024);
    throw new Error(`This deployment accepts files up to ${maxMb} MB.`);
  }
  return settings;
}

async function ensureNotExactDuplicate(sha256: string, excludeFileId?: string) {
  const settings = await getProductSettings();
  if (!settings.duplicate_detection_enabled) return;

  let query = supabase
    .from("vault_files")
    .select("id,name")
    .eq("sha256", sha256)
    .is("deleted_at", null)
    .limit(1);

  if (excludeFileId) query = query.neq("id", excludeFileId);

  const { data, error } = await query;
  if (error) throw error;
  if (data && data.length > 0) {
    throw new Error(`An identical file already exists: ${data[0].name}`);
  }
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
  const settings = await getProductSettings();
  if (!settings.folders_enabled) throw new Error("Folders are disabled for this deployment.");

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
  const settings = await validateUpload(file);
  const ownerId = await currentUserId();
  const fileId = crypto.randomUUID();
  const name = safeName(file.name);
  const storagePath = `${ownerId}/${fileId}/v1/${name}`;
  const sha256 = await digestSha256(file);

  await ensureNotExactDuplicate(sha256);

  const { error: storageError } = await supabase.storage
    .from("cloudvault-files")
    .upload(storagePath, file, { contentType: file.type || "application/octet-stream" });

  if (storageError) throw storageError;

  const { data: record, error: recordError } = await supabase
    .from("vault_files")
    .insert({
      id: fileId,
      owner_id: ownerId,
      folder_id: settings.folders_enabled ? folderId : null,
      name,
      storage_path: storagePath,
      mime_type: file.type || "application/octet-stream",
      size_bytes: file.size,
      sha256,
      current_version: 1,
      status: settings.ai_enabled ? "uploaded" : "ready",
    })
    .select("*")
    .single();

  if (recordError) {
    await supabase.storage.from("cloudvault-files").remove([storagePath]);
    throw recordError;
  }

  if (settings.versioning_enabled) {
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
  }

  if (settings.ai_enabled) {
    const text = await indexableText(file);
    void supabase.functions.invoke("index-file", { body: { file_id: fileId, text } });
  }

  return record as VaultFile;
}

export async function replaceVaultFile(current: VaultFile, replacement: File) {
  const settings = await validateUpload(replacement);
  if (!settings.versioning_enabled) throw new Error("Versioning is disabled.");

  const ownerId = await currentUserId();
  const nextVersion = current.current_version + 1;
  const name = safeName(replacement.name || current.name);
  const storagePath = `${ownerId}/${current.id}/v${nextVersion}/${name}`;
  const sha256 = await digestSha256(replacement);

  await ensureNotExactDuplicate(sha256, current.id);

  const { error: storageError } = await supabase.storage
    .from("cloudvault-files")
    .upload(storagePath, replacement, {
      contentType: replacement.type || "application/octet-stream",
    });
  if (storageError) throw storageError;

  const { error: versionError } = await supabase.from("file_versions").insert({
    file_id: current.id,
    owner_id: ownerId,
    version_number: nextVersion,
    storage_path: storagePath,
    mime_type: replacement.type || "application/octet-stream",
    size_bytes: replacement.size,
    sha256,
  });

  if (versionError) {
    await supabase.storage.from("cloudvault-files").remove([storagePath]);
    throw versionError;
  }

  const { data: updated, error: updateError } = await supabase
    .from("vault_files")
    .update({
      name,
      storage_path: storagePath,
      mime_type: replacement.type || "application/octet-stream",
      size_bytes: replacement.size,
      sha256,
      current_version: nextVersion,
      status: settings.ai_enabled ? "uploaded" : "ready",
      updated_at: new Date().toISOString(),
    })
    .eq("id", current.id)
    .select("*")
    .single();

  if (updateError) throw updateError;

  if (settings.ai_enabled) {
    const text = await indexableText(replacement);
    void supabase.functions.invoke("index-file", { body: { file_id: current.id, text } });
  }

  return updated as VaultFile;
}

export async function listFileVersions(fileId: string) {
  const settings = await getProductSettings();
  if (!settings.versioning_enabled) return [];

  const { data, error } = await supabase
    .from("file_versions")
    .select("id,version_number,storage_path,mime_type,size_bytes,sha256,created_at")
    .eq("file_id", fileId)
    .order("version_number", { ascending: false });

  if (error) throw error;
  return (data ?? []) as FileVersion[];
}

export async function getVersionDownloadUrl(version: FileVersion) {
  const settings = await getProductSettings();
  const { data, error } = await supabase.storage
    .from("cloudvault-files")
    .createSignedUrl(version.storage_path, settings.share_signed_url_seconds);

  if (error) throw error;
  return data.signedUrl;
}

export async function restoreFileVersion(current: VaultFile, version: FileVersion) {
  const settings = await getProductSettings();
  if (!settings.versioning_enabled) throw new Error("Versioning is disabled.");

  const ownerId = await currentUserId();
  const nextVersion = current.current_version + 1;
  const name = safeName(current.name);
  const nextPath = `${ownerId}/${current.id}/v${nextVersion}/${name}`;

  const { error: copyError } = await supabase.storage
    .from("cloudvault-files")
    .copy(version.storage_path, nextPath);
  if (copyError) throw copyError;

  const { error: versionError } = await supabase.from("file_versions").insert({
    file_id: current.id,
    owner_id: ownerId,
    version_number: nextVersion,
    storage_path: nextPath,
    mime_type: version.mime_type,
    size_bytes: version.size_bytes,
    sha256: version.sha256,
  });

  if (versionError) {
    await supabase.storage.from("cloudvault-files").remove([nextPath]);
    throw versionError;
  }

  const { data: updated, error: updateError } = await supabase
    .from("vault_files")
    .update({
      storage_path: nextPath,
      mime_type: version.mime_type,
      size_bytes: version.size_bytes,
      sha256: version.sha256,
      current_version: nextVersion,
      status: settings.ai_enabled ? "uploaded" : "ready",
      updated_at: new Date().toISOString(),
    })
    .eq("id", current.id)
    .select("*")
    .single();

  if (updateError) throw updateError;

  if (settings.ai_enabled) {
    const { data: blob } = await supabase.storage.from("cloudvault-files").download(nextPath);
    if (blob) {
      const restored = new File([blob], name, { type: version.mime_type });
      const text = await indexableText(restored);
      void supabase.functions.invoke("index-file", { body: { file_id: current.id, text } });
    }
  }

  return updated as VaultFile;
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
  const settings = await getProductSettings();
  const { error } = await supabase
    .from("vault_files")
    .update({
      status: settings.ai_enabled ? "uploaded" : "ready",
      deleted_at: null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", fileId);
  if (error) throw error;
}

export async function purgeFile(fileId: string) {
  const [{ data: versions, error: versionsError }, { data: current, error: currentError }] =
    await Promise.all([
      supabase.from("file_versions").select("storage_path").eq("file_id", fileId),
      supabase.from("vault_files").select("storage_path").eq("id", fileId).single(),
    ]);

  if (versionsError) throw versionsError;
  if (currentError) throw currentError;

  const paths = [
    ...new Set([
      current.storage_path,
      ...(versions ?? []).map((version) => version.storage_path),
    ]),
  ];

  if (paths.length > 0) {
    const { error: storageError } = await supabase.storage
      .from("cloudvault-files")
      .remove(paths);
    if (storageError) throw storageError;
  }

  const { error } = await supabase.from("vault_files").delete().eq("id", fileId);
  if (error) throw error;
}

export async function getDownloadUrl(file: VaultFile) {
  const settings = await getProductSettings();
  const { data, error } = await supabase.storage
    .from("cloudvault-files")
    .createSignedUrl(file.storage_path, settings.share_signed_url_seconds);
  if (error) throw error;
  return data.signedUrl;
}

export async function relatedFiles(fileId: string) {
  const settings = await getProductSettings();
  if (!settings.ai_enabled) return [];

  const { data, error } = await supabase.rpc("related_vault_files", {
    source_file_id: fileId,
    match_count: settings.related_files_limit,
  });
  if (error) throw error;
  return (data ?? []) as RelatedFile[];
}

export async function semanticSearch(query: string) {
  const settings = await getProductSettings();
  if (!settings.ai_enabled) throw new Error("AI search is disabled for this deployment.");

  const { data, error } = await supabase.functions.invoke("semantic-search", {
    body: { query, limit: settings.semantic_search_limit },
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
  const settings = await getProductSettings();
  if (!settings.sharing_enabled) return [];

  const { data, error } = await supabase
    .from("share_links")
    .select("id,file_id,expires_at,max_uses,use_count,revoked_at,created_at,vault_files(name)")
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []) as unknown as ShareLink[];
}

export async function createShareLink(
  fileId: string,
  options: { expiresHours?: number; maxUses?: number | null } = {},
) {
  const settings = await getProductSettings();
  if (!settings.sharing_enabled) throw new Error("Sharing is disabled for this deployment.");

  const expiresHours = Math.min(
    Math.max(options.expiresHours ?? settings.default_share_expiry_hours, 1),
    settings.max_share_expiry_hours,
  );
  const requestedUses = options.maxUses ?? settings.default_share_max_uses;
  const maxUses =
    requestedUses === null
      ? null
      : Math.min(Math.max(requestedUses, 1), settings.max_share_uses);

  const { data, error } = await supabase.functions.invoke("create-share-link", {
    body: { file_id: fileId, expires_hours: expiresHours, max_uses: maxUses },
  });
  if (error) throw error;
  return data as { id: string; token: string; expires_at: string; max_uses: number | null };
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
