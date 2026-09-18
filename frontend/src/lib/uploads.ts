import { getProductSettings, type ProductSettings } from "../config/product";
import { supabase } from "./supabase";
import { type VaultFile, replaceVaultFile, uploadVaultFile } from "./cloudvault";

type ObjectProvider = "r2" | "b2";
type StorageProvider = "supabase" | ObjectProvider;
type MultipartState = "initiated" | "uploading" | "completed" | "aborted" | "failed";

export type UploadState =
  | "preparing"
  | "uploading"
  | "paused"
  | "completing"
  | "completed"
  | "cancelled"
  | "failed";

export type UploadProgress = {
  state: UploadState;
  provider: StorageProvider;
  loadedBytes: number;
  totalBytes: number;
  percent: number;
  uploadedParts: number;
  totalParts: number;
};

type PartRecord = {
  part_number: number;
  etag: string;
  size?: number;
};

type MultipartSession = {
  session_id: string;
  file_id: string;
  provider: ObjectProvider;
  part_size_bytes: number;
  total_parts: number;
};

type MultipartStatus = MultipartSession & {
  status: MultipartState;
  parts: PartRecord[];
  file?: VaultFile;
};

function legacyUploadKey(file: File) {
  return "cloudvault-upload:" + file.name + ":" + file.size + ":" + file.lastModified;
}

function safeJsonParse<T>(value: string | null): T | null {
  if (!value) return null;
  try {
    return JSON.parse(value) as T;
  } catch {
    return null;
  }
}

async function edgeFunctionErrorMessage(error: unknown) {
  if (error && typeof error === "object" && "context" in error) {
    const context = (error as { context?: unknown }).context;

    if (context instanceof Response) {
      const response = context.clone();

      try {
        const payload = (await response.json()) as { error?: unknown };
        if (typeof payload?.error === "string" && payload.error.trim()) {
          return payload.error.trim();
        }
      } catch {
        try {
          const text = (await context.clone().text()).trim();
          if (text) return text.slice(0, 500);
        } catch {
          // Fall through to the SDK error below.
        }
      }
    }
  }

  return error instanceof Error
    ? error.message
    : "The multipart upload request failed.";
}

async function invokeMultipart<T>(body: Record<string, unknown>) {
  const { data, error } = await supabase.functions.invoke("multipart-upload", { body });
  if (error) throw new Error(await edgeFunctionErrorMessage(error));

  const payload = data as { error?: string } & T;
  if (payload?.error) throw new Error(payload.error);
  return payload;
}

function isIndexableText(file: File) {
  const type = file.type.toLowerCase();
  const name = file.name.toLowerCase();
  return (
    type.startsWith("text/") ||
    type.includes("json") ||
    type.includes("csv") ||
    name.endsWith(".md") ||
    name.endsWith(".log")
  );
}

async function maybeIndex(file: File, fileId: string, settings: ProductSettings) {
  if (!settings.ai_enabled) return;
  if (!isIndexableText(file) || file.size > settings.max_indexable_text_bytes) return;

  const text = (await file.text()).slice(0, settings.max_indexable_text_chars);
  void supabase.functions.invoke("index-file", {
    body: { file_id: fileId, text },
  });
}

export class CloudUploadTask {
  readonly completion: Promise<VaultFile>;

  private settings: ProductSettings | null = null;
  private sessionId: string | null = null;
  private paused = false;
  private cancelled = false;
  private resumeResolver: (() => void) | null = null;
  private activeRequests = new Set<XMLHttpRequest>();
  private partProgress = new Map<number, number>();
  private completedParts = new Map<number, PartRecord>();
  private state: UploadState = "preparing";
  private provider: StorageProvider = "supabase";
  private totalParts = 1;

  constructor(
    private readonly file: File,
    private readonly folderId: string | null,
    private readonly onProgress: (progress: UploadProgress) => void,
    private readonly replaceFile: VaultFile | null = null,
  ) {
    this.completion = this.run();
  }

