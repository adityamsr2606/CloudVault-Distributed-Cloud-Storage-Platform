import type { ProductSettings } from "../config/product";

export type UploadProvider = "supabase" | "r2" | "b2";

export type UploadPlan = {
  provider: UploadProvider;
  mode: "direct" | "multipart";
  directCeilingBytes: number;
};

type UploadPolicySettings = Pick<
  ProductSettings,
  | "max_upload_bytes"
  | "supabase_direct_upload_max_bytes"
  | "large_upload_threshold_bytes"
  | "storage_provider"
  | "large_upload_provider"
>;

export function directUploadCeiling(settings: UploadPolicySettings) {
  return Math.min(
    settings.supabase_direct_upload_max_bytes,
    settings.large_upload_threshold_bytes,
  );
}

export function chooseUploadPlan(
  fileSize: number,
  settings: UploadPolicySettings,
): UploadPlan {
  if (!Number.isFinite(fileSize) || fileSize <= 0) {
    throw new Error("Empty files are not accepted.");
  }

  if (fileSize > settings.max_upload_bytes) {
    throw new Error("File exceeds this deployment upload policy.");
  }

  const directCeilingBytes = directUploadCeiling(settings);
  const requiresMultipart =
    fileSize > directCeilingBytes || settings.storage_provider !== "supabase";

  if (!requiresMultipart) {
    return {
      provider: "supabase",
      mode: "direct",
      directCeilingBytes,
    };
  }

  const provider = settings.large_upload_provider;
  if (provider !== "b2" && provider !== "r2") {
    throw new Error("No supported large-file provider is configured.");
  }

  return {
    provider,
    mode: "multipart",
    directCeilingBytes,
  };
}