  pause() {
    if (this.state !== "uploading" || this.provider === "supabase") return;

    this.paused = true;
    this.state = "paused";

    for (const request of this.activeRequests) request.abort();
    this.activeRequests.clear();
    this.emitProgress();
  }

  resume() {
    if (!this.paused || this.cancelled) return;

    this.paused = false;
    this.state = "uploading";
    this.resumeResolver?.();
    this.resumeResolver = null;
    this.emitProgress();
  }

  async cancel() {
    if (this.cancelled || this.state === "completed") return;

    this.cancelled = true;
    this.paused = false;
    this.state = "cancelled";

    for (const request of this.activeRequests) request.abort();
    this.activeRequests.clear();

    this.resumeResolver?.();
    this.resumeResolver = null;

    if (this.sessionId) {
      try {
        await invokeMultipart({ action: "abort", session_id: this.sessionId });
      } catch {
        // Local cancellation still stops browser traffic if provider cleanup fails.
      }
    }

    this.clearStoredSession();
    this.emitProgress();
  }

  private storageKey() {
    const context = [
      this.replaceFile?.id ?? "new",
      this.folderId ?? "root",
      this.file.name,
      String(this.file.size),
      String(this.file.lastModified),
    ]
      .map((value) => encodeURIComponent(value))
      .join(":");

    return "cloudvault-upload:v2:" + context;
  }

  private readStoredSession() {
    const primaryKey = this.storageKey();
    const primary = safeJsonParse<{ session_id: string }>(
      localStorage.getItem(primaryKey),
    );

    if (primary?.session_id) return primary;

    const legacyKey = legacyUploadKey(this.file);
    const legacy = safeJsonParse<{ session_id: string }>(
      localStorage.getItem(legacyKey),
    );

    if (legacy?.session_id) {
      localStorage.setItem(primaryKey, JSON.stringify(legacy));
      localStorage.removeItem(legacyKey);
      return legacy;
    }

    return null;
  }

  private storeSession(sessionId: string) {
    localStorage.setItem(
      this.storageKey(),
      JSON.stringify({ session_id: sessionId }),
    );
  }

  private clearStoredSession() {
    localStorage.removeItem(this.storageKey());
    localStorage.removeItem(legacyUploadKey(this.file));
  }

  private providerEnabled(provider: string) {
    if (!this.settings) return false;
    if (provider === "b2") return this.settings.b2_enabled;
    if (provider === "r2") return this.settings.r2_enabled;
    return false;
  }

  private providerLabel(provider: string) {
    if (provider === "b2") return "Backblaze B2";
    if (provider === "r2") return "Cloudflare R2";
    return provider.toUpperCase();
  }

  private markRecoveredComplete(totalParts: number) {
    this.completedParts.clear();
    this.partProgress.clear();

    for (let partNumber = 1; partNumber <= totalParts; partNumber += 1) {
      this.completedParts.set(partNumber, {
        part_number: partNumber,
        etag: "recovered",
      });
    }
  }

  private async run() {
    this.settings = await getProductSettings();

    if (this.file.size <= 0) throw new Error("Empty files are not accepted.");

    if (this.file.size > this.settings.max_upload_bytes) {
      const maxMb = Math.round(this.settings.max_upload_bytes / 1024 / 1024);
      throw new Error("This deployment accepts files up to " + maxMb + " MB.");
    }

    const useLargeObjectProvider =
      this.file.size > this.settings.large_upload_threshold_bytes ||
      this.settings.storage_provider !== "supabase";

    if (!useLargeObjectProvider) {
      this.provider = "supabase";
      this.state = "uploading";
      this.emitProgress(0);

      const record = this.replaceFile
        ? await replaceVaultFile(this.replaceFile, this.file)
        : await uploadVaultFile(this.file, this.folderId);

      this.state = "completed";
      this.emitProgress(this.file.size);
      return record;
    }

    const preferredProvider = this.settings.large_upload_provider;
    this.provider =
      preferredProvider === "b2" || preferredProvider === "r2"
        ? preferredProvider
        : "supabase";

    return this.runMultipart(preferredProvider);
  }

  private async runMultipart(preferredProvider: string) {
    const stored = this.readStoredSession();
    let session: MultipartStatus | null = null;

    if (stored?.session_id) {
      try {
        session = await invokeMultipart<MultipartStatus>({
          action: "status",
          session_id: stored.session_id,
        });

        this.sessionId = session.session_id;
        this.totalParts = session.total_parts;
        this.provider = session.provider;

        if (session.status === "completed") {
          if (!session.file) {
            throw new Error("Recovered upload is missing its finalized file metadata.");
          }

          this.markRecoveredComplete(session.total_parts);
          this.clearStoredSession();

          if (session.file.status === "uploaded") {
            await maybeIndex(this.file, session.file.id, this.settings!);
          }

          this.state = "completed";
          this.emitProgress(this.file.size);
          return session.file;
        }

        if (session.status === "aborted" || session.status === "failed") {
          this.clearStoredSession();
          session = null;
          this.sessionId = null;
        }
      } catch {
        this.clearStoredSession();
        session = null;
        this.sessionId = null;
      }
    }

    if (!session) {
      if (
        (preferredProvider !== "b2" && preferredProvider !== "r2") ||
        !this.providerEnabled(preferredProvider)
      ) {
        const directMb = Math.round(
          this.settings!.supabase_direct_upload_max_bytes / 1024 / 1024,
        );

        throw new Error(
          "Large-file storage is configured for " +
            this.providerLabel(preferredProvider) +
            " but that provider is not connected yet. " +
            "The active Supabase provider currently supports uploads up to " +
            directMb +
            " MB.",
        );
      }

      const initiated = await invokeMultipart<MultipartSession>({
        action: "initiate",
        file_name: this.file.name,
        mime_type: this.file.type || "application/octet-stream",
        size_bytes: this.file.size,
        folder_id: this.folderId,
        replace_file_id: this.replaceFile?.id ?? null,
      });

      this.sessionId = initiated.session_id;
      this.totalParts = initiated.total_parts;
      this.provider = initiated.provider;
      this.storeSession(initiated.session_id);

      session = {
        ...initiated,
        status: "initiated",
        parts: [],
      };
    }

    this.sessionId = session.session_id;
    this.totalParts = session.total_parts;
    this.provider = session.provider;

    for (const part of session.parts ?? []) {
      this.completedParts.set(part.part_number, part);

      const start = (part.part_number - 1) * session.part_size_bytes;
      const size = Math.min(session.part_size_bytes, this.file.size - start);
      this.partProgress.set(part.part_number, Math.max(size, 0));
    }

    const missing = Array.from(
      { length: this.totalParts },
      (_, index) => index + 1,
    ).filter((partNumber) => !this.completedParts.has(partNumber));

    this.state = "uploading";
    this.emitProgress();

    let cursor = 0;
    const parallelism = Math.min(
      Math.max(this.settings?.multipart_parallelism ?? 3, 1),
      8,
    );

    const worker = async () => {
      while (true) {
        if (this.cancelled) throw new Error("Upload cancelled.");
        await this.waitUntilResumed();

        const index = cursor;
        cursor += 1;
        if (index >= missing.length) return;

        const partNumber = missing[index];
        await this.uploadPartWithRetry(partNumber, session!.part_size_bytes);
      }
    };

    await Promise.all(
      Array.from(
        { length: Math.min(parallelism, Math.max(missing.length, 1)) },
        () => worker(),
      ),
    );

    if (this.cancelled) throw new Error("Upload cancelled.");

    this.state = "completing";
    this.emitProgress();

    const completed = await invokeMultipart<{ file: VaultFile }>({
      action: "complete",
      session_id: this.sessionId,
      parts: [...this.completedParts.values()]
        .sort((a, b) => a.part_number - b.part_number)
        .map((part) => ({
          part_number: part.part_number,
          etag: part.etag,
        })),
    });

    this.clearStoredSession();
    await maybeIndex(this.file, completed.file.id, this.settings!);

    this.state = "completed";
    this.emitProgress(this.file.size);

    return completed.file;
  }

  private async uploadPartWithRetry(partNumber: number, partSize: number) {
    let attempts = 0;

    while (!this.cancelled) {
      await this.waitUntilResumed();

      try {
        const signed = await invokeMultipart<{
          urls: Array<{ part_number: number; url: string }>;
        }>({
          action: "sign_parts",
          session_id: this.sessionId,
          part_numbers: [partNumber],
        });

        const entry = signed.urls[0];
        if (!entry?.url) throw new Error("Could not create a part upload URL.");

        const start = (partNumber - 1) * partSize;
        const end = Math.min(start + partSize, this.file.size);
        const blob = this.file.slice(start, end);

        const etag = await this.putPart(entry.url, blob, partNumber);

        this.completedParts.set(partNumber, {
          part_number: partNumber,
          etag,
          size: blob.size,
        });
        this.partProgress.set(partNumber, blob.size);
        this.emitProgress();
        return;
      } catch (error) {
        if (this.cancelled) throw new Error("Upload cancelled.");

        if (this.paused) {
          this.partProgress.set(partNumber, 0);
          continue;
        }

        attempts += 1;
        this.partProgress.set(partNumber, 0);
        this.emitProgress();

        if (attempts >= 4) throw error;

        await new Promise((resolve) =>
          window.setTimeout(resolve, 400 * 2 ** attempts),
        );
      }
    }

    throw new Error("Upload cancelled.");
  }

  private putPart(url: string, blob: Blob, partNumber: number) {
    return new Promise<string>((resolve, reject) => {
      const request = new XMLHttpRequest();
      this.activeRequests.add(request);

      request.open("PUT", url);

      request.upload.onprogress = (event) => {
        if (event.lengthComputable) {
          this.partProgress.set(partNumber, event.loaded);
          this.emitProgress();
        }
      };

      request.onload = () => {
        this.activeRequests.delete(request);

        if (request.status < 200 || request.status >= 300) {
          reject(
            new Error(
              "Part " + partNumber + " failed with HTTP " + request.status + ".",
            ),
          );
          return;
        }

        const etag = request.getResponseHeader("ETag");
        if (!etag) {
          reject(
            new Error(
              "The object store did not expose the ETag header. Add ETag to the bucket CORS exposed headers.",
            ),
          );
          return;
        }

        resolve(etag);
      };

      request.onerror = () => {
        this.activeRequests.delete(request);
        reject(new Error("Network error while uploading part " + partNumber + "."));
      };

      request.onabort = () => {
        this.activeRequests.delete(request);
        reject(new DOMException("Upload part aborted.", "AbortError"));
      };

      request.send(blob);
    });
  }

  private async waitUntilResumed() {
    if (!this.paused) return;

    await new Promise<void>((resolve) => {
      this.resumeResolver = resolve;
    });
  }

  private emitProgress(forceLoaded?: number) {
    const loaded =
      forceLoaded ??
      [...this.partProgress.values()].reduce((sum, value) => sum + value, 0);

    const bounded = Math.min(Math.max(loaded, 0), this.file.size);

    this.onProgress({
      state: this.state,
      provider: this.provider,
      loadedBytes: bounded,
      totalBytes: this.file.size,
      percent: this.file.size > 0
        ? Math.round((bounded / this.file.size) * 100)
        : 0,
      uploadedParts: this.completedParts.size,
      totalParts: this.totalParts,
    });
  }
}

export function startVaultUpload(
  file: File,
  folderId: string | null,
  onProgress: (progress: UploadProgress) => void,
) {
  return new CloudUploadTask(file, folderId, onProgress);
}

export function startVaultReplacement(
  file: File,
  current: VaultFile,
  onProgress: (progress: UploadProgress) => void,
) {
  return new CloudUploadTask(file, current.folder_id, onProgress, current);
}
